import test from "node:test";
import assert from "node:assert/strict";
import {
  WHATSAPP_SHADOW_REPAIR_CONFIRMATION,
  assertWhatsAppShadowRepairConfirmation,
  buildWhatsAppShadowRepairReport,
  planWhatsAppShadowRepairCandidate,
  shouldLoadWhatsAppShadowRepairCandidate,
  type WhatsAppShadowRepairCandidate,
} from "./whatsappShadowRepairMissing.js";
import {
  hashWhatsAppExternalUser,
  type WhatsAppBackfillClient,
} from "./whatsappBackfillDryRun.js";

const client: WhatsAppBackfillClient = {
  id: "tenant-1",
  clientKey: "re7online",
  phoneNumberIds: ["page-phone-1"],
};

function record(overrides: Partial<WhatsAppShadowRepairCandidate> = {}): WhatsAppShadowRepairCandidate {
  return {
    model: "conversations",
    id: "record-1",
    clientId: "tenant-1",
    clientKey: "re7online",
    waId: "558400000001",
    phoneNumberId: "page-phone-1",
    channel: null,
    provider: null,
    channelAccountId: null,
    externalUserHash: null,
    externalUserRef: null,
    legacyWaId: null,
    ...overrides,
  };
}

test("dry-run candidate with missing fields plans a safe update", () => {
  const plan = planWhatsAppShadowRepairCandidate(record(), client);

  assert.equal(plan.action, "update");
  assert.equal(plan.model, "conversations");
  assert.deepEqual(plan.missingFields.sort(), [
    "channel",
    "channelAccountId",
    "externalUserHash",
    "legacyWaId",
    "provider",
  ].sort());
  assert.equal(plan.updateData?.channel, "whatsapp");
  assert.equal(plan.updateData?.provider, "meta");
});

test("lead with missing fields uses tenant canonical channel account", () => {
  const plan = planWhatsAppShadowRepairCandidate(record({ model: "leads", phoneNumberId: null }), client);

  assert.equal(plan.action, "update");
  assert.equal(plan.model, "leads");
  assert.equal(plan.updateData?.channelAccountId, "page-phone-1");
});

test("inbound message with missing fields is repairable in the targeted repair path", () => {
  const plan = planWhatsAppShadowRepairCandidate(record({ model: "inboundMessages" }), client);

  assert.equal(plan.action, "update");
  assert.equal(plan.model, "inboundMessages");
  assert.deepEqual(plan.missingFields.sort(), [
    "channel",
    "channelAccountId",
    "externalUserHash",
    "legacyWaId",
    "provider",
  ].sort());
  assert.equal(plan.updateData?.channel, "whatsapp");
  assert.equal(plan.updateData?.provider, "meta");
  assert.equal(plan.updateData?.channelAccountId, "page-phone-1");
});

test("execute requires exact confirmation token", () => {
  assert.throws(() => assertWhatsAppShadowRepairConfirmation(undefined, true), /--confirm/);
  assert.throws(() => assertWhatsAppShadowRepairConfirmation("WRONG", true), /--confirm/);
  assert.doesNotThrow(() =>
    assertWhatsAppShadowRepairConfirmation(WHATSAPP_SHADOW_REPAIR_CONFIRMATION, true)
  );
});

test("anonymized records are skipped instead of repaired", () => {
  const plan = planWhatsAppShadowRepairCandidate(record({ waId: "anon:abc" }), client);

  assert.equal(plan.action, "skipped_anonymized");
  assert.equal(plan.reason, "anonymized_or_masked_identity");
});

test("ambiguous channel account aborts as missing expected fields", () => {
  const ambiguousClient: WhatsAppBackfillClient = {
    id: "tenant-1",
    clientKey: "re7online",
    phoneNumberIds: ["phone-a", "phone-b"],
  };
  const plan = planWhatsAppShadowRepairCandidate(record({ phoneNumberId: null }), ambiguousClient);

  assert.equal(plan.action, "missing_expected_fields");
});

test("existing divergent values are not overwritten", () => {
  const plan = planWhatsAppShadowRepairCandidate(
    record({
      channel: "whatsapp",
      provider: "meta",
      channelAccountId: "other-phone",
      externalUserHash: hashWhatsAppExternalUser("558400000001"),
      legacyWaId: "558400000001",
    }),
    client
  );

  assert.equal(plan.action, "conflict");
  assert.deepEqual(plan.divergentFields, ["channelAccountId"]);
});

test("already filled records are detected for idempotence", () => {
  const plan = planWhatsAppShadowRepairCandidate(
    record({
      channel: "whatsapp",
      provider: "meta",
      channelAccountId: "page-phone-1",
      externalUserHash: hashWhatsAppExternalUser("558400000001"),
      legacyWaId: "558400000001",
    }),
    client
  );

  assert.equal(plan.action, "already_filled");
});

test("loader predicate keeps only WhatsApp records with missing fields", () => {
  assert.equal(shouldLoadWhatsAppShadowRepairCandidate(record()), true);
  assert.equal(
    shouldLoadWhatsAppShadowRepairCandidate(
      record({
        channel: "whatsapp",
        provider: "meta",
        channelAccountId: "page-phone-1",
        externalUserHash: hashWhatsAppExternalUser("558400000001"),
        legacyWaId: "558400000001",
      })
    ),
    false
  );
  assert.equal(shouldLoadWhatsAppShadowRepairCandidate(record({ channel: "messenger" })), false);
});

test("report is anti-PII and separates unsafe plans", () => {
  const plans = [
    planWhatsAppShadowRepairCandidate(record(), client),
    planWhatsAppShadowRepairCandidate(record({ id: "record-2", waId: "5584****0002" }), client),
  ];
  const report = buildWhatsAppShadowRepairReport({
    plans,
    tenant: "re7online",
    execute: false,
  });
  const serialized = JSON.stringify(report);

  assert.equal(report.ok, false);
  assert.equal(report.totals.updated, 1);
  assert.equal(report.totals.skippedAnonymized, 1);
  assert.equal(report.byModel.conversations.updated, 1);
  assert.equal(report.byModel.inboundMessages.updated, 0);
  assert.equal(serialized.includes("558400000001"), false);
  assert.equal(serialized.includes("5584****0002"), false);
  assert.equal(serialized.includes("page-phone-1"), false);
  assert.equal(serialized.includes("hash:"), true);
});

test("report separates inbound message repair counts by model", () => {
  const plans = [
    planWhatsAppShadowRepairCandidate(record({ model: "inboundMessages" }), client),
  ];
  const report = buildWhatsAppShadowRepairReport({
    plans,
    tenant: "demo-prefeitura",
    execute: false,
  });

  assert.equal(report.ok, true);
  assert.equal(report.totals.updated, 1);
  assert.equal(report.byModel.inboundMessages.checked, 1);
  assert.equal(report.byModel.inboundMessages.updated, 1);
  assert.equal(report.byModel.conversations.updated, 0);
  assert.equal(report.byModel.leads.updated, 0);
});
