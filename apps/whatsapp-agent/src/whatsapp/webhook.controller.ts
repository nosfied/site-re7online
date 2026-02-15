import { IncomingMessage, ServerResponse } from "node:http";
import { Prisma, MessageStatus, MessageType } from "@prisma/client";
import { env, normalizeWaId } from "../config/env.js";
import { normalizeWebhook } from "../domain/whatsapp/normalizeWebhook.js";
import { logger } from "../logger/logger.js";
import { jsonFileStorage } from "../storage/jsonFileStorage.js";
import { WhatsAppWebhookPayload } from "./whatsapp.types.js";
import { sendTemplateMessage, sendTextMessage } from "./whatsapp.client.js";
import {
  advanceQuoteSiteFlow,
  applyAdminCommand,
  clearTemplateNeeded,
  decideOutboundPolicy,
  getHandoffStatus,
  getOrCreateConversation,
  handleHandoff,
  logConversationIntent,
  logConversationWindow,
  markTemplateNeeded,
  shouldAutoReply,
  updateInbound,
  updateInboundMeta,
  updateOutbound,
} from "../conversation/conversation.service.js";
import { createAgentBrain } from "../agent/agent.factory.js";
import {
  parseTemplateCommand,
  resolveTemplateKey,
} from "./templateCommand.js";
import {
  resolveFallbackTemplate,
  resolveTemplateForIntent,
  sendTemplate,
  shouldRetryWithFallback,
} from "../services/outboundTemplateService.js";
import { ConversationIntent } from "../conversation/conversation.types.js";
import { resolveTenant } from "../tenancy/tenantResolver.js";
import {
  persistConversationWindow,
  persistEvent,
  persistInboundMessage,
  persistOutboundMessage,
} from "../db/persist.js";

const agentBrain = createAgentBrain();
const adminTemplateDedup = new Map<string, number>();
const ADMIN_TEMPLATE_TTL_MS = 10 * 60 * 1000;

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

  const attemptTemplateFallback = async (params: {
    waId: string;
    toE164: string;
    intent: ConversationIntent | undefined;
    messageId: string;
    reasonIfSkip?: string;
  }) => {
    if (!env.OUTBOUND_TEMPLATE_FALLBACK) {
      return;
    }
    if (!env.outboundEnabled) {
      logger.error({
        event: "outbound.template.failed",
        waId: maskNumber(params.waId),
        to: maskNumber(params.toE164),
        intent: params.intent ?? "unknown",
        template: env.OUTBOUND_TEMPLATE_DEFAULT_NAME,
        clientId: env.CLIENT_ID,
        reason: "outbound_disabled",
        requestId: meta?.requestId,
        rid: params.messageId,
        messageId: params.messageId,
      });
      return;
    }
    if (params.reasonIfSkip) {
      logger.error({
        event: "outbound.template.failed",
        waId: maskNumber(params.waId),
        to: maskNumber(params.toE164),
        intent: params.intent ?? "unknown",
        template: env.OUTBOUND_TEMPLATE_DEFAULT_NAME,
        clientId: env.CLIENT_ID,
        reason: params.reasonIfSkip,
        requestId: meta?.requestId,
        rid: params.messageId,
        messageId: params.messageId,
      });
      return;
    }
    const resolvedIntent = params.intent && params.intent !== "unknown";
    if (!resolvedIntent) {
      logger.error({
        event: "outbound.template.failed",
        waId: maskNumber(params.waId),
        to: maskNumber(params.toE164),
        intent: params.intent ?? "unknown",
        template: env.OUTBOUND_TEMPLATE_DEFAULT_NAME,
        clientId: env.CLIENT_ID,
        reason: "intent_unresolved",
        requestId: meta?.requestId,
        rid: params.messageId,
        messageId: params.messageId,
      });
      return;
    }
    const templateConfig = resolveTemplateForIntent(params.intent);
    if (!templateConfig.name) {
      logger.error({
        event: "outbound.template.failed",
        waId: maskNumber(params.waId),
        to: maskNumber(params.toE164),
        intent: params.intent ?? "unknown",
        template: "missing",
        clientId: env.CLIENT_ID,
        reason: "template_missing",
        requestId: meta?.requestId,
        rid: params.messageId,
        messageId: params.messageId,
      });
      return;
    }
    const primaryResult = await sendTemplate({
      toE164: params.toE164,
      waId: params.waId,
      intent: params.intent,
      templateName: templateConfig.name,
      lang: templateConfig.language ?? env.OUTBOUND_TEMPLATE_DEFAULT_LANG,
      isFallback: false,
      requestId: meta?.requestId,
      rid: params.messageId,
      messageId: params.messageId,
    });
    await persistOutboundTemplateSafe({
      waId: params.waId,
      messageId: params.messageId,
      templateName: templateConfig.name,
      templateLang: templateConfig.language ?? env.OUTBOUND_TEMPLATE_DEFAULT_LANG,
      status: primaryResult.ok ? MessageStatus.SENT : MessageStatus.FAILED,
      errorBody: primaryResult.errorBody ?? null,
      metaMessageId: primaryResult.metaMessageId ?? null,
    });
    await persistEventSafe(
      primaryResult.ok ? "outbound.template.sent" : "outbound.template.failed",
      {
        template: templateConfig.name,
        language: templateConfig.language ?? env.OUTBOUND_TEMPLATE_DEFAULT_LANG,
        status: primaryResult.status,
        errorBody: primaryResult.errorBody,
      },
      params.waId,
      params.messageId
    );
    if (!primaryResult.ok && env.OUTBOUND_TEMPLATE_FALLBACK) {
      const fallback = resolveFallbackTemplate();
      if (
        shouldRetryWithFallback({
          currentName: templateConfig.name,
          currentLang: templateConfig.language ?? env.OUTBOUND_TEMPLATE_DEFAULT_LANG,
          fallbackName: fallback.name,
          fallbackLang: fallback.language,
          status: primaryResult.status,
          errorBody: primaryResult.errorBody,
        })
      ) {
        const fallbackResult = await sendTemplate({
          toE164: params.toE164,
          waId: params.waId,
          intent: params.intent,
          templateName: fallback.name,
          lang: fallback.language,
          isFallback: true,
          fallbackReason: "primary_failed",
          requestId: meta?.requestId,
          rid: params.messageId,
          messageId: params.messageId,
        });
        await persistOutboundTemplateSafe({
          waId: params.waId,
          messageId: params.messageId,
          templateName: fallback.name,
          templateLang: fallback.language,
          status: fallbackResult.ok ? MessageStatus.SENT : MessageStatus.FAILED,
          errorBody: fallbackResult.errorBody ?? null,
          metaMessageId: fallbackResult.metaMessageId ?? null,
        });
        await persistEventSafe(
          fallbackResult.ok ? "outbound.template.sent" : "outbound.template.failed",
          {
            template: fallback.name,
            language: fallback.language,
            status: fallbackResult.status,
            errorBody: fallbackResult.errorBody,
            isFallback: true,
          },
          params.waId,
          params.messageId
        );
      }
    }
  };

  const sendOutboundText = async (params: {
    toE164: string;
    waId: string;
    intent: ConversationIntent | undefined;
    messageId: string;
    replyText: string;
  }) => {
    logger.info({
      event: "outbound.text.sending",
      waId: maskNumber(params.waId),
      to: maskNumber(params.toE164),
      intent: params.intent ?? "unknown",
      clientId: env.CLIENT_ID,
      requestId: meta?.requestId,
      rid: params.messageId,
      messageId: params.messageId,
    });
    const result = await sendTextMessage(params.toE164, params.replyText);
    if (result.ok) {
      logger.info({
        event: "outbound.text.sent",
        waId: maskNumber(params.waId),
        to: maskNumber(params.toE164),
        intent: params.intent ?? "unknown",
        clientId: env.CLIENT_ID,
        requestId: meta?.requestId,
        rid: params.messageId,
        messageId: params.messageId,
        metaMessageId: result.messageId,
      });
    } else {
      logger.error({
        event: "outbound.text.failed",
        waId: maskNumber(params.waId),
        to: maskNumber(params.toE164),
        intent: params.intent ?? "unknown",
        clientId: env.CLIENT_ID,
        requestId: meta?.requestId,
        rid: params.messageId,
        messageId: params.messageId,
        status: result.status,
        errorBody: result.errorBody,
      });
    }
    await persistOutboundTextSafe({
      waId: params.waId,
      messageId: params.messageId,
      bodyText: params.replyText,
      status: result.ok ? MessageStatus.SENT : MessageStatus.FAILED,
      errorBody: result.errorBody ?? null,
      metaMessageId: result.messageId ?? null,
    });
    await persistEventSafe(
      result.ok ? "outbound.text.sent" : "outbound.text.failed",
      {
        status: result.status,
        errorBody: result.errorBody,
      },
      params.waId,
      params.messageId
    );
    return result;
  };

  const typedPayload = payload as WhatsAppWebhookPayload;
  const normalized = normalizeWebhook(typedPayload);
  const phoneNumberId =
    typedPayload.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
  let tenantClientId = "";
  try {
    const tenant = await resolveTenant(phoneNumberId, meta);
    tenantClientId = tenant.clientId;
  } catch (error) {
    logger.error({
      event: "tenant.resolve.error",
      requestId: meta?.requestId,
      message: (error as Error).message,
    });
  }
  const persistEventSafe = async (
    eventName: string,
    payloadJson: Prisma.InputJsonValue,
    waId?: string,
    messageId?: string
  ) => {
    try {
      if (!tenantClientId || !meta?.requestId) return;
      await persistEvent({
        clientId: tenantClientId,
        waId: waId ?? null,
        messageId: messageId ?? null,
        requestId: meta.requestId,
        eventName,
        payloadJson,
      });
    } catch (error) {
      logger.error({
        event: "db.persist.error",
        target: "event",
        message: (error as Error).message,
        requestId: meta?.requestId,
      });
    }
  };

  await persistEventSafe(
    "webhook.received",
    { route: meta?.route, method: meta?.method } as Prisma.InputJsonValue,
    undefined,
    undefined
  );

  const persistInboundSafe = async (params: {
    waId: string;
    messageId: string;
    type: MessageType;
    bodyText?: string | null;
    allowlistHit: boolean;
    rawPayload?: Prisma.InputJsonValue;
  }) => {
    try {
      if (!tenantClientId) return;
      await persistInboundMessage({
        clientId: tenantClientId,
        phoneNumberId: phoneNumberId ?? undefined,
        waId: params.waId,
        messageId: params.messageId,
        type: params.type,
        bodyText: params.bodyText,
        allowlistHit: params.allowlistHit,
        requestId: meta?.requestId,
        rawPayload: params.rawPayload,
      });
    } catch (error) {
      logger.error({
        event: "db.persist.error",
        target: "inbound",
        message: (error as Error).message,
        requestId: meta?.requestId,
      });
    }
  };

  const persistConversationSafe = async (state: { waId: string; windowIsOpen: boolean; windowExpiresAt?: string; lastInboundAt?: string | null; lastOutboundAt?: string | null; }) => {
    try {
      if (!tenantClientId) return;
      await persistConversationWindow({
        clientId: tenantClientId,
        waId: state.waId,
        phoneNumberId: phoneNumberId ?? undefined,
        windowIsOpen: state.windowIsOpen,
        windowExpiresAt: state.windowExpiresAt ? new Date(state.windowExpiresAt) : null,
        lastInboundAt: state.lastInboundAt ? new Date(state.lastInboundAt) : null,
        lastOutboundAt: state.lastOutboundAt ? new Date(state.lastOutboundAt) : null,
      });
    } catch (error) {
      logger.error({
        event: "db.persist.error",
        target: "conversation",
        message: (error as Error).message,
        requestId: meta?.requestId,
      });
    }
  };

  const persistOutboundTemplateSafe = async (params: {
    waId: string;
    messageId: string;
    templateName: string;
    templateLang: string;
    status: MessageStatus;
    errorBody: string | null;
    metaMessageId: string | null;
  }) => {
    try {
      if (!tenantClientId) return;
      await persistOutboundMessage({
        clientId: tenantClientId,
        phoneNumberId: phoneNumberId ?? undefined,
        waId: params.waId,
        messageId: params.messageId,
        type: MessageType.TEMPLATE,
        status: params.status,
        templateName: params.templateName,
        templateLang: params.templateLang,
        requestId: meta?.requestId,
        metaMessageId: params.metaMessageId,
        errorBody: params.errorBody,
        rawPayload: {
          templateName: params.templateName,
          templateLang: params.templateLang,
        },
      });
    } catch (error) {
      logger.error({
        event: "db.persist.error",
        target: "outbound_template",
        message: (error as Error).message,
        requestId: meta?.requestId,
      });
    }
  };

  const persistOutboundTextSafe = async (params: {
    waId: string;
    messageId: string;
    bodyText: string;
    status: MessageStatus;
    errorBody: string | null;
    metaMessageId: string | null;
  }) => {
    try {
      if (!tenantClientId) return;
      await persistOutboundMessage({
        clientId: tenantClientId,
        phoneNumberId: phoneNumberId ?? undefined,
        waId: params.waId,
        messageId: params.messageId,
        type: MessageType.TEXT,
        status: params.status,
        bodyText: params.bodyText,
        requestId: meta?.requestId,
        metaMessageId: params.metaMessageId,
        errorBody: params.errorBody,
        rawPayload: {
          bodyText: params.bodyText,
        },
      });
    } catch (error) {
      logger.error({
        event: "db.persist.error",
        target: "outbound_text",
        message: (error as Error).message,
        requestId: meta?.requestId,
      });
    }
  };

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
    await persistEventSafe(
      "webhook.status.received",
      { phone_number_id: phoneNumberId, count: statuses.length },
      undefined,
      undefined
    );
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
  await persistEventSafe(
    "webhook.inbound",
    { phone_number_id: phoneNumberId, count: normalized.messages.length },
    undefined,
    undefined
  );

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
      allowlistEnabled,
      allowlistCount: env.WHATSAPP_ALLOWLIST.length,
      hit: allowlistHit,
      route: meta?.route,
      method: meta?.method,
      requestId: meta?.requestId,
    });
    await persistEventSafe(
      "allowlist.check",
      { from: normalizedFrom, allowlistEnabled, allowlistCount: env.WHATSAPP_ALLOWLIST.length, hit: allowlistHit },
      normalizedFrom,
      message.messageId
    );

    const currentConversation = await getOrCreateConversation(
      jsonFileStorage,
      normalizedFrom,
      message.timestamp
    );
    const isAdmin =
      env.WHATSAPP_ADMIN_ALLOWLIST.length > 0 &&
      env.WHATSAPP_ADMIN_ALLOWLIST.includes(normalizedFrom);
    const debugCommand = parseDebugCloseWindowCommand(message.text);
    if (debugCommand && isAdmin && !env.DISABLE_DEBUG_COMMANDS) {
      const targetWaId = normalizeWaId(debugCommand.waId);
      const targetConversation = await getOrCreateConversation(
        jsonFileStorage,
        targetWaId,
        message.timestamp
      );
      const pastIso = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const closedWindowState = {
        ...targetConversation,
        lastInboundAt: pastIso,
        window: { isOpen: false, expiresAt: pastIso },
      };
      await jsonFileStorage.upsertConversation(closedWindowState);
      logger.info({
        event: "admin.debug.closewindow",
        waId: maskNumber(targetWaId),
        route: meta?.route,
        method: meta?.method,
        requestId: meta?.requestId,
      });
      const updatedMeta = updateInboundMeta(
        currentConversation,
        message.messageId,
        message.timestamp
      );
      await jsonFileStorage.upsertConversation(updatedMeta);
      await jsonFileStorage.saveIncomingMessage({
        ...message,
        status,
        allowlist: {
          enabled: allowlistEnabled,
          hit: allowlistHit,
        },
      });
      if (env.outboundEnabled && !env.WHATSAPP_SANDBOX) {
        await sendTextMessage(
          normalizedFrom,
          `Janela 24h fechada para ${targetWaId}.`
        );
      }
      continue;
    }
    const templateCommand = parseTemplateCommand(message.text);
    if (templateCommand) {
      const now = Date.now();
      const existingExpiry = adminTemplateDedup.get(message.messageId);
      if (existingExpiry && existingExpiry > now) {
        logger.warn({
          event: "admin.template.duplicate",
          waId: maskNumber(normalizedFrom),
          from: maskNumber(normalizedFrom),
          route: meta?.route,
          method: meta?.method,
          requestId: meta?.requestId,
        });
        continue;
      }
      adminTemplateDedup.set(message.messageId, now + ADMIN_TEMPLATE_TTL_MS);
      for (const [key, expiry] of adminTemplateDedup.entries()) {
        if (expiry <= now) {
          adminTemplateDedup.delete(key);
        }
      }

      if (!isAdmin) {
        logger.warn({
          event: "admin.template.denied",
          waId: maskNumber(normalizedFrom),
          from: maskNumber(normalizedFrom),
          route: meta?.route,
          method: meta?.method,
          requestId: meta?.requestId,
        });
        const updatedMeta = updateInboundMeta(
          currentConversation,
          message.messageId,
          message.timestamp
        );
        await jsonFileStorage.upsertConversation(updatedMeta);
        await jsonFileStorage.saveIncomingMessage({
          ...message,
          status,
          allowlist: {
            enabled: allowlistEnabled,
            hit: allowlistHit,
          },
        });
        continue;
      }

      const templateConfig = resolveTemplateKey(templateCommand.templateKey);
      if (!templateConfig) {
        logger.error({
          event: "admin.template.error",
          waId: maskNumber(normalizedFrom),
          from: maskNumber(normalizedFrom),
          targetWaId: maskNumber(normalizedFrom),
          templateKey: templateCommand.templateKey || "missing",
          errorMessage: "template_key_not_found",
          route: meta?.route,
          method: meta?.method,
          requestId: meta?.requestId,
        });
        const updatedMeta = updateInboundMeta(
          currentConversation,
          message.messageId,
          message.timestamp
        );
        await jsonFileStorage.upsertConversation(updatedMeta);
        await jsonFileStorage.saveIncomingMessage({
          ...message,
          status,
          allowlist: {
            enabled: allowlistEnabled,
            hit: allowlistHit,
          },
        });
        continue;
      }

      const targetWaId = normalizeWaId(
        templateCommand.targetWaId ?? normalizedFrom
      );
      logger.info({
        event: "admin.template.requested",
        waId: maskNumber(targetWaId),
        from: maskNumber(normalizedFrom),
        targetWaId: maskNumber(targetWaId),
        templateKey: templateConfig.key,
        templateName: templateConfig.name,
        language: templateConfig.language,
        route: meta?.route,
        method: meta?.method,
        requestId: meta?.requestId,
      });

      if (!env.outboundEnabled) {
        logger.error({
          event: "admin.template.error",
          waId: maskNumber(targetWaId),
          from: maskNumber(normalizedFrom),
          targetWaId: maskNumber(targetWaId),
          templateKey: templateConfig.key,
          templateName: templateConfig.name,
          language: templateConfig.language,
          errorMessage: "outbound_disabled",
          route: meta?.route,
          method: meta?.method,
          requestId: meta?.requestId,
        });
        const updatedMeta = updateInboundMeta(
          currentConversation,
          message.messageId,
          message.timestamp
        );
        await jsonFileStorage.upsertConversation(updatedMeta);
        await jsonFileStorage.saveIncomingMessage({
          ...message,
          status,
          allowlist: {
            enabled: allowlistEnabled,
            hit: allowlistHit,
          },
        });
        continue;
      }

      logger.info({
        event: "admin.template.sending",
        waId: maskNumber(targetWaId),
        from: maskNumber(normalizedFrom),
        targetWaId: maskNumber(targetWaId),
        templateKey: templateConfig.key,
        templateName: templateConfig.name,
        language: templateConfig.language,
        route: meta?.route,
        method: meta?.method,
        requestId: meta?.requestId,
      });

      const result = await sendTemplateMessage(
        targetWaId,
        templateConfig.name,
        templateConfig.language
      );

      if (result.ok) {
        logger.info({
          event: "admin.template.sent",
          waId: maskNumber(targetWaId),
          from: maskNumber(normalizedFrom),
          targetWaId: maskNumber(targetWaId),
          templateKey: templateConfig.key,
          templateName: templateConfig.name,
          language: templateConfig.language,
          route: meta?.route,
          method: meta?.method,
          requestId: meta?.requestId,
        });
        const targetConversation = await getOrCreateConversation(
          jsonFileStorage,
          targetWaId,
          message.timestamp
        );
        const clearedTarget = clearTemplateNeeded(
          updateOutbound(targetConversation, result.messageId, new Date().toISOString())
        );
        await jsonFileStorage.upsertConversation(clearedTarget);
      } else {
        logger.error({
          event: "admin.template.error",
          waId: maskNumber(targetWaId),
          from: maskNumber(normalizedFrom),
          targetWaId: maskNumber(targetWaId),
          templateKey: templateConfig.key,
          templateName: templateConfig.name,
          language: templateConfig.language,
          errorMessage: result.errorBody ?? "send_failed",
          errorCode: result.status,
          route: meta?.route,
          method: meta?.method,
          requestId: meta?.requestId,
        });
      }

      const updatedMeta = updateInboundMeta(
        currentConversation,
        message.messageId,
        message.timestamp
      );
      await jsonFileStorage.upsertConversation(updatedMeta);
      await jsonFileStorage.saveIncomingMessage({
        ...message,
        status,
        allowlist: {
          enabled: allowlistEnabled,
          hit: allowlistHit,
        },
      });
      continue;
    }

    const adminResult = isAdmin
      ? applyAdminCommand(currentConversation, message.text)
      : { handled: false, state: currentConversation };
    if (isAdmin && adminResult.handled) {
      const updatedByAdmin = updateInboundMeta(
        adminResult.state,
        message.messageId,
        message.timestamp
      );
      await jsonFileStorage.upsertConversation(updatedByAdmin);
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
      await jsonFileStorage.saveIncomingMessage({
        ...message,
        status,
        allowlist: {
          enabled: allowlistEnabled,
          hit: allowlistHit,
        },
      });
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

    const currentHandoffStatus = getHandoffStatus(currentConversation);
    if (currentHandoffStatus === "active") {
      const blockedState = updateInboundMeta(
        currentConversation,
        message.messageId,
        message.timestamp
      );
      await jsonFileStorage.upsertConversation(blockedState);
      await jsonFileStorage.saveIncomingMessage({
        ...message,
        status,
        allowlist: {
          enabled: allowlistEnabled,
          hit: allowlistHit,
        },
      });
      logger.info({
        event: "handoff.blocked",
        waId: maskNumber(normalizedFrom),
        route: meta?.route,
        method: meta?.method,
        requestId: meta?.requestId,
      });
      logger.info({
        event: "reply.skipped",
        waId: maskNumber(normalizedFrom),
        reason: "handoff_active",
        route: meta?.route,
        method: meta?.method,
        requestId: meta?.requestId,
      });
      continue;
    }

    if (currentHandoffStatus === "pending") {
      const pendingState = updateInboundMeta(
        currentConversation,
        message.messageId,
        message.timestamp
      );
      const handoffResult = handleHandoff(
        pendingState,
        message.text,
        message.timestamp
      );
      const updatedConversation = handoffResult.state;

      if (handoffResult.outcome === "requested") {
        logger.info({
          event: "handoff.pending_invalid_reply",
          waId: maskNumber(normalizedFrom),
          textLength: message.text ? message.text.length : 0,
          hasText: Boolean(message.text),
          route: meta?.route,
          method: meta?.method,
          requestId: meta?.requestId,
        });
      }
      if (handoffResult.outcome === "accepted") {
        logger.info({
          event: "handoff.confirm.accepted",
          waId: maskNumber(normalizedFrom),
          route: meta?.route,
          method: meta?.method,
          requestId: meta?.requestId,
        });
        logger.info({
          event: "bot.pause",
          waId: maskNumber(normalizedFrom),
          reason: "handoff_confirmed",
          route: meta?.route,
          method: meta?.method,
          requestId: meta?.requestId,
        });
      }
      if (handoffResult.outcome === "declined") {
        logger.info({
          event: "handoff.confirm.declined",
          waId: maskNumber(normalizedFrom),
          route: meta?.route,
          method: meta?.method,
          requestId: meta?.requestId,
        });
        logger.info({
          event: "bot.resume",
          waId: maskNumber(normalizedFrom),
          route: meta?.route,
          method: meta?.method,
          requestId: meta?.requestId,
        });
      }

      await jsonFileStorage.upsertConversation(updatedConversation);
      logConversationWindow(updatedConversation, meta);
      logConversationIntent(updatedConversation, meta);
      await persistEventSafe(
        "conversation.window",
        {
          waId: updatedConversation.waId,
          isOpen: updatedConversation.window.isOpen,
          expiresAt: updatedConversation.window.expiresAt,
        },
        updatedConversation.waId,
        message.messageId
      );
      await persistEventSafe(
        "conversation.intent",
        { waId: updatedConversation.waId, intent: updatedConversation.intent ?? "unknown" },
        updatedConversation.waId,
        message.messageId
      );
      await persistConversationSafe({
        waId: updatedConversation.waId,
        windowIsOpen: updatedConversation.window.isOpen,
        windowExpiresAt: updatedConversation.window.expiresAt,
        lastInboundAt: updatedConversation.lastInboundAt ?? null,
        lastOutboundAt: updatedConversation.lastOutboundAt ?? null,
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
        route: meta?.route,
        method: meta?.method,
        requestId: meta?.requestId,
      });

      if (!allowlistHit || !handoffResult.replyText || !env.outboundEnabled) {
        continue;
      }

      const decision = decideOutboundPolicy({
        state: updatedConversation,
        now: Date.now(),
        isSandbox: env.WHATSAPP_SANDBOX,
        outOfWindowTemplate: env.WHATSAPP_OUT_OF_WINDOW_TEMPLATE,
        sandboxTemplate: "hello_world",
      });

      if (decision.action === "block") {
        const nowIso = new Date().toISOString();
        const resolvedTemplate = resolveTemplateForIntent(updatedConversation.intent);
        const blockedConversation = markTemplateNeeded(updatedConversation, {
          templateSuggested: resolvedTemplate.name,
          atIso: nowIso,
          intent: updatedConversation.intent,
          lastInboundMessageId: message.messageId,
        });
        await jsonFileStorage.upsertConversation(blockedConversation);
        for (const event of decision.events ?? []) {
          if (event.event === "outbound.blocked.window_closed") {
            logger.warn({
              event: "outbound.blocked.window_closed",
              messageId: message.messageId,
              waId: maskNumber(normalizedFrom),
              intent: updatedConversation.intent ?? "unknown",
              policy: decision.policy,
              clientId: env.CLIENT_ID,
              route: meta?.route,
              method: meta?.method,
              requestId: meta?.requestId,
            });
          }
          if (event.event === "outbound.needs_template") {
            logger.warn({
              event: "outbound.needs_template",
              messageId: message.messageId,
              waId: maskNumber(normalizedFrom),
              intent: updatedConversation.intent ?? "unknown",
              suggestedTemplate: resolvedTemplate.name,
              language: resolvedTemplate.language,
              suggestedLanguage: resolvedTemplate.language,
              clientId: env.CLIENT_ID,
              route: meta?.route,
              method: meta?.method,
              requestId: meta?.requestId,
            });
          }
        }
        await attemptTemplateFallback({
          waId: normalizedFrom,
          toE164: message.from,
          intent: updatedConversation.intent,
          messageId: message.messageId,
        });
        continue;
      }

      const replyType = decision.replyType ?? "text";
      if (replyType === "text" && !env.OUTBOUND_TEXT_ENABLED) {
        logger.error({
          event: "outbound.text.failed",
          waId: maskNumber(normalizedFrom),
          to: maskNumber(message.from),
          intent: updatedConversation.intent ?? "unknown",
          clientId: env.CLIENT_ID,
          requestId: meta?.requestId,
          rid: message.messageId,
          messageId: message.messageId,
          reason: "disabled",
        });
        await attemptTemplateFallback({
          waId: normalizedFrom,
          toE164: message.from,
          intent: updatedConversation.intent,
          messageId: message.messageId,
        });
        continue;
      }
      const toForReply = env.WHATSAPP_SANDBOX
        ? env.WHATSAPP_SANDBOX_TO || normalizedFrom
        : message.from;

      if (replyType === "text" && !env.OUTBOUND_TEXT_ENABLED) {
        logger.error({
          event: "outbound.text.failed",
          waId: maskNumber(normalizedFrom),
          to: maskNumber(toForReply),
          intent: updatedConversation.intent ?? "unknown",
          clientId: env.CLIENT_ID,
          requestId: meta?.requestId,
          rid: message.messageId,
          messageId: message.messageId,
          reason: "disabled",
        });
        await attemptTemplateFallback({
          waId: normalizedFrom,
          toE164: message.from,
          intent: updatedConversation.intent,
          messageId: message.messageId,
        });
        continue;
      }

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

      const sendPromise =
        replyType === "template"
          ? sendTemplateMessage(
              toForReply,
              decision.templateName ?? env.WHATSAPP_OUT_OF_WINDOW_TEMPLATE,
              decision.templateLanguage ?? "pt_BR"
            )
          : sendOutboundText({
              toE164: toForReply,
              waId: normalizedFrom,
              intent: updatedConversation.intent,
              messageId: message.messageId,
              replyText: handoffResult.replyText,
            });

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
      continue;
    }

    const inboundConversation = updateInbound(
      currentConversation,
      message.messageId,
      message.timestamp,
      message.text
    );
    let updatedConversation = inboundConversation;
    const wasPending = currentConversation.handoff.status === "pending";
    const handoffResult = handleHandoff(
      updatedConversation,
      message.text,
      message.timestamp
    );
    if (handoffResult.handled) {
      updatedConversation = handoffResult.state;
      if (handoffResult.outcome === "requested") {
        logger.info({
          event: "handoff.detected",
          waId: maskNumber(normalizedFrom),
          route: meta?.route,
          method: meta?.method,
          requestId: meta?.requestId,
        });
        logger.info({
          event: "handoff.confirm.requested",
          waId: maskNumber(normalizedFrom),
          route: meta?.route,
          method: meta?.method,
          requestId: meta?.requestId,
        });
      }
      if (wasPending && handoffResult.outcome === "requested") {
        logger.info({
          event: "handoff.pending_invalid_reply",
          waId: maskNumber(normalizedFrom),
          textLength: message.text ? message.text.length : 0,
          hasText: Boolean(message.text),
          route: meta?.route,
          method: meta?.method,
          requestId: meta?.requestId,
        });
      }
      if (handoffResult.outcome === "accepted") {
        logger.info({
          event: "handoff.confirm.accepted",
          waId: maskNumber(normalizedFrom),
          route: meta?.route,
          method: meta?.method,
          requestId: meta?.requestId,
        });
        logger.info({
          event: "bot.pause",
          waId: maskNumber(normalizedFrom),
          reason: "handoff_confirmed",
          route: meta?.route,
          method: meta?.method,
          requestId: meta?.requestId,
        });
      }
      if (handoffResult.outcome === "declined") {
        logger.info({
          event: "handoff.confirm.declined",
          waId: maskNumber(normalizedFrom),
          route: meta?.route,
          method: meta?.method,
          requestId: meta?.requestId,
        });
        logger.info({
          event: "bot.resume",
          waId: maskNumber(normalizedFrom),
          route: meta?.route,
          method: meta?.method,
          requestId: meta?.requestId,
        });
      }
    }

    if (getHandoffStatus(updatedConversation) === "active") {
      await jsonFileStorage.upsertConversation(updatedConversation);
      await jsonFileStorage.saveIncomingMessage({
        ...message,
        status,
        allowlist: {
          enabled: allowlistEnabled,
          hit: allowlistHit,
        },
      });
      logger.info({
        event: "handoff.blocked",
        waId: maskNumber(normalizedFrom),
        route: meta?.route,
        method: meta?.method,
        requestId: meta?.requestId,
      });
      logger.info({
        event: "reply.skipped",
        waId: maskNumber(normalizedFrom),
        reason: "handoff_active",
        route: meta?.route,
        method: meta?.method,
        requestId: meta?.requestId,
      });
      continue;
    }

    const flowResult = handoffResult.handled
      ? { state: updatedConversation, handled: false as const, replyText: undefined }
      : advanceQuoteSiteFlow(updatedConversation, message.text);
    if (flowResult.handled) {
      updatedConversation = flowResult.state;
    }
    await jsonFileStorage.upsertConversation(updatedConversation);
    logConversationWindow(updatedConversation, meta);
    logConversationIntent(updatedConversation, meta);
    await persistEventSafe(
      "conversation.window",
      {
        waId: updatedConversation.waId,
        isOpen: updatedConversation.window.isOpen,
        expiresAt: updatedConversation.window.expiresAt,
      },
      updatedConversation.waId,
      message.messageId
    );
    await persistEventSafe(
      "conversation.intent",
      { waId: updatedConversation.waId, intent: updatedConversation.intent ?? "unknown" },
      updatedConversation.waId,
      message.messageId
    );
    await persistConversationSafe({
      waId: updatedConversation.waId,
      windowIsOpen: updatedConversation.window.isOpen,
      windowExpiresAt: updatedConversation.window.expiresAt,
      lastInboundAt: updatedConversation.lastInboundAt ?? null,
      lastOutboundAt: updatedConversation.lastOutboundAt ?? null,
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
      route: meta?.route,
      method: meta?.method,
      requestId: meta?.requestId,
    });
    await persistEventSafe(
      "webhook.message",
      { messageId: message.messageId, from: message.from, type: message.type, status, allowlistHit },
      message.from,
      message.messageId
    );
    await persistInboundSafe({
      waId: message.from,
      messageId: message.messageId,
      type: mapMessageType(message.type),
      bodyText: message.text,
      allowlistHit,
      rawPayload: {
        ...message.raw,
        text: message.text,
        timestamp: message.timestamp,
      },
    });

    if (!allowlistHit) {
      continue;
    }

    if (!shouldAutoReply(updatedConversation)) {
      logger.info({
        event: "reply.skipped",
        waId: maskNumber(normalizedFrom),
        reason: "handoff_active",
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

    const decision = decideOutboundPolicy({
      state: updatedConversation,
      now: Date.now(),
      isSandbox: env.WHATSAPP_SANDBOX,
      outOfWindowTemplate: env.WHATSAPP_OUT_OF_WINDOW_TEMPLATE,
      sandboxTemplate: "hello_world",
    });

    if (decision.action === "block") {
      const nowIso = new Date().toISOString();
      const resolvedTemplate = resolveTemplateForIntent(updatedConversation.intent);
      const blockedConversation = markTemplateNeeded(updatedConversation, {
        templateSuggested: resolvedTemplate.name,
        atIso: nowIso,
        intent: updatedConversation.intent,
        lastInboundMessageId: message.messageId,
      });
      await jsonFileStorage.upsertConversation(blockedConversation);
      for (const event of decision.events ?? []) {
        if (event.event === "outbound.blocked.window_closed") {
          logger.warn({
            event: "outbound.blocked.window_closed",
            messageId: message.messageId,
            waId: maskNumber(normalizedFrom),
            intent: updatedConversation.intent ?? "unknown",
            policy: decision.policy,
            clientId: env.CLIENT_ID,
            route: meta?.route,
            method: meta?.method,
            requestId: meta?.requestId,
          });
        }
        if (event.event === "outbound.needs_template") {
          logger.warn({
            event: "outbound.needs_template",
            messageId: message.messageId,
            waId: maskNumber(normalizedFrom),
            intent: updatedConversation.intent ?? "unknown",
            suggestedTemplate: resolvedTemplate.name,
            language: resolvedTemplate.language,
            suggestedLanguage: resolvedTemplate.language,
            clientId: env.CLIENT_ID,
            route: meta?.route,
            method: meta?.method,
            requestId: meta?.requestId,
          });
        }
      }
      await attemptTemplateFallback({
        waId: normalizedFrom,
        toE164: message.from,
        intent: updatedConversation.intent,
        messageId: message.messageId,
      });
      continue;
    }

    const replyType = decision.replyType ?? "text";

    let replyText = flowResult.replyText ?? handoffResult.replyText ?? (env.WHATSAPP_ECHO_ENABLED
      ? message.type === "text" && message.text
        ? `ECO: ${message.text}`
        : `ECO: (mensagem ${message.type} recebida)`
      : env.WHATSAPP_DEFAULT_REPLY);

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
      !flowResult.handled &&
      !handoffResult.handled &&
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
          stateSummary: {
            segment: updatedConversation.answers?.segment,
            flow: updatedConversation.flow,
            flowStep: updatedConversation.flowStep,
            answers: updatedConversation.answers,
          },
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
            decision.templateName ?? env.WHATSAPP_OUT_OF_WINDOW_TEMPLATE,
            decision.templateLanguage ?? "pt_BR"
          )
        : sendOutboundText({
            toE164: toForReply,
            waId: normalizedFrom,
            intent: updatedConversation.intent,
            messageId: message.messageId,
            replyText,
          });

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

function mapMessageType(type: string): MessageType {
  if (type === "text") return MessageType.TEXT;
  if (type === "image") return MessageType.IMAGE;
  if (type === "audio") return MessageType.AUDIO;
  if (type === "video") return MessageType.VIDEO;
  if (type === "document") return MessageType.DOCUMENT;
  if (type === "template") return MessageType.TEMPLATE;
  return MessageType.UNKNOWN;
}

function parseDebugCloseWindowCommand(text: string | null): { waId: string } | null {
  if (!text) return null;
  const trimmed = text.trim();
  const match = trimmed.match(/^#debug\s+closewindow\s+([0-9]+)$/i);
  if (!match) return null;
  return { waId: match[1] ?? "" };
}
