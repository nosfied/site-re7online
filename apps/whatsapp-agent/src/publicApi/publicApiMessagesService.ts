import type { PrismaClient } from "@prisma/client";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

type ConversationRow = {
  id: string;
  clientId: string;
  channel: string | null;
};

type MessageRow = {
  id: string;
  direction: string;
  type: string;
  bodyText: string | null;
  status: string;
  createdAt: Date;
};

export type PublicMessagesQuery = {
  cursor?: string | null;
  limit?: string | number | null;
};

export function normalizePublicMessagesLimit(value: string | number | null | undefined) {
  if (value === null || value === undefined) return DEFAULT_LIMIT;
  if (typeof value === "string" && !value.trim()) return DEFAULT_LIMIT;
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_LIMIT);
}

export function encodePublicMessagesCursor(createdAt: Date, id: string) {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id }), "utf8").toString("base64url");
}

export function decodePublicMessagesCursor(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      createdAt?: unknown;
      id?: unknown;
    };
    const createdAt = typeof parsed.createdAt === "string" ? new Date(parsed.createdAt) : null;
    const id = typeof parsed.id === "string" ? parsed.id : "";
    if (!createdAt || Number.isNaN(createdAt.getTime()) || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

function senderRoleFromDirection(direction: string) {
  if (direction === "INBOUND") return "contact";
  if (direction === "OUTBOUND") return "agent";
  return "system";
}

function serializePublicMessage(message: MessageRow, conversation: ConversationRow) {
  return {
    id: message.id,
    direction: message.direction,
    channel: conversation.channel ?? "whatsapp",
    type: message.type,
    text: message.bodyText,
    createdAt: message.createdAt.toISOString(),
    status: message.status,
    senderRole: senderRoleFromDirection(message.direction),
  };
}

export async function listPublicConversationMessages(params: {
  prisma: PrismaClient;
  clientId: string;
  conversationId: string;
  query: PublicMessagesQuery;
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
      channel: true,
    },
  });
  if (!conversation) return null;

  const limit = normalizePublicMessagesLimit(params.query.limit);
  const cursor = decodePublicMessagesCursor(params.query.cursor);
  const take = limit + 1;
  const messages = await params.prisma.message.findMany({
    where: {
      conversationId: conversation.id,
      ...(cursor
        ? {
            OR: [
              { createdAt: { gt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { gt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take,
    select: {
      id: true,
      direction: true,
      type: true,
      bodyText: true,
      status: true,
      createdAt: true,
    },
  });
  const pageMessages = messages.slice(0, limit);
  const nextCursorSource = messages.length > limit ? pageMessages[pageMessages.length - 1] : null;
  return {
    data: pageMessages.map((message) => serializePublicMessage(message, conversation)),
    page: {
      nextCursor: nextCursorSource
        ? encodePublicMessagesCursor(nextCursorSource.createdAt, nextCursorSource.id)
        : null,
      hasMore: messages.length > limit,
      limit,
    },
  };
}
