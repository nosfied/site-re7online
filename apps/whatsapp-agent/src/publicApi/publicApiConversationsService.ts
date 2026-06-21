import type { PrismaClient } from "@prisma/client";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

type ConversationRow = {
  id: string;
  clientId: string;
  departmentId: string | null;
  waId: string;
  waIdCanonical: string | null;
  channel: string | null;
  windowIsOpen: boolean;
  firstAssignedAt: Date | null;
  firstResponseAt: Date | null;
  lastResponseAt: Date | null;
  closedAt: Date | null;
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  department: {
    id: string;
    name: string;
    slug: string;
  } | null;
  metrics: {
    firstResponseTimeSec: number | null;
    avgResponseTimeSec: number | null;
    resolutionTimeSec: number | null;
    totalMessages: number;
    totalAgentMessages: number;
    responseCount: number;
    startedAt: Date;
    closedAt: Date | null;
  } | null;
};

type RuntimeStateRow = {
  waId: string;
  waIdCanonical: string | null;
  channel: string | null;
  assignedUserId: string | null;
  departmentId: string | null;
  status: string | null;
  mode: string | null;
  handoffStatus: string;
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
  closedAt: Date | null;
};

type ContactRow = {
  id: string;
  waId: string;
};

type UserRow = {
  id: string;
  name: string;
};

export type PublicConversationsQuery = {
  channel?: string | null;
  status?: string | null;
  updatedSince?: string | null;
  cursor?: string | null;
  limit?: string | number | null;
};

export function normalizePublicConversationsLimit(value: string | number | null | undefined) {
  if (value === null || value === undefined) return DEFAULT_LIMIT;
  if (typeof value === "string" && !value.trim()) return DEFAULT_LIMIT;
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_LIMIT);
}

export function encodePublicConversationsCursor(updatedAt: Date, id: string) {
  return Buffer.from(JSON.stringify({ updatedAt: updatedAt.toISOString(), id }), "utf8").toString("base64url");
}

export function decodePublicConversationsCursor(value: string | null | undefined) {
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

function normalizeDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeFilterText(value: string | null | undefined, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength) || null;
}

function lookupKeys(conversation: ConversationRow) {
  const keys = new Set<string>();
  keys.add(conversation.waId);
  if (conversation.waIdCanonical) keys.add(conversation.waIdCanonical);
  return Array.from(keys);
}

function buildLookupMap<T extends { waId: string; waIdCanonical?: string | null }>(items: T[]) {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(item.waId, item);
    if (item.waIdCanonical) map.set(item.waIdCanonical, item);
  }
  return map;
}

function pickByWaId<T extends { waId: string; waIdCanonical?: string | null }>(
  conversation: ConversationRow,
  map: Map<string, T>
) {
  for (const key of lookupKeys(conversation)) {
    const item = map.get(key);
    if (item) return item;
  }
  return null;
}

function statusFromConversation(conversation: ConversationRow, runtime: RuntimeStateRow | null) {
  if (runtime?.status) return runtime.status;
  if (conversation.closedAt) return "CLOSED";
  if (conversation.windowIsOpen) return "WAITING";
  return "WAITING_USER";
}

function serializePublicConversation(
  conversation: ConversationRow,
  options: {
    runtime?: RuntimeStateRow | null;
    contact?: ContactRow | null;
    assignedUser?: UserRow | null;
  } = {}
) {
  const runtime = options.runtime ?? null;
  const metrics = conversation.metrics;
  return {
    id: conversation.id,
    status: statusFromConversation(conversation, runtime),
    channel: conversation.channel ?? runtime?.channel ?? "whatsapp",
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    contactId: options.contact?.id ?? null,
    assignedUser: options.assignedUser
      ? {
          id: options.assignedUser.id,
          name: options.assignedUser.name,
        }
      : null,
    department: conversation.department
      ? {
          id: conversation.department.id,
          name: conversation.department.name,
          slug: conversation.department.slug,
        }
      : null,
    metrics: metrics
      ? {
          firstResponseTimeSec: metrics.firstResponseTimeSec,
          avgResponseTimeSec: metrics.avgResponseTimeSec,
          resolutionTimeSec: metrics.resolutionTimeSec,
          totalMessages: metrics.totalMessages,
          totalAgentMessages: metrics.totalAgentMessages,
          responseCount: metrics.responseCount,
          startedAt: metrics.startedAt.toISOString(),
          closedAt: metrics.closedAt?.toISOString() ?? null,
        }
      : null,
    lastActivityAt:
      conversation.lastInboundAt?.toISOString() ??
      conversation.lastOutboundAt?.toISOString() ??
      runtime?.lastInboundAt?.toISOString() ??
      runtime?.lastOutboundAt?.toISOString() ??
      conversation.updatedAt.toISOString(),
  };
}

async function loadConversationRelated(params: {
  prisma: PrismaClient;
  clientId: string;
  conversations: ConversationRow[];
}) {
  const lookup = Array.from(new Set(params.conversations.flatMap(lookupKeys)));
  const [runtimeStates, contacts] = await Promise.all([
    lookup.length
      ? params.prisma.conversationRuntimeState.findMany({
          where: {
            clientId: params.clientId,
            OR: [{ waId: { in: lookup } }, { waIdCanonical: { in: lookup } }],
          },
          select: {
            waId: true,
            waIdCanonical: true,
            channel: true,
            assignedUserId: true,
            departmentId: true,
            status: true,
            mode: true,
            handoffStatus: true,
            lastInboundAt: true,
            lastOutboundAt: true,
            closedAt: true,
          },
        })
      : Promise.resolve([]),
    lookup.length
      ? params.prisma.contact.findMany({
          where: {
            clientId: params.clientId,
            waId: { in: lookup },
          },
          select: { id: true, waId: true },
        })
      : Promise.resolve([]),
  ]);
  const runtimeByWaId = buildLookupMap(runtimeStates);
  const contactsByWaId = new Map(contacts.map((contact) => [contact.waId, contact]));
  const assignedUserIds = Array.from(
    new Set(runtimeStates.map((item) => item.assignedUserId).filter(Boolean) as string[])
  );
  const users = assignedUserIds.length
    ? await params.prisma.user.findMany({
        where: { clientId: params.clientId, id: { in: assignedUserIds } },
        select: { id: true, name: true },
      })
    : [];
  const usersById = new Map(users.map((user) => [user.id, user]));
  return { runtimeByWaId, contactsByWaId, usersById };
}

export async function listPublicConversations(params: {
  prisma: PrismaClient;
  clientId: string;
  query: PublicConversationsQuery;
}) {
  const limit = normalizePublicConversationsLimit(params.query.limit);
  const cursor = decodePublicConversationsCursor(params.query.cursor);
  const updatedSince = normalizeDate(params.query.updatedSince);
  const channel = normalizeFilterText(params.query.channel, 40);
  const status = normalizeFilterText(params.query.status, 40);
  const take = limit + 1;
  const conversations = await params.prisma.conversation.findMany({
    where: {
      clientId: params.clientId,
      deletedAt: null,
      ...(updatedSince ? { updatedAt: { gte: updatedSince } } : {}),
      ...(channel ? { channel } : {}),
      ...(cursor
        ? {
            OR: [
              { updatedAt: { lt: cursor.updatedAt } },
              { updatedAt: cursor.updatedAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take,
    select: {
      id: true,
      clientId: true,
      departmentId: true,
      waId: true,
      waIdCanonical: true,
      channel: true,
      windowIsOpen: true,
      firstAssignedAt: true,
      firstResponseAt: true,
      lastResponseAt: true,
      closedAt: true,
      lastInboundAt: true,
      lastOutboundAt: true,
      createdAt: true,
      updatedAt: true,
      department: { select: { id: true, name: true, slug: true } },
      metrics: {
        select: {
          firstResponseTimeSec: true,
          avgResponseTimeSec: true,
          resolutionTimeSec: true,
          totalMessages: true,
          totalAgentMessages: true,
          responseCount: true,
          startedAt: true,
          closedAt: true,
        },
      },
    },
  });

  const pageConversations = conversations.slice(0, limit);
  const related = await loadConversationRelated({
    prisma: params.prisma,
    clientId: params.clientId,
    conversations: pageConversations,
  });
  const serialized = pageConversations
    .map((conversation) => {
      const runtime = pickByWaId(conversation, related.runtimeByWaId);
      return {
        conversation,
        runtime,
        data: serializePublicConversation(conversation, {
          runtime,
          contact: related.contactsByWaId.get(conversation.waId) ?? null,
          assignedUser: runtime?.assignedUserId ? related.usersById.get(runtime.assignedUserId) ?? null : null,
        }),
      };
    })
    .filter((item) => !status || item.data.status === status);
  const nextCursorSource = conversations.length > limit ? pageConversations[pageConversations.length - 1] : null;
  return {
    data: serialized.map((item) => item.data),
    page: {
      nextCursor: nextCursorSource
        ? encodePublicConversationsCursor(nextCursorSource.updatedAt, nextCursorSource.id)
        : null,
      hasMore: conversations.length > limit,
      limit,
    },
  };
}

export async function getPublicConversation(params: {
  prisma: PrismaClient;
  clientId: string;
  conversationId: string;
}) {
  const conversation = await params.prisma.conversation.findFirst({
    where: {
      id: params.conversationId,
      clientId: params.clientId,
      deletedAt: null,
    },
    select: {
      id: true,
      clientId: true,
      departmentId: true,
      waId: true,
      waIdCanonical: true,
      channel: true,
      windowIsOpen: true,
      firstAssignedAt: true,
      firstResponseAt: true,
      lastResponseAt: true,
      closedAt: true,
      lastInboundAt: true,
      lastOutboundAt: true,
      createdAt: true,
      updatedAt: true,
      department: { select: { id: true, name: true, slug: true } },
      metrics: {
        select: {
          firstResponseTimeSec: true,
          avgResponseTimeSec: true,
          resolutionTimeSec: true,
          totalMessages: true,
          totalAgentMessages: true,
          responseCount: true,
          startedAt: true,
          closedAt: true,
        },
      },
    },
  });
  if (!conversation) return null;
  const related = await loadConversationRelated({
    prisma: params.prisma,
    clientId: params.clientId,
    conversations: [conversation],
  });
  const runtime = pickByWaId(conversation, related.runtimeByWaId);
  return serializePublicConversation(conversation, {
    runtime,
    contact: related.contactsByWaId.get(conversation.waId) ?? null,
    assignedUser: runtime?.assignedUserId ? related.usersById.get(runtime.assignedUserId) ?? null : null,
  });
}
