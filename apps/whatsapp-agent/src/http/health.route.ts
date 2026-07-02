import { ServerResponse } from "node:http";
import { getPrisma } from "../db.js";
import { metrics } from "../metrics/internalMetrics.js";
import { recordAvailabilitySnapshot } from "../metrics/operationalSlaEvidence.js";

export async function healthRoute(res: ServerResponse) {
  const timestamp = new Date().toISOString();
  const dbStartedAt = Date.now();
  try {
    await getPrisma().$queryRawUnsafe("SELECT 1");
    const dbDurationMs = Date.now() - dbStartedAt;
    metrics.gauge("health.db.status", 1, { module: "health", status: "ok" });
    metrics.gauge("process.uptime.seconds", Math.round(process.uptime()), { module: "health" });
    metrics.timing("db_duration", dbDurationMs, { module: "health", operation: "select_1", status: "ok" });
    metrics.timing("dependency_duration", dbDurationMs, { dependency: "db", module: "health", operation: "select_1", status: "ok" });
    recordAvailabilitySnapshot({
      service: "api",
      ok: true,
      dbOk: true,
      uptimeSeconds: Math.round(process.uptime()),
      source: "health",
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        db: "ok",
        uptime: Math.round(process.uptime()),
        timestamp,
      })
    );
    return;
  } catch {
    const dbDurationMs = Date.now() - dbStartedAt;
    metrics.gauge("health.db.status", 0, { module: "health", status: "error" });
    metrics.gauge("process.uptime.seconds", Math.round(process.uptime()), { module: "health" });
    metrics.timing("db_duration", dbDurationMs, { module: "health", operation: "select_1", status: "error" });
    metrics.timing("dependency_duration", dbDurationMs, { dependency: "db", module: "health", operation: "select_1", status: "error" });
    recordAvailabilitySnapshot({
      service: "api",
      ok: false,
      dbOk: false,
      uptimeSeconds: Math.round(process.uptime()),
      source: "health",
    });
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: false,
        db: "error",
        uptime: Math.round(process.uptime()),
        timestamp,
      })
    );
  }
}
