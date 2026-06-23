import test from "node:test";
import assert from "node:assert/strict";
import { clearTelegramWebhookReplayCache } from "./telegramWebhookShadow.js";
import { persistTelegramInboundMessage } from "./telegramInboundService.js";

type AccountRecord = {
  id: string;
  clientId: string;
  channel: string;
  provider: string;
  channelAccountId: string;
  enabled: boolean;
  runtimeEnabled: boolean;
  inboundPersistenceEnabled: boolean;
  tokenStatus: string;
  client: {
    id: string;
    clientKey: string;
    status: string;
    features: Record<string, boolean>;
  };
  secrets: Array<{ secretKind: string; status: string; secretCiphertext: string | null }>;
};

function makeDate(value: string) {
  return new Date(value);
}

function makePayload(updateId = 1001, text = "Olá Telegram") {
  return {
    update_id: updateId,
    message: {
      message_id: 9001,
      chat: { id: 777, username: "cidadao" },
      from: { id: 888, first_name: "Ana", last_name: "Silva", username: "ana_silva" },
      text,
    },
  };
}

function makePrisma(params: { telegram?: boolean; telegramInbound?: boolean; secondTenant?: boolean } = {}) {
  const account: AccountRecord = {
    id: params.secondTenant ? "account-telegram-2" : "account-telegram-1",
    clientId: params.secondTenant ? "client-2" : "client-1",
    channel: "telegram",
    provider: "telegram",
    channelAccountId: params.secondTenant ? "outro_bot" : "demo_bot",
    enabled: true,
    runtimeEnabled: true,
    inboundPersistenceEnabled: true,
    tokenStatus: "configured",
    client: {
      id: params.secondTenant ? "client-2" : "client-1",
      clientKey: params.secondTenant ? "outra-prefeitura" : "demo-prefeitura",
      status: "ACTIVE",
      features: {
        telegram: params.telegram ?? true,
        telegramInbound: params.telegramInbound ?? true,
      },
    },
    secrets: [
      {
        secretKind: "telegramBotToken",
        status: "configured",
        secretCiphertext: "v1:encrypted",
      },
    ],
  };
  const state = {
    account,
    contacts: [] as Array<Record<string, unknown>>,
    identities: [] as Array<Record<string, unknown>>,
    conversations: [] as Array<Record<string, unknown>>,
    runtimeStates: [] as Array<Record<string, unknown>>,
    inboundMessages: [] as Array<Record<string, unknown>>,
    leads: [] as Array<Record<string, unknown>>,
    events: [] as Array<Record<string, unknown>>,
  };
  const tx = {
    contact: {
      upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const existing = state.contacts[0];
        const item = existing ? { ...existing, ...update } : { id: "contact_1", ...create };
        state.contacts[0] = item;
        return { id: item.id };
      },
    },
    contactChannelIdentity: {
      upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const existing = state.identities[0];
        const item = existing ? { ...existing, ...update } : { id: "identity_1", ...create };
        state.identities[0] = item;
        return { id: item.id };
      },
    },
    conversation: {
      upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const existing = state.conversations[0];
        const item = existing ? { ...existing, ...update } : { id: "conversation_1", ...create };
        state.conversations[0] = item;
        return { id: item.id };
      },
    },
    conversationRuntimeState: {
      upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const existing = state.runtimeStates[0];
        const item = existing ? { ...existing, ...update } : { id: "runtime_1", ...create };
        state.runtimeStates[0] = item;
        return { id: item.id };
      },
    },
    inboundMessage: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const item = { id: "inbound_1", ...data };
        state.inboundMessages.push(item);
        return { id: item.id };
      },
    },
    lead: {
      upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const existing = state.leads[0];
        const item = existing ? { ...existing, ...update } : { id: "lead_1", ...create };
        state.leads[0] = item;
        return { id: item.id };
      },
    },
    event: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.events.push(data);
        return { id: `event_${state.events.length}` };
      },
    },
  };
  return {
    state,
    channelAccount: {
      findFirst: async ({ where }: { where: { channel?: string; provider?: string; OR?: Array<Record<string, unknown>> } }) => {
        if (where.channel !== "telegram" || where.provider !== "telegram") return null;
        const requested = new Set(
          (where.OR ?? [])
            .flatMap((entry) => [entry.id, entry.channelAccountId])
            .filter((value): value is string => typeof value === "string")
        );
        return requested.has(account.id) || requested.has(account.channelAccountId) ? account : null;
      },
    },
    channelAccountAlias: {
      findFirst: async ({ where }: { where: { alias?: { in?: string[] }; channelAccount?: { channel?: string; provider?: string } } }) => {
        if (where.channelAccount?.channel !== "telegram" || where.channelAccount?.provider !== "telegram") return null;
        return (where.alias?.in ?? []).includes(account.channelAccountId)
          ? { alias: account.channelAccountId, channelAccount: account }
          : null;
      },
    },
    inboundMessage: {
      findUnique: async ({ where }: { where: { clientId_messageId: { messageId: string } } }) =>
        state.inboundMessages.find((item) => item.messageId === where.clientId_messageId.messageId) ?? null,
    },
    contact: {
      findUnique: async () => state.contacts[0] ?? null,
    },
    conversation: {
      findUnique: async () => state.conversations[0] ?? null,
    },
    department: {
      findFirst: async () => ({ id: "department_1", name: "Atendimento Geral" }),
      create: async () => ({ id: "department_1", name: "Atendimento Geral" }),
    },
    queue: {
      upsert: async () => ({ id: "queue_1", name: "Fila Geral", departmentId: "department_1" }),
    },
    $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
  } as never;
}

test("persistTelegramInboundMessage rejects disabled feature", async () => {
  clearTelegramWebhookReplayCache();
  const result = await persistTelegramInboundMessage({
    prisma: makePrisma({ telegram: false }),
    tenantOrAlias: "demo_bot",
    payload: makePayload(),
    requestId: "req_telegram_1",
    now: makeDate("2026-06-23T10:00:00.000Z"),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error, "telegram_feature_disabled");
});

test("persistTelegramInboundMessage persists text inbound into tenant-scoped timeline models", async () => {
  clearTelegramWebhookReplayCache();
  const realtimeEvents: Array<Record<string, unknown>> = [];
  const prisma = makePrisma() as any;
  const result = await persistTelegramInboundMessage({
    prisma,
    tenantOrAlias: "demo_bot",
    payload: makePayload(),
    requestId: "req_telegram_2",
    now: makeDate("2026-06-23T10:00:00.000Z"),
    publishRealtimeEvent: (event: any) => realtimeEvents.push(event),
  });
  assert.equal(result.ok, true);
  assert.equal(result.persisted, true);
  assert.equal(prisma.state.contacts.length, 1);
  assert.equal(prisma.state.identities.length, 1);
  assert.equal(prisma.state.conversations.length, 1);
  assert.equal(prisma.state.runtimeStates.length, 1);
  assert.equal(prisma.state.inboundMessages.length, 1);
  assert.equal(prisma.state.leads.length, 1);
  assert.equal(prisma.state.inboundMessages[0].channel, "telegram");
  assert.equal(prisma.state.inboundMessages[0].provider, "telegram");
  assert.equal(prisma.state.inboundMessages[0].bodyText, "Olá Telegram");
  assert.equal(prisma.state.runtimeStates[0].mode, "HUMAN");
  assert.equal(prisma.state.runtimeStates[0].status, "WAITING");
  assert.equal(realtimeEvents.length, 1);
  assert.equal(realtimeEvents[0].type, "message.created");
  assert.equal(JSON.stringify(prisma.state.inboundMessages[0].rawPayload).includes("Olá Telegram"), false);
  assert.equal(JSON.stringify(prisma.state.inboundMessages).includes("v1:encrypted"), false);
  assert.equal(JSON.stringify(prisma.state.events).includes("v1:encrypted"), false);
});

test("persistTelegramInboundMessage does not persist replayed update", async () => {
  clearTelegramWebhookReplayCache();
  const prisma = makePrisma() as any;
  const first = await persistTelegramInboundMessage({
    prisma,
    tenantOrAlias: "demo_bot",
    payload: makePayload(2001),
    requestId: "req_telegram_3",
    now: makeDate("2026-06-23T10:00:00.000Z"),
  });
  const second = await persistTelegramInboundMessage({
    prisma,
    tenantOrAlias: "demo_bot",
    payload: makePayload(2001),
    requestId: "req_telegram_4",
    now: makeDate("2026-06-23T10:00:01.000Z"),
  });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(prisma.state.inboundMessages.length, 1);
  if (!second.ok || second.persisted) return;
  assert.equal(second.replay, true);
  assert.equal(second.reason, "telegram_replay_update");
});

test("persistTelegramInboundMessage isolates tenants by configured account", async () => {
  clearTelegramWebhookReplayCache();
  const prisma = makePrisma({ secondTenant: true }) as any;
  const result = await persistTelegramInboundMessage({
    prisma,
    tenantOrAlias: "outro_bot",
    payload: makePayload(3001),
    requestId: "req_telegram_5",
    now: makeDate("2026-06-23T10:00:00.000Z"),
  });
  assert.equal(result.ok, true);
  assert.equal(result.persisted, true);
  assert.equal(prisma.state.inboundMessages[0].clientId, "client-2");
  assert.equal(prisma.state.conversations[0].clientId, "client-2");
});
