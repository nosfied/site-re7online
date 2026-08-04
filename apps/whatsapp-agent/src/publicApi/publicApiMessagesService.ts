import type { PrismaClient } from "@prisma/client";
import { extractMessageLocation } from "../inbox/messageLocation.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

type ConversationRow = {
  id: string;
  clientId: string;
  channel: string | null;
  waId: string;
  waIdCanonical: string | null;
};

type MessageRow = {
  id: string;
  direction: string;
  channel: string | null;
  type: string;
  bodyText: string | null;
  rawPayload?: unknown;
  status: string;
  createdAt: Date;
  source: "inbound" | "outbound";
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
    channel: message.channel ?? conversation.channel ?? "whatsapp",
    type: message.type,
    text: message.bodyText,
    location: extractMessageLocation(message.rawPayload),
    createdAt: message.createdAt.toISOString(),
    status: message.status,
    senderRole: senderRoleFromDirection(message.direction),
  };
}

function conversationLookupKeys(conversation: ConversationRow) {
  const keys = new Set<string>();
  keys.add(conversation.waId);
  if (conversation.waIdCanonical) keys.add(conversation.waIdCanonical);
  return Array.from(keys).filter(Boolean);
}

function isAfterCursor(message: MessageRow, cursor: { createdAt: Date; id: string } | null) {
  if (!cursor) return true;
  const left = message.createdAt.getTime();
  const right = cursor.createdAt.getTime();
  if (left !== right) return left > right;
  return message.id > cursor.id;
}

function buildMessageWhere(clientId: string, lookupKeys: string[], cursor: { createdAt: Date; id: string } | null) {
  return {
    clientId,
    OR: [{ waId: { in: lookupKeys } }, { waIdCanonical: { in: lookupKeys } }],
    ...(cursor
      ? {
          AND: [
            {
              OR: [
                { createdAt: { gt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { gt: cursor.id } },
              ],
            },
          ],
        }
      : {}),
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
      anonymizedAt: null,
    },
    select: {
      id: true,
      clientId: true,
      channel: true,
      waId: true,
      waIdCanonical: true,
    },
  });
  if (!conversation) return null;

  const limit = normalizePublicMessagesLimit(params.query.limit);
  const cursor = decodePublicMessagesCursor(params.query.cursor);
  const lookupKeys = conversationLookupKeys(conversation);
  const take = limit + 1;
  const [inboundMessages, outboundMessages] = await Promise.all([
    lookupKeys.length
      ? params.prisma.inboundMessage.findMany({
          where: buildMessageWhere(params.clientId, lookupKeys, cursor),
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take,
          select: {
            id: true,
            channel: true,
            type: true,
            bodyText: true,
            rawPayload: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
    lookupKeys.length
      ? params.prisma.outboundMessage.findMany({
          where: buildMessageWhere(params.clientId, lookupKeys, cursor),
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take,
          select: {
            id: true,
            channel: true,
            type: true,
            bodyText: true,
            rawPayload: true,
            status: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
  ]);
  const messages: MessageRow[] = [
    ...inboundMessages.map((message) => ({
      ...message,
      direction: "INBOUND",
      status: "RECEIVED",
      source: "inbound" as const,
    })),
    ...outboundMessages.map((message) => ({
      ...message,
      direction: "OUTBOUND",
      source: "outbound" as const,
    })),
  ]
    .filter((message) => isAfterCursor(message, cursor))
    .sort((left, right) => {
      const leftTime = left.createdAt.getTime();
      const rightTime = right.createdAt.getTime();
      if (leftTime !== rightTime) return leftTime - rightTime;
      return left.id.localeCompare(right.id);
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
