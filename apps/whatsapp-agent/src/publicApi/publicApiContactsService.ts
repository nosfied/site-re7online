import type { PrismaClient } from "@prisma/client";
import { CONTACT_LIFECYCLE_ACTIVE } from "../contacts/contactLifecycle.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

type PublicContactRow = {
  id: string;
  clientId: string;
  waId: string;
  name: string | null;
  channel: string | null;
  provider: string | null;
  channelAccountId: string | null;
  externalUserHash: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type LeadRow = {
  id: string;
  waId: string;
  waIdCanonical: string | null;
  channel: string | null;
  status: string;
  phone: string | null;
  name: string | null;
  updatedAt: Date;
};

type ConversationRow = {
  waId: string;
  waIdCanonical: string | null;
  channel: string | null;
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
  updatedAt: Date;
};

export type PublicContactsQuery = {
  phone?: string | null;
  name?: string | null;
  updatedSince?: string | null;
  cursor?: string | null;
  limit?: string | number | null;
};

export function normalizePublicContactsLimit(value: string | number | null | undefined) {
  if (value === null || value === undefined) return DEFAULT_LIMIT;
  if (typeof value === "string" && !value.trim()) return DEFAULT_LIMIT;
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_LIMIT);
}

export function encodePublicContactsCursor(updatedAt: Date, id: string) {
  return Buffer.from(JSON.stringify({ updatedAt: updatedAt.toISOString(), id }), "utf8").toString("base64url");
}

export function decodePublicContactsCursor(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      updatedAt?: unknown;
      id?: unknown;
    };
    const updatedAt = typeof parsed.updatedAt === "string" ? new Date(parsed.updatedAt) : null;
    const id = typeof parsed.id === "string" ? parsed.id : "";
    if (!updatedAt || Number.isNaN(updatedAt.getTime()) || !id) return null;
    return { updatedAt, id };
  } catch {
    return null;
  }
}

export function normalizePublicUpdatedSince(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function onlyDigits(value: string | null | undefined) {
  return String(value ?? "").replace(/\D+/g, "");
}

export function maskPublicPhone(value: string | null | undefined) {
  const digits = onlyDigits(value);
  if (!digits) return null;
  if (digits.length <= 6) return digits;
  return `${digits.slice(0, 4)}****${digits.slice(-4)}`;
}

function getLastConversationAt(conversation?: ConversationRow | null) {
  if (!conversation) return null;
  const candidates = [conversation.lastInboundAt, conversation.lastOutboundAt, conversation.updatedAt].filter(
    Boolean
  ) as Date[];
  return candidates.sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
}

function contactLookupKeys(contact: PublicContactRow) {
  const keys = new Set<string>();
  keys.add(contact.waId);
  const digits = onlyDigits(contact.waId);
  if (digits) keys.add(digits);
  return Array.from(keys);
}

function pickLead(contact: PublicContactRow, leadsByWaId: Map<string, LeadRow>) {
  for (const key of contactLookupKeys(contact)) {
    const lead = leadsByWaId.get(key);
    if (lead) return lead;
  }
  return null;
}

function pickConversation(contact: PublicContactRow, conversationsByWaId: Map<string, ConversationRow>) {
  for (const key of contactLookupKeys(contact)) {
    const conversation = conversationsByWaId.get(key);
    if (conversation) return conversation;
  }
  return null;
}

export function serializePublicContact(
  contact: PublicContactRow,
  options: {
    lead?: LeadRow | null;
    conversation?: ConversationRow | null;
  } = {}
) {
  const lead = options.lead ?? null;
  const lastConversationAt = getLastConversationAt(options.conversation ?? null);
  const channel = contact.channel ?? lead?.channel ?? options.conversation?.channel ?? "whatsapp";
  return {
    id: contact.id,
    name: lead?.name ?? contact.name ?? null,
    phone: maskPublicPhone(lead?.phone ?? contact.waId),
    channel,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
    lastConversationAt: lastConversationAt?.toISOString() ?? null,
    leadStatus: lead?.status ?? null,
    tags: [] as string[],
  };
}

export async function listPublicContacts(params: {
  prisma: PrismaClient;
  clientId: string;
  query: PublicContactsQuery;
}) {
  const limit = normalizePublicContactsLimit(params.query.limit);
  const cursor = decodePublicContactsCursor(params.query.cursor);
  const updatedSince = normalizePublicUpdatedSince(params.query.updatedSince);
  const phoneDigits = onlyDigits(params.query.phone);
  const name = String(params.query.name ?? "").trim();
  const take = limit + 1;
  const where: Record<string, unknown> = {
    clientId: params.clientId,
    lifecycle: CONTACT_LIFECYCLE_ACTIVE,
    ...(updatedSince ? { updatedAt: { gte: updatedSince } } : {}),
    ...(phoneDigits ? { waId: { contains: phoneDigits } } : {}),
    ...(name ? { name: { contains: name, mode: "insensitive" } } : {}),
    ...(cursor
      ? {
          OR: [
            { updatedAt: { lt: cursor.updatedAt } },
            { updatedAt: cursor.updatedAt, id: { lt: cursor.id } },
          ],
        }
      : {}),
  };

  const contacts = await params.prisma.contact.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take,
    select: {
      id: true,
      clientId: true,
      waId: true,
      name: true,
      channel: true,
      provider: true,
      channelAccountId: true,
      externalUserHash: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const pageContacts = contacts.slice(0, limit);
  const lookupKeys = Array.from(new Set(pageContacts.flatMap(contactLookupKeys)));
  const [leads, conversations] = await Promise.all([
    lookupKeys.length
      ? params.prisma.lead.findMany({
          where: {
            tenantId: params.clientId,
            OR: [{ waId: { in: lookupKeys } }, { waIdCanonical: { in: lookupKeys } }],
          },
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
            waId: true,
            waIdCanonical: true,
            channel: true,
            status: true,
            phone: true,
            name: true,
            updatedAt: true,
          },
        })
      : Promise.resolve([]),
    lookupKeys.length
        ? params.prisma.conversation.findMany({
          where: {
            clientId: params.clientId,
            deletedAt: null,
            anonymizedAt: null,
            OR: [{ waId: { in: lookupKeys } }, { waIdCanonical: { in: lookupKeys } }],
          },
          orderBy: [{ updatedAt: "desc" }],
          select: {
            waId: true,
            waIdCanonical: true,
            channel: true,
            lastInboundAt: true,
            lastOutboundAt: true,
            updatedAt: true,
          },
        })
      : Promise.resolve([]),
  ]);
  const leadsByWaId = new Map<string, LeadRow>();
  for (const lead of leads) {
    leadsByWaId.set(lead.waId, lead);
    if (lead.waIdCanonical) leadsByWaId.set(lead.waIdCanonical, lead);
  }
  const conversationsByWaId = new Map<string, ConversationRow>();
  for (const conversation of conversations) {
    conversationsByWaId.set(conversation.waId, conversation);
    if (conversation.waIdCanonical) conversationsByWaId.set(conversation.waIdCanonical, conversation);
  }

  const nextCursorSource = contacts.length > limit ? pageContacts[pageContacts.length - 1] : null;
  return {
    data: pageContacts.map((contact) =>
      serializePublicContact(contact, {
        lead: pickLead(contact, leadsByWaId),
        conversation: pickConversation(contact, conversationsByWaId),
      })
    ),
    page: {
      nextCursor: nextCursorSource
        ? encodePublicContactsCursor(nextCursorSource.updatedAt, nextCursorSource.id)
        : null,
      hasMore: contacts.length > limit,
      limit,
    },
  };
}

export async function getPublicContact(params: {
  prisma: PrismaClient;
  clientId: string;
  contactId: string;
}) {
  const contact = await params.prisma.contact.findFirst({
    where: {
      id: params.contactId,
      clientId: params.clientId,
      lifecycle: CONTACT_LIFECYCLE_ACTIVE,
    },
    select: {
      id: true,
      clientId: true,
      waId: true,
      name: true,
      channel: true,
      provider: true,
      channelAccountId: true,
      externalUserHash: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!contact) return null;
  const lookupKeys = contactLookupKeys(contact);
  const [leads, conversations] = await Promise.all([
    params.prisma.lead.findMany({
      where: {
        tenantId: params.clientId,
        OR: [{ waId: { in: lookupKeys } }, { waIdCanonical: { in: lookupKeys } }],
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: 1,
      select: {
        id: true,
        waId: true,
        waIdCanonical: true,
        channel: true,
        status: true,
        phone: true,
        name: true,
        updatedAt: true,
      },
    }),
    params.prisma.conversation.findMany({
      where: {
        clientId: params.clientId,
        deletedAt: null,
        anonymizedAt: null,
        OR: [{ waId: { in: lookupKeys } }, { waIdCanonical: { in: lookupKeys } }],
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 1,
      select: {
        waId: true,
        waIdCanonical: true,
        channel: true,
        lastInboundAt: true,
        lastOutboundAt: true,
        updatedAt: true,
      },
    }),
  ]);
  return serializePublicContact(contact, {
    lead: leads[0] ?? null,
    conversation: conversations[0] ?? null,
  });
}
