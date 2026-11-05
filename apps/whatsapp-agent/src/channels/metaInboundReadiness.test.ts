import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { readMetaInboundReadiness } from "./metaInboundReadiness.js";

function fakePrisma(params?: { managementOnly?: boolean }) {
  const openedAt = new Date("2026-11-05T20:00:00.000Z");
  const receivedAt = new Date("2026-11-05T21:11:05.982Z");
  return {
    channelAccount: {
      findMany: async () => [{
        id: "account-1",
        displayName: "Meta principal",
        channelAccountId: "meta-phone-1",
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
      findMany: async () => [{
        id: "inbound-1",
        messageId: "wamid-1",
        waId: "5511999999999",
        waIdCanonical: "5511999999999",
        rawPayload: params?.managementOnly ? { inboxVisibility: "management_only" } : { inboxVisibility: "human_timeline" },
        createdAt: receivedAt,
      }],
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

test("management-only inbound does not certify human Inbox readiness", async () => {
  const readiness = await readMetaInboundReadiness({
    prisma: fakePrisma({ managementOnly: true }),
    clientId: "tenant-1",
    hasCanonicalTenantSource: true,
  });
  assert.equal(readiness.accounts[0]?.inboundValidation.validated, false);
  assert.equal(readiness.accounts[0]?.inboundValidation.persistedOnce, true);
  assert.equal(readiness.accounts[0]?.inboundValidation.visibleInHumanTimeline, false);
});
