import test from "node:test";
import assert from "node:assert/strict";
import {
  extractWebSessionObservedIdentity,
  normalizeWebSessionObservedIdentity,
  reconcileWebSessionObservedIdentity,
} from "./webSessionIdentity.js";

function makePrisma() {
  const state = {
    accounts: [
      {
        id: "account-a",
        clientId: "client-a",
        channel: "whatsapp",
        provider: "web_session",
        channelAccountId: "5584999990001",
        status: "pending",
        runtimeEnabled: true,
        enabled: true,
        inboundPersistenceEnabled: true,
        outboundEnabled: false,
        automationEnabled: false,
        aiEnabled: false,
        handoffEnabled: false,
        metadata: { webSession: { desiredState: "CONNECTED" } },
        secrets: [] as Array<{ id: string; secretKind: string }>,
      },
      {
        id: "account-b",
        clientId: "client-b",
        channel: "whatsapp",
        provider: "web_session",
        channelAccountId: "5584999990002",
        status: "connected",
        runtimeEnabled: true,
        enabled: true,
        inboundPersistenceEnabled: true,
        outboundEnabled: false,
        automationEnabled: false,
        aiEnabled: false,
        handoffEnabled: false,
        metadata: { webSession: { desiredState: "CONNECTED" } },
        secrets: [{ id: "secret-b", secretKind: "baileysAuthState.v1" }] as Array<{ id: string; secretKind: string }>,
      },
      {
        id: "account-a-old",
        clientId: "client-a",
        channel: "whatsapp",
        provider: "web_session",
        channelAccountId: "5584999990004",
        status: "disconnected",
        runtimeEnabled: false,
        enabled: true,
        inboundPersistenceEnabled: true,
        outboundEnabled: false,
        automationEnabled: false,
        aiEnabled: false,
        handoffEnabled: false,
        metadata: { webSession: { desiredState: "DISCONNECTED" } },
        secrets: [] as Array<{ id: string; secretKind: string }>,
      },
      {
        id: "account-a-active",
        clientId: "client-a",
        channel: "whatsapp",
        provider: "web_session",
        channelAccountId: "5584999990005",
        status: "pending",
        runtimeEnabled: true,
        enabled: true,
        inboundPersistenceEnabled: true,
        outboundEnabled: false,
        automationEnabled: false,
        aiEnabled: false,
        handoffEnabled: false,
        metadata: { webSession: { desiredState: "CONNECTED" } },
        secrets: [] as Array<{ id: string; secretKind: string }>,
      },
      {
        id: "account-a-staging",
        clientId: "client-a",
        channel: "whatsapp",
        provider: "web_session",
        channelAccountId: "5584999990006",
        status: "disconnected",
        runtimeEnabled: false,
        enabled: true,
        inboundPersistenceEnabled: true,
        outboundEnabled: false,
        automationEnabled: false,
        aiEnabled: false,
        handoffEnabled: false,
        metadata: { webSession: { desiredState: "DISCONNECTED", observedState: "DISCONNECTED" } },
        secrets: [{ id: "secret-staging", secretKind: "baileysAuthState.staging.v1" }] as Array<{ id: string; secretKind: string }>,
      },
      {
        id: "account-a-desired",
        clientId: "client-a",
        channel: "whatsapp",
        provider: "web_session",
        channelAccountId: "5584999990007",
        status: "disconnected",
        runtimeEnabled: false,
        enabled: true,
        inboundPersistenceEnabled: true,
        outboundEnabled: false,
        automationEnabled: false,
        aiEnabled: false,
        handoffEnabled: false,
        metadata: { webSession: { desiredState: "CONNECTED", observedState: "DISCONNECTED" } },
        secrets: [] as Array<{ id: string; secretKind: string }>,
      },
      {
        id: "account-meta",
        clientId: "client-a",
        channel: "whatsapp",
        provider: "meta",
        channelAccountId: "5584999990003",
        status: "connected",
        runtimeEnabled: true,
        enabled: true,
        inboundPersistenceEnabled: true,
        outboundEnabled: true,
        automationEnabled: true,
        aiEnabled: true,
        handoffEnabled: true,
        metadata: {},
        secrets: [] as Array<{ id: string; secretKind: string }>,
      },
    ],
    events: [] as Array<{
      clientId: string;
      requestId: string;
      eventName: string;
      payloadJson: unknown;
    }>,
    operationalConfigs: [] as Array<{ clientId: string; config: unknown; schemaVersion: number }>,
  };
  const client = {
    tenantOperationalConfig: {
      findUnique: async (args: { where: { clientId: string } }) =>
        state.operationalConfigs.find((item) => item.clientId === args.where.clientId) ?? null,
      upsert: async (args: {
        where: { clientId: string };
        update: { config: unknown; schemaVersion: number };
        create: { clientId: string; config: unknown; schemaVersion: number };
      }) => {
        const existing = state.operationalConfigs.find((item) => item.clientId === args.where.clientId);
        if (existing) {
          existing.config = args.update.config;
          existing.schemaVersion = args.update.schemaVersion;
          return existing;
        }
        state.operationalConfigs.push(args.create);
        return args.create;
      },
    },
    channelAccount: {
      findUnique: async (args: { where: { id: string } }) =>
        state.accounts.find((item) => item.id === args.where.id) ?? null,
      findFirst: async (args: {
        where: {
          id?: { not: string };
          channel: string;
          provider: string;
          channelAccountId: string;
        };
      }) => {
        const account = state.accounts.find(
          (item) =>
            item.id !== args.where.id?.not &&
            item.channel === args.where.channel &&
            item.provider === args.where.provider &&
            item.channelAccountId === args.where.channelAccountId
        );
        if (!account) return null;
        return {
          ...account,
          secrets: account.secrets.filter((secret) =>
            ["baileysAuthState.v1", "baileysAuthState.staging.v1"].includes(secret.secretKind)
          ),
        };
      },
      update: async (args: {
        where: { id: string };
        data: Partial<typeof state.accounts[number]>;
      }) => {
        const account = state.accounts.find((item) => item.id === args.where.id);
        if (!account) throw new Error("not_found");
        Object.assign(account, args.data);
        return account;
      },
    },
    event: {
      create: async (args: { data: typeof state.events[number] }) => {
        state.events.push(args.data);
      },
    },
  };
  return {
    state,
    prisma: {
      ...client,
      $transaction: async <T>(fn: (tx: typeof client) => Promise<T>) => fn(client),
    },
  };
}

test("normalizes observed web session identity from JID and socket/auth shapes", () => {
  assert.equal(normalizeWebSessionObservedIdentity("5584999990001:12@s.whatsapp.net"), "5584999990001");
  assert.equal(normalizeWebSessionObservedIdentity("not-a-phone@s.whatsapp.net"), null);
  assert.equal(
    extractWebSessionObservedIdentity({ user: { id: "5584999990001:1@s.whatsapp.net" } }),
    "5584999990001"
  );
  assert.equal(
    extractWebSessionObservedIdentity({ creds: { me: { id: "5584999990002@s.whatsapp.net" } } }),
    "5584999990002"
  );
});

test("same number repair preserves account and does not write false event", async () => {
  const { prisma, state } = makePrisma();
  const result = await reconcileWebSessionObservedIdentity({
    prisma: prisma as never,
    accountId: "account-a",
    observedIdentity: "5584999990001@s.whatsapp.net",
    requestId: "same-number",
  });

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.action, "unchanged");
  assert.equal(state.accounts[0]?.channelAccountId, "5584999990001");
  assert.equal(state.events.length, 0);
});

test("different number auto reconciles the same ChannelAccount with sanitized audit event", async () => {
  const { prisma, state } = makePrisma();
  const result = await reconcileWebSessionObservedIdentity({
    prisma: prisma as never,
    accountId: "account-a",
    observedIdentity: "5584999997784:9@s.whatsapp.net",
    requestId: "changed-number",
    source: "unit_test",
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.action, "changed");
    assert.equal(result.previousChannelAccountId, "5584999990001");
    assert.equal(result.channelAccountId, "5584999997784");
  }
  assert.equal(state.accounts[0]?.channelAccountId, "5584999997784");
  assert.equal(state.accounts.length, 7);
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0]?.eventName, "whatsapp.web.identity.changed");
  const payloadText = JSON.stringify(state.events[0]?.payloadJson);
  assert.equal(payloadText.includes("5584999990001"), false);
  assert.equal(payloadText.includes("5584999997784"), false);
  assert.match(payloadText, /"last4":"7784"/);
});

test("cross-tenant web session identity conflict blocks reconciliation", async () => {
  const { prisma, state } = makePrisma();
  const result = await reconcileWebSessionObservedIdentity({
    prisma: prisma as never,
    accountId: "account-a",
    observedIdentity: "5584999990002@s.whatsapp.net",
    requestId: "conflict",
  });

  assert.deepEqual(result, {
    ok: false,
    error: "web_session_identity_conflict",
    conflictAccountId: "account-b",
    conflictClientId: "client-b",
  });
  assert.equal(state.accounts[0]?.channelAccountId, "5584999990001");
  assert.equal(state.events.length, 0);
});

test("authorized number mismatch blocks reconciliation before account mutation", async () => {
  const { prisma, state } = makePrisma();
  const result = await reconcileWebSessionObservedIdentity({
    prisma: prisma as never,
    accountId: "account-a",
    observedIdentity: "5584999997784@s.whatsapp.net",
    expectedIdentity: "5584999990001",
    requestId: "mismatch",
  });

  assert.deepEqual(result, {
    ok: false,
    error: "web_session_identity_mismatch",
    expectedIdentityMasked: "****0001",
    observedIdentityMasked: "****7784",
  });
  assert.equal(state.accounts[0]?.channelAccountId, "5584999990001");
  assert.equal(state.events.length, 0);
});

test("authorized number match allows reconciliation", async () => {
  const { prisma, state } = makePrisma();
  const result = await reconcileWebSessionObservedIdentity({
    prisma: prisma as never,
    accountId: "account-a",
    observedIdentity: "5584999990001@s.whatsapp.net",
    expectedIdentity: "5584999990001",
    requestId: "match",
  });

  assert.equal(result.ok, true);
  assert.equal(state.accounts[0]?.channelAccountId, "5584999990001");
});

test("inactive same-tenant duplicate is archived before identity reconciliation", async () => {
  const { prisma, state } = makePrisma();
  const result = await reconcileWebSessionObservedIdentity({
    prisma: prisma as never,
    accountId: "account-a",
    observedIdentity: "5584999990004@s.whatsapp.net",
    requestId: "same-tenant-duplicate",
    source: "unit_test",
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.action, "changed_archived_same_tenant_duplicate");
    assert.equal(result.archivedConflictAccountId, "account-a-old");
    assert.equal(result.channelAccountId, "5584999990004");
  }
  const archived = state.accounts.find((item) => item.id === "account-a-old");
  assert.equal(archived?.status, "archived_duplicate");
  assert.equal(archived?.enabled, false);
  assert.equal(archived?.runtimeEnabled, false);
  assert.match(archived?.channelAccountId ?? "", /^archived:account-a-old:/);
  assert.equal(state.accounts[0]?.channelAccountId, "5584999990004");
  assert.equal(state.events.length, 2);
  assert.equal(state.events[0]?.eventName, "whatsapp.web.identity.duplicate_archived");
  assert.equal(state.events[1]?.eventName, "whatsapp.web.identity.changed");
  const payloadText = JSON.stringify(state.events);
  assert.equal(payloadText.includes("5584999990004"), false);
  assert.match(payloadText, /"last4":"0004"/);
});

test("active same-tenant duplicate remains blocked", async () => {
  const { prisma, state } = makePrisma();
  const result = await reconcileWebSessionObservedIdentity({
    prisma: prisma as never,
    accountId: "account-a",
    observedIdentity: "5584999990005@s.whatsapp.net",
    requestId: "same-tenant-active-duplicate",
  });

  assert.deepEqual(result, {
    ok: false,
    error: "web_session_identity_conflict",
    conflictAccountId: "account-a-active",
    conflictClientId: "client-a",
  });
  assert.equal(state.accounts[0]?.channelAccountId, "5584999990001");
  assert.equal(state.accounts.find((item) => item.id === "account-a-active")?.channelAccountId, "5584999990005");
  assert.equal(state.events.length, 0);
});

test("same-tenant duplicate with staging auth remains blocked", async () => {
  const { prisma, state } = makePrisma();
  const result = await reconcileWebSessionObservedIdentity({
    prisma: prisma as never,
    accountId: "account-a",
    observedIdentity: "5584999990006@s.whatsapp.net",
    requestId: "same-tenant-staging-duplicate",
  });

  assert.deepEqual(result, {
    ok: false,
    error: "web_session_identity_conflict",
    conflictAccountId: "account-a-staging",
    conflictClientId: "client-a",
  });
  assert.equal(state.accounts[0]?.channelAccountId, "5584999990001");
  assert.equal(state.accounts.find((item) => item.id === "account-a-staging")?.channelAccountId, "5584999990006");
  assert.equal(state.events.length, 0);
});

test("same-tenant duplicate with desired connected remains blocked", async () => {
  const { prisma, state } = makePrisma();
  const result = await reconcileWebSessionObservedIdentity({
    prisma: prisma as never,
    accountId: "account-a",
    observedIdentity: "5584999990007@s.whatsapp.net",
    requestId: "same-tenant-desired-duplicate",
  });

  assert.deepEqual(result, {
    ok: false,
    error: "web_session_identity_conflict",
    conflictAccountId: "account-a-desired",
    conflictClientId: "client-a",
  });
  assert.equal(state.accounts[0]?.channelAccountId, "5584999990001");
  assert.equal(state.accounts.find((item) => item.id === "account-a-desired")?.channelAccountId, "5584999990007");
  assert.equal(state.events.length, 0);
});

test("repeated pairing with reconciled number is idempotent", async () => {
  const { prisma, state } = makePrisma();
  await reconcileWebSessionObservedIdentity({
    prisma: prisma as never,
    accountId: "account-a",
    observedIdentity: "5584999997784@s.whatsapp.net",
    requestId: "changed-number",
  });
  const second = await reconcileWebSessionObservedIdentity({
    prisma: prisma as never,
    accountId: "account-a",
    observedIdentity: "5584999997784@s.whatsapp.net",
    requestId: "changed-number-repeat",
  });

  assert.equal(second.ok, true);
  if (second.ok) assert.equal(second.action, "unchanged");
  assert.equal(state.accounts[0]?.channelAccountId, "5584999997784");
  assert.equal(state.events.length, 1);
});
