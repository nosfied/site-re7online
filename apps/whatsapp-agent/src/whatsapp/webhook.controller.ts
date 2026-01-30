import { IncomingMessage, ServerResponse } from "node:http";
import { env } from "../config/env.js";
import { logger } from "../logger/logger.js";
import { WhatsAppWebhookPayload } from "./whatsapp.types.js";

export function verifyWebhook(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  // debug local only
  // eslint-disable-next-line no-console
  console.log("hub.verify_token:", token, "env:", process.env.WHATSAPP_VERIFY_TOKEN);

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
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_json" }));
    return;
  }

  const message = payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  const from = message?.from;
  const text = message?.text?.body ?? "";

  if (!message || !from) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, ignored: true }));
    return;
  }

  logger.info(`webhook: message from ${from}`);
  if (text) {
    logger.info(`webhook: text "${text}"`);
  }

  const allowlist = env.WHATSAPP_ALLOWLIST;
  if (allowlist.length > 0 && !allowlist.includes(from)) {
    logger.info(`webhook: ignored (not allowlisted) ${from}`);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, ignored: true }));
    return;
  }

  const sendOk = await sendMessage(from, "Mensagem recebida com sucesso. Em breve daremos continuidade.");
  logger.info(`webhook: responded=${sendOk}`);

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true }));
}

async function sendMessage(to: string, body: string) {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    logger.warn("whatsapp: missing access token or phone number id");
    return false;
  }

  const url = `https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body },
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });
    return response.ok;
  } catch (error) {
    logger.error(`whatsapp: send error ${(error as Error).message}`);
    return false;
  }
}
