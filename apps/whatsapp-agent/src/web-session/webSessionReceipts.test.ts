import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeBaileysReceiptStatus,
  recordWebSessionOutboundReceipt,
  shouldApplyWebSessionReceiptStatus,
} from "./webSessionReceipts.js";

const state = {
  outboundMessages: [] as Array<Record<string, unknown>>,
  events: [] as Array<Record<string, unknown>>,
};

function resetState() {
  state.outboundMessages = [];
  state.events = [];
}

function fakePrisma() {
  return {
    outboundMessage: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        state.outboundMessages.find((item) =>
          item.clientId === where.clientId &&
          item.channel === where.channel &&
          item.provider === where.provider &&
          item.channelAccountId === where.channelAccountId &&
          item.externalMessageId === where.externalMessageId
        ) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const index = state.outboundMessages.findIndex((item) => item.id === where.id);
        if (index >= 0) state.outboundMessages[index] = { ...state.outboundMessages[index], ...data };
        return state.outboundMessages[index] ?? null;
      },
    },
    event: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.events.push(data);
        return { id: `event_${state.events.length}` };
      },
    },
  };
}

test("normalizeBaileysReceiptStatus maps Baileys status values", () => {
  assert.equal(normalizeBaileysReceiptStatus(0), "failed");
  assert.equal(normalizeBaileysReceiptStatus(2), "sent");
  assert.equal(normalizeBaileysReceiptStatus(3), "delivered");
  assert.equal(normalizeBaileysReceiptStatus(4), "read");
  assert.equal(normalizeBaileysReceiptStatus(5), "read");
  assert.equal(normalizeBaileysReceiptStatus("server_ack"), "sent");
  assert.equal(normalizeBaileysReceiptStatus("delivery_ack"), "delivered");
  assert.equal(normalizeBaileysReceiptStatus("read-self"), "read");
  assert.equal(normalizeBaileysReceiptStatus("3"), "delivered");
  assert.equal(normalizeBaileysReceiptStatus("unknown"), null);
});

test("shouldApplyWebSessionReceiptStatus preserves monotonic status progression", () => {
  assert.equal(shouldApplyWebSessionReceiptStatus(null, "sent"), true);
  assert.equal(shouldApplyWebSessionReceiptStatus("sent", "delivered"), true);
  assert.equal(shouldApplyWebSessionReceiptStatus("delivered", "read"), true);
  assert.equal(shouldApplyWebSessionReceiptStatus("read", "delivered"), false);
  assert.equal(shouldApplyWebSessionReceiptStatus("failed", "read"), false);
});

test("recordWebSessionOutboundReceipt updates tenant-scoped Web Session outbound only", async () => {
  resetState();
  state.outboundMessages.push(
    {
      id: "outbound_1",
      clientId: "client_a",
      channel: "whatsapp",
      provider: "web_session",
      channelAccountId: "session_a",
      externalMessageId: "EXT_1",
      messageId: "message_1",
      waId: "5584999997784",
      waIdCanonical: "55849999997784",
      rawPayload: { source: "inbox_text" },
    },
    {
      id: "outbound_2",
      clientId: "client_b",
      channel: "whatsapp",
      provider: "web_session",
      channelAccountId: "session_b",
      externalMessageId: "EXT_1",
      messageId: "message_2",
      waId: "5584999990000",
      waIdCanonical: "55849999990000",
      rawPayload: { source: "inbox_text" },
    }
  );

  const result = await recordWebSessionOutboundReceipt({
    prisma: fakePrisma() as never,
    clientId: "client_a",
    channelAccountId: "session_a",
    externalMessageId: "EXT_1",
    status: "delivered",
    observedAt: "2026-08-12T12:00:00.000Z",
    requestId: "receipt_1",
  });

  assert.equal(result.updated, true);
  assert.equal(result.messageId, "message_1");
  assert.equal(result.externalMessageId, "EXT_1");
  assert.equal(result.waId, "5584999997784");
  assert.equal(result.waIdCanonical, "55849999997784");
  assert.equal(result.status, "delivered");
  assert.equal(result.updatedAt, "2026-08-12T12:00:00.000Z");
  assert.deepEqual((state.outboundMessages[0]?.rawPayload as Record<string, unknown>).webSessionStatus, {
    lastStatus: "delivered",
    lastStatusAt: "2026-08-12T12:00:00.000Z",
    externalMessageIdPresent: true,
  });
  assert.equal((state.outboundMessages[1]?.rawPayload as Record<string, unknown>).webSessionStatus, undefined);
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0]?.eventName, "whatsapp.web_session.receipt.updated");
  const payload = state.events[0]?.payloadJson as Record<string, unknown>;
  assert.equal(payload.waIdLast4, "7784");
  assert.equal(JSON.stringify(payload).includes("5584999997784"), false);

  const stale = await recordWebSessionOutboundReceipt({
    prisma: fakePrisma() as never,
    clientId: "client_a",
    channelAccountId: "session_a",
    externalMessageId: "EXT_1",
    status: "sent",
    requestId: "receipt_2",
  });

  assert.equal(stale.updated, false);
  assert.equal(stale.reason, "stale_status");
});
