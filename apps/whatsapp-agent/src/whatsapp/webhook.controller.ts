import { IncomingMessage, ServerResponse } from "node:http";

export function verifyWebhook(_req: IncomingMessage, res: ServerResponse) {
  res.writeHead(501, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not_implemented" }));
}

export function receiveWebhook(_req: IncomingMessage, res: ServerResponse) {
  res.writeHead(501, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not_implemented" }));
}
