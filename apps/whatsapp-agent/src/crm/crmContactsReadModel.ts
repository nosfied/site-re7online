import { isAnonymizedMarker } from "./crmWhatsappIdentity.js";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  CONTACT_OPT_OUT_RECORDED_EVENT,
  CONTACT_OPT_OUT_REVOKED_EVENT,
  normalizeOptOutWaId,
} from "../campaigns/optOutRegistry.js";
import { buildConversationProtocol } from "../inbox/conversationProtocol.js";
import { getServiceCycleForDisplay } from "../conversation/serviceCycle.js";
import { isOperationalContactLifecycle } from "../contacts/contactLifecycle.js";
import { loadOperationallyExcludedWaIds } from "../contacts/contactOperationalExclusion.js";
import { hashWhatsAppExternalUser } from "../channels/whatsappBackfillDryRun.js";
import { canonicalizeBrazilWaId, normalizeWaIdDigits } from "../utils/waid.js";
import {
  buildCrmWhatsappExternalUserHash,
  buildCrmWhatsappIdentityCandidates,
  normalizeCrmWhatsappIdentity,
} from "./crmWhatsappIdentity.js";
import {
  isActiveOperationalBlockingConversation,
  isHiddenTechnicalBlockingConversation,
} from "./crmContactMutations.js";
import { shouldProjectConversationToHumanInbox } from "../inbox/messageVisibility.js";
import { CRM_CONTACT_CREATED_EVENT } from "./crmContactUpsert.js";
import {
  buildCrmCampaignRelationshipDetail,
  buildCrmCampaignRelationshipSummaryByLeadId,
  EMPTY_CRM_CAMPAIGN_RELATIONSHIP_SUMMARY,
  type CrmCampaignRelationshipDetail,
  type CrmCampaignRelationshipSummary,
} from "./crmCampaignRelationship.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const IMPORT_EVENT_NAMES = ["contact.imported_for_campaign", "lead.imported_for_campaign"];
const CRM_CONTACT_MATERIALIZED_FOR_OPERATIONAL_EXCLUSION_EVENT =
  "crm.contact.materialized_for_operational_exclusion";
const CAMPAIGN_PROVENANCE_EVENT_NAMES = [
  "campaign.recipient.contact_bootstrap_ready",
  "campaign.recipient.conversation_created",
  "campaign.recipient.conversation_reactivated",
];
const CONTACT_PROVENANCE_EVENT_NAMES = [
  CRM_CONTACT_CREATED_EVENT,
  CRM_CONTACT_MATERIALIZED_FOR_OPERATIONAL_EXCLUSION_EVENT,
  ...IMPORT_EVENT_NAMES,
  ...CAMPAIGN_PROVENANCE_EVENT_NAMES,
];
const CONTACT_ORIGIN_UNKNOWN = "Não identificado";
const CONTACT_ORIGIN_MANUAL = "Cadastro manual";
const CONTACT_ORIGIN_CSV = "Importação CSV";
const CONTACT_ORIGIN_CONVERSATION = "Atendimento / conversa";
const CONTACT_ORIGIN_CAMPAIGN = "Campanha / audiência";
const CONTACT_ORIGIN_SYSTEM = "Integração / sistema";

export type CrmContactsQuery = {
  q?: string | null;
  status?: string | null;
  channel?: string | null;
  hasConversation?: string | boolean | null;
  optOut?: string | boolean | null;
  operationalStatus?: string | null;
  updatedFrom?: string | null;
  updatedTo?: string | null;
  page?: string | number | null;
  limit?: string | number | null;
};

export type CrmContactListItem = {
  leadId: string;
  contactId: string | null;
  displayName: string | null;
  companyName: string | null;
  email: string | null;
  city: string | null;
  phoneDisplay: string | null;
  identifierDisplay: string;
  channel: string | null;
  provider: string | null;
  crmStatus: string;
  crmStatusLabel: string;
  leadStatus: string;
  lastConversationId: string | null;
  lastConversationIdentity: string | null;
  lastProtocol: string | null;
  lastConversationStatus: string | null;
  lastConversationUpdatedAt: string | null;
  conversationsCount: number;
  hasConversation: boolean;
  canStartConversation: boolean;
  startConversationBlockedReason:
    | "contact_not_active"
    | "contact_operationally_excluded"
    | "invalid_identity"
    | "channel_unavailable"
    | "new_freeform_requires_model"
    | "not_authorized"
    | "active_send_blocked"
    | null;
  activeOptOut: boolean;
  isAnonymized: boolean;
  isOperationallyExcluded: boolean;
  importedSource: string | null;
  hasValidWhatsappIdentity: boolean;
  canStartWhatsappTemplateCandidate: boolean;
  hasOpenConversationWindow: boolean | null;
  campaignRelationship: CrmCampaignRelationshipSummary;
  templateSendBlockedReason:
    | "not_whatsapp"
    | "missing_phone"
    | "opt_out"
    | "unsupported_channel"
    | "unknown"
    | null;
  createdAt: string;
  updatedAt: string;
};

export type CrmContactsPayload = {
  ok: true;
  filters: {
    q: string | null;
    status: string | null;
    channel: string | null;
    hasConversation: boolean | null;
    optOut: boolean | null;
    operationalStatus: "active" | "excluded";
    updatedFrom: string | null;
    updatedTo: string | null;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  items: CrmContactListItem[];
  generatedAt: string;
};

export type CrmContactDetailConversation = {
  conversationId: string;
  conversationIdentity: string;
  canOpenInInbox: boolean;
  protocol: string;
  channel: string | null;
  provider: string | null;
  status: string | null;
  departmentId: string | null;
  departmentName: string | null;
  queueId: string | null;
  queueName: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  updatedAt: string;
  createdAt: string;
};

export type CrmContactBlockingConversation = {
  conversationId: string;
  conversationIdentity: string;
  visibility: "visible" | "hidden";
  status: string | null;
  mode: string | null;
  handoffStatus: string | null;
  departmentId: string | null;
  departmentName: string | null;
  queueId: string | null;
  queueName: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  updatedAt: string | null;
};

export type CrmContactDetailPayload = {
  ok: true;
  item: CrmContactListItem & {
    contactIdentity: {
      displayName: string | null;
      channel: string | null;
      provider: string | null;
      lastSeenAt: string | null;
    } | null;
    notesCount: number;
  };
  conversations: CrmContactDetailConversation[];
  campaignRelationshipHistory: CrmCampaignRelationshipDetail;
  blockingConversation: CrmContactBlockingConversation | null;
  generatedAt: string;
};

type CrmStatusConfig = {
  id: string;
  label: string;
  isActive?: boolean;
};

type LeadRecord = {
  id: string;
  waId: string;
  waIdCanonical: string | null;
  channel: string | null;
  provider: string | null;
  channelAccountId: string | null;
  externalUserHash: string | null;
  externalUserRef: string | null;
  legacyWaId: string | null;
  contactChannelIdentityId: string | null;
  name: string | null;
  phone: string | null;
  city: string | null;
  service: string | null;
  email: string | null;
  company: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeOptionalText(value: unknown) {
  const normalized = normalizeText(value);
  return normalized.length > 0 ? normalized : null;
}

function normalizePage(value: unknown) {
  const parsed = Number(value ?? 1);
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : 1;
}

function normalizeLimit(value: unknown) {
  const parsed = Number(value ?? DEFAULT_LIMIT);
  return Number.isFinite(parsed)
    ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(parsed)))
    : DEFAULT_LIMIT;
}

function normalizeBooleanFilter(value: unknown) {
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  return null;
}

function parseDateFilter(value: unknown) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return null;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
}

function getIdentityKey(source: { waId: string; waIdCanonical?: string | null }) {
  return source.waIdCanonical || source.waId;
}

function normalizeChannel(value: unknown) {
  const channel = normalizeText(value).toLowerCase();
  return /^[a-z0-9_-]{2,40}$/.test(channel) ? channel : null;
}

function normalizeStatus(value: unknown) {
  const status = normalizeText(value).toUpperCase();
  return /^[A-Z0-9_-]{2,80}$/.test(status) ? status : null;
}

function normalizeOperationalStatus(value: unknown): "active" | "excluded" {
  return normalizeText(value).toLowerCase() === "excluded" ? "excluded" : "active";
}

export function isUnfilteredCrmOperationalScope(
  query: CrmContactsQuery,
  operationalStatus: "active" | "excluded"
) {
  return (
    normalizeOptionalText(query.q) === null &&
    normalizeStatus(query.status) === null &&
    normalizeChannel(query.channel) === null &&
    normalizeBooleanFilter(query.hasConversation) === null &&
    normalizeBooleanFilter(query.optOut) === null &&
    parseDateFilter(query.updatedFrom) === null &&
    parseDateFilter(query.updatedTo) === null &&
    normalizeOperationalStatus(query.operationalStatus) === operationalStatus
  );
}

export async function resolveCrmContactsTotals(params: {
  filtered: CrmContactsPayload;
  effectiveQuery: CrmContactsQuery;
  isAdmin: boolean;
  hasExcluded: () => Promise<boolean>;
  buildScope: (operationalStatus: "active" | "excluded") => Promise<CrmContactsPayload>;
}) {
  const activeScope = isUnfilteredCrmOperationalScope(params.effectiveQuery, "active")
    ? params.filtered
    : await params.buildScope("active");
  const excludedExists = params.isAdmin ? await params.hasExcluded() : false;
  const excludedScope = !excludedExists
    ? null
    : isUnfilteredCrmOperationalScope(params.effectiveQuery, "excluded")
      ? params.filtered
      : await params.buildScope("excluded");
  return {
    tenantVisible: activeScope.pagination.total + (excludedScope?.pagination.total ?? 0),
    filtered: params.filtered.pagination.total,
    pageCount: params.filtered.items.length,
  };
}

function formatCrmPhoneDisplay(value: string | null | undefined) {
  const digits = normalizeWaIdDigits(String(value ?? ""));
  if (!digits) return null;
  return digits;
}

function isWhatsappChannel(channel: string | null | undefined) {
  return !channel || channel.toLowerCase() === "whatsapp";
}

function isAnonymizedContactRecord(
  lead: LeadRecord,
  contact?: { waId?: string | null; name?: string | null; externalUserHash?: string | null } | null,
  identity?: { displayName?: string | null; externalUserHash?: string | null } | null
) {
  return [
    lead.waId,
    lead.waIdCanonical,
    lead.externalUserHash,
    lead.name,
    lead.phone,
    contact?.waId,
    contact?.name,
    contact?.externalUserHash,
    identity?.displayName,
    identity?.externalUserHash,
  ].some(isAnonymizedMarker);
}

function buildIdentifierDisplay(lead: LeadRecord, contactDisplayName?: string | null) {
  if (isWhatsappChannel(lead.channel)) {
    return formatCrmPhoneDisplay(lead.phone || lead.waIdCanonical || lead.waId) ?? "WhatsApp User";
  }
  if (contactDisplayName) return contactDisplayName;
  if (lead.name) return lead.name;
  switch ((lead.channel ?? "").toLowerCase()) {
    case "instagram":
      return "Instagram User";
    case "messenger":
      return "Messenger User";
    case "webchat":
      return "Visitante Webchat";
    case "telegram":
      return "Telegram User";
    default:
      return "Contato";
  }
}

function hasUsableWhatsappPhone(lead: LeadRecord) {
  if (!isWhatsappChannel(lead.channel)) return false;
  return Boolean(normalizeCrmWhatsappIdentity(lead.phone || lead.waIdCanonical || lead.waId));
}

function getOptOutCanonicalCandidates(lead: LeadRecord) {
  return buildCrmWhatsappIdentityCandidates([lead.phone, lead.waIdCanonical, lead.waId]);
}

function buildExternalUserHashCandidates(identityKeys: string[]) {
  return Array.from(
    new Set(
      identityKeys.flatMap((key) => [
        buildCrmWhatsappExternalUserHash(key),
        hashWhatsAppExternalUser(key),
        `hash:${hashWhatsAppExternalUser(key)}`,
      ])
    )
  );
}

function buildLeadIdentityCandidates(
  lead: Pick<
    LeadRecord,
    "phone" | "waIdCanonical" | "waId" | "externalUserRef" | "legacyWaId"
  >,
  identity?: {
    externalUserRef?: string | null;
    legacyWaId?: string | null;
  } | null,
  contact?: {
    waId?: string | null;
    externalUserRef?: string | null;
    legacyWaId?: string | null;
  } | null
) {
  return buildCrmWhatsappIdentityCandidates([
    lead.phone,
    lead.waIdCanonical,
    lead.waId,
    lead.externalUserRef,
    lead.legacyWaId,
    identity?.externalUserRef,
    identity?.legacyWaId,
    contact?.waId,
    contact?.externalUserRef,
    contact?.legacyWaId,
  ]);
}

function buildTemplateCandidate(lead: LeadRecord, activeOptOut: boolean) {
  if (!isWhatsappChannel(lead.channel)) {
    return {
      hasValidWhatsappIdentity: false,
      canStartWhatsappTemplateCandidate: false,
      templateSendBlockedReason: "not_whatsapp" as const,
    };
  }
  if (!hasUsableWhatsappPhone(lead)) {
    return {
      hasValidWhatsappIdentity: false,
      canStartWhatsappTemplateCandidate: false,
      templateSendBlockedReason: "missing_phone" as const,
    };
  }
  if (activeOptOut) {
    return {
      hasValidWhatsappIdentity: true,
      canStartWhatsappTemplateCandidate: false,
      templateSendBlockedReason: "opt_out" as const,
    };
  }
  return {
    hasValidWhatsappIdentity: true,
    canStartWhatsappTemplateCandidate: true,
    templateSendBlockedReason: null,
  };
}

function buildStatusLabelMap(statuses: CrmStatusConfig[]) {
  const map = new Map<string, string>();
  for (const status of statuses) {
    map.set(status.id.toUpperCase(), status.label || status.id);
  }
  return map;
}

function safePayloadString(payload: Prisma.JsonValue, keys: string[]) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = normalizeOptionalText(record[key]);
    if (value) return value.slice(0, 120);
  }
  return null;
}

function classifyContactOriginEvent(event: {
  eventName: string;
  payloadJson: Prisma.JsonValue;
}) {
  if (IMPORT_EVENT_NAMES.includes(event.eventName) || CAMPAIGN_PROVENANCE_EVENT_NAMES.includes(event.eventName)) {
    return CONTACT_ORIGIN_CAMPAIGN;
  }
  if (event.eventName === CRM_CONTACT_MATERIALIZED_FOR_OPERATIONAL_EXCLUSION_EVENT) {
    return CONTACT_ORIGIN_SYSTEM;
  }

  if (event.eventName !== CRM_CONTACT_CREATED_EVENT) return null;
  const source = safePayloadString(event.payloadJson, ["source", "origin", "importedSource"])?.toLowerCase() ?? "";
  if (source === "crm_manual") return CONTACT_ORIGIN_MANUAL;
  if (source === "crm_import") return CONTACT_ORIGIN_CSV;
  if (source.includes("campaign")) return CONTACT_ORIGIN_CAMPAIGN;
  if (source.includes("conversation") || source.includes("inbound") || source.includes("chatbot")) {
    return CONTACT_ORIGIN_CONVERSATION;
  }
  if (source) return CONTACT_ORIGIN_SYSTEM;
  return null;
}

function buildContactOriginLabel(params: {
  events: Array<{ eventName: string; payloadJson: Prisma.JsonValue; createdAt: Date }>;
}) {
  const events = [...params.events].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  for (const event of events) {
    const origin = classifyContactOriginEvent(event);
    if (origin) return origin;
  }
  return CONTACT_ORIGIN_UNKNOWN;
}

function isHumanInboxProjectableConversation(
  conversation: { departmentId?: string | null },
  runtime?: {
    status?: string | null;
    mode?: string | null;
    handoffStatus?: string | null;
    assignedUserId?: string | null;
    assignedAt?: Date | string | null;
    departmentId?: string | null;
    queueId?: string | null;
    handoffActivatedAt?: Date | string | null;
  } | null
) {
  if (!runtime) return false;
  const assignedAt = runtime.assignedAt instanceof Date ? runtime.assignedAt.toISOString() : runtime.assignedAt;
  const handoffActivatedAt =
    runtime.handoffActivatedAt instanceof Date
      ? runtime.handoffActivatedAt.toISOString()
      : runtime.handoffActivatedAt;
  return shouldProjectConversationToHumanInbox({
    status: runtime.status,
    mode: runtime.mode,
    handoffStatus: runtime.handoffStatus,
    assignedUserId: runtime.assignedUserId,
    assignedAt,
    departmentId: runtime.departmentId ?? conversation.departmentId ?? null,
    queueId: runtime.queueId,
    handoffActivatedAt,
  });
}

function resolveActiveOptOuts(
  events: Array<{
    waId: string | null;
    waIdCanonical: string | null;
    eventName: string;
    createdAt: Date;
  }>
) {
  const latestByCanonical = new Map<string, { eventName: string; createdAt: Date }>();
  for (const event of events) {
    const canonical =
      event.waIdCanonical ?? (event.waId ? canonicalizeBrazilWaId(event.waId) : "");
    if (!canonical) continue;
    const current = latestByCanonical.get(canonical);
    if (!current || event.createdAt >= current.createdAt) {
      latestByCanonical.set(canonical, { eventName: event.eventName, createdAt: event.createdAt });
    }
  }
  const active = new Set<string>();
  for (const [canonical, event] of latestByCanonical.entries()) {
    if (event.eventName === CONTACT_OPT_OUT_RECORDED_EVENT) active.add(canonical);
  }
  return active;
}

function buildLeadWhere(params: {
  clientId: string;
  q: string | null;
  status: string | null;
  channel: string | null;
  updatedFrom: Date | null;
  updatedTo: Date | null;
}): Prisma.LeadWhereInput {
  const digits = normalizeWaIdDigits(params.q ?? "");
  return {
    tenantId: params.clientId,
    ...(params.status ? { status: params.status } : {}),
    ...(params.channel ? { channel: params.channel } : {}),
    ...(params.updatedFrom || params.updatedTo
      ? {
          updatedAt: {
            ...(params.updatedFrom ? { gte: params.updatedFrom } : {}),
            ...(params.updatedTo ? { lte: params.updatedTo } : {}),
          },
        }
      : {}),
    ...(params.q
      ? {
          OR: [
            { name: { contains: params.q, mode: "insensitive" } },
            { company: { contains: params.q, mode: "insensitive" } },
            { email: { contains: params.q, mode: "insensitive" } },
            { city: { contains: params.q, mode: "insensitive" } },
            { service: { contains: params.q, mode: "insensitive" } },
            ...(digits
              ? [
                  { phone: { contains: digits } },
                  { waId: { contains: digits } },
                  { waIdCanonical: { contains: digits } },
                ]
              : []),
          ],
        }
      : {}),
  };
}

// Scan bounded projection batches under the caller's snapshot, counting the same visible entities as the page.
export async function buildCrmContactsPayload(prisma: PrismaClient, params: Parameters<typeof buildCrmContactsBatch>[1]): Promise<CrmContactsPayload> {
  const project = async (reader: PrismaClient) => {
    if (params.audienceAnalysisLimit) {
      const { scanned: _scanned, ...result } = await buildCrmContactsBatch(reader, params); return result;
    }
    const page = normalizePage(params.query.page), limit = normalizeLimit(params.query.limit);
    const start = (page - 1) * limit; let total = 0, offset = 0;
    const items: CrmContactListItem[] = []; let result: CrmContactsPayload;
    while (true) {
      const { scanned, ...batch } = await buildCrmContactsBatch(reader, { ...params, candidateOffset: offset, query: { ...params.query, page: 1 } });
      result = batch;
      for (const item of batch.items) { if (total >= start && items.length < limit) items.push(item); total += 1; }
      offset += scanned;
      if (scanned < 500) break;
    }
    const totalPages = total ? Math.ceil(total / limit) : 0;
    return { ...result!, items, pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 } };
  };
  if (typeof prisma.$transaction === "function") return prisma.$transaction(tx => project(tx as unknown as PrismaClient),
    { isolationLevel: "RepeatableRead", maxWait: 1000, timeout: 15000 });
  return project(prisma); // A transaction client already supplied by the HTTP reader has no nested transaction method.
}

async function buildCrmContactsBatch(
  prisma: PrismaClient,
  params: {
    clientId: string;
    query: CrmContactsQuery;
    statuses: CrmStatusConfig[];
    canStartWhatsappFreeform?: boolean;
    startConversationBlockedReason?:
      | "channel_unavailable"
      | "new_freeform_requires_model"
      | "not_authorized"
      | null;
    now?: Date;
    includeAnonymized?: boolean;
    includeCampaignRelationships?: boolean;
    audienceAnalysisLimit?: number;
    candidateOffset?: number;
  }
): Promise<CrmContactsPayload & { scanned: number }> {
  const q = normalizeOptionalText(params.query.q);
  const status = normalizeStatus(params.query.status);
  const channel = normalizeChannel(params.query.channel);
  const hasConversation = normalizeBooleanFilter(params.query.hasConversation);
  const optOut = normalizeBooleanFilter(params.query.optOut);
  const operationalStatus = normalizeOperationalStatus(params.query.operationalStatus);
  const updatedFromDate = parseDateFilter(params.query.updatedFrom);
  const updatedToDate = parseDateFilter(params.query.updatedTo);
  const page = normalizePage(params.query.page);
  const limit = params.candidateOffset !== undefined ? 500 : params.audienceAnalysisLimit ? Math.min(5000, Math.max(1, params.audienceAnalysisLimit)) : normalizeLimit(params.query.limit);
  const statusLabelById = buildStatusLabelMap(params.statuses);
  const includeAnonymized = params.includeAnonymized === true;
  const requiresPostFilter = true;

  const baseWhere = buildLeadWhere({
    clientId: params.clientId,
    q,
    status,
    channel,
    updatedFrom: updatedFromDate,
    updatedTo: updatedToDate,
  });

  // Post-filters define visibility; never label a candidate prefix as the total.
  const candidateTake = params.candidateOffset !== undefined ? 500 : params.audienceAnalysisLimit ? limit : undefined;
  const candidateSkip = params.candidateOffset ?? (requiresPostFilter ? 0 : (page - 1) * limit);

  const [totalBeforePostFilter, leads] = await Promise.all([
    prisma.lead.count({ where: baseWhere }),
    prisma.lead.findMany({
      where: baseWhere,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }, { id: "asc" }],
      skip: candidateSkip,
      take: candidateTake,
      select: {
        id: true,
        waId: true,
        waIdCanonical: true,
        channel: true,
        provider: true,
        channelAccountId: true,
        externalUserHash: true,
        externalUserRef: true,
        legacyWaId: true,
        contactChannelIdentityId: true,
        name: true,
        phone: true,
        city: true,
        service: true,
        email: true,
        company: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  if (leads.length === 0) {
    return {
      ok: true,
      scanned: leads.length,
      filters: {
        q,
        status,
        channel,
        hasConversation,
        optOut,
        operationalStatus,
        updatedFrom: updatedFromDate?.toISOString() ?? null,
        updatedTo: updatedToDate?.toISOString() ?? null,
      },
      pagination: {
        page,
        limit,
        total: requiresPostFilter ? 0 : totalBeforePostFilter,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: page > 1,
      },
      items: [],
      generatedAt: (params.now ?? new Date()).toISOString(),
    };
  }

  const identityKeys = Array.from(new Set(leads.flatMap((lead) => buildCrmWhatsappIdentityCandidates([lead.phone, lead.waIdCanonical, lead.waId]))));
  const identityHashes = buildExternalUserHashCandidates(identityKeys);
  const waIds = Array.from(new Set(leads.flatMap((lead) => buildCrmWhatsappIdentityCandidates([lead.waId]))));
  const canonicalWaIds = Array.from(new Set(leads.flatMap((lead) => buildCrmWhatsappIdentityCandidates([lead.waIdCanonical ?? lead.waId, lead.phone]))));
  const optOutCanonicalWaIds = Array.from(
    new Set(leads.flatMap((lead) => getOptOutCanonicalCandidates(lead)))
  );
  const contactIdentityIds = leads
    .map((lead) => lead.contactChannelIdentityId)
    .filter((value): value is string => Boolean(value));
  // Each identity may expand into several aliases and hashes. Bound the OR
  // predicates so large campaign audiences stay below PostgreSQL's bind limit.
  const contactWheres = Array.from({ length: Math.max(1, Math.ceil(Math.max(identityKeys.length, identityHashes.length) / 1000)) }, (_, index) => ({
    clientId: params.clientId,
    OR: [
      { waId: { in: identityKeys.slice(index * 1000, (index + 1) * 1000) } },
      { externalUserRef: { in: identityKeys.slice(index * 1000, (index + 1) * 1000) } },
      { legacyWaId: { in: identityKeys.slice(index * 1000, (index + 1) * 1000) } },
      { externalUserHash: { in: identityHashes.slice(index * 1000, (index + 1) * 1000) } },
    ],
  }));
  const identityKeyChunks = Array.from({ length: Math.max(1, Math.ceil(identityKeys.length / 1000)) }, (_, index) => identityKeys.slice(index * 1000, (index + 1) * 1000));

  const [contacts, identities, conversations, runtimeStates, optOutEvents, importEvents, operationallyExcludedWaIds] =
    await Promise.all([
      Promise.all(contactWheres.map((where) => prisma.contact.findMany({
        where,
        select: {
          id: true,
          waId: true,
          name: true,
          channel: true,
          provider: true,
          channelAccountId: true,
          externalUserHash: true,
          externalUserRef: true,
          legacyWaId: true,
          lifecycle: true,
          updatedAt: true,
        },
      }))).then((groups) => Array.from(new Map(groups.flat().map((contact) => [contact.id, contact])).values())),
      contactIdentityIds.length > 0 || identityHashes.length > 0
        ? Promise.all(Array.from({ length: Math.max(1, Math.ceil(Math.max(contactIdentityIds.length, identityHashes.length) / 1000)) }, (_, index) => prisma.contactChannelIdentity.findMany({
            where: {
              clientId: params.clientId,
              OR: [
                { id: { in: contactIdentityIds.slice(index * 1000, (index + 1) * 1000) } },
                ...(identityHashes.length > 0 ? [{ externalUserHash: { in: identityHashes.slice(index * 1000, (index + 1) * 1000) } }] : []),
              ],
            },
            select: {
              id: true,
              contactId: true,
              displayName: true,
              channel: true,
              provider: true,
              channelAccountId: true,
              externalUserHash: true,
              externalUserRef: true,
              legacyWaId: true,
              lastSeenAt: true,
              contact: {
                select: {
                  id: true,
                  waId: true,
                  name: true,
                  channel: true,
                  provider: true,
                  channelAccountId: true,
                  externalUserHash: true,
                  externalUserRef: true,
                  legacyWaId: true,
                  lifecycle: true,
                  updatedAt: true,
                },
              },
            },
          }))).then((groups) => Array.from(new Map(groups.flat().map((identity) => [identity.id, identity])).values()))
        : Promise.resolve([]),
      Promise.all(identityKeyChunks.map((keys) => prisma.conversation.findMany({
        where: { clientId: params.clientId, deletedAt: null, anonymizedAt: null, OR: [{ waId: { in: keys } }, { waIdCanonical: { in: keys } }] },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          waId: true,
          waIdCanonical: true,
          departmentId: true,
          windowIsOpen: true,
          createdAt: true,
          updatedAt: true,
        },
      }))).then((groups) => Array.from(new Map(groups.flat().map((conversation) => [conversation.id, conversation])).values()).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || b.createdAt.getTime() - a.createdAt.getTime())),
      Promise.all(identityKeyChunks.map((keys) => prisma.conversationRuntimeState.findMany({
        where: {
          clientId: params.clientId,
          OR: [{ waId: { in: keys } }, { waIdCanonical: { in: keys } }],
        },
        select: {
          id: true,
          waId: true,
          waIdCanonical: true,
          channel: true,
          status: true,
          mode: true,
          handoffStatus: true,
          assignedUserId: true,
          assignedAt: true,
          departmentId: true,
          queueId: true,
          handoffActivatedAt: true,
          answers: true,
          updatedAt: true,
        },
      }))).then((groups) => Array.from(new Map(groups.flat().map((runtime) => [runtime.id, runtime])).values())),
      prisma.event.findMany({
        where: {
          clientId: params.clientId,
          eventName: { in: [CONTACT_OPT_OUT_RECORDED_EVENT, CONTACT_OPT_OUT_REVOKED_EVENT] },
          waIdCanonical: { in: optOutCanonicalWaIds },
        },
        orderBy: { createdAt: "asc" },
        select: {
          waId: true,
          waIdCanonical: true,
          eventName: true,
          createdAt: true,
        },
      }),
      prisma.event.findMany({
        where: {
          clientId: params.clientId,
          eventName: { in: CONTACT_PROVENANCE_EVENT_NAMES },
          waIdCanonical: { in: canonicalWaIds },
        },
        orderBy: { createdAt: "asc" },
        take: Math.min(identityKeys.length * 4, 1200),
        select: {
          waId: true,
          waIdCanonical: true,
          eventName: true,
          payloadJson: true,
          createdAt: true,
        },
      }),
      loadOperationallyExcludedWaIds(prisma, {
        clientId: params.clientId,
        waIds: identityKeys,
      }),
    ]);

  const contactByIdentity = new Map<string, (typeof contacts)[number]>();
  for (const contact of contacts) {
    for (const key of [contact.waId, contact.externalUserRef, contact.legacyWaId, contact.externalUserHash].filter(Boolean) as string[]) {
      const current = contactByIdentity.get(key);
      if (!current || contact.updatedAt > current.updatedAt) contactByIdentity.set(key, contact);
    }
  }
  const identityById = new Map(identities.map((identity) => [identity.id, identity]));
  const conversationsByKey = new Map<string, Array<(typeof conversations)[number]>>();
  for (const conversation of conversations) {
    for (const key of [conversation.waId, conversation.waIdCanonical].filter(Boolean) as string[]) {
      const current = conversationsByKey.get(key) ?? [];
      if (!current.some((item) => item.id === conversation.id)) current.push(conversation);
      conversationsByKey.set(key, current);
    }
  }
  const getConversationSummary = (keys: string[]) => {
    const byId = new Map<string, (typeof conversations)[number]>();
    for (const candidate of keys) {
      for (const conversation of conversationsByKey.get(candidate) ?? []) {
        byId.set(conversation.id, conversation);
      }
    }
    const values = Array.from(byId.values());
    values.sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
    return { count: values.length, latest: values[0] ?? null, values };
  };
  const runtimeByKey = new Map<string, (typeof runtimeStates)[number]>();
  for (const runtime of runtimeStates) {
    for (const key of [runtime.waId, runtime.waIdCanonical].filter(Boolean) as string[]) {
      const current = runtimeByKey.get(key);
      if (!current || runtime.updatedAt > current.updatedAt) runtimeByKey.set(key, runtime);
    }
  }
  const activeOptOuts = resolveActiveOptOuts(optOutEvents);
  const provenanceEventsByKey = new Map<string, Array<(typeof importEvents)[number]>>();
  for (const event of importEvents) {
    const key = event.waIdCanonical ?? event.waId;
    if (!key) continue;
    const current = provenanceEventsByKey.get(key) ?? [];
    current.push(event);
    provenanceEventsByKey.set(key, current);
  }

  const allItemsWithInternal = leads
    .map((lead) => {
      const key = getIdentityKey(lead);
      const canonical = lead.waIdCanonical ?? lead.waId;
      const seedLeadCandidates = buildLeadIdentityCandidates(lead);
      const identity = lead.contactChannelIdentityId
        ? identityById.get(lead.contactChannelIdentityId)
        : null;
      const contact =
        identity?.contact ??
        (identity?.contactId ? contacts.find((item) => item.id === identity.contactId) : null) ??
        seedLeadCandidates.map((candidate) => contactByIdentity.get(candidate)).find(Boolean) ??
        contactByIdentity.get(lead.externalUserHash ?? "") ??
        contactByIdentity.get(lead.waIdCanonical ?? "") ??
        contactByIdentity.get(lead.waId) ??
        null;
      const leadCandidates = buildLeadIdentityCandidates(lead, identity, contact);
      const conversationSummary = getConversationSummary([...leadCandidates, key]);
      const hasConversationValue = conversationSummary.count > 0;
      const activeOptOut = getOptOutCanonicalCandidates(lead).some((candidate) =>
        activeOptOuts.has(candidate)
      );
      const templateCandidate = buildTemplateCandidate(lead, activeOptOut);
      const isAnonymized = isAnonymizedContactRecord(lead, contact, identity);
      const isOperationalContact = !contact || isOperationalContactLifecycle(contact.lifecycle);
      const isOperationallyExcluded = leadCandidates.some((candidate) => operationallyExcludedWaIds.has(candidate));
      const lastInboxConversation =
        conversationSummary.values.find((conversation) => {
          const runtime = runtimeByKey.get(getIdentityKey(conversation)) ?? null;
          return isHumanInboxProjectableConversation(conversation, runtime);
        }) ?? null;
      const lastInboxRuntime = lastInboxConversation
        ? runtimeByKey.get(getIdentityKey(lastInboxConversation)) ?? null
        : null;
      const hasInboxConversationValue = Boolean(lastInboxConversation);
      const startConversationBlockedReason =
        hasInboxConversationValue
          ? null
          : isOperationallyExcluded
            ? "contact_operationally_excluded"
            : !isOperationalContact
            ? "contact_not_active"
            : !templateCandidate.hasValidWhatsappIdentity
              ? "invalid_identity"
              : activeOptOut
                ? "active_send_blocked"
                : params.canStartWhatsappFreeform === true
                  ? null
                  : params.startConversationBlockedReason ?? "channel_unavailable";
      const displayName =
        normalizeOptionalText(lead.name) ??
        normalizeOptionalText(identity?.displayName) ??
        normalizeOptionalText(contact?.name);
      const phoneDisplay = isWhatsappChannel(lead.channel)
        ? formatCrmPhoneDisplay(lead.phone || lead.waIdCanonical || lead.waId)
        : null;
      const contactOrigin = buildContactOriginLabel({
        events: Array.from(
          new Map(
            leadCandidates
              .flatMap((candidate) => provenanceEventsByKey.get(candidate) ?? [])
              .map((event) => [`${event.eventName}:${event.createdAt.toISOString()}`, event] as const)
          ).values()
        ).sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()),
      });
      return {
        leadId: lead.id,
        contactId: identity?.contactId ?? contact?.id ?? null,
        displayName,
        companyName: lead.company,
        email: lead.email,
        city: lead.city,
        phoneDisplay,
        identifierDisplay: buildIdentifierDisplay(lead, identity?.displayName ?? contact?.name),
        channel: lead.channel,
        provider: lead.provider,
        crmStatus: lead.status,
        crmStatusLabel: statusLabelById.get(lead.status.toUpperCase()) ?? lead.status,
        leadStatus: lead.status,
        lastConversationId: lastInboxConversation?.id ?? null,
        lastConversationIdentity: lastInboxConversation ? getIdentityKey(lastInboxConversation) : null,
        lastProtocol: lastInboxConversation
          ? getServiceCycleForDisplay(lastInboxRuntime)?.protocol ?? buildConversationProtocol(lastInboxConversation)
          : null,
        lastConversationStatus: lastInboxRuntime?.status ?? null,
        lastConversationUpdatedAt: lastInboxConversation?.updatedAt.toISOString() ?? null,
        conversationsCount: conversationSummary.count,
        hasConversation: hasConversationValue,
        canStartConversation:
          !hasInboxConversationValue &&
          !isAnonymized &&
          startConversationBlockedReason === null,
        startConversationBlockedReason,
        activeOptOut,
        isAnonymized,
        isOperationallyExcluded,
        importedSource: contactOrigin,
        ...templateCandidate,
        hasOpenConversationWindow: lastInboxConversation ? lastInboxConversation.windowIsOpen : null,
        campaignRelationship: { ...EMPTY_CRM_CAMPAIGN_RELATIONSHIP_SUMMARY },
        createdAt: lead.createdAt.toISOString(),
        updatedAt: lead.updatedAt.toISOString(),
        campaignIdentityKeys: leadCandidates,
        isOperationalContact,
      } satisfies CrmContactListItem & { isOperationalContact: boolean; campaignIdentityKeys: string[] };
    })
    .filter((item) => {
      if (!item.isOperationalContact) return false;
      if (operationalStatus === "excluded" ? !item.isOperationallyExcluded : item.isOperationallyExcluded) return false;
      if (!includeAnonymized && item.isAnonymized) return false;
      if (hasConversation !== null && item.hasConversation !== hasConversation) return false;
      if (optOut !== null && item.activeOptOut !== optOut) return false;
      return true;
    })
    .map(({ isOperationalContact: _isOperationalContact, ...item }) => item);

  const total = requiresPostFilter ? allItemsWithInternal.length : totalBeforePostFilter;
  const pagedItemsWithInternal = requiresPostFilter
    ? allItemsWithInternal.slice((page - 1) * limit, page * limit)
    : allItemsWithInternal;
  const campaignSummaryByLeadId =
    params.includeCampaignRelationships === true && pagedItemsWithInternal.length > 0
      ? await buildCrmCampaignRelationshipSummaryByLeadId(prisma, {
          clientId: params.clientId,
          contacts: pagedItemsWithInternal.map((item) => ({
            leadId: item.leadId,
            identityKeys: item.campaignIdentityKeys,
          })),
        })
      : new Map<string, CrmCampaignRelationshipSummary>();
  const pagedItems = pagedItemsWithInternal.map(({ campaignIdentityKeys: _campaignIdentityKeys, ...item }) => ({
    ...item,
    campaignRelationship:
      campaignSummaryByLeadId.get(item.leadId) ?? { ...EMPTY_CRM_CAMPAIGN_RELATIONSHIP_SUMMARY },
  }));
  const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

  return {
    ok: true,
    scanned: leads.length,
    filters: {
      q,
      status,
      channel,
      hasConversation,
      optOut,
      operationalStatus,
      updatedFrom: updatedFromDate?.toISOString() ?? null,
      updatedTo: updatedToDate?.toISOString() ?? null,
    },
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
    items: pagedItems,
    generatedAt: (params.now ?? new Date()).toISOString(),
  };
}

export async function buildCrmContactDetailPayload(
  prisma: PrismaClient,
  params: {
    clientId: string;
    leadId: string;
    statuses: CrmStatusConfig[];
    canStartWhatsappFreeform?: boolean;
    startConversationBlockedReason?:
      | "channel_unavailable"
      | "new_freeform_requires_model"
      | "not_authorized"
      | null;
    now?: Date;
    includeOperationallyExcluded?: boolean;
    includeCampaignRelationships?: boolean;
  }
): Promise<CrmContactDetailPayload | null> {
  const statusLabelById = buildStatusLabelMap(params.statuses);
  const lead = await prisma.lead.findFirst({
    where: { id: params.leadId, tenantId: params.clientId },
    select: {
      id: true,
      waId: true,
      waIdCanonical: true,
      channel: true,
      provider: true,
      channelAccountId: true,
      externalUserHash: true,
      externalUserRef: true,
      legacyWaId: true,
      contactChannelIdentityId: true,
      name: true,
      phone: true,
      city: true,
      service: true,
      email: true,
      company: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!lead) return null;

  const seedIdentityKeys = buildLeadIdentityCandidates(lead);
  const seedIdentityHashes = Array.from(
    new Set([lead.externalUserHash, ...buildExternalUserHashCandidates(seedIdentityKeys)].filter(Boolean) as string[])
  );
  const [contact, identity] =
    await Promise.all([
      prisma.contact.findFirst({
        where: {
          clientId: params.clientId,
          OR: [
            { waId: { in: seedIdentityKeys } },
            { externalUserRef: { in: seedIdentityKeys } },
            { legacyWaId: { in: seedIdentityKeys } },
            { externalUserHash: { in: seedIdentityHashes } },
          ],
        },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          waId: true,
          name: true,
          channel: true,
          provider: true,
          channelAccountId: true,
          externalUserHash: true,
          externalUserRef: true,
          legacyWaId: true,
          lifecycle: true,
          updatedAt: true,
        },
      }),
      lead.contactChannelIdentityId || seedIdentityHashes.length > 0
        ? prisma.contactChannelIdentity.findFirst({
            where: {
              clientId: params.clientId,
              OR: [
                ...(lead.contactChannelIdentityId ? [{ id: lead.contactChannelIdentityId }] : []),
                ...(seedIdentityHashes.length > 0 ? [{ externalUserHash: { in: seedIdentityHashes } }] : []),
              ],
            },
            select: {
              id: true,
              contactId: true,
              displayName: true,
              channel: true,
              provider: true,
              externalUserRef: true,
              legacyWaId: true,
              lastSeenAt: true,
              contact: {
                select: {
                  id: true,
                  waId: true,
                  name: true,
                  channel: true,
                  provider: true,
                  channelAccountId: true,
                  externalUserHash: true,
                  externalUserRef: true,
                  legacyWaId: true,
                  lifecycle: true,
                  updatedAt: true,
                },
              },
            },
          })
        : Promise.resolve(null),
    ]);
  const effectiveContactForIdentity = identity?.contact ?? contact;
  const identityKeys = buildLeadIdentityCandidates(lead, identity, effectiveContactForIdentity);
  const optOutCanonicalWaIds = getOptOutCanonicalCandidates(lead);

  const [conversations, runtimeStates, optOutEvents, importEvents, operationallyExcludedWaIds, notesCount] =
    await Promise.all([
      prisma.conversation.findMany({
        where: {
          clientId: params.clientId,
          deletedAt: null,
          anonymizedAt: null,
          OR: [{ waId: { in: identityKeys } }, { waIdCanonical: { in: identityKeys } }],
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        take: 25,
        select: {
          id: true,
          waId: true,
          waIdCanonical: true,
          channel: true,
          provider: true,
          departmentId: true,
          windowIsOpen: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.conversationRuntimeState.findMany({
        where: {
          clientId: params.clientId,
          OR: [{ waId: { in: identityKeys } }, { waIdCanonical: { in: identityKeys } }],
        },
        select: {
          id: true,
          conversationKey: true,
          waId: true,
          waIdCanonical: true,
          channel: true,
          status: true,
          mode: true,
          handoffStatus: true,
          assignedUserId: true,
          assignedTo: true,
          assignedAt: true,
          departmentId: true,
          queueId: true,
          handoffActivatedAt: true,
          closedAt: true,
          answers: true,
          updatedAt: true,
        },
      }),
      prisma.event.findMany({
        where: {
          clientId: params.clientId,
          eventName: { in: [CONTACT_OPT_OUT_RECORDED_EVENT, CONTACT_OPT_OUT_REVOKED_EVENT] },
          waIdCanonical: { in: optOutCanonicalWaIds },
        },
        orderBy: { createdAt: "asc" },
        select: {
          waId: true,
          waIdCanonical: true,
          eventName: true,
          createdAt: true,
        },
      }),
      prisma.event.findMany({
        where: {
          clientId: params.clientId,
          eventName: { in: CONTACT_PROVENANCE_EVENT_NAMES },
          waIdCanonical: { in: identityKeys },
        },
        orderBy: { createdAt: "asc" },
        take: 5,
        select: {
          waId: true,
          waIdCanonical: true,
          eventName: true,
          payloadJson: true,
          createdAt: true,
        },
      }),
      loadOperationallyExcludedWaIds(prisma, {
        clientId: params.clientId,
        waIds: identityKeys,
      }),
      prisma.leadNote.count({ where: { leadId: lead.id, tenantId: params.clientId } }),
    ]);

  const departmentIds = Array.from(
    new Set([
      ...conversations.map((item) => item.departmentId),
      ...runtimeStates.map((item) => item.departmentId),
    ].filter((value): value is string => Boolean(value)))
  );
  const queueIds = Array.from(new Set(runtimeStates.map((item) => item.queueId).filter((value): value is string => Boolean(value))));
  const assignedUserIds = Array.from(
    new Set(runtimeStates.map((item) => item.assignedUserId).filter((value): value is string => Boolean(value)))
  );
  const [departments, queues, users] = await Promise.all([
    departmentIds.length > 0
      ? prisma.department.findMany({
          where: { clientId: params.clientId, id: { in: departmentIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    queueIds.length > 0
      ? prisma.queue.findMany({
          where: { clientId: params.clientId, id: { in: queueIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    assignedUserIds.length > 0
      ? prisma.user.findMany({
          where: { clientId: params.clientId, id: { in: assignedUserIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const departmentNameById = new Map(departments.map((item) => [item.id, item.name]));
  const queueNameById = new Map(queues.map((item) => [item.id, item.name]));
  const userNameById = new Map(users.map((item) => [item.id, item.name]));
  const runtimeByKey = new Map<string, (typeof runtimeStates)[number]>();
  for (const runtime of runtimeStates) {
    runtimeByKey.set(getIdentityKey(runtime), runtime);
  }
  const activeOptOuts = resolveActiveOptOuts(optOutEvents);
  const activeOptOut = getOptOutCanonicalCandidates(lead).some((candidate) => activeOptOuts.has(candidate));
  const templateCandidate = buildTemplateCandidate(lead, activeOptOut);
  const isAnonymized = isAnonymizedContactRecord(lead, contact, identity);
  const effectiveContact = identity?.contact ?? contact;
  if (effectiveContact && !isOperationalContactLifecycle(effectiveContact.lifecycle)) return null;
  const isOperationallyExcluded = identityKeys.some((candidate) => operationallyExcludedWaIds.has(candidate));
  if (isOperationallyExcluded && params.includeOperationallyExcluded !== true) return null;
  if (isAnonymized) return null;
  const latestInboxConversation =
    conversations.find((conversation) => {
      const runtime = runtimeByKey.get(getIdentityKey(conversation)) ?? null;
      return isHumanInboxProjectableConversation(conversation, runtime);
    }) ?? null;
  const latestInboxRuntime = latestInboxConversation
    ? runtimeByKey.get(getIdentityKey(latestInboxConversation)) ?? null
    : null;
  const canStartConversation =
    !latestInboxConversation &&
    templateCandidate.hasValidWhatsappIdentity &&
    !activeOptOut &&
    params.canStartWhatsappFreeform === true;
  const startConversationBlockedReason =
    latestInboxConversation
      ? null
      : isOperationallyExcluded
        ? "contact_operationally_excluded"
        : !templateCandidate.hasValidWhatsappIdentity
        ? "invalid_identity"
        : activeOptOut
          ? "active_send_blocked"
          : canStartConversation
            ? null
            : params.startConversationBlockedReason ?? "channel_unavailable";
  const displayName =
    normalizeOptionalText(lead.name) ??
    normalizeOptionalText(identity?.displayName) ??
    normalizeOptionalText(contact?.name);
  const phoneDisplay = isWhatsappChannel(lead.channel)
    ? formatCrmPhoneDisplay(lead.phone || lead.waIdCanonical || lead.waId)
    : null;
  const contactOrigin = buildContactOriginLabel({ events: importEvents });
  const campaignRelationship =
    params.includeCampaignRelationships === true
      ? await buildCrmCampaignRelationshipDetail(prisma, {
          clientId: params.clientId,
          leadId: lead.id,
          identityKeys,
        })
      : { items: [], pagination: { limit: 25, hasMore: false, total: 0 } };
  const campaignSummary = summarizeDetailCampaignRelationship(campaignRelationship);
  const blockingRuntime =
    runtimeStates.find((runtime) => isActiveOperationalBlockingConversation(runtime)) ?? null;
  const blockingConversation = blockingRuntime
    ? (() => {
        const blockingIdentity = getIdentityKey(blockingRuntime);
        const conversation = conversations.find((item) => getIdentityKey(item) === blockingIdentity) ?? null;
        const departmentId = blockingRuntime.departmentId ?? conversation?.departmentId ?? null;
        const queueId = blockingRuntime.queueId ?? null;
        const assignedUserId = blockingRuntime.assignedUserId ?? null;
        return {
          conversationId: conversation?.id ?? blockingIdentity,
          conversationIdentity: blockingIdentity,
          visibility: isHiddenTechnicalBlockingConversation(blockingRuntime) ? "hidden" as const : "visible" as const,
          status: blockingRuntime.status ?? null,
          mode: blockingRuntime.mode ?? null,
          handoffStatus: blockingRuntime.handoffStatus ?? null,
          departmentId,
          departmentName: departmentId ? departmentNameById.get(departmentId) ?? null : null,
          queueId,
          queueName: queueId ? queueNameById.get(queueId) ?? null : null,
          assignedUserId,
          assignedUserName:
            assignedUserId ? userNameById.get(assignedUserId) ?? blockingRuntime.assignedTo ?? null : blockingRuntime.assignedTo ?? null,
          updatedAt: blockingRuntime.updatedAt?.toISOString() ?? conversation?.updatedAt.toISOString() ?? null,
        };
      })()
    : null;

  return {
    ok: true,
    item: {
      leadId: lead.id,
      contactId: identity?.contactId ?? contact?.id ?? null,
      displayName,
      companyName: lead.company,
      email: lead.email,
      city: lead.city,
      phoneDisplay,
      identifierDisplay: buildIdentifierDisplay(lead, identity?.displayName ?? contact?.name),
      channel: lead.channel,
      provider: lead.provider,
      crmStatus: lead.status,
      crmStatusLabel: statusLabelById.get(lead.status.toUpperCase()) ?? lead.status,
      leadStatus: lead.status,
      lastConversationId: latestInboxConversation?.id ?? null,
      lastConversationIdentity: latestInboxConversation ? getIdentityKey(latestInboxConversation) : null,
      lastProtocol: latestInboxConversation
        ? getServiceCycleForDisplay(latestInboxRuntime)?.protocol ?? buildConversationProtocol(latestInboxConversation)
        : null,
      lastConversationStatus: latestInboxRuntime?.status ?? null,
      lastConversationUpdatedAt: latestInboxConversation?.updatedAt.toISOString() ?? null,
      conversationsCount: conversations.length,
      hasConversation: conversations.length > 0,
      canStartConversation,
      startConversationBlockedReason,
      activeOptOut,
      isAnonymized,
      isOperationallyExcluded,
      importedSource: contactOrigin,
      ...templateCandidate,
      hasOpenConversationWindow: latestInboxConversation ? latestInboxConversation.windowIsOpen : null,
      campaignRelationship: campaignSummary,
      createdAt: lead.createdAt.toISOString(),
      updatedAt: lead.updatedAt.toISOString(),
      contactIdentity: identity
        ? {
            displayName: identity.displayName,
            channel: identity.channel,
            provider: identity.provider,
            lastSeenAt: identity.lastSeenAt?.toISOString() ?? null,
          }
        : null,
      notesCount,
    },
    conversations: conversations.map((conversation) => {
      const runtime = runtimeByKey.get(getIdentityKey(conversation)) ?? null;
      const departmentId = runtime?.departmentId ?? conversation.departmentId ?? null;
      const queueId = runtime?.queueId ?? null;
      const assignedUserId = runtime?.assignedUserId ?? null;
      const canOpenInInbox = isHumanInboxProjectableConversation(conversation, runtime);
      return {
        conversationId: conversation.id,
        conversationIdentity: getIdentityKey(conversation),
        canOpenInInbox,
        protocol: getServiceCycleForDisplay(runtime)?.protocol ?? buildConversationProtocol(conversation),
        channel: runtime?.channel ?? conversation.channel,
        provider: conversation.provider,
        status: runtime?.status ?? null,
        departmentId,
        departmentName: departmentId ? departmentNameById.get(departmentId) ?? null : null,
        queueId,
        queueName: queueId ? queueNameById.get(queueId) ?? null : null,
        assignedUserId,
        assignedUserName:
          assignedUserId ? userNameById.get(assignedUserId) ?? runtime?.assignedTo ?? null : runtime?.assignedTo ?? null,
        updatedAt: conversation.updatedAt.toISOString(),
        createdAt: conversation.createdAt.toISOString(),
      };
    }),
    campaignRelationshipHistory: campaignRelationship,
    blockingConversation,
    generatedAt: (params.now ?? new Date()).toISOString(),
  };
}

function summarizeDetailCampaignRelationship(detail: CrmCampaignRelationshipDetail): CrmCampaignRelationshipSummary {
  if (detail.items.length === 0) return { ...EMPTY_CRM_CAMPAIGN_RELATIONSHIP_SUMMARY };
  const latest = detail.items[0];
  return {
    campaignCount: detail.pagination.total,
    latestCampaignId: latest.campaignId,
    latestCampaignName: latest.campaignName,
    latestCampaignAt: latest.campaignAt,
    latestTemplate: latest.templateName,
    latestRecipientStatus: latest.recipientStatus,
    latestResultReason: latest.resultReason,
    hasOptOutBlock: detail.items.some((item) => item.hasOptOutBlock),
    latestDeliveredAt: latest.deliveredAt,
  };
}
