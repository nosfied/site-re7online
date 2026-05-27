import http from "node:http";
import { handleRequest } from "./routes.js";

const ALLOWED_ORIGIN = "http://localhost:3000";
const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const ALLOWED_HEADERS = "Content-Type, Authorization, X-Admin-Token";

function applyCors(req: http.IncomingMessage, res: http.ServerResponse) {
  const origin = typeof req.headers.origin === "string" ? req.headers.origin.trim() : "";
  if (origin === ALLOWED_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
    res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
  }
}

export function createServer() {
  return http.createServer((req, res) => {
    applyCors(req, res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    void handleRequest(req, res);
  });
}
