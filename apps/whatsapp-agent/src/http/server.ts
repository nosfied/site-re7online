import http from "node:http";
import crypto from "node:crypto";
import { handleRequest } from "./routes.js";
import { classifyMetricModule, metrics, normalizeMetricRoute } from "../metrics/internalMetrics.js";
import { logger } from "../logger/logger.js";

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

type RequestHandler = typeof handleRequest;

function getHeaderValue(req: http.IncomingMessage, name: string) {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? "";
  return typeof value === "string" ? value : "";
}

function respondWithUnhandledRequestError(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  error: unknown
) {
  const requestId = getHeaderValue(req, "x-request-id") || crypto.randomUUID();
  logger.error({
    event: "http.request.unhandled_error",
    requestId,
    method: req.method ?? "GET",
    path: req.url ? new URL(req.url, "http://localhost").pathname : "/",
    errorName: error instanceof Error ? error.name : typeof error,
  });
  if (res.writableEnded || res.destroyed) return;
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: "server_error", requestId }));
}

export function createServer(handler: RequestHandler = handleRequest) {
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
    void handler(req, res).catch((error: unknown) => {
      respondWithUnhandledRequestError(req, res, error);
    });
  });
}
