import test from "node:test";
import assert from "node:assert/strict";
import {
  WHATSAPP_BACKFILL_CONFIRMATION,
  assertWhatsAppBackfillConfirmation,
  assertWhatsAppBackfillDryRunSafe,
  assertWhatsAppBackfillExecuteAllowed,
  buildWhatsAppBackfillExecuteReport,
  planWhatsAppBackfillRecordUpdate,
  type WhatsAppBackfillExecutableRecord,
} from "./whatsappBackfillExecute.js";
import {
  buildWhatsAppBackfillDryRunReport,
  type WhatsAppBackfillClient,
} from "./whatsappBackfillDryRun.js";

const client: WhatsAppBackfillClient = {
  id: "tenant-1",
  clientKey: "tenant-one",
  phoneNumberIds: ["phone-1"],
};

function record(overrides: Partial<WhatsAppBackfillExecutableRecord> = {}): WhatsAppBackfillExecutableRecord {
  return {
    model: "conversations",
    id: "record-1",
    clientId: "tenant-1",
    clientKey: "tenant-one",
    waId: "558400000001",
    phoneNumberId: "phone-1",
    ...overrides,
  };
}

test("execute is blocked in production unless explicit override is present", () => {
  assert.throws(
    () => assertWhatsAppBackfillExecuteAllowed({ NODE_ENV: "production" }, true),
    /bloqueado/
  );

  assert.doesNotThrow(() =>
    assertWhatsAppBackfillExecuteAllowed(
      { NODE_ENV: "production", ALLOW_PRODUCTION_BACKFILL: "true" },
      true
    )
  );
  assert.doesNotThrow(() => assertWhatsAppBackfillExecuteAllowed({ NODE_ENV: "production" }, false));
});

test("execute requires exact confirmation token", () => {
  assert.throws(() => assertWhatsAppBackfillConfirmation(undefined, true), /--confirm/);
  assert.throws(() => assertWhatsAppBackfillConfirmation("WRONG", true), /--confirm/);
  assert.doesNotThrow(() => assertWhatsAppBackfillConfirmation(WHATSAPP_BACKFILL_CONFIRMATION, true));
});

test("dry-run safety aborts when conflicts or missing channel account exist", () => {
  const unsafe = buildWhatsAppBackfillDryRunReport({
    clients: [{ id: "tenant-1", clientKey: "tenant-one", phoneNumberIds: [] }],
    records: {
      conversations: [record({ phoneNumberId: null })],
      runtimeStates: [],
      inboundMessages: [],
      outboundMessages: [],
      leads: [],
      contacts: [],
    },
  });

  assert.throws(() => assertWhatsAppBackfillDryRunSafe(unsafe), /missingChannelAccountId=1/);
});

test("plan updates records with missing multichannel fields", () => {
  const plan = planWhatsAppBackfillRecordUpdate(record(), client);

  assert.equal(plan.action, "update");
  assert.deepEqual(plan.missingFields.sort(), [
    "channel",
    "channelAccountId",
    "externalUserHash",
    "legacyWaId",
    "provider",
  ].sort());
  assert.equal(plan.updateData?.channel, "whatsapp");
  assert.equal(plan.updateData?.provider, "meta");
  assert.equal(plan.updateData?.channelAccountId, "phone-1");
});

test("plan skips already filled records", () => {
  const plan = planWhatsAppBackfillRecordUpdate(
    record({
      channel: "whatsapp",
      provider: "meta",
      channelAccountId: "phone-1",
      externalUserHash: "eae01f81f9b24927",
      externalUserRef: null,
      legacyWaId: "558400000001",
    }),
    client
  );

  assert.equal(plan.action, "skip");
  assert.equal(plan.reason, "already_filled");
});

test("plan flags divergent existing fields as conflict", () => {
  const plan = planWhatsAppBackfillRecordUpdate(
    record({
      channel: "whatsapp",
      provider: "meta",
      channelAccountId: "other-phone",
      externalUserHash: "eae01f81f9b24927",
      legacyWaId: "558400000001",
    }),
    client
  );

  assert.equal(plan.action, "conflict");
  assert.deepEqual(plan.divergentFields, ["channelAccountId"]);
});

test("execute report does not expose raw waId or phone id", () => {
  const plans = [planWhatsAppBackfillRecordUpdate(record(), client)];
  const report = buildWhatsAppBackfillExecuteReport({
    plans,
    execute: true,
    tenant: "tenant-one",
    sampleLimit: 5,
  });
  const serialized = JSON.stringify(report);

  assert.equal(report.totals.updated, 1);
  assert.equal(serialized.includes("558400000001"), false);
  assert.equal(serialized.includes("phone-1"), false);
  assert.equal(serialized.includes("hash:"), true);
});
