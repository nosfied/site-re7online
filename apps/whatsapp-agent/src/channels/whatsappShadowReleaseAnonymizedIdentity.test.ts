import test from "node:test";
import assert from "node:assert/strict";
import {
  WHATSAPP_SHADOW_RELEASE_CONFIRMATION,
  assertWhatsAppShadowReleaseConfirmation,
  buildWhatsAppShadowReleaseReport,
  isReleasableAnonymizedIdentity,
  planWhatsAppShadowReleaseRecord,
  type WhatsAppShadowReleaseCollisionRecord,
} from "./whatsappShadowReleaseAnonymizedIdentity.js";

function record(overrides: Partial<WhatsAppShadowReleaseCollisionRecord> = {}): WhatsAppShadowReleaseCollisionRecord {
  return {
    model: "conversations",
    recordId: "old-record-1",
    tenantKey: "re7online",
    waId: "anon:old-record",
    channel: "whatsapp",
    provider: "meta",
    channelAccountId: "phone-1",
    externalUserHash: "hash-user-1",
    externalUserRef: null,
    legacyWaId: "558400000001",
    anonymizedAt: new Date("2026-05-16T00:00:00.000Z"),
    deletedAt: new Date("2026-05-16T00:00:00.000Z"),
    ...overrides,
  };
}

test("execute requires exact confirmation token", () => {
  assert.throws(() => assertWhatsAppShadowReleaseConfirmation(undefined, true), /--confirm/);
  assert.throws(() => assertWhatsAppShadowReleaseConfirmation("WRONG", true), /--confirm/);
  assert.doesNotThrow(() =>
    assertWhatsAppShadowReleaseConfirmation(WHATSAPP_SHADOW_RELEASE_CONFIRMATION, true)
  );
});

test("only deleted, anonymized or masked records are releasable", () => {
  assert.equal(isReleasableAnonymizedIdentity(record()), true);
  assert.equal(isReleasableAnonymizedIdentity(record({ anonymizedAt: null, deletedAt: null, waId: "5584****0001" })), true);
  assert.equal(isReleasableAnonymizedIdentity(record({ anonymizedAt: null, deletedAt: null, waId: "558400000001" })), false);
});

test("anonymized collision plans identity release", () => {
  const plan = planWhatsAppShadowReleaseRecord(record(), {
    model: "conversations",
    recordId: "active-record-1",
  });

  assert.equal(plan.action, "release");
  assert.equal(plan.reason, "collides_with_active_missing");
  assert.equal(plan.collisionTargetModel, "conversations");
});

test("active non-anonymized collision is skipped as unsafe", () => {
  const plan = planWhatsAppShadowReleaseRecord(
    record({ waId: "558400000001", anonymizedAt: null, deletedAt: null }),
    { model: "conversations", recordId: "active-record-1" }
  );

  assert.equal(plan.action, "skip");
  assert.equal(plan.reason, "not_anonymized_or_deleted");
});

test("already released record is idempotent", () => {
  const plan = planWhatsAppShadowReleaseRecord(
    record({
      channelAccountId: null,
      externalUserHash: null,
      externalUserRef: null,
      legacyWaId: null,
    }),
    { model: "conversations", recordId: "active-record-1" }
  );

  assert.equal(plan.action, "already_released");
});

test("report separates release, idempotence and unsafe skip without PII", () => {
  const plans = [
    planWhatsAppShadowReleaseRecord(record(), { model: "conversations", recordId: "active-record-1" }),
    planWhatsAppShadowReleaseRecord(
      record({ recordId: "old-record-2", channelAccountId: null, externalUserHash: null, legacyWaId: null }),
      { model: "conversations", recordId: "active-record-1" }
    ),
    planWhatsAppShadowReleaseRecord(
      record({ recordId: "old-record-3", waId: "558400000003", anonymizedAt: null, deletedAt: null }),
      { model: "leads", recordId: "active-lead-1" }
    ),
  ];
  const report = buildWhatsAppShadowReleaseReport({
    plans,
    tenant: "re7online",
  });
  const serialized = JSON.stringify(report);

  assert.equal(report.ok, false);
  assert.equal(report.totals.released, 1);
  assert.equal(report.totals.alreadyReleased, 1);
  assert.equal(report.totals.skipped, 1);
  assert.equal(serialized.includes("558400000001"), false);
  assert.equal(serialized.includes("558400000003"), false);
  assert.equal(serialized.includes("phone-1"), false);
  assert.equal(serialized.includes("hash:"), true);
});
