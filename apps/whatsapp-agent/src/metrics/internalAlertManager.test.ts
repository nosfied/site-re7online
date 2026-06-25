import test from "node:test";
import assert from "node:assert/strict";
import { acknowledgeInternalAlert, evaluateInternalAlerts, resetInternalAlertsForTest } from "./internalAlertManager.js";
import { getMetricsSnapshot, metrics, resetMetricsForTest } from "./internalMetrics.js";

test("thresholds create alerts and dedupe repeated evaluations", () => {
  resetMetricsForTest();
  resetInternalAlertsForTest();

  metrics.gauge("health.db.status", 0, { module: "health", status: "error" });
  metrics.counter("http.errors", { module: "app", route: "/app/test", status: "server_error" }, 11);
  metrics.timing("request_duration", 5000, { module: "app", route: "/app/test", status: "ok" });
  metrics.gauge("process.memory.rss.bytes", 600 * 1024 * 1024, { module: "app" });

  const first = evaluateInternalAlerts(getMetricsSnapshot());
  const second = evaluateInternalAlerts(getMetricsSnapshot());

  assert.equal(first.counts.active, 5);
  assert.equal(second.counts.active, 5);
  assert.ok(second.active.every((alert) => alert.occurrences >= 2));
  assert.equal(JSON.stringify(second).includes("admin@example.com"), false);
  assert.equal(JSON.stringify(second).includes("Bearer"), false);
});

test("acknowledge marks an active alert without resolving it", () => {
  resetMetricsForTest();
  resetInternalAlertsForTest();

  metrics.gauge("health.db.status", 0, { module: "health", status: "error" });
  const snapshot = evaluateInternalAlerts(getMetricsSnapshot());
  const alert = snapshot.active[0];
  assert.ok(alert);

  const acknowledged = acknowledgeInternalAlert(alert.id);
  const after = evaluateInternalAlerts(getMetricsSnapshot());

  assert.equal(acknowledged?.acknowledged, true);
  assert.equal(after.acknowledged.length, 1);
  assert.equal(after.active.find((item) => item.id === alert.id)?.status, "active");
});

test("alerts resolve automatically when conditions clear", () => {
  resetMetricsForTest();
  resetInternalAlertsForTest();

  metrics.gauge("health.db.status", 0, { module: "health", status: "error" });
  const active = evaluateInternalAlerts(getMetricsSnapshot());
  assert.equal(active.counts.active, 2);

  resetMetricsForTest();
  metrics.gauge("health.db.status", 1, { module: "health", status: "ok" });
  const resolved = evaluateInternalAlerts(getMetricsSnapshot());

  assert.equal(resolved.counts.active, 0);
  assert.equal(resolved.counts.resolved, 2);
  assert.ok(resolved.resolved.every((alert) => alert.resolvedAt));
});

test("snapshot does not expose arbitrary PII labels", () => {
  resetMetricsForTest();
  resetInternalAlertsForTest();

  metrics.counter("http.errors", {
    module: "public_api",
    route: "/public-api/v1/contacts",
    status: "server_error",
    tenantId: "tenant-1",
    email: "admin@example.com",
  }, 20);
  const snapshot = evaluateInternalAlerts(getMetricsSnapshot());
  const serialized = JSON.stringify(snapshot);

  assert.equal(serialized.includes("admin@example.com"), false);
  assert.equal(serialized.includes("secret"), false);
  assert.equal(snapshot.active.some((alert) => alert.source === "runtime"), true);
});
