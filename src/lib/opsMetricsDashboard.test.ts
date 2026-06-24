import test from "node:test";
import assert from "node:assert/strict";
import { buildOpsModuleRows, buildOpsSummary } from "./opsMetricsDashboard";
import type { OpsMetricsSnapshot } from "./whatsappAdminApi";

test("ops dashboard handles empty snapshot", () => {
  const summary = buildOpsSummary(null);
  const rows = buildOpsModuleRows(null);

  assert.equal(summary.totalRequests, 0);
  assert.equal(summary.totalErrors, 0);
  assert.equal(summary.requestAvgMs, null);
  assert.equal(summary.requestP95Ms, null);
  assert.ok(rows.some((item) => item.module === "public_api"));
  assert.ok(rows.every((item) => item.requestCount === 0));
});

test("ops dashboard aggregates populated snapshot by module", () => {
  const snapshot: OpsMetricsSnapshot = {
    ok: true,
    generatedAt: "2026-06-24T00:00:00.000Z",
    process: {
      uptimeSeconds: 120,
      memory: { rss: 1024 * 1024 * 128 },
      cpu: { user: 5000, system: 1000 },
    },
    counters: [
      { name: "request_count", labels: { module: "public_api", route: "/public-api/v1/contacts", status: "ok" }, value: 3 },
      { name: "request_count", labels: { module: "webhook", route: "/admin/webhooks", status: "ok" }, value: 2 },
      { name: "http.errors", labels: { module: "webhook", route: "/admin/webhooks", status: "client_error" }, value: 1 },
    ],
    gauges: [{ name: "health.db.status", labels: { module: "health", status: "ok" }, value: 1 }],
    timings: [
      {
        name: "request_duration",
        labels: { module: "public_api", route: "/public-api/v1/contacts", status: "ok" },
        count: 2,
        totalMs: 60,
        avgMs: 30,
        p95Ms: 50,
        minMs: 10,
        maxMs: 50,
        lastMs: 50,
      },
      {
        name: "module_duration",
        labels: { module: "public_api", status: "ok" },
        count: 2,
        totalMs: 60,
        avgMs: 30,
        p95Ms: 50,
        minMs: 10,
        maxMs: 50,
        lastMs: 50,
      },
      {
        name: "db_duration",
        labels: { module: "health", status: "ok" },
        count: 1,
        totalMs: 12,
        avgMs: 12,
        p95Ms: 12,
        minMs: 12,
        maxMs: 12,
        lastMs: 12,
      },
    ],
    averages: [],
  };

  const summary = buildOpsSummary(snapshot);
  const publicApi = buildOpsModuleRows(snapshot).find((item) => item.module === "public_api");
  const webhook = buildOpsModuleRows(snapshot).find((item) => item.module === "webhook");

  assert.equal(summary.dbStatus, 1);
  assert.equal(summary.uptimeSeconds, 120);
  assert.equal(summary.memoryRss, 1024 * 1024 * 128);
  assert.equal(summary.cpuUser, 5000);
  assert.equal(summary.totalRequests, 5);
  assert.equal(summary.totalErrors, 1);
  assert.equal(summary.requestAvgMs, 30);
  assert.equal(summary.requestP95Ms, 50);
  assert.equal(summary.dbP95Ms, 12);
  assert.equal(publicApi?.requestCount, 3);
  assert.equal(publicApi?.avgMs, 30);
  assert.equal(publicApi?.p95Ms, 50);
  assert.equal(webhook?.requestCount, 2);
  assert.equal(webhook?.errors, 1);
});

test("ops dashboard summary does not expose raw metric payload content", () => {
  const snapshot = {
    ok: true,
    generatedAt: "2026-06-24T00:00:00.000Z",
    counters: [
      {
        name: "request_count",
        labels: { module: "public_api", route: "/public-api/v1/contacts", rawPayload: "secret", token: "token" },
        value: 1,
      },
    ],
    gauges: [],
    timings: [],
    averages: [],
  } as unknown as OpsMetricsSnapshot;

  const renderedData = JSON.stringify({
    summary: buildOpsSummary(snapshot),
    rows: buildOpsModuleRows(snapshot),
  });

  assert.equal(renderedData.includes("secret"), false);
  assert.equal(renderedData.includes("token"), false);
});
