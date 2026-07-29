import type { Prisma, PrismaClient } from "@prisma/client";
import {
  CONTACT_OPT_OUT_RECORDED_EVENT,
  CONTACT_OPT_OUT_REVOKED_EVENT,
  normalizeOptOutWaId,
} from "../campaigns/optOutRegistry.js";
import { buildConversationProtocol } from "../inbox/conversationProtocol.js";
import { canonicalizeBrazilWaId, normalizeWaIdDigits } from "../utils/waid.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const IMPORT_EVENT_NAMES = ["contact.imported_for_campaign", "lead.imported_for_campaign"];

export type CrmContactsQuery = {
  q?: string | null;
  status?: string | null;
  channel?: string | null;
  hasConversation?: string | boolean | null;
  optOut?: string | boolean | null;
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
  lastProtocol: string | null;
  lastConversationStatus: string | null;
  lastConversationUpdatedAt: string | null;
  conversationsCount: number;
  hasConversation: boolean;
  activeOptOut: boolean;
  importedSource: string | null;
  hasValidWhatsappIdentity: boolean;
  canStartWhatsappTemplateCandidate: boolean;
  hasOpenConversationWindow: boolean | null;
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

function maskPhone(value: string | null | undefined) {
  const digits = normalizeWaIdDigits(String(value ?? ""));
  if (!digits) return null;
  if (digits.length <= 4) return `***${digits}`;
  const prefix = digits.length >= 12 ? digits.slice(0, 4) : digits.slice(0, 2);
  return `${prefix}*****${digits.slice(-4)}`;
}

function isWhatsappChannel(channel: string | null | undefined) {
  return !channel || channel.toLowerCase() === "whatsapp";
}

function buildIdentifierDisplay(lead: LeadRecord, contactDisplayName?: string | null) {
  if (isWhatsappChannel(lead.channel)) {
    return maskPhone(lead.phone || lead.waIdCanonical || lead.waId) ?? "WhatsApp User";
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
  return Boolean(normalizeOptOutWaId(lead.phone || lead.waIdCanonical || lead.waId));
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

export async function buildCrmContactsPayload(
  prisma: PrismaClient,
  params: {
    clientId: string;
    query: CrmContactsQuery;
    statuses: CrmStatusConfig[];
    now?: Date;
  }
): Promise<CrmContactsPayload> {
  const q = normalizeOptionalText(params.query.q);
  const status = normalizeStatus(params.query.status);
  const channel = normalizeChannel(params.query.channel);
  const hasConversation = normalizeBooleanFilter(params.query.hasConversation);
  const optOut = normalizeBooleanFilter(params.query.optOut);
  const updatedFromDate = parseDateFilter(params.query.updatedFrom);
  const updatedToDate = parseDateFilter(params.query.updatedTo);
  const page = normalizePage(params.query.page);
  const limit = normalizeLimit(params.query.limit);
  const statusLabelById = buildStatusLabelMap(params.statuses);

  const baseWhere = buildLeadWhere({
    clientId: params.clientId,
    q,
    status,
    channel,
    updatedFrom: updatedFromDate,
    updatedTo: updatedToDate,
  });

  const candidateTake =
    hasConversation !== null || optOut !== null
      ? Math.min(MAX_LIMIT * 20, Math.max(limit * page * 4, limit))
      : limit;
  const candidateSkip = hasConversation !== null || optOut !== null ? 0 : (page - 1) * limit;

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
      filters: {
        q,
        status,
        channel,
        hasConversation,
        optOut,
        updatedFrom: updatedFromDate?.toISOString() ?? null,
        updatedTo: updatedToDate?.toISOString() ?? null,
      },
      pagination: {
        page,
        limit,
        total: hasConversation !== null || optOut !== null ? 0 : totalBeforePostFilter,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: page > 1,
      },
      items: [],
      generatedAt: (params.now ?? new Date()).toISOString(),
    };
  }

  const identityKeys = Array.from(new Set(leads.map(getIdentityKey)));
  const waIds = Array.from(new Set(leads.map((lead) => lead.waId)));
  const canonicalWaIds = Array.from(new Set(leads.map((lead) => lead.waIdCanonical ?? lead.waId)));
  const contactIdentityIds = leads
    .map((lead) => lead.contactChannelIdentityId)
    .filter((value): value is string => Boolean(value));
  const contactWhere = {
    clientId: params.clientId,
    OR: [{ waId: { in: waIds } }, { waId: { in: canonicalWaIds } }],
  };
  const conversationWhere = {
    clientId: params.clientId,
    deletedAt: null,
    anonymizedAt: null,
    OR: [{ waId: { in: waIds } }, { waIdCanonical: { in: canonicalWaIds } }],
  };

  const [contacts, identities, conversations, runtimeStates, optOutEvents, importEvents] =
    await Promise.all([
      prisma.contact.findMany({
        where: contactWhere,
        select: {
          id: true,
          waId: true,
          name: true,
          channel: true,
          provider: true,
          channelAccountId: true,
          externalUserHash: true,
          updatedAt: true,
        },
      }),
      contactIdentityIds.length > 0
        ? prisma.contactChannelIdentity.findMany({
            where: { clientId: params.clientId, id: { in: contactIdentityIds } },
            select: {
              id: true,
              contactId: true,
              displayName: true,
              channel: true,
              provider: true,
              channelAccountId: true,
              externalUserHash: true,
              lastSeenAt: true,
            },
          })
        : Promise.resolve([]),
      prisma.conversation.findMany({
        where: conversationWhere,
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          waId: true,
          waIdCanonical: true,
          windowIsOpen: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.conversationRuntimeState.findMany({
        where: {
          clientId: params.clientId,
          OR: [{ waId: { in: waIds } }, { waIdCanonical: { in: canonicalWaIds } }],
        },
        select: {
          id: true,
          waId: true,
          waIdCanonical: true,
          status: true,
          updatedAt: true,
        },
      }),
      prisma.event.findMany({
        where: {
          clientId: params.clientId,
          eventName: { in: [CONTACT_OPT_OUT_RECORDED_EVENT, CONTACT_OPT_OUT_REVOKED_EVENT] },
          waIdCanonical: { in: canonicalWaIds },
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
          eventName: { in: IMPORT_EVENT_NAMES },
          waIdCanonical: { in: canonicalWaIds },
        },
        orderBy: { createdAt: "desc" },
        take: Math.min(identityKeys.length * 2, 800),
        select: {
          waId: true,
          waIdCanonical: true,
          payloadJson: true,
          createdAt: true,
        },
      }),
    ]);

  const contactByIdentity = new Map<string, (typeof contacts)[number]>();
  for (const contact of contacts) {
    const key = contact.waId;
    const current = contactByIdentity.get(key);
    if (!current || contact.updatedAt > current.updatedAt) contactByIdentity.set(key, contact);
  }
  const identityById = new Map(identities.map((identity) => [identity.id, identity]));
  const conversationsByKey = new Map<
    string,
    { count: number; latest: (typeof conversations)[number] | null }
  >();
  for (const conversation of conversations) {
    const key = getIdentityKey(conversation);
    const current = conversationsByKey.get(key) ?? { count: 0, latest: null };
    current.count += 1;
    if (!current.latest || conversation.updatedAt > current.latest.updatedAt) {
      current.latest = conversation;
    }
    conversationsByKey.set(key, current);
  }
  const runtimeByKey = new Map<string, (typeof runtimeStates)[number]>();
  for (const runtime of runtimeStates) {
    const key = getIdentityKey(runtime);
    const current = runtimeByKey.get(key);
    if (!current || runtime.updatedAt > current.updatedAt) runtimeByKey.set(key, runtime);
  }
  const activeOptOuts = resolveActiveOptOuts(optOutEvents);
  const importSourceByKey = new Map<string, string>();
  for (const event of importEvents) {
    const key = event.waIdCanonical ?? event.waId;
    if (!key || importSourceByKey.has(key)) continue;
    const source = safePayloadString(event.payloadJson, [
      "source",
      "importedSource",
      "origin",
      "fileName",
      "classification",
    ]);
    if (source) importSourceByKey.set(key, source);
  }

  const allItems = leads
    .map((lead) => {
      const key = getIdentityKey(lead);
      const canonical = lead.waIdCanonical ?? lead.waId;
      const identity = lead.contactChannelIdentityId
        ? identityById.get(lead.contactChannelIdentityId)
        : null;
      const contact =
        (identity?.contactId
          ? contacts.find((item) => item.id === identity.contactId)
          : null) ??
        contactByIdentity.get(lead.waIdCanonical ?? "") ??
        contactByIdentity.get(lead.waId) ??
        null;
      const conversationSummary = conversationsByKey.get(key) ?? { count: 0, latest: null };
      const runtime = runtimeByKey.get(key) ?? null;
      const hasConversationValue = conversationSummary.count > 0;
      const activeOptOut = activeOptOuts.has(canonical);
      const templateCandidate = buildTemplateCandidate(lead, activeOptOut);
      const displayName =
        normalizeOptionalText(lead.name) ??
        normalizeOptionalText(identity?.displayName) ??
        normalizeOptionalText(contact?.name);
      const phoneDisplay = isWhatsappChannel(lead.channel)
        ? maskPhone(lead.phone || lead.waIdCanonical || lead.waId)
        : null;
      const lastConversation = conversationSummary.latest;
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
        lastConversationId: lastConversation?.id ?? null,
        lastProtocol: lastConversation ? buildConversationProtocol(lastConversation) : null,
        lastConversationStatus: runtime?.status ?? null,
        lastConversationUpdatedAt: lastConversation?.updatedAt.toISOString() ?? null,
        conversationsCount: conversationSummary.count,
        hasConversation: hasConversationValue,
        activeOptOut,
        importedSource: importSourceByKey.get(canonical) ?? null,
        ...templateCandidate,
        hasOpenConversationWindow: lastConversation ? lastConversation.windowIsOpen : null,
        createdAt: lead.createdAt.toISOString(),
        updatedAt: lead.updatedAt.toISOString(),
      } satisfies CrmContactListItem;
    })
    .filter((item) => {
      if (hasConversation !== null && item.hasConversation !== hasConversation) return false;
      if (optOut !== null && item.activeOptOut !== optOut) return false;
      return true;
    });

  const total =
    hasConversation !== null || optOut !== null ? allItems.length : totalBeforePostFilter;
  const pagedItems =
    hasConversation !== null || optOut !== null
      ? allItems.slice((page - 1) * limit, page * limit)
      : allItems;
  const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

  return {
    ok: true,
    filters: {
      q,
      status,
      channel,
      hasConversation,
      optOut,
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
