import { IncomingMessage, ServerResponse } from "node:http";
import { healthRoute } from "./health.route.js";
import { verifyWebhook, receiveWebhook } from "../whatsapp/webhook.controller.js";

export function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const url = req.url ?? "/";

  if (req.method === "GET" && url === "/health") {
    return healthRoute(res);
  }

  if (req.method === "GET" && url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("whatsapp-agent running");
    return;
  }

  if (url.startsWith("/webhook")) {
    if (req.method === "GET") {
      return verifyWebhook(req, res);
    }
    if (req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        receiveWebhook(req, res, body);
      });
      return;
    }
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not_found" }));
}
