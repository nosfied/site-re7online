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
          ? {
              id: "conversation_a",
              clientId: "client_a",
              channel: "whatsapp",
              waId: "558499999999",
              waIdCanonical: "558499999999",
            }
          : null;
      },
    },
    inboundMessage: {
      findMany: async (args: unknown) => {
        calls.push({ model: "inbound", args });
        return [];
      },
    },
    outboundMessage: {
      findMany: async (args: unknown) => {
        calls.push({ model: "outbound", args });
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
  assert.equal(calls.some((call) => call.model === "inbound" || call.model === "outbound"), false);
});

test("listPublicConversationMessages returns only safe normalized fields", async () => {
  const calls: Array<{ model: string; args: unknown }> = [];
  const prisma = {
    conversation: {
      findFirst: async (args: unknown) => {
        calls.push({ model: "conversation", args });
        return {
          id: "conversation_a",
          clientId: "client_a",
          channel: "instagram",
          waId: "ig_user_1",
          waIdCanonical: "ig_user_1",
        };
      },
    },
    inboundMessage: {
      findMany: async (args: unknown) => {
        calls.push({ model: "inbound", args });
        return [
          {
            id: "message_1",
            channel: null,
            type: "TEXT",
            bodyText: "Ola",
            rawPayload: {
              location: {
                latitude: -27.343,
                longitude: -51.61,
                name: "SIMAE Capinzal",
                address: "Capinzal, SC",
              },
            },
            createdAt: now,
            waId: "558499999999",
            messageId: "provider_message",
            metaMessageId: "meta_message",
            requestId: "request_1",
          },
        ];
      },
    },
    outboundMessage: {
      findMany: async (args: unknown) => {
        calls.push({ model: "outbound", args });
        return [
          {
            id: "message_2",
            channel: "instagram",
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
  assert.deepEqual(result?.data[0]?.location, {
    latitude: -27.343,
    longitude: -51.61,
    name: "SIMAE Capinzal",
    address: "Capinzal, SC",
    googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=-27.343%2C-51.61",
    openStreetMapUrl: "https://www.openstreetmap.org/?mlat=-27.343&mlon=-51.61#map=18/-27.343/-51.61",
  });
  assert.equal(result?.data[0]?.senderRole, "contact");
  assert.equal(result?.page.hasMore, true);
  assert.equal(typeof result?.page.nextCursor, "string");
  const data = result?.data[0] as Record<string, unknown>;
  assert.equal("waId" in data, false);
  assert.equal("messageId" in data, false);
  assert.equal("metaMessageId" in data, false);
  assert.equal("requestId" in data, false);
  assert.equal("rawPayload" in data, false);
  const conversationWhere = (calls[0]?.args as { where: { clientId?: string; deletedAt?: null; anonymizedAt?: null } }).where;
  assert.equal(conversationWhere.clientId, "client_a");
  assert.equal(conversationWhere.deletedAt, null);
  assert.equal(conversationWhere.anonymizedAt, null);
  const inboundArgs = calls.find((call) => call.model === "inbound")?.args as {
    where: { clientId?: string; OR?: unknown[] };
    select: Record<string, unknown>;
  };
  assert.equal(inboundArgs.where.clientId, "client_a");
  assert.equal(Array.isArray(inboundArgs.where.OR), true);
  assert.equal(inboundArgs.select.bodyText, true);
  assert.equal(inboundArgs.select.rawPayload, true);
  assert.equal("waId" in inboundArgs.select, false);
  assert.equal("messageId" in inboundArgs.select, false);
  assert.equal("metaMessageId" in inboundArgs.select, false);
  assert.equal("requestId" in inboundArgs.select, false);
});
