import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildWhatsAppMultichannelIdentity,
  buildWhatsAppMultichannelShadowPatch,
  safeApplyWhatsAppMultichannelShadow,
} from "./whatsappMultichannelShadowWrite.js";

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
      error(data: Record<string, unknown>) {
        records.push(data);
      },
    },
  };
}

test("buildWhatsAppMultichannelIdentity creates stable WhatsApp identity", () => {
  const first = buildWhatsAppMultichannelIdentity({
    waId: "558499999999",
    phoneNumberId: "phone-1",
  });
  const second = buildWhatsAppMultichannelIdentity({
    waId: "558499999999",
    phoneNumberId: "phone-1",
  });

  assert.equal(first?.channel, "whatsapp");
  assert.equal(first?.provider, "meta");
  assert.equal(first?.channelAccountId, "phone-1");
  assert.equal(first?.legacyWaId, "558499999999");
  assert.equal(first?.externalUserRef, null);
  assert.equal(first?.externalUserHash, second?.externalUserHash);
  assert.equal(first?.externalUserHash.length, 16);
});

test("buildWhatsAppMultichannelShadowPatch returns expected fields", () => {
  const identity = buildWhatsAppMultichannelIdentity({
    waId: "558499999999",
    phoneNumberId: "phone-1",
  });
  assert.ok(identity);
  assert.deepEqual(buildWhatsAppMultichannelShadowPatch(identity), {
    channel: "whatsapp",
    provider: "meta",
    channelAccountId: "phone-1",
    externalUserHash: identity.externalUserHash,
    externalUserRef: null,
    legacyWaId: "558499999999",
  });
});

test("safeApply skips when flag is off", async () => {
  const { logger, records } = makeLogger();
  let called = false;
  const result = await safeApplyWhatsAppMultichannelShadow({
    prisma: {
      async $executeRawUnsafe() {
        called = true;
        return 1;
      },
    },
    model: "InboundMessage",
    recordId: "record-1",
    waId: "558499999999",
    phoneNumberId: "phone-1",
    logger,
    env: { MULTICHANNEL_SHADOW_WRITE: "false" } as NodeJS.ProcessEnv,
  });
  assert.equal(result.status, "skipped_disabled");
  assert.equal(called, false);
  assert.equal(records[records.length - 1]?.event, "multichannel.shadow_write.skipped_disabled");
});

test("safeApply writes by id when flag is on", async () => {
  const { logger, records } = makeLogger();
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const result = await safeApplyWhatsAppMultichannelShadow({
    prisma: {
      async $executeRawUnsafe(sql: string, ...values: unknown[]) {
        calls.push({ sql, values });
        return 1;
      },
    },
    model: "InboundMessage",
    recordId: "7c8dc30d-0bcf-43d9-aef8-f94f7b7f84f6",
    clientId: "a2f9681b-5a5e-4945-a03d-2e635c45d071",
    waId: "558499999999",
    phoneNumberId: "phone-1",
    logger,
    env: { MULTICHANNEL_SHADOW_WRITE: "true" } as NodeJS.ProcessEnv,
  });

  assert.equal(result.status, "applied");
  assert.equal(calls.length, 1);
  assert.match(calls[0]?.sql ?? "", /UPDATE "InboundMessage"/);
  assert.equal(calls[0]?.values[0], "whatsapp");
  assert.equal(calls[0]?.values[1], "meta");
  assert.equal(calls[0]?.values[2], "phone-1");
  assert.equal(calls[0]?.values[5], "558499999999");
  assert.equal(records[records.length - 1]?.event, "multichannel.shadow_write.applied");
  assert.equal(JSON.stringify(records).includes("558499999999"), false);
});

test("safeApply is fail-open on missing schema when strict is false", async () => {
  const { logger, records } = makeLogger();
  const result = await safeApplyWhatsAppMultichannelShadow({
    prisma: {
      async $executeRawUnsafe() {
        throw new Error('column "channel" does not exist');
      },
    },
    model: "Lead",
    recordId: "lead-1",
    waId: "558499999999",
    phoneNumberId: "phone-1",
    logger,
    env: {
      MULTICHANNEL_SHADOW_WRITE: "true",
      MULTICHANNEL_SHADOW_STRICT: "false",
    } as NodeJS.ProcessEnv,
  });
  assert.equal(result.status, "skipped_schema_missing");
  assert.equal(records[records.length - 1]?.event, "multichannel.shadow_write.skipped_schema_missing");
});

test("safeApply throws on missing schema when strict is true", async () => {
  await assert.rejects(
    safeApplyWhatsAppMultichannelShadow({
      prisma: {
        async $executeRawUnsafe() {
          throw new Error('column "channel" does not exist');
        },
      },
      model: "Lead",
      recordId: "lead-1",
      waId: "558499999999",
      phoneNumberId: "phone-1",
      logger: makeLogger().logger,
      env: {
        MULTICHANNEL_SHADOW_WRITE: "true",
        MULTICHANNEL_SHADOW_STRICT: "true",
      } as NodeJS.ProcessEnv,
    }),
    /column "channel" does not exist/
  );
});

test("safeApply does not log raw waId on generic failure", async () => {
  const { logger, records } = makeLogger();
  const result = await safeApplyWhatsAppMultichannelShadow({
    prisma: {
      async $executeRawUnsafe() {
        throw new Error("temporary database issue");
      },
    },
    model: "ConversationRuntimeState",
    clientId: "a2f9681b-5a5e-4945-a03d-2e635c45d071",
    waId: "558499999999",
    phoneNumberId: "phone-1",
    logger,
    env: {
      MULTICHANNEL_SHADOW_WRITE: "true",
      MULTICHANNEL_SHADOW_STRICT: "false",
    } as NodeJS.ProcessEnv,
  });
  assert.equal(result.status, "failed");
  assert.equal(JSON.stringify(records).includes("558499999999"), false);
});
