import assert from "node:assert/strict";
import test from "node:test";
import { MessageStatus, MessageType } from "@prisma/client";
import { setPrismaForTesting } from "../db.js";
import { persistConversationWindow, persistInboundMessage, persistOutboundMessage } from "./persist.js";

type ConversationRecord = {
  id: string;
  clientId: string;
  waId: string;
  deletedAt: Date | null;
  anonymizedAt: Date | null;
  closedAt: Date | null;
  departmentId: string | null;
};

const state = {
  conversation: null as ConversationRecord | null,
  events: [] as Array<Record<string, unknown>>,
  inboundMessages: [] as Array<Record<string, unknown>>,
  outboundMessages: [] as Array<Record<string, unknown>>,
  conversationUpserts: [] as Array<Record<string, unknown>>,
};

function resetState(conversation: ConversationRecord | null) {
  state.conversation = conversation;
  state.events = [];
  state.inboundMessages = [];
  state.outboundMessages = [];
  state.conversationUpserts = [];
}

const fakePrisma = {
  conversation: {
    findUnique: async ({ where }: { where: { clientId_waId: { clientId: string; waId: string } } }) => {
      if (
        state.conversation?.clientId === where.clientId_waId.clientId &&
        state.conversation?.waId === where.clientId_waId.waId
      ) {
        return state.conversation;
      }
      return null;
    },
    upsert: async (args: Record<string, unknown>) => {
      state.conversationUpserts.push(args);
      return { id: state.conversation?.id ?? "conversation_created" };
    },
  },
  inboundMessage: {
    findUnique: async () => null,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      state.inboundMessages.push(data);
      return { id: "inbound_1" };
    },
  },
  outboundMessage: {
    findUnique: async ({ where }: { where: { clientId_messageId: { clientId: string; messageId: string } } }) =>
      state.outboundMessages.find(
        (item) =>
          item.clientId === where.clientId_messageId.clientId &&
          item.messageId === where.clientId_messageId.messageId
      ) ?? null,
    create: async ({ data, select }: { data: Record<string, unknown>; select?: Record<string, unknown> }) => {
      const row = { id: `outbound_${state.outboundMessages.length + 1}`, ...data };
      state.outboundMessages.push(row);
      return select?.id ? { id: row.id } : row;
    },
    update: async ({ where, data, select }: {
      where: { clientId_messageId: { clientId: string; messageId: string } };
      data: Record<string, unknown>;
      select?: Record<string, unknown>;
    }) => {
      const index = state.outboundMessages.findIndex(
        (item) =>
          item.clientId === where.clientId_messageId.clientId &&
          item.messageId === where.clientId_messageId.messageId
      );
      if (index >= 0) state.outboundMessages[index] = { ...state.outboundMessages[index], ...data };
      const row = index >= 0 ? state.outboundMessages[index] : null;
      return select?.id ? { id: row?.id ?? "outbound_0" } : row;
    },
  },
  event: {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      state.events.push(data);
      return { id: "event_1" };
    },
  },
};

setPrismaForTesting(fakePrisma as never);

test("persistInboundMessage blocks WhatsApp anonymized identity rehydration", async () => {
  resetState({
    id: "conversation_anonymized",
    clientId: "client_1",
    waId: "5584999997784",
    deletedAt: new Date("2026-07-01T10:00:00.000Z"),
    anonymizedAt: new Date("2026-07-01T10:01:00.000Z"),
    closedAt: new Date("2026-07-01T10:00:00.000Z"),
    departmentId: null,
  });

  const inserted = await persistInboundMessage({
    clientId: "client_1",
    phoneNumberId: "phone_number_1",
    waId: "5584999997784",
    messageId: "wamid.anonymized.1",
    type: MessageType.TEXT,
    bodyText: "Meu nome e Ana",
    allowlistHit: true,
    requestId: "req_whatsapp_anonymized",
    rawPayload: { message: "Meu nome e Ana", token: "secret" },
  });

  assert.equal(inserted, false);
  assert.equal(state.inboundMessages.length, 0);
  assert.equal(state.events[0]?.eventName, "inbound.anonymized_identity_seen");
  const serializedEvent = JSON.stringify(state.events[0]);
  assert.equal(serializedEvent.includes("5584999997784"), false);
  assert.equal(serializedEvent.includes("Meu nome e Ana"), false);
  assert.equal(serializedEvent.includes("secret"), false);
});

test("persistOutboundMessage preserves service cycle snapshot when updating existing payload", async () => {
  resetState(null);
  state.outboundMessages.push({
    id: "outbound_existing",
    clientId: "client_1",
    messageId: "web.session.send.req_1",
    rawPayload: {
      source: "bot",
      provider: "web_session",
      serviceCycle: {
        protocol: "CVT-AAA",
        cycleId: "cycle_a",
        issuedAt: "2026-08-18T12:00:00.000Z",
      },
    },
  });

  const inserted = await persistOutboundMessage({
    clientId: "client_1",
    channel: "whatsapp",
    provider: "web_session",
    channelAccountId: "web-session-default",
    externalMessageId: "worker_2",
    waId: "5584999997784",
    waIdCanonical: "5584999997784",
    messageId: "web.session.send.req_1",
    type: MessageType.TEXT,
    status: MessageStatus.SENT,
    bodyText: "Atualizado",
    requestId: "req_1",
    metaMessageId: null,
    rawPayload: {
      source: "bot",
      provider: "web_session",
      externalMessageId: "worker_2",
      webSessionStatus: {
        lastStatus: "sent",
      },
    },
  });

  assert.equal(inserted, false);
  const rawPayload = state.outboundMessages[0]?.rawPayload as Record<string, unknown>;
  const serviceCycle = rawPayload.serviceCycle as Record<string, unknown>;
  assert.equal(serviceCycle.protocol, "CVT-AAA");
  assert.equal(serviceCycle.cycleId, "cycle_a");
  assert.deepEqual(rawPayload.webSessionStatus, { lastStatus: "sent" });
});

test("persistConversationWindow does not reactivate anonymized WhatsApp conversation", async () => {
  const deletedAt = new Date("2026-07-01T10:00:00.000Z");
  const anonymizedAt = new Date("2026-07-01T10:01:00.000Z");
  resetState({
    id: "conversation_anonymized",
    clientId: "client_1",
    waId: "5584999997784",
    deletedAt,
    anonymizedAt,
    closedAt: deletedAt,
    departmentId: "department_1",
  });

  await persistConversationWindow({
    clientId: "client_1",
    phoneNumberId: "phone_number_1",
    waId: "5584999997784",
    windowIsOpen: true,
    lastInboundAt: new Date("2026-07-02T10:00:00.000Z"),
    requestId: "req_whatsapp_window_anonymized",
  });

  assert.equal(state.conversationUpserts.length, 0);
  assert.equal(state.conversation?.deletedAt, deletedAt);
  assert.equal(state.conversation?.anonymizedAt, anonymizedAt);
  assert.equal(state.events[0]?.eventName, "inbound.anonymized_identity_seen");
});
