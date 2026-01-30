import { IncomingMessage, ServerResponse } from "node:http";
import { env } from "../config/env.js";
import { normalizeWebhook } from "../domain/whatsapp/normalizeWebhook.js";
import { logger } from "../infra/logger.js";
import { jsonFileStorage } from "../infra/storage/jsonFileStorage.js";
import { WhatsAppWebhookPayload } from "./whatsapp.types.js";

export function verifyWebhook(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(challenge ?? "");
    return;
  }

  res.writeHead(403, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "forbidden" }));
}

export async function receiveWebhook(
  _req: IncomingMessage,
  res: ServerResponse,
  rawBody: string
) {
  logger.info({ event: "webhook.received" });

  let payload: WhatsAppWebhookPayload | null = null;
  try {
    payload = JSON.parse(rawBody) as WhatsAppWebhookPayload;
  } catch (error) {
    logger.error({ event: "webhook.invalid_json", error: (error as Error).message });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, ignored: true }));
    return;
  }

  const normalized = normalizeWebhook(payload);
  if (normalized.messages.length === 0) {
    logger.warn({ event: "webhook.no_messages", reason: normalized.reason ?? "unknown" });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, ignored: true }));
    return;
  }

  for (const message of normalized.messages) {
    const allowlistEnabled = env.WHATSAPP_ALLOWLIST.length > 0;
    const allowlistHit = allowlistEnabled ? env.WHATSAPP_ALLOWLIST.includes(message.from) : true;
    const status = allowlistHit ? "received" : "ignored";

    await jsonFileStorage.saveIncomingMessage({
      ...message,
      status,
      allowlist: {
        enabled: allowlistEnabled,
        hit: allowlistHit,
      },
    });

    logger.info({
      event: "webhook.message",
      messageId: message.messageId,
      from: maskNumber(message.from),
      type: message.type,
      status,
      allowlistHit,
    });
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true }));
}

function maskNumber(number: string) {
  const tail = number.slice(-6);
  return `***${tail}`;
}
