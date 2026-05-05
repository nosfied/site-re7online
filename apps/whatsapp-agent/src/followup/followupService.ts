import { ConversationOperationalStatus, HandoffStatus, Prisma, PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";
import { getPrisma } from "../db.js";
import { logger } from "../logger/logger.js";
import { canonicalizeBrazilWaId } from "../utils/waid.js";

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
};

type FollowUpOptions = {
  now?: Date;
  delayMinutes?: number;
  maxPerConversation?: number;
  minIntervalMinutes?: number;
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
    }
  | {
      eligible: false;
      reason: string;
      delayMinutes: number;
      minutesSinceLastOutbound?: number;
      intent?: string | null;
      nodeId?: string | null;
    };

type FollowUpRunResult = {
  enabled: boolean;
  dryRun: true;
  scanned: number;
  triggered: number;
  skipped: number;
  deduped: number;
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
}) {
  return [
    "followup",
    params.clientId,
    params.waIdCanonical || canonicalizeBrazilWaId(params.waId) || params.waId,
    params.nodeId,
    params.count,
  ].join(":");
}

export function evaluateFollowUpEligibility(
  state: RuntimeStateForFollowUp,
  conversation: ConversationForFollowUp | null,
  options: FollowUpOptions = {}
): FollowUpEligibility {
  const now = options.now ?? new Date();
  const delayMinutes = Math.max(1, options.delayMinutes ?? env.FOLLOWUP_DEFAULT_DELAY_MINUTES);
  const maxPerConversation = Math.max(0, options.maxPerConversation ?? env.FOLLOWUP_MAX_PER_CONVERSATION);
  const minIntervalMinutes = Math.max(
    1,
    options.minIntervalMinutes ?? env.FOLLOWUP_MIN_INTERVAL_MINUTES
  );
  const answers = getAnswers(state.answers);
  const followUp = getFollowUpControl(answers);
  const flowContext = getFlowContext(answers);
  const flowTags = getFlowTags(answers);
  const intent = normalizeContextValue(flowContext, ["intent", "servico", "service"]);

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
  if (!isWindowOpen(state, conversation, now)) {
    return {
      eligible: false,
      reason: "window_closed",
      delayMinutes,
      minutesSinceLastOutbound,
      intent,
      nodeId: state.chatbotNodeId,
    };
  }
  if (followUp.count >= maxPerConversation) {
    return {
      eligible: false,
      reason: "limit_reached",
      delayMinutes,
      minutesSinceLastOutbound,
      intent,
      nodeId: state.chatbotNodeId,
    };
  }
  if (followUp.lastSentAt) {
    const lastSentAt = new Date(followUp.lastSentAt);
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

  const nextCount = followUp.count + 1;
  return {
    eligible: true,
    requestId: buildFollowUpRequestId({
      clientId: state.clientId,
      waIdCanonical: state.waIdCanonical,
      waId: state.waId,
      nodeId: state.chatbotNodeId,
      count: nextCount,
    }),
    nextCount,
    delayMinutes,
    minutesSinceLastOutbound,
    message: buildFollowUpMessage(flowContext, flowTags),
    intent,
    nodeId: state.chatbotNodeId,
  };
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
}) {
  const requestId = buildSkipRequestId(params.state, params.eligibility.reason, params.now);
  await params.prisma.event
    .create({
      data: {
        clientId: params.state.clientId,
        waId: params.state.waId,
        waIdCanonical: params.state.waIdCanonical ?? canonicalizeBrazilWaId(params.state.waId),
        requestId,
        eventName: "followup.skipped",
        payloadJson: {
          action: "followup.skipped",
          clientId: params.state.clientId,
          clientKey: params.state.client.clientKey,
          reason: params.eligibility.reason,
          delayMinutes: params.eligibility.delayMinutes,
          minutesSinceLastOutbound: params.eligibility.minutesSinceLastOutbound ?? null,
          intent: params.eligibility.intent ?? null,
          nodeId: params.eligibility.nodeId ?? null,
          dryRun: true,
          timestamp: params.now.toISOString(),
        },
      },
    })
    .catch((error) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
      throw error;
    });
  logger.info({
    event: "followup.skipped",
    clientId: params.state.clientId,
    clientKey: params.state.client.clientKey,
    reason: params.eligibility.reason,
    delayMinutes: params.eligibility.delayMinutes,
    minutesSinceLastOutbound: params.eligibility.minutesSinceLastOutbound ?? null,
    intent: params.eligibility.intent ?? null,
    nodeId: params.eligibility.nodeId ?? null,
    dryRun: true,
  });
}

export async function logFollowUpTriggered(params: {
  prisma: PrismaClient;
  state: RuntimeStateForFollowUp;
  eligibility: Extract<FollowUpEligibility, { eligible: true }>;
  now: Date;
}) {
  const existing = await params.prisma.event.findUnique({
    where: {
      clientId_eventName_requestId: {
        clientId: params.state.clientId,
        eventName: "followup.triggered",
        requestId: params.eligibility.requestId,
      },
    },
    select: { id: true },
  });
  if (existing) {
    logger.info({
      event: "followup.deduped",
      clientId: params.state.clientId,
      clientKey: params.state.client.clientKey,
      requestId: params.eligibility.requestId,
      nodeId: params.eligibility.nodeId,
      dryRun: true,
    });
    return { deduped: true };
  }

  const answers = getAnswers(params.state.answers);
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
    params.prisma.event.create({
      data: {
        clientId: params.state.clientId,
        waId: params.state.waId,
        waIdCanonical: params.state.waIdCanonical ?? canonicalizeBrazilWaId(params.state.waId),
        requestId: params.eligibility.requestId,
        eventName: "followup.triggered",
        payloadJson: {
          action: "followup.triggered",
          clientId: params.state.clientId,
          clientKey: params.state.client.clientKey,
          delayMinutes: params.eligibility.delayMinutes,
          minutesSinceLastOutbound: params.eligibility.minutesSinceLastOutbound,
          intent: params.eligibility.intent,
          nodeId: params.eligibility.nodeId,
          followUpCount: params.eligibility.nextCount,
          dryRun: true,
          messagePreview: params.eligibility.message,
          timestamp: params.now.toISOString(),
        },
      },
    }),
    params.prisma.conversationRuntimeState.update({
      where: { id: params.state.id },
      data: {
        answers: nextAnswers as Prisma.InputJsonObject,
      },
    }),
  ]);

  logger.info({
    event: "followup.triggered",
    clientId: params.state.clientId,
    clientKey: params.state.client.clientKey,
    requestId: params.eligibility.requestId,
    delayMinutes: params.eligibility.delayMinutes,
    minutesSinceLastOutbound: params.eligibility.minutesSinceLastOutbound,
    intent: params.eligibility.intent,
    nodeId: params.eligibility.nodeId,
    followUpCount: params.eligibility.nextCount,
    dryRun: true,
  });
  return { deduped: false };
}

export async function findEligibleFollowUps(options: FollowUpOptions & { limit?: number } = {}) {
  const prisma = getPrisma();
  const now = options.now ?? new Date();
  const result: FollowUpRunResult = {
    enabled: env.FOLLOWUP_ENABLED,
    dryRun: true,
    scanned: 0,
    triggered: 0,
    skipped: 0,
    deduped: 0,
  };

  if (!env.FOLLOWUP_ENABLED) {
    logger.info({
      event: "followup.run.skipped",
      reason: "followup_disabled",
      dryRun: true,
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

  for (const state of states) {
    result.scanned += 1;
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
    const eligibility = evaluateFollowUpEligibility(state, conversation, options);
    if (!eligibility.eligible) {
      result.skipped += 1;
      await logFollowUpSkipped({ prisma, state, eligibility, now });
      continue;
    }
    const triggered = await logFollowUpTriggered({ prisma, state, eligibility, now });
    if (triggered.deduped) {
      result.deduped += 1;
    } else {
      result.triggered += 1;
    }
  }

  logger.info({
    event: "followup.run.completed",
    ...result,
  });
  return result;
}
