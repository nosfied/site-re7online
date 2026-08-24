import assert from "node:assert/strict";
import test from "node:test";
import {
  canTransitionCampaignStatus,
  isCampaignTerminalStatus,
  normalizeScheduledAt,
} from "./campaignLifecycle.js";

test("campaign lifecycle allows only contractual P1 transitions", () => {
  assert.equal(canTransitionCampaignStatus("draft", "scheduled"), true);
  assert.equal(canTransitionCampaignStatus("draft", "sending"), true);
  assert.equal(canTransitionCampaignStatus("scheduled", "sending"), true);
  assert.equal(canTransitionCampaignStatus("scheduled", "cancelled"), true);
  assert.equal(canTransitionCampaignStatus("sending", "paused"), true);
  assert.equal(canTransitionCampaignStatus("paused", "sending"), true);
  assert.equal(canTransitionCampaignStatus("paused", "cancelled"), true);

  assert.equal(canTransitionCampaignStatus("completed", "sending"), false);
  assert.equal(canTransitionCampaignStatus("failed", "sending"), false);
  assert.equal(canTransitionCampaignStatus("blocked", "sending"), false);
  assert.equal(canTransitionCampaignStatus("cancelled", "sending"), false);
  assert.equal(isCampaignTerminalStatus("completed"), true);
  assert.equal(isCampaignTerminalStatus("paused"), false);
});

test("campaign scheduledAt normalization requires a future UTC instant", () => {
  const now = new Date("2026-08-24T12:00:00.000Z");
  assert.equal(normalizeScheduledAt("bad-date", now), "invalid");
  assert.equal(normalizeScheduledAt("2026-08-24T11:59:59.000Z", now), "past");
  const future = normalizeScheduledAt("2026-08-24T12:01:00.000Z", now);
  assert.ok(future instanceof Date);
  assert.equal(future.toISOString(), "2026-08-24T12:01:00.000Z");
});
