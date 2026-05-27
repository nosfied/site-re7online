import { ServerResponse } from "node:http";
import { getPrisma } from "../db.js";

export async function healthRoute(res: ServerResponse) {
  const timestamp = new Date().toISOString();
  try {
    await getPrisma().$queryRawUnsafe("SELECT 1");
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
