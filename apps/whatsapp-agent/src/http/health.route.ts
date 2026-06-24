import { ServerResponse } from "node:http";
import { getPrisma } from "../db.js";
import { metrics } from "../metrics/internalMetrics.js";

export async function healthRoute(res: ServerResponse) {
  const timestamp = new Date().toISOString();
  try {
    await getPrisma().$queryRawUnsafe("SELECT 1");
    metrics.gauge("health.db.status", 1, { module: "health", status: "ok" });
    metrics.gauge("process.uptime.seconds", Math.round(process.uptime()), { module: "health" });
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
    metrics.gauge("health.db.status", 0, { module: "health", status: "error" });
    metrics.gauge("process.uptime.seconds", Math.round(process.uptime()), { module: "health" });
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
