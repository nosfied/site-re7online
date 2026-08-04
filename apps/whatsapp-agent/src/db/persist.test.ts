import assert from "node:assert/strict";
import test from "node:test";
import { MessageType } from "@prisma/client";
import { setPrismaForTesting } from "../db.js";
import { persistConversationWindow, persistInboundMessage } from "./persist.js";

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
  conversationUpserts: [] as Array<Record<string, unknown>>,
};

function resetState(conversation: ConversationRecord | null) {
  state.conversation = conversation;
  state.events = [];
  state.inboundMessages = [];
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
