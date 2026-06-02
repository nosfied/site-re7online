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
  activateHumanHandoff,
  clearTemplateNeeded,
  decideOutboundPolicy,
  detectIntent,
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
  buildHandoffConfirmationPrompt,
  buildAssistantLimitReachedReply,
  buildAiHandoffCrmArtifacts,
  buildContextualContinuationReply,
  buildContextualFallbackReply,
  buildSafeResponse,
  buildAssistantFallbackGuidance,
  buildTenantIntentCatalogReply,
  buildTenantIntentDetailCaptureReply,
  buildTenantIntentOrchestratorOutput,
  calculateHandoffScore,
  classifyAssistantFallback,
  classifyContextualFallback,
  classifyEducationalIntent,
  classifyPendingOfferResponse,
  canEvaluateHandoffRecommendation,
  classifyRisk,
  enrichCrmFromOrchestrator,
  generateControlledAssistantReply,
  getAiAssistantState,
  isContextualAck,
  resolveTenantIntent,
  resolveOrchestratorAction,
  resolveContextualContinuationTopic,
  shouldSendHandoffConfirmationPrompt,
  updateAiMemory,
} from "../agent/controlledAssistant.js";
import {
  buildQualificationCrmArtifacts,
  handleQualificationTurn,
  type AiQualificationSchema,
} from "../agent/qualification.js";
import {
  parseTemplateCommand,
  resolveTemplateKey,
} from "./templateCommand.js";
import {
  getDefaultTenant,
  getTenantByClientKeyOrPhoneNumberId,
  isAiAssistantConfigured,
  normalizeHandoffLeadNotificationRecipients,
  normalizeTenantMediaHandoffPolicy,
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
import { runWhatsAppDualReadShadow } from "../channels/whatsappDualReadShadow.js";
import {
  clearChatbotRuntime,
  executeChatbotFlow,
  extractChatbotFlowId,
  getInitialChatbotAwaitingNodeId,
  validateChatbotFlowDefinition,
} from "../chatbot/chatbotFlow.js";
import {
  applyFlowIntentClassificationToContext,
  classifyFreeTextFlowIntent,
} from "../chatbot/intentClassifier.js";
import {
  getDefaultDepartment,
  persistConversationWindow,
  persistEvent,
  persistInboundMessage,
  persistOutboundMessage,
} from "../db/persist.js";
import { resolveOperationalDepartmentId } from "../bootstrap/defaultOperationalDepartment.js";
import { checkUsageGate } from "../usage/usageGate.js";
import { canonicalizeBrazilWaId } from "../utils/waid.js";
import { recordConversationInboundMetrics } from "../metrics/conversationMetrics.js";
import { buildInboxMessageMedia } from "../http/inboxMedia.js";
import { publishRealtimeEvent } from "../realtime/hub.js";
import {
  isWhatsAppMultichannelShadowWriteEnabled,
  safeApplyWhatsAppMultichannelShadow,
} from "../channels/whatsappMultichannelShadowWrite.js";

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

function addHoursIso(timestamp: string, hours: number) {
  const parsed = Date.parse(timestamp);
  const base = Number.isFinite(parsed) ? parsed : Date.now();
  return new Date(base + hours * 60 * 60 * 1000).toISOString();
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
  const resolveRuntimeDepartmentId = async (departmentId?: string | null) => {
    if (!tenantClientId) return departmentId ?? null;
    return resolveOperationalDepartmentId(prisma, tenantClientId, departmentId ?? null);
  };
  const loadDirectConversationForInbound = async (waId: string) => {
    if (!tenantClientId) return null;
    const conversation = await prisma.conversation.findUnique({
      where: {
        clientId_waId: {
          clientId: tenantClientId,
          waId,
        },
      },
      select: {
        id: true,
        clientId: true,
        channelAccountId: true,
        externalUserHash: true,
        legacyWaId: true,
        deletedAt: true,
        anonymizedAt: true,
      },
    });
    await runWhatsAppDualReadShadow({
      prisma,
      model: "Conversation",
      ownerId: tenantClientId,
      waId,
      phoneNumberId,
      phase: "before_persist",
      legacyRecord: conversation
        ? {
            id: conversation.id,
            ownerId: conversation.clientId,
            channelAccountId: conversation.channelAccountId,
            externalUserHash: conversation.externalUserHash,
            legacyWaId: conversation.legacyWaId,
          }
        : null,
    });
    return conversation;
  };
  const resetConversationForBotReentry = (
    state: ConversationState,
    timestamp: string
  ): ConversationState => {
    const inboundIso = parseWebhookTimestampToDate(timestamp).toISOString();
    const baseState = clearChatbotRuntime({
      ...state,
      clientKey: tenantClientKey,
      conversationKey: makeConversationKey(tenantClientKey, state.waId),
      waIdCanonical: canonicalizeBrazilWaId(state.waId),
      firstSeenAt: inboundIso,
      lastInboundAt: inboundIso,
      lastOutboundAt: undefined,
      lastInboundMessageId: undefined,
      lastOutboundMessageId: undefined,
      window: { isOpen: true, expiresAt: addHoursIso(inboundIso, 24) },
      intent: "unknown",
      handoff: { status: "none" },
      templateNeeded: false,
      templateSuggested: undefined,
      lastNeedAt: undefined,
      lastIntent: undefined,
      leadRequestedAt: undefined,
      leadCapturedAt: undefined,
      demoStatus: "none",
      lastDemoRequestedAt: undefined,
      lastDemoScheduledAt: undefined,
      demoPreferredSchedule: undefined,
      lastHandoffDemoScheduledKey: undefined,
      lastHandoffDemoScheduledAt: undefined,
      flow: undefined,
      flowStep: undefined,
      chatbotNodeId: undefined,
      chatbotActive: false,
      answers: {},
      mode: "BOT",
      assignedUserId: null,
      assignedTo: null,
      assignedAt: null,
      departmentId: null,
      queueId: null,
      status: null,
      closedAt: null,
    });
    return {
      ...baseState,
      flow: undefined,
      flowStep: undefined,
      chatbotNodeId: undefined,
      chatbotActive: false,
    };
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
  const isChatbotDisabledForTenant = () =>
    appliedTenantConfig?.disableChatbot === true;
  const isAiFallbackDisabledForTenant = () =>
    !isAiAssistantConfigured(appliedTenantConfig) ||
    appliedTenantConfig?.disableAiFallback === true;
  const isSupervisedAiHandoffEnabled = () =>
    env.AI_ASSISTANT_ENABLED &&
    env.WHATSAPP_AI_ENABLED &&
    appliedTenantConfig?.aiAssistantEnabled === true &&
    appliedTenantConfig?.aiAssistantFallbackToHandoff === true &&
    !isAiFallbackDisabledForTenant();
  const loadChatbotFlowForConversation = async (
    state: ConversationState,
    inboundText: string | null | undefined,
  ) => {
    if (!tenantClientId) return null;
    if (!hasResolvedTenantConfig) return null;
    if (isChatbotDisabledForTenant()) return null;
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
    const departmentId = await resolveRuntimeDepartmentId(state.departmentId ?? null);
    const department = departmentId ? { id: departmentId } : await loadDefaultDepartment();
    let queueId = state.queueId ?? null;
    if (state.departmentId !== department?.id) {
      queueId = null;
    }
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
      departmentId: department?.id ?? null,
      queueId,
      status: state.status === "CLOSED" ? "WAITING" : state.status ?? "WAITING",
      closedAt: null,
    };
  };
  const routeConversationToHumanQueue = async (
    state: ConversationState,
    params: {
      reason: "automation_layers_disabled" | "no_automation_reply_configured";
      timestamp: string;
      messageId: string;
      toE164: string;
      allowlistHit: boolean;
      receivedMedia: boolean;
      replyAlreadyPlanned?: boolean;
      guard?: { version: number; lastInboundAt?: string };
    }
  ) => {
    const previousState = state;
    const activatedHandoff = activateHumanHandoff(
      clearChatbotRuntime(state),
      params.timestamp,
      ""
    );
    let routedConversation = await ensurePendingHandoffRouting({
      ...activatedHandoff.state,
      mode: "HUMAN" as const,
      assignedUserId: null,
      assignedTo: null,
      assignedAt: null,
    });
    await upsertConversationSafe(routedConversation);
    await persistConversationSafe({
      waId: routedConversation.waId,
      windowIsOpen: routedConversation.window.isOpen,
      windowExpiresAt: routedConversation.window.expiresAt,
      lastInboundAt: routedConversation.lastInboundAt ?? null,
      lastOutboundAt: routedConversation.lastOutboundAt ?? null,
      departmentId: routedConversation.departmentId ?? null,
    });
    logger.info({
      event: "conversation.routed_human",
      reason: params.reason,
      clientId: tenantClientId,
      clientKey: tenantClientKey,
      waId: maskNumber(routedConversation.waId),
      messageId: params.messageId,
      mode: routedConversation.mode,
      handoffStatus: routedConversation.handoff.status,
      departmentId: routedConversation.departmentId ?? null,
      requestId: meta?.requestId,
    });
    if (tenantClientId) {
      publishRealtimeEvent({
        type: "conversation.handoff.updated",
        clientId: tenantClientId,
        waId: routedConversation.waId,
        waIdCanonical: canonicalizeBrazilWaId(routedConversation.waId),
        mode: "HUMAN",
        handoffStatus:
          routedConversation.handoff.status === "pending" ||
          routedConversation.handoff.status === "active"
            ? routedConversation.handoff.status
            : "active",
        assignedUserId: routedConversation.assignedUserId ?? null,
        departmentId: routedConversation.departmentId ?? null,
        updatedAt: parseWebhookTimestampToDate(params.timestamp).toISOString(),
      });
    }
    await notifyHandoffLeadArrivalOnRuntimeTransition({
      previousState,
      nextState: routedConversation,
      messageId: params.messageId,
      receivedMedia: params.receivedMedia,
      reason: params.reason,
    });
    routedConversation = await sendRuntimeHandoffMediaNotice({
      previousState,
      nextState: routedConversation,
      messageId: params.messageId,
      toE164: params.toE164,
      allowlistHit: params.allowlistHit,
      receivedMedia: params.receivedMedia,
      replyAlreadyPlanned: params.replyAlreadyPlanned,
      guard: params.guard,
    });
    return routedConversation;
  };
  const upsertConversationSafe = async (state: ConversationState) => {
    const currentState = await storage.getConversation(state.waId, tenantClientKey);
    const stateLastInboundAt = Date.parse(state.lastInboundAt ?? "");
    const currentClosedAt = Date.parse(currentState?.closedAt ?? "");
    const shouldReopenClosedConversation =
      currentState?.status === "CLOSED" &&
      Number.isFinite(stateLastInboundAt) &&
      (!Number.isFinite(currentClosedAt) || stateLastInboundAt > currentClosedAt);
    const shouldResolveDepartment =
      state.mode === "HUMAN" ||
      currentState?.mode === "HUMAN" ||
      state.handoff?.status !== "none" ||
      currentState?.handoff?.status !== "none" ||
      Boolean(state.status ?? currentState?.status);
    const resolvedDepartmentId = shouldResolveDepartment
      ? await resolveRuntimeDepartmentId(state.departmentId ?? currentState?.departmentId ?? null)
      : state.departmentId ?? null;
    const departmentChanged = (currentState?.departmentId ?? null) !== resolvedDepartmentId;
    const baseState = {
      ...state,
      departmentId: resolvedDepartmentId,
      queueId: departmentChanged ? null : state.queueId ?? currentState?.queueId ?? null,
      status: shouldReopenClosedConversation
        ? "WAITING"
        : state.status ?? currentState?.status ?? null,
      closedAt: shouldReopenClosedConversation
        ? null
        : state.closedAt ?? currentState?.closedAt ?? null,
    };
    const nextStateCandidate =
      currentState?.mode === "HUMAN" && state.mode !== "HUMAN"
        ? {
            ...baseState,
            mode: "HUMAN" as const,
            assignedUserId: currentState.assignedUserId ?? null,
            assignedTo: currentState.assignedTo ?? null,
            assignedAt: currentState.assignedAt ?? null,
          }
        : baseState;
    const nextState = {
      ...nextStateCandidate,
      status:
        nextStateCandidate.assignedUserId && nextStateCandidate.status === "WAITING"
          ? "IN_PROGRESS"
          : nextStateCandidate.status,
    };
    await storage.upsertConversation(nextState);
    if (tenantClientId && isWhatsAppMultichannelShadowWriteEnabled()) {
      await safeApplyWhatsAppMultichannelShadow({
        prisma: getPrisma(),
        model: "ConversationRuntimeState",
        clientId: tenantClientId,
        waId: nextState.waId,
        phoneNumberId: phoneNumberId ?? undefined,
      });
    }
    if (departmentChanged && resolvedDepartmentId) {
      logger.info({
        event: "conversation.department.assigned_default",
        clientId: tenantClientId,
        conversationId: state.waId,
        waId: state.waId,
        departmentId: resolvedDepartmentId,
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
      if (inserted) {
        const createdAt = (params.occurredAt ?? new Date()).toISOString();
        const realtimeConversation = await storage.getConversation(params.waId, tenantClientKey);
        const realtimeHandoffStatus =
          realtimeConversation?.handoff?.status === "pending" ||
          realtimeConversation?.handoff?.status === "active"
            ? realtimeConversation.handoff.status
            : "none";
        publishRealtimeEvent({
          type: "message.created",
          clientId: tenantClientId,
          waId: params.waId,
          waIdCanonical: canonicalizeBrazilWaId(params.waId),
          mode: realtimeConversation?.mode === "HUMAN" ? "HUMAN" : "BOT",
          handoffStatus: realtimeHandoffStatus,
          assignedUserId: realtimeConversation?.assignedUserId ?? null,
          departmentId: realtimeConversation?.departmentId ?? null,
          message: {
            direction: "INBOUND",
            type: params.type,
            status: "RECEIVED",
            intent: null,
            bodyText: params.bodyText ?? null,
            media: buildInboxMessageMedia({
              type: params.type,
              rawPayload: params.rawPayload,
              downloadUrl: buildRealtimeMessageDownloadPath(params.waId, params.messageId),
            }),
            templateName: null,
            templateLang: null,
            requestId: meta?.requestId ?? null,
            messageId: params.messageId,
            metaMessageId: null,
            errorBody: null,
            createdAt,
          },
        });
      }
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

  const persistAiHandoffLeadNotes = async (params: {
    clientId: string;
    clientKey: string;
    waId: string;
    conversationKey: string | null;
    messageId: string;
    promptReason: string;
    promptScore: number;
    state: ConversationState;
    qualificationSchema?: AiQualificationSchema | null;
  }) => {
    const prisma = getPrisma();
    const summaryRequestId = [
      "ai-handoff-summary",
      params.clientId,
      params.waId,
      params.messageId,
    ].join(":");
    const suggestedReplyRequestId = [
      "ai-handoff-suggested-reply",
      params.clientId,
      params.waId,
      params.messageId,
    ].join(":");
    const lead = await ensureLeadForConversation({
      tenantId: params.clientId,
      waId: params.waId,
      phoneNumberId: phoneNumberId ?? undefined,
    });
    const createEventAndNote = async (input: {
      requestId: string;
      eventName: "flow.handoff.summary.created" | "flow.handoff.suggested_reply.created";
      noteBody?: string;
      payload: Record<string, unknown>;
    }) => {
      const existing = await prisma.event.findUnique({
        where: {
          clientId_eventName_requestId: {
            clientId: params.clientId,
            eventName: input.eventName,
            requestId: input.requestId,
          },
        },
        select: { id: true },
      });
      if (existing) {
        logger.info({
          event:
            input.eventName === "flow.handoff.summary.created"
              ? "flow.handoff.summary.deduped"
              : "flow.handoff.suggested_reply.deduped",
          clientId: params.clientId,
          clientKey: params.clientKey,
          eventId: existing.id,
          waId: maskNumber(params.waId),
          requestId: meta?.requestId,
        });
        return;
      }
      const event = await prisma.event.create({
        data: {
          clientId: params.clientId,
          waId: params.waId,
          waIdCanonical: canonicalizeBrazilWaId(params.waId),
          messageId: params.messageId,
          requestId: input.requestId,
          eventName: input.eventName,
          payloadJson: input.payload as Prisma.InputJsonValue,
        },
      });
      if (input.noteBody) {
        await prisma.leadNote.create({
          data: {
            tenantId: params.clientId,
            leadId: lead.id,
            body: input.noteBody,
          },
        });
      }
      logger.info({
        event: input.eventName,
        clientId: params.clientId,
        clientKey: params.clientKey,
        eventId: event.id,
        leadId: lead.id,
        waId: maskNumber(params.waId),
        requestId: meta?.requestId,
      });
    };
    try {
      const crmArtifacts = buildAiHandoffCrmArtifacts({
        state: params.state,
        reason: params.promptReason,
        score: params.promptScore,
        qualificationSchema: params.qualificationSchema,
      });
      await createEventAndNote({
        requestId: summaryRequestId,
        eventName: "flow.handoff.summary.created",
        noteBody: crmArtifacts.summaryNote,
        payload: {
          action: "ai_handoff_summary_created",
          clientId: params.clientId,
          clientKey: params.clientKey,
          conversationKey: params.conversationKey,
          reason: params.promptReason,
          score: params.promptScore,
          timestamp: new Date().toISOString(),
        },
      });
      await createEventAndNote({
        requestId: suggestedReplyRequestId,
        eventName: "flow.handoff.suggested_reply.created",
        payload: {
          action: "ai_handoff_suggested_reply_created",
          clientId: params.clientId,
          clientKey: params.clientKey,
          conversationKey: params.conversationKey,
          reason: params.promptReason,
          score: params.promptScore,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error({
        event: "ai.orchestrator.handoff_notes.failed",
        clientId: params.clientId,
        clientKey: params.clientKey,
        waId: maskNumber(params.waId),
        error: (error as Error).message,
        requestId: meta?.requestId,
      });
    }
  };

  const getHandoffLeadNotificationRecipients = () =>
    normalizeHandoffLeadNotificationRecipients(
      appliedTenantConfig?.handoffLeadNotificationRecipients
    ).filter((recipient) => recipient.isActive && recipient.waId);

  const cleanHandoffNotificationText = (value?: string | null) => {
    if (!value) return null;
    const cleaned = value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => {
        if (!line) return true;
        if (/^\[?(resumo automatico|resumo automático|sugest[aã]o de resposta)\]?$/i.test(line)) {
          return false;
        }
        if (/^-{3,}$/.test(line)) return false;
        if (/^origem:\s*(ia controlada|fluxo automatico|fluxo automático)$/i.test(line)) {
          return false;
        }
        if (/^est[aá]gio:\s*(clarification|triage|qualification|waiting_user|handoff_recommended)$/i.test(line)) {
          return false;
        }
        return true;
      })
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return cleaned || null;
  };

  const buildHandoffLeadNotificationSummary = (state: ConversationState, source: string) => {
    const answers = state.answers ?? {};
    const flowContext =
      answers.flowContext && typeof answers.flowContext === "object" && !Array.isArray(answers.flowContext)
        ? (answers.flowContext as Record<string, unknown>)
        : {};
    const aiMemory =
      answers.aiMemory && typeof answers.aiMemory === "object" && !Array.isArray(answers.aiMemory)
        ? (answers.aiMemory as Record<string, unknown>)
        : {};
    const aiOrchestrator =
      answers.aiOrchestrator &&
      typeof answers.aiOrchestrator === "object" &&
      !Array.isArray(answers.aiOrchestrator)
        ? (answers.aiOrchestrator as Record<string, unknown>)
        : {};
    const pickText = (...values: unknown[]) =>
      values.find((value) => typeof value === "string" && value.trim()) as string | undefined;
    const formatValue = (value?: string) =>
      value
        ? value
            .replace(/[_-]+/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 120)
        : null;
    const area = formatValue(pickText(flowContext.area, aiMemory.facts && (aiMemory.facts as Record<string, unknown>).area));
    const servico = formatValue(
      pickText(flowContext.servico, flowContext.intent, aiOrchestrator.goal)
    );
    const prioridade = formatValue(pickText(flowContext.prioridade, flowContext.lead_temp));
    const summary = source === "ai_orchestrator" ? formatValue(pickText(aiMemory.summary)) : null;
    return [
      `Origem: ${source === "ai_orchestrator" ? "IA controlada" : "Fluxo automatico"}`,
      area ? `Area: ${area}` : null,
      servico ? `Interesse: ${servico}` : null,
      prioridade ? `Prioridade: ${prioridade}` : null,
      summary ? `Resumo: ${summary}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  };

  const notifyHandoffLeadArrival = async (params: {
    state: ConversationState;
    source: "ai_orchestrator" | "flow" | "runtime_transition";
    messageId: string;
    reason?: string | null;
    score?: number | null;
    crmSummary?: string | null;
  }) => {
    if (!tenantClientId || !tenantClientKey) return;
    const prisma = getPrisma();
    const eventRequestId = `handoff.lead_notification.${tenantClientId}.${params.state.waId}.${params.messageId}.${params.source}`;
    if (appliedTenantConfig?.handoffLeadNotificationEnabled !== true) {
      logger.info({
        event: "handoff.lead_notification.skipped",
        clientId: tenantClientId,
        clientKey: tenantClientKey,
        waId: maskNumber(params.state.waId),
        reason: "disabled",
        source: params.source,
        requestId: meta?.requestId,
      });
      return;
    }
    const recipients = getHandoffLeadNotificationRecipients();
    if (!recipients.length) {
      logger.info({
        event: "handoff.lead_notification.skipped",
        clientId: tenantClientId,
        clientKey: tenantClientKey,
        waId: maskNumber(params.state.waId),
        reason: "no_active_recipients",
        source: params.source,
        requestId: meta?.requestId,
      });
      return;
    }
    const existing = await prisma.event.findFirst({
      where: {
        clientId: tenantClientId,
        OR: [
          { requestId: eventRequestId },
          {
            waId: params.state.waId,
            messageId: params.messageId,
          },
        ],
        eventName: {
          in: [
            "handoff.lead_notification.sent",
            "handoff.lead_notification.failed",
            "handoff.lead_notification.pending",
          ],
        },
      },
      select: { id: true },
    });
    if (existing) {
      logger.info({
        event: "handoff.lead_notification.skipped",
        clientId: tenantClientId,
        clientKey: tenantClientKey,
        waId: maskNumber(params.state.waId),
        reason: "already_attempted",
        source: params.source,
        requestId: meta?.requestId,
      });
      return;
    }
    const sentCount = await prisma.event.count({
      where: {
        clientId: tenantClientId,
        eventName: {
          in: ["handoff.lead_notification.sent", "handoff.lead_notification.pending_sent"],
        },
      },
    });
    const startIndex = recipients.length ? sentCount % recipients.length : 0;
    const tenantDisplayName =
      appliedTenantConfig?.name?.trim() ||
      (tenantClientKey && tenantClientKey !== "default" ? tenantClientKey : "Re7Online");
    const buildTextBody = (input: {
      leadWaId: string;
      summary?: string | null;
      pending?: boolean;
    }) => {
      const summaryBlock = cleanHandoffNotificationText(input.summary);
      return [
        input.pending ? "Lead pendente no Converta" : "Novo lead no Converta",
        `Tenant: ${tenantDisplayName}`,
        `Lead: ${input.leadWaId}`,
        `Link: https://wa.me/${input.leadWaId}`,
        "",
        "Resumo do CRM",
        summaryBlock || "Atendimento encaminhado para humano. Revise o inbox para ver o historico completo.",
        "",
        "Acesse o inbox para assumir ou acompanhar o atendimento.",
      ]
        .filter((line): line is string => line !== null && line !== undefined)
        .join("\n");
    };
    const findOpenRecipient = async () => {
      for (let offset = 0; offset < recipients.length; offset += 1) {
        const recipientIndex = (startIndex + offset) % recipients.length;
        const recipient = recipients[recipientIndex];
        const recipientState = await storage.getConversation(recipient.waId, tenantClientKey);
        if (recipientState && isWindowOpen(recipientState, Date.now())) {
          return { recipient, recipientIndex };
        }
        logger.info({
          event: "handoff.lead_notification.recipient_skipped",
          clientId: tenantClientId,
          clientKey: tenantClientKey,
          recipientWaId: maskNumber(recipient.waId),
          recipientIndex,
          reason: recipientState ? "window_closed" : "recipient_state_missing",
          source: params.source,
          requestId: meta?.requestId,
        });
      }
      return null;
    };
    const openRecipient = await findOpenRecipient();
    const summary =
      cleanHandoffNotificationText(params.crmSummary) ??
      buildHandoffLeadNotificationSummary(params.state, params.source);
    if (!openRecipient) {
      await prisma.event.create({
        data: {
          clientId: tenantClientId,
          waId: params.state.waId,
          waIdCanonical: canonicalizeBrazilWaId(params.state.waId),
          messageId: params.messageId,
          requestId: eventRequestId,
          eventName: "handoff.lead_notification.pending",
          payloadJson: {
            action: "handoff.lead_notification.pending",
            clientId: tenantClientId,
            clientKey: tenantClientKey,
            source: params.source,
            reason: params.reason ?? null,
            score: params.score ?? null,
            leadWaId: params.state.waId,
            originalMessageId: params.messageId,
            summary,
            recipientCount: recipients.length,
            pendingReason: "no_active_recipient_window_open",
          } as Prisma.InputJsonValue,
        },
      });
      logger.info({
        event: "handoff.lead_notification.pending",
        clientId: tenantClientId,
        clientKey: tenantClientKey,
        waId: maskNumber(params.state.waId),
        reason: "no_active_recipient_window_open",
        recipientCount: recipients.length,
        source: params.source,
        requestId: meta?.requestId,
      });
      return;
    }

    const sendNotification = async (input: {
      requestId: string;
      eventName:
        | "handoff.lead_notification.sent"
        | "handoff.lead_notification.pending_sent"
        | "handoff.lead_notification.pending_digest_sent";
      leadWaId: string;
      messageId: string | null;
      source: string;
      reason?: string | null;
      score?: number | null;
      summary?: string | null;
      pending?: boolean;
    }) => {
      const textBody = buildTextBody({
        leadWaId: input.leadWaId,
        summary: input.summary,
        pending: input.pending,
      });
      const credentials = await resolveCurrentTenantCredentials();
      const result = await sendTextMessage(openRecipient.recipient.waId, textBody, credentials ?? undefined);
      const eventName = result.ok ? input.eventName : "handoff.lead_notification.failed";
      await prisma.event.create({
        data: {
          clientId: tenantClientId,
          waId: input.leadWaId,
          waIdCanonical: canonicalizeBrazilWaId(input.leadWaId),
          messageId: input.messageId,
          requestId: input.requestId,
          eventName,
          payloadJson: {
            action: eventName,
            clientId: tenantClientId,
            clientKey: tenantClientKey,
            source: input.source,
            reason: input.reason ?? null,
            score: input.score ?? null,
            recipientId: openRecipient.recipient.id,
            recipientLabel: openRecipient.recipient.label ?? null,
            recipientWaId: maskNumber(openRecipient.recipient.waId),
            recipientIndex: openRecipient.recipientIndex,
            recipientCount: recipients.length,
            pending: input.pending === true,
            hasSummary: Boolean(input.summary),
            status: result.status ?? null,
            metaMessageId: result.messageId ?? null,
            errorBody: result.ok ? null : result.errorBody ?? null,
          } as Prisma.InputJsonValue,
        },
      });
      logger.info({
        event: eventName,
        clientId: tenantClientId,
        clientKey: tenantClientKey,
        waId: maskNumber(input.leadWaId),
        recipientWaId: maskNumber(openRecipient.recipient.waId),
        recipientIndex: openRecipient.recipientIndex,
        recipientCount: recipients.length,
        status: result.status,
        source: input.source,
        pending: input.pending === true,
        requestId: meta?.requestId,
      });
    };

    const markPendingSkipped = async (input: {
      pendingEvent: { requestId: string | null; messageId: string | null };
      leadWaId: string;
      reason: string;
      assignedUserId?: string | null;
    }) => {
      if (!input.pendingEvent.requestId) return;
      await prisma.event.create({
        data: {
          clientId: tenantClientId,
          waId: input.leadWaId,
          waIdCanonical: canonicalizeBrazilWaId(input.leadWaId),
          messageId: input.pendingEvent.messageId,
          requestId: input.pendingEvent.requestId,
          eventName: "handoff.lead_notification.pending_skipped",
          payloadJson: {
            action: "handoff.lead_notification.pending_skipped",
            clientId: tenantClientId,
            clientKey: tenantClientKey,
            reason: input.reason,
            assignedUserId: input.assignedUserId ?? null,
          } as Prisma.InputJsonValue,
        },
      });
      logger.info({
        event: "handoff.lead_notification.pending_skipped",
        clientId: tenantClientId,
        clientKey: tenantClientKey,
        waId: maskNumber(input.leadWaId),
        reason: input.reason,
        requestId: meta?.requestId,
      });
    };

    const pendingEvents = await prisma.event.findMany({
      where: {
        clientId: tenantClientId,
        eventName: "handoff.lead_notification.pending",
      },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    const pendingCandidates: Array<{
      event: (typeof pendingEvents)[number];
      leadWaId: string;
      payload: Record<string, unknown>;
    }> = [];
    const pendingByLeadWaId = new Map<string, (typeof pendingCandidates)[number]>();
    for (const pendingEvent of pendingEvents) {
      if (pendingEvent.requestId === eventRequestId) continue;
      if (!pendingEvent.requestId) continue;
      const resolvedPending = await prisma.event.findFirst({
        where: {
          clientId: tenantClientId,
          requestId: pendingEvent.requestId,
          eventName: {
            in: [
              "handoff.lead_notification.pending_sent",
              "handoff.lead_notification.pending_skipped",
              "handoff.lead_notification.failed",
            ],
          },
        },
        select: { id: true },
      });
      if (resolvedPending) continue;
      const payload =
        pendingEvent.payloadJson &&
        typeof pendingEvent.payloadJson === "object" &&
        !Array.isArray(pendingEvent.payloadJson)
          ? (pendingEvent.payloadJson as Record<string, unknown>)
          : {};
      const leadWaId =
        typeof payload.leadWaId === "string" && payload.leadWaId.trim()
          ? payload.leadWaId
          : pendingEvent.waId ?? "";
      if (!leadWaId) continue;
      const currentLeadState = await storage.getConversation(leadWaId, tenantClientKey);
      if (currentLeadState?.assignedUserId) {
        await markPendingSkipped({
          pendingEvent,
          leadWaId,
          reason: "lead_already_assigned",
          assignedUserId: currentLeadState.assignedUserId,
        });
        continue;
      }
      const previousPendingForLead = pendingByLeadWaId.get(leadWaId);
      if (previousPendingForLead) {
        await markPendingSkipped({
          pendingEvent: previousPendingForLead.event,
          leadWaId,
          reason: "superseded_by_newer_pending_for_same_lead",
        });
      }
      pendingByLeadWaId.set(leadWaId, { event: pendingEvent, leadWaId, payload });
    }
    pendingCandidates.push(...pendingByLeadWaId.values());

    if (pendingCandidates.length > 5) {
      const digestRequestId = `handoff.lead_notification.pending_digest.${tenantClientId}.${Date.now()}.${params.messageId}`;
      const digestSummary = [
        `Resumo: ${pendingCandidates.length} leads ficaram pendentes de notificacao porque os numeros ativos estavam sem janela aberta.`,
        "Eles ainda nao foram assumidos diretamente na plataforma.",
        "Acesse o inbox do Converta para revisar e distribuir os atendimentos.",
      ].join("\n");
      await sendNotification({
        requestId: digestRequestId,
        eventName: "handoff.lead_notification.pending_digest_sent",
        leadWaId: params.state.waId,
        messageId: params.messageId,
        source: "pending_digest",
        summary: digestSummary,
        pending: true,
      });
      for (const pending of pendingCandidates) {
        await markPendingSkipped({
          pendingEvent: pending.event,
          leadWaId: pending.leadWaId,
          reason: "covered_by_pending_digest",
        });
      }
      logger.info({
        event: "handoff.lead_notification.pending_digest_queued",
        clientId: tenantClientId,
        clientKey: tenantClientKey,
        pendingCount: pendingCandidates.length,
        recipientWaId: maskNumber(openRecipient.recipient.waId),
        requestId: meta?.requestId,
      });
    } else {
      for (const pending of pendingCandidates) {
        await sendNotification({
          requestId: pending.event.requestId!,
          eventName: "handoff.lead_notification.pending_sent",
          leadWaId: pending.leadWaId,
          messageId: pending.event.messageId,
          source: typeof pending.payload.source === "string" ? pending.payload.source : "pending",
          reason: typeof pending.payload.reason === "string" ? pending.payload.reason : null,
          score: typeof pending.payload.score === "number" ? pending.payload.score : null,
          summary: typeof pending.payload.summary === "string" ? pending.payload.summary : null,
          pending: true,
        });
      }
    }

    await sendNotification({
      requestId: eventRequestId,
      eventName: "handoff.lead_notification.sent",
      leadWaId: params.state.waId,
      messageId: params.messageId,
      source: params.source,
      reason: params.reason,
      score: params.score,
      summary,
      pending: false,
    });
  };

  const notifyHandoffLeadArrivalOnRuntimeTransition = async (params: {
    previousState: ConversationState;
    nextState: ConversationState;
    messageId: string;
    receivedMedia?: boolean;
    reason: string;
    crmSummary?: string | null;
  }) => {
    const previousIsHuman =
      params.previousState.mode === "HUMAN" ||
      getHandoffStatus(params.previousState) === "active";
    const nextIsHuman =
      params.nextState.mode === "HUMAN" ||
      getHandoffStatus(params.nextState) === "active";
    if (previousIsHuman || !nextIsHuman) return;
    const mediaPolicy = normalizeTenantMediaHandoffPolicy(appliedTenantConfig?.mediaHandoffPolicy);
    const includeMediaSummary =
      params.receivedMedia === true &&
      mediaPolicy.enabled &&
      mediaPolicy.channels.includes("whatsapp") &&
      (mediaPolicy.behavior === "notify_and_reply" || mediaPolicy.behavior === "notify_only");
    await notifyHandoffLeadArrival({
      state: params.nextState,
      source: "runtime_transition",
      messageId: params.messageId,
      reason: params.reason,
      crmSummary:
        params.crmSummary ??
        [
          "Origem: Transicao operacional para atendimento humano",
          includeMediaSummary ? mediaPolicy.attendantSummaryText : null,
          "Atendimento entrou na fila humana. Revise o inbox para ver o historico completo.",
        ]
          .filter(Boolean)
          .join("\n"),
    });
  };

  const sendRuntimeHandoffMediaNotice = async (params: {
    previousState: ConversationState;
    nextState: ConversationState;
    messageId: string;
    toE164: string;
    allowlistHit: boolean;
    receivedMedia: boolean;
    replyAlreadyPlanned?: boolean;
    guard?: { version: number; lastInboundAt?: string };
  }) => {
    if (!params.receivedMedia) return params.nextState;
    if (params.replyAlreadyPlanned) return params.nextState;
    if (!params.allowlistHit || !env.outboundEnabled || !hasResolvedTenantConfig) {
      return params.nextState;
    }
    if (!tenantClientId) return params.nextState;
    const mediaPolicy = normalizeTenantMediaHandoffPolicy(appliedTenantConfig?.mediaHandoffPolicy);
    const shouldReply =
      mediaPolicy.enabled &&
      mediaPolicy.channels.includes("whatsapp") &&
      (mediaPolicy.behavior === "notify_and_reply" || mediaPolicy.behavior === "reply_only");
    if (!shouldReply) return params.nextState;
    const previousIsHuman =
      params.previousState.mode === "HUMAN" ||
      getHandoffStatus(params.previousState) === "active";
    const nextIsHuman =
      params.nextState.mode === "HUMAN" ||
      getHandoffStatus(params.nextState) === "active";
    if (previousIsHuman || !nextIsHuman) return params.nextState;

    const noticeMessageId = `handoff.runtime.media_notice.${params.messageId}`;
    const existingNotice = await getPrisma().outboundMessage.findFirst({
      where: {
        clientId: tenantClientId,
        messageId: noticeMessageId,
      },
      select: { id: true },
    });
    if (existingNotice) {
      logger.info({
        event: "handoff.runtime.media_notice.skipped",
        clientId: tenantClientId,
        clientKey: tenantClientKey,
        waId: maskNumber(params.nextState.waId),
        reason: "already_sent",
        requestId: meta?.requestId,
      });
      return params.nextState;
    }

    const replyText = mediaPolicy.customerNoticeText;
    const result = await sendOutboundText({
      toE164: env.WHATSAPP_SANDBOX ? env.WHATSAPP_SANDBOX_TO || params.nextState.waId : params.toE164,
      waId: params.nextState.waId,
      intent: params.nextState.intent,
      messageId: noticeMessageId,
      replyText,
      guard: params.guard,
    });
    if (!result.ok) {
      logger.warn({
        event: "handoff.runtime.media_notice.failed",
        clientId: tenantClientId,
        clientKey: tenantClientKey,
        waId: maskNumber(params.nextState.waId),
        status: result.status,
        errorBody: result.errorBody,
        requestId: meta?.requestId,
      });
      return params.nextState;
    }
    logger.info({
      event: "handoff.runtime.media_notice.sent",
      clientId: tenantClientId,
      clientKey: tenantClientKey,
      waId: maskNumber(params.nextState.waId),
      metaMessageId: result.messageId,
      requestId: meta?.requestId,
    });
    return persistOutboundConversation(params.nextState, result.messageId);
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
    const normalizeRealtimeStatus = (status: string | null) => {
      switch ((status || "").trim().toLowerCase()) {
        case "sent":
          return "SENT" as const;
        case "delivered":
          return "DELIVERED" as const;
        case "read":
          return "READ" as const;
        case "failed":
          return "FAILED" as const;
        default:
          return null;
      }
    };
    const stringifyStatusError = (value: unknown) => {
      if (!value) return null;
      if (typeof value === "string") return value;
      try {
        return JSON.stringify(value);
      } catch {
        return null;
      }
    };
    const normalizeStatusTimestamp = (timestamp: string | null) => {
      if (!timestamp) return new Date().toISOString();
      const parsed = Number(timestamp);
      if (!Number.isFinite(parsed)) return new Date().toISOString();
      return new Date(parsed * 1000).toISOString();
    };
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
      const normalizedStatus = normalizeRealtimeStatus(item.status);
      if (!normalizedStatus) continue;
      try {
        const outbound = await prisma.outboundMessage.findFirst({
          where: {
            clientId: tenantClientId,
            metaMessageId: item.id,
          },
          select: {
            id: true,
            clientId: true,
            waId: true,
            waIdCanonical: true,
            messageId: true,
            metaMessageId: true,
            errorBody: true,
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
        const statusErrorBody =
          item.status_detail ||
          stringifyStatusError(item.error_data) ||
          stringifyStatusError(item.errors) ||
          outbound.errorBody ||
          null;

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
        publishRealtimeEvent({
          type: "message.status.updated",
          clientId: outbound.clientId,
          waId: outbound.waId,
          waIdCanonical: outbound.waIdCanonical ?? canonicalizeBrazilWaId(outbound.waId),
          messageId: outbound.messageId,
          metaMessageId: outbound.metaMessageId ?? item.id,
          status: normalizedStatus,
          errorBody: normalizedStatus === "FAILED" ? statusErrorBody : null,
          updatedAt: normalizeStatusTimestamp(item.timestamp),
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

    const existingRuntimeForInbound = await storage.getConversation(normalizedFrom, tenantClientKey);
    const directConversationForInbound = await loadDirectConversationForInbound(normalizedFrom);
    let currentConversation =
      existingRuntimeForInbound ??
      (await getOrCreateConversation(
        storage,
        tenantClientKey,
        normalizedFrom,
        message.timestamp
      ));
    const shouldResetForBotReentry =
      Boolean(directConversationForInbound?.deletedAt) ||
      Boolean(existingRuntimeForInbound && !directConversationForInbound);
    if (shouldResetForBotReentry) {
      currentConversation = resetConversationForBotReentry(currentConversation, message.timestamp);
      await storage.upsertConversation(currentConversation);
      logger.info({
        event: "conversation.reentry.reset_to_bot",
        clientId: tenantClientId,
        clientKey: tenantClientKey,
        conversationId: directConversationForInbound?.id ?? null,
        waId: maskNumber(normalizedFrom),
        reason: directConversationForInbound?.deletedAt
          ? "inbound_after_soft_delete"
          : "stale_runtime_without_active_conversation",
        requestId: meta?.requestId,
      });
    }
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
        name: message.profileName ?? undefined,
        phoneNumberId: phoneNumberId ?? undefined,
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
    const supervisedAiHandoffEnabled = isSupervisedAiHandoffEnabled();
    if (currentHandoffStatus === "active") {
      let blockedState = updateInboundMeta(
        currentConversation,
        message.messageId,
        message.timestamp
      );
      if (blockedState.mode !== "HUMAN") {
        logger.warn({
          event: "ai.orchestrator.invalid_state_detected",
          clientId: tenantClientId,
          clientKey: tenantClientKey,
          waId: maskNumber(normalizedFrom),
          reason: "active_handoff_without_human_mode",
          mode: blockedState.mode,
          handoffStatus: blockedState.handoff.status,
          requestId: meta?.requestId,
        });
        await persistEventSafe(
          "ai.orchestrator.invalid_state_detected",
          {
            action: "ai.orchestrator.invalid_state_detected",
            clientId: tenantClientId || null,
            clientKey: tenantClientKey || null,
            reason: "active_handoff_without_human_mode",
            mode: blockedState.mode,
            handoffStatus: blockedState.handoff.status,
          } as Prisma.InputJsonValue,
          normalizedFrom,
          message.messageId
        );
        blockedState = clearChatbotRuntime({
          ...blockedState,
          mode: "HUMAN",
          status: blockedState.status ?? "WAITING",
          assignedUserId: blockedState.assignedUserId ?? null,
          assignedTo: blockedState.assignedTo ?? null,
          assignedAt: blockedState.assignedAt ?? null,
        });
      }
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

    if (currentHandoffStatus === "pending" && !supervisedAiHandoffEnabled) {
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
      let updatedConversation = handoffResult.state;

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
        if (updatedConversation.mode !== "HUMAN") {
          logger.warn({
            event: "ai.orchestrator.invalid_state_detected",
            clientId: tenantClientId,
            clientKey: tenantClientKey,
            waId: maskNumber(normalizedFrom),
            reason: "legacy_pending_handoff_acceptance_without_human_mode",
            mode: updatedConversation.mode,
            handoffStatus: updatedConversation.handoff.status,
            requestId: meta?.requestId,
          });
          await persistEventSafe(
            "ai.orchestrator.invalid_state_detected",
            {
              action: "ai.orchestrator.invalid_state_detected",
              clientId: tenantClientId || null,
              clientKey: tenantClientKey || null,
              reason: "legacy_pending_handoff_acceptance_without_human_mode",
              mode: updatedConversation.mode,
              handoffStatus: updatedConversation.handoff.status,
            } as Prisma.InputJsonValue,
            normalizedFrom,
            message.messageId
          );
        }
        updatedConversation = await ensurePendingHandoffRouting({
          ...clearChatbotRuntime(updatedConversation),
          mode: "HUMAN" as const,
          assignedUserId: null,
          assignedTo: null,
          assignedAt: null,
          status: "WAITING",
          closedAt: null,
        });
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
      await notifyHandoffLeadArrivalOnRuntimeTransition({
        previousState: currentConversation,
        nextState: updatedConversation,
        messageId: message.messageId,
        receivedMedia: isWhatsAppInboundMediaMessage(message.type),
        reason: "legacy_pending_handoff_runtime_transition",
      });
      updatedConversation = await sendRuntimeHandoffMediaNotice({
        previousState: currentConversation,
        nextState: updatedConversation,
        messageId: message.messageId,
        toE164: message.from,
        allowlistHit,
        receivedMedia: isWhatsAppInboundMediaMessage(message.type),
        replyAlreadyPlanned: Boolean(handoffResult.replyText?.trim()),
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
    if (
      supervisedAiHandoffEnabled &&
      updatedConversation.handoff.status === "pending"
    ) {
      logger.info({
        event: "ai.orchestrator.handoff_legacy_blocked",
        clientId: tenantClientId,
        clientKey: tenantClientKey,
        waId: maskNumber(normalizedFrom),
        reason: "legacy_pending_replaced_by_supervised_handoff",
        requestId: meta?.requestId,
      });
      await persistEventSafe(
        "ai.orchestrator.handoff_legacy_blocked",
        {
          action: "ai.orchestrator.handoff_legacy_blocked",
          clientId: tenantClientId || null,
          clientKey: tenantClientKey || null,
          reason: "legacy_pending_replaced_by_supervised_handoff",
        } as Prisma.InputJsonValue,
        normalizedFrom,
        message.messageId
      );
      updatedConversation = {
        ...updatedConversation,
        mode: "BOT",
        handoff: {
          ...updatedConversation.handoff,
          status: "none",
          releasedAt: message.timestamp,
        },
      };
      logger.info({
        event: "ai.orchestrator.handoff_unified",
        clientId: tenantClientId,
        clientKey: tenantClientKey,
        waId: maskNumber(normalizedFrom),
        reason: "legacy_pending_cleared",
        requestId: meta?.requestId,
      });
      await persistEventSafe(
        "ai.orchestrator.handoff_unified",
        {
          action: "ai.orchestrator.handoff_unified",
          clientId: tenantClientId || null,
          clientKey: tenantClientKey || null,
          reason: "legacy_pending_cleared",
        } as Prisma.InputJsonValue,
        normalizedFrom,
        message.messageId
      );
    }
    const pendingOffer = updatedConversation.answers?.aiOrchestrator?.pendingOffer;
    const activePrompt = updatedConversation.answers?.aiOrchestrator?.activePrompt;
    const aiHandoffPrompt =
      (activePrompt?.type === "handoff_confirmation"
        ? {
            prompted: true,
            promptedAt: activePrompt.createdAt,
            messageId: activePrompt.messageId,
            reason: "active_prompt_handoff_confirmation",
            score: 3,
            awaitingConfirmation: true,
            confirmationRetryCount: activePrompt.retryCount ?? 0,
          }
        : undefined) ??
      updatedConversation.answers?.aiOrchestrator?.handoffPrompt ??
      (pendingOffer?.type === "handoff"
        ? {
            prompted: true,
            promptedAt: pendingOffer.promptedAt,
            messageId: pendingOffer.messageId,
            reason: "pending_offer_handoff",
            score: 3,
            awaitingConfirmation: true,
            confirmationRetryCount: pendingOffer.retryCount ?? 0,
          }
        : undefined);
    if (
      aiHandoffPrompt?.awaitingConfirmation === true &&
      updatedConversation.mode !== "HUMAN" &&
      updatedConversation.handoff.status === "none"
    ) {
      const normalizedConfirmation = normalizeHandoffConfirmationText(message.text);
      const previousAiOrchestrator = updatedConversation.answers?.aiOrchestrator;
      const persistCurrentInboundForHandoff = async (state: ConversationState) => {
        await upsertConversationSafe(state);
        await persistConversationSafe({
          waId: state.waId,
          windowIsOpen: state.window.isOpen,
          windowExpiresAt: state.window.expiresAt,
          lastInboundAt: state.lastInboundAt ?? null,
          lastOutboundAt: state.lastOutboundAt ?? null,
          departmentId: state.departmentId ?? null,
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
      };
      logger.info({
        event: "ai.orchestrator.handoff_confirmation.received",
        clientId: tenantClientId,
        clientKey: tenantClientKey,
        waId: maskNumber(normalizedFrom),
        messageId: message.messageId,
        decision: normalizedConfirmation,
        requestId: meta?.requestId,
      });
      await persistEventSafe(
        "ai.orchestrator.handoff_confirmation.received",
        {
          action: "ai.orchestrator.handoff_confirmation.received",
          clientId: tenantClientId || null,
          clientKey: tenantClientKey || null,
          decision: normalizedConfirmation,
          promptMessageId: aiHandoffPrompt.messageId,
        } as Prisma.InputJsonValue,
        normalizedFrom,
        message.messageId
      );

      if (normalizedConfirmation === "accepted") {
        const clearedAnswers: ConversationState["answers"] = {
          ...(updatedConversation.answers ?? {}),
          aiOrchestrator: {
            ...(previousAiOrchestrator ?? {}),
            handoffPrompt: {
              ...aiHandoffPrompt,
              awaitingConfirmation: false,
              confirmationRetryCount: aiHandoffPrompt.confirmationRetryCount ?? 0,
            },
            pendingOffer: {
              type: "none",
              promptedAt: new Date().toISOString(),
              messageId: message.messageId,
              retryCount: pendingOffer?.retryCount ?? 0,
            },
            activePrompt: undefined,
            handoffRecommended: true,
            lastMessageId: message.messageId,
            lastNextActionAt: new Date().toISOString(),
          },
        };
        const confirmationPersistedState: ConversationState = {
          ...updatedConversation,
          answers: clearedAnswers,
          mode: "BOT",
          handoff: {
            ...updatedConversation.handoff,
            status: "none",
          },
        };
        await persistCurrentInboundForHandoff(confirmationPersistedState);
        const activatedHandoff = activateHumanHandoff(
          clearChatbotRuntime({
            ...confirmationPersistedState,
            answers: clearedAnswers,
          }),
          message.timestamp,
          "Perfeito. Vou encaminhar seu atendimento para uma pessoa da equipe."
        );
        updatedConversation = await ensurePendingHandoffRouting({
          ...activatedHandoff.state,
          mode: "HUMAN" as const,
          assignedUserId: null,
          assignedTo: null,
          assignedAt: null,
          status: "WAITING",
          closedAt: null,
        });
        await upsertConversationSafe(updatedConversation);
        await persistConversationSafe({
          waId: updatedConversation.waId,
          windowIsOpen: updatedConversation.window.isOpen,
          windowExpiresAt: updatedConversation.window.expiresAt,
          lastInboundAt: updatedConversation.lastInboundAt ?? null,
          lastOutboundAt: updatedConversation.lastOutboundAt ?? null,
          departmentId: updatedConversation.departmentId ?? null,
        });
        if (tenantClientId) {
          const aiCrmArtifacts = buildAiHandoffCrmArtifacts({
            state: updatedConversation,
            reason: aiHandoffPrompt.reason,
            score: aiHandoffPrompt.score,
            qualificationSchema: appliedTenantConfig?.aiQualification,
          });
          await persistAiHandoffLeadNotes({
            clientId: tenantClientId,
            clientKey: tenantClientKey,
            waId: updatedConversation.waId,
            conversationKey: updatedConversation.conversationKey ?? null,
            messageId: message.messageId,
            promptReason: aiHandoffPrompt.reason,
            promptScore: aiHandoffPrompt.score,
            state: updatedConversation,
            qualificationSchema: appliedTenantConfig?.aiQualification,
          });
          await notifyHandoffLeadArrival({
            state: updatedConversation,
            source: "ai_orchestrator",
            messageId: message.messageId,
            reason: aiHandoffPrompt.reason,
            score: aiHandoffPrompt.score,
            crmSummary: aiCrmArtifacts.summaryNote,
          });
          publishRealtimeEvent({
            type: "conversation.handoff.updated",
            clientId: tenantClientId,
            waId: updatedConversation.waId,
            waIdCanonical: canonicalizeBrazilWaId(updatedConversation.waId),
            mode: "HUMAN",
            handoffStatus:
              updatedConversation.handoff.status === "pending" ||
              updatedConversation.handoff.status === "active"
                ? updatedConversation.handoff.status
                : "active",
            assignedUserId: updatedConversation.assignedUserId ?? null,
            departmentId: updatedConversation.departmentId ?? null,
            updatedAt: parseWebhookTimestampToDate(message.timestamp).toISOString(),
          });
        }
        logger.info({
          event: "ai.orchestrator.handoff_confirmation.accepted",
          clientId: tenantClientId,
          clientKey: tenantClientKey,
          waId: maskNumber(normalizedFrom),
          mode: updatedConversation.mode,
          handoffStatus: updatedConversation.handoff.status,
          status: updatedConversation.status ?? null,
          requestId: meta?.requestId,
        });
        logger.info({
          event: "ai.orchestrator.handoff_activated",
          clientId: tenantClientId,
          clientKey: tenantClientKey,
          waId: maskNumber(normalizedFrom),
          mode: updatedConversation.mode,
          handoffStatus: updatedConversation.handoff.status,
          status: updatedConversation.status ?? null,
          departmentId: updatedConversation.departmentId ?? null,
          requestId: meta?.requestId,
        });
        await persistEventSafe(
          "ai.orchestrator.handoff_confirmation.accepted",
          {
            action: "ai.orchestrator.handoff_confirmation.accepted",
            clientId: tenantClientId || null,
            clientKey: tenantClientKey || null,
            mode: updatedConversation.mode,
            handoffStatus: updatedConversation.handoff.status,
            status: updatedConversation.status ?? null,
          } as Prisma.InputJsonValue,
          normalizedFrom,
          message.messageId
        );
        await persistEventSafe(
          "ai.orchestrator.handoff_activated",
          {
            action: "ai.orchestrator.handoff_activated",
            clientId: tenantClientId || null,
            clientKey: tenantClientKey || null,
            mode: updatedConversation.mode,
            handoffStatus: updatedConversation.handoff.status,
            status: updatedConversation.status ?? null,
            departmentId: updatedConversation.departmentId ?? null,
          } as Prisma.InputJsonValue,
          normalizedFrom,
          message.messageId
        );
        if (tenantHandoffAttendantWaid && appliedTenantConfig?.handoffLeadNotificationEnabled !== true) {
          await notifyAttendantHumanRequested({
            attendantWaId: tenantHandoffAttendantWaid,
            leadWaId: normalizedFrom,
            snippet: message.text?.slice(0, 160).replace(/\s+/g, " ").trim() || "-",
            requestId: meta?.requestId,
          });
        }
        if (allowlistHit && env.outboundEnabled && env.OUTBOUND_TEXT_ENABLED) {
          const handoffReply = activatedHandoff.replyText;
          const result = await sendOutboundText({
            toE164: env.WHATSAPP_SANDBOX ? env.WHATSAPP_SANDBOX_TO || normalizedFrom : message.from,
            waId: normalizedFrom,
            intent: updatedConversation.intent,
            messageId: `ai.handoff.confirmation.${message.messageId}`,
            replyText: handoffReply,
            guard: inboundGuard,
          });
          if (result.ok) {
            updatedConversation = await persistOutboundConversation(
              updatedConversation,
              result.messageId
            );
          }
        }
        continue;
      }

      if (normalizedConfirmation === "declined") {
        updatedConversation = {
          ...updatedConversation,
          handoff: {
            ...updatedConversation.handoff,
            status: "none",
            releasedAt: message.timestamp,
          },
          mode: "BOT",
          answers: {
            ...(updatedConversation.answers ?? {}),
            aiOrchestrator: {
              ...(previousAiOrchestrator ?? {}),
              handoffPrompt: {
                ...aiHandoffPrompt,
                awaitingConfirmation: false,
                confirmationRetryCount: aiHandoffPrompt.confirmationRetryCount ?? 0,
              },
              pendingOffer: {
                type: "none",
                promptedAt: new Date().toISOString(),
                messageId: message.messageId,
                retryCount: pendingOffer?.retryCount ?? 0,
              },
              activePrompt: undefined,
              handoffRecommended: false,
              lastMessageId: message.messageId,
              lastNextActionAt: new Date().toISOString(),
            },
          },
        };
        await persistCurrentInboundForHandoff(updatedConversation);
        logger.info({
          event: "ai.orchestrator.handoff_confirmation.declined",
          clientId: tenantClientId,
          clientKey: tenantClientKey,
          waId: maskNumber(normalizedFrom),
          requestId: meta?.requestId,
        });
        await persistEventSafe(
          "ai.orchestrator.handoff_confirmation.declined",
          {
            action: "ai.orchestrator.handoff_confirmation.declined",
            clientId: tenantClientId || null,
            clientKey: tenantClientKey || null,
          } as Prisma.InputJsonValue,
          normalizedFrom,
          message.messageId
        );
        if (allowlistHit && env.outboundEnabled && env.OUTBOUND_TEXT_ENABLED) {
          const result = await sendOutboundText({
            toE164: env.WHATSAPP_SANDBOX ? env.WHATSAPP_SANDBOX_TO || normalizedFrom : message.from,
            waId: normalizedFrom,
            intent: updatedConversation.intent,
            messageId: `ai.handoff.declined.${message.messageId}`,
            replyText: "Tudo bem. Posso continuar te orientando por aqui.",
            guard: inboundGuard,
          });
          if (result.ok) {
            updatedConversation = await persistOutboundConversation(
              updatedConversation,
              result.messageId
            );
          }
        }
        continue;
      }

      if (isUsefulTextForAiContinuation(message.text)) {
        updatedConversation = {
          ...updatedConversation,
          handoff: {
            ...updatedConversation.handoff,
            status: "none",
            releasedAt: message.timestamp,
          },
          mode: "BOT",
          answers: {
            ...(updatedConversation.answers ?? {}),
            aiOrchestrator: {
              ...(previousAiOrchestrator ?? {}),
              handoffPrompt: {
                ...aiHandoffPrompt,
                awaitingConfirmation: false,
                confirmationRetryCount: aiHandoffPrompt.confirmationRetryCount ?? 0,
              },
              pendingOffer: {
                type: "none",
                promptedAt: new Date().toISOString(),
                messageId: message.messageId,
                retryCount: pendingOffer?.retryCount ?? 0,
              },
              activePrompt: undefined,
              handoffRecommended: false,
              lastNextActionAt: new Date().toISOString(),
            },
          },
        };
        logger.info({
          event: "ai.orchestrator.handoff_confirmation.cancelled_by_useful_text",
          clientId: tenantClientId,
          clientKey: tenantClientKey,
          waId: maskNumber(normalizedFrom),
          requestId: meta?.requestId,
        });
        await persistEventSafe(
          "ai.orchestrator.handoff_confirmation.cancelled_by_useful_text",
          {
            action: "ai.orchestrator.handoff_confirmation.cancelled_by_useful_text",
            clientId: tenantClientId || null,
            clientKey: tenantClientKey || null,
          } as Prisma.InputJsonValue,
          normalizedFrom,
          message.messageId
        );
      } else {
      const nextRetryCount = (aiHandoffPrompt.confirmationRetryCount ?? 0) + 1;
      const shouldClosePrompt = nextRetryCount >= 2;
      updatedConversation = {
        ...updatedConversation,
        answers: {
          ...(updatedConversation.answers ?? {}),
          aiOrchestrator: {
            ...(previousAiOrchestrator ?? {}),
            handoffPrompt: {
              ...aiHandoffPrompt,
              awaitingConfirmation: !shouldClosePrompt,
              confirmationRetryCount: nextRetryCount,
            },
            pendingOffer: {
              type: shouldClosePrompt ? "none" : "handoff",
              promptedAt: pendingOffer?.promptedAt ?? aiHandoffPrompt.promptedAt,
              messageId: pendingOffer?.messageId ?? aiHandoffPrompt.messageId,
              retryCount: nextRetryCount,
            },
            activePrompt: shouldClosePrompt
              ? undefined
              : {
                  type: "handoff_confirmation",
                  expected: "yes_no",
                  createdAt: activePrompt?.createdAt ?? aiHandoffPrompt.promptedAt,
                  messageId: activePrompt?.messageId ?? aiHandoffPrompt.messageId,
                  retryCount: nextRetryCount,
                },
            handoffRecommended: !shouldClosePrompt,
            lastMessageId: message.messageId,
            lastNextActionAt: new Date().toISOString(),
          },
        },
      };
      await persistCurrentInboundForHandoff(updatedConversation);
      logger.info({
        event: "ai.orchestrator.handoff_confirmation.invalid",
        clientId: tenantClientId,
        clientKey: tenantClientKey,
        waId: maskNumber(normalizedFrom),
        retryCount: nextRetryCount,
        awaitingConfirmation: !shouldClosePrompt,
        requestId: meta?.requestId,
      });
      await persistEventSafe(
        "ai.orchestrator.handoff_confirmation.invalid",
        {
          action: "ai.orchestrator.handoff_confirmation.invalid",
          clientId: tenantClientId || null,
          clientKey: tenantClientKey || null,
          retryCount: nextRetryCount,
          awaitingConfirmation: !shouldClosePrompt,
        } as Prisma.InputJsonValue,
        normalizedFrom,
        message.messageId
      );
      if (allowlistHit && env.outboundEnabled && env.OUTBOUND_TEXT_ENABLED) {
        const result = await sendOutboundText({
          toE164: env.WHATSAPP_SANDBOX ? env.WHATSAPP_SANDBOX_TO || normalizedFrom : message.from,
          waId: normalizedFrom,
          intent: updatedConversation.intent,
          messageId: `ai.handoff.invalid.${message.messageId}`,
          replyText: shouldClosePrompt
            ? "Tudo bem. Vou continuar te orientando por aqui."
            : "Só para confirmar: você deseja falar com uma pessoa da equipe?",
          guard: inboundGuard,
        });
        if (result.ok) {
          updatedConversation = await persistOutboundConversation(
            updatedConversation,
            result.messageId
          );
        }
      }
      continue;
      }
    }
    const activePendingOffer = updatedConversation.answers?.aiOrchestrator?.pendingOffer;
    if (
      activePendingOffer &&
      activePendingOffer.type !== "none" &&
      activePendingOffer.type !== "handoff"
    ) {
      updatedConversation = {
        ...updatedConversation,
        answers: {
          ...(updatedConversation.answers ?? {}),
          aiOrchestrator: {
            ...(updatedConversation.answers?.aiOrchestrator ?? {}),
            pendingOffer: {
              type: "none",
              promptedAt: new Date().toISOString(),
              messageId: message.messageId,
              retryCount: activePendingOffer.retryCount ?? 0,
            },
          },
        },
      };
      logger.info({
        event: "ai.turn.pending_offer.consumed",
        clientId: tenantClientId,
        clientKey: tenantClientKey,
        waId: maskNumber(normalizedFrom),
        offerType: activePendingOffer.type,
        decision: "legacy_cleared",
        route: "continue_processing",
        requestId: meta?.requestId,
      });
      await persistEventSafe(
        "ai.turn.pending_offer.consumed",
        {
          action: "ai.turn.pending_offer.consumed",
          clientId: tenantClientId || null,
          clientKey: tenantClientKey || null,
          offerType: activePendingOffer.type,
          decision: "legacy_cleared",
        } as Prisma.InputJsonValue,
        normalizedFrom,
        message.messageId
      );
    }
    const wasPending = currentConversation.handoff.status === "pending";
    const hasConfigurableChatbotFlow = Boolean(
      await loadChatbotFlowForConversation(updatedConversation, message.text)
    );
    const inboundIntent = detectIntent(message.text);
    const shouldRunLegacyHandoff =
      !supervisedAiHandoffEnabled && (wasPending || !hasConfigurableChatbotFlow);
    if (supervisedAiHandoffEnabled && inboundIntent === "handoff") {
      logger.info({
        event: "ai.orchestrator.handoff_legacy_blocked",
        clientId: tenantClientId,
        clientKey: tenantClientKey,
        waId: maskNumber(normalizedFrom),
        reason: "supervised_ai_handoff_enabled",
        route: meta?.route,
        method: meta?.method,
        requestId: meta?.requestId,
      });
      await persistEventSafe(
        "ai.orchestrator.handoff_legacy_blocked",
        {
          action: "ai.orchestrator.handoff_legacy_blocked",
          clientId: tenantClientId || null,
          clientKey: tenantClientKey || null,
          reason: "supervised_ai_handoff_enabled",
        } as Prisma.InputJsonValue,
        normalizedFrom,
        message.messageId
      );
      logger.info({
        event: "ai.orchestrator.handoff_unified",
        clientId: tenantClientId,
        clientKey: tenantClientKey,
        waId: maskNumber(normalizedFrom),
        reason: "explicit_human_request_routed_to_orchestrator",
        route: meta?.route,
        method: meta?.method,
        requestId: meta?.requestId,
      });
      await persistEventSafe(
        "ai.orchestrator.handoff_unified",
        {
          action: "ai.orchestrator.handoff_unified",
          clientId: tenantClientId || null,
          clientKey: tenantClientKey || null,
          reason: "explicit_human_request_routed_to_orchestrator",
        } as Prisma.InputJsonValue,
        normalizedFrom,
        message.messageId
      );
    }
    if (!shouldRunLegacyHandoff && inboundIntent === "handoff" && !supervisedAiHandoffEnabled) {
      logger.info({
        event: "handoff.legacy.skipped_configurable_chatbot",
        clientId: tenantClientId,
        clientKey: tenantClientKey,
        waId: maskNumber(normalizedFrom),
        reason: "chatbot_flow_available",
        route: meta?.route,
        method: meta?.method,
        requestId: meta?.requestId,
      });
    }
    const handoffResult = shouldRunLegacyHandoff
      ? handleHandoff(
          updatedConversation,
          message.text,
          message.timestamp
        )
      : { state: updatedConversation, handled: false };
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
        if (updatedConversation.mode !== "HUMAN") {
          logger.warn({
            event: "ai.orchestrator.invalid_state_detected",
            clientId: tenantClientId,
            clientKey: tenantClientKey,
            waId: maskNumber(normalizedFrom),
            reason: "legacy_handoff_acceptance_without_human_mode",
            mode: updatedConversation.mode,
            handoffStatus: updatedConversation.handoff.status,
            requestId: meta?.requestId,
          });
          await persistEventSafe(
            "ai.orchestrator.invalid_state_detected",
            {
              action: "ai.orchestrator.invalid_state_detected",
              clientId: tenantClientId || null,
              clientKey: tenantClientKey || null,
              reason: "legacy_handoff_acceptance_without_human_mode",
              mode: updatedConversation.mode,
              handoffStatus: updatedConversation.handoff.status,
            } as Prisma.InputJsonValue,
            normalizedFrom,
            message.messageId
          );
        }
        updatedConversation = await ensurePendingHandoffRouting({
          ...clearChatbotRuntime(updatedConversation),
          mode: "HUMAN" as const,
          assignedUserId: null,
          assignedTo: null,
          assignedAt: null,
          status: "WAITING",
          closedAt: null,
        });
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

    if (isChatbotDisabledForTenant() && (updatedConversation.chatbotActive || updatedConversation.chatbotNodeId)) {
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
      pendingHandoff?: {
        feedbackText: string;
        summary: string;
        suggestedReply: string;
        tags: string[];
        nodeId: string;
      };
    } = {
      handled: false,
      state: updatedConversation,
      replyText: undefined as string | undefined,
      flowId: null as string | null,
      pendingHandoff: undefined as
        | {
            feedbackText: string;
            summary: string;
            suggestedReply: string;
            tags: string[];
            nodeId: string;
          }
        | undefined,
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
          let chatbotStartNodeId: string | undefined;
          let shouldDeferInitialMenuToAssistant = false;
          const intentClassifierEnabled =
            env.FLOW_INTENT_CLASSIFIER_ENABLED &&
            appliedTenantConfig?.disableIntentClassifier !== true;
          if (
            !updatedConversation.chatbotActive &&
            !updatedConversation.chatbotNodeId &&
            message.text &&
            env.AI_ASSISTANT_ENABLED &&
            env.WHATSAPP_AI_ENABLED &&
            appliedTenantConfig?.aiAssistantEnabled === true &&
            !isAiFallbackDisabledForTenant() &&
            !env.WHATSAPP_SANDBOX &&
            (supervisedAiHandoffEnabled || updatedConversation.intent !== "handoff") &&
            updatedConversation.mode !== "HUMAN" &&
            updatedConversation.handoff.status === "none" &&
            isWindowOpen(updatedConversation, Date.now())
          ) {
            const preClassifierRisk = classifyRisk(message.text, {
              tenantName: appliedTenantConfig.name,
              aiBusinessContext: appliedTenantConfig.aiBusinessContext,
              defaultLanguage: appliedTenantConfig.defaultLanguage,
              flowContext: updatedConversation.answers?.flowContext,
              flowTags: updatedConversation.answers?.flowTags,
            });
            const preClassifierEducationalIntent = classifyEducationalIntent(message.text, {
              allowedTopics: appliedTenantConfig.aiAssistantAllowedTopics,
              blockedTerms: appliedTenantConfig.aiAssistantBlockedTerms,
            });
            const preClassifierHandoffRequest = supervisedAiHandoffEnabled
              ? classifyAssistantFallback(message.text, {
                  handoffKeywords: appliedTenantConfig.aiAssistantHandoffKeywords,
                })?.intent === "handoff_prompt"
              : false;
            const preClassifierContextualFallback = classifyContextualFallback(message.text, {
              aiAssistantAllowedTopics: appliedTenantConfig.aiAssistantAllowedTopics,
              aiAssistantSecondaryTopics: appliedTenantConfig.aiAssistantSecondaryTopics,
            });
            const preClassifierContextualFallbackAllowed =
              preClassifierContextualFallback.type === "greeting" ||
              preClassifierContextualFallback.type === "negative" ||
              preClassifierContextualFallback.type === "help" ||
              preClassifierContextualFallback.type === "clarification" ||
              preClassifierContextualFallback.type === "near_domain";
            if (
              preClassifierRisk ||
              preClassifierEducationalIntent.allowed ||
              preClassifierHandoffRequest ||
              preClassifierContextualFallbackAllowed
            ) {
              shouldDeferInitialMenuToAssistant = true;
              logger.info({
                event: "chatbot.initial_menu.deferred_to_ai",
                clientId: tenantClientId,
                clientKey: tenantClientKey,
                flowId: chatbotFlow.id,
                waId: maskNumber(normalizedFrom),
                reason: preClassifierRisk
                  ? "guardrail_before_initial_menu"
                  : preClassifierHandoffRequest
                    ? "handoff_request_before_initial_menu"
                    : preClassifierEducationalIntent.allowed
                      ? "educational_question_before_initial_menu"
                      : "contextual_fallback_before_initial_menu",
                risk: preClassifierRisk,
                educationalReason: preClassifierEducationalIntent.reason ?? null,
                educationalTopic: preClassifierEducationalIntent.topic ?? null,
                contextualFallbackType: preClassifierContextualFallback.type,
                contextualFallbackReason: preClassifierContextualFallback.reason,
                stage: "before_intent_classifier",
                requestId: meta?.requestId,
              });
            }
          }
          if (intentClassifierEnabled && !shouldDeferInitialMenuToAssistant) {
            if (updatedConversation.mode === "HUMAN") {
              logger.info({
                event: "flow.intent_classifier.skipped_human_mode",
                clientId: tenantClientId,
                clientKey: tenantClientKey,
                waId: maskNumber(normalizedFrom),
                requestId: meta?.requestId,
              });
            } else if (updatedConversation.chatbotActive || updatedConversation.chatbotNodeId) {
              const initialAwaitingNodeId = getInitialChatbotAwaitingNodeId(validatedDefinition.definition);
              const isAtInitialAwaitingNode =
                updatedConversation.chatbotActive === true &&
                updatedConversation.chatbotNodeId === initialAwaitingNodeId;
              const isMenuChoice = typeof message.text === "string" && /^\s*\d+\s*$/.test(message.text);
              if (isAtInitialAwaitingNode && !isMenuChoice) {
                logger.info({
                  event: "flow.intent_classifier.checked",
                  clientId: tenantClientId,
                  clientKey: tenantClientKey,
                  flowId: chatbotFlow.id,
                  waId: maskNumber(normalizedFrom),
                  reason: "initial_menu_free_text",
                  nodeId: updatedConversation.chatbotNodeId,
                  requestId: meta?.requestId,
                });
                const classification = classifyFreeTextFlowIntent(message.text);
                if (!classification) {
                  logger.info({
                    event: "flow.intent_classifier.no_match",
                    clientId: tenantClientId,
                    clientKey: tenantClientKey,
                    flowId: chatbotFlow.id,
                    waId: maskNumber(normalizedFrom),
                    reason: "no_keyword_match",
                    requestId: meta?.requestId,
                  });
                } else if (!validatedDefinition.definition.nodes[classification.targetNode]) {
                  logger.info({
                    event: "flow.intent_classifier.no_match",
                    clientId: tenantClientId,
                    clientKey: tenantClientKey,
                    flowId: chatbotFlow.id,
                    waId: maskNumber(normalizedFrom),
                    intent: classification.intent,
                    targetNode: classification.targetNode,
                    reason: "target_node_missing",
                    requestId: meta?.requestId,
                  });
                } else {
                  const context = applyFlowIntentClassificationToContext({
                    currentContext: updatedConversation.answers?.flowContext,
                    currentTags: updatedConversation.answers?.flowTags,
                    classification,
                  });
                  updatedConversation = {
                    ...updatedConversation,
                    answers: {
                      ...(updatedConversation.answers ?? {}),
                      flowContext: context.flowContext,
                      flowTags: context.flowTags,
                    },
                  };
                  chatbotStartNodeId = classification.targetNode;
                  logger.info({
                    event: "flow.intent_classifier.matched",
                    clientId: tenantClientId,
                    clientKey: tenantClientKey,
                    flowId: chatbotFlow.id,
                    waId: maskNumber(normalizedFrom),
                    intent: classification.intent,
                    matchedTerms: classification.matchedTerms,
                    targetNode: classification.targetNode,
                    confidence: classification.confidence,
                    score: classification.score,
                    requestId: meta?.requestId,
                  });
                  if (classification.conflictedIntents.length > 0) {
                    logger.info({
                      event: "flow.intent_classifier.conflict_resolved",
                      clientId: tenantClientId,
                      clientKey: tenantClientKey,
                      flowId: chatbotFlow.id,
                      waId: maskNumber(normalizedFrom),
                      intent: classification.intent,
                      conflictedIntents: classification.conflictedIntents,
                      targetNode: classification.targetNode,
                      reason: "priority_order",
                      requestId: meta?.requestId,
                    });
                  }
                  logger.info({
                    event: "flow.intent_classifier.routed",
                    clientId: tenantClientId,
                    clientKey: tenantClientKey,
                    flowId: chatbotFlow.id,
                    waId: maskNumber(normalizedFrom),
                    intent: classification.intent,
                    targetNode: classification.targetNode,
                    requestId: meta?.requestId,
                  });
                }
              } else {
              logger.info({
                event: "flow.intent_classifier.skipped_active_flow",
                clientId: tenantClientId,
                clientKey: tenantClientKey,
                waId: maskNumber(normalizedFrom),
                active: updatedConversation.chatbotActive ?? false,
                nodeId: updatedConversation.chatbotNodeId ?? null,
                reason: isMenuChoice ? "menu_choice" : "active_flow",
                requestId: meta?.requestId,
              });
              }
            } else {
              logger.info({
                event: "flow.intent_classifier.checked",
                clientId: tenantClientId,
                clientKey: tenantClientKey,
                flowId: chatbotFlow.id,
                waId: maskNumber(normalizedFrom),
                requestId: meta?.requestId,
              });
              const classification = classifyFreeTextFlowIntent(message.text);
              if (!classification) {
                logger.info({
                  event: "flow.intent_classifier.no_match",
                  clientId: tenantClientId,
                  clientKey: tenantClientKey,
                  flowId: chatbotFlow.id,
                  waId: maskNumber(normalizedFrom),
                  reason: "no_keyword_match",
                  requestId: meta?.requestId,
                });
              } else if (!validatedDefinition.definition.nodes[classification.targetNode]) {
                logger.info({
                  event: "flow.intent_classifier.no_match",
                  clientId: tenantClientId,
                  clientKey: tenantClientKey,
                  flowId: chatbotFlow.id,
                  waId: maskNumber(normalizedFrom),
                  intent: classification.intent,
                  targetNode: classification.targetNode,
                  reason: "target_node_missing",
                  requestId: meta?.requestId,
                });
              } else {
                const context = applyFlowIntentClassificationToContext({
                  currentContext: updatedConversation.answers?.flowContext,
                  currentTags: updatedConversation.answers?.flowTags,
                  classification,
                });
                updatedConversation = {
                  ...updatedConversation,
                  answers: {
                    ...(updatedConversation.answers ?? {}),
                    flowContext: context.flowContext,
                    flowTags: context.flowTags,
                  },
                };
                chatbotStartNodeId = classification.targetNode;
                logger.info({
                  event: "flow.intent_classifier.matched",
                  clientId: tenantClientId,
                  clientKey: tenantClientKey,
                  flowId: chatbotFlow.id,
                  waId: maskNumber(normalizedFrom),
                  intent: classification.intent,
                  matchedTerms: classification.matchedTerms,
                  targetNode: classification.targetNode,
                  confidence: classification.confidence,
                  score: classification.score,
                  requestId: meta?.requestId,
                });
                if (classification.conflictedIntents.length > 0) {
                  logger.info({
                    event: "flow.intent_classifier.conflict_resolved",
                    clientId: tenantClientId,
                    clientKey: tenantClientKey,
                    flowId: chatbotFlow.id,
                    waId: maskNumber(normalizedFrom),
                    intent: classification.intent,
                    conflictedIntents: classification.conflictedIntents,
                    targetNode: classification.targetNode,
                    reason: "priority_order",
                    requestId: meta?.requestId,
                  });
                }
                logger.info({
                  event: "flow.intent_classifier.routed",
                  clientId: tenantClientId,
                  clientKey: tenantClientKey,
                  flowId: chatbotFlow.id,
                  waId: maskNumber(normalizedFrom),
                  intent: classification.intent,
                  targetNode: classification.targetNode,
                  requestId: meta?.requestId,
                });
              }
            }
          }
          if (!shouldDeferInitialMenuToAssistant) {
            const chatbotResult = executeChatbotFlow({
              flowId: chatbotFlow.id,
              definition: validatedDefinition.definition,
              state: updatedConversation,
              inboundText: message.text,
              nowIso: message.timestamp,
              startNodeId: chatbotStartNodeId,
            });
            updatedConversation = chatbotResult.state;
            chatbotFlowResult = {
              handled: chatbotResult.handled,
              state: chatbotResult.state,
              replyText: chatbotResult.replyText,
              flowId: chatbotFlow.id,
              pendingHandoff: chatbotResult.pendingHandoff,
            };
            for (const event of chatbotResult.events ?? []) {
              logger.info({
                ...event,
                clientId: tenantClientId,
                clientKey: tenantClientKey,
                requestId: meta?.requestId,
              });
            }
            if (
              !chatbotResult.pendingHandoff &&
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
      departmentId: updatedConversation.departmentId ?? null,
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
    await notifyHandoffLeadArrivalOnRuntimeTransition({
      previousState: currentConversation,
      nextState: updatedConversation,
      messageId: message.messageId,
      receivedMedia: isWhatsAppInboundMediaMessage(message.type),
      reason: "runtime_handoff_transition",
    });
    updatedConversation = await sendRuntimeHandoffMediaNotice({
      previousState: currentConversation,
      nextState: updatedConversation,
      messageId: message.messageId,
      toE164: message.from,
      allowlistHit,
      receivedMedia: isWhatsAppInboundMediaMessage(message.type),
      replyAlreadyPlanned: Boolean(chatbotFlowResult.pendingHandoff && chatbotFlowResult.replyText?.trim()),
      guard: inboundGuard,
    });

    if (!allowlistHit) {
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

    if (chatbotFlowResult.pendingHandoff) {
      logger.info({
        event: "flow.handoff.triggered",
        clientId: tenantClientId,
        clientKey: tenantClientKey,
        flowId: chatbotFlowResult.flowId,
        waId: maskNumber(normalizedFrom),
        hasFeedbackText: Boolean(chatbotFlowResult.replyText?.trim()),
        requestId: meta?.requestId,
      });
      if (chatbotFlowResult.replyText?.trim() && env.outboundEnabled) {
        logger.info({
          event: "flow.handoff.feedback.sending",
          clientId: tenantClientId,
          clientKey: tenantClientKey,
          flowId: chatbotFlowResult.flowId,
          waId: maskNumber(normalizedFrom),
          messageId: message.messageId,
          requestId: meta?.requestId,
        });
        try {
          const feedbackResult = await sendOutboundText({
            toE164: env.WHATSAPP_SANDBOX ? env.WHATSAPP_SANDBOX_TO || normalizedFrom : message.from,
            waId: normalizedFrom,
            intent: updatedConversation.intent,
            messageId: `flow.handoff.feedback.${message.messageId}`,
            replyText: chatbotFlowResult.replyText,
            guard: inboundGuard,
          });
          if (feedbackResult.ok) {
            await storage.updateMessage(message.messageId, {
              status: "replied",
              repliedAt: new Date().toISOString(),
              replyType: "text",
            });
            logger.info({
              event: "flow.handoff.feedback.sent",
              clientId: tenantClientId,
              clientKey: tenantClientKey,
              flowId: chatbotFlowResult.flowId,
              waId: maskNumber(normalizedFrom),
              messageId: message.messageId,
              metaMessageId: feedbackResult.messageId,
              requestId: meta?.requestId,
            });
          } else {
            logger.error({
              event: "flow.handoff.feedback.failed",
              clientId: tenantClientId,
              clientKey: tenantClientKey,
              flowId: chatbotFlowResult.flowId,
              waId: maskNumber(normalizedFrom),
              messageId: message.messageId,
              status: feedbackResult.status,
              errorBody: feedbackResult.errorBody,
              requestId: meta?.requestId,
            });
          }
        } catch (error) {
          logger.error({
            event: "flow.handoff.feedback.failed",
            clientId: tenantClientId,
            clientKey: tenantClientKey,
            flowId: chatbotFlowResult.flowId,
            waId: maskNumber(normalizedFrom),
            messageId: message.messageId,
            error: (error as Error).message,
            requestId: meta?.requestId,
          });
        }
      } else if (chatbotFlowResult.replyText?.trim()) {
        logger.error({
          event: "flow.handoff.feedback.failed",
          clientId: tenantClientId,
          clientKey: tenantClientKey,
          flowId: chatbotFlowResult.flowId,
          waId: maskNumber(normalizedFrom),
          messageId: message.messageId,
          errorBody: "outbound_disabled",
          requestId: meta?.requestId,
        });
      }

      const handoffSummary = chatbotFlowResult.pendingHandoff.summary?.trim();
      if (handoffSummary && tenantClientId) {
        const summaryRequestId = [
          "flow-handoff-summary",
          chatbotFlowResult.flowId ?? "unknown",
          chatbotFlowResult.pendingHandoff.nodeId,
          normalizedFrom,
          message.messageId,
        ].join(":");
        try {
          const prisma = getPrisma();
          const event = await prisma.event.create({
            data: {
              clientId: tenantClientId,
              waId: updatedConversation.waId,
              waIdCanonical: canonicalizeBrazilWaId(updatedConversation.waId),
              messageId: message.messageId,
              requestId: summaryRequestId,
              eventName: "flow.handoff.summary.created",
              payloadJson: {
                action: "flow_handoff_summary_created",
                clientId: tenantClientId,
                clientKey: tenantClientKey,
                flowId: chatbotFlowResult.flowId,
                nodeId: chatbotFlowResult.pendingHandoff.nodeId,
                conversationKey: updatedConversation.conversationKey ?? null,
                tags: chatbotFlowResult.pendingHandoff.tags,
                summary: handoffSummary,
                timestamp: new Date().toISOString(),
              },
            },
          });
          const lead = await ensureLeadForConversation({
            tenantId: tenantClientId,
            waId: updatedConversation.waId,
            phoneNumberId: phoneNumberId ?? undefined,
          });
          await prisma.leadNote.create({
            data: {
              tenantId: tenantClientId,
              leadId: lead.id,
              body: `[Resumo automático]\n${handoffSummary}`,
            },
          });
          logger.info({
            event: "flow.handoff.summary.created",
            clientId: tenantClientId,
            clientKey: tenantClientKey,
            flowId: chatbotFlowResult.flowId,
            eventId: event.id,
            leadId: lead.id,
            waId: maskNumber(normalizedFrom),
            requestId: meta?.requestId,
          });
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          ) {
            logger.info({
              event: "flow.handoff.summary.deduped",
              clientId: tenantClientId,
              clientKey: tenantClientKey,
              flowId: chatbotFlowResult.flowId,
              waId: maskNumber(normalizedFrom),
              requestId: meta?.requestId,
            });
          } else {
            logger.error({
              event: "flow.handoff.summary.failed",
              clientId: tenantClientId,
              clientKey: tenantClientKey,
              flowId: chatbotFlowResult.flowId,
              waId: maskNumber(normalizedFrom),
              error: (error as Error).message,
              requestId: meta?.requestId,
            });
          }
        }
      }

      const suggestedReply = chatbotFlowResult.pendingHandoff.suggestedReply?.trim();
      if (suggestedReply && tenantClientId) {
        const suggestedReplyRequestId = [
          "flow-handoff-suggested-reply",
          chatbotFlowResult.flowId ?? "unknown",
          chatbotFlowResult.pendingHandoff.nodeId,
          normalizedFrom,
          message.messageId,
        ].join(":");
        try {
          const prisma = getPrisma();
          const existingSuggestedReplyEvent = await prisma.event.findUnique({
            where: {
              clientId_eventName_requestId: {
                clientId: tenantClientId,
                eventName: "flow.handoff.suggested_reply.created",
                requestId: suggestedReplyRequestId,
              },
            },
            select: { id: true },
          });
          if (existingSuggestedReplyEvent) {
            logger.info({
              event: "flow.handoff.suggested_reply.deduped",
              clientId: tenantClientId,
              clientKey: tenantClientKey,
              flowId: chatbotFlowResult.flowId,
              eventId: existingSuggestedReplyEvent.id,
              waId: maskNumber(normalizedFrom),
              requestId: meta?.requestId,
            });
          } else {
            const event = await prisma.event.create({
              data: {
                clientId: tenantClientId,
                waId: updatedConversation.waId,
                waIdCanonical: canonicalizeBrazilWaId(updatedConversation.waId),
                messageId: message.messageId,
                requestId: suggestedReplyRequestId,
                eventName: "flow.handoff.suggested_reply.created",
                payloadJson: {
                  action: "flow_handoff_suggested_reply_created",
                  clientId: tenantClientId,
                  clientKey: tenantClientKey,
                  flowId: chatbotFlowResult.flowId,
                  nodeId: chatbotFlowResult.pendingHandoff.nodeId,
                  conversationKey: updatedConversation.conversationKey ?? null,
                  tags: chatbotFlowResult.pendingHandoff.tags,
                  timestamp: new Date().toISOString(),
                },
              },
            });
            logger.info({
              event: "flow.handoff.suggested_reply.created",
              clientId: tenantClientId,
              clientKey: tenantClientKey,
              flowId: chatbotFlowResult.flowId,
              eventId: event.id,
              waId: maskNumber(normalizedFrom),
              requestId: meta?.requestId,
            });
          }
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          ) {
            logger.info({
              event: "flow.handoff.suggested_reply.deduped",
              clientId: tenantClientId,
              clientKey: tenantClientKey,
              flowId: chatbotFlowResult.flowId,
              waId: maskNumber(normalizedFrom),
              requestId: meta?.requestId,
            });
          } else {
            logger.error({
              event: "flow.handoff.suggested_reply.failed",
              clientId: tenantClientId,
              clientKey: tenantClientKey,
              flowId: chatbotFlowResult.flowId,
              waId: maskNumber(normalizedFrom),
              error: (error as Error).message,
              requestId: meta?.requestId,
            });
          }
        }
      }

      const activatedHandoff = activateHumanHandoff(
        clearChatbotRuntime(chatbotFlowResult.state),
        message.timestamp,
        chatbotFlowResult.pendingHandoff.feedbackText
      );
      updatedConversation = await ensurePendingHandoffRouting({
        ...activatedHandoff.state,
        mode: "HUMAN" as const,
        assignedUserId: null,
        assignedTo: null,
        assignedAt: null,
        status: "WAITING",
        closedAt: null,
      });
      await upsertConversationSafe(updatedConversation);
      await persistConversationSafe({
        waId: updatedConversation.waId,
        windowIsOpen: updatedConversation.window.isOpen,
        windowExpiresAt: updatedConversation.window.expiresAt,
        lastInboundAt: updatedConversation.lastInboundAt ?? null,
        lastOutboundAt: updatedConversation.lastOutboundAt ?? null,
        departmentId: updatedConversation.departmentId ?? null,
      });
      logger.info({
        event: "flow.handoff.mode_human.enabled",
        clientId: tenantClientId,
        clientKey: tenantClientKey,
        flowId: chatbotFlowResult.flowId,
        waId: maskNumber(normalizedFrom),
        handoffStatus: updatedConversation.handoff.status,
        mode: updatedConversation.mode,
        requestId: meta?.requestId,
      });
      if (tenantClientId) {
        publishRealtimeEvent({
          type: "conversation.handoff.updated",
          clientId: tenantClientId,
          waId: message.from,
          waIdCanonical: canonicalizeBrazilWaId(message.from),
          mode: "HUMAN",
          handoffStatus:
            updatedConversation.handoff.status === "pending" ||
            updatedConversation.handoff.status === "active"
              ? updatedConversation.handoff.status
              : "active",
          assignedUserId: updatedConversation.assignedUserId ?? null,
          departmentId: updatedConversation.departmentId ?? null,
          updatedAt: parseWebhookTimestampToDate(message.timestamp).toISOString(),
        });
      }
      await notifyHandoffLeadArrival({
        state: updatedConversation,
        source: "flow",
        messageId: message.messageId,
        reason: chatbotFlowResult.pendingHandoff.nodeId,
        crmSummary: handoffSummary,
      });
      if (tenantHandoffAttendantWaid && appliedTenantConfig?.handoffLeadNotificationEnabled !== true) {
        await notifyAttendantHumanRequested({
          attendantWaId: tenantHandoffAttendantWaid,
          leadWaId: normalizedFrom,
          snippet: message.text?.slice(0, 160).replace(/\s+/g, " ").trim() || "-",
          requestId: meta?.requestId,
        });
      }
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
            phoneNumberId: phoneNumberId ?? undefined,
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
      isChatbotDisabledForTenant() &&
      appliedTenantConfig?.disableLegacyFlows === true &&
      isAiFallbackDisabledForTenant();

    if (
      allAutomationLayersDisabled &&
      !demoReplyText &&
      !leadReplyText &&
      !flowReplyText &&
      !handoffResult.replyText
    ) {
      updatedConversation = await routeConversationToHumanQueue(updatedConversation, {
        reason: "automation_layers_disabled",
        timestamp: message.timestamp,
        messageId: message.messageId,
        toE164: message.from,
        allowlistHit,
        receivedMedia: isWhatsAppInboundMediaMessage(message.type),
        guard: inboundGuard,
      });
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

    const noAutomationReplyConfigured =
      hasResolvedTenantConfig &&
      !env.WHATSAPP_ECHO_ENABLED &&
      !demoReplyText &&
      !leadReplyText &&
      !flowReplyText &&
      !handoffResult.replyText &&
      !flowResult.handled &&
      !handoffResult.handled &&
      !demoHandled &&
      !hasDemoSignal &&
      !leadHandled;

    let replyText = demoReplyText ?? leadReplyText ?? flowReplyText ?? handoffResult.replyText ?? (env.WHATSAPP_ECHO_ENABLED
      ? message.type === "text" && message.text
        ? `ECO: ${message.text}`
        : `ECO: (mensagem ${message.type} recebida)`
      : env.WHATSAPP_DEFAULT_REPLY);
    let aiAssistantResponded = false;
    let aiOrchestratorNoReply = false;

    const toForReply = env.WHATSAPP_SANDBOX
      ? env.WHATSAPP_SANDBOX_TO || normalizedFrom
      : message.from;

    const demoAwaitingSchedule = (updatedConversation.demoStatus ?? "none") === "requested";
    const aiBusinessContext = appliedTenantConfig?.aiBusinessContext?.trim() ?? "";
    const aiAssistantConfigured = isAiAssistantConfigured(appliedTenantConfig);
      const logAiAssistantEvent = async (
        event: string,
        payload: Record<string, unknown> = {}
      ) => {
      const safePayload = {
        action: event,
        clientId: tenantClientId || null,
        clientKey: tenantClientKey || null,
        waId: maskNumber(normalizedFrom),
        messageId: message.messageId,
        ...payload,
      };
      logger.info({ event, requestId: meta?.requestId, ...safePayload });
      await persistEventSafe(event, safePayload as Prisma.InputJsonValue, normalizedFrom, message.messageId);
    };
    const logAiMemoryEvent = async (
      event: "ai.memory.updated" | "ai.memory.used" | "ai.memory.compacted",
      payload: Record<string, unknown> = {}
    ) => {
      const safePayload = {
        action: event,
        clientId: tenantClientId || null,
        clientKey: tenantClientKey || null,
        waId: maskNumber(normalizedFrom),
        messageId: message.messageId,
        ...payload,
      };
      logger.info({ event, requestId: meta?.requestId, ...safePayload });
      await persistEventSafe(event, safePayload as Prisma.InputJsonValue, normalizedFrom, message.messageId);
    };

    if (
      env.AI_ASSISTANT_ENABLED &&
      env.WHATSAPP_AI_ENABLED &&
      appliedTenantConfig?.aiAssistantEnabled === true &&
      !aiAssistantConfigured
    ) {
      await logAiAssistantEvent("ai.assistant.config_missing", {
        hasBusinessContext: Boolean(appliedTenantConfig.aiBusinessContext?.trim()),
        hasAllowedTopics: Boolean(appliedTenantConfig.aiAssistantAllowedTopics?.length),
        hasFallbackMessage: Boolean(appliedTenantConfig.aiAssistantFallbackMessage?.trim()),
        hasHandoffPrompt: Boolean(appliedTenantConfig.aiAssistantHandoffPrompt?.trim()),
      });
    }

    if (
      !leadHandled &&
      !flowResult.handled &&
      !handoffResult.handled &&
      !demoHandled &&
      !hasDemoSignal &&
      !leadHandled &&
      !demoAwaitingSchedule &&
      env.AI_ASSISTANT_ENABLED &&
      env.WHATSAPP_AI_ENABLED &&
      appliedTenantConfig?.aiAssistantEnabled === true &&
      !isAiFallbackDisabledForTenant() &&
      !env.WHATSAPP_SANDBOX &&
      replyType === "text" &&
      (supervisedAiHandoffEnabled || updatedConversation.intent !== "handoff") &&
      updatedConversation.mode !== "HUMAN" &&
      updatedConversation.handoff.status === "none" &&
      !updatedConversation.chatbotActive &&
      !updatedConversation.chatbotNodeId &&
      message.text
    ) {
      const start = Date.now();
      await logAiAssistantEvent("ai.assistant.domain_loaded", {
        allowedTopicCount: appliedTenantConfig.aiAssistantAllowedTopics?.length ?? 0,
        intentCatalogCount: appliedTenantConfig.aiAssistantIntentCatalog?.length ?? 0,
        blockedTermCount: appliedTenantConfig.aiAssistantBlockedTerms?.length ?? 0,
        handoffKeywordCount: appliedTenantConfig.aiAssistantHandoffKeywords?.length ?? 0,
        hasFallbackMessage: Boolean(appliedTenantConfig.aiAssistantFallbackMessage?.trim()),
        hasHandoffPrompt: Boolean(appliedTenantConfig.aiAssistantHandoffPrompt?.trim()),
      });
      const assistantState = getAiAssistantState(updatedConversation);
      const maxReplies = Math.max(0, appliedTenantConfig.aiAssistantMaxReplies ?? 2);
      const assistantQuestionOptions = {
        allowedTopics: appliedTenantConfig.aiAssistantAllowedTopics,
        blockedTerms: appliedTenantConfig.aiAssistantBlockedTerms,
      };
      const assistantTenantContext = {
        tenantName: appliedTenantConfig.name,
        aiBusinessContext,
        defaultLanguage: appliedTenantConfig.defaultLanguage,
        flowContext: updatedConversation.answers?.flowContext,
        flowTags: updatedConversation.answers?.flowTags,
        handoffPrompt: appliedTenantConfig.aiAssistantHandoffPrompt,
        fallbackMessage: appliedTenantConfig.aiAssistantFallbackMessage,
        greetingMessage: appliedTenantConfig.aiAssistantGreetingMessage,
        allowedTopics: appliedTenantConfig.aiAssistantAllowedTopics,
        secondaryTopics: appliedTenantConfig.aiAssistantSecondaryTopics,
        intentCatalog: appliedTenantConfig.aiAssistantIntentCatalog,
      };
      const applyAiMemoryUpdate = async (input: {
        topic?: string | null;
        stage?: string | null;
        goal?: string | null;
        leadTemp?: "quente" | "morno" | "frio" | null;
        priority?: "alta" | "media" | "baixa" | null;
        wantsHuman?: boolean;
        handoffRecommended?: boolean;
        guardrailRisk?: Parameters<typeof updateAiMemory>[0]["guardrailRisk"];
        source: string;
      }) => {
        const result = updateAiMemory({
          state: updatedConversation,
          nowIso: new Date().toISOString(),
          topic: input.topic,
          stage: input.stage,
          goal: input.goal,
          flowContext: updatedConversation.answers?.flowContext,
          leadTemp: input.leadTemp,
          priority: input.priority,
          wantsHuman: input.wantsHuman,
          handoffRecommended: input.handoffRecommended,
          guardrailRisk: input.guardrailRisk,
        });
        if (!result.updated) return result;
        updatedConversation = {
          ...updatedConversation,
          answers: {
            ...(updatedConversation.answers ?? {}),
            aiMemory: result.memory,
          },
        };
        await logAiMemoryEvent("ai.memory.updated", {
          source: input.source,
          topic: input.topic ?? null,
          stage: input.stage ?? null,
          topicCount: result.memory.lastTopics?.length ?? 0,
          factKeys: Object.keys(result.memory.facts ?? {}),
          hasSummary: Boolean(result.memory.summary),
        });
        if (result.compacted) {
          await logAiMemoryEvent("ai.memory.compacted", {
            source: input.source,
            topicCount: result.memory.lastTopics?.length ?? 0,
            summaryLength: result.memory.summary?.length ?? 0,
          });
        }
        return result;
      };
      const applyAssistantLimitFallback = async (source: string) => {
        const canOfferHandoff = appliedTenantConfig.aiAssistantFallbackToHandoff === true;
        replyText = buildAssistantLimitReachedReply({
          context: assistantTenantContext,
          canOfferHandoff,
        });
        aiAssistantResponded = true;
        await applyAiMemoryUpdate({
          topic: "assistant_limit_reached",
          stage: canOfferHandoff ? "handoff_recommended" : "clarification",
          goal: canOfferHandoff ? "recommend_handoff" : "identify_need",
          wantsHuman: canOfferHandoff,
          handoffRecommended: canOfferHandoff,
          source,
        });
        const previousAiOrchestrator = updatedConversation.answers?.aiOrchestrator;
        const nowIso = new Date().toISOString();
        updatedConversation = {
          ...updatedConversation,
          answers: {
            ...(updatedConversation.answers ?? {}),
            aiAssistant: {
              count: assistantState.count,
              lastRespondedAt: nowIso,
              lastMessageId: message.messageId,
              lastFallbackType: assistantState.lastFallbackType,
              lastFallbackAt: assistantState.lastFallbackAt,
              fallbackCount: assistantState.fallbackCount,
            },
            aiOrchestrator: {
              ...(previousAiOrchestrator ?? {}),
              stage: canOfferHandoff ? "handoff_recommended" : "clarification",
              goal: canOfferHandoff ? "recommend_handoff" : "identify_need",
              missingInformation: previousAiOrchestrator?.missingInformation ?? [],
              lastAction: canOfferHandoff ? "handoff_recommend" : "fallback_menu",
              lastConfidence: previousAiOrchestrator?.lastConfidence ?? 1,
              handoffRecommended: canOfferHandoff,
              lastMessageId: message.messageId,
              lastQuestion: null,
              lastNextActionAt: nowIso,
              handoffPrompt: canOfferHandoff
                ? {
                    prompted: true,
                    promptedAt: nowIso,
                    messageId: message.messageId,
                    reason: "assistant_limit_reached",
                    score: 3,
                    awaitingConfirmation: true,
                  }
                : previousAiOrchestrator?.handoffPrompt,
              pendingOffer: canOfferHandoff
                ? {
                    type: "handoff",
                    promptedAt: nowIso,
                    messageId: message.messageId,
                    retryCount: 0,
                  }
                : previousAiOrchestrator?.pendingOffer,
              activePrompt: canOfferHandoff
                ? {
                    type: "handoff_confirmation",
                    expected: "yes_no",
                    createdAt: nowIso,
                    messageId: message.messageId,
                    retryCount: 0,
                  }
                : previousAiOrchestrator?.activePrompt,
            },
          },
        };
        await logAiAssistantEvent("ai.assistant.limit_fallback_sent", {
          source,
          count: assistantState.count,
          maxReplies,
          countConsumed: false,
          handoffPrompt: canOfferHandoff,
        });
        if (canOfferHandoff) {
          await logAiAssistantEvent("ai.orchestrator.handoff_prompt.sent", {
            source,
            reason: "assistant_limit_reached",
            score: 3,
            threshold: 3,
            promptType: "confirmation",
          });
          await logAiAssistantEvent("ai.orchestrator.handoff_prompt.awaiting_confirmation", {
            source,
            reason: "assistant_limit_reached",
            score: 3,
            messageId: message.messageId,
          });
        } else {
          await logAiAssistantEvent("ai.orchestrator.fallback_menu", {
            source,
            reason: "assistant_limit_reached",
          });
        }
        await logAiAssistantEvent("ai.assistant.responded", {
          source,
          latency_ms: Date.now() - start,
          count: assistantState.count,
          maxReplies,
          countConsumed: false,
        });
      };
      try {
        if (assistantState.lastMessageId === message.messageId) {
          await logAiAssistantEvent("ai.orchestrator.skipped", { reason: "duplicate_message" });
          await logAiAssistantEvent("ai.assistant.skipped", { reason: "duplicate_message" });
        } else if (!isWindowOpen(updatedConversation, Date.now())) {
          await logAiAssistantEvent("ai.orchestrator.skipped", { reason: "window_closed" });
          await logAiAssistantEvent("ai.assistant.skipped", { reason: "window_closed" });
        } else {
          const risk = classifyRisk(message.text, assistantTenantContext);
          const preQualificationTenantIntent = !risk
            ? resolveTenantIntent(message.text, appliedTenantConfig.aiAssistantIntentCatalog, {
                preferredTopics: [
                  resolveContextualContinuationTopic(updatedConversation),
                  updatedConversation.answers?.aiMemory?.lastTopics?.[0],
                  updatedConversation.answers?.flowContext?.servico,
                  updatedConversation.answers?.flowContext?.intent,
                ],
              })
            : null;
          const shouldBypassQualificationForTenantIntent =
            preQualificationTenantIntent?.preQualification === true;
          let qualificationHandled = false;
          if (
            !risk &&
            !shouldBypassQualificationForTenantIntent &&
            appliedTenantConfig.aiQualification?.enabled === true
          ) {
            const qualificationResult = handleQualificationTurn({
              schema: appliedTenantConfig.aiQualification,
              state: updatedConversation.answers?.aiQualification,
              text: message.text,
              handoffKeywords: appliedTenantConfig.aiAssistantHandoffKeywords,
              nowIso: new Date().toISOString(),
            });
            for (const entry of qualificationResult.logs) {
              await logAiAssistantEvent(entry.event, entry.payload);
            }
            if (qualificationResult.state) {
              updatedConversation = {
                ...updatedConversation,
                answers: {
                  ...(updatedConversation.answers ?? {}),
                  aiQualification: qualificationResult.state,
                },
              };
              const qualificationCrm = buildQualificationCrmArtifacts({
                state: qualificationResult.state,
                schema: appliedTenantConfig.aiQualification,
                answers: updatedConversation.answers,
                nowIso: new Date().toISOString(),
              });
              const hasCrmContextEnrichment =
                Boolean(qualificationCrm.flowContextPatch) || Boolean(qualificationCrm.flowTagsToAdd?.length);
              if (hasCrmContextEnrichment) {
                const currentTags = Array.isArray(updatedConversation.answers?.flowTags)
                  ? updatedConversation.answers.flowTags
                  : [];
                const nextTags = [...currentTags];
                for (const tag of qualificationCrm.flowTagsToAdd ?? []) {
                  if (!nextTags.includes(tag)) nextTags.push(tag);
                }
                updatedConversation = {
                  ...updatedConversation,
                  answers: {
                    ...(updatedConversation.answers ?? {}),
                    flowContext: {
                      ...(updatedConversation.answers?.flowContext ?? {}),
                      ...(qualificationCrm.flowContextPatch ?? {}),
                    },
                    flowTags: nextTags,
                  },
                };
                await logAiAssistantEvent("ai.qualification.crm_enriched", {
                  changedFields: Object.keys(qualificationCrm.flowContextPatch ?? {}),
                  tagCount: qualificationCrm.flowTagsToAdd?.length ?? 0,
                  summaryLineCount: qualificationCrm.summaryLines?.length ?? 0,
                  hasNextStep: Boolean(qualificationCrm.nextStep),
                });
                if (qualificationCrm.conflicts?.length) {
                  await logAiAssistantEvent("ai.qualification.crm_conflict", {
                    fields: qualificationCrm.conflicts,
                  });
                }
              }
              if (qualificationCrm.leadPatch) {
                await upsertLeadFromCapture({
                  tenantId: tenantClientId,
                  waId: message.from,
                  name: qualificationCrm.leadPatch.name,
                  email: qualificationCrm.leadPatch.email,
                  company: qualificationCrm.leadPatch.company,
                  service: qualificationCrm.leadPatch.service,
                  phoneNumberId: phoneNumberId ?? undefined,
                });
                await logAiAssistantEvent("ai.qualification.lead_enriched", {
                  fields: Object.keys(qualificationCrm.leadPatch),
                });
              } else if (!hasCrmContextEnrichment) {
                await logAiAssistantEvent("ai.qualification.crm_skipped", {
                  reason: qualificationCrm.skippedReason ?? "no_safe_slots",
                });
              }
            }
            if (qualificationResult.replyText) {
              if (assistantState.count >= maxReplies) {
                await logAiAssistantEvent("ai.assistant.limit_reached", {
                  count: assistantState.count,
                  maxReplies,
                  source: "qualification",
                });
                await applyAssistantLimitFallback("qualification");
                qualificationHandled = true;
              } else {
                const nowIso = new Date().toISOString();
                replyText = qualificationResult.replyText;
                aiAssistantResponded = true;
                qualificationHandled = true;
                updatedConversation = {
                  ...updatedConversation,
                  answers: {
                    ...(updatedConversation.answers ?? {}),
                    aiAssistant: {
                      count: assistantState.count + 1,
                      lastRespondedAt: nowIso,
                      lastMessageId: message.messageId,
                      lastFallbackType: assistantState.lastFallbackType,
                      lastFallbackAt: assistantState.lastFallbackAt,
                      fallbackCount: assistantState.fallbackCount,
                    },
                  },
                };
                await logAiAssistantEvent("ai.assistant.responded", {
                  source: "qualification",
                  latency_ms: Date.now() - start,
                  count: assistantState.count + 1,
                  maxReplies,
                });
              }
            } else if (qualificationResult.state?.readyForHandoff === true) {
              await logAiAssistantEvent("ai.qualification.handoff_ready", {
                stage: qualificationResult.state.stage ?? null,
                completedSlotCount: qualificationResult.state.completedSlots?.length ?? 0,
                missingSlotCount: qualificationResult.state.missingSlots?.length ?? 0,
              });
              const shouldPrompt = shouldSendHandoffConfirmationPrompt({
                allowed: true,
                state: updatedConversation,
                messageId: message.messageId,
              });
              if (shouldPrompt) {
                if (assistantState.count >= maxReplies) {
                  await logAiAssistantEvent("ai.assistant.limit_reached", {
                    count: assistantState.count,
                    maxReplies,
                    source: "qualification_handoff_ready",
                  });
                  await applyAssistantLimitFallback("qualification_handoff_ready");
                  qualificationHandled = true;
                } else {
                  const nowIso = new Date().toISOString();
                  replyText = buildHandoffConfirmationPrompt({
                    context: assistantTenantContext,
                  });
                  aiAssistantResponded = true;
                  qualificationHandled = true;
                  updatedConversation = {
                    ...updatedConversation,
                    answers: {
                      ...(updatedConversation.answers ?? {}),
                      aiAssistant: {
                        count: assistantState.count + 1,
                        lastRespondedAt: nowIso,
                        lastMessageId: message.messageId,
                        lastFallbackType: assistantState.lastFallbackType,
                        lastFallbackAt: assistantState.lastFallbackAt,
                        fallbackCount: assistantState.fallbackCount,
                      },
                      aiOrchestrator: {
                        ...(updatedConversation.answers?.aiOrchestrator ?? {}),
                        stage: "handoff_recommended",
                        goal: "recommend_handoff",
                        lastAction: "handoff_recommend",
                        lastConfidence: 1,
                        handoffRecommended: true,
                        lastMessageId: message.messageId,
                        lastQuestion: null,
                        lastNextActionAt: nowIso,
                        handoffPrompt: {
                          prompted: true,
                          promptedAt: nowIso,
                          messageId: message.messageId,
                          reason: "qualification_handoff_ready",
                          score: 3,
                          awaitingConfirmation: true,
                        },
                        pendingOffer: {
                          type: "handoff",
                          promptedAt: nowIso,
                          messageId: message.messageId,
                          retryCount: 0,
                        },
                        activePrompt: {
                          type: "handoff_confirmation",
                          expected: "yes_no",
                          createdAt: nowIso,
                          messageId: message.messageId,
                          retryCount: 0,
                        },
                      },
                    },
                  };
                  await logAiAssistantEvent("ai.qualification.handoff_prompt.sent", {
                    reason: "qualification_handoff_ready",
                    promptType: "confirmation",
                  });
                  await logAiAssistantEvent("ai.turn.pending_offer.created", {
                    type: "handoff",
                    source: "qualification",
                    reason: "qualification_handoff_ready",
                  });
                  await logAiAssistantEvent("ai.orchestrator.handoff_prompt.sent", {
                    source: "qualification",
                    reason: "qualification_handoff_ready",
                    score: 3,
                    threshold: 3,
                    promptType: "confirmation",
                  });
                  await logAiAssistantEvent("ai.orchestrator.handoff_prompt.awaiting_confirmation", {
                    source: "qualification",
                    reason: "qualification_handoff_ready",
                    score: 3,
                    messageId: message.messageId,
                  });
                  await logAiAssistantEvent("ai.qualification.turn_consumed", {
                    reason: "handoff_ready_prompt_sent",
                  });
                  await logAiAssistantEvent("ai.assistant.responded", {
                    source: "qualification_handoff_ready",
                    latency_ms: Date.now() - start,
                    count: assistantState.count + 1,
                    maxReplies,
                  });
                }
              } else {
                qualificationHandled = true;
                await logAiAssistantEvent("ai.qualification.turn_consumed", {
                  reason: "handoff_ready_prompt_already_pending",
                });
              }
            }
          }
          const continuationTopicForIntent = resolveContextualContinuationTopic(updatedConversation);
          const directEducationalIntent = classifyEducationalIntent(message.text, assistantQuestionOptions);
          const contextualEducationalIntent =
            !directEducationalIntent.allowed && continuationTopicForIntent
              ? classifyEducationalIntent(
                  `${message.text} ${continuationTopicForIntent}`,
                  assistantQuestionOptions
                )
              : null;
          const educationalIntent = contextualEducationalIntent?.allowed
            ? {
                ...contextualEducationalIntent,
                topic: continuationTopicForIntent ?? undefined,
                reason: "contextual_topic_and_allowed_intent",
              }
            : directEducationalIntent;
          if (!risk) {
            await logAiAssistantEvent("ai.guardrail.skipped", { reason: "no_risk" });
          }
          if (!qualificationHandled && educationalIntent.allowed) {
            await logAiAssistantEvent("ai.assistant.educational_routed", {
              topic: educationalIntent.topic ?? null,
              reason: educationalIntent.reason ?? null,
            });
          }
          const fallbackDecision = !risk && !qualificationHandled
            ? classifyAssistantFallback(message.text, {
                handoffKeywords: appliedTenantConfig.aiAssistantHandoffKeywords,
              })
            : null;
          const hasFormalHandoffPromptForIntent =
            updatedConversation.answers?.aiOrchestrator?.activePrompt?.type ===
              "handoff_confirmation" ||
            updatedConversation.answers?.aiOrchestrator?.handoffPrompt?.awaitingConfirmation ===
              true;
          const contextualAckForIntent = isContextualAck(message.text);
          const shouldSkipCatalogForTurn =
            fallbackDecision?.intent === "handoff_prompt" ||
            (contextualAckForIntent && !hasFormalHandoffPromptForIntent);
          const tenantIntent = !risk && !qualificationHandled && !shouldSkipCatalogForTurn
            ? preQualificationTenantIntent ??
              resolveTenantIntent(message.text, appliedTenantConfig.aiAssistantIntentCatalog, {
                  preferredTopics: [
                    resolveContextualContinuationTopic(updatedConversation),
                    updatedConversation.answers?.aiMemory?.lastTopics?.[0],
                    updatedConversation.answers?.flowContext?.servico,
                    updatedConversation.answers?.flowContext?.intent,
                  ],
                })
            : null;
          const currentFlowContext = updatedConversation.answers?.flowContext ?? {};
          const previousTenantIntentKey =
            typeof currentFlowContext.intent === "string" ? currentFlowContext.intent : null;
          const isRepeatedTenantIntent =
            Boolean(tenantIntent?.key && previousTenantIntentKey === tenantIntent.key);
          const tenantIntentReply = tenantIntent
            ? isRepeatedTenantIntent
              ? buildTenantIntentDetailCaptureReply(
                  tenantIntent,
                  appliedTenantConfig.aiAssistantHandoffPrompt
                )
              : buildTenantIntentCatalogReply(tenantIntent)
            : null;
          if (tenantIntent) {
            await logAiAssistantEvent("ai.intent_catalog.matched", {
              key: tenantIntent.key,
              topic: tenantIntent.topic,
              hasResponse: Boolean(tenantIntentReply),
              handoff: tenantIntent.handoff,
              repeated: isRepeatedTenantIntent,
            });
          }
          if (qualificationHandled) {
            // Qualification already responded for this turn.
          } else if (tenantIntent && tenantIntentReply && !risk) {
            if (assistantState.count >= maxReplies) {
              await logAiAssistantEvent("ai.assistant.limit_reached", {
                count: assistantState.count,
                maxReplies,
                source: "intent_catalog",
              });
              await applyAssistantLimitFallback("intent_catalog");
            } else {
              const nowIso = new Date().toISOString();
              const catalogOutput = buildTenantIntentOrchestratorOutput(
                tenantIntent,
                tenantIntentReply
              );
              const shouldCreateCatalogHandoffPrompt =
                (tenantIntent.handoff || isRepeatedTenantIntent) &&
                appliedTenantConfig.aiAssistantFallbackToHandoff === true &&
                updatedConversation.handoff.status === "none";
              const effectiveCatalogNextAction = shouldCreateCatalogHandoffPrompt
                ? "handoff_recommend"
                : catalogOutput.next_action;
              const effectiveCatalogHandoffRecommended =
                catalogOutput.handoff_recommended || shouldCreateCatalogHandoffPrompt;
              replyText = tenantIntentReply;
              aiAssistantResponded = true;
              await applyAiMemoryUpdate({
                topic: tenantIntent.topic || tenantIntent.key,
                stage: catalogOutput.stage,
                goal: catalogOutput.goal,
                leadTemp: tenantIntent.leadTemp,
                priority: tenantIntent.priority,
                handoffRecommended: effectiveCatalogHandoffRecommended,
                source: "intent_catalog",
              });
              const crmEnrichment = enrichCrmFromOrchestrator({
                state: updatedConversation,
                output: catalogOutput,
                topic: tenantIntent.topic || tenantIntent.key,
                catalogTags: tenantIntent.tags,
                nowIso,
              });
              updatedConversation = crmEnrichment.state;
              if (crmEnrichment.enriched) {
                await logAiAssistantEvent("ai.crm.enriched", {
                  source: "intent_catalog",
                  changedFields: crmEnrichment.changedFields,
                  addedTags: crmEnrichment.addedTags,
                  confidence: catalogOutput.confidence,
                });
                if (crmEnrichment.addedTags.length) {
                  await logAiAssistantEvent("ai.crm.tag_added", {
                    source: "intent_catalog",
                    tags: crmEnrichment.addedTags,
                  });
                }
                if (crmEnrichment.priorityUpdated) {
                  await logAiAssistantEvent("ai.crm.priority_updated", {
                    source: "intent_catalog",
                    leadTemp: catalogOutput.lead_temp,
                    priority: catalogOutput.priority,
                  });
                }
              } else {
                await logAiAssistantEvent("ai.crm.enrichment_skipped", {
                  source: "intent_catalog",
                  reason: crmEnrichment.skippedReason ?? "no_changes",
                  confidence: catalogOutput.confidence,
                });
              }
              updatedConversation = {
                ...updatedConversation,
                answers: {
                  ...(updatedConversation.answers ?? {}),
                  flowContext: {
                    ...(updatedConversation.answers?.flowContext ?? {}),
                    ...(isRepeatedTenantIntent
                      ? {
                          detalhe_interesse: message.text.slice(0, 120),
                          ultima_intencao_confirmada: tenantIntent.key,
                        }
                      : {}),
                  },
                  aiAssistant: {
                    count: assistantState.count + 1,
                    lastRespondedAt: nowIso,
                    lastMessageId: message.messageId,
                    lastFallbackType: assistantState.lastFallbackType,
                    lastFallbackAt: assistantState.lastFallbackAt,
                    fallbackCount: assistantState.fallbackCount,
                  },
                  aiOrchestrator: {
                    ...(updatedConversation.answers?.aiOrchestrator ?? {}),
                    stage: catalogOutput.stage,
                    goal: catalogOutput.goal,
                    missingInformation: catalogOutput.missing_information,
                    lastAction: effectiveCatalogNextAction,
                    lastConfidence: catalogOutput.confidence,
                    handoffRecommended: effectiveCatalogHandoffRecommended,
                    lastMessageId: message.messageId,
                    lastQuestion: catalogOutput.next_question,
                    lastNextActionAt: nowIso,
                    lastContinuationTopic: tenantIntent.topic || tenantIntent.key,
                    activePrompt: shouldCreateCatalogHandoffPrompt
                      ? {
                          type: "handoff_confirmation",
                          expected: "yes_no",
                          createdAt: nowIso,
                          messageId: message.messageId,
                          retryCount: 0,
                        }
                      : updatedConversation.answers?.aiOrchestrator?.activePrompt,
                    handoffPrompt: shouldCreateCatalogHandoffPrompt
                      ? {
                          prompted: true,
                          promptedAt: nowIso,
                          messageId: message.messageId,
                          reason: "intent_catalog",
                          score: 3,
                          awaitingConfirmation: true,
                        }
                      : updatedConversation.answers?.aiOrchestrator?.handoffPrompt,
                    pendingOffer: shouldCreateCatalogHandoffPrompt
                      ? {
                          type: "handoff",
                          promptedAt: nowIso,
                          messageId: message.messageId,
                          retryCount: 0,
                        }
                      : updatedConversation.answers?.aiOrchestrator?.pendingOffer,
                  },
                },
              };
              if (shouldCreateCatalogHandoffPrompt) {
                await logAiAssistantEvent("ai.orchestrator.handoff_prompt.sent", {
                  source: "intent_catalog",
                  reason: tenantIntent.key,
                  score: 3,
                  threshold: 3,
                  promptType: "confirmation",
                });
                await logAiAssistantEvent("ai.orchestrator.handoff_prompt.awaiting_confirmation", {
                  source: "intent_catalog",
                  reason: tenantIntent.key,
                  score: 3,
                  messageId: message.messageId,
                });
              }
              await logAiAssistantEvent("ai.orchestrator.state_updated", {
                source: "intent_catalog",
                stage: catalogOutput.stage,
                goal: catalogOutput.goal,
                nextAction: effectiveCatalogNextAction,
                resolvedAction: "answer",
                confidence: catalogOutput.confidence,
                handoffRecommended: effectiveCatalogHandoffRecommended,
              });
              await logAiAssistantEvent("ai.intent_catalog.responded", {
                key: tenantIntent.key,
                topic: tenantIntent.topic,
                count: assistantState.count + 1,
                maxReplies,
              });
              await logAiAssistantEvent("ai.assistant.responded", {
                source: "intent_catalog",
                latency_ms: Date.now() - start,
                count: assistantState.count + 1,
                maxReplies,
              });
            }
          } else if (!educationalIntent.allowed && !risk) {
            let handledContextualAck = false;
            const hasFormalHandoffPrompt =
              updatedConversation.answers?.aiOrchestrator?.activePrompt?.type ===
                "handoff_confirmation" ||
              updatedConversation.answers?.aiOrchestrator?.handoffPrompt?.awaitingConfirmation ===
                true;
            const contextualAck = isContextualAck(message.text);
            const continuationTopic = resolveContextualContinuationTopic(updatedConversation);
            const canHandleContextualAck =
              contextualAck &&
              fallbackDecision?.intent !== "handoff_prompt" &&
              !hasFormalHandoffPrompt;
            if (contextualAck) {
              await logAiAssistantEvent("ai.turn.contextual_ack_detected", {
                hasTopic: Boolean(continuationTopic),
                hasFormalHandoffPrompt,
                mode: updatedConversation.mode ?? "BOT",
                handoffStatus: updatedConversation.handoff.status,
              });
            }
            if (canHandleContextualAck) {
              const nowIso = new Date().toISOString();
              replyText = continuationTopic
                ? buildContextualContinuationReply(continuationTopic)
                : "Certo. Me diga em poucas palavras o que você precisa.";
              aiAssistantResponded = true;
              handledContextualAck = true;
              if (continuationTopic) {
                await applyAiMemoryUpdate({
                  topic: continuationTopic,
                  stage: "clarification",
                  goal: "identify_need",
                  source: "contextual_continue",
                });
              }
              updatedConversation = {
                ...updatedConversation,
                answers: {
                  ...(updatedConversation.answers ?? {}),
                  aiAssistant: {
                    count: assistantState.count + 1,
                    lastRespondedAt: nowIso,
                    lastMessageId: message.messageId,
                    lastFallbackType: assistantState.lastFallbackType,
                    lastFallbackAt: assistantState.lastFallbackAt,
                    fallbackCount: assistantState.fallbackCount,
                  },
                  aiOrchestrator: {
                    ...(updatedConversation.answers?.aiOrchestrator ?? {}),
                    stage: "clarification",
                    goal: "identify_need",
                    missingInformation:
                      updatedConversation.answers?.aiOrchestrator?.missingInformation ?? [],
                    lastAction: "contextual_continue",
                    lastConfidence:
                      updatedConversation.answers?.aiOrchestrator?.lastConfidence ?? 1,
                    handoffRecommended: false,
                    lastMessageId: message.messageId,
                    lastQuestion: null,
                    lastContinuationTopic: continuationTopic ?? null,
                    lastNextActionAt: nowIso,
                    activePrompt: undefined,
                    pendingOffer: updatedConversation.answers?.aiOrchestrator?.pendingOffer,
                  },
                },
              };
              if (continuationTopic) {
                await logAiAssistantEvent("ai.turn.contextual_continue_sent", {
                  topic: continuationTopic,
                  source: "memory_or_crm",
                });
              } else {
                await logAiAssistantEvent("ai.turn.contextual_continue_skipped", {
                  reason: "missing_recent_context",
                  fallback: "ask_short_need",
                });
              }
              await logAiAssistantEvent("ai.orchestrator.state_updated", {
                source: "contextual_ack",
                stage: "clarification",
                goal: "identify_need",
                nextAction: "contextual_continue",
                resolvedAction: "contextual_continue",
                confidence: 1,
                handoffRecommended: false,
              });
              await logAiAssistantEvent("ai.assistant.responded", {
                source: "contextual_ack",
                latency_ms: Date.now() - start,
                count: assistantState.count + 1,
                maxReplies,
              });
            }
            if (!handledContextualAck) {
            await logAiAssistantEvent("ai.assistant.educational_blocked", {
              reason: educationalIntent.reason ?? "not_allowed",
              concreteRisk: educationalIntent.concreteRisk === true,
              fallbackIntent: fallbackDecision?.intent ?? null,
            });
            await logAiAssistantEvent("ai.orchestrator.skipped", {
              reason: "educational_intent_not_allowed",
              fallbackIntent: fallbackDecision?.intent ?? null,
              fallbackReason: fallbackDecision?.reason ?? null,
            });
            if (assistantState.count >= maxReplies && fallbackDecision?.intent !== "handoff_prompt") {
              await logAiAssistantEvent("ai.assistant.limit_reached", {
                count: assistantState.count,
                maxReplies,
                fallbackIntent: fallbackDecision?.intent ?? null,
              });
              await applyAssistantLimitFallback("not_simple_question_fallback");
            } else if (fallbackDecision?.intent === "handoff_prompt") {
              const scoreResult = calculateHandoffScore({
                explicitHumanRequest: true,
                assistantLimitReached: assistantState.count + 1 >= maxReplies,
              });
              const eligibility = canEvaluateHandoffRecommendation({
                state: updatedConversation,
                duplicateMessage: assistantState.lastMessageId === message.messageId,
                windowOpen: isWindowOpen(updatedConversation, Date.now()),
                tenantAiEnabled:
                  env.AI_ASSISTANT_ENABLED &&
                  env.WHATSAPP_AI_ENABLED &&
                  appliedTenantConfig.aiAssistantEnabled === true,
                tenantFallbackToHandoff:
                  appliedTenantConfig.aiAssistantFallbackToHandoff === true,
              });
              const allowed = eligibility.ok && scoreResult.allowed;
              const deniedReason = eligibility.ok ? "score_below_threshold" : eligibility.reason;
              const lastReason = allowed
                ? (scoreResult.primaryReason ?? "threshold_reached")
                : deniedReason;
              await logAiAssistantEvent("ai.orchestrator.handoff_recommended", {
                source: "deterministic_fallback",
                score: scoreResult.score,
                threshold: scoreResult.threshold,
                reasons: scoreResult.reasons,
                primaryReason: scoreResult.primaryReason,
                eligibility: eligibility.ok ? "allowed_to_evaluate" : eligibility.reason,
              });
              await logAiAssistantEvent("ai.orchestrator.handoff_reason", {
                source: "deterministic_fallback",
                reason: lastReason,
                score: scoreResult.score,
                threshold: scoreResult.threshold,
                reasons: scoreResult.reasons,
              });
              const previousAiOrchestrator = updatedConversation.answers?.aiOrchestrator;
              const previousHandoffSignals = previousAiOrchestrator?.handoffSignals ?? {};
              let nextHandoffPrompt = previousAiOrchestrator?.handoffPrompt;
              let nextPendingOffer = previousAiOrchestrator?.pendingOffer;
              let nextActivePrompt = previousAiOrchestrator?.activePrompt;
              if (allowed) {
                await logAiAssistantEvent("ai.orchestrator.handoff_threshold_reached", {
                  source: "deterministic_fallback",
                  score: scoreResult.score,
                  threshold: scoreResult.threshold,
                  reasons: scoreResult.reasons,
                });
                await logAiAssistantEvent("ai.orchestrator.handoff_allowed", {
                  source: "deterministic_fallback",
                  score: scoreResult.score,
                  threshold: scoreResult.threshold,
                  reasons: scoreResult.reasons,
                  mode: updatedConversation.mode ?? "BOT",
                  handoffStatus: updatedConversation.handoff.status,
                });
                const shouldPrompt = shouldSendHandoffConfirmationPrompt({
                  allowed,
                  state: updatedConversation,
                  messageId: message.messageId,
                });
                if (shouldPrompt) {
                  const promptCreatedAt = new Date().toISOString();
                  replyText = buildHandoffConfirmationPrompt({
                    context: assistantTenantContext,
                  });
                  aiAssistantResponded = true;
                  nextHandoffPrompt = {
                    prompted: true,
                    promptedAt: promptCreatedAt,
                    messageId: message.messageId,
                    reason: lastReason,
                    score: scoreResult.score,
                    awaitingConfirmation: true,
                  };
                  nextPendingOffer = {
                    type: "handoff",
                    promptedAt: promptCreatedAt,
                    messageId: message.messageId,
                    retryCount: 0,
                  };
                  nextActivePrompt = {
                    type: "handoff_confirmation",
                    expected: "yes_no",
                    createdAt: promptCreatedAt,
                    messageId: message.messageId,
                    retryCount: 0,
                  };
                  await logAiAssistantEvent("ai.turn.pending_offer.created", {
                    type: "handoff",
                    source: "deterministic_fallback",
                    reason: lastReason,
                  });
                  await logAiAssistantEvent("ai.orchestrator.handoff_prompt.sent", {
                    source: "deterministic_fallback",
                    reason: lastReason,
                    score: scoreResult.score,
                    threshold: scoreResult.threshold,
                    promptType: "confirmation",
                  });
                  await logAiAssistantEvent("ai.orchestrator.handoff_prompt.awaiting_confirmation", {
                    source: "deterministic_fallback",
                    reason: lastReason,
                    score: scoreResult.score,
                    messageId: message.messageId,
                  });
                } else {
                  replyText = buildAssistantFallbackGuidance(assistantTenantContext);
                  aiAssistantResponded = true;
                  if (!assistantTenantContext.fallbackMessage?.trim()) {
                    await logAiAssistantEvent("ai.assistant.generic_fallback_used", {
                      reason: "handoff_prompt_not_sent",
                    });
                  }
                  await logAiAssistantEvent("ai.assistant.fallback_used", {
                    reason: "handoff_prompt_not_sent",
                    configured: Boolean(assistantTenantContext.fallbackMessage?.trim()),
                  });
                  await logAiAssistantEvent("ai.orchestrator.handoff_prompt.skipped", {
                    source: "deterministic_fallback",
                    reason:
                      previousAiOrchestrator?.handoffPrompt?.awaitingConfirmation === true
                        ? "already_awaiting_confirmation"
                        : "not_allowed",
                    score: scoreResult.score,
                    threshold: scoreResult.threshold,
                  });
                }
              } else {
                replyText = buildAssistantFallbackGuidance(assistantTenantContext);
                aiAssistantResponded = true;
                if (!assistantTenantContext.fallbackMessage?.trim()) {
                  await logAiAssistantEvent("ai.assistant.generic_fallback_used", {
                    reason: "handoff_denied",
                  });
                }
                await logAiAssistantEvent("ai.assistant.fallback_used", {
                  reason: "handoff_denied",
                  configured: Boolean(assistantTenantContext.fallbackMessage?.trim()),
                });
                await logAiAssistantEvent("ai.orchestrator.handoff_denied", {
                  source: "deterministic_fallback",
                  reason: deniedReason,
                  score: scoreResult.score,
                  threshold: scoreResult.threshold,
                  reasons: scoreResult.reasons,
                  eligibility: eligibility.ok ? "allowed_to_evaluate" : eligibility.reason,
                  mode: updatedConversation.mode ?? "BOT",
                  handoffStatus: updatedConversation.handoff.status,
                });
              await logAiAssistantEvent("ai.orchestrator.handoff_prompt.skipped", {
                  source: "deterministic_fallback",
                  reason: deniedReason,
                  score: scoreResult.score,
                  threshold: scoreResult.threshold,
                });
              }
              await applyAiMemoryUpdate({
                topic: "handoff_request",
                stage: "handoff_recommended",
                goal: "recommend_handoff",
                wantsHuman: allowed,
                handoffRecommended: true,
                source: "deterministic_fallback",
              });
              updatedConversation = {
                ...updatedConversation,
                answers: {
                  ...(updatedConversation.answers ?? {}),
                  aiAssistant: {
                    count: assistantState.count + 1,
                    lastRespondedAt: new Date().toISOString(),
                    lastMessageId: message.messageId,
                  },
                  aiOrchestrator: {
                    ...(previousAiOrchestrator ?? {}),
                    stage: "handoff_recommended",
                    goal: "recommend_handoff",
                    missingInformation: previousAiOrchestrator?.missingInformation ?? [],
                    lastAction: "handoff_recommend",
                    lastConfidence: 1,
                    handoffRecommended: true,
                    lastMessageId: message.messageId,
                    lastQuestion: null,
                    lastNextActionAt: new Date().toISOString(),
                    handoffSignals: {
                      count: (previousHandoffSignals.count ?? 0) + 1,
                      lastReason,
                      lastRecommendedAt: new Date().toISOString(),
                      guardrailCount: previousHandoffSignals.guardrailCount ?? 0,
                      lowConfidenceCount: previousHandoffSignals.lowConfidenceCount ?? 0,
                    },
                    handoffPrompt: nextHandoffPrompt,
                    pendingOffer: nextPendingOffer,
                    activePrompt: nextActivePrompt,
                  },
                },
              };
              await logAiAssistantEvent("ai.orchestrator.state_updated", {
                source: "deterministic_fallback",
                stage: "handoff_recommended",
                goal: "recommend_handoff",
                nextAction: "handoff_recommend",
                resolvedAction: "handoff_prompt",
                confidence: 1,
                handoffRecommended: true,
              });
              await logAiAssistantEvent("ai.assistant.responded", {
                source: "not_simple_question_fallback",
                fallbackIntent: fallbackDecision.intent,
                latency_ms: Date.now() - start,
                count: assistantState.count + 1,
                maxReplies,
              });
            } else {
              const contextualFallback = classifyContextualFallback(message.text, {
                aiAssistantAllowedTopics: appliedTenantConfig.aiAssistantAllowedTopics,
                aiAssistantSecondaryTopics: appliedTenantConfig.aiAssistantSecondaryTopics,
              });
              const lastFallbackAtMs = assistantState.lastFallbackAt
                ? Date.parse(assistantState.lastFallbackAt)
                : Number.NaN;
              const fallbackRepeated =
                assistantState.lastFallbackType === contextualFallback.type &&
                Number.isFinite(lastFallbackAtMs) &&
                Date.now() - lastFallbackAtMs < 15 * 60 * 1000;
              const shortConfirmationWithoutPrompt =
                fallbackDecision?.reason === "vague_message" &&
                classifyPendingOfferResponse(message.text) === "accepted";
              replyText = shortConfirmationWithoutPrompt
                ? "Certo. Me diga em poucas palavras o que você precisa."
                : buildContextualFallbackReply({
                    result: contextualFallback,
                    fallbackMessage: assistantTenantContext.fallbackMessage,
                    greetingMessage: assistantTenantContext.greetingMessage,
                    repeated: fallbackRepeated,
                  });
              aiAssistantResponded = true;
              if (
                contextualFallback.type === "help" &&
                !assistantTenantContext.fallbackMessage?.trim()
              ) {
                await logAiAssistantEvent("ai.assistant.generic_fallback_used", {
                  reason: contextualFallback.reason,
                });
              }
              await logAiAssistantEvent("ai.assistant.contextual_fallback_used", {
                type: contextualFallback.type,
                confidence: contextualFallback.confidence,
                reason: contextualFallback.reason,
                repeated: fallbackRepeated,
                configured: Boolean(assistantTenantContext.fallbackMessage?.trim()),
              });
              if (contextualFallback.type === "greeting") {
                await logAiAssistantEvent("ai.assistant.greeting_detected", {
                  reason: contextualFallback.reason,
                });
              } else if (contextualFallback.type === "negative") {
                await logAiAssistantEvent("ai.assistant.negative_intent_detected", {
                  reason: contextualFallback.reason,
                });
              } else if (contextualFallback.type === "near_domain") {
                await logAiAssistantEvent("ai.assistant.near_domain_detected", {
                  reason: contextualFallback.reason,
                });
              } else if (contextualFallback.type === "out_of_scope") {
                await logAiAssistantEvent("ai.assistant.out_of_scope_detected", {
                  reason: contextualFallback.reason,
                });
              }
              await logAiAssistantEvent("ai.assistant.fallback_used", {
                reason: contextualFallback.reason,
                type: contextualFallback.type,
                configured: Boolean(assistantTenantContext.fallbackMessage?.trim()),
              });
              if (contextualFallback.type !== "greeting") {
                await applyAiMemoryUpdate({
                  topic: contextualFallback.type,
                  stage: "clarification",
                  goal: "identify_need",
                  wantsHuman:
                    !shortConfirmationWithoutPrompt &&
                    (contextualFallback.type === "near_domain" ||
                      contextualFallback.type === "out_of_scope"),
                  handoffRecommended:
                    !shortConfirmationWithoutPrompt &&
                    (contextualFallback.type === "near_domain" ||
                      contextualFallback.type === "out_of_scope"),
                  source: "contextual_fallback",
                });
              }
              const shouldCreateFallbackHandoffPrompt =
                !shortConfirmationWithoutPrompt &&
                appliedTenantConfig.aiAssistantFallbackToHandoff === true &&
                (contextualFallback.type === "near_domain" ||
                  contextualFallback.type === "out_of_scope" ||
                  fallbackRepeated);
              const fallbackPromptCreatedAt = new Date().toISOString();
              const fallbackPendingOffer =
                shouldCreateFallbackHandoffPrompt
                  ? {
                      type: "handoff" as const,
                      promptedAt: fallbackPromptCreatedAt,
                      messageId: message.messageId,
                      text: undefined,
                      retryCount: 0,
                    }
                  : updatedConversation.answers?.aiOrchestrator?.pendingOffer;
              const fallbackHandoffPrompt =
                shouldCreateFallbackHandoffPrompt
                  ? {
                      prompted: true,
                      promptedAt: fallbackPromptCreatedAt,
                      messageId: message.messageId,
                      reason: contextualFallback.reason,
                      score: 3,
                      awaitingConfirmation: true,
                    }
                  : updatedConversation.answers?.aiOrchestrator?.handoffPrompt;
              const fallbackActivePrompt = shouldCreateFallbackHandoffPrompt
                ? {
                    type: "handoff_confirmation" as const,
                    expected: "yes_no" as const,
                    createdAt: fallbackPromptCreatedAt,
                    messageId: message.messageId,
                    retryCount: 0,
                  }
                : updatedConversation.answers?.aiOrchestrator?.activePrompt;
              if (shouldCreateFallbackHandoffPrompt) {
                await logAiAssistantEvent("ai.turn.pending_offer.created", {
                  type: "handoff",
                  source: "contextual_fallback",
                  reason: contextualFallback.reason,
                });
              }
              updatedConversation = {
                ...updatedConversation,
                answers: {
                  ...(updatedConversation.answers ?? {}),
                  aiAssistant: {
                    count: assistantState.count + 1,
                    lastRespondedAt: new Date().toISOString(),
                    lastMessageId: message.messageId,
                    lastFallbackType: contextualFallback.type,
                    lastFallbackAt: new Date().toISOString(),
                    fallbackCount: assistantState.fallbackCount + 1,
                  },
                  aiOrchestrator: {
                    ...(updatedConversation.answers?.aiOrchestrator ?? {}),
                    stage: "clarification",
                    goal: "identify_need",
                    missingInformation:
                      updatedConversation.answers?.aiOrchestrator?.missingInformation ?? [],
                    lastAction: "fallback_menu",
                    lastConfidence: 1,
                    handoffRecommended: fallbackPendingOffer?.type === "handoff",
                    lastMessageId: message.messageId,
                    lastQuestion: null,
                    lastNextActionAt: new Date().toISOString(),
                    handoffPrompt: fallbackHandoffPrompt,
                    pendingOffer: fallbackPendingOffer,
                    activePrompt: fallbackActivePrompt,
                  },
                },
              };
              await logAiAssistantEvent("ai.orchestrator.fallback_menu", {
                source: "not_simple_question_fallback",
                reason: contextualFallback.reason,
                type: contextualFallback.type,
              });
              await logAiAssistantEvent("ai.orchestrator.state_updated", {
                source: "not_simple_question_fallback",
                stage: "clarification",
                goal: "identify_need",
                nextAction: "fallback_menu",
                resolvedAction: "generic_guidance",
                confidence: 1,
                handoffRecommended: false,
              });
              await logAiAssistantEvent("ai.assistant.responded", {
                source: "not_simple_question_fallback",
                fallbackIntent: fallbackDecision?.intent ?? "generic_guidance",
                latency_ms: Date.now() - start,
                count: assistantState.count + 1,
                maxReplies,
              });
            }
            }
          } else if (risk) {
            await logAiAssistantEvent("ai.orchestrator.skipped", { reason: "guardrail_risk" });
            const flowContext = updatedConversation.answers?.flowContext ?? {};
            await logAiAssistantEvent("ai.guardrail.detected", {
              risk,
              count: assistantState.count,
              maxReplies,
              tenantName: appliedTenantConfig.name,
              contextArea: typeof flowContext.area === "string" ? flowContext.area : null,
              contextServico: typeof flowContext.servico === "string" ? flowContext.servico : null,
              contextIntent: typeof flowContext.intent === "string" ? flowContext.intent : null,
            });
            replyText = buildSafeResponse(risk, assistantTenantContext);
            aiAssistantResponded = true;
            await applyAiMemoryUpdate({
              topic: risk,
              stage: "clarification",
              goal: "collect_safe_context",
              guardrailRisk: risk,
              source: "guardrail",
            });
            updatedConversation = {
              ...updatedConversation,
              answers: {
                ...(updatedConversation.answers ?? {}),
                aiAssistant: {
                  count: assistantState.count,
                  lastRespondedAt: new Date().toISOString(),
                  lastMessageId: message.messageId,
                },
              },
            };
            await logAiAssistantEvent("ai.guardrail.responded", {
              risk,
              latency_ms: Date.now() - start,
              count: assistantState.count,
              maxReplies,
              countConsumed: false,
            });
          } else if (assistantState.count >= maxReplies) {
            await logAiAssistantEvent("ai.orchestrator.skipped", { reason: "assistant_limit_reached" });
            await logAiAssistantEvent("ai.assistant.limit_reached", {
              count: assistantState.count,
              maxReplies,
            });
            await applyAssistantLimitFallback("educational_question");
          } else {
            await logAiAssistantEvent("ai.orchestrator.invoked", {
              count: assistantState.count,
              maxReplies,
            });
            await logAiAssistantEvent("ai.assistant.invoked", {
              count: assistantState.count,
              maxReplies,
            });
            if (updatedConversation.answers?.aiMemory) {
              await logAiMemoryEvent("ai.memory.used", {
                source: "orchestrator",
                topicCount: updatedConversation.answers.aiMemory.lastTopics?.length ?? 0,
                factKeys: Object.keys(updatedConversation.answers.aiMemory.facts ?? {}),
                hasSummary: Boolean(updatedConversation.answers.aiMemory.summary),
              });
            }
            const aiReply = await generateControlledAssistantReply({
              brain: agentBrain,
              text: message.text,
              tenant: {
                name: appliedTenantConfig.name,
                defaultLanguage: appliedTenantConfig.defaultLanguage,
                aiBusinessContext,
                aiAssistantSystemPrompt: appliedTenantConfig.aiAssistantSystemPrompt,
                aiAssistantAllowedTopics: appliedTenantConfig.aiAssistantAllowedTopics,
                aiAssistantBlockedTerms: appliedTenantConfig.aiAssistantBlockedTerms,
              },
              state: updatedConversation,
              nowIso: new Date().toISOString(),
              preclassifiedEducationalIntent: educationalIntent,
            });
            if (aiReply.ok) {
              const resolvedAction = resolveOrchestratorAction(
                aiReply.output,
                env.WHATSAPP_DEFAULT_REPLY
              );
              aiAssistantResponded = resolvedAction.shouldSend;
              await logAiAssistantEvent("ai.orchestrator.validated", {
                stage: aiReply.output.stage,
                goal: aiReply.output.goal,
                nextAction: aiReply.output.next_action,
                confidence: aiReply.output.confidence,
                handoffRecommended: aiReply.output.handoff_recommended,
              });
              await logAiAssistantEvent("ai.orchestrator.next_action", {
                nextAction: aiReply.output.next_action,
                resolvedAction: resolvedAction.action,
                shouldSend: resolvedAction.shouldSend,
                ignoredAction: resolvedAction.ignoredAction ?? null,
              });
              if (resolvedAction.action === "ask_question") {
                await logAiAssistantEvent("ai.orchestrator.question_sent", {
                  nextAction: aiReply.output.next_action,
                  confidence: aiReply.output.confidence,
                });
              } else if (resolvedAction.action === "fallback_menu") {
                await logAiAssistantEvent("ai.orchestrator.fallback_menu", {
                  nextAction: aiReply.output.next_action,
                  confidence: aiReply.output.confidence,
                });
              } else if (resolvedAction.action === "no_reply") {
                await logAiAssistantEvent("ai.orchestrator.no_reply", {
                  reason: resolvedAction.reason,
                  confidence: aiReply.output.confidence,
                });
              } else if (resolvedAction.ignoredAction) {
                await logAiAssistantEvent("ai.orchestrator.action_ignored", {
                  ignoredAction: resolvedAction.ignoredAction,
                  resolvedAction: resolvedAction.action,
                  reason: "handoff_actions_disabled_in_60b",
                });
              }
              if (resolvedAction.shouldSend) {
                replyText = resolvedAction.text;
              }
              const previousAiOrchestrator = updatedConversation.answers?.aiOrchestrator;
              const previousHandoffSignals = previousAiOrchestrator?.handoffSignals ?? {};
              let nextHandoffSignals = previousHandoffSignals;
              let nextHandoffPrompt = previousAiOrchestrator?.handoffPrompt;
              let nextPendingOffer = previousAiOrchestrator?.pendingOffer;
              let nextActivePrompt = previousAiOrchestrator?.activePrompt;
              if (aiReply.output.handoff_recommended) {
                const scoreResult = calculateHandoffScore({
                  output: aiReply.output,
                  previousMissingInformation: previousAiOrchestrator?.missingInformation,
                  explicitHumanRequest:
                    aiReply.output.next_action === "handoff_recommend" ||
                    aiReply.output.next_action === "handoff_force",
                  assistantLimitReached: assistantState.count + 1 >= maxReplies,
                });
                const eligibility = canEvaluateHandoffRecommendation({
                  state: updatedConversation,
                  duplicateMessage: assistantState.lastMessageId === message.messageId,
                  windowOpen: isWindowOpen(updatedConversation, Date.now()),
                  tenantAiEnabled:
                    env.AI_ASSISTANT_ENABLED &&
                    env.WHATSAPP_AI_ENABLED &&
                    appliedTenantConfig.aiAssistantEnabled === true,
                  tenantFallbackToHandoff:
                    appliedTenantConfig.aiAssistantFallbackToHandoff === true,
                });
                const allowed = eligibility.ok && scoreResult.allowed;
                const deniedReason = eligibility.ok
                  ? "score_below_threshold"
                  : eligibility.reason;
                const lastReason = allowed
                  ? (scoreResult.primaryReason ?? "threshold_reached")
                  : deniedReason;
                const shouldPrompt = shouldSendHandoffConfirmationPrompt({
                  allowed,
                  state: updatedConversation,
                  messageId: message.messageId,
                });
                nextHandoffSignals = {
                  count: (previousHandoffSignals.count ?? 0) + 1,
                  lastReason,
                  lastRecommendedAt: new Date().toISOString(),
                  guardrailCount: previousHandoffSignals.guardrailCount ?? 0,
                  lowConfidenceCount:
                    (previousHandoffSignals.lowConfidenceCount ?? 0) +
                    (aiReply.output.confidence < 0.6 ? 1 : 0),
                };
                await logAiAssistantEvent("ai.orchestrator.handoff_recommended", {
                  score: scoreResult.score,
                  threshold: scoreResult.threshold,
                  reasons: scoreResult.reasons,
                  primaryReason: scoreResult.primaryReason,
                  confidence: aiReply.output.confidence,
                  nextAction: aiReply.output.next_action,
                  eligibility: eligibility.ok ? "allowed_to_evaluate" : eligibility.reason,
                });
                await logAiAssistantEvent("ai.orchestrator.handoff_reason", {
                  reason: lastReason,
                  score: scoreResult.score,
                  threshold: scoreResult.threshold,
                  reasons: scoreResult.reasons,
                });
                if (allowed) {
                  await logAiAssistantEvent("ai.orchestrator.handoff_threshold_reached", {
                    score: scoreResult.score,
                    threshold: scoreResult.threshold,
                    reasons: scoreResult.reasons,
                  });
                  await logAiAssistantEvent("ai.orchestrator.handoff_allowed", {
                    score: scoreResult.score,
                    threshold: scoreResult.threshold,
                    reasons: scoreResult.reasons,
                    mode: updatedConversation.mode ?? "BOT",
                    handoffStatus: updatedConversation.handoff.status,
                  });
                  if (shouldPrompt) {
                    const promptCreatedAt = new Date().toISOString();
                    const promptText = buildHandoffConfirmationPrompt({
                      context: assistantTenantContext,
                    });
                    replyText = promptText;
                    aiAssistantResponded = true;
                    nextHandoffPrompt = {
                      prompted: true,
                      promptedAt: promptCreatedAt,
                      messageId: message.messageId,
                      reason: lastReason,
                      score: scoreResult.score,
                      awaitingConfirmation: true,
                    };
                    nextPendingOffer = {
                      type: "handoff",
                      promptedAt: promptCreatedAt,
                      messageId: message.messageId,
                      retryCount: 0,
                    };
                    nextActivePrompt = {
                      type: "handoff_confirmation",
                      expected: "yes_no",
                      createdAt: promptCreatedAt,
                      messageId: message.messageId,
                      retryCount: 0,
                    };
                    await logAiAssistantEvent("ai.turn.pending_offer.created", {
                      type: "handoff",
                      source: "orchestrator",
                      reason: lastReason,
                    });
                    await logAiAssistantEvent("ai.orchestrator.handoff_prompt.sent", {
                      reason: lastReason,
                      score: scoreResult.score,
                      threshold: scoreResult.threshold,
                      promptType: "confirmation",
                    });
                    await logAiAssistantEvent(
                      "ai.orchestrator.handoff_prompt.awaiting_confirmation",
                      {
                        reason: lastReason,
                        score: scoreResult.score,
                        messageId: message.messageId,
                      }
                    );
                  } else {
                    await logAiAssistantEvent("ai.orchestrator.handoff_prompt.skipped", {
                      reason:
                        previousAiOrchestrator?.handoffPrompt?.awaitingConfirmation === true
                          ? "already_awaiting_confirmation"
                          : "not_allowed",
                      score: scoreResult.score,
                      threshold: scoreResult.threshold,
                    });
                  }
                } else {
                  await logAiAssistantEvent("ai.orchestrator.handoff_denied", {
                    reason: deniedReason,
                    score: scoreResult.score,
                    threshold: scoreResult.threshold,
                    reasons: scoreResult.reasons,
                    eligibility: eligibility.ok ? "allowed_to_evaluate" : eligibility.reason,
                    mode: updatedConversation.mode ?? "BOT",
                    handoffStatus: updatedConversation.handoff.status,
                  });
                  await logAiAssistantEvent("ai.orchestrator.handoff_prompt.skipped", {
                    reason: deniedReason,
                    score: scoreResult.score,
                    threshold: scoreResult.threshold,
                  });
                }
              }
              await applyAiMemoryUpdate({
                topic: educationalIntent.topic ?? aiReply.output.goal ?? aiReply.output.stage,
                stage: aiReply.output.stage,
                goal: aiReply.output.goal,
                leadTemp: aiReply.output.lead_temp,
                priority: aiReply.output.priority,
                wantsHuman: nextHandoffPrompt?.awaitingConfirmation === true,
                handoffRecommended: aiReply.output.handoff_recommended,
                source: "orchestrator",
              });
              const crmEnrichment = enrichCrmFromOrchestrator({
                state: updatedConversation,
                output: aiReply.output,
                topic: educationalIntent.topic ?? null,
                nowIso: new Date().toISOString(),
              });
              updatedConversation = crmEnrichment.state;
              if (crmEnrichment.enriched) {
                await logAiAssistantEvent("ai.crm.enriched", {
                  source: "orchestrator",
                  changedFields: crmEnrichment.changedFields,
                  addedTags: crmEnrichment.addedTags,
                  confidence: aiReply.output.confidence,
                });
                if (crmEnrichment.addedTags.length) {
                  await logAiAssistantEvent("ai.crm.tag_added", {
                    tags: crmEnrichment.addedTags,
                  });
                }
                if (crmEnrichment.priorityUpdated) {
                  await logAiAssistantEvent("ai.crm.priority_updated", {
                    leadTemp: aiReply.output.lead_temp,
                    priority: aiReply.output.priority,
                  });
                }
              } else {
                await logAiAssistantEvent("ai.crm.enrichment_skipped", {
                  reason: crmEnrichment.skippedReason ?? "no_changes",
                  confidence: aiReply.output.confidence,
                });
              }
              updatedConversation = {
                ...updatedConversation,
                answers: {
                  ...(updatedConversation.answers ?? {}),
                  aiAssistant: {
                    count: resolvedAction.shouldSend
                      ? assistantState.count + 1
                      : assistantState.count,
                    lastRespondedAt: resolvedAction.shouldSend
                      ? new Date().toISOString()
                      : assistantState.lastRespondedAt,
                    lastMessageId: message.messageId,
                  },
                  aiOrchestrator: {
                    stage: aiReply.output.stage,
                    goal: aiReply.output.goal,
                    missingInformation: aiReply.output.missing_information,
                    lastAction: aiReply.output.next_action,
                    lastConfidence: aiReply.output.confidence,
                    handoffRecommended: aiReply.output.handoff_recommended,
                    lastMessageId: message.messageId,
                    lastQuestion: resolvedAction.lastQuestion,
                    lastNextActionAt: new Date().toISOString(),
                    handoffSignals: nextHandoffSignals,
                    handoffPrompt: nextHandoffPrompt,
                    pendingOffer: nextPendingOffer,
                    activePrompt: nextActivePrompt,
                  },
                },
              };
              await logAiAssistantEvent("ai.orchestrator.state_updated", {
                stage: aiReply.output.stage,
                goal: aiReply.output.goal,
                nextAction: aiReply.output.next_action,
                resolvedAction: resolvedAction.action,
                confidence: aiReply.output.confidence,
                handoffRecommended: aiReply.output.handoff_recommended,
              });
              if (resolvedAction.shouldSend) {
                await logAiAssistantEvent("ai.assistant.responded", {
                  model: aiReply.model ?? null,
                  latency_ms: Date.now() - start,
                  count: assistantState.count + 1,
                  maxReplies,
                });
              } else {
                aiOrchestratorNoReply = true;
                await upsertConversationSafe(updatedConversation);
              }
            } else {
              await logAiAssistantEvent("ai.orchestrator.rejected", { reason: aiReply.reason });
              await logAiAssistantEvent("ai.assistant.skipped", { reason: aiReply.reason });
              const fallbackTopic =
                educationalIntent.topic ?? resolveContextualContinuationTopic(updatedConversation);
              replyText = fallbackTopic
                ? buildContextualContinuationReply(fallbackTopic)
                : buildAssistantFallbackGuidance(assistantTenantContext);
              aiAssistantResponded = true;
              const nowIso = new Date().toISOString();
              updatedConversation = {
                ...updatedConversation,
                answers: {
                  ...(updatedConversation.answers ?? {}),
                  aiAssistant: {
                    count: assistantState.count + 1,
                    lastRespondedAt: nowIso,
                    lastMessageId: message.messageId,
                    lastFallbackType: assistantState.lastFallbackType,
                    lastFallbackAt: assistantState.lastFallbackAt,
                    fallbackCount: assistantState.fallbackCount,
                  },
                  aiOrchestrator: {
                    ...(updatedConversation.answers?.aiOrchestrator ?? {}),
                    stage: "clarification",
                    goal: "identify_need",
                    missingInformation:
                      updatedConversation.answers?.aiOrchestrator?.missingInformation ?? [],
                    lastAction: "fallback_menu",
                    lastConfidence: 0,
                    handoffRecommended: false,
                    lastMessageId: message.messageId,
                    lastQuestion: null,
                    lastContinuationTopic: fallbackTopic ?? null,
                    lastNextActionAt: nowIso,
                  },
                },
              };
              await logAiAssistantEvent("ai.assistant.fallback_used", {
                reason: "orchestrator_rejected",
                rejectionReason: aiReply.reason,
                hasTopic: Boolean(fallbackTopic),
              });
              await logAiAssistantEvent("ai.orchestrator.state_updated", {
                source: "orchestrator_rejected_fallback",
                stage: "clarification",
                goal: "identify_need",
                nextAction: "fallback_menu",
                resolvedAction: "generic_guidance",
                confidence: 0,
                handoffRecommended: false,
              });
              await logAiAssistantEvent("ai.assistant.responded", {
                source: "orchestrator_rejected_fallback",
                latency_ms: Date.now() - start,
                count: assistantState.count + 1,
                maxReplies,
              });
            }
          }
        }
      } catch (error) {
        logger.error({
          event: "ai.assistant.failed",
          message: (error as Error).message,
          route: meta?.route,
          method: meta?.method,
          requestId: meta?.requestId,
        });
        await persistEventSafe(
          "ai.assistant.failed",
          {
            action: "ai.assistant.failed",
            clientId: tenantClientId || null,
            clientKey: tenantClientKey || null,
            reason: "generation_failed",
          } as Prisma.InputJsonValue,
          normalizedFrom,
          message.messageId
        );
      }
    }

    if (noAutomationReplyConfigured && !aiAssistantResponded) {
      if (aiOrchestratorNoReply) {
        logger.info({
          event: "reply.skipped",
          waId: maskNumber(normalizedFrom),
          reason: "ai_orchestrator_no_reply",
          route: meta?.route,
          method: meta?.method,
          requestId: meta?.requestId,
        });
        continue;
      }
      updatedConversation = await routeConversationToHumanQueue(updatedConversation, {
        reason: "no_automation_reply_configured",
        timestamp: message.timestamp,
        messageId: message.messageId,
        toE164: message.from,
        allowlistHit,
        receivedMedia: isWhatsAppInboundMediaMessage(message.type),
        guard: inboundGuard,
      });
      logger.info({
        event: "reply.skipped",
        waId: maskNumber(normalizedFrom),
        reason: "no_automation_reply_configured",
        route: meta?.route,
        method: meta?.method,
        requestId: meta?.requestId,
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

function normalizeHandoffConfirmationText(text: string | null | undefined) {
  const normalized = String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "invalid" as const;
  const positiveTerms = [
    "sim",
    "quero",
    "pode",
    "pode encaminhar",
    "ok",
    "claro",
    "atendimento humano",
    "falar com atendente",
    "quero falar com atendente",
  ];
  const negativeTerms = [
    "nao",
    "nao quero",
    "nao quero que direcione",
    "nao precisa",
    "agora nao",
    "depois",
    "continuar aqui",
  ];
  if (negativeTerms.some((term) => normalized === term || normalized.includes(term))) {
    return "declined" as const;
  }
  if (positiveTerms.some((term) => normalized === term || normalized.includes(term))) {
    return "accepted" as const;
  }
  return "invalid" as const;
}

function isUsefulTextForAiContinuation(text: string | null | undefined) {
  const normalized = String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s?]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return false;
  const shortAckOrNegation = [
    "sim",
    "sim quero",
    "quero",
    "pode",
    "ok",
    "claro",
    "nao",
    "nao quero",
    "depois",
    "agora nao",
  ];
  if (shortAckOrNegation.some((term) => normalized === term)) return false;
  if (normalized.length < 12) return false;
  return /[a-z]/.test(normalized);
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

function isWhatsAppInboundMediaMessage(type?: string | null): boolean {
  const normalized = (type ?? "").trim().toLowerCase();
  return ["image", "audio", "video", "document", "sticker"].includes(normalized);
}

function buildRealtimeMessageDownloadPath(waId: string, messageId: string) {
  return `/app/conversation/${encodeURIComponent(waId)}/messages/${encodeURIComponent(messageId)}/media`;
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
