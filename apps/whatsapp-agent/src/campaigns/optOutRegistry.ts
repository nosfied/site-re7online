import crypto from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { persistEvent } from "../db/persist.js";
import { canonicalizeBrazilWaId, normalizeWaIdDigits } from "../utils/waid.js";

export const CONTACT_OPT_OUT_RECORDED_EVENT = "contact.opt_out.recorded";
export const CONTACT_OPT_OUT_REVOKED_EVENT = "contact.opt_out.revoked";
export const CAMPAIGN_RECIPIENT_OPT_OUT_BLOCKED_EVENT = "campaign.recipient.opt_out_blocked";

export type CampaignOptOutBlockedRecipient = {
  waId: string;
  waIdCanonical: string;
  recordedAt: Date;
};

type OptOutEvent = {
  waId: string | null;
  waIdCanonical: string | null;
  eventName: string;
  createdAt: Date;
};

export function normalizeOptOutWaId(input: unknown) {
  const waId = normalizeWaIdDigits(String(input ?? "").trim());
  const waIdCanonical = waId ? canonicalizeBrazilWaId(waId) : "";
  if (!waId || !waIdCanonical) return null;
  return { waId, waIdCanonical };
}

function resolveActiveOptOutEvents(events: OptOutEvent[]) {
  const latestByCanonical = new Map<string, OptOutEvent>();
  for (const event of events) {
    const canonical = event.waIdCanonical ?? (event.waId ? canonicalizeBrazilWaId(event.waId) : "");
    if (!canonical) continue;
    const current = latestByCanonical.get(canonical);
    if (!current || event.createdAt >= current.createdAt) {
      latestByCanonical.set(canonical, event);
    }
  }
  const active = new Map<string, OptOutEvent>();
  for (const [canonical, event] of latestByCanonical.entries()) {
    if (event.eventName === CONTACT_OPT_OUT_RECORDED_EVENT) {
      active.set(canonical, event);
    }
  }
  return active;
}

export async function getActiveOptOutsForRecipients(
  prisma: PrismaClient,
  params: {
    clientId: string;
    waIds: string[];
  }
) {
  const canonicalRecipients = Array.from(
    new Set(
      params.waIds
        .map((waId) => normalizeOptOutWaId(waId)?.waIdCanonical)
        .filter((value): value is string => Boolean(value))
    )
  );
  if (canonicalRecipients.length === 0) return new Map<string, OptOutEvent>();

  const events = await prisma.event.findMany({
    where: {
      clientId: params.clientId,
      eventName: {
        in: [CONTACT_OPT_OUT_RECORDED_EVENT, CONTACT_OPT_OUT_REVOKED_EVENT],
      },
      waIdCanonical: {
        in: canonicalRecipients,
      },
    },
    orderBy: { createdAt: "asc" },
    select: {
      waId: true,
      waIdCanonical: true,
      eventName: true,
      createdAt: true,
    },
  });

  return resolveActiveOptOutEvents(events);
}

export async function filterOptedOutCampaignRecipients(
  prisma: PrismaClient,
  params: {
    clientId: string;
    waIds: string[];
  }
) {
  const activeOptOuts = await getActiveOptOutsForRecipients(prisma, params);
  const allowed: string[] = [];
  const blocked: CampaignOptOutBlockedRecipient[] = [];

  for (const waId of params.waIds) {
    const normalized = normalizeOptOutWaId(waId);
    if (!normalized) continue;
    const active = activeOptOuts.get(normalized.waIdCanonical);
    if (active) {
      blocked.push({
        waId: normalized.waId,
        waIdCanonical: normalized.waIdCanonical,
        recordedAt: active.createdAt,
      });
      continue;
    }
    allowed.push(normalized.waId);
  }

  return { allowed, blocked };
}

export async function recordContactOptOut(params: {
  clientId: string;
  waId: string;
  channel?: string | null;
  source?: string | null;
  reason?: string | null;
  requestedAt?: Date;
  userId?: string | null;
  campaignId?: string | null;
  note?: string | null;
  requestId?: string | null;
}) {
  const normalized = normalizeOptOutWaId(params.waId);
  if (!normalized) return null;
  const requestedAt = params.requestedAt ?? new Date();
  const requestId = params.requestId ?? `contact-opt-out:${normalized.waIdCanonical}:${crypto.randomUUID()}`;
  await persistEvent({
    clientId: params.clientId,
    waId: normalized.waId,
    waIdCanonical: normalized.waIdCanonical,
    requestId,
    eventName: CONTACT_OPT_OUT_RECORDED_EVENT,
    payloadJson: {
      channel: params.channel || "whatsapp",
      source: params.source || "manual",
      reason: params.reason || null,
      requestedAt: requestedAt.toISOString(),
      userId: params.userId || null,
      campaignId: params.campaignId || null,
      note: params.note || null,
    },
  });
  return normalized;
}

export async function revokeContactOptOut(params: {
  clientId: string;
  waId: string;
  channel?: string | null;
  source?: string | null;
  reason?: string | null;
  revokedAt?: Date;
  userId?: string | null;
  note?: string | null;
  requestId?: string | null;
}) {
  const normalized = normalizeOptOutWaId(params.waId);
  if (!normalized) return null;
  const revokedAt = params.revokedAt ?? new Date();
  const requestId = params.requestId ?? `contact-opt-out-revoke:${normalized.waIdCanonical}:${crypto.randomUUID()}`;
  await persistEvent({
    clientId: params.clientId,
    waId: normalized.waId,
    waIdCanonical: normalized.waIdCanonical,
    requestId,
    eventName: CONTACT_OPT_OUT_REVOKED_EVENT,
    payloadJson: {
      channel: params.channel || "whatsapp",
      source: params.source || "manual",
      reason: params.reason || null,
      revokedAt: revokedAt.toISOString(),
      userId: params.userId || null,
      note: params.note || null,
    },
  });
  return normalized;
}

export async function recordCampaignOptOutBlocks(params: {
  clientId: string;
  campaignId: string;
  templateName: string;
  blocked: CampaignOptOutBlockedRecipient[];
}) {
  for (const item of params.blocked) {
    await persistEvent({
      clientId: params.clientId,
      waId: item.waId,
      waIdCanonical: item.waIdCanonical,
      messageId: params.campaignId,
      requestId: `campaign-opt-out:${params.campaignId}:${item.waIdCanonical}`,
      eventName: CAMPAIGN_RECIPIENT_OPT_OUT_BLOCKED_EVENT,
      payloadJson: {
        campaignId: params.campaignId,
        templateName: params.templateName,
        waId: item.waId,
        waIdCanonical: item.waIdCanonical,
        optOutRecordedAt: item.recordedAt.toISOString(),
      },
    });
  }
}
