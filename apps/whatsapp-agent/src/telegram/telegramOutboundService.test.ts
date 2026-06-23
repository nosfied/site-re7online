import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { MessageStatus } from "@prisma/client";
import { encryptMessengerExternalUserRef } from "../channels/messengerOutbound.js";
import { createTelegramOutboundMessage, sendTelegramTextMessage } from "./telegramOutboundService.js";

function encryptTelegramSecretForTest(value: string) {
  const key = crypto
    .createHash("sha256")
    .update(process.env.CHANNEL_ACCOUNT_SECRET_KEY ?? "", "utf8")
    .digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function makeRuntimeState(overrides: Record<string, unknown> = {}) {
  return {
    id: "runtime_telegram_1",
    waId: "tg:chat-777",
    waIdCanonical: "tg:chat-777",
    channelAccountId: "demo_bot",
    externalUserHash: "hash_chat_777",
    externalUserRef: encryptMessengerExternalUserRef("777"),
    assignedAt: new Date("2026-06-23T10:00:00.000Z"),
    assignedUserId: "user_1",
    mode: "HUMAN",
    status: "WAITING",
    ...overrides,
  };
}

function makePrisma(params: {
  telegram?: boolean;
  telegramOutbound?: boolean;
  tokenConfigured?: boolean;
  accountClientId?: string;
  runtimeState?: Record<string, unknown> | null;
} = {}) {
  const state = {
    events: [] as Array<Record<string, unknown>>,
    outboundMessages: [] as Array<Record<string, unknown>>,
    conversationUpdates: [] as Array<Record<string, unknown>>,
    runtimeUpdates: [] as Array<Record<string, unknown>>,
  };
  const clientId = "client-1";
  const accountClientId = params.accountClientId ?? clientId;
  const runtimeState = params.runtimeState === null ? null : makeRuntimeState(params.runtimeState);
  const secretCiphertext = params.tokenConfigured === false ? null : encryptTelegramSecretForTest("12345:test-bot-token");
  return {
    __state: state,
    client: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === clientId
          ? {
              id: clientId,
              clientKey: "demo-prefeitura",
              status: "ACTIVE",
              profile: "government",
              features: {
                telegram: params.telegram ?? true,
                telegramOutbound: params.telegramOutbound ?? true,
              },
            }
          : null,
    },
    conversationRuntimeState: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        where.clientId === clientId && where.channel === "telegram" ? runtimeState : null,
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        state.runtimeUpdates.push(data);
        return { count: runtimeState ? 1 : 0 };
      },
    },
    channelAccount: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        if (
          where.clientId !== accountClientId ||
          where.channel !== "telegram" ||
          where.provider !== "telegram" ||
          where.channelAccountId !== "demo_bot"
        ) {
          return null;
        }
        return {
          id: "account_telegram_1",
          clientId: accountClientId,
          channel: "telegram",
          provider: "telegram",
          channelAccountId: "demo_bot",
          enabled: true,
          runtimeEnabled: true,
          outboundEnabled: true,
          status: "connected",
          tokenStatus: params.tokenConfigured === false ? "missing" : "configured",
          secrets: [
            {
              secretKind: "telegramBotToken",
              status: params.tokenConfigured === false ? "missing" : "configured",
              secretCiphertext,
            },
          ],
        };
      },
    },
    conversation: {
      findFirst: async () => ({ id: "conversation_1" }),
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        state.conversationUpdates.push(data);
        return { count: 1 };
      },
    },
    outboundMessage: {
      upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const existing = state.outboundMessages.find((item) => item.messageId === create.messageId);
        if (existing) Object.assign(existing, update);
        else state.outboundMessages.push({ id: `outbound_${state.outboundMessages.length + 1}`, ...create });
        return { id: "outbound_1" };
      },
    },
    event: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.events.push(data);
        return { id: `event_${state.events.length}` };
      },
    },
  } as never;
}

function baseParams(overrides: Record<string, unknown> = {}) {
  return {
    clientId: "client-1",
    clientKey: "demo-prefeitura",
    waId: "tg:chat-777",
    requestId: "req_telegram_outbound_1",
    text: "Resposta humana",
    source: { channel: "telegram", provider: "telegram", channelAccountId: "demo_bot" },
    usageGateCheck: async () => ({
      allowed: true,
      usage: {
        messagesSent: 0,
        messagesReceived: 0,
        templatesSent: 0,
        messagesLimit: null,
        period: "2026-06",
      },
      planName: null,
    }),
    metricsRecorder: async () => undefined,
    ...overrides,
  };
}

test.beforeEach(() => {
  process.env.CHANNEL_ACCOUNT_SECRET_KEY = "unit-test-channel-account-secret-key";
  process.env.META_APP_SECRET = "unit-test-meta-app-secret";
});

test("sendTelegramTextMessage calls Bot API sendMessage and returns provider message id", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const result = await sendTelegramTextMessage({
    botToken: "12345:test-bot-token",
    chatId: "777",
    text: "Oi",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), { status: 200 });
    },
  });

  assert.deepEqual(result, { ok: true, status: 200, messageId: "42" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://api.telegram.org/bot12345:test-bot-token/sendMessage");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.equal(String(calls[0]?.init?.body).includes("\"chat_id\":\"777\""), true);
  assert.equal(String(calls[0]?.init?.body).includes("\"text\":\"Oi\""), true);
});

test("createTelegramOutboundMessage blocks when telegramOutbound feature is disabled", async () => {
  const prisma = makePrisma({ telegramOutbound: false }) as any;
  const result = await createTelegramOutboundMessage({
    prisma,
    ...baseParams(),
    fetchImpl: async () => {
      throw new Error("fetch should not be called");
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error, "telegram_outbound_disabled");
  assert.equal(prisma.__state.events[0]?.eventName, "telegram.outbound.blocked");
});

test("createTelegramOutboundMessage blocks without configured token", async () => {
  const prisma = makePrisma({ tokenConfigured: false }) as any;
  const result = await createTelegramOutboundMessage({
    prisma,
    ...baseParams(),
    fetchImpl: async () => {
      throw new Error("fetch should not be called");
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error, "telegram_token_missing");
  assert.equal(prisma.__state.events[0]?.eventName, "telegram.outbound.blocked");
});

test("createTelegramOutboundMessage blocks without encrypted Telegram chat id", async () => {
  const prisma = makePrisma({ runtimeState: { externalUserRef: null } }) as any;
  const result = await createTelegramOutboundMessage({
    prisma,
    ...baseParams(),
    fetchImpl: async () => {
      throw new Error("fetch should not be called");
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error, "telegram_chat_unavailable");
  assert.equal(prisma.__state.events[0]?.eventName, "telegram.outbound.blocked");
});

test("createTelegramOutboundMessage sends text and persists outbound timeline", async () => {
  const prisma = makePrisma() as any;
  const result = await createTelegramOutboundMessage({
    prisma,
    ...baseParams(),
    fetchImpl: async () => new Response(JSON.stringify({ ok: true, result: { message_id: 9001 } }), { status: 200 }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.status, MessageStatus.SENT);
  assert.equal(result.metaMessageId, "9001");
  assert.equal(prisma.__state.outboundMessages.length, 1);
  assert.equal(prisma.__state.outboundMessages[0].channel, "telegram");
  assert.equal(prisma.__state.outboundMessages[0].provider, "telegram");
  assert.equal(prisma.__state.outboundMessages[0].bodyText, "Resposta humana");
  assert.equal(prisma.__state.outboundMessages[0].externalMessageId, "9001");
  assert.equal(prisma.__state.events[0]?.eventName, "telegram.outbound.sent");
  assert.equal(JSON.stringify(prisma.__state).includes("test-bot-token"), false);
});

test("createTelegramOutboundMessage persists failed provider result with redacted error", async () => {
  const prisma = makePrisma() as any;
  const result = await createTelegramOutboundMessage({
    prisma,
    ...baseParams({ requestId: "req_telegram_outbound_failed" }),
    fetchImpl: async () => new Response("bad bot12345:test-bot-token", { status: 400 }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.status, MessageStatus.FAILED);
  assert.equal(prisma.__state.outboundMessages[0].status, MessageStatus.FAILED);
  assert.equal(prisma.__state.outboundMessages[0].errorBody, "bad bot<redacted>");
  assert.equal(prisma.__state.events[0]?.eventName, "telegram.outbound.failed");
  assert.equal(JSON.stringify(prisma.__state).includes("test-bot-token"), false);
});

test("createTelegramOutboundMessage persists failed network result without throwing", async () => {
  const prisma = makePrisma() as any;
  const result = await createTelegramOutboundMessage({
    prisma,
    ...baseParams({ requestId: "req_telegram_outbound_network_failed" }),
    fetchImpl: async () => {
      throw new Error("network bot12345:test-bot-token unavailable");
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.status, MessageStatus.FAILED);
  assert.equal(prisma.__state.outboundMessages[0].status, MessageStatus.FAILED);
  assert.equal(prisma.__state.outboundMessages[0].errorBody, "network bot<redacted> unavailable");
  assert.equal(prisma.__state.events[0]?.eventName, "telegram.outbound.failed");
  assert.equal(JSON.stringify(prisma.__state).includes("test-bot-token"), false);
});

test("createTelegramOutboundMessage preserves tenant isolation for account lookup", async () => {
  const prisma = makePrisma({ accountClientId: "client-2" }) as any;
  const result = await createTelegramOutboundMessage({
    prisma,
    ...baseParams(),
    fetchImpl: async () => {
      throw new Error("fetch should not be called");
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error, "telegram_account_inactive");
  assert.equal(prisma.__state.outboundMessages.length, 0);
});
