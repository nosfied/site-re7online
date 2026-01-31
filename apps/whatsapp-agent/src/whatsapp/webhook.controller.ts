import { IncomingMessage, ServerResponse } from "node:http";
import { env, normalizeWaId } from "../config/env.js";
import { normalizeWebhook } from "../domain/whatsapp/normalizeWebhook.js";
import { logger } from "../logger/logger.js";
import { jsonFileStorage } from "../storage/jsonFileStorage.js";
import { ConversationIntent } from "../storage/storage.js";
import { WhatsAppWebhookPayload } from "./whatsapp.types.js";
import { sendTemplateMessage, sendTextMessage } from "./whatsapp.client.js";

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
    const existing = await jsonFileStorage.findByMessageId(message.messageId);
    if (existing?.status === "replied") {
      const repliedAt = existing.repliedAt ? Date.parse(existing.repliedAt) : 0;
      const now = Date.now();
      const withinWindow =
        repliedAt > 0 &&
        now - repliedAt <= env.WHATSAPP_DEDUP_WINDOW_SECONDS * 1000;

      if (withinWindow) {
        logger.warn({
          event: "webhook.duplicate",
          messageId: message.messageId,
          from: maskNumber(message.from),
        });
        continue;
      }
    }

    const normalizedFrom = normalizeWaId(message.from);
    const allowlistEnabled = env.WHATSAPP_ALLOWLIST.length > 0;
    const allowlistHit = allowlistEnabled
      ? env.WHATSAPP_ALLOWLIST.includes(normalizedFrom)
      : true;
    const status = allowlistHit ? "received" : "ignored";

    logger.info({
      event: "allowlist.check",
      from: normalizedFrom,
      allowlist: env.WHATSAPP_ALLOWLIST,
      hit: allowlistHit,
    });

    const intent = detectIntent(message.text);
    const conversation = await jsonFileStorage.updateConversationWindow(
      normalizedFrom,
      message.timestamp
    );
    const updatedConversation = {
      ...conversation,
      lastInboundMessageId: message.messageId,
      intent,
    };
    await jsonFileStorage.upsertConversation(updatedConversation);

    logger.info({
      event: "conversation.window",
      waId: maskNumber(normalizedFrom),
      isOpen: updatedConversation.window.isOpen,
      expiresAt: updatedConversation.window.expiresAt,
    });

    logger.info({
      event: "conversation.intent",
      waId: maskNumber(normalizedFrom),
      intent,
    });

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

    if (!allowlistHit) {
      continue;
    }

    if (!env.outboundEnabled) {
      logger.warn({ event: "reply.disabled", reason: "missing_credentials" });
      continue;
    }

    const now = Date.now();
    const expiresAt = updatedConversation.window.expiresAt
      ? Date.parse(updatedConversation.window.expiresAt)
      : 0;
    const windowOpen = updatedConversation.window.isOpen && now < expiresAt;

    const replyType = env.WHATSAPP_SANDBOX
      ? "template"
      : windowOpen
        ? "text"
        : "template";

    const replyText = env.WHATSAPP_ECHO_ENABLED
      ? message.type === "text" && message.text
        ? `ECO: ${message.text}`
        : `ECO: (mensagem ${message.type} recebida)`
      : env.WHATSAPP_DEFAULT_REPLY;

    const toForReply = env.WHATSAPP_SANDBOX
      ? env.WHATSAPP_SANDBOX_TO || normalizedFrom
      : message.from;

    logger.info({
      event: "reply.sending",
      messageId: message.messageId,
      replyType,
      to: maskNumber(message.from),
      toResolved: maskNumber(toForReply),
    });

    const sendPromise =
      replyType === "template"
        ? sendTemplateMessage(
            toForReply,
            env.WHATSAPP_SANDBOX ? "hello_world" : env.WHATSAPP_OUT_OF_WINDOW_TEMPLATE
          )
        : sendTextMessage(toForReply, replyText);

    void sendPromise
      .then(async (result) => {
        if (result.ok) {
          await jsonFileStorage.updateMessage(message.messageId, {
            status: "replied",
            repliedAt: new Date().toISOString(),
            replyType,
          });
          await jsonFileStorage.upsertConversation({
            ...updatedConversation,
            lastOutboundAt: new Date().toISOString(),
            lastOutboundMessageId: result.messageId,
          });
          logger.info({
            event: "reply.sent",
            messageId: message.messageId,
            replyType,
            status: result.status,
          });
        } else {
          logger.error({
            event: "reply.error",
            messageId: message.messageId,
            replyType,
            status: result.status,
            errorBody: result.errorBody,
          });
        }
      })
      .catch((error) => {
        logger.error({
          event: "reply.error",
          messageId: message.messageId,
          replyType,
          error: (error as Error).message,
        });
      });
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true }));
}

function maskNumber(number: string) {
  const tail = number.slice(-6);
  return `***${tail}`;
}

function detectIntent(text: string | null): ConversationIntent {
  if (!text) {
    return "unknown";
  }
  const value = text.toLowerCase();
  if (/(preço|valor|orçamento|quanto custa)/i.test(value)) {
    return "pricing";
  }
  if (/(suporte|ajuda|erro|problema)/i.test(value)) {
    return "support";
  }
  if (/(humano|atendente|pessoa|ligar)/i.test(value)) {
    return "handoff";
  }
  return "unknown";
}
