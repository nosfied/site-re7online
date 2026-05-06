import {
  ConversationOperationalStatus,
  HandoffStatus,
  MessageStatus,
  MessageType,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { env } from "../config/env.js";
import { getTenant, type TenantConfig } from "../config/tenantConfig.js";
import { getPrisma } from "../db.js";
import { persistOutboundMessage } from "../db/persist.js";
import { logger } from "../logger/logger.js";
import { sendTemplate } from "../services/outboundTemplateService.js";
import { checkUsageGate } from "../usage/usageGate.js";
import { canonicalizeBrazilWaId } from "../utils/waid.js";
import { resolveTenantOutboundCredentials } from "../whatsapp/tenantCredentials.js";
import { sendTextMessage } from "../whatsapp/whatsapp.client.js";

type RuntimeStateForFollowUp = {
  id: string;
  clientId: string;
  waId: string;
  waIdCanonical: string | null;
  conversationKey: string | null;
  windowIsOpen: boolean;
  windowExpiresAt: Date | null;
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
  handoffStatus: HandoffStatus;
  chatbotNodeId: string | null;
  chatbotActive: boolean;
  answers: Prisma.JsonValue | null;
  mode: string | null;
  assignedUserId: string | null;
  assignedTo: string | null;
  status: ConversationOperationalStatus | null;
  closedAt: Date | null;
  client: {
    clientKey: string;
    name: string;
  };
};

type ConversationForFollowUp = {
  id: string;
  deletedAt: Date | null;
  anonymizedAt: Date | null;
  closedAt: Date | null;
  windowIsOpen: boolean;
  windowExpiresAt: Date | null;
};

type FollowUpControl = {
  count: number;
  lastSentAt: string | null;
  lastRequestId: string | null;
  dryRun?: boolean;
  lastChannel?: "text" | "template";
};

type FollowUpOptions = {
  now?: Date;
  dryRun?: boolean;
  delayMinutes?: number;
  maxPerConversation?: number;
  minIntervalMinutes?: number;
  tenantConfig?: FollowUpTenantConfig;
  templateApproved?: boolean;
};

type FollowUpTenantConfig = {
  enabled: boolean;
  delayMinutes: number;
  maxCount: number;
  useTemplate: boolean;
  templateName: string | null;
  templateLang: string | null;
};

export type FollowUpEligibility =
  | {
      eligible: true;
      requestId: string;
      nextCount: number;
      delayMinutes: number;
      minutesSinceLastOutbound: number;
      message: string;
      intent: string | null;
      nodeId: string;
      channel: "text" | "template";
      templateName?: string | null;
      templateLang?: string | null;
    }
  | {
      eligible: false;
      reason: string;
      delayMinutes: number;
      minutesSinceLastOutbound?: number;
      intent?: string | null;
      nodeId?: string | null;
      channel?: "text" | "template";
      templateName?: string | null;
      templateLang?: string | null;
    };

type FollowUpRunResult = {
  enabled: boolean;
  dryRun: boolean;
  scanned: number;
  triggered: number;
  skipped: number;
  deduped: number;
  sent: number;
  failed: number;
};

const SENSITIVE_CONTEXT_KEY_PATTERN =
  /(cpf|cnpj|rg|email|mail|phone|telefone|celular|whatsapp|waid|nome|name|address|endereco|document|documento)/i;
const SENSITIVE_CONTEXT_VALUE_PATTERN =
  /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})|(\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b)|(\b\d{10,13}\b)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asJsonObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function getAnswers(value: Prisma.JsonValue | null): Record<string, unknown> {
  return asJsonObject(value);
}

function getFlowContext(answers: Record<string, unknown>) {
  return isRecord(answers.flowContext) ? answers.flowContext : {};
}

function getFlowTags(answers: Record<string, unknown>) {
  return Array.isArray(answers.flowTags)
    ? answers.flowTags.filter((tag): tag is string => typeof tag === "string" && Boolean(tag.trim()))
    : [];
}

function getFollowUpControl(answers: Record<string, unknown>): FollowUpControl {
  const raw = isRecord(answers.followUp) ? answers.followUp : {};
  return {
    count: typeof raw.count === "number" && Number.isFinite(raw.count) ? raw.count : 0,
    lastSentAt: typeof raw.lastSentAt === "string" ? raw.lastSentAt : null,
    lastRequestId: typeof raw.lastRequestId === "string" ? raw.lastRequestId : null,
    dryRun: raw.dryRun === true,
    lastChannel: raw.lastChannel === "template" ? "template" : raw.lastChannel === "text" ? "text" : undefined,
  };
}

function getSafeContextValue(context: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (SENSITIVE_CONTEXT_KEY_PATTERN.test(key)) continue;
    const value = context[key];
    if (!["string", "number", "boolean"].includes(typeof value)) continue;
    const text = String(value).trim().replace(/\s+/g, " ");
    if (!text || SENSITIVE_CONTEXT_VALUE_PATTERN.test(text)) continue;
    return text
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return null;
}

function normalizeContextValue(context: Record<string, unknown>, keys: string[]) {
  const value = getSafeContextValue(context, keys);
  return value ? value.toLowerCase().replace(/\s+/g, "_") : null;
}

function formatService(text: string) {
  return text
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildFollowUpMessage(
  flowContext: Record<string, unknown> | null | undefined,
  tags?: string[] | null
) {
  const context = isRecord(flowContext) ? flowContext : {};
  const intent = normalizeContextValue(context, ["intent", "servico", "service"]);
  const service = getSafeContextValue(context, ["servico", "service", "servicoPretendido", "intent"]);
  const normalizedTags = new Set((tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean));
  const hasTag = (tag: string) => normalizedTags.has(tag);

  if (intent === "bpc_loas" || hasTag("bpc_loas")) {
    return "Oi, tudo bem? Podemos continuar sua triagem sobre BPC/LOAS por aqui. Responda quando puder para seguirmos com segurança.";
  }

  if (intent === "beneficio_negado" || intent === "pedido_negado" || hasTag("beneficio_negado")) {
    return "Oi, tudo bem? Podemos continuar sua triagem sobre o benefício negado. Responda quando puder para orientarmos os próximos passos.";
  }

  if (intent === "beneficio_cortado_suspenso" || hasTag("beneficio_cortado_suspenso")) {
    return "Oi, tudo bem? Podemos continuar sua triagem sobre o benefício cortado ou suspenso. Responda quando puder para seguirmos.";
  }

  if (intent === "revisao_beneficio" || intent === "revisao" || hasTag("revisao_beneficio")) {
    return "Oi, tudo bem? Podemos continuar sua triagem sobre revisão de benefício. Responda quando puder para avançarmos.";
  }

  if (intent === "pensao_por_morte" || hasTag("pensao_por_morte")) {
    return "Oi, tudo bem? Podemos continuar sua triagem sobre pensão por morte. Responda quando puder para seguirmos com as orientações.";
  }

  if (intent === "aposentadoria" || hasTag("aposentadoria")) {
    return "Oi, tudo bem? Podemos continuar sua triagem sobre aposentadoria. Responda quando puder para seguirmos com a análise inicial.";
  }

  if (service) {
    return `Oi, tudo bem? Podemos continuar sua triagem sobre ${formatService(service)}. Responda quando puder para seguirmos.`;
  }

  return "Oi, tudo bem? Podemos continuar seu atendimento por aqui. Responda quando puder para seguirmos.";
}

function minutesBetween(left: Date, right: Date) {
  return Math.floor((left.getTime() - right.getTime()) / 60000);
}

function isWindowOpen(state: RuntimeStateForFollowUp, conversation: ConversationForFollowUp | null, now: Date) {
  const expiresAt = conversation?.windowExpiresAt ?? state.windowExpiresAt;
  const isOpen = conversation?.windowIsOpen ?? state.windowIsOpen;
  return Boolean(isOpen && expiresAt && expiresAt.getTime() > now.getTime());
}

function buildFollowUpRequestId(params: {
  clientId: string;
  waIdCanonical: string | null;
  waId: string;
  nodeId: string;
  count: number;
  dryRun: boolean;
  channel: "text" | "template";
}) {
  return [
    "followup",
    params.dryRun ? "dry-run" : params.channel,
    ...(params.dryRun ? [params.channel] : []),
    params.clientId,
    params.waIdCanonical || canonicalizeBrazilWaId(params.waId) || params.waId,
    params.nodeId,
    params.count,
  ].join(":");
}

function resolveFollowUpTenantConfig(tenant?: TenantConfig | null): FollowUpTenantConfig {
  return {
    enabled: tenant?.followUpEnabled === true,
    delayMinutes: Math.max(1, tenant?.followUpDelayMinutes ?? env.FOLLOWUP_DEFAULT_DELAY_MINUTES),
    maxCount: Math.max(0, tenant?.followUpMaxCount ?? env.FOLLOWUP_MAX_PER_CONVERSATION),
    useTemplate: tenant?.followUpUseTemplate === true,
    templateName: tenant?.followUpTemplateName?.trim() || null,
    templateLang:
      tenant?.followUpTemplateLang?.trim() ||
      tenant?.defaultLanguage?.trim() ||
      env.OUTBOUND_TEMPLATE_DEFAULT_LANG ||
      null,
  };
}

export function evaluateFollowUpEligibility(
  state: RuntimeStateForFollowUp,
  conversation: ConversationForFollowUp | null,
  options: FollowUpOptions = {}
): FollowUpEligibility {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun ?? env.FOLLOWUP_DRY_RUN;
  const tenantConfig = options.tenantConfig ?? resolveFollowUpTenantConfig();
  const delayMinutes = Math.max(1, options.delayMinutes ?? tenantConfig.delayMinutes);
  const maxPerConversation = Math.max(0, options.maxPerConversation ?? tenantConfig.maxCount);
  const minIntervalMinutes = Math.max(
    1,
    options.minIntervalMinutes ?? env.FOLLOWUP_MIN_INTERVAL_MINUTES
  );
  const answers = getAnswers(state.answers);
  const followUp = getFollowUpControl(answers);
  const effectiveFollowUpCount = followUp.dryRun && !dryRun ? 0 : followUp.count;
  const effectiveLastSentAt = followUp.dryRun && !dryRun ? null : followUp.lastSentAt;
  const flowContext = getFlowContext(answers);
  const flowTags = getFlowTags(answers);
  const intent = normalizeContextValue(flowContext, ["intent", "servico", "service"]);

  if (!tenantConfig.enabled) return { eligible: false, reason: "tenant_followup_disabled", delayMinutes, intent, nodeId: state.chatbotNodeId };
  if (conversation?.deletedAt) return { eligible: false, reason: "conversation_deleted", delayMinutes, intent, nodeId: state.chatbotNodeId };
  if (conversation?.anonymizedAt) return { eligible: false, reason: "conversation_anonymized", delayMinutes, intent, nodeId: state.chatbotNodeId };
  if (conversation?.closedAt || state.closedAt) return { eligible: false, reason: "conversation_closed", delayMinutes, intent, nodeId: state.chatbotNodeId };
  if (state.status === ConversationOperationalStatus.CLOSED) return { eligible: false, reason: "status_closed", delayMinutes, intent, nodeId: state.chatbotNodeId };
  if (state.mode === "HUMAN") return { eligible: false, reason: "human_mode", delayMinutes, intent, nodeId: state.chatbotNodeId };
  if (state.handoffStatus !== HandoffStatus.NONE) return { eligible: false, reason: "handoff_active_or_pending", delayMinutes, intent, nodeId: state.chatbotNodeId };
  if (state.assignedUserId || state.assignedTo) return { eligible: false, reason: "assigned_to_human", delayMinutes, intent, nodeId: state.chatbotNodeId };
  if (!state.chatbotActive || !state.chatbotNodeId) return { eligible: false, reason: "chatbot_not_waiting", delayMinutes, intent, nodeId: state.chatbotNodeId };
  if (!state.lastInboundAt) return { eligible: false, reason: "missing_last_inbound", delayMinutes, intent, nodeId: state.chatbotNodeId };
  if (!state.lastOutboundAt) return { eligible: false, reason: "missing_last_outbound", delayMinutes, intent, nodeId: state.chatbotNodeId };
  if (state.lastInboundAt.getTime() >= state.lastOutboundAt.getTime()) {
    return {
      eligible: false,
      reason: "customer_already_replied",
      delayMinutes,
      minutesSinceLastOutbound: minutesBetween(now, state.lastOutboundAt),
      intent,
      nodeId: state.chatbotNodeId,
    };
  }
  const minutesSinceLastOutbound = minutesBetween(now, state.lastOutboundAt);
  if (minutesSinceLastOutbound < delayMinutes) {
    return {
      eligible: false,
      reason: "delay_not_reached",
      delayMinutes,
      minutesSinceLastOutbound,
      intent,
      nodeId: state.chatbotNodeId,
    };
  }
  const channel = isWindowOpen(state, conversation, now) ? "text" : "template";
  if (channel === "template") {
    if (!tenantConfig.useTemplate) {
      return {
        eligible: false,
        reason: "template_disabled",
        delayMinutes,
        minutesSinceLastOutbound,
        intent,
        nodeId: state.chatbotNodeId,
        channel,
      };
    }
    if (!tenantConfig.templateName) {
      return {
        eligible: false,
        reason: "template_name_missing",
        delayMinutes,
        minutesSinceLastOutbound,
        intent,
        nodeId: state.chatbotNodeId,
        channel,
      };
    }
    if (options.templateApproved !== true) {
      return {
        eligible: false,
        reason: "template_not_approved",
        delayMinutes,
        minutesSinceLastOutbound,
        intent,
        nodeId: state.chatbotNodeId,
        channel,
        templateName: tenantConfig.templateName,
        templateLang: tenantConfig.templateLang,
      };
    }
  }
  if (effectiveFollowUpCount >= maxPerConversation) {
    return {
      eligible: false,
      reason: "limit_reached",
      delayMinutes,
      minutesSinceLastOutbound,
      intent,
      nodeId: state.chatbotNodeId,
    };
  }
  if (effectiveLastSentAt) {
    const lastSentAt = new Date(effectiveLastSentAt);
    if (Number.isFinite(lastSentAt.getTime()) && minutesBetween(now, lastSentAt) < minIntervalMinutes) {
      return {
        eligible: false,
        reason: "min_interval_not_reached",
        delayMinutes,
        minutesSinceLastOutbound,
        intent,
        nodeId: state.chatbotNodeId,
      };
    }
  }

  const nextCount = effectiveFollowUpCount + 1;
  return {
    eligible: true,
    requestId: buildFollowUpRequestId({
      clientId: state.clientId,
      waIdCanonical: state.waIdCanonical,
      waId: state.waId,
      nodeId: state.chatbotNodeId,
      count: nextCount,
      dryRun,
      channel,
    }),
    nextCount,
    delayMinutes,
    minutesSinceLastOutbound,
    message: buildFollowUpMessage(flowContext, flowTags),
    intent,
    nodeId: state.chatbotNodeId,
    channel,
    templateName: channel === "template" ? tenantConfig.templateName : null,
    templateLang: channel === "template" ? tenantConfig.templateLang : null,
  };
}

function isTemplateSkipReason(reason: string) {
  return reason.startsWith("template_");
}

function buildSkipRequestId(state: RuntimeStateForFollowUp, reason: string, now: Date) {
  const bucket = now.toISOString().slice(0, 13);
  return [
    "followup-skipped",
    state.clientId,
    state.waIdCanonical || canonicalizeBrazilWaId(state.waId) || state.waId,
    reason,
    bucket,
  ].join(":");
}

export async function logFollowUpSkipped(params: {
  prisma: PrismaClient;
  state: RuntimeStateForFollowUp;
  eligibility: Extract<FollowUpEligibility, { eligible: false }>;
  now: Date;
  dryRun: boolean;
}) {
  const requestId = buildSkipRequestId(params.state, params.eligibility.reason, params.now);
  const eventName = isTemplateSkipReason(params.eligibility.reason)
    ? "followup.template.skipped"
    : "followup.skipped";
  await params.prisma.event
    .create({
      data: {
        clientId: params.state.clientId,
        waId: params.state.waId,
        waIdCanonical: params.state.waIdCanonical ?? canonicalizeBrazilWaId(params.state.waId),
        requestId,
        eventName,
        payloadJson: {
          action: eventName,
          clientId: params.state.clientId,
          clientKey: params.state.client.clientKey,
          reason: params.eligibility.reason,
          delayMinutes: params.eligibility.delayMinutes,
          minutesSinceLastOutbound: params.eligibility.minutesSinceLastOutbound ?? null,
          intent: params.eligibility.intent ?? null,
          nodeId: params.eligibility.nodeId ?? null,
          channel: params.eligibility.channel ?? null,
          templateName: params.eligibility.templateName ?? null,
          templateLang: params.eligibility.templateLang ?? null,
          dryRun: params.dryRun,
          timestamp: params.now.toISOString(),
        },
      },
    })
    .catch((error) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
      throw error;
    });
  logger.info({
    event: eventName,
    clientId: params.state.clientId,
    clientKey: params.state.client.clientKey,
    reason: params.eligibility.reason,
    delayMinutes: params.eligibility.delayMinutes,
    minutesSinceLastOutbound: params.eligibility.minutesSinceLastOutbound ?? null,
    intent: params.eligibility.intent ?? null,
    nodeId: params.eligibility.nodeId ?? null,
    channel: params.eligibility.channel ?? null,
    templateName: params.eligibility.templateName ?? null,
    templateLang: params.eligibility.templateLang ?? null,
    dryRun: params.dryRun,
  });
}

export async function logFollowUpTriggered(params: {
  prisma: PrismaClient;
  state: RuntimeStateForFollowUp;
  eligibility: Extract<FollowUpEligibility, { eligible: true }>;
  now: Date;
  dryRun: boolean;
}) {
  const triggerRequestId = params.dryRun
    ? params.eligibility.requestId
    : `${params.eligibility.requestId}:triggered:${params.now.toISOString()}`;

  if (params.dryRun) {
    const existing = await params.prisma.event.findUnique({
      where: {
        clientId_eventName_requestId: {
          clientId: params.state.clientId,
          eventName: "followup.triggered",
          requestId: triggerRequestId,
        },
      },
      select: { id: true },
    });
    if (existing) {
      logger.info({
        event: "followup.deduped",
        clientId: params.state.clientId,
        clientKey: params.state.client.clientKey,
        requestId: triggerRequestId,
        nodeId: params.eligibility.nodeId,
        dryRun: params.dryRun,
      });
      return { deduped: true };
    }
  }

  const answers = getAnswers(params.state.answers);
  const triggerEvent = params.prisma.event.create({
    data: {
        clientId: params.state.clientId,
        waId: params.state.waId,
        waIdCanonical: params.state.waIdCanonical ?? canonicalizeBrazilWaId(params.state.waId),
      requestId: triggerRequestId,
      eventName: "followup.triggered",
      payloadJson: {
        action: "followup.triggered",
        clientId: params.state.clientId,
        clientKey: params.state.client.clientKey,
        delayMinutes: params.eligibility.delayMinutes,
        minutesSinceLastOutbound: params.eligibility.minutesSinceLastOutbound,
        intent: params.eligibility.intent,
        nodeId: params.eligibility.nodeId,
        channel: params.eligibility.channel,
        templateName: params.eligibility.templateName ?? null,
        templateLang: params.eligibility.templateLang ?? null,
        followUpCount: params.eligibility.nextCount,
        dryRun: params.dryRun,
        messagePreview: params.eligibility.message,
        sendRequestId: params.dryRun ? null : params.eligibility.requestId,
        timestamp: params.now.toISOString(),
      },
    },
  });

  if (params.dryRun) {
    const nextAnswers = {
      ...answers,
      followUp: {
        count: params.eligibility.nextCount,
        lastSentAt: params.now.toISOString(),
        lastRequestId: params.eligibility.requestId,
        dryRun: true,
      },
    };

    await params.prisma.$transaction([
      triggerEvent,
      params.prisma.conversationRuntimeState.update({
        where: { id: params.state.id },
        data: {
          answers: nextAnswers as Prisma.InputJsonObject,
        },
      }),
    ]);
  } else {
    await triggerEvent;
  }

  logger.info({
    event: "followup.triggered",
    clientId: params.state.clientId,
    clientKey: params.state.client.clientKey,
    requestId: params.eligibility.requestId,
    delayMinutes: params.eligibility.delayMinutes,
    minutesSinceLastOutbound: params.eligibility.minutesSinceLastOutbound,
    intent: params.eligibility.intent,
    nodeId: params.eligibility.nodeId,
    channel: params.eligibility.channel,
    templateName: params.eligibility.templateName ?? null,
    templateLang: params.eligibility.templateLang ?? null,
    followUpCount: params.eligibility.nextCount,
    dryRun: params.dryRun,
  });
  return { deduped: false };
}

async function createFollowUpFailedEvent(params: {
  prisma: PrismaClient;
  state: RuntimeStateForFollowUp;
  eligibility: Extract<FollowUpEligibility, { eligible: true }>;
  now: Date;
  reason: string;
  status?: number | null;
  errorBody?: string | null;
}) {
  await params.prisma.event.create({
    data: {
      clientId: params.state.clientId,
      waId: params.state.waId,
      waIdCanonical: params.state.waIdCanonical ?? canonicalizeBrazilWaId(params.state.waId),
      requestId: `${params.eligibility.requestId}:${params.reason}:${params.now.toISOString()}`,
      eventName: "followup.failed",
      payloadJson: {
        action: "followup.failed",
        reason: params.reason,
        clientId: params.state.clientId,
        clientKey: params.state.client.clientKey,
        intent: params.eligibility.intent,
        nodeId: params.eligibility.nodeId,
        channel: params.eligibility.channel,
        templateName: params.eligibility.templateName ?? null,
        templateLang: params.eligibility.templateLang ?? null,
        dryRun: false,
        status: params.status ?? null,
        errorBody: params.errorBody ?? null,
        timestamp: params.now.toISOString(),
      },
    },
  });
  logger.warn({
    event: "followup.failed",
    reason: params.reason,
    clientId: params.state.clientId,
    clientKey: params.state.client.clientKey,
    requestId: params.eligibility.requestId,
    channel: params.eligibility.channel,
    templateName: params.eligibility.templateName ?? null,
    templateLang: params.eligibility.templateLang ?? null,
    status: params.status ?? null,
  });
}

async function logTenantFollowUpConfigLoaded(params: {
  prisma: PrismaClient;
  clientId: string;
  clientKey: string;
  config: FollowUpTenantConfig;
  now: Date;
}) {
  const requestId = [
    "followup-tenant-config",
    params.clientId,
    params.now.toISOString().slice(0, 13),
  ].join(":");
  await params.prisma.event
    .create({
      data: {
        clientId: params.clientId,
        requestId,
        eventName: "followup.tenant.config.loaded",
        payloadJson: {
          action: "followup.tenant.config.loaded",
          clientId: params.clientId,
          clientKey: params.clientKey,
          enabled: params.config.enabled,
          delayMinutes: params.config.delayMinutes,
          maxCount: params.config.maxCount,
          useTemplate: params.config.useTemplate,
          templateName: params.config.templateName,
          templateLang: params.config.templateLang,
          timestamp: params.now.toISOString(),
        },
      },
    })
    .catch((error) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
      throw error;
    });
  logger.info({
    event: "followup.tenant.config.loaded",
    clientId: params.clientId,
    clientKey: params.clientKey,
    enabled: params.config.enabled,
    delayMinutes: params.config.delayMinutes,
    maxCount: params.config.maxCount,
    useTemplate: params.config.useTemplate,
    templateName: params.config.templateName,
    templateLang: params.config.templateLang,
  });
}

async function sendFollowUpMessage(params: {
  prisma: PrismaClient;
  state: RuntimeStateForFollowUp;
  eligibility: Extract<FollowUpEligibility, { eligible: true }>;
  now: Date;
}) {
  const outboundMessageId = `followup.send.${params.eligibility.requestId}`;
  const sentEventName =
    params.eligibility.channel === "template" ? "followup.template.sent" : "followup.sent";
  const existingSent = await params.prisma.event.findUnique({
    where: {
      clientId_eventName_requestId: {
        clientId: params.state.clientId,
        eventName: sentEventName,
        requestId: `${params.eligibility.requestId}:sent`,
      },
    },
    select: { id: true },
  });
  if (existingSent) {
    logger.info({
      event: "followup.deduped",
      reason: "sent_event_exists",
      clientId: params.state.clientId,
      clientKey: params.state.client.clientKey,
      requestId: params.eligibility.requestId,
      nodeId: params.eligibility.nodeId,
      channel: params.eligibility.channel,
      dryRun: false,
    });
    return { sent: false, deduped: true };
  }

  const existingOutbound = await params.prisma.outboundMessage.findUnique({
    where: {
      clientId_messageId: {
        clientId: params.state.clientId,
        messageId: outboundMessageId,
      },
    },
    select: { id: true, status: true },
  });
  if (existingOutbound?.status === MessageStatus.SENT) {
    logger.info({
      event: "followup.deduped",
      reason: "outbound_sent_exists",
      clientId: params.state.clientId,
      clientKey: params.state.client.clientKey,
      requestId: params.eligibility.requestId,
      outboundMessageId,
      nodeId: params.eligibility.nodeId,
      channel: params.eligibility.channel,
      dryRun: false,
    });
    return { sent: false, deduped: true };
  }

  const credentials = await resolveTenantOutboundCredentials({
    clientId: params.state.clientId,
    clientKey: params.state.client.clientKey,
  });
  let phoneNumberId = credentials?.phoneNumberId;
  let sendResult: { ok: boolean; status?: number; messageId?: string; metaMessageId?: string; errorBody?: string };
  if (params.eligibility.channel === "text") {
    const usageGate = await checkUsageGate({
      clientId: params.state.clientId,
      clientKey: params.state.client.clientKey,
      messageType: "text",
      requestId: params.eligibility.requestId,
      waId: params.state.waId,
    });
    if (!usageGate.allowed) {
      await createFollowUpFailedEvent({
        prisma: params.prisma,
        state: params.state,
        eligibility: params.eligibility,
        now: params.now,
        reason: "usage_limit_reached",
      });
      return { sent: false };
    }
    if (!credentials) {
      await createFollowUpFailedEvent({
        prisma: params.prisma,
        state: params.state,
        eligibility: params.eligibility,
        now: params.now,
        reason: "tenant_outbound_credentials_missing",
      });
      return { sent: false };
    }
    sendResult = await sendTextMessage(params.state.waId, params.eligibility.message, {
      accessToken: credentials.accessToken,
      phoneNumberId: credentials.phoneNumberId,
    });
  } else {
    const templateName = params.eligibility.templateName?.trim();
    if (!templateName) {
      await logFollowUpSkipped({
        prisma: params.prisma,
        state: params.state,
        eligibility: {
          eligible: false,
          reason: "template_name_missing",
          delayMinutes: params.eligibility.delayMinutes,
          minutesSinceLastOutbound: params.eligibility.minutesSinceLastOutbound,
          intent: params.eligibility.intent,
          nodeId: params.eligibility.nodeId,
          channel: "template",
        },
        now: params.now,
        dryRun: false,
      });
      return { sent: false };
    }
    const templateResult = await sendTemplate({
      toE164: params.state.waId,
      waId: params.state.waId,
      intent: undefined,
      templateName,
      lang: params.eligibility.templateLang ?? undefined,
      requestId: params.eligibility.requestId,
      messageId: outboundMessageId,
      clientId: params.state.clientId,
      clientKey: params.state.client.clientKey,
    });
    sendResult = {
      ok: templateResult.ok,
      status: templateResult.status,
      messageId: templateResult.metaMessageId,
      metaMessageId: templateResult.metaMessageId,
      errorBody: templateResult.errorBody,
    };
  }
  const sentAt = new Date();
  const status = sendResult.ok ? MessageStatus.SENT : MessageStatus.FAILED;

  await persistOutboundMessage({
    clientId: params.state.clientId,
    phoneNumberId,
    waId: params.state.waId,
    waIdCanonical: params.state.waIdCanonical ?? canonicalizeBrazilWaId(params.state.waId),
    messageId: outboundMessageId,
    type: params.eligibility.channel === "template" ? MessageType.TEMPLATE : MessageType.TEXT,
    status,
    bodyText: params.eligibility.channel === "text" ? params.eligibility.message : null,
    templateName: params.eligibility.channel === "template" ? params.eligibility.templateName : null,
    templateLang: params.eligibility.channel === "template" ? params.eligibility.templateLang : null,
    requestId: params.eligibility.requestId,
    metaMessageId: sendResult.messageId ?? sendResult.metaMessageId ?? null,
    errorBody: sendResult.errorBody ?? null,
    rawPayload: {
      source: "followup",
      dryRun: false,
      channel: params.eligibility.channel,
      templateName: params.eligibility.templateName ?? null,
      templateLang: params.eligibility.templateLang ?? null,
      status: sendResult.status ?? null,
      credentialSource: credentials?.source ?? null,
      errorBody: sendResult.errorBody ?? null,
    },
  });

  if (!sendResult.ok) {
    await createFollowUpFailedEvent({
      prisma: params.prisma,
      state: params.state,
      eligibility: params.eligibility,
      now: sentAt,
      reason: "send_failed",
      status: sendResult.status ?? null,
      errorBody: sendResult.errorBody ?? null,
    });
    logger.error({
      event: "followup.failed",
      reason: "send_failed",
      clientId: params.state.clientId,
      clientKey: params.state.client.clientKey,
      requestId: params.eligibility.requestId,
      channel: params.eligibility.channel,
      status: sendResult.status ?? null,
      errorBody: sendResult.errorBody ?? null,
    });
    return { sent: false };
  }

  const answers = getAnswers(params.state.answers);
  const nextAnswers = {
    ...answers,
    followUp: {
      count: params.eligibility.nextCount,
      lastSentAt: sentAt.toISOString(),
      lastRequestId: params.eligibility.requestId,
      dryRun: false,
      lastChannel: params.eligibility.channel,
      templateName: params.eligibility.templateName ?? null,
      templateLang: params.eligibility.templateLang ?? null,
      metaMessageId: sendResult.messageId ?? sendResult.metaMessageId ?? null,
    },
  };

  await params.prisma.$transaction([
    params.prisma.event.create({
      data: {
        clientId: params.state.clientId,
        waId: params.state.waId,
        waIdCanonical: params.state.waIdCanonical ?? canonicalizeBrazilWaId(params.state.waId),
        messageId: outboundMessageId,
        requestId: `${params.eligibility.requestId}:sent`,
        eventName: sentEventName,
        payloadJson: {
          action: sentEventName,
          clientId: params.state.clientId,
          clientKey: params.state.client.clientKey,
          intent: params.eligibility.intent,
          nodeId: params.eligibility.nodeId,
          channel: params.eligibility.channel,
          templateName: params.eligibility.templateName ?? null,
          templateLang: params.eligibility.templateLang ?? null,
          followUpCount: params.eligibility.nextCount,
          dryRun: false,
          metaMessageId: sendResult.messageId ?? sendResult.metaMessageId ?? null,
          timestamp: sentAt.toISOString(),
        },
      },
    }),
    params.prisma.conversationRuntimeState.update({
      where: { id: params.state.id },
      data: {
        answers: nextAnswers as Prisma.InputJsonObject,
        lastOutboundAt: sentAt,
      },
    }),
    params.prisma.conversation.updateMany({
      where: {
        clientId: params.state.clientId,
        waId: params.state.waId,
      },
      data: {
        lastOutboundAt: sentAt,
      },
    }),
  ]);

  logger.info({
    event: sentEventName,
    clientId: params.state.clientId,
    clientKey: params.state.client.clientKey,
    requestId: params.eligibility.requestId,
    metaMessageId: sendResult.messageId ?? sendResult.metaMessageId ?? null,
    nodeId: params.eligibility.nodeId,
    channel: params.eligibility.channel,
    templateName: params.eligibility.templateName ?? null,
    templateLang: params.eligibility.templateLang ?? null,
    followUpCount: params.eligibility.nextCount,
    dryRun: false,
  });
  return { sent: true };
}

export async function findEligibleFollowUps(options: FollowUpOptions & { limit?: number } = {}) {
  const prisma = getPrisma();
  const now = options.now ?? new Date();
  const dryRun = options.dryRun ?? env.FOLLOWUP_DRY_RUN;
  const result: FollowUpRunResult = {
    enabled: env.FOLLOWUP_ENABLED,
    dryRun,
    scanned: 0,
    triggered: 0,
    skipped: 0,
    deduped: 0,
    sent: 0,
    failed: 0,
  };

  if (!env.FOLLOWUP_ENABLED) {
    logger.info({
      event: "followup.run.skipped",
      reason: "followup_disabled",
      dryRun,
    });
    return result;
  }

  const states = await prisma.conversationRuntimeState.findMany({
    where: {
      chatbotActive: true,
      chatbotNodeId: { not: null },
      handoffStatus: HandoffStatus.NONE,
      OR: [{ mode: null }, { mode: { not: "HUMAN" } }],
    },
    include: {
      client: {
        select: {
          clientKey: true,
          name: true,
        },
      },
    },
    orderBy: { lastOutboundAt: "asc" },
    take: Math.max(1, Math.min(options.limit ?? 200, 500)),
  });

  const configByClientKey = new Map<string, FollowUpTenantConfig>();
  const templateApprovalByClientAndName = new Map<string, boolean>();

  for (const state of states) {
    result.scanned += 1;
    let tenantConfig = configByClientKey.get(state.client.clientKey);
    if (!tenantConfig) {
      tenantConfig = resolveFollowUpTenantConfig(await getTenant(state.client.clientKey));
      configByClientKey.set(state.client.clientKey, tenantConfig);
      await logTenantFollowUpConfigLoaded({
        prisma,
        clientId: state.clientId,
        clientKey: state.client.clientKey,
        config: tenantConfig,
        now,
      });
    }
    const conversation = await prisma.conversation.findUnique({
      where: {
        clientId_waId: {
          clientId: state.clientId,
          waId: state.waId,
        },
      },
      select: {
        id: true,
        deletedAt: true,
        anonymizedAt: true,
        closedAt: true,
        windowIsOpen: true,
        windowExpiresAt: true,
      },
    });
    let templateApproved = false;
    if (!isWindowOpen(state, conversation, now) && tenantConfig.templateName) {
      const approvalKey = `${state.clientId}:${tenantConfig.templateName}:${tenantConfig.templateLang ?? ""}`;
      if (templateApprovalByClientAndName.has(approvalKey)) {
        templateApproved = templateApprovalByClientAndName.get(approvalKey) === true;
      } else {
        const template = await prisma.template.findFirst({
          where: {
            clientId: state.clientId,
            name: tenantConfig.templateName,
            ...(tenantConfig.templateLang ? { language: tenantConfig.templateLang } : {}),
          },
          select: { status: true },
        });
        templateApproved = String(template?.status ?? "").toUpperCase() === "APPROVED";
        templateApprovalByClientAndName.set(approvalKey, templateApproved);
      }
    }
    const eligibility = evaluateFollowUpEligibility(state, conversation, {
      ...options,
      dryRun,
      tenantConfig,
      templateApproved,
    });
    if (!eligibility.eligible) {
      result.skipped += 1;
      await logFollowUpSkipped({ prisma, state, eligibility, now, dryRun });
      continue;
    }
    const triggered = await logFollowUpTriggered({ prisma, state, eligibility, now, dryRun });
    if (triggered.deduped) {
      result.deduped += 1;
    } else {
      result.triggered += 1;
      if (!dryRun) {
        const sent = await sendFollowUpMessage({ prisma, state, eligibility, now });
        if (sent.deduped) {
          result.deduped += 1;
        } else if (sent.sent) {
          result.sent += 1;
        } else {
          result.failed += 1;
        }
      }
    }
  }

  logger.info({
    event: "followup.run.completed",
    ...result,
  });
  return result;
}
