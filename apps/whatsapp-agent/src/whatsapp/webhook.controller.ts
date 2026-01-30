import { IncomingMessage, ServerResponse } from "node:http";
import { logger } from "../logger/logger.js";
import { env } from "../config/env.js";
import { WhatsAppWebhookPayload } from "./whatsapp.types.js";
import { sendTextMessage } from "./graph.client.js";

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
  logger.info("webhook: received");

  let payload: WhatsAppWebhookPayload | null = null;
  try {
    payload = JSON.parse(rawBody) as WhatsAppWebhookPayload;
  } catch (error) {
    logger.error(`webhook: invalid_json ${(error as Error).message}`);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, ignored: true }));
    return;
  }

  const message = payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  const from = message?.from;
  const text = message?.text?.body ?? "";
  const messageId = message?.id;
  const messageType = message?.type;

  if (!message || !from) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, ignored: true }));
    return;
  }

  logger.info(`webhook: message from ${maskNumber(from)}`);
  if (text) {
    logger.info(`webhook: text "${text}"`);
  }

  if (messageType !== "text" || !text) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, ignored: true }));
    return;
  }

  const allowlist = env.WHATSAPP_ALLOWLIST;
  if (allowlist.length > 0 && !allowlist.includes(from)) {
    logger.info(`webhook: ignored (not allowlisted) ${maskNumber(from)}`);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, ignored: true }));
    return;
  }

  if (!env.outboundEnabled) {
    logger.warn("outbound: disabled (missing credentials)");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, ignored: true }));
    return;
  }

  logger.info(`outbound: sending echo to ${maskNumber(from)}`);
  void sendTextMessage({ to: from, text: `Echo: ${text}` })
    .then((ok) => {
      if (ok) {
        logger.info("outbound: success");
      } else {
        logger.error(`outbound: failed to ${maskNumber(from)} msg=${messageId ?? "n/a"}`);
      }
    })
    .catch((error) => {
      logger.error(
        `outbound: failed to ${maskNumber(from)} msg=${messageId ?? "n/a"} err=${(error as Error).message}`
      );
    });

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true }));
}

function maskNumber(number: string) {
  const tail = number.slice(-6);
  return `***${tail}`;
}
