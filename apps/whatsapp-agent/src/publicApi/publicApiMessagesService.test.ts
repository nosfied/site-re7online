import test from "node:test";
import assert from "node:assert/strict";
import {
  decodePublicMessagesCursor,
  encodePublicMessagesCursor,
  listPublicConversationMessages,
  normalizePublicMessagesLimit,
} from "./publicApiMessagesService.js";

const now = new Date("2026-06-21T12:00:00.000Z");

test("normalizePublicMessagesLimit clamps public limits", () => {
  assert.equal(normalizePublicMessagesLimit(null), 50);
  assert.equal(normalizePublicMessagesLimit("0"), 1);
  assert.equal(normalizePublicMessagesLimit("200"), 100);
  assert.equal(normalizePublicMessagesLimit("abc"), 50);
});

test("public messages cursor roundtrips", () => {
  const encoded = encodePublicMessagesCursor(now, "message_1");
  assert.deepEqual(decodePublicMessagesCursor(encoded), { createdAt: now, id: "message_1" });
  assert.equal(decodePublicMessagesCursor("invalid"), null);
});

test("listPublicConversationMessages requires tenant-owned conversation", async () => {
  const calls: Array<{ model: string; args: unknown }> = [];
  const prisma = {
    conversation: {
      findFirst: async (args: { where: { id: string; clientId: string } }) => {
        calls.push({ model: "conversation", args });
        return args.where.clientId === "client_a" && args.where.id === "conversation_a"
          ? { id: "conversation_a", clientId: "client_a", channel: "whatsapp" }
          : null;
      },
    },
    message: {
      findMany: async (args: unknown) => {
        calls.push({ model: "message", args });
        return [];
      },
    },
  };

  assert.equal(
    await listPublicConversationMessages({
      prisma: prisma as never,
      clientId: "client_a",
      conversationId: "conversation_b",
      query: {},
    }),
    null
  );
  assert.equal(calls.some((call) => call.model === "message"), false);
});

test("listPublicConversationMessages returns only safe normalized fields", async () => {
  const calls: Array<{ model: string; args: unknown }> = [];
  const prisma = {
    conversation: {
      findFirst: async (args: unknown) => {
        calls.push({ model: "conversation", args });
        return { id: "conversation_a", clientId: "client_a", channel: "instagram" };
      },
    },
    message: {
      findMany: async (args: unknown) => {
        calls.push({ model: "message", args });
        return [
          {
            id: "message_1",
            direction: "INBOUND",
            type: "TEXT",
            bodyText: "Ola",
            status: "RECEIVED",
            createdAt: now,
            waId: "558499999999",
            messageId: "provider_message",
            metaMessageId: "meta_message",
            requestId: "request_1",
          },
          {
            id: "message_2",
            direction: "OUTBOUND",
            type: "TEXT",
            bodyText: "Oi",
            status: "SENT",
            createdAt: new Date("2026-06-21T12:01:00.000Z"),
          },
        ];
      },
    },
  };

  const result = await listPublicConversationMessages({
    prisma: prisma as never,
    clientId: "client_a",
    conversationId: "conversation_a",
    query: { limit: "1" },
  });

  assert.equal(result?.data.length, 1);
  assert.equal(result?.data[0]?.id, "message_1");
  assert.equal(result?.data[0]?.channel, "instagram");
  assert.equal(result?.data[0]?.text, "Ola");
  assert.equal(result?.data[0]?.senderRole, "contact");
  assert.equal(result?.page.hasMore, true);
  assert.equal(typeof result?.page.nextCursor, "string");
  const data = result?.data[0] as Record<string, unknown>;
  assert.equal("waId" in data, false);
  assert.equal("messageId" in data, false);
  assert.equal("metaMessageId" in data, false);
  assert.equal("requestId" in data, false);
  assert.equal("rawPayload" in data, false);
  const conversationWhere = (calls[0]?.args as { where: { clientId?: string; deletedAt?: null } }).where;
  assert.equal(conversationWhere.clientId, "client_a");
  assert.equal(conversationWhere.deletedAt, null);
  const messageSelect = (calls[1]?.args as { select: Record<string, unknown> }).select;
  assert.equal(messageSelect.bodyText, true);
  assert.equal("waId" in messageSelect, false);
  assert.equal("messageId" in messageSelect, false);
  assert.equal("metaMessageId" in messageSelect, false);
  assert.equal("requestId" in messageSelect, false);
});
