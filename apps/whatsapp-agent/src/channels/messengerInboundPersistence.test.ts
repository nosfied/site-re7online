import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMessengerSyntheticWaId,
  persistMessengerInboundEvent,
  resolveMessengerInboundPersistenceGate,
} from "./messengerInboundPersistence.js";
import { validateTenantChannelAccount } from "./tenantChannelAccount.js";

function createFakePrisma() {
  const client = { id: "client-1", clientKey: "tenant-a", status: "ACTIVE" };
  const inboundMessages = new Map<string, any>();
  const conversations = new Map<string, any>();
  const runtimeStates = new Map<string, any>();
  const contacts = new Map<string, any>();
  const leads = new Map<string, any>();

  return {
    state: { inboundMessages, conversations, runtimeStates, contacts, leads },
    client: {
      async findUnique(args: any) {
        return args.where.clientKey === client.clientKey ? client : null;
      },
    },
    inboundMessage: {
      async findUnique(args: any) {
        const key = `${args.where.clientId_messageId.clientId}:${args.where.clientId_messageId.messageId}`;
        const item = inboundMessages.get(key);
        return item ? { id: item.id } : null;
      },
      async create(args: any) {
        const item = { id: `inbound-${inboundMessages.size + 1}`, ...args.data };
        inboundMessages.set(`${item.clientId}:${item.messageId}`, item);
        return { id: item.id };
      },
    },
    conversation: {
      async upsert(args: any) {
        const key = `${args.where.clientId_waId.clientId}:${args.where.clientId_waId.waId}`;
        const current = conversations.get(key);
        const item = current
          ? { ...current, ...args.update }
          : { id: `conversation-${conversations.size + 1}`, ...args.create };
        conversations.set(key, item);
        return { id: item.id };
      },
    },
    conversationRuntimeState: {
      async upsert(args: any) {
        const key = `${args.where.clientId_waId.clientId}:${args.where.clientId_waId.waId}`;
        const current = runtimeStates.get(key);
        const item = current
          ? { ...current, ...args.update }
          : { id: `runtime-${runtimeStates.size + 1}`, ...args.create };
        runtimeStates.set(key, item);
        return { id: item.id };
      },
    },
    contact: {
      async upsert(args: any) {
        const key = `${args.where.clientId_waId.clientId}:${args.where.clientId_waId.waId}`;
        const current = contacts.get(key);
        const item = current
          ? { ...current, ...args.update }
          : { id: `contact-${contacts.size + 1}`, ...args.create };
        contacts.set(key, item);
        return { id: item.id };
      },
    },
    lead: {
      async upsert(args: any) {
        const key = `${args.where.tenantId_waId.tenantId}:${args.where.tenantId_waId.waId}`;
        const current = leads.get(key);
        const item = current
          ? { ...current, ...args.update }
          : { id: `lead-${leads.size + 1}`, ...args.create };
        leads.set(key, item);
        return { id: item.id };
      },
    },
  };
}

const enabledAccount = validateTenantChannelAccount({
  tenantKey: "tenant-a",
  channel: "messenger",
  provider: "meta",
  channelAccountId: "page-1",
  enabled: true,
  runtimeEnabled: true,
  inboundPersistenceEnabled: true,
  outboundEnabled: false,
  status: "connected",
});

test("resolveMessengerInboundPersistenceGate blocks unless inbound persistence is explicit", () => {
  const disabled = validateTenantChannelAccount({
    tenantKey: "tenant-a",
    channel: "messenger",
    provider: "meta",
    channelAccountId: "page-1",
    enabled: true,
    runtimeEnabled: true,
    status: "connected",
  });

  assert.deepEqual(resolveMessengerInboundPersistenceGate(disabled), {
    allowed: false,
    reason: "inbound_persistence_disabled",
  });
  assert.deepEqual(resolveMessengerInboundPersistenceGate(enabledAccount), {
    allowed: true,
    reason: "persisted",
  });
});

test("buildMessengerSyntheticWaId uses hash only", () => {
  const synthetic = buildMessengerSyntheticWaId("abcdef1234567890abcdef1234567890");
  assert.equal(synthetic, "messenger:abcdef1234567890abcdef1234567890");
  assert.equal(synthetic.includes("psid_user"), false);
});

test("persistMessengerInboundEvent persists Messenger inbound once and dedupes by mid", async () => {
  const prisma = createFakePrisma();
  const event = {
    tenantKey: "tenant-a",
    channel: "messenger" as const,
    provider: "meta" as const,
    channelAccountId: "page-1",
    externalUserId: "psid_user_001",
    externalMessageId: "mid-1",
    text: "olá",
    timestamp: "2026-05-16T10:00:00.000Z",
  };

  const first = await persistMessengerInboundEvent({
    prisma: prisma as any,
    event,
    tenantKey: "tenant-a",
    account: enabledAccount,
    requestId: "req-1",
  });
  const second = await persistMessengerInboundEvent({
    prisma: prisma as any,
    event,
    tenantKey: "tenant-a",
    account: enabledAccount,
    requestId: "req-2",
  });

  assert.equal(first.persisted, true);
  assert.equal(second.persisted, false);
  assert.equal(second.duplicate, true);
  assert.equal(prisma.state.inboundMessages.size, 1);

  const conversation = Array.from(prisma.state.conversations.values())[0];
  const runtime = Array.from(prisma.state.runtimeStates.values())[0];
  const inbound = Array.from(prisma.state.inboundMessages.values())[0];
  assert.equal(conversation.channel, "messenger");
  assert.equal(runtime.mode, "HUMAN");
  assert.equal(runtime.status, "WAITING");
  assert.equal(inbound.externalMessageId, "mid-1");
  assert.equal(JSON.stringify({ conversation, runtime, inbound }).includes("psid_user_001"), false);
});

test("persistMessengerInboundEvent does not persist when the account flag is off", async () => {
  const prisma = createFakePrisma();
  const account = validateTenantChannelAccount({
    tenantKey: "tenant-a",
    channel: "messenger",
    provider: "meta",
    channelAccountId: "page-1",
    enabled: true,
    runtimeEnabled: true,
    status: "connected",
  });
  const result = await persistMessengerInboundEvent({
    prisma: prisma as any,
    event: {
      tenantKey: "tenant-a",
      channel: "messenger",
      provider: "meta",
      channelAccountId: "page-1",
      externalUserId: "psid_user_001",
      externalMessageId: "mid-1",
      text: "olá",
    },
    tenantKey: "tenant-a",
    account,
    requestId: "req-1",
  });

  assert.equal(result.persisted, false);
  assert.equal(result.reason, "inbound_persistence_disabled");
  assert.equal(prisma.state.inboundMessages.size, 0);
});
