import type { Prisma, PrismaClient } from "@prisma/client";
import { listCampaigns } from "../campaigns/campaignService.js";
import { CAMPAIGN_RECIPIENT_OPT_OUT_BLOCKED_EVENT } from "../campaigns/optOutRegistry.js";
import { canonicalizeBrazilWaId, normalizeWaIdDigits } from "../utils/waid.js";

const MAX_LIST_CAMPAIGNS = 500;
const MAX_LIST_OUTBOUND = 3000;
const MAX_LIST_EVENTS = 3000;
const MAX_DETAIL_ITEMS = 25;

export type CrmCampaignRelationshipStatus =
  | "PENDING"
  | "SENT"
  | "ACCEPTED"
  | "DELIVERED"
  | "READ"
  | "FAILED"
  | "BLOCKED"
  | "OPT_OUT"
  | "SKIPPED"
  | "IDENTITY_CONFLICT";

export type CrmCampaignRelationshipSummary = {
  campaignCount: number;
  latestCampaignId: string | null;
  latestCampaignName: string | null;
  latestCampaignAt: string | null;
  latestTemplate: string | null;
  latestRecipientStatus: CrmCampaignRelationshipStatus | null;
  latestResultReason: string | null;
  hasOptOutBlock: boolean;
  latestDeliveredAt: string | null;
};

export type CrmCampaignRelationshipHistoryItem = {
  campaignId: string;
  campaignName: string;
  campaignAt: string;
  templateName: string | null;
  recipientStatus: CrmCampaignRelationshipStatus;
  resultReason: string | null;
  deliveredAt: string | null;
  hasOptOutBlock: boolean;
  campaignHref: string;
};

export type CrmCampaignRelationshipDetail = {
  items: CrmCampaignRelationshipHistoryItem[];
  pagination: {
    limit: number;
    hasMore: boolean;
    total: number;
  };
};

export const EMPTY_CRM_CAMPAIGN_RELATIONSHIP_SUMMARY: CrmCampaignRelationshipSummary = {
  campaignCount: 0,
  latestCampaignId: null,
  latestCampaignName: null,
  latestCampaignAt: null,
  latestTemplate: null,
  latestRecipientStatus: null,
  latestResultReason: null,
  hasOptOutBlock: false,
  latestDeliveredAt: null,
};

type CampaignRow = Awaited<ReturnType<typeof listCampaigns>>[number];

type RelationshipInput = {
  leadId: string;
  identityKeys: string[];
};

type RelationshipEvidence = {
  campaignId: string;
  campaignName: string;
  campaignAt: Date;
  templateName: string | null;
  status: CrmCampaignRelationshipStatus;
  reason: string | null;
  deliveredAt: Date | null;
  hasOptOutBlock: boolean;
};

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));
}

function canonicalIdentityKey(value: string | null | undefined) {
  const digits = normalizeWaIdDigits(String(value ?? ""));
  if (!digits) return null;
  return canonicalizeBrazilWaId(digits) ?? digits;
}

function buildIdentityKeySet(values: string[]) {
  return new Set(unique(values.flatMap((value) => [value, canonicalIdentityKey(value)])));
}

function getRecord(value: Prisma.JsonValue | unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function extractCampaignIdFromRawPayload(rawPayload: Prisma.JsonValue | null | undefined) {
  const typed = getRecord(rawPayload);
  return typeof typed?.campaignId === "string" ? typed.campaignId : null;
}

function extractCampaignIdFromMessageId(messageId: string | null | undefined) {
  const value = typeof messageId === "string" ? messageId.trim() : "";
  if (!value.startsWith("campaign.")) return null;
  const suffix = value.slice("campaign.".length);
  const separatorIndex = suffix.lastIndexOf(".");
  if (separatorIndex <= 0) return null;
  return suffix.slice(0, separatorIndex) || null;
}

function resolveOutboundCampaignId(item: { messageId?: string | null; rawPayload?: Prisma.JsonValue | null }) {
  return extractCampaignIdFromRawPayload(item.rawPayload) ?? extractCampaignIdFromMessageId(item.messageId);
}

function extractMetaStatus(rawPayload: Prisma.JsonValue | null | undefined) {
  const payload = getRecord(rawPayload);
  const metaStatus = getRecord(payload?.metaStatus);
  const webSessionStatus = getRecord(payload?.webSessionStatus);
  const lastStatus =
    typeof metaStatus?.lastStatus === "string"
      ? metaStatus.lastStatus
      : typeof webSessionStatus?.lastStatus === "string"
        ? webSessionStatus.lastStatus
        : null;
  const lastStatusAt =
    typeof metaStatus?.lastStatusAt === "string"
      ? metaStatus.lastStatusAt
      : typeof webSessionStatus?.lastStatusAt === "string"
        ? webSessionStatus.lastStatusAt
        : null;
  const statusDetail = typeof metaStatus?.statusDetail === "string" ? metaStatus.statusDetail : null;
  return { lastStatus, lastStatusAt, statusDetail };
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function normalizeOutboundStatus(metaStatus: string | null, messageStatus: string): CrmCampaignRelationshipStatus {
  const normalized = String(metaStatus || messageStatus || "").trim().toLowerCase();
  switch (normalized) {
    case "read":
      return "READ";
    case "delivered":
      return "DELIVERED";
    case "accepted":
      return "ACCEPTED";
    case "sent":
      return "SENT";
    case "failed":
      return "FAILED";
    case "blocked":
      return "BLOCKED";
    case "skipped":
      return "SKIPPED";
    case "opt_out":
    case "opt-out":
      return "OPT_OUT";
    case "received":
    case "pending":
    default:
      return normalized ? "SENT" : "PENDING";
  }
}

function statusRank(status: CrmCampaignRelationshipStatus) {
  switch (status) {
    case "READ":
      return 8;
    case "DELIVERED":
      return 7;
    case "ACCEPTED":
      return 6;
    case "SENT":
      return 5;
    case "FAILED":
      return 4;
    case "OPT_OUT":
      return 3;
    case "BLOCKED":
      return 2;
    case "IDENTITY_CONFLICT":
      return 2;
    case "SKIPPED":
      return 1;
    case "PENDING":
    default:
      return 0;
  }
}

function isDeliveredStatus(status: CrmCampaignRelationshipStatus) {
  return status === "DELIVERED" || status === "READ";
}

function campaignHref(campaignId: string) {
  return `/app/campaigns?campaignId=${encodeURIComponent(campaignId)}`;
}

function upsertEvidence(
  target: Map<string, RelationshipEvidence>,
  campaign: CampaignRow,
  update: {
    status: CrmCampaignRelationshipStatus;
    reason?: string | null;
    templateName?: string | null;
    deliveredAt?: Date | null;
    evidenceAt?: Date | null;
    hasOptOutBlock?: boolean;
  }
) {
  const existing = target.get(campaign.id);
  const campaignAt = update.evidenceAt ?? campaign.updatedAt ?? campaign.createdAt;
  if (!existing) {
    target.set(campaign.id, {
      campaignId: campaign.id,
      campaignName: campaign.name,
      campaignAt,
      templateName: update.templateName ?? campaign.templateName ?? null,
      status: update.status,
      reason: update.reason ?? null,
      deliveredAt: update.deliveredAt ?? null,
      hasOptOutBlock: update.hasOptOutBlock === true,
    });
    return;
  }
  const nextRank = statusRank(update.status);
  const currentRank = statusRank(existing.status);
  if (nextRank > currentRank || (nextRank === currentRank && campaignAt > existing.campaignAt)) {
    existing.status = update.status;
    existing.campaignAt = campaignAt;
    existing.templateName = update.templateName ?? existing.templateName;
    existing.reason = update.reason ?? existing.reason;
  }
  if (update.deliveredAt && (!existing.deliveredAt || update.deliveredAt > existing.deliveredAt)) {
    existing.deliveredAt = update.deliveredAt;
  }
  existing.hasOptOutBlock ||= update.hasOptOutBlock === true;
  if (update.hasOptOutBlock && !existing.reason) existing.reason = "opt_out";
}

function summarizeEvidence(values: RelationshipEvidence[]): CrmCampaignRelationshipSummary {
  if (values.length === 0) return { ...EMPTY_CRM_CAMPAIGN_RELATIONSHIP_SUMMARY };
  const sorted = [...values].sort((left, right) => right.campaignAt.getTime() - left.campaignAt.getTime());
  const latest = sorted[0];
  return {
    campaignCount: values.length,
    latestCampaignId: latest.campaignId,
    latestCampaignName: latest.campaignName,
    latestCampaignAt: latest.campaignAt.toISOString(),
    latestTemplate: latest.templateName,
    latestRecipientStatus: latest.status,
    latestResultReason: latest.reason,
    hasOptOutBlock: values.some((item) => item.hasOptOutBlock),
    latestDeliveredAt: latest.deliveredAt?.toISOString() ?? null,
  };
}

function serializeHistoryItem(item: RelationshipEvidence): CrmCampaignRelationshipHistoryItem {
  return {
    campaignId: item.campaignId,
    campaignName: item.campaignName,
    campaignAt: item.campaignAt.toISOString(),
    templateName: item.templateName,
    recipientStatus: item.status,
    resultReason: item.reason,
    deliveredAt: item.deliveredAt?.toISOString() ?? null,
    hasOptOutBlock: item.hasOptOutBlock,
    campaignHref: campaignHref(item.campaignId),
  };
}

async function collectCampaignRelationshipEvidence(
  prisma: PrismaClient,
  params: {
    clientId: string;
    contacts: RelationshipInput[];
    campaignLimit?: number;
  }
) {
  const contacts = params.contacts.map((contact) => ({
    leadId: contact.leadId,
    identityKeys: Array.from(buildIdentityKeySet(contact.identityKeys)),
  }));
  if (contacts.length === 0) return new Map<string, RelationshipEvidence[]>();

  const allIdentityKeys = unique(contacts.flatMap((contact) => contact.identityKeys));
  const campaigns = await listCampaigns({
    clientId: params.clientId,
    limit: params.campaignLimit ?? MAX_LIST_CAMPAIGNS,
  });
  const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
  if (campaigns.length === 0) return new Map(contacts.map((contact) => [contact.leadId, []]));
  const campaignIds = campaigns.map((campaign) => campaign.id);
  const oldestCampaignAt = campaigns.reduce<Date | null>(
    (oldest, campaign) => (!oldest || campaign.createdAt < oldest ? campaign.createdAt : oldest),
    null
  );

  const [outboundMessages, optOutBlockEvents] = await Promise.all([
    allIdentityKeys.length > 0 && oldestCampaignAt
      ? prisma.outboundMessage.findMany({
          where: {
            clientId: params.clientId,
            type: "TEMPLATE",
            createdAt: { gte: oldestCampaignAt },
            OR: [{ waId: { in: allIdentityKeys } }, { waIdCanonical: { in: allIdentityKeys } }],
          },
          orderBy: { createdAt: "desc" },
          take: MAX_LIST_OUTBOUND,
          select: {
            waId: true,
            waIdCanonical: true,
            messageId: true,
            templateName: true,
            status: true,
            errorBody: true,
            rawPayload: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
    allIdentityKeys.length > 0
      ? prisma.event.findMany({
          where: {
            clientId: params.clientId,
            eventName: CAMPAIGN_RECIPIENT_OPT_OUT_BLOCKED_EVENT,
            messageId: { in: campaignIds },
            OR: [{ waId: { in: allIdentityKeys } }, { waIdCanonical: { in: allIdentityKeys } }],
          },
          orderBy: { createdAt: "desc" },
          take: MAX_LIST_EVENTS,
          select: { waId: true, waIdCanonical: true, messageId: true, payloadJson: true, createdAt: true },
        })
      : Promise.resolve([]),
  ]);

  const evidenceByLeadId = new Map<string, Map<string, RelationshipEvidence>>(
    contacts.map((contact) => [contact.leadId, new Map()])
  );
  const leadIdsByIdentity = new Map<string, string[]>();
  for (const contact of contacts) {
    for (const key of contact.identityKeys) {
      const current = leadIdsByIdentity.get(key) ?? [];
      current.push(contact.leadId);
      leadIdsByIdentity.set(key, current);
    }
  }
  const applyToIdentity = (
    identity: string | null | undefined,
    campaign: CampaignRow | null,
    update: Parameters<typeof upsertEvidence>[2]
  ) => {
    if (!campaign) return;
    const key = canonicalIdentityKey(identity) ?? String(identity ?? "").trim();
    if (!key) return;
    for (const leadId of leadIdsByIdentity.get(key) ?? []) {
      const bucket = evidenceByLeadId.get(leadId);
      if (bucket) upsertEvidence(bucket, campaign, update);
    }
  };

  for (const outbound of outboundMessages) {
    const campaignId = resolveOutboundCampaignId(outbound);
    const campaign = campaignId ? campaignById.get(campaignId) ?? null : null;
    if (!campaign) continue;
    const meta = extractMetaStatus(outbound.rawPayload);
    const status = normalizeOutboundStatus(meta.lastStatus, outbound.status);
    applyToIdentity(outbound.waIdCanonical ?? outbound.waId, campaign, {
      status,
      reason: outbound.errorBody ?? meta.statusDetail,
      templateName: outbound.templateName ?? campaign.templateName,
      deliveredAt: isDeliveredStatus(status) ? parseDate(meta.lastStatusAt) ?? outbound.createdAt : null,
      evidenceAt: outbound.createdAt,
    });
  }

  for (const event of optOutBlockEvents) {
    const campaign = event.messageId ? campaignById.get(event.messageId) ?? null : null;
    if (!campaign) continue;
    if (campaign.status === "draft" || campaign.status === "scheduled" || campaign.status === "cancelled") continue;
    applyToIdentity(event.waIdCanonical ?? event.waId, campaign, {
      status: "OPT_OUT",
      reason: "opt_out",
      templateName: campaign.templateName,
      evidenceAt: event.createdAt,
      hasOptOutBlock: true,
    });
  }

  return new Map(
    Array.from(evidenceByLeadId.entries()).map(([leadId, bucket]) => [
      leadId,
      Array.from(bucket.values()).sort((left, right) => right.campaignAt.getTime() - left.campaignAt.getTime()),
    ])
  );
}

export async function buildCrmCampaignRelationshipSummaryByLeadId(
  prisma: PrismaClient,
  params: {
    clientId: string;
    contacts: RelationshipInput[];
  }
) {
  const evidence = await collectCampaignRelationshipEvidence(prisma, params);
  return new Map(
    params.contacts.map((contact) => [
      contact.leadId,
      summarizeEvidence(evidence.get(contact.leadId) ?? []),
    ])
  );
}

export async function buildCrmCampaignRelationshipDetail(
  prisma: PrismaClient,
  params: {
    clientId: string;
    leadId: string;
    identityKeys: string[];
    limit?: number;
  }
): Promise<CrmCampaignRelationshipDetail> {
  const limit = Math.max(1, Math.min(params.limit ?? MAX_DETAIL_ITEMS, 50));
  const evidence = await collectCampaignRelationshipEvidence(prisma, {
    clientId: params.clientId,
    contacts: [{ leadId: params.leadId, identityKeys: params.identityKeys }],
    campaignLimit: MAX_LIST_CAMPAIGNS,
  });
  const items = evidence.get(params.leadId) ?? [];
  return {
    items: items.slice(0, limit).map(serializeHistoryItem),
    pagination: {
      limit,
      hasMore: items.length > limit,
      total: items.length,
    },
  };
}
