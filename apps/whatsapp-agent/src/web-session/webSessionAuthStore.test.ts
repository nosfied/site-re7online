import test from "node:test";
import assert from "node:assert/strict";
import {
  clearWebSessionAuthState,
  createQueuedWebSessionAuthStore,
  loadWebSessionAuthState,
  saveWebSessionAuthState,
  WEB_SESSION_AUTH_SECRET_KIND,
} from "./webSessionAuthStore.js";
import { decryptChannelAccountSecret } from "../channels/channelAccountSecretCrypto.js";

function makePrisma() {
  type Account = {
    id: string;
    clientId: string;
    channel: string;
    provider: string;
    channelAccountId: string;
    client: { clientKey: string };
  };
  type FindFirstArgs = {
    where: {
      channel: string;
      provider: string;
      channelAccountId: string;
      client: { clientKey: string };
    };
    include?: { secrets?: false | { where: { secretKind: string } } };
  };
  type FindFirstResult = Promise<
    | (Account & {
        secrets?: Array<{ secretKind: string; status: string; secretCiphertext: string | null }>;
      })
    | null
  >;
  const state = {
    accounts: [
      {
        id: "account-a",
        clientId: "client-a",
        channel: "whatsapp",
        provider: "web_session",
        channelAccountId: "session-a",
        client: { clientKey: "tenant-a" },
      },
      {
        id: "account-b",
        clientId: "client-b",
        channel: "whatsapp",
        provider: "web_session",
        channelAccountId: "session-a",
        client: { clientKey: "tenant-b" },
      },
      {
        id: "account-meta",
        clientId: "client-a",
        channel: "whatsapp",
        provider: "meta",
        channelAccountId: "session-a",
        client: { clientKey: "tenant-a" },
      },
    ] as Account[],
    secrets: [] as Array<{
      channelAccountId: string;
      secretKind: string;
      secretHash: string | null;
      secretCiphertext: string | null;
      encryptionKeyRef: string | null;
      status: string;
    }>,
  };
  const prisma = {
    state,
    channelAccount: {
      findFirst: async (_args: FindFirstArgs): FindFirstResult => null,
    },
    channelAccountSecret: {
      upsert: async (args: {
        where: { channelAccountId_secretKind: { channelAccountId: string; secretKind: string } };
        create: typeof state.secrets[number];
        update: typeof state.secrets[number];
      }) => {
        const key = args.where.channelAccountId_secretKind;
        const index = state.secrets.findIndex(
          (item) => item.channelAccountId === key.channelAccountId && item.secretKind === key.secretKind
        );
        if (index >= 0) state.secrets[index] = { ...state.secrets[index], ...args.update };
        else state.secrets.push({ ...args.create });
      },
      deleteMany: async (args: { where: { channelAccountId: string; secretKind: string } }) => {
        const before = state.secrets.length;
        state.secrets = state.secrets.filter(
          (item) =>
            item.channelAccountId !== args.where.channelAccountId ||
            item.secretKind !== args.where.secretKind
        );
        return { count: before - state.secrets.length };
      },
    },
  };
  prisma.channelAccount.findFirst = async (args) => {
    const account = state.accounts.find(
      (item) =>
        item.channel === args.where.channel &&
        item.provider === args.where.provider &&
        item.channelAccountId === args.where.channelAccountId &&
        item.client.clientKey === args.where.client.clientKey
    );
    if (!account) return null;
    const secretInclude = args.include?.secrets;
    if (!secretInclude) return account;
    return {
      ...account,
      secrets: state.secrets
        .filter(
          (secret) =>
            secret.channelAccountId === account.id &&
            secret.secretKind === secretInclude.where.secretKind
        )
        .map((secret) => ({
          secretKind: secret.secretKind,
          status: secret.status,
          secretCiphertext: secret.secretCiphertext,
        })),
    };
  };
  return prisma;
}

test("web session auth storage encrypts and decrypts tenant-scoped auth state", async () => {
  const previous = process.env.CHANNEL_ACCOUNT_SECRET_KEY;
  process.env.CHANNEL_ACCOUNT_SECRET_KEY = "unit-test-channel-account-secret-key";
  try {
    const prisma = makePrisma();
    const state = { creds: { registered: true }, keys: { noise: "secret-key-material" } };
    const saved = await saveWebSessionAuthState({
      prisma: prisma as never,
      tenantKey: "tenant-a",
      channelAccountId: "session-a",
      state,
    });
    assert.equal(saved.ok, true);
    assert.equal(prisma.state.secrets.length, 1);
    assert.equal(prisma.state.secrets[0]?.secretKind, WEB_SESSION_AUTH_SECRET_KIND);
    assert.equal(JSON.stringify(prisma.state.secrets).includes("secret-key-material"), false);

    const loaded = await loadWebSessionAuthState({
      prisma: prisma as never,
      tenantKey: "tenant-a",
      channelAccountId: "session-a",
    });
    assert.equal(loaded.ok, true);
    if (loaded.ok) assert.deepEqual(loaded.state, state);
  } finally {
    if (previous === undefined) delete process.env.CHANNEL_ACCOUNT_SECRET_KEY;
    else process.env.CHANNEL_ACCOUNT_SECRET_KEY = previous;
  }
});

test("web session auth storage rejects wrong key and tampered ciphertext", async () => {
  const previous = process.env.CHANNEL_ACCOUNT_SECRET_KEY;
  process.env.CHANNEL_ACCOUNT_SECRET_KEY = "unit-test-channel-account-secret-key";
  try {
    const prisma = makePrisma();
    await saveWebSessionAuthState({
      prisma: prisma as never,
      tenantKey: "tenant-a",
      channelAccountId: "session-a",
      state: { creds: { registered: true } },
    });
    const ciphertext = prisma.state.secrets[0]?.secretCiphertext ?? "";
    assert.equal(decryptChannelAccountSecret(ciphertext, "wrong-key"), null);
    prisma.state.secrets[0] = {
      ...prisma.state.secrets[0]!,
      secretCiphertext: `${ciphertext.slice(0, -2)}xx`,
    };
    const loaded = await loadWebSessionAuthState({
      prisma: prisma as never,
      tenantKey: "tenant-a",
      channelAccountId: "session-a",
    });
    assert.deepEqual(loaded, { ok: false, error: "web_session_auth_state_unavailable" });
  } finally {
    if (previous === undefined) delete process.env.CHANNEL_ACCOUNT_SECRET_KEY;
    else process.env.CHANNEL_ACCOUNT_SECRET_KEY = previous;
  }
});

test("web session auth storage preserves tenant/provider isolation and can clear secret", async () => {
  const previous = process.env.CHANNEL_ACCOUNT_SECRET_KEY;
  process.env.CHANNEL_ACCOUNT_SECRET_KEY = "unit-test-channel-account-secret-key";
  try {
    const prisma = makePrisma();
    await saveWebSessionAuthState({
      prisma: prisma as never,
      tenantKey: "tenant-a",
      channelAccountId: "session-a",
      state: { tenant: "a" },
    });
    const tenantB = await loadWebSessionAuthState({
      prisma: prisma as never,
      tenantKey: "tenant-b",
      channelAccountId: "session-a",
    });
    assert.equal(tenantB.ok, true);
    if (tenantB.ok) assert.equal(tenantB.state, null);

    const cleared = await clearWebSessionAuthState({
      prisma: prisma as never,
      tenantKey: "tenant-a",
      channelAccountId: "session-a",
    });
    assert.equal(cleared.ok, true);
    assert.equal(prisma.state.secrets.length, 0);
  } finally {
    if (previous === undefined) delete process.env.CHANNEL_ACCOUNT_SECRET_KEY;
    else process.env.CHANNEL_ACCOUNT_SECRET_KEY = previous;
  }
});

test("queued web session auth store serializes writes for one account", async () => {
  const previous = process.env.CHANNEL_ACCOUNT_SECRET_KEY;
  process.env.CHANNEL_ACCOUNT_SECRET_KEY = "unit-test-channel-account-secret-key";
  try {
    const prisma = makePrisma();
    const store = createQueuedWebSessionAuthStore(prisma as never);
    await Promise.all([
      store.save({ tenantKey: "tenant-a", channelAccountId: "session-a", state: { order: 1 } }),
      store.save({ tenantKey: "tenant-a", channelAccountId: "session-a", state: { order: 2 } }),
    ]);
    const loaded = await store.load({ tenantKey: "tenant-a", channelAccountId: "session-a" });
    assert.deepEqual(loaded, { order: 2 });
  } finally {
    if (previous === undefined) delete process.env.CHANNEL_ACCOUNT_SECRET_KEY;
    else process.env.CHANNEL_ACCOUNT_SECRET_KEY = previous;
  }
});
