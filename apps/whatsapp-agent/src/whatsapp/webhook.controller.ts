import { IncomingMessage, ServerResponse } from "node:http";
import { Prisma, MessageStatus, MessageType } from "@prisma/client";
import { env, normalizeWaId } from "../config/env.js";
import { normalizeWebhook } from "../domain/whatsapp/normalizeWebhook.js";
import { logger } from "../logger/logger.js";
import { createStorage } from "../storage/storageFactory.js";
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
  isWindowOpen,
} from "../conversation/conversation.service.js";
import { createAgentBrain } from "../agent/agent.factory.js";
import {
  parseTemplateCommand,
  resolveTemplateKey,
} from "./templateCommand.js";
import { getDefaultTenant } from "../config/tenantConfig.js";
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
const storage = createStorage();
const adminTemplateDedup = new Map<string, number>();
const ADMIN_TEMPLATE_TTL_MS = 10 * 60 * 1000;
const conversationVersionByWaId = new Map<string, { version: number; lastInboundAt?: string }>();

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

  const tenant = await getDefaultTenant();
  const tenantAllowlist = (tenant?.allowlist ?? env.WHATSAPP_ALLOWLIST)
    .map((value: string) => normalizeWaId(value))
    .filter(Boolean);
  const tenantHandoffAttendantWaid =
    tenant?.handoffAttendantWaid || env.HANDOFF_ATTENDANT_WAID;
  const tenantHandoffTemplateName =
    tenant?.templates?.manualHandoff || env.HANDOFF_TEMPLATE_NAME;

  const attemptTemplateFallback = async (params: {
    waId: string;
    toE164: string;
    intent: ConversationIntent | undefined;
    messageId: string;
    reasonIfSkip?: string;
  }) => {
    if (!env.OUTBOUND_TEMPLATE_FALLBACK) {
      await persistOutboundBlockedSafe({
        waId: params.waId,
        messageId: params.messageId,
        type: MessageType.TEMPLATE,
        templateName: env.OUTBOUND_TEMPLATE_DEFAULT_NAME,
        templateLang: env.OUTBOUND_TEMPLATE_DEFAULT_LANG,
        reason: "fallback_disabled",
      });
      return;
    }
    if (!env.outboundEnabled) {
      logger.error({
        event: "outbound.template.failed",
        waId: maskNumber(params.waId),
        to: maskNumber(params.toE164),
        intent: params.intent ?? "unknown",
        template: env.OUTBOUND_TEMPLATE_DEFAULT_NAME,
        clientId: tenantClientId,
        clientKey: tenantClientKey,
        reason: "outbound_disabled",
        requestId: meta?.requestId,
        rid: params.messageId,
        messageId: params.messageId,
      });
      await persistOutboundBlockedSafe({
        waId: params.waId,
        messageId: params.messageId,
        type: MessageType.TEMPLATE,
        templateName: env.OUTBOUND_TEMPLATE_DEFAULT_NAME,
        templateLang: env.OUTBOUND_TEMPLATE_DEFAULT_LANG,
        reason: "outbound_disabled",
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
        clientId: tenantClientId,
        clientKey: tenantClientKey,
        reason: params.reasonIfSkip,
        requestId: meta?.requestId,
        rid: params.messageId,
        messageId: params.messageId,
      });
      await persistOutboundBlockedSafe({
        waId: params.waId,
        messageId: params.messageId,
        type: MessageType.TEMPLATE,
        templateName: env.OUTBOUND_TEMPLATE_DEFAULT_NAME,
        templateLang: env.OUTBOUND_TEMPLATE_DEFAULT_LANG,
        reason: params.reasonIfSkip,
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
        clientId: tenantClientId,
        clientKey: tenantClientKey,
        reason: "intent_unresolved",
        requestId: meta?.requestId,
        rid: params.messageId,
        messageId: params.messageId,
      });
      await persistOutboundBlockedSafe({
        waId: params.waId,
        messageId: params.messageId,
        type: MessageType.TEMPLATE,
        templateName: env.OUTBOUND_TEMPLATE_DEFAULT_NAME,
        templateLang: env.OUTBOUND_TEMPLATE_DEFAULT_LANG,
        reason: "intent_unresolved",
      });
      return;
    }
    const templateConfig = resolveTemplateForIntent(params.intent, tenantClientKey);
    if (!templateConfig.name) {
      logger.error({
        event: "outbound.template.failed",
        waId: maskNumber(params.waId),
        to: maskNumber(params.toE164),
        intent: params.intent ?? "unknown",
        template: "missing",
        clientId: tenantClientId,
        clientKey: tenantClientKey,
        reason: "template_missing",
        requestId: meta?.requestId,
        rid: params.messageId,
        messageId: params.messageId,
      });
      await persistOutboundBlockedSafe({
        waId: params.waId,
        messageId: params.messageId,
        type: MessageType.TEMPLATE,
        templateName: null,
        templateLang: null,
        reason: "template_missing",
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
      clientId: tenantClientId,
      clientKey: tenantClientKey,
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
    if (primaryResult.ok && params.intent === "pricing") {
      await persistEventSafe(
        "lead.template.sent",
        {
          intent: "pricing",
          templateName: templateConfig.name,
          templateLang: templateConfig.language ?? env.OUTBOUND_TEMPLATE_DEFAULT_LANG,
        },
        params.waId,
        params.messageId
      );
    }
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
          clientId: tenantClientId,
          clientKey: tenantClientKey,
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
        if (fallbackResult.ok && params.intent === "pricing") {
          await persistEventSafe(
            "lead.template.sent",
            {
              intent: "pricing",
              templateName: fallback.name,
              templateLang: fallback.language,
            },
            params.waId,
            params.messageId
          );
        }
      }
    }
  };

  const shouldSendOutbound = (
    waId: string,
    guard?: { version: number; lastInboundAt?: string },
    messageId?: string
  ) => {
    if (!guard) return true;
    const current = conversationVersionByWaId.get(waId);
    const matchesVersion = current?.version === guard.version;
    const matchesInboundAt =
      !guard.lastInboundAt || current?.lastInboundAt === guard.lastInboundAt;
    const isE2E = messageId?.startsWith("wamid.e2e.") ?? false;
    if ((!matchesVersion || !matchesInboundAt) && isE2E) {
      logger.warn({
        event: "demo.guardrail.bypass",
        reason: "e2e",
        waId: maskNumber(waId),
        requestId: meta?.requestId,
        messageId,
        myVersion: guard.version,
        currentVersion: current?.version ?? 0,
      });
      return true;
    }
    if (!matchesVersion || !matchesInboundAt) {
      logger.warn({
        event: "demo.guardrail.drop_late_reply",
        waId: maskNumber(waId),
        requestId: meta?.requestId,
        reason: matchesVersion ? "inbound_changed" : "version_mismatch",
        myVersion: guard.version,
        currentVersion: current?.version ?? 0,
        lastInboundAt: guard.lastInboundAt,
        currentInboundAt: current?.lastInboundAt,
      });
      return false;
    }
    return true;
  };

  const sendOutboundText = async (params: {
    toE164: string;
    waId: string;
    intent: ConversationIntent | undefined;
    messageId: string;
    replyText: string;
    guard?: { version: number; lastInboundAt?: string };
  }) => {
    if (!shouldSendOutbound(params.waId, params.guard, params.messageId)) {
      return { ok: false, errorBody: "late_reply_dropped" };
    }
    logger.info({
      event: "outbound.text.sending",
      waId: maskNumber(params.waId),
      to: maskNumber(params.toE164),
      intent: params.intent ?? "unknown",
      clientId: tenantClientId,
      clientKey: tenantClientKey,
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
        clientId: tenantClientId,
        clientKey: tenantClientKey,
        requestId: meta?.requestId,
        rid: params.messageId,
        messageId: params.messageId,
        metaMessageId: result.messageId,
      });
      await storage.appendOutboundEvent({
        direction: "outbound",
        messageId: result.messageId ?? params.messageId,
        metaMessageId: result.messageId ?? undefined,
        from: params.toE164,
        to: params.toE164,
        timestamp: new Date().toISOString(),
        type: "text",
        text: params.replyText,
        intent: params.intent ?? undefined,
        clientKey: tenantClientKey ?? "default",
        status: "sent",
        allowlist: { enabled: false, hit: false },
        raw: {
          senderPhoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
          requestId: meta?.requestId,
          rid: params.messageId,
          metaMessageId: result.messageId,
        },
      });
    } else {
      logger.error({
        event: "outbound.text.failed",
        waId: maskNumber(params.waId),
        to: maskNumber(params.toE164),
        intent: params.intent ?? "unknown",
        clientId: tenantClientId,
        clientKey: tenantClientKey,
        requestId: meta?.requestId,
        rid: params.messageId,
        messageId: params.messageId,
        status: result.status,
        errorBody: result.errorBody,
      });
      await storage.appendOutboundEvent({
        direction: "outbound",
        messageId: params.messageId,
        metaMessageId: undefined,
        from: params.toE164,
        to: params.toE164,
        timestamp: new Date().toISOString(),
        type: "text",
        text: params.replyText,
        intent: params.intent ?? undefined,
        clientKey: tenantClientKey ?? "default",
        status: "failed",
        allowlist: { enabled: false, hit: false },
        raw: {
          senderPhoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
          requestId: meta?.requestId,
          rid: params.messageId,
          errorBody: result.errorBody,
        },
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

  const isWindowClosedError = (errorBody?: string, status?: number) => {
    const message = (errorBody ?? "").toLowerCase();
    if (status === 470) return true;
    if (message.includes("window") && message.includes("closed")) return true;
    if (message.includes("outside") && message.includes("24")) return true;
    if (message.includes("time window")) return true;
    return false;
  };

  const notifyAttendantDemoScheduled = async (params: {
    attendantWaId: string;
    leadWaId: string;
    intent: string;
    schedule: string;
    snippet: string;
    templateName?: string;
    requestId?: string;
  }) => {
    const nowIso = new Date().toISOString();
    const maskedLead = maskNumber(params.leadWaId);
    const maskedAttendant = maskNumber(params.attendantWaId);
    const clientDisplay =
      tenantClientKey && tenantClientKey !== "default" ? tenantClientKey : "Re7Online";
    const intentLabel = params.intent !== "unknown" ? params.intent : "Demonstração";
    const scheduleLabel = params.schedule || "A combinar";
    const leadLink = `https://wa.me/${params.leadWaId}`;
    const baseMessageId = `handoff.notify.${params.requestId ?? Date.now()}`;
    const textBody = [
      "[DEMO] Lead pediu demonstração",
      `Cliente: ${clientDisplay}`,
      `Serviço: ${intentLabel}`,
      `Quando: ${scheduleLabel}`,
      `Lead: ${params.leadWaId}`,
      `Link: ${leadLink}`,
      `Msg: ${params.snippet}`,
      `TS: ${nowIso}`,
    ].join("\n");

    const attendantConversation = await storage.getConversation(
      params.attendantWaId
    );
    const windowOpen = attendantConversation
      ? isWindowOpen(attendantConversation, Date.now())
      : false;
    const windowState = windowOpen ? "open" : "closed";

    logger.info({
      event: "handoff.notify.window_state",
      waId: maskedAttendant,
      leadWaId: maskedLead,
      windowState,
      requestId: params.requestId,
    });

    if (windowOpen) {
      logger.info({
        event: "handoff.notify.sending",
        waId: maskedAttendant,
        leadWaId: maskedLead,
        notifyType: "text",
        windowState,
        chosenChannel: "text",
        requestId: params.requestId,
      });
      const textResult = await sendOutboundText({
        toE164: params.attendantWaId,
        waId: params.attendantWaId,
        intent: "handoff",
        messageId: `${baseMessageId}.text`,
        replyText: textBody,
      });
      if (textResult.ok) {
        logger.info({
          event: "handoff.notify.sent",
          waId: maskedAttendant,
          leadWaId: maskedLead,
          notifyType: "text",
          requestId: params.requestId,
        });
        await persistEventSafe(
          "lead.handoff_notified",
          {
            leadWaId: maskedLead,
            intent: params.intent,
            schedule: params.schedule,
          },
          params.leadWaId,
          `${baseMessageId}.text`
        );
        return;
      }
      if (isWindowClosedError(textResult.errorBody, textResult.status)) {
        logger.warn({
          event: "handoff.notify.text_fallback_to_template",
          waId: maskedAttendant,
          leadWaId: maskedLead,
          status: textResult.status,
          requestId: params.requestId,
        });
      } else {
        logger.error({
          event: "handoff.notify.failed",
          waId: maskedAttendant,
          leadWaId: maskedLead,
          notifyType: "text",
          status: textResult.status,
          requestId: params.requestId,
        });
        return;
      }
    }

    if (!windowOpen) {
      logger.info({
        event: "handoff.notify.window_closed",
        waId: maskedAttendant,
        leadWaId: maskedLead,
        requestId: params.requestId,
      });
    }

    if (!env.HANDOFF_NOTIFY_FALLBACK_TO_TEMPLATE) {
      logger.error({
        event: "handoff.notify.failed",
        waId: maskedAttendant,
        leadWaId: maskedLead,
        notifyType: "template",
        reason: "window_closed",
        requestId: params.requestId,
      });
      return;
    }

    logger.info({
      event: "handoff.notify.template.sending",
      waId: maskedAttendant,
      leadWaId: maskedLead,
      windowState,
      chosenChannel: "template",
      requestId: params.requestId,
    });

    const templateName = (params.templateName ?? env.HANDOFF_TEMPLATE_NAME) || "";
    const templateLang = env.HANDOFF_TEMPLATE_LANG || "";
    if (!templateName || !templateLang) {
      logger.error({
        event: "handoff.notify.template.failed",
        waId: maskedAttendant,
        leadWaId: maskedLead,
        reason: "template_missing",
        requestId: params.requestId,
      });
      return;
    }

    const toParam = (value: string | undefined) => {
      const text = (value ?? "").trim();
      return text.length > 0 ? text : "-";
    };

    const templateParams = [
      toParam(clientDisplay),
      toParam(intentLabel),
      toParam(scheduleLabel),
      toParam(`Chamar no WhatsApp: ${leadLink}`),
    ];

    logger.info({
      event: "handoff.notify.template.params",
      waId: maskedAttendant,
      leadWaId: maskedLead,
      paramsCount: templateParams.length,
      requestId: params.requestId,
    });

    const templateResult = await sendTemplate({
      toE164: params.attendantWaId,
      waId: params.attendantWaId,
      intent: "handoff",
      templateName,
      lang: templateLang,
      components: [
        {
          type: "body",
          parameters: templateParams.map((text) => ({
            type: "text",
            text,
          })),
        },
      ],
      isFallback: false,
      requestId: params.requestId,
      rid: `${baseMessageId}.template`,
      messageId: `${baseMessageId}.template`,
      clientId: tenantClientId,
      clientKey: tenantClientKey,
    });
    await persistOutboundTemplateSafe({
      waId: params.attendantWaId,
      messageId: `${baseMessageId}.template`,
      templateName,
      templateLang,
      status: templateResult.ok ? MessageStatus.SENT : MessageStatus.FAILED,
      errorBody: templateResult.errorBody ?? null,
      metaMessageId: templateResult.metaMessageId ?? null,
    });
    await persistEventSafe(
      templateResult.ok ? "outbound.template.sent" : "outbound.template.failed",
      {
        template: templateName,
        language: templateLang,
        status: templateResult.status,
        errorBody: templateResult.errorBody,
      },
      params.attendantWaId,
      `${baseMessageId}.template`
    );
    if (!templateResult.ok) {
      logger.error({
        event: "handoff.notify.template.failed",
        waId: maskedAttendant,
        leadWaId: maskedLead,
        status: templateResult.status,
        requestId: params.requestId,
      });
      return;
    }

    logger.info({
      event: "handoff.notify.template.sent",
      waId: maskedAttendant,
      leadWaId: maskedLead,
      requestId: params.requestId,
    });
    await persistEventSafe(
      "lead.handoff_notified",
      {
        leadWaId: maskedLead,
        intent: params.intent,
        schedule: params.schedule,
      },
      params.leadWaId,
      `${baseMessageId}.template`
    );
    return;
  };

  const typedPayload = payload as WhatsAppWebhookPayload;
  const normalized = normalizeWebhook(typedPayload);
  const phoneNumberId =
    typedPayload.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
  let tenantClientId = "";
  let tenantClientKey = env.CLIENT_ID;
  try {
    const tenant = await resolveTenant(phoneNumberId, meta);
    tenantClientId = tenant.clientId;
    tenantClientKey = tenant.clientKey;
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
      const requestId = meta?.requestId ?? messageId ?? null;
      if (!tenantClientId) return;
      await persistEvent({
        clientId: tenantClientId,
        waId: waId ?? null,
        messageId: messageId ?? null,
        requestId,
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

  const persistOutboundBlockedSafe = async (params: {
    waId: string;
    messageId: string;
    type: MessageType;
    templateName?: string | null;
    templateLang?: string | null;
    reason: string;
    policy?: string;
  }) => {
    try {
      if (!tenantClientId) return;
      const errorBody = JSON.stringify({
        reason: params.reason,
        policy: params.policy,
      });
      await persistOutboundMessage({
        clientId: tenantClientId,
        phoneNumberId: phoneNumberId ?? undefined,
        waId: params.waId,
        messageId: params.messageId,
        type: params.type,
        status: MessageStatus.FAILED,
        templateName: params.templateName ?? undefined,
        templateLang: params.templateLang ?? undefined,
        requestId: meta?.requestId,
        errorBody,
        rawPayload: {
          reason: params.reason,
          policy: params.policy,
          templateName: params.templateName ?? undefined,
          templateLang: params.templateLang ?? undefined,
        },
      });
    } catch (error) {
      logger.error({
        event: "db.persist.error",
        target: "outbound_blocked",
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
    const existing = await storage.findByMessageId(message.messageId);
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
    logger.info({
      event: "tenant.resolved",
      tenantId: tenant?.id ?? "default",
      waId: maskNumber(normalizedFrom),
      requestId: meta?.requestId,
    });
    const allowlistEnabled = tenantAllowlist.length > 0;
    const allowlistHit = allowlistEnabled
      ? tenantAllowlist.includes(normalizedFrom)
      : true;
    const status = allowlistHit ? "received" : "ignored";

    logger.info({
      event: "allowlist.check",
      from: normalizedFrom,
      allowlistEnabled,
      allowlistCount: tenantAllowlist.length,
      hit: allowlistHit,
      route: meta?.route,
      method: meta?.method,
      requestId: meta?.requestId,
    });
    await persistEventSafe(
      "allowlist.check",
      { from: normalizedFrom, allowlistEnabled, allowlistCount: tenantAllowlist.length, hit: allowlistHit },
      normalizedFrom,
      message.messageId
    );

    const currentConversation = await getOrCreateConversation(
      storage,
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
        storage,
        targetWaId,
        message.timestamp
      );
      const pastIso = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const closedWindowState = {
        ...targetConversation,
        lastInboundAt: pastIso,
        window: { isOpen: false, expiresAt: pastIso },
      };
      await storage.upsertConversation(closedWindowState);
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
      await storage.upsertConversation(updatedMeta);
      await storage.saveIncomingMessage({
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
        await storage.upsertConversation(updatedMeta);
        await storage.saveIncomingMessage({
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
        await storage.upsertConversation(updatedMeta);
        await storage.saveIncomingMessage({
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
        await storage.upsertConversation(updatedMeta);
        await storage.saveIncomingMessage({
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
          storage,
          targetWaId,
          message.timestamp
        );
        const clearedTarget = clearTemplateNeeded(
          updateOutbound(targetConversation, result.messageId, new Date().toISOString())
        );
        await storage.upsertConversation(clearedTarget);
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
      await storage.upsertConversation(updatedMeta);
      await storage.saveIncomingMessage({
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
      await storage.upsertConversation(updatedByAdmin);
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
      await storage.saveIncomingMessage({
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
      await storage.upsertConversation(blockedState);
      await storage.saveIncomingMessage({
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

      await storage.upsertConversation(updatedConversation);
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

      await storage.saveIncomingMessage({
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
        const resolvedTemplate = resolveTemplateForIntent(
          updatedConversation.intent,
          tenantClientKey
        );
        const blockedConversation = markTemplateNeeded(updatedConversation, {
          templateSuggested: resolvedTemplate.name,
          atIso: nowIso,
          intent: updatedConversation.intent,
          lastInboundMessageId: message.messageId,
        });
        await storage.upsertConversation(blockedConversation);
        for (const event of decision.events ?? []) {
          if (event.event === "outbound.blocked.window_closed") {
            logger.warn({
              event: "outbound.blocked.window_closed",
              messageId: message.messageId,
              waId: maskNumber(normalizedFrom),
              intent: updatedConversation.intent ?? "unknown",
              policy: decision.policy,
              clientId: tenantClientId,
              clientKey: tenantClientKey,
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
              clientId: tenantClientId,
              clientKey: tenantClientKey,
              route: meta?.route,
              method: meta?.method,
              requestId: meta?.requestId,
            });
          }
        }
        await persistOutboundBlockedSafe({
          waId: normalizedFrom,
          messageId: message.messageId,
          type: MessageType.TEMPLATE,
          templateName: resolvedTemplate.name,
          templateLang: resolvedTemplate.language ?? env.OUTBOUND_TEMPLATE_DEFAULT_LANG,
          reason: "window_closed",
          policy: decision.policy,
        });
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
          clientId: tenantClientId,
          clientKey: tenantClientKey,
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
          clientId: tenantClientId,
          clientKey: tenantClientKey,
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
              guard: undefined,
            });

      void sendPromise
        .then(async (result) => {
          if (result.ok) {
            await storage.updateMessage(message.messageId, {
              status: "replied",
              repliedAt: new Date().toISOString(),
              replyType,
            });
            const outboundConversation = updateOutbound(
              updatedConversation,
              result.messageId,
              new Date().toISOString()
            );
            await storage.upsertConversation(outboundConversation);
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
    const nextVersion = (conversationVersionByWaId.get(normalizedFrom)?.version ?? 0) + 1;
    conversationVersionByWaId.set(normalizedFrom, {
      version: nextVersion,
      lastInboundAt: inboundConversation.lastInboundAt,
    });
    const inboundGuard = {
      version: nextVersion,
      lastInboundAt: inboundConversation.lastInboundAt,
    };
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
      await storage.upsertConversation(updatedConversation);
      await storage.saveIncomingMessage({
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
    await storage.upsertConversation(updatedConversation);
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

    await storage.saveIncomingMessage({
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

    const now = Date.now();
    const leadWindowMs = 24 * 60 * 60 * 1000;
    let flowReplyText = flowResult.replyText;
    let leadReplyText: string | undefined;
    let leadHandled = false;
    let leadUpdated = false;
    let demoReplyText: string | undefined;
    let demoHandled = false;
    let demoUpdated = false;
    let skipDemoReplies = false;
    let hasDemoSignal = false;

    if (message.text) {
      if ((updatedConversation.demoStatus ?? "none") === "scheduled") {
        const normalizedText = normalizeLite(message.text);
        const isGreetingOnly =
          /^(oi|ola|bom dia|boa tarde|boa noite|oi bom dia|oi boa tarde|oi boa noite|ola bom dia|ola boa tarde|ola boa noite)$/i.test(
            normalizedText
          );
        const isReschedule = normalizedText.includes("reagendar");
        const looksLikeDemoFollowup =
          /demonstra|demo|agend|reagendar|segunda|terca|terça|quarta|quinta|sexta|sabado|sábado|domingo|hoje|amanha|amanhã|\b\d{1,2}\s?h\b|\b\d{1,2}:\d{2}\b|manh[aã]|tarde|noite/i.test(
            normalizedText
          );
        if (!isReschedule && looksLikeDemoFollowup && !isGreetingOnly) {
          skipDemoReplies = true;
          demoHandled = true;
          flowReplyText = undefined;
          logger.info({
            event: "demo.guardrail.scheduled_skip",
            waId: maskNumber(normalizedFrom),
            reason: "looks_like_demo_followup",
            intent: updatedConversation.intent ?? "unknown",
            text: message.text,
            route: meta?.route,
            method: meta?.method,
            requestId: meta?.requestId,
          });
          await storage.upsertConversation(updatedConversation);
          continue;
        }
      }
      const demoContext = [
        "demo",
        "demonstra",
        "reuniao",
        "reunião",
        "apresenta",
        "call",
        "contato",
        "horario",
        "horário",
      ];
      const normalizedDemoText = normalizeLite(message.text);
      const hasDemoContext = demoContext.some((word) => normalizedDemoText.includes(word));
      hasDemoSignal = hasDemoContext;
      const isDemoContinuation = (updatedConversation.demoStatus ?? "none") === "requested";

      const demoResult =
        hasDemoContext || isDemoContinuation
          ? parseDemoIntent(message.text, !isDemoContinuation)
          : null;
      const canProcessDemo =
        hasDemoContext ||
        isDemoContinuation ||
        updatedConversation.intent === "pricing" ||
        Boolean(updatedConversation.leadRequestedAt) ||
        (updatedConversation.demoStatus ?? "none") !== "none";
      if (demoResult && canProcessDemo) {
        const nowIso = new Date(now).toISOString();
        const currentStatus = updatedConversation.demoStatus ?? "none";
        if (demoResult.type === "scheduled" && currentStatus !== "scheduled") {
          updatedConversation = {
            ...updatedConversation,
            demoStatus: "scheduled",
            lastDemoScheduledAt: nowIso,
            demoPreferredSchedule: demoResult.scheduleExtract,
          };
          demoUpdated = true;
          demoHandled = true;
          demoReplyText =
            "Perfeito! Vamos entrar em contato no dia/horário informado. Se preferir, diga outra opção.";
          await persistEventSafe(
            "lead.demo_scheduled",
            {
              intent: updatedConversation.intent ?? "unknown",
              scheduleExtract: demoResult.scheduleExtract,
            },
            updatedConversation.waId,
            message.messageId
          );
          logger.info({
            event: "lead.demo_scheduled",
            waId: maskNumber(normalizedFrom),
            intent: updatedConversation.intent ?? "unknown",
            scheduleExtract: demoResult.scheduleExtract,
            clientId: tenantClientId,
            clientKey: tenantClientKey,
            route: meta?.route,
            method: meta?.method,
            requestId: meta?.requestId,
          });
          const notifyKey = `${normalizedFrom}|${tenantHandoffAttendantWaid}|${message.messageId}|${tenantHandoffTemplateName}`;
          if (env.HANDOFF_ENABLED && tenantHandoffAttendantWaid) {
            if (updatedConversation.lastHandoffDemoScheduledKey === notifyKey) {
              logger.info({
                event: "handoff.notify_dedup",
                waId: maskNumber(normalizedFrom),
                notifyKey,
                decision: "skip",
                requestId: meta?.requestId,
              });
            } else {
              const scheduleText = demoResult.scheduleExtract ?? "A combinar";
              const snippet =
                message.text?.slice(0, 160).replace(/\s+/g, " ").trim() || "-";
              await notifyAttendantDemoScheduled({
                attendantWaId: tenantHandoffAttendantWaid,
                leadWaId: normalizedFrom,
                intent: updatedConversation.intent ?? "unknown",
                schedule: scheduleText,
                snippet,
                templateName: tenantHandoffTemplateName,
                requestId: meta?.requestId,
              });
              updatedConversation = {
                ...updatedConversation,
                lastHandoffDemoScheduledKey: notifyKey,
                lastHandoffDemoScheduledAt: nowIso,
              };
              demoUpdated = true;
            }
          }
          await storage.upsertConversation(updatedConversation);
          if (demoReplyText) {
            await sendOutboundText({
              toE164: message.from,
              waId: normalizedFrom,
              intent: updatedConversation.intent,
              messageId: message.messageId,
              replyText: demoReplyText,
              guard: inboundGuard,
            });
          }
          continue;
        }
        if (!demoHandled && demoResult.type === "requested" && currentStatus === "requested") {
          demoHandled = true;
          demoReplyText = "Qual melhor dia e horário para a demonstração?";
          flowReplyText = undefined;
        }
        if (!demoHandled && demoResult.type === "requested" && currentStatus !== "requested") {
          updatedConversation = {
            ...updatedConversation,
            demoStatus: "requested",
            lastDemoRequestedAt: nowIso,
          };
          demoUpdated = true;
          demoHandled = true;
          demoReplyText = "Qual melhor dia e horário para a demonstração?";
          flowReplyText = undefined;
          await persistEventSafe(
            "lead.demo_requested",
            {
              intent: updatedConversation.intent ?? "unknown",
              scheduleExtract: demoResult.scheduleExtract,
            },
            updatedConversation.waId,
            message.messageId
          );
          logger.info({
            event: "lead.demo_requested",
            waId: maskNumber(normalizedFrom),
            intent: updatedConversation.intent ?? "unknown",
            scheduleExtract: demoResult.scheduleExtract,
            clientId: tenantClientId,
            clientKey: tenantClientKey,
            route: meta?.route,
            method: meta?.method,
            requestId: meta?.requestId,
          });
        }
      }

      if (!demoHandled && (updatedConversation.demoStatus ?? "none") === "scheduled") {
        const normalizedText = normalizeLite(message.text);
        const scheduledAtMs = Date.parse(updatedConversation.lastDemoScheduledAt ?? "");
        const isRecentSchedule =
          !Number.isNaN(scheduledAtMs) && now - scheduledAtMs <= 30 * 60 * 1000;
        const isSimpleAffirmation =
          /^(sim|ok|beleza|certo|confirmo|confirmado|obrigado|obg|valeu)$/i.test(
            normalizedText
          );
        const isSimpleDecline = /^(nao|não)$/i.test(normalizedText);
        if (isRecentSchedule && (isSimpleAffirmation || isSimpleDecline)) {
          demoHandled = true;
          flowReplyText = undefined;
          demoReplyText = isSimpleDecline
            ? "Tudo bem. Se quiser reagendar, envie outro dia e horário."
            : "Seu agendamento já foi registrado. Nosso time confirma com você pelo WhatsApp.";
        }
      }
    }

    if (!demoHandled && message.text && updatedConversation.leadRequestedAt) {
      const requestedAtMs = Date.parse(updatedConversation.leadRequestedAt);
      if (!Number.isNaN(requestedAtMs) && now - requestedAtMs <= leadWindowMs) {
        const parsedLead = parseLeadFields(message.text);
        const hasAtLeastTwo =
          Number(Boolean(parsedLead.name)) +
            Number(Boolean(parsedLead.city)) +
            Number(Boolean(parsedLead.serviceType)) >=
          2;
        if (hasAtLeastTwo || message.text.length >= 10) {
          const nowIso = new Date(now).toISOString();
          updatedConversation = {
            ...updatedConversation,
            leadRequestedAt: undefined,
            leadCapturedAt: nowIso,
            flow: undefined,
            flowStep: undefined,
            answers: undefined,
          };
          leadUpdated = true;
          leadHandled = true;
          leadReplyText = parsedLead.name
            ? `Perfeito, ${parsedLead.name}. Já registrei seu pedido. Um atendente chama você em seguida.`
            : "Perfeito. Já registrei seu pedido. Um atendente chama você em seguida.";
          await persistEventSafe(
            "lead.captured",
            {
              name: parsedLead.name,
              city: parsedLead.city,
              serviceType: parsedLead.serviceType,
              rawText: parsedLead.rawText,
            },
            updatedConversation.waId,
            message.messageId
          );
        }
      }
    }

    if (!demoHandled && !leadReplyText && updatedConversation.intent === "pricing") {
      const windowOpen = isWindowOpen(updatedConversation, now);
      const hasRecentRequest =
        updatedConversation.leadRequestedAt &&
        now - Date.parse(updatedConversation.leadRequestedAt) <= leadWindowMs;
      if (windowOpen && !hasRecentRequest) {
        const nowIso = new Date(now).toISOString();
        updatedConversation = {
          ...updatedConversation,
          leadRequestedAt: nowIso,
        };
        leadUpdated = true;
        leadHandled = true;
        leadReplyText =
          "Para te ajudar melhor, me informe: Nome, Cidade e Serviço (Tráfego, Site, WhatsApp ou Social Media).";
        await persistEventSafe(
          "lead.capture.requested",
          { intent: "pricing" },
          updatedConversation.waId,
          message.messageId
        );
      }
    }

    if (leadUpdated || demoUpdated) {
      await storage.upsertConversation(updatedConversation);
    }

    const decision = decideOutboundPolicy({
      state: updatedConversation,
      now,
      isSandbox: env.WHATSAPP_SANDBOX,
      outOfWindowTemplate: env.WHATSAPP_OUT_OF_WINDOW_TEMPLATE,
      sandboxTemplate: "hello_world",
    });

    if (decision.action === "block") {
      const nowIso = new Date().toISOString();
      const resolvedTemplate = resolveTemplateForIntent(
        updatedConversation.intent,
        tenantClientKey
      );
      const blockedConversation = markTemplateNeeded(updatedConversation, {
        templateSuggested: resolvedTemplate.name,
        atIso: nowIso,
        intent: updatedConversation.intent,
        lastInboundMessageId: message.messageId,
      });
      await storage.upsertConversation(blockedConversation);
      for (const event of decision.events ?? []) {
        if (event.event === "outbound.blocked.window_closed") {
          logger.warn({
            event: "outbound.blocked.window_closed",
            messageId: message.messageId,
            waId: maskNumber(normalizedFrom),
            intent: updatedConversation.intent ?? "unknown",
            policy: decision.policy,
            clientId: tenantClientId,
            clientKey: tenantClientKey,
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
            clientId: tenantClientId,
            clientKey: tenantClientKey,
            route: meta?.route,
            method: meta?.method,
            requestId: meta?.requestId,
          });
        }
      }
      await persistOutboundBlockedSafe({
        waId: normalizedFrom,
        messageId: message.messageId,
        type: MessageType.TEMPLATE,
        templateName: resolvedTemplate.name,
        templateLang: resolvedTemplate.language ?? env.OUTBOUND_TEMPLATE_DEFAULT_LANG,
        reason: "window_closed",
        policy: decision.policy,
      });
      await attemptTemplateFallback({
        waId: normalizedFrom,
        toE164: message.from,
        intent: updatedConversation.intent,
        messageId: message.messageId,
      });
      continue;
    }

    const replyType = decision.replyType ?? "text";

    if (skipDemoReplies && !demoReplyText) {
      continue;
    }

    let replyText = demoReplyText ?? leadReplyText ?? flowReplyText ?? handoffResult.replyText ?? (env.WHATSAPP_ECHO_ENABLED
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

    const demoAwaitingSchedule = (updatedConversation.demoStatus ?? "none") === "requested";

    if (
      !leadHandled &&
      !flowResult.handled &&
      !handoffResult.handled &&
      !demoHandled &&
      !hasDemoSignal &&
      !leadHandled &&
      !demoAwaitingSchedule &&
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
            guard: inboundGuard,
          });

    void sendPromise
      .then(async (result) => {
        if (result.ok) {
          await storage.updateMessage(message.messageId, {
            status: "replied",
            repliedAt: new Date().toISOString(),
            replyType,
          });
          const outboundConversation = updateOutbound(
            updatedConversation,
            result.messageId,
            new Date().toISOString()
          );
          await storage.upsertConversation(outboundConversation);
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

function parseLeadFields(text: string) {
  const rawText = text.trim().slice(0, 500);
  const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const lower = rawText.toLowerCase();

  const nameMatch = rawText.match(/nome\\s*[:\\-]\\s*(.+)/i);
  const cityMatch = rawText.match(/cidade\\s*[:\\-]\\s*(.+)/i);
  const serviceMatch = rawText.match(/servi[cç]o\\s*[:\\-]\\s*(.+)/i);

  const name = nameMatch?.[1]?.trim() || (lines.length > 0 ? lines[0] : undefined);
  const city = cityMatch?.[1]?.trim();

  let serviceType = serviceMatch?.[1]?.trim();
  if (!serviceType) {
    if (/(tr[áa]fego)/i.test(lower)) serviceType = "Tráfego";
    else if (/(site|website)/i.test(lower)) serviceType = "Site";
    else if (/(whatsapp)/i.test(lower)) serviceType = "WhatsApp";
    else if (/(social media|m[ií]dias? sociais?)/i.test(lower)) serviceType = "Social Media";
  }

  return { name, city, serviceType, rawText };
}

function normalizeLite(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDemoIntent(
  text: string,
  requirePositive = true
): { type: "requested" | "scheduled"; scheduleExtract?: string } | null {
  const normalized = normalizeLite(text);
  const positives = [
    "sim",
    "quero",
    "pode",
    "ok",
    "beleza",
    "vamos",
    "aceito",
    "pode chamar",
    "pode falar",
    "gostaria",
    "agendar",
    "marcar",
  ];
  const hasDemoAction =
    normalized.includes("demo") ||
    normalized.includes("demonstra") ||
    normalized.includes("agendar") ||
    normalized.includes("marcar");
  if (
    requirePositive &&
    !hasDemoAction &&
    !positives.some((word) => normalized.includes(word))
  ) {
    return null;
  }

  const hourMatch = normalized.match(/\b([01]?\d|2[0-3])\s*(h|hs)\b/) ?? normalized.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/);
  const dayMatch = normalized.match(/\b(hoje|amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo)\b/);
  const dateMatch = normalized.match(/\b(\d{1,2}\/\d{1,2})\b/);

  const hasHour = Boolean(hourMatch);
  const hasDayOrDate = Boolean(dayMatch || dateMatch);

  if (hasHour && hasDayOrDate) {
    const extract = [dayMatch?.[0], dateMatch?.[0], hourMatch?.[0]].filter(Boolean).join(" ").trim();
    return { type: "scheduled", scheduleExtract: extract || undefined };
  }

  return { type: "requested" };
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
