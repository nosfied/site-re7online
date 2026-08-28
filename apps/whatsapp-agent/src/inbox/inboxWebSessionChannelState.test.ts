import assert from "node:assert/strict";
import test from "node:test";
import { MessageStatus } from "@prisma/client";
import { buildInboxWebSessionChannelStateBatch } from "./inboxWebSessionChannelState.js";

const connectedMetadata = { webSession: { observedState: "CONNECTED" } };

function createPrismaStub(params: {
  accounts?: Array<Record<string, unknown>>;
  outbound?: Array<Record<string, unknown>>;
}) {
  const calls = {
    channelAccountFindMany: 0,
    outboundMessageFindMany: 0,
  };
  return {
    calls,
    prisma: {
      channelAccount: {
        async findMany() {
          calls.channelAccountFindMany += 1;
          return params.accounts ?? [];
        },
      },
      outboundMessage: {
        async findMany(args: { where?: { waId?: { in?: string[] }; waIdCanonical?: { in?: string[] } } }) {
          calls.outboundMessageFindMany += 1;
          const waIds = new Set(args.where?.waId?.in ?? []);
          const canonicalWaIds = new Set(args.where?.waIdCanonical?.in ?? []);
          return (params.outbound ?? []).filter((row) => {
            const waId = String(row.waId ?? "");
            const waIdCanonical = String(row.waIdCanonical ?? "");
            if (waIds.size > 0) return waIds.has(waId);
            if (canonicalWaIds.size > 0) return canonicalWaIds.has(waIdCanonical);
            return false;
          });
        },
      },
    },
  };
}

function channelAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: "channel-current",
    clientId: "client-a",
    channel: "whatsapp",
    provider: "web_session",
    channelAccountId: "558499049614",
    enabled: true,
    outboundEnabled: true,
    runtimeEnabled: true,
    status: "connected",
    metadata: connectedMetadata,
    updatedAt: new Date("2026-08-28T10:00:00.000Z"),
    client: {
      id: "client-a",
      clientKey: "tenant-a",
      status: "ACTIVE",
      features: { whatsappWebSession: true },
    },
    ...overrides,
  };
}

test("batches Web Session readiness and switch warnings with fixed query count", async () => {
  const sources = Array.from({ length: 50 }, (_, index) => ({
    id: `conversation-${index}`,
    waId: `55849904${String(index).padStart(4, "0")}`,
    waIdCanonical: `55849904${String(index).padStart(4, "0")}`,
    channel: "whatsapp",
    provider: "web_session",
    channelAccountId: "558499049614",
  }));
  const { calls, prisma } = createPrismaStub({ accounts: [channelAccount()] });

  const batch = await buildInboxWebSessionChannelStateBatch({
    prisma: prisma as never,
    clientId: "client-a",
    clientKey: "tenant-a",
    sources,
    features: { whatsappWebSession: true },
  });

  assert.equal(batch.queryCount, 3);
  assert.equal(calls.channelAccountFindMany, 1);
  assert.equal(calls.outboundMessageFindMany, 2);
  assert.equal(batch.getOutboundEnabled(sources[0]!), true);
  assert.equal(batch.getSwitchWarning(sources[0]!), null);
});

test("warns when a historical Web Session conversation last sent through another account", async () => {
  const source = {
    id: "conversation-a",
    waId: "558499049614",
    waIdCanonical: "558499049614",
    channel: "whatsapp",
    provider: "web_session",
    channelAccountId: "558499045328",
  };
  const { prisma } = createPrismaStub({
    accounts: [
      channelAccount({ id: "current", channelAccountId: "558499049614", updatedAt: new Date("2026-08-28T10:00:00.000Z") }),
      channelAccount({
        id: "old",
        channelAccountId: "558499045328",
        outboundEnabled: false,
        status: "disconnected",
        metadata: { webSession: { observedState: "QR_REQUIRED" } },
        updatedAt: new Date("2026-08-20T10:00:00.000Z"),
      }),
    ],
    outbound: [
      {
        waId: "558499049614",
        waIdCanonical: "558499049614",
        channelAccountId: "558499045328",
        status: MessageStatus.SENT,
        createdAt: new Date("2026-08-27T10:00:00.000Z"),
      },
    ],
  });

  const batch = await buildInboxWebSessionChannelStateBatch({
    prisma: prisma as never,
    clientId: "client-a",
    clientKey: "tenant-a",
    sources: [source],
    features: { whatsappWebSession: true },
  });

  assert.equal(batch.getOutboundEnabled(source), true);
  assert.deepEqual(batch.getSwitchWarning(source), {
    pending: true,
    previousIdentityMasked: "****5328",
    currentIdentityMasked: "****9614",
  });
});

test("does not warn when the latest sent account has the same provider identity", async () => {
  const source = {
    id: "conversation-a",
    waId: "558499049614",
    waIdCanonical: "558499049614",
    channel: "whatsapp",
    provider: "web_session",
    channelAccountId: "558499049614@s.whatsapp.net",
  };
  const { prisma } = createPrismaStub({
    accounts: [channelAccount({ channelAccountId: "558499049614" })],
    outbound: [
      {
        waId: "558499049614",
        waIdCanonical: "558499049614",
        channelAccountId: "558499049614@s.whatsapp.net",
        status: MessageStatus.SENT,
        createdAt: new Date("2026-08-27T10:00:00.000Z"),
      },
    ],
  });

  const batch = await buildInboxWebSessionChannelStateBatch({
    prisma: prisma as never,
    clientId: "client-a",
    clientKey: "tenant-a",
    sources: [source],
    features: { whatsappWebSession: true },
  });

  assert.equal(batch.getOutboundEnabled(source), true);
  assert.equal(batch.getSwitchWarning(source), null);
});

test("keeps Web Session disabled when there is no connected outbound-capable account", async () => {
  const source = {
    id: "conversation-a",
    waId: "558499049614",
    waIdCanonical: "558499049614",
    channel: "whatsapp",
    provider: "web_session",
    channelAccountId: "558499049614",
  };
  const { prisma } = createPrismaStub({
    accounts: [channelAccount({ outboundEnabled: false })],
  });

  const batch = await buildInboxWebSessionChannelStateBatch({
    prisma: prisma as never,
    clientId: "client-a",
    clientKey: "tenant-a",
    sources: [source],
    features: { whatsappWebSession: true },
  });

  assert.equal(batch.getOutboundEnabled(source), false);
  assert.equal(batch.getSwitchWarning(source), null);
});

test("does not share Web Session channel state across tenants", async () => {
  const source = {
    id: "conversation-a",
    waId: "558499049614",
    waIdCanonical: "558499049614",
    channel: "whatsapp",
    provider: "web_session",
    channelAccountId: "558499049614",
  };
  const { prisma } = createPrismaStub({
    accounts: [
      channelAccount({
        client: {
          id: "client-a",
          clientKey: "other-tenant",
          status: "ACTIVE",
          features: { whatsappWebSession: true },
        },
      }),
    ],
  });

  const batch = await buildInboxWebSessionChannelStateBatch({
    prisma: prisma as never,
    clientId: "client-a",
    clientKey: "tenant-a",
    sources: [source],
    features: { whatsappWebSession: true },
  });

  assert.equal(batch.getOutboundEnabled(source), false);
  assert.equal(batch.getSwitchWarning(source), null);
});

test("leaves non-Web Session channels to the caller fallback without database lookups", async () => {
  const source = {
    id: "conversation-a",
    waId: "558499049614",
    waIdCanonical: "558499049614",
    channel: "whatsapp",
    provider: "meta",
    channelAccountId: "meta-phone-number-id",
  };
  const { calls, prisma } = createPrismaStub({});

  const batch = await buildInboxWebSessionChannelStateBatch({
    prisma: prisma as never,
    clientId: "client-a",
    clientKey: "tenant-a",
    sources: [source],
    features: { whatsappWebSession: true },
  });

  assert.equal(batch.queryCount, 0);
  assert.equal(calls.channelAccountFindMany, 0);
  assert.equal(calls.outboundMessageFindMany, 0);
  assert.equal(batch.getOutboundEnabled(source), undefined);
  assert.equal(batch.getSwitchWarning(source), undefined);
});
