import { IncomingMessage, ServerResponse } from "node:http";
import crypto from "node:crypto";
import { Prisma, MessageStatus, MessageType } from "@prisma/client";
import { env, normalizeWaId } from "../config/env.js";
import { normalizeWebhook } from "../domain/whatsapp/normalizeWebhook.js";
import { NormalizedMessage } from "../domain/whatsapp/types.js";
import { logger } from "../logger/logger.js";
import { runtimeStorage as storage } from "../storage/runtimeStorage.js";
import { makeConversationKey } from "../storage/conversationKey.js";
import { StoredRecord } from "../storage/storage.js";
import { WhatsAppWebhookPayload } from "./whatsapp.types.js";
import { runFlowExecutor, runMidDemoFlowExecutor, runPostDemoFlowExecutor } from "./flowExecutor.js";
import { acquireConversationMutex } from "./conversationMutex.js";
import { sendTemplateMessage, sendTextMessage } from "./whatsapp.client.js";
import { getPrisma } from "../db.js";
import {
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
  shouldStartQuoteSite,
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
import {
  getDefaultTenant,
  getTenantByClientKeyOrPhoneNumberId,
} from "../config/tenantConfig.js";
import {
  resolveFallbackTemplate,
  resolveTemplateForIntent,
  sendTemplate,
  shouldRetryWithFallback,
} from "../services/outboundTemplateService.js";
import { resolveTenantOutboundCredentials } from "./tenantCredentials.js";
import {
  ConversationIntent,
  ConversationState,
} from "../conversation/conversation.types.js";
import { resolveTenant, TenantResolutionError } from "../tenancy/tenantResolver.js";
import { ensureLeadForConversation, upsertLeadFromCapture } from "../crm/lead.service.js";
import {
  clearChatbotRuntime,
  executeChatbotFlow,
  extractChatbotFlowId,
  validateChatbotFlowDefinition,
} from "../chatbot/chatbotFlow.js";
import {
  getDefaultDepartment,
  persistConversationWindow,
  persistEvent,
  persistInboundMessage,
  persistOutboundMessage,
} from "../db/persist.js";
import { checkUsageGate } from "../usage/usageGate.js";
import { canonicalizeBrazilWaId } from "../utils/waid.js";
import { recordConversationInboundMetrics } from "../metrics/conversationMetrics.js";

const agentBrain = createAgentBrain();
const adminTemplateDedup = new Map<string, number>();
const ADMIN_TEMPLATE_TTL_MS = 10 * 60 * 1000;
const conversationVersionByWaId = new Map<string, { version: number; lastInboundAt?: string }>();
const DEFAULT_QUOTA_BLOCKED_TEXT =
  "No momento atingimos o limite de atendimentos automáticos do mês.\n" +
  "Para seguir com prioridade, fale com um atendente.";

type RequestMeta = {
  requestId: string;
  rawBodyLength: number;
  ip?: string;
  route: string;
  method: string;
};

type PartnerOnboardingPayload = {
  event: string | null;
  whatsappBusinessAccountId: string | null;
  businessPortfolioId: string | null;
  businessId: string | null;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  rawKeys: string[];
};

function parseWebhookTimestampToDate(rawTimestamp: string | null | undefined) {
  const parsed = Number(rawTimestamp);
  if (Number.isFinite(parsed) && parsed > 0) {
    return new Date(parsed * 1000);
  }
  return new Date();
}

function collectStringCandidates(
  input: unknown,
  matchers: RegExp[],
  acc = new Set<string>(),
  depth = 0
): string[] {
  if (depth > 4 || input == null) return Array.from(acc);
  if (Array.isArray(input)) {
    for (const item of input) {
      collectStringCandidates(item, matchers, acc, depth + 1);
    }
    return Array.from(acc);
  }
  if (typeof input !== "object") return Array.from(acc);

  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value === "string" && matchers.some((matcher) => matcher.test(key))) {
      const trimmed = value.trim();
      if (trimmed) acc.add(trimmed);
    }
    if (value && typeof value === "object") {
      collectStringCandidates(value, matchers, acc, depth + 1);
    }
  }
  return Array.from(acc);
}

function extractPartnerOnboardingPayload(value: unknown): PartnerOnboardingPayload {
  const typedValue = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rawKeys = Object.keys(typedValue).sort();

  const wabaCandidates = collectStringCandidates(value, [
    /^waba(_id)?$/i,
    /^whatsapp_?business_?account_?id$/i,
    /^whatsappBusinessAccountId$/i,
  ]);
  const businessPortfolioCandidates = collectStringCandidates(value, [
    /^business_?portfolio_?id$/i,
    /^businessPortfolioId$/i,
  ]);
  const businessIdCandidates = collectStringCandidates(value, [
    /^business_?id$/i,
    /^businessId$/i,
  ]);
  const phoneNumberCandidates = collectStringCandidates(value, [
    /^phone_?number_?id$/i,
    /^display_?phone_?number$/i,
    /^displayPhoneNumber$/i,
  ]);

  return {
    event:
      typeof typedValue.event === "string" && typedValue.event.trim()
        ? typedValue.event.trim()
        : null,
    whatsappBusinessAccountId: wabaCandidates[0] ?? null,
    businessPortfolioId: businessPortfolioCandidates[0] ?? null,
    businessId: businessIdCandidates[0] ?? null,
    phoneNumberId:
      (typeof typedValue.metadata === "object" &&
      typedValue.metadata &&
      typeof (typedValue.metadata as Record<string, unknown>).phone_number_id === "string"
        ? String((typedValue.metadata as Record<string, unknown>).phone_number_id)
        : null) ??
      phoneNumberCandidates.find((item) => /^\d+$/.test(item)) ??
      null,
    displayPhoneNumber:
      phoneNumberCandidates.find((item) => !/^\d+$/.test(item)) ?? null,
    rawKeys,
  };
}

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
  return logger.withContext(
    {
      correlationId: crypto.randomUUID(),
      clientKey: null,
      waId: null,
      conversationKey: null,
    },
    async () => {
      const prisma = getPrisma();
      logger.info({
        event: "webhook.received",
        route: meta?.route,
        method: meta?.method,
        requestId: meta?.requestId,
      });

      let appliedTenantConfig = await getDefaultTenant();
      let hasResolvedTenantConfig = false;
      let tenantAllowlist = (appliedTenantConfig?.allowlist ?? env.WHATSAPP_ALLOWLIST)
        .map((value: string) => normalizeWaId(value))
        .filter(Boolean);
      let tenantHandoffAttendantWaid =
        appliedTenantConfig?.handoffAttendantWaid || env.HANDOFF_ATTENDANT_WAID;
      let tenantHandoffTemplateName =
        appliedTenantConfig?.templates?.manualHandoff || env.HANDOFF_TEMPLATE_NAME;
      let tenantDefaultLanguage =
        appliedTenantConfig?.defaultLanguage ||
        env.OUTBOUND_TEMPLATE_DEFAULT_LANG ||
        "pt_BR";

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

  const resolveCurrentTenantCredentials = () => {
    if (!tenantClientId || !tenantClientKey) return Promise.resolve(null);
    if (!tenantCredentialsPromise) {
      tenantCredentialsPromise = resolveTenantOutboundCredentials({
        clientId: tenantClientId,
        clientKey: tenantClientKey,
      });
    }
    return tenantCredentialsPromise;
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
    if (tenantClientId && tenantClientKey) {
      const usageGate = await checkUsageGate({
        clientId: tenantClientId,
        clientKey: tenantClientKey,
        messageType: "text",
        requestId: meta?.requestId,
        waId: params.waId,
      });
      if (!usageGate.allowed) {
        logger.warn({
          event: "outbound.text.failed",
          waId: maskNumber(params.waId),
          to: maskNumber(params.toE164),
          intent: params.intent ?? "unknown",
          clientId: tenantClientId,
          clientKey: tenantClientKey,
          requestId: meta?.requestId,
          rid: params.messageId,
          messageId: params.messageId,
          reason: "usage_limit_reached",
          planName: usageGate.planName,
          messagesSent: usageGate.usage.messagesSent,
          messagesLimit: usageGate.usage.messagesLimit,
          period: usageGate.usage.period,
        });
        return {
          ok: false,
          status: 429,
          messageId: undefined,
          errorBody: "usage_limit_reached",
          blockedByUsage: true,
        };
      }
    }
    const credentials = await resolveCurrentTenantCredentials();
    const resolvedPhoneNumberId = credentials?.phoneNumberId || env.WHATSAPP_PHONE_NUMBER_ID;
    const credentialSource = credentials?.source ?? "env";
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
      resolvedPhoneNumberId,
      credentialSource,
    });
    const result = await sendTextMessage(params.toE164, params.replyText, credentials ?? undefined);
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
        resolvedPhoneNumberId,
        credentialSource,
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
        clientKey: tenantClientKey,
        status: "sent",
        allowlist: { enabled: false, hit: false },
        raw: {
          senderPhoneNumberId: resolvedPhoneNumberId,
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
        resolvedPhoneNumberId,
        credentialSource,
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
        clientKey: tenantClientKey,
        status: "failed",
        allowlist: { enabled: false, hit: false },
        raw: {
          senderPhoneNumberId: resolvedPhoneNumberId,
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
      params.attendantWaId,
      tenantClientKey
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
    const templateLang = env.HANDOFF_TEMPLATE_LANG || tenantDefaultLanguage || "";
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

  const notifyAttendantHumanRequested = async (params: {
    attendantWaId: string;
    leadWaId: string;
    snippet: string;
    requestId?: string;
  }) => {
    const attendantConversation = await storage.getConversation(
      params.attendantWaId,
      tenantClientKey
    );
    if (!attendantConversation || !isWindowOpen(attendantConversation, Date.now())) {
      logger.info({
        event: "handoff.notify.skipped",
        reason: "attendant_window_closed",
        waId: maskNumber(params.attendantWaId),
        leadWaId: maskNumber(params.leadWaId),
        requestId: params.requestId,
      });
      return;
    }
    const clientDisplay =
      tenantClientKey && tenantClientKey !== "default" ? tenantClientKey : "Re7Online";
    const textBody = [
      "[HANDOFF] Lead pediu atendimento humano",
      `Cliente: ${clientDisplay}`,
      `Lead: ${params.leadWaId}`,
      `Link: https://wa.me/${params.leadWaId}`,
      `Msg: ${params.snippet || "-"}`,
    ].join("\n");
    const result = await sendOutboundText({
      toE164: params.attendantWaId,
      waId: params.attendantWaId,
      intent: "handoff",
      messageId: `handoff.manual.${params.requestId ?? Date.now()}`,
      replyText: textBody,
    });
    logger.info({
      event: result.ok ? "handoff.notify.sent" : "handoff.notify.failed",
      notifyType: "text",
      waId: maskNumber(params.attendantWaId),
      leadWaId: maskNumber(params.leadWaId),
      status: result.status,
      requestId: params.requestId,
    });
  };

  const typedPayload = payload as WhatsAppWebhookPayload;
  const normalized = normalizeWebhook(typedPayload);
  const phoneNumberId =
    typedPayload.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
  const receivedChanges = (typedPayload.entry ?? []).flatMap((entry) => entry.changes ?? []);
  const partnerChangesToPersist: Array<{
    field: string;
    valueEvent: string | null;
    payload: PartnerOnboardingPayload;
  }> = [];

  for (const change of receivedChanges) {
    const typedChange = change as { field?: string; value?: unknown };
    const field = typeof typedChange.field === "string" ? typedChange.field : "unknown";
    const typedValue =
      typedChange.value && typeof typedChange.value === "object"
        ? (typedChange.value as Record<string, unknown>)
        : {};
    const valueEvent =
      typeof typedValue.event === "string" && typedValue.event.trim()
        ? typedValue.event.trim()
        : null;
    const changePhoneNumberId =
      typeof typedValue.metadata === "object" &&
      typedValue.metadata &&
      typeof (typedValue.metadata as Record<string, unknown>).phone_number_id === "string"
        ? String((typedValue.metadata as Record<string, unknown>).phone_number_id)
        : phoneNumberId ?? null;

    logger.info({
      event: "webhook.change.received",
      field,
      requestId: meta?.requestId,
      phoneNumberId: changePhoneNumberId,
      valueEvent,
    });

    if (field === "account_update" || field === "partner_solutions") {
      const partnerPayload = extractPartnerOnboardingPayload(typedChange.value);
      logger.info({
        event: "webhook.partner_event",
        field,
        valueEvent,
        requestId: meta?.requestId,
        phoneNumberId: partnerPayload.phoneNumberId ?? changePhoneNumberId,
        whatsappBusinessAccountId: partnerPayload.whatsappBusinessAccountId,
        businessPortfolioId: partnerPayload.businessPortfolioId,
        businessId: partnerPayload.businessId,
        displayPhoneNumber: partnerPayload.displayPhoneNumber,
        rawKeys: partnerPayload.rawKeys,
      });
      partnerChangesToPersist.push({
        field,
        valueEvent,
        payload: partnerPayload,
      });
    }
  }
  let tenantClientId = "";
  let tenantClientKey = env.CLIENT_ID;
  let tenantCredentialsPromise:
    | Promise<Awaited<ReturnType<typeof resolveTenantOutboundCredentials>>>
    | null = null;
  try {
    const tenant = await resolveTenant(phoneNumberId, meta);
    tenantClientId = tenant.clientId;
    tenantClientKey = tenant.clientKey;
    logger.updateContext({ clientKey: tenantClientKey });
    const resolvedTenantConfig = await getTenantByClientKeyOrPhoneNumberId(
      tenantClientKey,
      phoneNumberId
    );
    appliedTenantConfig = resolvedTenantConfig.tenant;
    hasResolvedTenantConfig = resolvedTenantConfig.hasTenantConfig;
    tenantAllowlist = (
      appliedTenantConfig?.allowlist ?? env.WHATSAPP_ALLOWLIST
    )
      .map((value: string) => normalizeWaId(value))
      .filter(Boolean);
    tenantHandoffAttendantWaid =
      appliedTenantConfig?.handoffAttendantWaid || env.HANDOFF_ATTENDANT_WAID;
    tenantHandoffTemplateName =
      appliedTenantConfig?.templates?.manualHandoff || env.HANDOFF_TEMPLATE_NAME;
    tenantDefaultLanguage =
      appliedTenantConfig?.defaultLanguage ||
      env.OUTBOUND_TEMPLATE_DEFAULT_LANG ||
      "pt_BR";
  } catch (error) {
    const reason =
      error instanceof TenantResolutionError
        ? error.code
        : "tenant_resolution_failed";
    logger.error({
      event: "tenant.resolve.error",
      requestId: meta?.requestId,
      route: meta?.route,
      method: meta?.method,
      phoneNumberId,
      reason,
      message: (error as Error).message,
    });
    logger.warn({
      event: "webhook.message.discarded",
      requestId: meta?.requestId,
      route: meta?.route,
      method: meta?.method,
      phoneNumberId,
      reason,
    });
    return;
  }
  const persistEventSafe = async (
    eventName: string,
    payloadJson: Prisma.InputJsonValue,
    waId?: string,
    messageId?: string
  ) => {
    try {
      const requestId = meta?.requestId ?? messageId ?? null;
      const logContext = logger.getContext();
      if (!tenantClientId) return;
      await persistEvent({
        clientId: tenantClientId,
        waId: waId ?? null,
        messageId: messageId ?? null,
        requestId,
        eventName,
        payloadJson: {
          ...(payloadJson && typeof payloadJson === "object" && !Array.isArray(payloadJson)
            ? (payloadJson as Record<string, unknown>)
            : { value: payloadJson }),
          correlationId: logContext.correlationId ?? null,
          clientKey: logContext.clientKey ?? tenantClientKey ?? null,
          waId: logContext.waId ?? waId ?? null,
        },
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
  const toStoredIncomingMessage = (
    message: NormalizedMessage,
    status: "received" | "ignored" | "replied" | "sent" | "failed",
    allowlistHit: boolean
  ): StoredRecord => ({
    ...message,
    clientKey: tenantClientKey,
    status,
    allowlist: {
      enabled: tenantAllowlist.length > 0,
      hit: allowlistHit,
    },
  });
  let resolvedDefaultDepartment:
    | {
        id: string;
        name: string;
      }
    | null
    | undefined;
  const loadDefaultDepartment = async () => {
    if (!tenantClientId) return null;
    if (resolvedDefaultDepartment !== undefined) return resolvedDefaultDepartment;
    resolvedDefaultDepartment = await getDefaultDepartment(tenantClientId);
    return resolvedDefaultDepartment;
  };
  let resolvedEntryPointChatbotFlow:
    | {
        id: string;
        definition: Prisma.JsonValue;
      }
    | null
    | undefined;
  const loadEntryPointChatbotFlow = async () => {
    if (!tenantClientId) return null;
    if (resolvedEntryPointChatbotFlow !== undefined) return resolvedEntryPointChatbotFlow;
    resolvedEntryPointChatbotFlow = await prisma.chatbotFlow.findFirst({
      where: {
        clientId: tenantClientId,
        isActive: true,
        entryPoint: true,
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        definition: true,
      },
    });
    return resolvedEntryPointChatbotFlow;
  };
  const loadChatbotFlowForConversation = async (
    state: ConversationState,
    inboundText: string | null | undefined,
  ) => {
    if (!tenantClientId) return null;
    if (!hasResolvedTenantConfig) return null;
    if (appliedTenantConfig?.disableChatbot || appliedTenantConfig?.appDisableChatbot) return null;
    if (
      state.flow === "quote_site" ||
      (!appliedTenantConfig?.disableLegacyFlows && shouldStartQuoteSite(inboundText))
    ) {
      return null;
    }
    const activeFlowId = extractChatbotFlowId(state.flow);
    if (state.chatbotActive && activeFlowId) {
      return prisma.chatbotFlow.findFirst({
        where: {
          id: activeFlowId,
          clientId: tenantClientId,
        },
        select: {
          id: true,
          definition: true,
        },
      });
    }
    return loadEntryPointChatbotFlow();
  };
  const ensurePendingHandoffRouting = async (state: ConversationState) => {
    if (!tenantClientId) return state;
    const department = state.departmentId ? { id: state.departmentId } : await loadDefaultDepartment();
    let queueId = state.queueId ?? null;
    if (department?.id && !queueId) {
      const queue = await prisma.queue.upsert({
        where: {
          clientId_departmentId_name: {
            clientId: tenantClientId,
            departmentId: department.id,
            name: "Fila Geral",
          },
        },
        update: {},
        create: {
          clientId: tenantClientId,
          departmentId: department.id,
          name: "Fila Geral",
        },
        select: { id: true },
      });
      queueId = queue.id;
    }
    return {
      ...state,
      departmentId: state.departmentId ?? department?.id ?? null,
      queueId,
      status: state.status ?? "WAITING",
      closedAt: null,
    };
  };
  const upsertConversationSafe = async (state: ConversationState) => {
    const currentState = await storage.getConversation(state.waId, tenantClientKey);
    const appliedDefaultDepartment =
      !state.departmentId && !currentState?.departmentId ? await loadDefaultDepartment() : null;
    const baseState = {
      ...state,
      departmentId:
        state.departmentId ?? currentState?.departmentId ?? appliedDefaultDepartment?.id ?? null,
      queueId: state.queueId ?? currentState?.queueId ?? null,
      status: state.status ?? currentState?.status ?? null,
      closedAt: state.closedAt ?? currentState?.closedAt ?? null,
    };
    const nextState =
      currentState?.mode === "HUMAN" && state.mode !== "HUMAN"
        ? {
            ...baseState,
            mode: "HUMAN" as const,
            assignedUserId: currentState.assignedUserId ?? null,
            assignedTo: currentState.assignedTo ?? null,
            assignedAt: currentState.assignedAt ?? null,
          }
        : baseState;
    await storage.upsertConversation(nextState);
    if (appliedDefaultDepartment) {
      logger.info({
        event: "conversation.department.assigned_default",
        clientId: tenantClientId,
        conversationId: state.waId,
        waId: state.waId,
        departmentId: appliedDefaultDepartment.id,
        requestId: meta?.requestId ?? null,
      });
    }
  };
  const persistOutboundConversation = async (
    state: ConversationState,
    messageId?: string
  ) => {
    const nextState = updateOutbound(
      state,
      messageId,
      new Date().toISOString()
    );
    await upsertConversationSafe(nextState);
    return nextState;
  };

  await persistEventSafe(
    "webhook.received",
    { route: meta?.route, method: meta?.method } as Prisma.InputJsonValue,
    undefined,
    undefined
  );

  for (const partnerEvent of partnerChangesToPersist) {
    await persistEventSafe(
      "webhook.partner_event",
      {
        field: partnerEvent.field,
        valueEvent: partnerEvent.valueEvent,
        ...partnerEvent.payload,
      } as Prisma.InputJsonValue,
      undefined,
      undefined
    );
  }

  const persistInboundSafe = async (params: {
    waId: string;
    messageId: string;
    type: MessageType;
    bodyText?: string | null;
    allowlistHit: boolean;
    occurredAt?: Date;
    rawPayload?: Prisma.InputJsonValue;
  }) => {
    try {
      if (!tenantClientId) return;
      const inserted = await persistInboundMessage({
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
      await recordConversationInboundMetrics({
        prisma: getPrisma(),
        clientId: tenantClientId,
        waId: params.waId,
        occurredAt: params.occurredAt ?? new Date(),
        wasInserted: inserted,
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

  const persistConversationSafe = async (state: {
    waId: string;
    windowIsOpen: boolean;
    windowExpiresAt?: string;
    lastInboundAt?: string | null;
    lastOutboundAt?: string | null;
    departmentId?: string | null;
  }) => {
    try {
      if (!tenantClientId) return;
      await persistConversationWindow({
        clientId: tenantClientId,
        waId: state.waId,
        phoneNumberId: phoneNumberId ?? undefined,
        departmentId: state.departmentId ?? null,
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

  const serializeWebhookStatuses = (input: unknown) => {
    if (!Array.isArray(input)) return [];
    return input.map((item) => {
      const status =
        item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return {
        id: typeof status.id === "string" ? status.id : null,
        status: typeof status.status === "string" ? status.status : null,
        timestamp:
          typeof status.timestamp === "string" || typeof status.timestamp === "number"
            ? String(status.timestamp)
            : null,
        conversation:
          status.conversation && typeof status.conversation === "object"
            ? (status.conversation as Record<string, unknown>)
            : null,
        pricing:
          status.pricing && typeof status.pricing === "object"
            ? (status.pricing as Record<string, unknown>)
            : null,
        errors: Array.isArray(status.errors) ? status.errors : null,
        status_detail:
          typeof status.status_detail === "string" ? status.status_detail : null,
        error_data:
          status.error_data && typeof status.error_data === "object"
            ? (status.error_data as Record<string, unknown>)
            : null,
      };
    });
  };

  const summarizeWebhookStatuses = (
    statuses: Array<{
      id: string | null;
      status: string | null;
      timestamp: string | null;
      conversation: Record<string, unknown> | null;
      pricing: Record<string, unknown> | null;
      errors: unknown[] | null;
      status_detail: string | null;
      error_data: Record<string, unknown> | null;
    }>
  ) => {
    const metaMessageIds = Array.from(
      new Set(statuses.map((item) => item.id).filter((value): value is string => Boolean(value)))
    );
    const pricingCategories = Array.from(
      new Set(
        statuses
          .map((item) =>
            typeof item.pricing?.category === "string" ? item.pricing.category : null
          )
          .filter((value): value is string => Boolean(value))
      )
    );
    const pricingModels = Array.from(
      new Set(
        statuses
          .map((item) =>
            typeof item.pricing?.pricing_model === "string" ? item.pricing.pricing_model : null
          )
          .filter((value): value is string => Boolean(value))
      )
    );
    const conversationIds = Array.from(
      new Set(
        statuses
          .map((item) =>
            typeof item.conversation?.id === "string" ? item.conversation.id : null
          )
          .filter((value): value is string => Boolean(value))
      )
    );
    const conversationOriginTypes = Array.from(
      new Set(
        statuses
          .map((item) => {
            const origin = item.conversation?.origin;
            if (!origin || typeof origin !== "object") return null;
            return typeof (origin as Record<string, unknown>).type === "string"
              ? String((origin as Record<string, unknown>).type)
              : null;
          })
          .filter((value): value is string => Boolean(value))
      )
    );
    const billableValues = Array.from(
      new Set(
        statuses
          .map((item) =>
            typeof item.pricing?.billable === "boolean" ? item.pricing.billable : null
          )
          .filter((value): value is boolean => value !== null)
      )
    );

    return {
      metaMessageIds,
      pricingCategories,
      pricingBillable:
        billableValues.length === 1 ? billableValues[0] : billableValues.length === 0 ? null : billableValues,
      pricingModels,
      conversationIds,
      conversationOriginTypes,
    };
  };

  const correlateOutboundMetaStatuses = async (
    statuses: Array<{
      id: string | null;
      status: string | null;
      timestamp: string | null;
      conversation: Record<string, unknown> | null;
      pricing: Record<string, unknown> | null;
      errors: unknown[] | null;
      status_detail: string | null;
      error_data: Record<string, unknown> | null;
    }>
  ) => {
    if (!tenantClientId || statuses.length === 0) return;
    const prisma = getPrisma();
    const getMetaStatusPriority = (status: string | null) => {
      switch ((status || "").trim().toLowerCase()) {
        case "read":
          return 3;
        case "delivered":
          return 2;
        case "sent":
          return 1;
        case "failed":
          return 0;
        default:
          return -1;
      }
    };

    for (const item of statuses) {
      if (!item.id) continue;
      try {
        const outbound = await prisma.outboundMessage.findFirst({
          where: {
            clientId: tenantClientId,
            metaMessageId: item.id,
          },
          select: {
            id: true,
            rawPayload: true,
          },
        });
        if (!outbound) continue;

        const currentRaw =
          outbound.rawPayload && typeof outbound.rawPayload === "object" && !Array.isArray(outbound.rawPayload)
            ? (outbound.rawPayload as Record<string, unknown>)
            : outbound.rawPayload !== null && outbound.rawPayload !== undefined
              ? { value: outbound.rawPayload }
              : {};
        const currentMetaStatus =
          currentRaw.metaStatus &&
          typeof currentRaw.metaStatus === "object" &&
          !Array.isArray(currentRaw.metaStatus)
            ? (currentRaw.metaStatus as Record<string, unknown>)
            : null;
        const currentStatus =
          typeof currentMetaStatus?.lastStatus === "string" ? currentMetaStatus.lastStatus : null;
        const currentPriority = getMetaStatusPriority(currentStatus);
        const nextPriority = getMetaStatusPriority(item.status);
        if (currentPriority > nextPriority) {
          continue;
        }

        const origin = item.conversation?.origin;
        const conversationOriginType =
          origin && typeof origin === "object" && typeof (origin as Record<string, unknown>).type === "string"
            ? String((origin as Record<string, unknown>).type)
            : null;
        const pricingCategory =
          typeof item.pricing?.category === "string" ? item.pricing.category : null;
        const pricingBillable =
          typeof item.pricing?.billable === "boolean" ? item.pricing.billable : null;
        const pricingModel =
          typeof item.pricing?.pricing_model === "string" ? item.pricing.pricing_model : null;

        await prisma.outboundMessage.update({
          where: { id: outbound.id },
          data: {
            rawPayload: {
              ...currentRaw,
              metaStatus: {
                lastStatus: item.status,
                conversationId:
                  typeof item.conversation?.id === "string" ? item.conversation.id : null,
                conversationOriginType,
                pricingCategory,
                pricingBillable,
                pricingModel,
                lastStatusAt: item.timestamp,
                statusDetail: item.status_detail,
                errorData: item.error_data,
                errors: item.errors,
                metaMessageId: item.id,
              },
            } as Prisma.InputJsonValue,
          },
        });
      } catch (error) {
        logger.error({
          event: "db.persist.error",
          target: "outbound_meta_status",
          message: (error as Error).message,
          requestId: meta?.requestId,
          metaMessageId: item.id,
        });
      }
    }
  };

      const statuses = typedPayload.entry?.[0]?.changes?.[0]?.value?.statuses;
      const hasStatuses = Array.isArray(statuses) && statuses.length > 0;
      if (hasStatuses) {
        const serializedStatuses = serializeWebhookStatuses(statuses);
        const statusSummary = summarizeWebhookStatuses(serializedStatuses);
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
          {
            phone_number_id: phoneNumberId,
            count: statuses.length,
            statuses: serializedStatuses,
            ...statusSummary,
          } as Prisma.InputJsonValue,
          undefined,
          undefined
        );
        await correlateOutboundMetaStatuses(serializedStatuses);
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
        const normalizedFrom = normalizeWaId(message.from);
        const canonicalWaId = canonicalizeBrazilWaId(normalizedFrom);
        if (canonicalWaId !== normalizedFrom) {
          logger.info({
            event: "waid.canonical.generated",
            clientKey: tenantClientKey,
            waId: normalizedFrom,
            waIdCanonical: canonicalWaId,
            requestId: meta?.requestId,
          });
        }
        logger.updateContext({
          correlationId: crypto.randomUUID(),
          clientKey: tenantClientKey,
          waId: normalizedFrom,
          conversationKey: makeConversationKey(tenantClientKey, normalizedFrom),
        });
        const releaseConversationMutex = await acquireConversationMutex(
          tenantClientKey,
          normalizedFrom
        );
        try {
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

    logger.info({
      event: "tenant.resolved",
      tenantId: appliedTenantConfig?.id ?? "default",
      clientKey: tenantClientKey,
      hasTenantConfig: hasResolvedTenantConfig,
      waId: maskNumber(normalizedFrom),
      requestId: meta?.requestId,
    });
    const allowlistEnabled = tenantAllowlist.length > 0;
    const allowlistHit = allowlistEnabled
      ? tenantAllowlist.includes(normalizedFrom)
      : true;
    const status = allowlistHit ? "received" : "ignored";
    const quotaExcludeWaIds = new Set(
      (appliedTenantConfig?.quotaExcludeWaIds ?? [])
        .map((waId) => waId.replace(/\D/g, ""))
        .filter(Boolean)
    );
    const isQuotaExcludedWaId = quotaExcludeWaIds.has(normalizedFrom);

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

    if (
      allowlistHit &&
      !isQuotaExcludedWaId &&
      tenantClientId &&
      typeof appliedTenantConfig?.quotaMonthlyConversations === "number" &&
      appliedTenantConfig.quotaMonthlyConversations >= 0
    ) {
      const { period, from, to } = getMonthRangeUtc(new Date());
      let quotaBlocked = false;
      let quotaUsed = 0;

      try {
        const distinctInboundWaIds = await prisma.inboundMessage.groupBy({
          by: ["waId"],
          where: {
            clientId: tenantClientId,
            allowlistHit: true,
            createdAt: { gte: from, lt: to },
          },
          _count: { waId: true },
        });
        quotaUsed = distinctInboundWaIds
          .map((row) => normalizeWaId(row.waId))
          .filter((waId) => !quotaExcludeWaIds.has(waId)).length;
        const existingThisMonth = await prisma.inboundMessage.findFirst({
          where: {
            clientId: tenantClientId,
            waId: normalizedFrom,
            allowlistHit: true,
            createdAt: { gte: from, lt: to },
          },
          select: { id: true },
        });
        const isNewThisMonth = !existingThisMonth;

        if (quotaUsed >= appliedTenantConfig.quotaMonthlyConversations && isNewThisMonth) {
          quotaBlocked = true;
          logger.info({
            event: "quota.blocked",
            tenantId: appliedTenantConfig.id,
            clientKey: tenantClientKey,
            limit: appliedTenantConfig.quotaMonthlyConversations,
            used: quotaUsed,
            period,
            waId: maskNumber(normalizedFrom),
            requestId: meta?.requestId,
          });
        } else {
          logger.info({
            event: "quota.checked",
            tenantId: appliedTenantConfig.id,
            clientKey: tenantClientKey,
            limit: appliedTenantConfig.quotaMonthlyConversations,
            used: quotaUsed,
            period,
            isNewThisMonth,
            waId: maskNumber(normalizedFrom),
            requestId: meta?.requestId,
          });
        }
      } catch (error) {
        logger.error({
          event: "quota.calc_error",
          tenantId: appliedTenantConfig.id,
          clientKey: tenantClientKey,
          period,
          message: (error as Error).message,
          requestId: meta?.requestId,
        });
      }

      if (quotaBlocked) {
        await persistInboundSafe({
          waId: message.from,
          messageId: message.messageId,
          type: mapMessageType(message.type),
          bodyText: message.text,
          allowlistHit,
          occurredAt: parseWebhookTimestampToDate(message.timestamp),
          rawPayload: {
            ...message.raw,
            text: message.text,
            timestamp: message.timestamp,
          },
        });

        await storage.saveIncomingMessage(
          toStoredIncomingMessage(message, status, allowlistHit)
        );

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

        const quotaReplyTo = env.WHATSAPP_SANDBOX
          ? env.WHATSAPP_SANDBOX_TO || normalizedFrom
          : message.from;
        const quotaLimit = appliedTenantConfig.quotaMonthlyConversations;
        const rawQuotaTemplate =
          typeof appliedTenantConfig.quotaBlockedReplyText === "string" &&
          appliedTenantConfig.quotaBlockedReplyText.trim()
            ? appliedTenantConfig.quotaBlockedReplyText.trim()
            : DEFAULT_QUOTA_BLOCKED_TEXT;
        const replyText = renderQuotaBlockedText(rawQuotaTemplate, {
          tenantName: appliedTenantConfig.name || tenantClientKey || "nosso time",
          period,
          used: quotaUsed,
          limit: quotaLimit,
          attendantWaidMasked: appliedTenantConfig.handoffAttendantWaid
            ? maskNumber(appliedTenantConfig.handoffAttendantWaid)
            : "",
        });
        await sendOutboundText({
          toE164: quotaReplyTo,
          waId: normalizedFrom,
          intent: undefined,
          messageId: message.messageId,
          replyText,
          guard: undefined,
        });
        continue;
      }
    }

    if (
      allowlistHit &&
      isQuotaExcludedWaId &&
      typeof appliedTenantConfig?.quotaMonthlyConversations === "number" &&
      appliedTenantConfig.quotaMonthlyConversations >= 0
    ) {
      logger.info({
        event: "quota.excluded",
        tenantId: appliedTenantConfig.id,
        clientKey: tenantClientKey,
        waId: maskNumber(normalizedFrom),
        requestId: meta?.requestId,
      });
    }

    const currentConversation = await getOrCreateConversation(
      storage,
      tenantClientKey,
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
        tenantClientKey,
        targetWaId,
        message.timestamp
      );
      const pastIso = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const closedWindowState = {
        ...targetConversation,
        lastInboundAt: pastIso,
        window: { isOpen: false, expiresAt: pastIso },
      };
      await upsertConversationSafe(closedWindowState);
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
      await upsertConversationSafe(updatedMeta);
      await storage.saveIncomingMessage(
        toStoredIncomingMessage(message, status, allowlistHit)
      );
      if (env.outboundEnabled && !env.WHATSAPP_SANDBOX) {
        const credentials = await resolveCurrentTenantCredentials();
        await sendTextMessage(
          normalizedFrom,
          `Janela 24h fechada para ${targetWaId}.`,
          credentials ?? undefined
        );
      }
      continue;
    }

    if (tenantClientId) {
      await ensureLeadForConversation({
        tenantId: tenantClientId,
        waId: normalizedFrom,
      });
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
        await upsertConversationSafe(updatedMeta);
        await storage.saveIncomingMessage(
          toStoredIncomingMessage(message, status, allowlistHit)
        );
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
        await upsertConversationSafe(updatedMeta);
        await storage.saveIncomingMessage(
          toStoredIncomingMessage(message, status, allowlistHit)
        );
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
        await upsertConversationSafe(updatedMeta);
        await storage.saveIncomingMessage(
          toStoredIncomingMessage(message, status, allowlistHit)
        );
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
        templateConfig.language,
        (await resolveCurrentTenantCredentials()) ?? undefined
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
          tenantClientKey,
          targetWaId,
          message.timestamp
        );
        const clearedTarget = clearTemplateNeeded(
          await persistOutboundConversation(
            targetConversation,
            result.messageId
          )
        );
        await upsertConversationSafe(clearedTarget);
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
      await upsertConversationSafe(updatedMeta);
      await storage.saveIncomingMessage(
        toStoredIncomingMessage(message, status, allowlistHit)
      );
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
      await upsertConversationSafe(updatedByAdmin);
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
      await storage.saveIncomingMessage(
        toStoredIncomingMessage(message, status, allowlistHit)
      );
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
      await upsertConversationSafe(blockedState);
      await persistConversationSafe({
        waId: blockedState.waId,
        windowIsOpen: blockedState.window.isOpen,
        windowExpiresAt: blockedState.window.expiresAt,
        lastInboundAt: blockedState.lastInboundAt ?? null,
        lastOutboundAt: blockedState.lastOutboundAt ?? null,
        departmentId: blockedState.departmentId ?? null,
      });
      await storage.saveIncomingMessage(
        toStoredIncomingMessage(message, status, allowlistHit)
      );
      await persistInboundSafe({
        waId: message.from,
        messageId: message.messageId,
        type: mapMessageType(message.type),
        bodyText: message.text,
        allowlistHit,
        occurredAt: parseWebhookTimestampToDate(message.timestamp),
        rawPayload: {
          ...message.raw,
          text: message.text,
          timestamp: message.timestamp,
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

      await upsertConversationSafe(updatedConversation);
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

      await storage.saveIncomingMessage(
        toStoredIncomingMessage(message, status, allowlistHit)
      );

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
        await upsertConversationSafe(blockedConversation);
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
              decision.templateLanguage ?? "pt_BR",
              (await resolveCurrentTenantCredentials()) ?? undefined
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
            await persistOutboundConversation(
              updatedConversation,
              result.messageId
            );
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
      updatedConversation = clearChatbotRuntime(handoffResult.state);
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
      await upsertConversationSafe(updatedConversation);
      await persistConversationSafe({
        waId: updatedConversation.waId,
        windowIsOpen: updatedConversation.window.isOpen,
        windowExpiresAt: updatedConversation.window.expiresAt,
        lastInboundAt: updatedConversation.lastInboundAt ?? null,
        lastOutboundAt: updatedConversation.lastOutboundAt ?? null,
        departmentId: updatedConversation.departmentId ?? null,
      });
      await storage.saveIncomingMessage(
        toStoredIncomingMessage(message, status, allowlistHit)
      );
      await persistInboundSafe({
        waId: message.from,
        messageId: message.messageId,
        type: mapMessageType(message.type),
        bodyText: message.text,
        allowlistHit,
        occurredAt: parseWebhookTimestampToDate(message.timestamp),
        rawPayload: {
          ...message.raw,
          text: message.text,
          timestamp: message.timestamp,
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

    if ((appliedTenantConfig?.disableChatbot || appliedTenantConfig?.appDisableChatbot) && (updatedConversation.chatbotActive || updatedConversation.chatbotNodeId)) {
      updatedConversation = clearChatbotRuntime(updatedConversation);
      logger.info({
        event: "chatbot.runtime.cleared",
        reason: "tenant_disabled",
        clientId: tenantClientId,
        clientKey: tenantClientKey,
        requestId: meta?.requestId,
      });
    }

    if (updatedConversation.flow === "quote_site" && (updatedConversation.chatbotActive || updatedConversation.chatbotNodeId)) {
      updatedConversation = clearChatbotRuntime(updatedConversation);
      logger.info({
        event: "chatbot.runtime.cleared",
        reason: "quote_site_priority",
        clientId: tenantClientId,
        clientKey: tenantClientKey,
        requestId: meta?.requestId,
      });
    }

    let chatbotFlowResult: {
      handled: boolean;
      state: ConversationState;
      replyText?: string;
      flowId: string | null;
    } = {
      handled: false,
      state: updatedConversation,
      replyText: undefined as string | undefined,
      flowId: null as string | null,
    };

    if (!handoffResult.handled) {
      const previousHandoffStatus = updatedConversation.handoff.status;
      const chatbotFlow = await loadChatbotFlowForConversation(updatedConversation, message.text);
      if (chatbotFlow) {
        const validatedDefinition = validateChatbotFlowDefinition(chatbotFlow.definition);
        if (!validatedDefinition.ok) {
          updatedConversation = clearChatbotRuntime(updatedConversation);
          logger.error({
            event: "chatbot.definition.invalid",
            clientId: tenantClientId,
            clientKey: tenantClientKey,
            flowId: chatbotFlow.id,
            message: validatedDefinition.message,
            requestId: meta?.requestId,
          });
        } else {
          const chatbotResult = executeChatbotFlow({
            flowId: chatbotFlow.id,
            definition: validatedDefinition.definition,
            state: updatedConversation,
            inboundText: message.text,
            nowIso: message.timestamp,
          });
          updatedConversation = chatbotResult.state;
          chatbotFlowResult = {
            handled: chatbotResult.handled,
            state: chatbotResult.state,
            replyText: chatbotResult.replyText,
            flowId: chatbotFlow.id,
          };
          if (
            previousHandoffStatus !== chatbotResult.state.handoff.status &&
            (chatbotResult.state.handoff.status === "pending" ||
              chatbotResult.state.handoff.status === "active")
          ) {
            updatedConversation = await ensurePendingHandoffRouting(chatbotResult.state);
            chatbotFlowResult.state = updatedConversation;
            if (tenantHandoffAttendantWaid) {
              await notifyAttendantHumanRequested({
                attendantWaId: tenantHandoffAttendantWaid,
                leadWaId: normalizedFrom,
                snippet: message.text?.slice(0, 160).replace(/\s+/g, " ").trim() || "-",
                requestId: meta?.requestId,
              });
            }
          }
          logger.info({
            event: "chatbot.executor.checked",
            clientId: tenantClientId,
            clientKey: tenantClientKey,
            flowId: chatbotFlow.id,
            handled: chatbotResult.handled,
            active: updatedConversation.chatbotActive ?? false,
            nodeId: updatedConversation.chatbotNodeId ?? null,
            requestId: meta?.requestId,
          });
        }
      }
    }

    const flowResult = chatbotFlowResult.handled
      ? {
          state: updatedConversation,
          handled: true as const,
          replyText: chatbotFlowResult.replyText,
          flowKey: "chatbot" as const,
        }
      : handoffResult.handled
        ? { state: updatedConversation, handled: false as const, replyText: undefined }
        : appliedTenantConfig?.disableLegacyFlows || !hasResolvedTenantConfig
          ? { state: updatedConversation, handled: false as const, replyText: undefined }
        : await runFlowExecutor({
            tenantId: appliedTenantConfig?.id ?? "default",
            clientKey: tenantClientKey,
            requestId: meta?.requestId,
            meta: {
              route: meta?.route,
              method: meta?.method,
            },
            message,
            conversation: updatedConversation,
          });
    logger.info({
      event: "flow.executor.checked",
      tenantId: appliedTenantConfig?.id ?? "default",
      clientKey: tenantClientKey,
      flowKey: flowResult.flowKey ?? null,
      handled: flowResult.handled,
      requestId: meta?.requestId,
    });
    if (flowResult.handled && flowResult.flowKey === "quote_site") {
      logger.info({
        event: "flow.quote_site.handled",
        tenantId: appliedTenantConfig?.id ?? "default",
        clientKey: tenantClientKey,
        requestId: meta?.requestId,
      });
    }
    if (flowResult.handled && flowResult.flowKey === "chatbot") {
      logger.info({
        event: "chatbot.flow.handled",
        tenantId: appliedTenantConfig?.id ?? "default",
        clientId: tenantClientId,
        clientKey: tenantClientKey,
        flowId: chatbotFlowResult.flowId,
        chatbotNodeId: updatedConversation.chatbotNodeId ?? null,
        chatbotActive: updatedConversation.chatbotActive ?? false,
        requestId: meta?.requestId,
      });
    }
    if (flowResult.handled) {
      updatedConversation = flowResult.state ?? updatedConversation;
    }
    await upsertConversationSafe(updatedConversation);
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

    await storage.saveIncomingMessage(
      toStoredIncomingMessage(message, status, allowlistHit)
    );

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
      occurredAt: parseWebhookTimestampToDate(message.timestamp),
      rawPayload: {
        ...message.raw,
        text: message.text,
        timestamp: message.timestamp,
      },
    });

    if (!allowlistHit) {
      continue;
    }

    if (appliedTenantConfig?.disableAutoReply) {
      logger.info({
        event: "reply.skipped",
        waId: maskNumber(normalizedFrom),
        reason: "tenant_auto_reply_disabled",
        route: meta?.route,
        method: meta?.method,
        requestId: meta?.requestId,
      });
      continue;
    }

    if (!hasResolvedTenantConfig) {
      logger.info({
        event: "reply.skipped",
        waId: maskNumber(normalizedFrom),
        reason: "tenant_config_missing",
        route: meta?.route,
        method: meta?.method,
        requestId: meta?.requestId,
      });
      continue;
    }

    if (!shouldAutoReply(updatedConversation)) {
      const skipReason =
        updatedConversation.mode === "HUMAN" ? "human_mode" : "handoff_active";
      logger.info({
        event: "reply.skipped",
        waId: maskNumber(normalizedFrom),
        reason: skipReason,
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

    if (message.text && !appliedTenantConfig?.disableLegacyFlows && hasResolvedTenantConfig) {
      const midDemoFlowResult = await runMidDemoFlowExecutor({
        tenantId: appliedTenantConfig?.id ?? "default",
        clientKey: tenantClientKey,
        requestId: meta?.requestId,
        meta: {
          route: meta?.route,
          method: meta?.method,
        },
        message,
        conversation: updatedConversation,
        nowMs: now,
        demoHandled,
      });
      hasDemoSignal = midDemoFlowResult.hasDemoSignal ?? false;

      if (midDemoFlowResult.handled) {
        updatedConversation = midDemoFlowResult.state ?? updatedConversation;
        demoHandled = true;
        demoReplyText = midDemoFlowResult.replyText;
        if (midDemoFlowResult.demoAction === "requested") {
          flowReplyText = undefined;
          if (midDemoFlowResult.demoStateUpdated) {
            demoUpdated = true;
            await persistEventSafe(
              "lead.demo_requested",
              {
                intent: updatedConversation.intent ?? "unknown",
                scheduleExtract: midDemoFlowResult.scheduleExtract,
              },
              updatedConversation.waId,
              message.messageId
            );
            logger.info({
              event: "lead.demo_requested",
              waId: maskNumber(normalizedFrom),
              intent: updatedConversation.intent ?? "unknown",
              scheduleExtract: midDemoFlowResult.scheduleExtract,
              clientId: tenantClientId,
              clientKey: tenantClientKey,
              route: meta?.route,
              method: meta?.method,
              requestId: meta?.requestId,
            });
          }
        }
        if (midDemoFlowResult.demoAction === "scheduled") {
          const nowIso = new Date(now).toISOString();
          demoUpdated = true;
          await persistEventSafe(
            "lead.demo_scheduled",
            {
              intent: updatedConversation.intent ?? "unknown",
              scheduleExtract: midDemoFlowResult.scheduleExtract,
            },
            updatedConversation.waId,
            message.messageId
          );
          logger.info({
            event: "lead.demo_scheduled",
            waId: maskNumber(normalizedFrom),
            intent: updatedConversation.intent ?? "unknown",
            scheduleExtract: midDemoFlowResult.scheduleExtract,
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
              const scheduleText = midDemoFlowResult.scheduleExtract ?? "A combinar";
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
          await upsertConversationSafe(updatedConversation);
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
        if (midDemoFlowResult.demoAction === "quick_reply") {
          flowReplyText = undefined;
        }
        if (midDemoFlowResult.demoAction === "scheduled_skip") {
          skipDemoReplies = true;
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
          await upsertConversationSafe(updatedConversation);
          continue;
        }
      }
    }

    const parsedLeadForCapture =
      !demoHandled && message.text && updatedConversation.leadRequestedAt
        ? parseLeadFields(message.text)
        : {};
    const postDemoFlowResult = appliedTenantConfig?.disableLegacyFlows || !hasResolvedTenantConfig
      ? { handled: false as const }
      : await runPostDemoFlowExecutor({
          tenantId: appliedTenantConfig?.id ?? "default",
          clientKey: tenantClientKey,
          requestId: meta?.requestId,
          meta: {
            route: meta?.route,
            method: meta?.method,
          },
          message,
          conversation: updatedConversation,
          nowMs: now,
          leadWindowMs,
          demoHandled,
          leadReplyText,
          parsedLead: parsedLeadForCapture,
        });
    if (postDemoFlowResult.handled) {
      updatedConversation = postDemoFlowResult.state ?? updatedConversation;
      leadUpdated = true;
      leadHandled = true;
      leadReplyText = postDemoFlowResult.replyText;

      if (postDemoFlowResult.leadAction === "captured") {
        const parsedLead = postDemoFlowResult.parsedLead;
        if (tenantClientId) {
          await upsertLeadFromCapture({
            tenantId: tenantClientId,
            waId: updatedConversation.waId,
            name: parsedLead?.name,
            city: parsedLead?.city,
            service: parsedLead?.serviceType,
          });
        }
        await persistEventSafe(
          "lead.captured",
          {
            name: parsedLead?.name,
            city: parsedLead?.city,
            serviceType: parsedLead?.serviceType,
            rawText: parsedLead?.rawText,
          },
          updatedConversation.waId,
          message.messageId
        );
      }
      if (postDemoFlowResult.leadAction === "requested") {
        await persistEventSafe(
          "lead.capture.requested",
          { intent: "pricing" },
          updatedConversation.waId,
          message.messageId
        );
      }
    }

    if (leadUpdated || demoUpdated) {
      await upsertConversationSafe(updatedConversation);
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
      await upsertConversationSafe(blockedConversation);
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

    const allAutomationLayersDisabled =
      (appliedTenantConfig?.disableChatbot === true || appliedTenantConfig?.appDisableChatbot === true) &&
      appliedTenantConfig?.disableLegacyFlows === true &&
      (appliedTenantConfig?.disableAiFallback === true || appliedTenantConfig?.appDisableAiFallback === true);

    if (
      allAutomationLayersDisabled &&
      !demoReplyText &&
      !leadReplyText &&
      !flowReplyText &&
      !handoffResult.replyText
    ) {
      logger.info({
        event: "reply.skipped",
        waId: maskNumber(normalizedFrom),
        reason: "automation_layers_disabled",
        route: meta?.route,
        method: meta?.method,
        requestId: meta?.requestId,
      });
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
    const aiBusinessContext = appliedTenantConfig?.aiBusinessContext?.trim() ?? "";

    if (
      !leadHandled &&
      !flowResult.handled &&
      !handoffResult.handled &&
      !demoHandled &&
      !hasDemoSignal &&
      !leadHandled &&
      !demoAwaitingSchedule &&
      env.WHATSAPP_AI_ENABLED &&
      !appliedTenantConfig?.disableAiFallback &&
      !appliedTenantConfig?.appDisableAiFallback &&
      aiBusinessContext.length > 0 &&
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
          businessContext: aiBusinessContext,
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
            decision.templateLanguage ?? "pt_BR",
            (await resolveCurrentTenantCredentials()) ?? undefined
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
          await persistOutboundConversation(
            updatedConversation,
            result.messageId
          );
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
        } finally {
          releaseConversationMutex();
        }
      }
    }
  );
}

function maskNumber(number: string) {
  const tail = number.slice(-6);
  return `***${tail}`;
}

function renderQuotaBlockedText(
  template: string,
  vars: Record<string, string | number | null | undefined>
) {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = vars[key];
    return value === null || value === undefined ? "" : String(value);
  });
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

function getMonthRangeUtc(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const from = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const to = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0));
  const period = `${year}-${String(month + 1).padStart(2, "0")}`;
  return { period, from, to };
}
