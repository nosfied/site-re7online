import { IncomingMessage, ServerResponse } from "node:http";
import { env, normalizeWaId } from "../config/env.js";
import { normalizeWebhook } from "../domain/whatsapp/normalizeWebhook.js";
import { logger } from "../logger/logger.js";
import { jsonFileStorage } from "../storage/jsonFileStorage.js";
import { WhatsAppWebhookPayload } from "./whatsapp.types.js";
import { sendTemplateMessage, sendTextMessage } from "./whatsapp.client.js";
import {
  applyAdminCommand,
  getOrCreateConversation,
  isWindowOpen,
  logConversationIntent,
  logConversationWindow,
  shouldAutoReply,
  updateInbound,
  updateOutbound,
} from "../conversation/conversation.service.js";
import { createAgentBrain } from "../agent/agent.factory.js";

const agentBrain = createAgentBrain();

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

    const currentConversation = await getOrCreateConversation(
      jsonFileStorage,
      normalizedFrom,
      message.timestamp
    );
    const inboundConversation = updateInbound(
      currentConversation,
      message.messageId,
      message.timestamp,
      message.text
    );
    let updatedConversation = inboundConversation;
    const isAdmin =
      env.WHATSAPP_ADMIN_ALLOWLIST.length > 0 &&
      env.WHATSAPP_ADMIN_ALLOWLIST.includes(normalizedFrom);
    const adminResult = isAdmin
      ? applyAdminCommand(updatedConversation, message.text)
      : { handled: false, state: updatedConversation };
    if (
      !currentConversation.botPaused &&
      updatedConversation.botPaused &&
      updatedConversation.pausedReason === "handoff"
    ) {
      logger.info({
        event: "bot.pause",
        waId: maskNumber(normalizedFrom),
        reason: "handoff",
      });
    }
    if (isAdmin) {
      if (adminResult.handled) {
        updatedConversation = {
          ...adminResult.state,
          intent: currentConversation.intent,
        };
        if (adminResult.action === "pause") {
          logger.info({
            event: "bot.pause",
            waId: maskNumber(normalizedFrom),
            reason: "admin",
          });
        }
        if (adminResult.action === "resume") {
          logger.info({
            event: "bot.resume",
            waId: maskNumber(normalizedFrom),
          });
        }
      }
    }
    await jsonFileStorage.upsertConversation(updatedConversation);
    logConversationWindow(updatedConversation);
    logConversationIntent(updatedConversation);

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

    if (adminResult.handled) {
      logger.info({
        event: "reply.skipped",
        waId: maskNumber(normalizedFrom),
        reason: "admin_command",
      });
      continue;
    }

    if (!shouldAutoReply(updatedConversation)) {
      logger.info({
        event: "reply.skipped",
        waId: maskNumber(normalizedFrom),
        reason: updatedConversation.pausedReason ?? "paused",
      });
      continue;
    }

    if (!env.outboundEnabled) {
      logger.warn({ event: "reply.disabled", reason: "missing_credentials" });
      continue;
    }

    const now = Date.now();
    const windowOpen = isWindowOpen(updatedConversation, now);

    const replyType = env.WHATSAPP_SANDBOX
      ? "template"
      : windowOpen
        ? "text"
        : "template";

    let replyText = env.WHATSAPP_ECHO_ENABLED
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

    if (
      env.WHATSAPP_AI_ENABLED &&
      !env.WHATSAPP_SANDBOX &&
      replyType === "text" &&
      updatedConversation.intent !== "handoff" &&
      message.text
    ) {
      const start = Date.now();
      try {
        const aiReply = await agentBrain.generateReply({
          waId: normalizedFrom,
          intent: updatedConversation.intent ?? "unknown",
          lastMessages: [message.text],
          inboundText: message.text,
          nowIso: new Date().toISOString(),
          businessContext: "",
        });
        if (aiReply.text) {
          replyText = aiReply.text;
          logger.info({
            event: "agent.reply",
            source: aiReply.source,
            model: aiReply.model,
            latency_ms: Date.now() - start,
          });
        }
      } catch (error) {
        logger.error({
          event: "agent.error",
          message: (error as Error).message,
        });
      }
    }

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
          const outboundConversation = updateOutbound(
            updatedConversation,
            result.messageId,
            new Date().toISOString()
          );
          await jsonFileStorage.upsertConversation(outboundConversation);
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
