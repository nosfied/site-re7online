import assert from "node:assert/strict";
import test from "node:test";
import { buildMetaCostPreview } from "./metaUsagePreview.js";

test("builds utility template cost preview for one and multiple recipients", () => {
  const one = buildMetaCostPreview({
    source: "inbox_template",
    messageKind: "template",
    templateCategory: "UTILITY",
    recipientCount: 1,
    eligibleCount: 1,
    currentDate: new Date("2026-08-01T00:00:00.000Z"),
  });
  assert.equal(one.unitCostUsd, 0.008);
  assert.equal(one.estimatedCostUsd, 0.008);
  assert.equal(one.unknownCostCount, 0);

  const batch = buildMetaCostPreview({
    source: "campaign",
    messageKind: "template",
    templateCategory: "UTILITY",
    recipientCount: 120,
    eligibleCount: 100,
    blockedCount: 20,
    currentDate: new Date("2026-08-01T00:00:00.000Z"),
  });
  assert.equal(batch.estimatedCostUsd, 0.8);
  assert.equal(batch.blockedCount, 20);
  assert.equal(batch.notes.some((note) => note.includes("não entram")), true);
});

test("builds marketing and authentication template previews from the ledger rate card", () => {
  const marketing = buildMetaCostPreview({
    source: "manual_campaign_send",
    messageKind: "template",
    templateCategory: "MARKETING",
    recipientCount: 10,
    eligibleCount: 10,
  });
  assert.equal(marketing.unitCostUsd, 0.0625);
  assert.equal(marketing.estimatedCostUsd, 0.625);
  assert.equal(marketing.warningLevel, "warning");
  assert.equal(marketing.notes.some((note) => note.includes("Marketing")), true);

  const authentication = buildMetaCostPreview({
    source: "campaign",
    messageKind: "template",
    templateCategory: "AUTHENTICATION",
    recipientCount: 2,
    eligibleCount: 2,
  });
  assert.equal(authentication.unitCostUsd, 0.0315);
  assert.equal(authentication.estimatedCostUsd, 0.063);
});

test("handles service previews before and after October 2026 without fixed cost promise", () => {
  const before = buildMetaCostPreview({
    source: "canned_reply",
    messageKind: "canned_reply",
    recipientCount: 1,
    eligibleCount: 1,
    currentDate: new Date("2026-09-30T23:00:00.000Z"),
  });
  assert.equal(before.metaCategory, "service");
  assert.equal(before.unitCostUsd, 0);
  assert.equal(before.estimatedCostUsd, null);
  assert.equal(before.billingRule, "current_service_free");
  assert.equal(JSON.stringify(before).includes("grátis"), false);
  assert.equal(JSON.stringify(before).includes("gratuito"), false);

  const after = buildMetaCostPreview({
    source: "inbox_text",
    messageKind: "free_text",
    recipientCount: 3,
    eligibleCount: 3,
    currentDate: new Date("2026-10-01T00:00:00.000Z"),
  });
  assert.equal(after.unitCostUsd, null);
  assert.equal(after.estimatedCostUsd, null);
  assert.equal(after.unknownCostCount, 3);
  assert.equal(after.billingRule, "post_2026_10_service_billable");
  assert.equal(after.notes.some((note) => note.includes("Valor a confirmar")), true);
});

test("returns unknown cost for unknown country or template category and stays sanitized", () => {
  const preview = buildMetaCostPreview({
    source: "campaign",
    messageKind: "template",
    templateCategory: "UNKNOWN",
    recipientCount: 5,
    eligibleCount: 4,
    blockedCount: 1,
    country: "unknown",
    policy: {
      enabled: true,
      mode: "alert_only",
      monthlyLimitUsd: 1,
      monthlyMessageLimit: null,
      alertThresholds: [70, 90, 100],
      includeEstimatedSent: false,
      includeDeliveredOnly: true,
      categories: { service: true, utility: true, marketing: true, authentication: true },
      effectiveFrom: null,
      contractLabel: null,
      source: "db",
    },
    summary: { deliveredEstimatedCostUsd: 0.9 },
  });
  assert.equal(preview.country, "unknown");
  assert.equal(preview.unitCostUsd, null);
  assert.equal(preview.estimatedCostUsd, null);
  assert.equal(preview.unknownCostCount, 4);
  assert.equal(preview.projectedMonthUsageUsd, 0.9);
  assert.equal(preview.usagePercentAfterSend, 90);
  const serialized = JSON.stringify(preview);
  assert.equal(serialized.includes("5584"), false);
  assert.equal(serialized.includes("bodyText"), false);
  assert.equal(serialized.includes("token"), false);
  assert.equal(serialized.includes("rawPayload"), false);
});
