import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { logger } from "../../whatsapp-agent/src/logger/logger.js";
import { getWebSessionQrFromRuntime } from "../../whatsapp-agent/src/web-session/webSessionConnectionRuntime.js";

function json(res: ServerResponse, status: number, body: Record<string, unknown>) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function hasValidToken(req: IncomingMessage, expectedToken: string | undefined) {
  if (!expectedToken) return true;
  return req.headers.authorization === `Bearer ${expectedToken}`;
}

function getQrAccountId(pathname: string) {
  const match = pathname.match(/^\/web-session\/accounts\/([^/]+)\/qr$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function startWebSessionControlServer(params: {
  port: number;
  host?: string;
  token?: string;
}) {
  const host = params.host ?? "127.0.0.1";
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
    if (req.method !== "GET") {
      json(res, 405, { ok: false, error: "method_not_allowed" });
      return;
    }
    if (!hasValidToken(req, params.token)) {
      json(res, 401, { ok: false, error: "unauthorized" });
      return;
    }
    if (url.pathname === "/health") {
      json(res, 200, { ok: true });
      return;
    }
    const accountId = getQrAccountId(url.pathname);
    if (!accountId) {
      json(res, 404, { ok: false, error: "not_found" });
      return;
    }
    json(res, 200, { ok: true, qr: getWebSessionQrFromRuntime(accountId) });
  });
  server.listen(params.port, host, () => {
    logger.info({
      event: "whatsapp.web.worker.control.started",
      host,
      port: params.port,
      auth: params.token ? "configured" : "not_configured",
    });
  });
  return server;
}
