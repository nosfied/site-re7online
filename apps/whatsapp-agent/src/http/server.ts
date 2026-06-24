import http from "node:http";
import { handleRequest } from "./routes.js";
import { classifyMetricModule, metrics, normalizeMetricRoute } from "../metrics/internalMetrics.js";

const ALLOWED_ORIGIN = "http://localhost:3000";
const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const ALLOWED_HEADERS = "Content-Type, Authorization, X-Admin-Token";
let inFlightRequests = 0;

function applyCors(req: http.IncomingMessage, res: http.ServerResponse) {
  const origin = typeof req.headers.origin === "string" ? req.headers.origin.trim() : "";
  const url = req.url ?? "/";
  const pathname = url.startsWith("http") ? new URL(url).pathname : new URL(url, "http://localhost").pathname;
  const isPublicWebchat = pathname.startsWith("/webchat/v1/") || pathname.startsWith("/agent-api/webchat/v1/");
  if (origin === ALLOWED_ORIGIN || (isPublicWebchat && origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
    res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
  }
}

export function createServer() {
  return http.createServer((req, res) => {
    const startedAt = Date.now();
    inFlightRequests += 1;
    const url = req.url ?? "/";
    const pathname = url.startsWith("http") ? new URL(url).pathname : new URL(url, "http://localhost").pathname;
    res.once("finish", () => {
      inFlightRequests = Math.max(0, inFlightRequests - 1);
      const durationMs = Date.now() - startedAt;
      const module = classifyMetricModule(pathname);
      const route = normalizeMetricRoute(pathname);
      const status = res.statusCode >= 500 ? "server_error" : res.statusCode >= 400 ? "client_error" : "ok";
      const labels = {
        method: req.method ?? "GET",
        module,
        route,
        status,
        statusCode: String(res.statusCode),
        tenantId: "unknown",
      };
      metrics.counter("http.requests", labels);
      metrics.counter("request_count", labels);
      if (res.statusCode >= 500) {
        metrics.counter("http.errors", { ...labels, status: "server_error" });
      } else if (res.statusCode >= 400) {
        metrics.counter("http.errors", { ...labels, status: "client_error" });
      }
      metrics.timing("http.request.duration", durationMs, labels);
      metrics.timing("request_duration", durationMs, labels);
      metrics.timing("route_duration", durationMs, labels);
      metrics.timing("module_duration", durationMs, { module, status, tenantId: "unknown" });
      metrics.gauge("http.request.inflight", inFlightRequests, { module });
    });
    applyCors(req, res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    void handleRequest(req, res);
  });
}
