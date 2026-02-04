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

type RequestMeta = {
  requestId: string;
  rawBodyLength: number;
  ip?: string;
  route: string;
  method: string;
};

export function verifyWebhook(
  req: IncomingMessage,
  res: ServerResponse,
  meta?: Pick<RequestMeta, "requestId" | "route" | "method">
) {
  const url = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const tokenPrefix = token ? token.slice(0, 3) : "";

  if (mode !== "subscribe") {
    logger.warn({
      event: "webhook.verify.fail",
      reason: "mode",
      receivedMode: mode,
      receivedTokenPrefix: tokenPrefix,
      requestId: meta?.requestId,
      route: meta?.route,
      method: meta?.method,
    });
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "forbidden", reason: "mode" }));
    return;
  }

  if (token !== env.WHATSAPP_VERIFY_TOKEN) {
    logger.warn({
      event: "webhook.verify.fail",
      reason: "token",
      receivedMode: mode,
      receivedTokenPrefix: tokenPrefix,
      requestId: meta?.requestId,
      route: meta?.route,
      method: meta?.method,
    });
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "forbidden", reason: "token" }));
    return;
  }

  logger.info({
    event: "webhook.verify.success",
    requestId: meta?.requestId,
    route: meta?.route,
    method: meta?.method,
  });
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end(challenge ?? "");
}

export async function receiveWebhook(payload: unknown, meta?: RequestMeta) {
  logger.info({
    event: "webhook.received",
    route: meta?.route,
    method: meta?.method,
    requestId: meta?.requestId,
  });

  const typedPayload = payload as WhatsAppWebhookPayload;
  const normalized = normalizeWebhook(typedPayload);
  const phoneNumberId =
    typedPayload.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
  const statuses = typedPayload.entry?.[0]?.changes?.[0]?.value?.statuses;
  const hasStatuses = Array.isArray(statuses) && statuses.length > 0;
  if (hasStatuses) {
    logger.info({
      event: "webhook.status.received",
      route: meta?.route,
      method: meta?.method,
      requestId: meta?.requestId,
      phone_number_id: phoneNumberId,
      count: statuses.length,
    });
  }

  if (normalized.messages.length === 0) {
    if (!hasStatuses) {
      logger.warn({
        event: "webhook.no_messages",
        reason: normalized.reason ?? "unknown",
        route: meta?.route,
        method: meta?.method,
        requestId: meta?.requestId,
        phone_number_id: phoneNumberId,
      });
    }
    return;
  }

  logger.info({
    event: "webhook.inbound",
    route: meta?.route,
    method: meta?.method,
    requestId: meta?.requestId,
    phone_number_id: phoneNumberId,
    count: normalized.messages.length,
  });

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
          route: meta?.route,
          method: meta?.method,
          requestId: meta?.requestId,
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
      route: meta?.route,
      method: meta?.method,
      requestId: meta?.requestId,
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
        route: meta?.route,
        method: meta?.method,
        requestId: meta?.requestId,
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
            route: meta?.route,
            method: meta?.method,
            requestId: meta?.requestId,
          });
        }
        if (adminResult.action === "resume") {
          logger.info({
            event: "bot.resume",
            waId: maskNumber(normalizedFrom),
            route: meta?.route,
            method: meta?.method,
            requestId: meta?.requestId,
          });
        }
      }
    }
    await jsonFileStorage.upsertConversation(updatedConversation);
    logConversationWindow(updatedConversation, meta);
    logConversationIntent(updatedConversation, meta);

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
      route: meta?.route,
      method: meta?.method,
      requestId: meta?.requestId,
    });

    if (!allowlistHit) {
      continue;
    }

    if (adminResult.handled) {
      logger.info({
        event: "reply.skipped",
        waId: maskNumber(normalizedFrom),
        reason: "admin_command",
        route: meta?.route,
        method: meta?.method,
        requestId: meta?.requestId,
      });
      continue;
    }

    if (!shouldAutoReply(updatedConversation)) {
      logger.info({
        event: "reply.skipped",
        waId: maskNumber(normalizedFrom),
        reason: updatedConversation.pausedReason ?? "paused",
        route: meta?.route,
        method: meta?.method,
        requestId: meta?.requestId,
      });
      continue;
    }

    if (!env.outboundEnabled) {
      logger.warn({
        event: "reply.disabled",
        reason: "missing_credentials",
        route: meta?.route,
        method: meta?.method,
        requestId: meta?.requestId,
      });
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
      route: meta?.route,
      method: meta?.method,
      requestId: meta?.requestId,
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
            route: meta?.route,
            method: meta?.method,
            requestId: meta?.requestId,
          });
        }
      } catch (error) {
        logger.error({
          event: "agent.error",
          message: (error as Error).message,
          route: meta?.route,
          method: meta?.method,
          requestId: meta?.requestId,
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
            route: meta?.route,
            method: meta?.method,
            requestId: meta?.requestId,
          });
        } else {
          logger.error({
            event: "reply.error",
            messageId: message.messageId,
            replyType,
            status: result.status,
            errorBody: result.errorBody,
            route: meta?.route,
            method: meta?.method,
            requestId: meta?.requestId,
          });
        }
      })
      .catch((error) => {
        logger.error({
          event: "reply.error",
          messageId: message.messageId,
          replyType,
          error: (error as Error).message,
          route: meta?.route,
          method: meta?.method,
          requestId: meta?.requestId,
        });
      });
  }
}

function maskNumber(number: string) {
  const tail = number.slice(-6);
  return `***${tail}`;
}
