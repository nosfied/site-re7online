import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { readMetaInboundReadiness } from "./metaInboundReadiness.js";

function fakePrisma(params?: {
  managementOnly?: boolean;
  accountBinding?: string;
  leadingManagementOnly?: boolean;
  humanMessageCount?: number;
}) {
  const openedAt = new Date("2026-11-05T20:00:00.000Z");
  const receivedAt = new Date("2026-11-05T21:11:05.982Z");
  return {
    channelAccount: {
      findMany: async () => [{
        id: "account-1",
        displayName: "Meta principal",
        channelAccountId: params?.accountBinding ?? "meta-phone-1",
        enabled: true,
        runtimeEnabled: true,
        inboundPersistenceEnabled: true,
        status: "connected",
        aliases: [],
      }],
    },
    waPhoneNumber: {
      findMany: async () => [{ phoneNumberId: "meta-phone-1" }],
    },
    tenantMetaConfig: {
      findUnique: async () => ({ phoneNumberId: "meta-phone-1" }),
    },
    tenantOperationalConfig: {
      findUnique: async () => ({
        config: { baseConfig: { allowlist: [], handoffAttendantWaid: "", defaultLanguage: "pt_BR", disableAutoReply: true } },
        updatedAt: new Date("2026-11-05T20:30:00.000Z"),
      }),
    },
    inboundMessage: {
      findMany: async () => [
        ...(params?.leadingManagementOnly ? [{
          id: "inbound-management",
          messageId: "wamid-management",
          waId: "5511999999999",
          waIdCanonical: "5511999999999",
          rawPayload: { inboxVisibility: "management_only" },
          createdAt: new Date(receivedAt.getTime() + 1_000),
        }] : []),
        {
          id: "inbound-1",
          messageId: "wamid-1",
          waId: "5511999999999",
          waIdCanonical: "5511999999999",
          rawPayload: params?.managementOnly ? { inboxVisibility: "management_only" } : { inboxVisibility: "human_timeline" },
          createdAt: receivedAt,
        },
      ],
      count: async (args: { where: { messageId: string } }) =>
        args.where.messageId === "wamid-1" ? params?.humanMessageCount ?? 1 : 0,
    },
    conversation: {
      findMany: async () => [{
        createdAt: openedAt,
        updatedAt: receivedAt,
        lastInboundAt: receivedAt,
        lastOutboundAt: null,
        historyVisibleAfter: openedAt,
      }],
    },
    conversationRuntimeState: {
      findFirst: async () => ({
        status: "WAITING",
        department: { name: "Atendimento Geral" },
        queue: { name: "Fila Geral" },
      }),
    },
  } as unknown as PrismaClient;
}

test("readiness validates one real Meta inbound selected by the human timeline", async () => {
  const readiness = await readMetaInboundReadiness({
    prisma: fakePrisma(),
    clientId: "tenant-1",
    hasCanonicalTenantSource: true,
  });
  assert.equal(readiness.baseConfig.configured, true);
  assert.equal(readiness.baseConfig.canMaterialize, false);
  assert.deepEqual(readiness.accounts[0]?.permissions, {
    enabled: true,
    runtimeEnabled: true,
    inboundPersistenceEnabled: true,
  });
  assert.deepEqual(readiness.accounts[0]?.inboundValidation, {
    validated: true,
    persistedOnce: true,
    visibleInHumanTimeline: true,
    receivedAt: "2026-11-05T21:11:05.982Z",
    departmentName: "Atendimento Geral",
    queueName: "Fila Geral",
    status: "WAITING",
  });
});

test("known Meta identity without ChannelAccount remains visibly unlinked", async () => {
  const prisma = fakePrisma() as unknown as {
    channelAccount: { findMany: () => Promise<unknown[]> };
  };
  prisma.channelAccount.findMany = async () => [];
  const readiness = await readMetaInboundReadiness({
    prisma: prisma as unknown as PrismaClient,
    clientId: "tenant-1",
    hasCanonicalTenantSource: true,
  });
  assert.equal(readiness.accounts.length, 1);
  assert.equal(readiness.accounts[0]?.accountId, null);
  assert.equal(readiness.accounts[0]?.identityLinked, false);
  assert.equal(readiness.accounts[0]?.connected, false);
  assert.equal(readiness.accounts[0]?.inboundValidation.validated, false);
});

test("ChannelAccount without a known tenant Meta identity remains unlinked", async () => {
  const readiness = await readMetaInboundReadiness({
    prisma: fakePrisma({ accountBinding: "unmapped-meta-phone" }),
    clientId: "tenant-1",
    hasCanonicalTenantSource: true,
  });
  const account = readiness.accounts.find((item) => item.accountId === "account-1");
  assert.equal(account?.identityLinked, false);
  assert.equal(account?.connected, true);
  assert.equal(account?.inboundValidation.validated, false);
});

test("persistence uniqueness is checked for the same human message used by the timeline", async () => {
  const readiness = await readMetaInboundReadiness({
    prisma: fakePrisma({ leadingManagementOnly: true, humanMessageCount: 1 }),
    clientId: "tenant-1",
    hasCanonicalTenantSource: true,
  });
  assert.equal(readiness.accounts[0]?.inboundValidation.receivedAt, "2026-11-05T21:11:05.982Z");
  assert.equal(readiness.accounts[0]?.inboundValidation.persistedOnce, true);
  assert.equal(readiness.accounts[0]?.inboundValidation.validated, true);
});

test("an unproven unique persistence does not validate the timeline message", async () => {
  const readiness = await readMetaInboundReadiness({
    prisma: fakePrisma({ humanMessageCount: 2 }),
    clientId: "tenant-1",
    hasCanonicalTenantSource: true,
  });
  assert.equal(readiness.accounts[0]?.inboundValidation.persistedOnce, false);
  assert.equal(readiness.accounts[0]?.inboundValidation.visibleInHumanTimeline, true);
  assert.equal(readiness.accounts[0]?.inboundValidation.validated, false);
});

test("management-only inbound does not certify human Inbox readiness", async () => {
  const readiness = await readMetaInboundReadiness({
    prisma: fakePrisma({ managementOnly: true }),
    clientId: "tenant-1",
    hasCanonicalTenantSource: true,
  });
  assert.equal(readiness.accounts[0]?.inboundValidation.validated, false);
  assert.equal(readiness.accounts[0]?.inboundValidation.persistedOnce, false);
  assert.equal(readiness.accounts[0]?.inboundValidation.visibleInHumanTimeline, false);
});
