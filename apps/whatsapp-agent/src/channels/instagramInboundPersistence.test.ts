import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInstagramSyntheticWaId,
  fetchInstagramUserProfile,
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
  const outboundMessages = new Map<string, any>();

  return {
    state: { inboundMessages, conversations, runtimeStates, contacts, leads, outboundMessages },
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
    outboundMessage: {
      async findFirst(args: any) {
        const items = Array.from(outboundMessages.values());
        return (
          items.find((item) => {
            if (args.where.clientId && item.clientId !== args.where.clientId) return false;
            if (args.where.channel && item.channel !== args.where.channel) return false;
            const clauses = Array.isArray(args.where.OR) ? args.where.OR : [];
            if (clauses.length === 0) return true;
            return clauses.some((clause: any) => {
              if (clause.metaMessageId !== undefined && item.metaMessageId === clause.metaMessageId) return true;
              if (clause.externalMessageId !== undefined && item.externalMessageId === clause.externalMessageId) {
                return true;
              }
              return false;
            });
          }) ?? null
        );
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
  instagramBusinessAccessToken: "ig-business-token",
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

test("fetchInstagramUserProfile resolves display name without exposing token", async () => {
  let requestedUrl = "";
  let authorizationHeader = "";
  const result = await fetchInstagramUserProfile({
    instagramBusinessAccessToken: "ig-business-token",
    externalUserId: "ig-user-001",
    fetchImpl: (async (url: RequestInfo | URL, init?: RequestInit) => {
      requestedUrl = String(url);
      authorizationHeader = String(init?.headers instanceof Headers
        ? init.headers.get("authorization")
        : (init?.headers as Record<string, string> | undefined)?.Authorization ?? "");
      return new Response(JSON.stringify({ name: "Maria Instagram", username: "maria.ig" }), { status: 200 });
    }) as typeof fetch,
  });

  assert.equal(result.displayName, "Maria Instagram");
  assert.equal(requestedUrl.includes("ig-user-001"), true);
  assert.equal(requestedUrl.includes("fields=name%2Cusername"), true);
  assert.equal(requestedUrl.includes("ig-business-token"), false);
  assert.equal(authorizationHeader, "Bearer ig-business-token");
});

test("fetchInstagramUserProfile falls back to username and fails open", async () => {
  const byUsername = await fetchInstagramUserProfile({
    instagramBusinessAccessToken: "ig-business-token",
    externalUserId: "ig-user-001",
    fetchImpl: (async () => new Response(JSON.stringify({ username: "re7online" }), { status: 200 })) as typeof fetch,
  });
  const unavailable = await fetchInstagramUserProfile({
    instagramBusinessAccessToken: "ig-business-token",
    externalUserId: "ig-user-001",
    fetchImpl: (async () => new Response("denied", { status: 403 })) as typeof fetch,
  });

  assert.equal(byUsername.displayName, "@re7online");
  assert.equal(unavailable.displayName, null);
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
    fetchImpl: (async () => new Response(JSON.stringify({ username: "cliente.re7" }), { status: 200 })) as typeof fetch,
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
  assert.equal(contact.name, "@cliente.re7");
  assert.equal(lead.name, "@cliente.re7");
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

test("persistInstagramInboundEvent ignores Instagram outbound echo callbacks by provider message id", async () => {
  const prisma = createFakePrisma();
  prisma.state.outboundMessages.set("outbound-1", {
    id: "outbound-1",
    clientId: "client-1",
    channel: "instagram",
    metaMessageId: "ig-outbound-mid-1",
    externalMessageId: "ig-outbound-mid-1",
  });

  const result = await persistInstagramInboundEvent({
    prisma: prisma as any,
    event: {
      tenantKey: "tenant-a",
      channel: "instagram",
      provider: "meta",
      channelAccountId: "ig-alias-account",
      externalUserId: "ig-user-001",
      externalMessageId: "ig-outbound-mid-1",
      text: "resposta enviada pelo operador",
      timestamp: "2026-05-17T10:01:00.000Z",
    },
    tenantKey: "tenant-a",
    account: enabledAccount,
    requestId: "req-echo",
  });

  assert.equal(result.persisted, false);
  assert.equal(result.reason, "outbound_echo");
  assert.equal(prisma.state.inboundMessages.size, 0);
  assert.equal(prisma.state.conversations.size, 0);
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
