import assert from "node:assert/strict";
import { test } from "node:test";
import {
  compareConversationResolution,
  runWhatsAppDualReadShadow,
  type WhatsAppDualReadPrisma,
} from "./whatsappDualReadShadow.js";
import { hashWhatsAppExternalUser } from "./whatsappBackfillDryRun.js";

function makeLogger() {
  const records: Array<Record<string, unknown>> = [];
  return {
    records,
    logger: {
      info(data: Record<string, unknown>) {
        records.push(data);
      },
      warn(data: Record<string, unknown>) {
        records.push(data);
      },
    },
  };
}

function makePrisma(multichannelRecord: Record<string, unknown> | null): WhatsAppDualReadPrisma {
  return {
    conversation: {
      async findFirst(args: unknown) {
        const where = (args as { where?: Record<string, unknown> }).where ?? {};
        if (where.channel === "whatsapp") return multichannelRecord as never;
        return null;
      },
    },
    conversationRuntimeState: {
      async findFirst(args: unknown) {
        const where = (args as { where?: Record<string, unknown> }).where ?? {};
        if (where.channel === "whatsapp") return multichannelRecord as never;
        return null;
      },
    },
    lead: {
      async findFirst(args: unknown) {
        const where = (args as { where?: Record<string, unknown> }).where ?? {};
        if (where.channel === "whatsapp") return multichannelRecord as never;
        return null;
      },
    },
  };
}

test("flag off does not execute or log", async () => {
  const { logger, records } = makeLogger();
  const result = await runWhatsAppDualReadShadow({
    prisma: makePrisma(null),
    model: "Conversation",
    ownerId: "client-1",
    waId: "558499999999",
    phoneNumberId: "phone-1",
    logger,
    env: { MULTICHANNEL_DUAL_READ: "false" } as NodeJS.ProcessEnv,
  });
  assert.deepEqual(result, { skipped: true, reason: "disabled" });
  assert.equal(records.length, 0);
});

test("flag on logs match without PII", async () => {
  const { logger, records } = makeLogger();
  const waId = "558499999999";
  const hash = hashWhatsAppExternalUser(waId);
  const result = await runWhatsAppDualReadShadow({
    prisma: makePrisma({
      id: "conversation-1",
      clientId: "client-1",
      channelAccountId: "phone-1",
      externalUserHash: hash,
      legacyWaId: waId,
    }),
    model: "Conversation",
    ownerId: "client-1",
    waId,
    phoneNumberId: "phone-1",
    legacyRecord: {
      id: "conversation-1",
      ownerId: "client-1",
      channelAccountId: "phone-1",
      externalUserHash: hash,
      legacyWaId: waId,
    },
    logger,
    env: { MULTICHANNEL_DUAL_READ: "true" } as NodeJS.ProcessEnv,
  });

  assert.equal("sameRecord" in result && result.sameRecord, true);
  assert.equal(records[0]?.event, "multichannel.dual_read.match");
  assert.equal(JSON.stringify(records).includes(waId), false);
  assert.equal(records[0]?.waId, undefined);
  assert.equal(records[0]?.conversationKey, undefined);
});

test("mismatch is reported", () => {
  const result = compareConversationResolution({
    legacy: { id: "legacy-1", ownerId: "client-1" },
    multichannel: { id: "other-1", ownerId: "client-1" },
    expectedOwnerId: "client-1",
    expectedChannelAccountId: "phone-1",
    expectedExternalUserHash: "hash-1",
  });
  assert.equal(result.sameRecord, false);
  assert.equal(result.mismatchReason, "id_mismatch");
});

test("both missing before persist is skipped instead of mismatch", async () => {
  const { logger, records } = makeLogger();
  const result = await runWhatsAppDualReadShadow({
    prisma: makePrisma(null),
    model: "Conversation",
    ownerId: "client-1",
    waId: "558499999999",
    phoneNumberId: "phone-1",
    legacyRecord: null,
    phase: "before_persist",
    logger,
    env: { MULTICHANNEL_DUAL_READ: "true" } as NodeJS.ProcessEnv,
  });
  assert.deepEqual(result, {
    skipped: true,
    reason: "first_seen_both_missing",
    legacyFound: false,
    multichannelFound: false,
  });
  assert.equal(records[0]?.event, "multichannel.dual_read.skipped");
  assert.equal(records[0]?.reason, "first_seen_both_missing");
});

test("multichannel missing before persist is deferred instead of mismatch", async () => {
  const { logger, records } = makeLogger();
  const result = await runWhatsAppDualReadShadow({
    prisma: makePrisma(null),
    model: "ConversationRuntimeState",
    ownerId: "client-1",
    waId: "558499999999",
    phoneNumberId: "phone-1",
    legacyRecord: { id: "runtime-1", ownerId: "client-1" },
    phase: "before_persist",
    logger,
    env: { MULTICHANNEL_DUAL_READ: "true" } as NodeJS.ProcessEnv,
  });
  assert.deepEqual(result, {
    skipped: true,
    reason: "deferred_until_after_initial_persist",
    legacyFound: true,
    multichannelFound: false,
  });
  assert.equal(records[0]?.event, "multichannel.dual_read.skipped");
  assert.equal(records[0]?.reason, "deferred_until_after_initial_persist");
});

test("multichannel missing after persist is a mismatch", async () => {
  const { logger, records } = makeLogger();
  const result = await runWhatsAppDualReadShadow({
    prisma: makePrisma(null),
    model: "ConversationRuntimeState",
    ownerId: "client-1",
    waId: "558499999999",
    phoneNumberId: "phone-1",
    legacyRecord: { id: "runtime-1", ownerId: "client-1" },
    phase: "after_persist",
    logger,
    env: { MULTICHANNEL_DUAL_READ: "true" } as NodeJS.ProcessEnv,
  });
  assert.equal("mismatchReason" in result && result.mismatchReason, "multichannel_missing");
  assert.equal(records[0]?.event, "multichannel.dual_read.mismatch");
});

test("fail-open logs skipped on query error", async () => {
  const { logger, records } = makeLogger();
  const prisma = makePrisma(null);
  prisma.conversation.findFirst = async () => {
    throw new Error("database unavailable");
  };
  const result = await runWhatsAppDualReadShadow({
    prisma,
    model: "Conversation",
    ownerId: "client-1",
    waId: "558499999999",
    phoneNumberId: "phone-1",
    legacyRecord: { id: "conversation-1", ownerId: "client-1" },
    logger,
    env: { MULTICHANNEL_DUAL_READ: "true" } as NodeJS.ProcessEnv,
  });
  assert.deepEqual(result, { skipped: true, reason: "compare_failed" });
  assert.equal(records[0]?.event, "multichannel.dual_read.skipped");
});
