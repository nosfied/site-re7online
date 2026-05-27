import assert from "node:assert/strict";
import { test } from "node:test";
import { buildWhatsAppShadowRolloutCheckReport } from "./whatsappShadowRolloutCheck.js";

const healthyCompare = {
  counts: {
    checked: 10,
    matched: 10,
    missing: 0,
    mismatched: 0,
    warnings: 0,
  },
};

test("rollout check passes with healthy compare, flags and replay", () => {
  const report = buildWhatsAppShadowRolloutCheckReport({
    columnsAvailable: true,
    compareReport: healthyCompare,
    replayPassed: true,
    env: {
      MULTICHANNEL_SHADOW_WRITE: "true",
      MULTICHANNEL_SHADOW_STRICT: "false",
    },
    nowIso: "2026-05-15T00:00:00.000Z",
  });

  assert.equal(report.ok, true);
  assert.equal(report.summary.compareChecked, 10);
  assert.equal(report.summary.shadowWriteEnabled, true);
  assert.equal(report.summary.shadowStrictDisabled, true);
});

test("rollout check blocks when columns are missing", () => {
  const report = buildWhatsAppShadowRolloutCheckReport({
    columnsAvailable: false,
    compareReport: healthyCompare,
    replayPassed: true,
    env: {
      MULTICHANNEL_SHADOW_WRITE: "true",
      MULTICHANNEL_SHADOW_STRICT: "false",
    },
  });

  assert.equal(report.ok, false);
  assert.equal(report.checks.find((check) => check.key === "multichannel_columns_available")?.passed, false);
});

test("rollout check blocks missing or mismatched compare", () => {
  const report = buildWhatsAppShadowRolloutCheckReport({
    columnsAvailable: true,
    compareReport: {
      counts: {
        checked: 10,
        matched: 8,
        missing: 1,
        mismatched: 1,
        warnings: 0,
      },
    },
    replayPassed: true,
    env: {
      MULTICHANNEL_SHADOW_WRITE: "true",
      MULTICHANNEL_SHADOW_STRICT: "false",
    },
  });

  const compare = report.checks.find((check) => check.key === "shadow_compare_healthy");
  assert.equal(report.ok, false);
  assert.equal(compare?.passed, false);
  assert.match(compare?.reason ?? "", /missing=1;mismatched=1/);
});

test("rollout check requires write enabled and strict disabled", () => {
  const report = buildWhatsAppShadowRolloutCheckReport({
    columnsAvailable: true,
    compareReport: healthyCompare,
    replayPassed: true,
    env: {
      MULTICHANNEL_SHADOW_WRITE: "false",
      MULTICHANNEL_SHADOW_STRICT: "true",
    },
  });

  assert.equal(report.ok, false);
  assert.equal(report.summary.shadowWriteEnabled, false);
  assert.equal(report.summary.shadowStrictDisabled, false);
});

test("rollout check blocks when replay did not pass", () => {
  const report = buildWhatsAppShadowRolloutCheckReport({
    columnsAvailable: true,
    compareReport: healthyCompare,
    replayPassed: false,
    env: {
      MULTICHANNEL_SHADOW_WRITE: "true",
      MULTICHANNEL_SHADOW_STRICT: "false",
    },
  });

  assert.equal(report.ok, false);
  assert.equal(report.checks.find((check) => check.key === "replay_passed")?.passed, false);
});
