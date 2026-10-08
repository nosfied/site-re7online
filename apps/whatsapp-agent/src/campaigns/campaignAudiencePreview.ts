import { crmOperationalBlockedReason } from "./campaignEligibility.js";
import type { PrismaClient } from "@prisma/client";
import {
  buildCrmContactsPayload,
  type CrmContactListItem,
  type CrmContactsQuery,
} from "../crm/crmContactsReadModel.js";

const DEFAULT_PREVIEW_LIMIT = 50;
const MAX_PREVIEW_LIMIT = 200;
const MAX_ANALYSIS_ITEMS = 5000;

export type CampaignAudienceBlockedReason =
  | "anonymized_contact"
  | "operationally_excluded_contact"
  | "active_send_blocked"
  | "missing_whatsapp_identity"
  | "non_whatsapp_channel"
  | "invalid_whatsapp_identity"
  | "missing_contact"
  | "unsupported_channel"
  | "unknown";

type CrmStatusConfig = {
  id: string;
  label: string;
  isActive?: boolean;
};

export type CampaignAudiencePreviewQuery = CrmContactsQuery & {
  onlyWhatsappEligible?: string | boolean | null;
  excludeOptOut?: string | boolean | null;
  crmStatus?: string | null;
  city?: string | null;
  importedSource?: string | null;
  origin?: string | null;
};

export type CampaignAudiencePreviewItem = Pick<
  CrmContactListItem,
  | "leadId"
  | "contactId"
  | "displayName"
  | "companyName"
  | "city"
  | "crmStatus"
  | "crmStatusLabel"
  | "channel"
  | "phoneDisplay"
  | "identifierDisplay"
  | "activeOptOut"
  | "isAnonymized"
  | "hasValidWhatsappIdentity"
  | "lastConversationIdentity"
  | "lastProtocol"
  | "importedSource"
  | "updatedAt"
> & {
  eligible: boolean;
  blockedReason: CampaignAudienceBlockedReason | null;
  blockedReasonLabel: string | null;
};

export type CampaignAudiencePreviewPayload = {
  ok: true;
  filters: {
    q: string | null;
    status: string | null;
    channel: string | null;
    hasConversation: boolean | null;
    optOut: boolean | null;
    updatedFrom: string | null;
    updatedTo: string | null;
    onlyWhatsappEligible: boolean | null;
    excludeOptOut: boolean | null;
    crmStatus: string | null;
    city: string | null;
    importedSource: string | null;
  };
  summary: {
    total: number;
    analyzed: number;
    eligible: number;
    blocked: number;
    truncated: boolean;
    blockedByReason: Array<{
      reason: CampaignAudienceBlockedReason;
      label: string;
      count: number;
    }>;
  };
  items: CampaignAudiencePreviewItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  generatedAt: string;
};

function normalizeOptionalText(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizePage(value: unknown) {
  const parsed = Number(value ?? 1);
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : 1;
}

function normalizeLimit(value: unknown) {
  const parsed = Number(value ?? DEFAULT_PREVIEW_LIMIT);
  return Number.isFinite(parsed)
    ? Math.min(MAX_PREVIEW_LIMIT, Math.max(1, Math.floor(parsed)))
    : DEFAULT_PREVIEW_LIMIT;
}

function normalizeBooleanFilter(value: unknown) {
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  return null;
}

function normalizeStatus(value: unknown) {
  const status = normalizeOptionalText(value)?.toUpperCase() ?? null;
  return status && /^[A-Z0-9_-]{2,80}$/.test(status) ? status : null;
}

function getBlockedReasonLabel(reason: CampaignAudienceBlockedReason) {
  switch (reason) {
    case "anonymized_contact":
      return "Contato anonimizado";
    case "operationally_excluded_contact":
      return "Contato excluído da operação";
    case "active_send_blocked":
      return "Envio ativo bloqueado";
    case "missing_whatsapp_identity":
      return "Sem WhatsApp valido";
    case "non_whatsapp_channel":
      return "Canal nao WhatsApp";
    case "invalid_whatsapp_identity":
      return "Identidade WhatsApp invalida";
    case "missing_contact":
      return "Contato incompleto";
    case "unsupported_channel":
      return "Canal nao suportado";
    case "unknown":
    default:
      return "Indeterminado";
  }
}

function resolveBlockedReason(item: CrmContactListItem): CampaignAudienceBlockedReason | null {
  const operational = crmOperationalBlockedReason(item);
  if (operational) return operational;
  if (!item.channel || item.channel.toLowerCase() === "whatsapp") {
    if (!item.hasValidWhatsappIdentity) {
      return item.templateSendBlockedReason === "missing_phone"
        ? "missing_whatsapp_identity"
        : "invalid_whatsapp_identity";
    }
    if (item.templateSendBlockedReason === "unsupported_channel") return "unsupported_channel";
    if (item.templateSendBlockedReason === "unknown") return "unknown";
    if (item.canStartWhatsappTemplateCandidate) return null;
    return "unknown";
  }
  return "non_whatsapp_channel";
}

function toAudienceItem(item: CrmContactListItem): CampaignAudiencePreviewItem {
  const blockedReason = resolveBlockedReason(item);
  return {
    leadId: item.leadId,
    contactId: item.contactId,
    displayName: item.displayName,
    companyName: item.companyName,
    city: item.city,
    crmStatus: item.crmStatus,
    crmStatusLabel: item.crmStatusLabel,
    channel: item.channel,
    phoneDisplay: item.phoneDisplay,
    identifierDisplay: item.identifierDisplay,
    activeOptOut: item.activeOptOut,
    isAnonymized: item.isAnonymized,
    hasValidWhatsappIdentity: item.hasValidWhatsappIdentity,
    lastConversationIdentity: item.lastConversationIdentity,
    lastProtocol: item.lastProtocol,
    importedSource: item.importedSource,
    updatedAt: item.updatedAt,
    eligible: !blockedReason,
    blockedReason,
    blockedReasonLabel: blockedReason ? getBlockedReasonLabel(blockedReason) : null,
  };
}

function applyPostFilters(
  items: CampaignAudiencePreviewItem[],
  filters: {
    onlyWhatsappEligible: boolean | null;
    excludeOptOut: boolean | null;
    city: string | null;
    importedSource: string | null;
  }
) {
  const city = filters.city?.toLowerCase() ?? null;
  const importedSource = filters.importedSource?.toLowerCase() ?? null;
  return items.filter((item) => {
    if (filters.onlyWhatsappEligible === true && !item.eligible) return false;
    if (filters.excludeOptOut === true && item.activeOptOut) return false;
    if (city && !String(item.city ?? "").toLowerCase().includes(city)) return false;
    if (
      importedSource &&
      !String(item.importedSource ?? "").toLowerCase().includes(importedSource)
    ) {
      return false;
    }
    return true;
  });
}

export async function buildCampaignAudiencePreviewPayload(
  prisma: PrismaClient,
  params: {
    clientId: string;
    query: CampaignAudiencePreviewQuery;
    statuses: CrmStatusConfig[];
    now?: Date;
  }
): Promise<CampaignAudiencePreviewPayload> {
  const page = normalizePage(params.query.page);
  const limit = normalizeLimit(params.query.limit);
  const onlyWhatsappEligible = normalizeBooleanFilter(params.query.onlyWhatsappEligible);
  const excludeOptOut = normalizeBooleanFilter(params.query.excludeOptOut);
  const crmStatus = normalizeStatus(params.query.crmStatus);
  const city = normalizeOptionalText(params.query.city);
  const importedSource = normalizeOptionalText(params.query.importedSource ?? params.query.origin);
  const baseQuery: CrmContactsQuery = {
    ...params.query,
    status: crmStatus ?? params.query.status,
    page: 1,
    limit: MAX_PREVIEW_LIMIT,
  };

  const firstPage = await buildCrmContactsPayload(prisma, {
    clientId: params.clientId,
    query: baseQuery,
    statuses: params.statuses,
    now: params.now,
    includeAnonymized: true,
    audienceAnalysisLimit: MAX_ANALYSIS_ITEMS,
  });

  const totalPages = firstPage.pagination.totalPages;
  const collected = [...firstPage.items];
  let currentPage = 2;
  while (
    currentPage <= totalPages &&
    collected.length < MAX_ANALYSIS_ITEMS
  ) {
    const nextPage = await buildCrmContactsPayload(prisma, {
      clientId: params.clientId,
      query: {
        ...baseQuery,
        page: currentPage,
        limit: MAX_PREVIEW_LIMIT,
      },
      statuses: params.statuses,
      now: params.now,
      includeAnonymized: true,
    });
    collected.push(...nextPage.items);
    currentPage += 1;
  }

  const analyzedItems = collected.slice(0, MAX_ANALYSIS_ITEMS).map(toAudienceItem);
  const filteredItems = applyPostFilters(analyzedItems, {
    onlyWhatsappEligible,
    excludeOptOut,
    city,
    importedSource,
  });
  const eligibleItems = filteredItems
    .filter((item) => item.eligible)
    .map((item) => ({ ...item, blockedReason: null, blockedReasonLabel: null }));
  const pagedItems = eligibleItems.slice((page - 1) * limit, page * limit);
  const filteredTotal = eligibleItems.length;
  const previewTotalPages = filteredTotal > 0 ? Math.ceil(filteredTotal / limit) : 0;

  return {
    ok: true,
    filters: {
      q: firstPage.filters.q,
      status: firstPage.filters.status,
      channel: firstPage.filters.channel,
      hasConversation: firstPage.filters.hasConversation,
      optOut: firstPage.filters.optOut,
      updatedFrom: firstPage.filters.updatedFrom,
      updatedTo: firstPage.filters.updatedTo,
      onlyWhatsappEligible,
      excludeOptOut,
      crmStatus,
      city,
      importedSource,
    },
    summary: {
      total: filteredTotal,
      analyzed: analyzedItems.length,
      eligible: filteredTotal,
      blocked: 0,
      truncated: firstPage.pagination.total > MAX_ANALYSIS_ITEMS,
      blockedByReason: [],
    },
    items: pagedItems,
    pagination: {
      page,
      limit,
      total: filteredTotal,
      totalPages: previewTotalPages,
      hasNextPage: page < previewTotalPages,
      hasPreviousPage: page > 1,
    },
    generatedAt: (params.now ?? new Date()).toISOString(),
  };
}
