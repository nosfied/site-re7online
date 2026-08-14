import test from "node:test";
import assert from "node:assert/strict";
import {
  clearAllWebSessionAuthState,
  clearWebSessionAuthState,
  createDurableStagedWebSessionAuthStore,
  createQueuedWebSessionAuthStore,
  createStagedWebSessionAuthStore,
  loadWebSessionAuthState,
  saveWebSessionAuthState,
  type WebSessionAuthStore,
  WEB_SESSION_AUTH_SECRET_KIND,
  WEB_SESSION_AUTH_STAGING_SECRET_KIND,
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
        secrets?: Array<{ secretKind: string; status: string; secretCiphertext: string | null; updatedAt?: Date }>;
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
      updatedAt?: Date;
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
        if (index >= 0) state.secrets[index] = { ...state.secrets[index], ...args.update, updatedAt: new Date() };
        else state.secrets.push({ ...args.create, updatedAt: new Date() });
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
          updatedAt: secret.updatedAt,
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

test("staged web session auth store does not persist before identity promotion", async () => {
  const writes: Array<Record<string, unknown>> = [];
  const baseStore: WebSessionAuthStore = {
    load: async () => ({ persisted: true }),
    save: async (params) => {
      writes.push(params.state);
      return { ok: true };
    },
    clear: async () => ({ ok: true }),
  };
  const staged = createStagedWebSessionAuthStore(baseStore);
  const scope = { tenantKey: "tenant-a", channelAccountId: "session-a" };

  assert.deepEqual(await staged.store.load(scope), { persisted: true });
  assert.deepEqual(await staged.store.save({ ...scope, state: { step: "pre-open" } }), { ok: true });
  assert.deepEqual(await staged.store.save({ ...scope, state: { step: "open" } }), { ok: true });

  assert.equal(staged.hasStagedState(), true);
  assert.equal(staged.isPromoted(), false);
  assert.equal(writes.length, 0);

  assert.deepEqual(await staged.promote(scope), { ok: true });
  assert.equal(staged.isPromoted(), true);
  assert.deepEqual(writes, [{ step: "open" }]);

  await staged.store.save({ ...scope, state: { step: "after-promotion" } });
  assert.deepEqual(writes, [{ step: "open" }, { step: "after-promotion" }]);
});

test("staged web session auth store discards conflict state without touching persisted owner auth", async () => {
  const writes: Array<Record<string, unknown>> = [];
  const baseStore: WebSessionAuthStore = {
    load: async () => ({ owner: "auth" }),
    save: async (params) => {
      writes.push(params.state);
      return { ok: true };
    },
    clear: async () => ({ ok: true }),
  };
  const staged = createStagedWebSessionAuthStore(baseStore);
  const scope = { tenantKey: "tenant-b", channelAccountId: "session-b" };

  assert.deepEqual(await staged.store.load(scope), { owner: "auth" });
  await staged.store.save({ ...scope, state: { conflicting: "auth" } });
  staged.discard();

  assert.equal(staged.hasStagedState(), false);
  assert.equal(staged.isPromoted(), false);
  assert.equal(writes.length, 0);
});

test("durable staged web session auth store persists encrypted staging and reloads before promotion", async () => {
  const previous = process.env.CHANNEL_ACCOUNT_SECRET_KEY;
  process.env.CHANNEL_ACCOUNT_SECRET_KEY = "unit-test-channel-account-secret-key";
  let now = Date.parse("2026-08-14T10:00:00.000Z");
  try {
    const prisma = makePrisma();
    const scope = { tenantKey: "tenant-a", channelAccountId: "session-a" };
    const staged = createDurableStagedWebSessionAuthStore({
      prisma: prisma as never,
      ttlMs: 45 * 60 * 1000,
      now: () => now,
    });
    assert.equal(await staged.store.load(scope), null);
    assert.deepEqual(await staged.store.save({ ...scope, state: { creds: { registered: true }, keys: { a: "secret-key-material" } } }), { ok: true });
    assert.equal(prisma.state.secrets.length, 1);
    assert.equal(prisma.state.secrets[0]?.secretKind, WEB_SESSION_AUTH_STAGING_SECRET_KIND);
    assert.equal(JSON.stringify(prisma.state.secrets).includes("secret-key-material"), false);

    now += 1000;
    const reloaded = createDurableStagedWebSessionAuthStore({
      prisma: prisma as never,
      ttlMs: 45 * 60 * 1000,
      now: () => now,
    });
    assert.deepEqual(await reloaded.store.load(scope), { creds: { registered: true }, keys: { a: "secret-key-material" } });
    assert.equal(reloaded.hasStagedState(), true);
    assert.equal(reloaded.isPromoted(), false);
  } finally {
    if (previous === undefined) delete process.env.CHANNEL_ACCOUNT_SECRET_KEY;
    else process.env.CHANNEL_ACCOUNT_SECRET_KEY = previous;
  }
});

test("durable staged web session auth store expires stale staging without clearing approved auth", async () => {
  const previous = process.env.CHANNEL_ACCOUNT_SECRET_KEY;
  process.env.CHANNEL_ACCOUNT_SECRET_KEY = "unit-test-channel-account-secret-key";
  let now = Date.parse("2026-08-14T10:00:00.000Z");
  try {
    const prisma = makePrisma();
    const scope = { tenantKey: "tenant-a", channelAccountId: "session-a" };
    const staged = createDurableStagedWebSessionAuthStore({ prisma: prisma as never, ttlMs: 1000, now: () => now });
    await staged.store.save({ ...scope, state: { staging: true } });
    await saveWebSessionAuthState({ prisma: prisma as never, ...scope, state: { approved: true } });
    assert.equal(prisma.state.secrets.length, 2);

    await clearWebSessionAuthState({ prisma: prisma as never, ...scope });
    now += 2000;
    const expired = createDurableStagedWebSessionAuthStore({ prisma: prisma as never, ttlMs: 1000, now: () => now });
    assert.equal(await expired.store.load(scope), null);
    assert.equal(prisma.state.secrets.length, 0);
  } finally {
    if (previous === undefined) delete process.env.CHANNEL_ACCOUNT_SECRET_KEY;
    else process.env.CHANNEL_ACCOUNT_SECRET_KEY = previous;
  }
});

test("durable staged web session auth store promotes staging and removes temporary secret", async () => {
  const previous = process.env.CHANNEL_ACCOUNT_SECRET_KEY;
  process.env.CHANNEL_ACCOUNT_SECRET_KEY = "unit-test-channel-account-secret-key";
  try {
    const prisma = makePrisma();
    const scope = { tenantKey: "tenant-a", channelAccountId: "session-a" };
    const staged = createDurableStagedWebSessionAuthStore({ prisma: prisma as never });
    await staged.store.save({ ...scope, state: { approvedAfterIdentity: true } });

    assert.deepEqual(await staged.promote(scope), { ok: true });
    assert.equal(staged.isPromoted(), true);
    assert.equal(prisma.state.secrets.length, 1);
    assert.equal(prisma.state.secrets[0]?.secretKind, WEB_SESSION_AUTH_SECRET_KIND);
    const loaded = await loadWebSessionAuthState({ prisma: prisma as never, ...scope });
    assert.equal(loaded.ok, true);
    if (loaded.ok) assert.deepEqual(loaded.state, { approvedAfterIdentity: true });
    const staging = await loadWebSessionAuthState({
      prisma: prisma as never,
      ...scope,
      secretKind: WEB_SESSION_AUTH_STAGING_SECRET_KIND,
    });
    assert.equal(staging.ok, true);
    if (staging.ok) assert.equal(staging.state, null);
  } finally {
    if (previous === undefined) delete process.env.CHANNEL_ACCOUNT_SECRET_KEY;
    else process.env.CHANNEL_ACCOUNT_SECRET_KEY = previous;
  }
});

test("durable staged web session auth store promotes after account identity reconciliation", async () => {
  const previous = process.env.CHANNEL_ACCOUNT_SECRET_KEY;
  process.env.CHANNEL_ACCOUNT_SECRET_KEY = "unit-test-channel-account-secret-key";
  try {
    const prisma = makePrisma();
    const initialScope = { tenantKey: "tenant-a", channelAccountId: "session-a" };
    const reconciledScope = { tenantKey: "tenant-a", channelAccountId: "5584999992218" };
    const staged = createDurableStagedWebSessionAuthStore({ prisma: prisma as never });
    await staged.store.save({ ...initialScope, state: { approvedAfterIdentity: true } });

    const account = prisma.state.accounts.find((item) => item.id === "account-a");
    assert.ok(account);
    account.channelAccountId = reconciledScope.channelAccountId;

    assert.deepEqual(await staged.promote(reconciledScope), { ok: true });
    assert.equal(staged.isPromoted(), true);
    assert.equal(prisma.state.secrets.length, 1);
    assert.equal(prisma.state.secrets[0]?.secretKind, WEB_SESSION_AUTH_SECRET_KIND);
    const loaded = await loadWebSessionAuthState({ prisma: prisma as never, ...reconciledScope });
    assert.equal(loaded.ok, true);
    if (loaded.ok) assert.deepEqual(loaded.state, { approvedAfterIdentity: true });
  } finally {
    if (previous === undefined) delete process.env.CHANNEL_ACCOUNT_SECRET_KEY;
    else process.env.CHANNEL_ACCOUNT_SECRET_KEY = previous;
  }
});

test("durable staged web session auth store discards conflicted staging and preserves approved auth", async () => {
  const previous = process.env.CHANNEL_ACCOUNT_SECRET_KEY;
  process.env.CHANNEL_ACCOUNT_SECRET_KEY = "unit-test-channel-account-secret-key";
  try {
    const prisma = makePrisma();
    const scope = { tenantKey: "tenant-a", channelAccountId: "session-a" };
    await saveWebSessionAuthState({ prisma: prisma as never, ...scope, state: { approved: true } });
    const staged = createDurableStagedWebSessionAuthStore({ prisma: prisma as never });
    await staged.store.save({ ...scope, state: { conflict: true } });
    assert.equal(prisma.state.secrets.length, 2);

    assert.deepEqual(await staged.discardPersisted?.(scope), { ok: true });
    assert.equal(prisma.state.secrets.length, 1);
    assert.equal(prisma.state.secrets[0]?.secretKind, WEB_SESSION_AUTH_SECRET_KIND);
    const approved = await loadWebSessionAuthState({ prisma: prisma as never, ...scope });
    assert.equal(approved.ok, true);
    if (approved.ok) assert.deepEqual(approved.state, { approved: true });
  } finally {
    if (previous === undefined) delete process.env.CHANNEL_ACCOUNT_SECRET_KEY;
    else process.env.CHANNEL_ACCOUNT_SECRET_KEY = previous;
  }
});

test("clear all web session auth state removes approved and staging secrets", async () => {
  const previous = process.env.CHANNEL_ACCOUNT_SECRET_KEY;
  process.env.CHANNEL_ACCOUNT_SECRET_KEY = "unit-test-channel-account-secret-key";
  try {
    const prisma = makePrisma();
    const scope = { tenantKey: "tenant-a", channelAccountId: "session-a" };
    await saveWebSessionAuthState({ prisma: prisma as never, ...scope, state: { approved: true } });
    await saveWebSessionAuthState({
      prisma: prisma as never,
      ...scope,
      secretKind: WEB_SESSION_AUTH_STAGING_SECRET_KIND,
      state: { staging: true },
    });
    assert.equal(prisma.state.secrets.length, 2);

    assert.deepEqual(await clearAllWebSessionAuthState({ prisma: prisma as never, ...scope }), { ok: true });
    assert.equal(prisma.state.secrets.length, 0);
  } finally {
    if (previous === undefined) delete process.env.CHANNEL_ACCOUNT_SECRET_KEY;
    else process.env.CHANNEL_ACCOUNT_SECRET_KEY = previous;
  }
});
