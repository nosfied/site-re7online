import test from "node:test";
import assert from "node:assert/strict";
import {
  clearTelegramWebhookReplayCache,
  handleTelegramWebhookShadow,
} from "./telegramWebhookShadow.js";

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

type AliasRecord = {
  alias: string;
  channelAccount: AccountRecord;
};

function createMockPrisma(params?: { telegram?: boolean; telegramInbound?: boolean }) {
  const account: AccountRecord = {
    id: "account-telegram-1",
    clientId: "client-1",
    channel: "telegram",
    provider: "telegram",
    channelAccountId: "demo_bot",
    enabled: true,
    runtimeEnabled: true,
    inboundPersistenceEnabled: true,
    tokenStatus: "configured",
    client: {
      id: "client-1",
      clientKey: "demo-prefeitura",
      status: "ACTIVE",
      features: {
        telegram: params?.telegram ?? true,
        telegramInbound: params?.telegramInbound ?? true,
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
  const aliases: AliasRecord[] = [
    { alias: "demo_bot", channelAccount: account },
    { alias: "@demo_bot", channelAccount: account },
    { alias: "12345", channelAccount: account },
  ];
  return {
    state: { account, aliases },
    channelAccount: {
      findFirst: async ({ where }: { where: { OR?: Array<Record<string, unknown>>; channel?: string; provider?: string } }) => {
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
        const requested = where.alias?.in ?? [];
        const found = aliases.find((alias) => requested.includes(alias.alias));
        return found ?? null;
      },
    },
  };
}

const validPayload = {
  update_id: 1001,
  message: {
    message_id: 9001,
    chat: { id: 777 },
    from: { id: 888 },
    text: "Oi",
  },
};

test("Telegram webhook shadow rejects unknown account", async () => {
  clearTelegramWebhookReplayCache();
  const prisma = createMockPrisma();
  const result = await handleTelegramWebhookShadow({
    prisma: prisma as never,
    tenantOrAlias: "missing_bot",
    payload: validPayload,
  });
  assert.deepEqual(result, {
    ok: false,
    status: 404,
    error: "telegram_account_not_found",
    resolution: "not_found",
  });
});

test("Telegram webhook shadow rejects disabled feature", async () => {
  clearTelegramWebhookReplayCache();
  const prisma = createMockPrisma({ telegram: false, telegramInbound: true });
  const result = await handleTelegramWebhookShadow({
    prisma: prisma as never,
    tenantOrAlias: "demo_bot",
    payload: validPayload,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 403);
  assert.equal(result.error, "telegram_feature_disabled");
});

test("Telegram webhook shadow rejects invalid payload", async () => {
  clearTelegramWebhookReplayCache();
  const prisma = createMockPrisma();
  const result = await handleTelegramWebhookShadow({
    prisma: prisma as never,
    tenantOrAlias: "demo_bot",
    payload: { message: { text: "sem update" } },
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 400);
  assert.equal(result.error, "telegram_update_id_missing");
});

test("Telegram webhook shadow resolves alias and parses payload without persistence", async () => {
  clearTelegramWebhookReplayCache();
  const prisma = createMockPrisma();
  const result = await handleTelegramWebhookShadow({
    prisma: prisma as never,
    tenantOrAlias: "12345",
    payload: validPayload,
    now: 10_000,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.resolution, "matched_alias");
  assert.equal(result.tenantKey, "demo-prefeitura");
  assert.equal(result.channelAccountId, "demo_bot");
  assert.equal(result.replay, false);
  assert.deepEqual(result.parsed, {
    updateId: 1001,
    chatId: "777",
    messageId: "9001",
    fromId: "888",
    textPresent: true,
    textLength: 2,
  });
});

test("Telegram webhook shadow marks replayed update id", async () => {
  clearTelegramWebhookReplayCache();
  const prisma = createMockPrisma();
  const first = await handleTelegramWebhookShadow({
    prisma: prisma as never,
    tenantOrAlias: "demo_bot",
    payload: validPayload,
    now: 20_000,
  });
  const second = await handleTelegramWebhookShadow({
    prisma: prisma as never,
    tenantOrAlias: "demo_bot",
    payload: validPayload,
    now: 21_000,
  });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.replay, true);
});

test("Telegram webhook shadow rejects inactive account and missing token", async () => {
  clearTelegramWebhookReplayCache();
  const prisma = createMockPrisma();
  prisma.state.account.inboundPersistenceEnabled = false;
  const inactive = await handleTelegramWebhookShadow({
    prisma: prisma as never,
    tenantOrAlias: "demo_bot",
    payload: validPayload,
  });
  assert.equal(inactive.ok, false);
  if (inactive.ok) return;
  assert.equal(inactive.error, "telegram_account_inactive");

  prisma.state.account.inboundPersistenceEnabled = true;
  prisma.state.account.secrets = [];
  const missingToken = await handleTelegramWebhookShadow({
    prisma: prisma as never,
    tenantOrAlias: "demo_bot",
    payload: { ...validPayload, update_id: 1002 },
  });
  assert.equal(missingToken.ok, false);
  if (missingToken.ok) return;
  assert.equal(missingToken.error, "telegram_token_missing");
});
