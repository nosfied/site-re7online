import crypto from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { persistEvent } from "../db/persist.js";
import { buildCrmWhatsappIdentityCandidates } from "../crm/crmWhatsappIdentity.js";
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

function buildOptOutIdentityGroup(values: Array<string | null | undefined>) {
  const candidates = Array.from(
    new Set(
      buildCrmWhatsappIdentityCandidates(values)
        .map((value) => normalizeOptOutWaId(value)?.waIdCanonical ?? normalizeWaIdDigits(value))
        .filter(Boolean)
    )
  );
  return {
    candidates,
    key: candidates.slice().sort().join("|"),
  };
}

function resolveActiveOptOutEventsByGroup(
  events: OptOutEvent[],
  groups: Map<string, string[]>
) {
  const groupByCandidate = new Map<string, string>();
  for (const [groupKey, candidates] of groups.entries()) {
    for (const candidate of candidates) groupByCandidate.set(candidate, groupKey);
  }
  const latestByGroup = new Map<string, OptOutEvent>();
  for (const event of events) {
    const eventCandidates = buildOptOutIdentityGroup([event.waIdCanonical, event.waId]).candidates;
    const groupKeys = Array.from(
      new Set(eventCandidates.map((candidate) => groupByCandidate.get(candidate)).filter(Boolean))
    ) as string[];
    for (const groupKey of groupKeys) {
      const current = latestByGroup.get(groupKey);
      if (!current || event.createdAt >= current.createdAt) {
        latestByGroup.set(groupKey, event);
      }
    }
  }
  const active = new Map<string, OptOutEvent>();
  for (const [groupKey, event] of latestByGroup.entries()) {
    if (event.eventName !== CONTACT_OPT_OUT_RECORDED_EVENT) continue;
    for (const candidate of groups.get(groupKey) ?? []) {
      active.set(candidate, event);
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
  const groups = new Map<string, string[]>();
  for (const waId of params.waIds) {
    const group = buildOptOutIdentityGroup([waId]);
    if (group.candidates.length > 0) groups.set(group.key, group.candidates);
  }
  const lookupCandidates = Array.from(new Set(Array.from(groups.values()).flat()));
  if (lookupCandidates.length === 0) return new Map<string, OptOutEvent>();

  const events = await prisma.event.findMany({
    where: {
      clientId: params.clientId,
      eventName: {
        in: [CONTACT_OPT_OUT_RECORDED_EVENT, CONTACT_OPT_OUT_REVOKED_EVENT],
      },
      OR: [
        { waIdCanonical: { in: lookupCandidates } },
        { waId: { in: lookupCandidates } },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: {
      waId: true,
      waIdCanonical: true,
      eventName: true,
      createdAt: true,
    },
  });

  return resolveActiveOptOutEventsByGroup(events, groups);
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
