import test from "node:test";
import assert from "node:assert/strict";
import {
  createTelegramAccount,
  listTelegramAccounts,
  rotateTelegramToken,
  updateTelegramAccount,
} from "./telegramService.js";

type AccountRecord = Record<string, unknown> & { id: string };
type AliasRecord = { channelAccountId: string; alias: string; aliasType: string };
type SecretRecord = {
  channelAccountId: string;
  secretKind: string;
  secretHash: string;
  secretCiphertext: string;
  encryptionKeyRef: string;
  status: string;
};

function createMockPrisma() {
  const accounts: AccountRecord[] = [];
  const aliases: AliasRecord[] = [];
  const secrets: SecretRecord[] = [];
  let accountSeq = 0;

  const includeRelations = (account: AccountRecord) => ({
    ...account,
    aliases: aliases.filter((alias) => alias.channelAccountId === account.id),
    secrets: secrets.filter((secret) => secret.channelAccountId === account.id),
  });

  return {
    __data: { accounts, aliases, secrets },
    channelAccount: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const account = {
          ...data,
          id: `account-${++accountSeq}`,
          createdAt: new Date("2026-06-23T12:00:00.000Z"),
          updatedAt: new Date("2026-06-23T12:00:00.000Z"),
        };
        accounts.push(account);
        return account;
      },
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        accounts
          .filter(
            (account) =>
              account.clientId === where.clientId &&
              account.channel === where.channel &&
              account.provider === where.provider
          )
          .map(includeRelations),
      findFirst: async ({ where, include, select }: { where: Record<string, unknown>; include?: unknown; select?: Record<string, boolean> }) => {
        const account = accounts.find(
          (item) =>
            item.id === where.id &&
            item.clientId === where.clientId &&
            item.channel === where.channel &&
            item.provider === where.provider
        );
        if (!account) return null;
        if (select) {
          return Object.fromEntries(Object.keys(select).map((key) => [key, account[key]]));
        }
        return include ? includeRelations(account) : account;
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const account = accounts.find((item) => item.id === where.id);
        if (!account) throw new Error("not_found");
        return includeRelations(account);
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const account = accounts.find((item) => item.id === where.id);
        if (!account) throw new Error("not_found");
        Object.assign(account, data, { updatedAt: new Date("2026-06-23T12:10:00.000Z") });
        return account;
      },
    },
    channelAccountAlias: {
      deleteMany: async ({ where }: { where: { channelAccountId: string } }) => {
        for (let index = aliases.length - 1; index >= 0; index -= 1) {
          if (aliases[index]?.channelAccountId === where.channelAccountId) aliases.splice(index, 1);
        }
      },
      create: async ({ data }: { data: AliasRecord }) => {
        aliases.push(data);
        return data;
      },
    },
    channelAccountSecret: {
      upsert: async ({ where, create, update }: { where: { channelAccountId_secretKind: { channelAccountId: string; secretKind: string } }; create: SecretRecord; update: SecretRecord }) => {
        const target = secrets.find(
          (secret) =>
            secret.channelAccountId === where.channelAccountId_secretKind.channelAccountId &&
            secret.secretKind === where.channelAccountId_secretKind.secretKind
        );
        if (target) {
          Object.assign(target, update);
          return target;
        }
        secrets.push(create);
        return create;
      },
    },
  };
}

test("creates Telegram account with encrypted bot token and redacted response", async () => {
  process.env.CHANNEL_ACCOUNT_SECRET_KEY = "unit-test-channel-account-secret-key";
  const prisma = createMockPrisma();

  const result = await createTelegramAccount({
    prisma: prisma as never,
    clientId: "client-a",
    input: {
      displayName: "Demo Telegram",
      botUsername: "@DemoBot",
      botId: "12345",
      token: "12345:secret-token",
      enabled: true,
      status: "connected",
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.account.channel, "telegram");
  assert.equal(result.account.provider, "telegram");
  assert.equal(result.account.botUsername, "demobot");
  assert.equal(result.account.tokenConfigured, true);
  assert.equal(JSON.stringify(result.account).includes("secret-token"), false);
  assert.equal(prisma.__data.secrets.length, 1);
  assert.equal(prisma.__data.secrets[0]?.secretKind, "telegramBotToken");
  assert.match(prisma.__data.secrets[0]?.secretCiphertext ?? "", /^v1:/);
  assert.notEqual(prisma.__data.secrets[0]?.secretHash, "12345:secret-token");
});

test("lists only Telegram accounts for the requested tenant", async () => {
  process.env.CHANNEL_ACCOUNT_SECRET_KEY = "unit-test-channel-account-secret-key";
  const prisma = createMockPrisma();
  await createTelegramAccount({
    prisma: prisma as never,
    clientId: "client-a",
    input: { displayName: "A", botUsername: "a_bot", token: "a-token" },
  });
  await createTelegramAccount({
    prisma: prisma as never,
    clientId: "client-b",
    input: { displayName: "B", botUsername: "b_bot", token: "b-token" },
  });

  const result = await listTelegramAccounts({ prisma: prisma as never, clientId: "client-a" });
  assert.equal(result.accounts.length, 1);
  assert.equal(result.accounts[0]?.botUsername, "a_bot");
});

test("blocks cross-tenant update and rotates token for the owning tenant", async () => {
  process.env.CHANNEL_ACCOUNT_SECRET_KEY = "unit-test-channel-account-secret-key";
  const prisma = createMockPrisma();
  const created = await createTelegramAccount({
    prisma: prisma as never,
    clientId: "client-a",
    input: { displayName: "A", botUsername: "a_bot", token: "old-token" },
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const blocked = await updateTelegramAccount({
    prisma: prisma as never,
    clientId: "client-b",
    accountId: created.account.id,
    input: { displayName: "B", botUsername: "b_bot" },
  });
  assert.deepEqual(blocked, { ok: false, error: "telegram_account_not_found" });

  const before = prisma.__data.secrets[0]?.secretCiphertext;
  const rotated = await rotateTelegramToken({
    prisma: prisma as never,
    clientId: "client-a",
    accountId: created.account.id,
    input: { token: "new-token" },
  });
  assert.equal(rotated.ok, true);
  assert.notEqual(prisma.__data.secrets[0]?.secretCiphertext, before);
});
