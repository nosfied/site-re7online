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
        metadata: { webSession: { desiredState: "CONNECTED" } },
      },
      {
        id: "account-b",
        clientId: "client-b",
        channel: "whatsapp",
        provider: "web_session",
        channelAccountId: "5584999990002",
        metadata: { webSession: { desiredState: "CONNECTED" } },
      },
      {
        id: "account-meta",
        clientId: "client-a",
        channel: "whatsapp",
        provider: "meta",
        channelAccountId: "5584999990003",
        metadata: {},
      },
    ],
    events: [] as Array<{
      clientId: string;
      requestId: string;
      eventName: string;
      payloadJson: unknown;
    }>,
  };
  const client = {
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
      }) =>
        state.accounts.find(
          (item) =>
            item.id !== args.where.id?.not &&
            item.channel === args.where.channel &&
            item.provider === args.where.provider &&
            item.channelAccountId === args.where.channelAccountId
        ) ?? null,
      update: async (args: {
        where: { id: string };
        data: { channelAccountId?: string; metadata?: unknown };
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
  assert.equal(state.accounts.length, 3);
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
