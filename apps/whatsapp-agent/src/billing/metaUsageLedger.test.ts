import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMetaUsageEventPayload,
  estimateMetaBilling,
  inferCountryFromWaId,
} from "./metaUsageLedger.js";

test("inbound usage is not Meta billable", () => {
  const payload = buildMetaUsageEventPayload({
    direction: "inbound",
    source: "unknown",
    messageKind: "free_text",
    templateCategory: "service",
    status: "delivered",
    waId: "5584999990000",
    currentDate: "2026-11-01T00:00:00.000Z",
  });

  assert.equal(payload.estimatedBillable, false);
  assert.equal(payload.billingRule, "non_billable_inbound");
  assert.equal(payload.estimatedMetaCostUsd, null);
});

test("service messages are free before 2026-10-01 and billable with unknown unit cost after", () => {
  const before = buildMetaUsageEventPayload({
    source: "inbox_text",
    messageKind: "free_text",
    templateCategory: "service",
    status: "sent",
    windowOpenAtSend: true,
    currentDate: "2026-09-30T23:59:59.000Z",
  });
  const after = buildMetaUsageEventPayload({
    source: "canned_reply",
    messageKind: "canned_reply",
    templateCategory: "service",
    status: "sent",
    windowOpenAtSend: true,
    currentDate: "2026-10-01T00:00:00.000Z",
  });

  assert.equal(before.estimatedBillable, false);
  assert.equal(before.estimatedMetaUnitCostUsd, 0);
  assert.equal(before.billingRule, "current_service_free");
  assert.equal(after.estimatedBillable, true);
  assert.equal(after.estimatedMetaUnitCostUsd, null);
  assert.equal(after.billingRule, "post_2026_10_service_billable");
});

test("template categories use isolated planning rate card", () => {
  const utility = estimateMetaBilling({
    source: "inbox_template",
    messageKind: "template",
    templateCategory: "UTILITY",
    status: "delivered",
    currentDate: "2026-08-01T00:00:00.000Z",
  });
  const marketing = estimateMetaBilling({
    source: "campaign",
    messageKind: "template",
    templateCategory: "MARKETING",
    status: "delivered",
    currentDate: "2026-08-01T00:00:00.000Z",
  });
  const authentication = estimateMetaBilling({
    source: "manual_campaign_send",
    messageKind: "template",
    templateCategory: "AUTHENTICATION",
    status: "delivered",
    currentDate: "2026-08-01T00:00:00.000Z",
  });

  assert.equal(utility.billingRule, "utility_billable");
  assert.equal(utility.estimatedMetaUnitCostUsd, 0.008);
  assert.equal(marketing.billingRule, "marketing_billable");
  assert.equal(marketing.estimatedMetaUnitCostUsd, 0.0625);
  assert.equal(authentication.billingRule, "authentication_billable");
  assert.equal(authentication.estimatedMetaUnitCostUsd, 0.0315);
});

test("failed messages do not receive final cost and country is inferred safely", () => {
  const payload = buildMetaUsageEventPayload({
    source: "campaign",
    messageKind: "template",
    templateCategory: "marketing",
    status: "failed",
    waId: "5584999991234",
    currentDate: "2026-08-01T00:00:00.000Z",
  });

  assert.equal(payload.deliveryStatus, "failed");
  assert.equal(payload.estimatedBillable, false);
  assert.equal(payload.estimatedMetaCostUsd, null);
  assert.equal(payload.country, "BR");
  assert.equal(payload.waIdLast4, "1234");
  assert.equal(payload.waIdLength, 13);
  assert.equal(inferCountryFromWaId("12125550123"), "unknown");
});

test("usage payload is sanitized and does not contain phone or message body fields", () => {
  const payload = buildMetaUsageEventPayload({
    outboundMessageId: "out-1",
    conversationId: "conv-1",
    campaignId: "campaign-1",
    source: "campaign",
    messageKind: "template",
    templateName: "billing_notice",
    templateCategory: "utility",
    status: "delivered",
    waId: "5584999991234",
    sentAt: "2026-08-01T12:00:00.000Z",
    deliveredAt: "2026-08-01T12:00:05.000Z",
  });
  const serialized = JSON.stringify(payload);

  assert.equal(payload.outboundMessageId, "out-1");
  assert.equal(payload.templateName, "billing_notice");
  assert.equal(payload.waIdLast4, "1234");
  assert.equal(serialized.includes("5584999991234"), false);
  assert.equal("bodyText" in payload, false);
  assert.equal("rawPayload" in payload, false);
  assert.equal("token" in payload, false);
});
