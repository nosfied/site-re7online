import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReadinessSummary,
  maskSensitiveIdentifier,
  summarizeOperationalConfig,
  type DemoTenantReadinessCheck,
} from "./demoTenantReadiness";

test("maskSensitiveIdentifier keeps only length and last four digits", () => {
  const masked = maskSensitiveIdentifier("+55 84 99999-6787");

  assert.equal(masked, "****6787 (len 13)");
  assert.ok(!masked?.includes("5584"));
  assert.ok(!masked?.includes("99999"));
});

test("summarizeOperationalConfig reads demo readiness signals without exposing content", () => {
  const summary = summarizeOperationalConfig({
    cannedReplies: [
      { id: "one", title: "Saudacao", body: "Ola", active: true },
      { id: "two", title: "Inativa", body: "Texto", active: false },
    ],
    queueAssignmentPolicy: {
      enabled: false,
      mode: "round_robin",
      scope: "department",
      requireOnline: true,
    },
    metaUsagePolicy: {
      enabled: true,
      mode: "alert_only",
    },
  });

  assert.deepEqual(summary.cannedReplies, { total: 2, active: 1 });
  assert.deepEqual(summary.queueAssignmentPolicy, {
    configured: true,
    enabled: false,
    mode: "round_robin",
    scope: "department",
    requireOnline: true,
    presenceMode: "FRESH",
    presenceModeSource: "legacy_require_online_true",
  });
  assert.deepEqual(summary.metaUsagePolicy, {
    configured: true,
    enabled: true,
    mode: "alert_only",
  });
});

test("buildReadinessSummary escalates WARN and FAIL consistently", () => {
  const checks: DemoTenantReadinessCheck[] = [
    { id: "a", label: "A", status: "OK", message: "ok" },
    { id: "b", label: "B", status: "WARN", message: "warn" },
  ];

  assert.deepEqual(buildReadinessSummary(checks), {
    overallStatus: "WARN",
    summary: { OK: 1, INFO: 0, WARN: 1, PARTIAL: 0, WAITING_EXTERNAL: 0, FAIL: 0 },
  });

  checks.push({ id: "c", label: "C", status: "FAIL", message: "fail" });
  assert.deepEqual(buildReadinessSummary(checks), {
    overallStatus: "FAIL",
    summary: { OK: 1, INFO: 0, WARN: 1, PARTIAL: 0, WAITING_EXTERNAL: 0, FAIL: 1 },
  });
});
