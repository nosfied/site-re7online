import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyMetricModule,
  getMetricsSnapshot,
  metrics,
  normalizeMetricRoute,
  resetMetricsForTest,
  sanitizeMetricLabels,
} from "./internalMetrics.js";

test("metrics counter, gauge and timing aggregate values", () => {
  resetMetricsForTest();

  metrics.counter("http.requests", { module: "public_api", route: "/public-api/v1/contacts", statusCode: 200 });
  metrics.counter("http.requests", { module: "public_api", route: "/public-api/v1/contacts", statusCode: 200 });
  metrics.gauge("health.db.status", 1, { module: "health", status: "ok" });
  metrics.timing("http.request.duration", 10, { module: "public_api", route: "/public-api/v1/contacts" });
  metrics.timing("http.request.duration", 30, { module: "public_api", route: "/public-api/v1/contacts" });

  const snapshot = getMetricsSnapshot();
  assert.equal(snapshot.ok, true);
  assert.equal(snapshot.counters[0].name, "http.requests");
  assert.equal(snapshot.counters[0].value, 2);
  assert.equal(snapshot.gauges[0].name, "health.db.status");
  assert.equal(snapshot.gauges[0].value, 1);
  assert.equal(snapshot.timings[0].count, 2);
  assert.equal(snapshot.timings[0].totalMs, 40);
  assert.equal(snapshot.timings[0].avgMs, 20);
  assert.equal(snapshot.timings[0].p95Ms, 30);
  assert.equal(snapshot.timings[0].minMs, 10);
  assert.equal(snapshot.timings[0].maxMs, 30);
  assert.equal(snapshot.averages[0].avgMs, 20);
  assert.equal(snapshot.averages[0].p95Ms, 30);
  assert.ok(snapshot.process.uptimeSeconds >= 0);
  assert.ok(snapshot.process.memory.rss > 0);
  assert.ok(snapshot.gauges.some((item) => item.name === "process.memory.rss.bytes"));
});

test("metric labels are allowlisted and redact PII/secrets", () => {
  const labels = sanitizeMetricLabels({
    tenantId: "tenant-1",
    module: "mfa",
    route: "/auth/mfa/verify",
    token: "secret-token",
    email: "admin@example.com",
    phone: "+55 11 99999-1234",
    status: "Bearer token",
  });

  assert.deepEqual(labels, {
    module: "mfa",
    route: "/auth/mfa/verify",
    status: "[redacted]",
    tenantId: "tenant-1",
  });
  assert.equal(JSON.stringify(labels).includes("admin@example.com"), false);
  assert.equal(JSON.stringify(labels).includes("99999"), false);
  assert.equal(JSON.stringify(labels).includes("secret-token"), false);
});

test("runtime metric aliases and tenant labels stay low-cardinality", () => {
  resetMetricsForTest();

  metrics.counter("request_count", {
    tenantId: "tenant-1",
    module: "public_api",
    route: "/public-api/v1/contacts/:id",
    status: "ok",
    statusCode: "200",
    userId: "user-should-not-be-kept",
  });
  metrics.timing("dependency_duration", 42, {
    tenantId: "tenant-1",
    module: "health",
    dependency: "db",
    operation: "select_1",
    status: "ok",
    email: "admin@example.com",
  });

  const snapshot = getMetricsSnapshot();
  const requestCount = snapshot.counters.find((item) => item.name === "request_count");
  const dependencyDuration = snapshot.timings.find((item) => item.name === "dependency_duration");

  assert.deepEqual(requestCount?.labels, {
    module: "public_api",
    route: "/public-api/v1/contacts/:id",
    status: "ok",
    statusCode: "200",
    tenantId: "tenant-1",
  });
  assert.deepEqual(dependencyDuration?.labels, {
    dependency: "db",
    module: "health",
    operation: "select_1",
    status: "ok",
    tenantId: "tenant-1",
  });
  assert.equal(JSON.stringify(snapshot).includes("user-should-not-be-kept"), false);
  assert.equal(JSON.stringify(snapshot).includes("admin@example.com"), false);
});

test("snapshot exposes process diagnostics without secrets", () => {
  resetMetricsForTest();

  const snapshot = getMetricsSnapshot();
  assert.equal(snapshot.ok, true);
  assert.equal(typeof snapshot.process.uptimeSeconds, "number");
  assert.equal(typeof snapshot.process.memory.heapUsed, "number");
  assert.equal(typeof snapshot.process.cpu.user, "number");
  assert.ok(snapshot.gauges.some((item) => item.name === "process.cpu.user.micros"));
  assert.equal(JSON.stringify(snapshot).includes("authorization"), false);
  assert.equal(JSON.stringify(snapshot).includes("cookie"), false);
});

test("metric route normalization and module classification avoid raw identifiers", () => {
  assert.equal(
    normalizeMetricRoute("/public-api/v1/conversations/123e4567-e89b-12d3-a456-426614174000/messages"),
    "/public-api/v1/conversations/:id/messages"
  );
  assert.equal(normalizeMetricRoute("/webchat/v1/session/abcdefghijklmnopqrstuvwxyz"), "/webchat/v1/session/:id");
  assert.equal(classifyMetricModule("/public-api/v1/contacts"), "public_api");
  assert.equal(classifyMetricModule("/admin/ops/metrics"), "admin");
  assert.equal(classifyMetricModule("/app/search"), "search");
  assert.equal(classifyMetricModule("/auth/login"), "auth");
  assert.equal(classifyMetricModule("/auth/mfa/verify"), "mfa");
});
