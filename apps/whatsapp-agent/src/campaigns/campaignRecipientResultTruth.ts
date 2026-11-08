import type { Prisma } from "@prisma/client";
import { buildCrmWhatsappIdentityCandidates } from "../crm/crmWhatsappIdentity.js";
type CampaignDraftSeed = { recipients: string[]; templateName: string };

export type CampaignMetaStatus = {
  waId: string;
  leadId?: string | null;
  contactName?: string | null;
  phoneDisplay?: string | null;
  crmStatus?: string | null;
  crmStatusLabel?: string | null;
  templateName: string | null;
  status: "sent" | "delivered" | "read" | "failed" | "blocked" | "skipped" | "pending" | "unknown" | "opt_out" | "not_submitted";
  sentAt: string | null;
  deliveredAt: string | null;
  billable: boolean;
  nonBillingReason: string | null;
  pricingCategory: string | null;
  pricingBillable: boolean | null;
  pricingModel: string | null;
  conversationId: string | null;
  error: string | null;
};

export type CampaignMetaSummary = {
  totalSent: number;
  totalDelivered: number;
  totalRead: number;
  totalFailed: number;
  totalBlocked: number;
  totalOptOut: number;
  totalSkipped: number;
  totalPending: number;
  totalUncertain: number;
  totalNotSubmitted?: number;
};

export function extractMetaStatus(rawPayload: unknown) {
  const typed =
    rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
      ? (rawPayload as Record<string, unknown>)
      : null;
  const metaStatus =
    typed?.metaStatus && typeof typed.metaStatus === "object" && !Array.isArray(typed.metaStatus)
      ? (typed.metaStatus as Record<string, unknown>)
      : null;
  const webSessionStatus =
    typed?.webSessionStatus && typeof typed.webSessionStatus === "object" && !Array.isArray(typed.webSessionStatus)
      ? (typed.webSessionStatus as Record<string, unknown>)
      : null;
  return {
    lastStatus:
      typeof metaStatus?.lastStatus === "string"
        ? metaStatus.lastStatus
        : typeof webSessionStatus?.lastStatus === "string"
          ? webSessionStatus.lastStatus
          : null,
    pricingCategory:
      typeof metaStatus?.pricingCategory === "string" ? metaStatus.pricingCategory : null,
    pricingBillable:
      typeof metaStatus?.pricingBillable === "boolean" ? metaStatus.pricingBillable : null,
    pricingModel: typeof metaStatus?.pricingModel === "string" ? metaStatus.pricingModel : null,
    lastStatusAt:
      typeof metaStatus?.lastStatusAt === "string"
        ? metaStatus.lastStatusAt
        : typeof webSessionStatus?.lastStatusAt === "string"
          ? webSessionStatus.lastStatusAt
          : null,
    conversationId:
      typeof metaStatus?.conversationId === "string" ? metaStatus.conversationId : null,
    statusDetail: typeof metaStatus?.statusDetail === "string" ? metaStatus.statusDetail : null,
    errorData:
      metaStatus?.errorData && typeof metaStatus.errorData === "object" ? metaStatus.errorData : null,
    errors: Array.isArray(metaStatus?.errors) ? metaStatus.errors : null,
  };
}

export function normalizeCampaignMessageStatus(
  lastStatus: string | null,
  fallbackStatus: string
): CampaignMetaStatus["status"] {
  const value = (lastStatus || fallbackStatus || "").trim().toLowerCase();
  switch (value) {
    case "read":
      return "read";
    case "delivered":
      return "delivered";
    case "failed":
      return "failed";
    case "sent":
    default:
      return fallbackStatus === "FAILED" ? "failed" : "sent";
  }
}

export function stringifyCampaignError(value: unknown) {
  if (!value) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function isUtilityPricingCategory(value: string | null) {
  return (value ?? "").trim().toLowerCase() === "utility";
}

export function isDeliveredForCampaignBilling(status: CampaignMetaStatus["status"]) {
  return status === "delivered" || status === "read";
}

export function resolveCampaignBillingStatus(item: {
  status: CampaignMetaStatus["status"];
  pricingCategory: string | null;
}) {
  if (!isDeliveredForCampaignBilling(item.status)) {
    return {
      billable: false,
      nonBillingReason: item.status === "failed" ? "failed" : "not_delivered",
    };
  }
  if (!isUtilityPricingCategory(item.pricingCategory)) {
    return {
      billable: false,
      nonBillingReason: "not_utility_category",
    };
  }
  return {
    billable: true,
    nonBillingReason: null,
  };
}

export function buildCampaignMetaStatusItem(item: {
  waId: string;
  messageId?: string | null;
  templateName: string | null;
  status: string;
  errorBody: string | null;
  rawPayload: Prisma.JsonValue | null;
  createdAt?: Date | string | null;
}): CampaignMetaStatus {
  const metaStatus = extractMetaStatus(item.rawPayload);
  const status = normalizeCampaignMessageStatus(metaStatus.lastStatus, item.status);
  const billing = resolveCampaignBillingStatus({
    status,
    pricingCategory: metaStatus.pricingCategory,
  });
  const sentAt =
    item.createdAt instanceof Date
      ? item.createdAt.toISOString()
      : typeof item.createdAt === "string"
        ? item.createdAt
        : null;
  return {
    waId: item.waId,
    templateName: item.templateName,
    status,
    sentAt,
    deliveredAt: isDeliveredForCampaignBilling(status) ? metaStatus.lastStatusAt : null,
    billable: billing.billable,
    nonBillingReason: billing.nonBillingReason,
    pricingCategory: metaStatus.pricingCategory,
    pricingBillable: metaStatus.pricingBillable,
    pricingModel: metaStatus.pricingModel,
    conversationId: metaStatus.conversationId,
    error:
      item.errorBody ||
      metaStatus.statusDetail ||
      stringifyCampaignError(metaStatus.errorData) ||
      stringifyCampaignError(metaStatus.errors),
  };
}

export function buildCampaignSeedFallbackStatusItems(
  campaign: {
    sentCount: number;
    blockedCount: number;
    status: string;
    templateName: string;
    cancellationConfirmed?: boolean;
  },
  seed: CampaignDraftSeed
): CampaignMetaStatus[] {
  const sentLimit = Math.max(campaign.sentCount || 0, 0);
  const blockedLimit = sentLimit + Math.max(campaign.blockedCount || 0, 0);
  return seed.recipients.map((waId, index) => {
    const wasSent = index < sentLimit;
    const wasBlockedOrFailed = !wasSent && index < blockedLimit;
    const wasNeverSubmittedAfterTerminalFailure =
      !wasSent && !wasBlockedOrFailed && campaign.status === "failed";
    return {
      waId,
      templateName: seed.templateName || campaign.templateName,
      status: wasSent
        ? "sent"
        : wasNeverSubmittedAfterTerminalFailure
          ? "not_submitted"
          : !wasBlockedOrFailed && campaign.status === "cancelled"
            ? (campaign.cancellationConfirmed ? "not_submitted" : "pending")
            : !wasBlockedOrFailed && ["sending", "scheduled"].includes(campaign.status)
              ? "pending"
              : "failed",
      sentAt: null,
      deliveredAt: null,
      billable: false,
      nonBillingReason: wasSent
        ? "status_unconfirmed"
        : wasNeverSubmittedAfterTerminalFailure
          ? "not_submitted"
          : wasBlockedOrFailed
          ? "failed_or_blocked"
          : campaign.status === "cancelled" ? (campaign.cancellationConfirmed ? "cancelled_before_submission" : "cancelled_result_requires_review") : ["sending", "scheduled"].includes(campaign.status) ? "awaiting_processing" : "missing_individual_history",
      pricingCategory: null,
      pricingBillable: null,
      pricingModel: null,
      conversationId: null,
      error: wasSent
        ? "Status Meta detalhado indisponivel; exibido a partir do historico da campanha."
        : wasNeverSubmittedAfterTerminalFailure
          ? "Campanha encerrada antes desta posição; nenhuma tentativa individual foi registrada."
          : wasBlockedOrFailed
          ? "Envio bloqueado ou falhou; status Meta detalhado indisponivel."
          : campaign.status === "cancelled" ? (campaign.cancellationConfirmed ? "Envios restantes encerrados sem submissão individual." : "Execução cancelada; resultado individual ainda exige revisão.") : ["sending", "scheduled"].includes(campaign.status) ? "Destinatário aguardando processamento; nenhuma submissão individual comprovada." : "Envio individual nao encontrado no historico preservado.",
    };
  });
}

export function summarizeCampaignMetaStatuses(items: CampaignMetaStatus[]): CampaignMetaSummary {
  return items.reduce<CampaignMetaSummary>(
    (acc, item) => {
      switch (item.status) {
        case "read":
          acc.totalRead += 1;
          break;
        case "delivered":
          acc.totalDelivered += 1;
          break;
        case "opt_out":
          acc.totalOptOut += 1;
          break;
        case "blocked":
          acc.totalBlocked += 1;
          break;
        case "skipped":
          acc.totalSkipped += 1;
          break;
        case "failed":
          acc.totalFailed += 1;
          break;
        case "not_submitted":
          acc.totalNotSubmitted = (acc.totalNotSubmitted ?? 0) + 1;
          break;
        case "pending":
          acc.totalPending += 1;
          break;
        case "unknown":
          acc.totalUncertain += 1;
          break;
        case "sent":
        default:
          acc.totalSent += 1;
          break;
      }
      return acc;
    },
    {
      totalSent: 0,
      totalDelivered: 0,
      totalRead: 0,
      totalFailed: 0,
      totalBlocked: 0,
      totalOptOut: 0,
      totalSkipped: 0,
      totalPending: 0,
      totalUncertain: 0,
      totalNotSubmitted: 0,
    }
  );
}

export function campaignRecipientIdentityCandidates(value: string) {
  return new Set(buildCrmWhatsappIdentityCandidates([value]));
}

export function campaignRecipientIdentitiesMatch(left: Set<string>, right: Set<string>) {
  for (const candidate of left) {
    if (right.has(candidate)) return true;
  }
  return false;
}

export function campaignMetaStatusRank(status: CampaignMetaStatus["status"]) {
  switch (status) {
    case "read":
      return 8;
    case "delivered":
      return 7;
    case "opt_out":
      return 6;
    case "blocked":
      return 5;
    case "failed":
      return 5;
    case "unknown":
      return 4;
    case "skipped":
      return 3;
    case "sent":
      return 2;
    case "pending":
    default:
      return 1;
  }
}

export function campaignMetaStatusTime(item: CampaignMetaStatus) {
  const value = item.deliveredAt ?? item.sentAt;
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function pickCampaignRecipientStatus(items: CampaignMetaStatus[]) {
  return items.reduce((selected, item) => {
    const rankDifference = campaignMetaStatusRank(item.status) - campaignMetaStatusRank(selected.status);
    if (rankDifference > 0) return item;
    if (rankDifference === 0 && campaignMetaStatusTime(item) > campaignMetaStatusTime(selected)) return item;
    return selected;
  });
}

export function buildCampaignRecipientResultStatuses(params: {
  campaign: { sentCount: number; blockedCount: number; status: string; templateName: string; cancellationConfirmed?: boolean };
  seed: CampaignDraftSeed;
  resultItems: CampaignMetaStatus[];
}) {
  const indexedResults = params.resultItems.map((item, index) => ({
    index,
    item,
    candidates: campaignRecipientIdentityCandidates(item.waId),
  }));

  const visibleItems: CampaignMetaStatus[] = [];
  const consumedResultIndexes = new Set<number>();
  const consumedSeedIdentities: Set<string>[] = [];
  params.seed.recipients.forEach((waId, index) => {
    const seedCandidates = campaignRecipientIdentityCandidates(waId);
    if (
      consumedSeedIdentities.some((candidates) =>
        campaignRecipientIdentitiesMatch(candidates, seedCandidates)
      )
    ) {
      return;
    }
    consumedSeedIdentities.push(seedCandidates);
    const matchingResults = indexedResults.filter(
      (result) =>
        !consumedResultIndexes.has(result.index) &&
        campaignRecipientIdentitiesMatch(seedCandidates, result.candidates)
    );
    if (matchingResults.length) {
      visibleItems.push(pickCampaignRecipientStatus(matchingResults.map((result) => result.item)));
      matchingResults.forEach((result) => consumedResultIndexes.add(result.index));
      return;
    }
    const fallbackSeed = { ...params.seed, recipients: [waId] };
    const sentLimit = Math.max(params.campaign.sentCount || 0, 0);
    const blockedLimit = sentLimit + Math.max(params.campaign.blockedCount || 0, 0);
    const sentCount = index < sentLimit ? 1 : 0;
    const blockedCount = index >= sentLimit && index < blockedLimit ? 1 : 0;
    visibleItems.push(
      ...buildCampaignSeedFallbackStatusItems(
        { ...params.campaign, sentCount, blockedCount },
        fallbackSeed
      )
    );
  });

  indexedResults.forEach((result) => {
    if (consumedResultIndexes.has(result.index)) return;
    const matchingResults = indexedResults.filter(
      (candidate) =>
        !consumedResultIndexes.has(candidate.index) &&
        campaignRecipientIdentitiesMatch(result.candidates, candidate.candidates)
    );
    visibleItems.push(pickCampaignRecipientStatus(matchingResults.map((candidate) => candidate.item)));
    matchingResults.forEach((candidate) => consumedResultIndexes.add(candidate.index));
  });
  return visibleItems;
}
