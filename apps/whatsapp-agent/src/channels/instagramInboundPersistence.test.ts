import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInstagramSyntheticWaId,
  persistInstagramInboundEvent,
  resolveInstagramInboundPersistenceGate,
} from "./instagramInboundPersistence.js";
import { validateTenantChannelAccount } from "./tenantChannelAccount.js";

function createFakePrisma() {
  const client = { id: "client-1", clientKey: "tenant-a", status: "ACTIVE" };
  const defaultDepartment = {
    id: "department-default",
    name: "Atendimento Geral",
    slug: "atendimento-geral",
    isActive: true,
  };
  const defaultQueue = { id: "queue-default", name: "Fila Geral", departmentId: defaultDepartment.id };
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
    department: {
      async findFirst() {
        return defaultDepartment;
      },
      async create(args: any) {
        return { ...defaultDepartment, ...args.data };
      },
    },
    queue: {
      async upsert(args: any) {
        return { ...defaultQueue, ...args.create, ...args.update };
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
  channel: "instagram",
  provider: "meta",
  channelAccountId: "ig-account-1",
  enabled: true,
  runtimeEnabled: true,
  inboundPersistenceEnabled: true,
  outboundEnabled: false,
  status: "connected",
});

test("resolveInstagramInboundPersistenceGate blocks unless inbound persistence is explicit", () => {
  const disabled = validateTenantChannelAccount({
    tenantKey: "tenant-a",
    channel: "instagram",
    provider: "meta",
    channelAccountId: "ig-account-1",
    enabled: true,
    runtimeEnabled: true,
    status: "connected",
  });

  assert.deepEqual(resolveInstagramInboundPersistenceGate(disabled), {
    allowed: false,
    reason: "inbound_persistence_disabled",
  });
  assert.deepEqual(resolveInstagramInboundPersistenceGate(enabledAccount), {
    allowed: true,
    reason: "persisted",
  });
});

test("buildInstagramSyntheticWaId uses hash only", () => {
  const synthetic = buildInstagramSyntheticWaId("abcdef1234567890abcdef1234567890");
  assert.equal(synthetic, "instagram:abcdef1234567890abcdef1234567890");
  assert.equal(synthetic.includes("ig-user"), false);
});

test("persistInstagramInboundEvent persists Instagram inbound once and dedupes by mid", async () => {
  const prisma = createFakePrisma();
  const realtimeEvents: any[] = [];
  const event = {
    tenantKey: "tenant-a",
    channel: "instagram" as const,
    provider: "meta" as const,
    channelAccountId: "ig-account-1",
    externalUserId: "ig-user-001",
    externalMessageId: "ig-mid-1",
    text: "olá instagram",
    timestamp: "2026-05-17T10:00:00.000Z",
  };

  const first = await persistInstagramInboundEvent({
    prisma: prisma as any,
    event,
    tenantKey: "tenant-a",
    account: enabledAccount,
    requestId: "req-1",
    publishRealtimeEvent: (event: any) => {
      realtimeEvents.push(event);
    },
  });
  const second = await persistInstagramInboundEvent({
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
  const contact = Array.from(prisma.state.contacts.values())[0];
  const lead = Array.from(prisma.state.leads.values())[0];
  assert.equal(conversation.channel, "instagram");
  assert.equal(runtime.mode, "HUMAN");
  assert.equal(runtime.status, "WAITING");
  assert.equal(inbound.externalMessageId, "ig-mid-1");
  assert.equal(contact.name, "Contato Instagram");
  assert.equal(lead.name, "Contato Instagram");
  assert.equal(JSON.stringify({ conversation, runtime, inbound }).includes("ig-user-001"), false);
  assert.equal(realtimeEvents.length, 1);
  assert.equal(realtimeEvents[0].type, "message.created");
  assert.equal(realtimeEvents[0].clientId, "client-1");
  assert.equal(realtimeEvents[0].waId, first.syntheticWaId);
  assert.equal(realtimeEvents[0].waIdCanonical, first.syntheticWaId);
  assert.equal(realtimeEvents[0].mode, "HUMAN");
  assert.equal(realtimeEvents[0].handoffStatus, "none");
  assert.equal(realtimeEvents[0].departmentId, "department-default");
  assert.equal(realtimeEvents[0].message.direction, "INBOUND");
  assert.equal(realtimeEvents[0].message.messageId, inbound.messageId);
  assert.equal(realtimeEvents[0].message.bodyText, "olá instagram");
});

test("persistInstagramInboundEvent does not persist when the account flag is off", async () => {
  const prisma = createFakePrisma();
  const account = validateTenantChannelAccount({
    tenantKey: "tenant-a",
    channel: "instagram",
    provider: "meta",
    channelAccountId: "ig-account-1",
    enabled: true,
    runtimeEnabled: true,
    status: "connected",
  });
  const result = await persistInstagramInboundEvent({
    prisma: prisma as any,
    event: {
      tenantKey: "tenant-a",
      channel: "instagram",
      provider: "meta",
      channelAccountId: "ig-account-1",
      externalUserId: "ig-user-001",
      externalMessageId: "ig-mid-1",
      text: "olá instagram",
    },
    tenantKey: "tenant-a",
    account,
    requestId: "req-1",
  });

  assert.equal(result.persisted, false);
  assert.equal(result.reason, "inbound_persistence_disabled");
  assert.equal(prisma.state.inboundMessages.size, 0);
});
