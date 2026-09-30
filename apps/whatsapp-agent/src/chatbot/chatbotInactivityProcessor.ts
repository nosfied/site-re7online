import { HandoffStatus, Prisma, type PrismaClient } from "@prisma/client";
import { validateChatbotFlowDefinition } from "./chatbotFlow.js";
import { resolveChatbotConsentPrecedence } from "./chatbotConsentRuntime.js";
import { resolveDepartmentAwareHandoff } from "./departmentAwareHandoff.js";
import type { ConversationState } from "../conversation/conversation.types.js";
import { isWindowOpen } from "../conversation/conversation.service.js";
import {
  ensureActiveServiceCycle,
  recordServiceCycleEvent,
  type ServiceCycleSnapshot,
} from "../conversation/serviceCycle.js";
import { buildConversationProtocolNotice } from "../inbox/conversationProtocol.js";
import { logger } from "../logger/logger.js";
import { applyBalancedQueueAssignment } from "../queue/assignmentPolicy.js";
import { getQueuePosition } from "../queue/queuePosition.js";
import { createWebSessionTextOutboundMessage } from "../web-session/webSessionOutboundService.js";
import { resolveServiceMessagePolicySettings } from "../config/tenantOperationalConfig.js";

const DEFAULT_QUEUE_POSITION_TEXT = "Você é o nº {position} da fila de atendimento.";
const DEFAULT_OFF_HOURS_TEXT =
  "No momento não temos nenhum atendente disponível. Você será atendido no primeiro horário do próximo expediente.";
const INACTIVITY_SKIP_EVENT_NAME = "chatbot.inactivity.handoff.skipped";
export const CONSENT_PENDING_INACTIVITY_SKIP_EVENT_COOLDOWN_MS = 30 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getRuntimeLastInteractionAt(answers: unknown) {
  const runtime = isRecord(answers) && isRecord(answers.chatbotRuntime) ? answers.chatbotRuntime : null;
  const value = runtime ? runtime.lastInteractionAt : null;
  return typeof value === "string" && value.trim() ? new Date(value) : null;
}

export function resolveInactivityHandoffDestination(params: {
  departmentId?: string | null;
  queueId?: string | null;
}) {
  const departmentId = getNonEmptyString(params.departmentId);
  const queueId = getNonEmptyString(params.queueId);
  return departmentId && queueId ? { departmentId, queueId } : null;
}

function getInactivityPolicy(definition: unknown) {
  if (!isRecord(definition) || !isRecord(definition.inactivityPolicy)) return null;
  const raw = definition.inactivityPolicy;
  const timeoutMinutes = typeof raw.timeoutMinutes === "number" && Number.isFinite(raw.timeoutMinutes)
    ? Math.floor(raw.timeoutMinutes)
    : null;
  const action = getNonEmptyString(raw.action)?.toUpperCase();
  if (!timeoutMinutes || timeoutMinutes <= 0 || action !== "HANDOFF") return null;
  return { timeoutMinutes };
}

function getClosedHandoffPolicy(definition: unknown) {
  const raw = isRecord(definition) && isRecord(definition.closedHandoffPolicy)
    ? definition.closedHandoffPolicy
    : {};
  const action = getNonEmptyString(raw.action)?.toUpperCase();
  const queuePositionText = getNonEmptyString(raw.queuePositionText);
  return {
    queueClosed: action === "QUEUE_FOR_NEXT_OPEN",
    queuePositionText: queuePositionText ?? DEFAULT_QUEUE_POSITION_TEXT,
    hasQueuePositionTextOverride: Boolean(queuePositionText),
    offHoursMessage: getNonEmptyString(raw.offHoursMessage) ?? DEFAULT_OFF_HOURS_TEXT,
  };
}

function renderProtocolNoticeTemplate(input: string | null, protocol: string) {
  if (!input) return buildConversationProtocolNotice(protocol);
  const rendered = input.replace(/\{\{\s*protocol\s*\}\}/gi, protocol).replace(/\{protocol\}/g, protocol);
  return rendered.includes(protocol) ? rendered : `${rendered}\nProtocolo: ${protocol}`;
}

async function recordInactivityHandoffSkipped(params: {
  prisma: PrismaClient;
  clientId: string;
  conversationId?: string | null;
  waId: string;
  waIdCanonical: string | null;
  runtimeStateId: string;
  now: Date;
  reason: string;
  payload?: Prisma.InputJsonObject;
}) {
  if (!(await shouldRecordInactivitySkipEvent(params))) return;
  await params.prisma.event.create({
    data: {
      clientId: params.clientId,
      conversationId: params.conversationId ?? null,
      waId: params.waId,
      waIdCanonical: params.waIdCanonical,
      requestId: `chatbot-inactivity:${params.runtimeStateId}:${params.reason}:${params.now.toISOString()}`,
      eventName: INACTIVITY_SKIP_EVENT_NAME,
      payloadJson: {
        reason: params.reason,
        runtimeStateId: params.runtimeStateId,
        ...(params.payload ?? {}),
      } satisfies Prisma.InputJsonObject,
    },
  });
}

export async function shouldRecordInactivitySkipEvent(params: {
  prisma: PrismaClient;
  clientId: string;
  conversationId?: string | null;
  runtimeStateId: string;
  now: Date;
  reason: string;
}) {
  if (params.reason !== "consent_pending") return true;
  const cutoff = new Date(params.now.getTime() - CONSENT_PENDING_INACTIVITY_SKIP_EVENT_COOLDOWN_MS);
  const recent = await params.prisma.event.findFirst({
    where: {
      clientId: params.clientId,
      eventName: INACTIVITY_SKIP_EVENT_NAME,
      createdAt: { gte: cutoff },
      ...(params.conversationId ? { conversationId: params.conversationId } : {}),
      payloadJson: {
        path: ["reason"],
        equals: params.reason,
      },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, payloadJson: true },
  });
  if (!recent) return true;
  if (params.conversationId) return false;
  return !(
    isRecord(recent.payloadJson) &&
    recent.payloadJson.runtimeStateId === params.runtimeStateId
  );
}

export async function claimChatbotInactivityHandoff(params: {
  prisma: PrismaClient;
  runtimeStateId: string;
  expectedAnswers: unknown;
  nextAnswers: Prisma.InputJsonValue;
  now: Date;
  departmentId: string | null;
  queueId: string | null;
}) {
  const destination = resolveInactivityHandoffDestination(params);
  if (!destination) return { count: 0 };
  return params.prisma.conversationRuntimeState.updateMany({
    where: {
      id: params.runtimeStateId,
      chatbotActive: true,
      mode: "BOT",
      handoffStatus: HandoffStatus.NONE,
      assignedUserId: null,
      closedAt: null,
      answers: { equals: params.expectedAnswers as Prisma.InputJsonValue },
    },
    data: {
      mode: "HUMAN",
      status: "WAITING",
      chatbotActive: false,
      chatbotNodeId: null,
      handoffStatus: HandoffStatus.ACTIVE,
      handoffActivatedAt: params.now,
      assignedUserId: null,
      assignedTo: null,
      assignedAt: null,
      departmentId: destination.departmentId,
      queueId: destination.queueId,
      answers: params.nextAnswers,
    },
  });
}

async function sendBotText(params: {
  prisma: PrismaClient;
  clientId: string;
  clientKey: string;
  waId: string;
  waIdCanonical: string | null;
  channelAccountId: string | null;
  requestId: string;
  text: string;
  serviceCycle: ServiceCycleSnapshot;
  conversation: ConversationState;
}) {
  if (!params.text.trim()) return { sent: false as const, reason: "empty_text" as const };
  if (!isWindowOpen(params.conversation, Date.now())) {
    return { sent: false as const, reason: "window_closed" as const };
  }
  const result = await createWebSessionTextOutboundMessage({
    prisma: params.prisma,
    waId: params.waId,
    waIdCanonical: params.waIdCanonical ?? params.waId,
    text: params.text,
    clientKey: params.clientKey,
    clientId: params.clientId,
    requestId: params.requestId,
    actorUserId: null,
    outboundSource: "bot",
    skipAgentSignature: true,
    serviceCycle: params.serviceCycle,
    conversation: params.conversation,
    source: {
      channel: "whatsapp",
      provider: "web_session",
      channelAccountId: params.channelAccountId,
    },
  });
  return result.ok ? { sent: true as const, status: result.status } : { sent: false as const, reason: result.error };
}

export async function processChatbotInactivityTimeouts(params: {
  prisma: PrismaClient;
  now?: Date;
  limit?: number;
}) {
  const now = params.now ?? new Date();
  const candidates = await params.prisma.conversationRuntimeState.findMany({
    where: {
      chatbotActive: true,
      mode: "BOT",
      flow: { startsWith: "chatbot:" },
      handoffStatus: HandoffStatus.NONE,
      assignedUserId: null,
      closedAt: null,
    },
    orderBy: { updatedAt: "asc" },
    take: params.limit ?? 100,
    select: {
      id: true,
      clientId: true,
      waId: true,
      waIdCanonical: true,
      channelAccountId: true,
      firstSeenAt: true,
      lastInboundAt: true,
      windowIsOpen: true,
      windowExpiresAt: true,
      flow: true,
      answers: true,
      departmentId: true,
      queueId: true,
    },
  });
  let processed = 0;
  for (const state of candidates) {
    const flowId = state.flow?.startsWith("chatbot:") ? state.flow.slice("chatbot:".length) : null;
    if (!flowId) continue;
    const flow = await params.prisma.chatbotFlow.findFirst({
      where: { id: flowId, clientId: state.clientId, isActive: true },
      select: { id: true, definition: true },
    });
    const validated = validateChatbotFlowDefinition(flow?.definition);
    if (!validated.ok) continue;
    const policy = getInactivityPolicy(validated.definition);
    if (!policy) continue;
    const lastInteractionAt = getRuntimeLastInteractionAt(state.answers);
    if (!lastInteractionAt || !Number.isFinite(lastInteractionAt.getTime())) continue;
    const idleMinutes = (now.getTime() - lastInteractionAt.getTime()) / 60000;
    if (idleMinutes < policy.timeoutMinutes) continue;
    const alreadyTriggered = isRecord(state.answers) &&
      isRecord(state.answers.chatbotRuntime) &&
      state.answers.chatbotRuntime.inactivityHandoffTriggeredAt;
    if (alreadyTriggered) continue;
    const currentRuntimeWindowState = {
      waId: state.waId,
      waIdCanonical: state.waIdCanonical ?? state.waId,
      firstSeenAt: state.firstSeenAt?.toISOString() ?? state.lastInboundAt?.toISOString() ?? now.toISOString(),
      lastInboundAt: state.lastInboundAt?.toISOString() ?? "",
      window: {
        isOpen: state.windowIsOpen,
        expiresAt: state.windowExpiresAt?.toISOString(),
      },
      handoff: { status: "none" },
      answers: isRecord(state.answers) ? state.answers : {},
      mode: "BOT",
    } as ConversationState;
    if (!isWindowOpen(currentRuntimeWindowState, now.getTime())) {
      await recordInactivityHandoffSkipped({
        prisma: params.prisma,
        clientId: state.clientId,
        waId: state.waId,
        waIdCanonical: state.waIdCanonical,
        runtimeStateId: state.id,
        now,
        reason: "window_closed",
      });
      continue;
    }
    const consentPrecedence = await resolveChatbotConsentPrecedence({
      prisma: params.prisma,
      clientId: state.clientId,
      waId: state.waId,
      state: { waId: state.waId, answers: state.answers } as ConversationState,
      definition: validated.definition,
    });
    if (!consentPrecedence.accepted) {
      const conversation = await params.prisma.conversation.findUnique({
        where: { clientId_waId: { clientId: state.clientId, waId: state.waId } },
        select: { id: true },
      });
      await recordInactivityHandoffSkipped({
        prisma: params.prisma,
        clientId: state.clientId,
        conversationId: conversation?.id ?? null,
        waId: state.waId,
        waIdCanonical: state.waIdCanonical,
        runtimeStateId: state.id,
        now,
        reason: "consent_pending",
        payload: {
          pendingConsentNodeIds: consentPrecedence.pendingNodeIds,
        },
      });
      continue;
    }

    const fallbackHandoff = {
      feedbackText: getNonEmptyString(validated.definition.handoffTransitionMessage) ??
        "Vou te encaminhar para atendimento humano.",
      summary: "Atendimento encaminhado automaticamente por inatividade na automação.",
      suggestedReply: "Olá, tudo bem? Vou continuar seu atendimento.",
      tags: ["inactivity_timeout"],
      nodeId: "inactivity_timeout",
      departmentId: state.departmentId,
      queueId: state.queueId,
      closedText: null,
    };
    const decision = await resolveDepartmentAwareHandoff(params.prisma, {
      clientId: state.clientId,
      pendingHandoff: fallbackHandoff,
      currentDepartmentId: state.departmentId,
      currentQueueId: state.queueId,
      at: now,
    });
    if (decision.kind === "blocked") continue;
    const closedPolicy = getClosedHandoffPolicy(validated.definition);
    if (decision.kind === "closed" && !closedPolicy.queueClosed) continue;
    const destination = resolveInactivityHandoffDestination({
      departmentId: decision.departmentId ?? state.departmentId,
      queueId: decision.queueId ?? state.queueId,
    });
    if (!destination) {
      await recordInactivityHandoffSkipped({
        prisma: params.prisma,
        clientId: state.clientId,
        waId: state.waId,
        waIdCanonical: state.waIdCanonical,
        runtimeStateId: state.id,
        now,
        reason: "missing_operational_destination",
        payload: {
          decisionKind: decision.kind,
          departmentId: decision.departmentId ?? state.departmentId ?? null,
          queueId: decision.queueId ?? state.queueId ?? null,
        },
      });
      continue;
    }
    const [client, conversation] = await Promise.all([
      params.prisma.client.findUnique({
        where: { id: state.clientId },
        select: { clientKey: true },
      }),
      params.prisma.conversation.findUnique({
        where: { clientId_waId: { clientId: state.clientId, waId: state.waId } },
        select: { id: true },
      }),
    ]);
    if (!client) continue;
    const runtime = isRecord(state.answers) && isRecord(state.answers.chatbotRuntime)
      ? state.answers.chatbotRuntime
      : {};
    const cycleResult = ensureActiveServiceCycle(
      { answers: state.answers } as ConversationState,
      now,
      "web_session"
    );
    const nextAnswers = {
      ...(isRecord(cycleResult.state.answers) ? cycleResult.state.answers : {}),
      chatbotRuntime: {
        ...runtime,
        inactivityHandoffTriggeredAt: now.toISOString(),
      },
    };
    const claimed = await claimChatbotInactivityHandoff({
      prisma: params.prisma,
      runtimeStateId: state.id,
      expectedAnswers: state.answers,
      nextAnswers: nextAnswers as Prisma.InputJsonValue,
      now,
      departmentId: destination.departmentId,
      queueId: destination.queueId,
    });
    if (claimed.count !== 1) continue;
    if (decision.kind !== "closed") {
      await applyBalancedQueueAssignment({
        prisma: params.prisma,
        clientId: state.clientId,
        conversationId: conversation?.id ?? null,
        runtimeStateId: state.id,
        waId: state.waId,
        waIdCanonical: state.waIdCanonical,
        departmentId: destination.departmentId,
        queueId: destination.queueId,
        status: "WAITING",
        assignedUserId: null,
        requestId: `chatbot-inactivity:${state.id}`,
        source: "whatsapp.web.chatbot.inactivity_handoff",
      });
    }
    if (cycleResult.created) {
      await recordServiceCycleEvent({
        prisma: params.prisma,
        clientId: state.clientId,
        conversationId: conversation?.id ?? null,
        waId: state.waId,
        waIdCanonical: state.waIdCanonical,
        requestId: `chatbot-inactivity:${state.id}`,
        action: "started",
        cycle: cycleResult.cycle,
      });
    }
    await sendBotText({
      prisma: params.prisma,
      clientId: state.clientId,
      clientKey: client.clientKey,
      waId: state.waId,
      waIdCanonical: state.waIdCanonical,
      channelAccountId: state.channelAccountId,
      requestId: `chatbot-inactivity:${state.id}:handoff`,
      text: fallbackHandoff.feedbackText,
      serviceCycle: cycleResult.cycle,
        conversation: currentRuntimeWindowState,
    });
    const protocol = cycleResult.cycle.protocol;
    const serviceMessages = await resolveServiceMessagePolicySettings({
      prisma: params.prisma,
      clientId: state.clientId,
    });
    if (serviceMessages.settings.protocolNotice.enabled) {
      await sendBotText({
        prisma: params.prisma,
        clientId: state.clientId,
        clientKey: client.clientKey,
        waId: state.waId,
        waIdCanonical: state.waIdCanonical,
        channelAccountId: state.channelAccountId,
        requestId: `chatbot-inactivity:${state.id}:protocol`,
        text: renderProtocolNoticeTemplate(serviceMessages.settings.protocolNotice.text, protocol),
        serviceCycle: cycleResult.cycle,
        conversation: currentRuntimeWindowState,
      });
    }
    const position = await getQueuePosition({
      prisma: params.prisma,
      clientId: state.clientId,
      runtimeStateId: state.id,
      queueId: destination.queueId,
    });
    if (position && serviceMessages.settings.queuePositionNotice.enabled) {
      await sendBotText({
        prisma: params.prisma,
        clientId: state.clientId,
        clientKey: client.clientKey,
        waId: state.waId,
        waIdCanonical: state.waIdCanonical,
        channelAccountId: state.channelAccountId,
        requestId: `chatbot-inactivity:${state.id}:position`,
        text: (
          closedPolicy.hasQueuePositionTextOverride
            ? closedPolicy.queuePositionText
            : serviceMessages.settings.queuePositionNotice.text ?? closedPolicy.queuePositionText
        ).replace("{position}", String(position)),
        serviceCycle: cycleResult.cycle,
        conversation: currentRuntimeWindowState,
      });
    }
    if (decision.kind === "closed") {
      await sendBotText({
        prisma: params.prisma,
        clientId: state.clientId,
        clientKey: client.clientKey,
        waId: state.waId,
        waIdCanonical: state.waIdCanonical,
        channelAccountId: state.channelAccountId,
        requestId: `chatbot-inactivity:${state.id}:off-hours`,
        text: closedPolicy.offHoursMessage,
        serviceCycle: cycleResult.cycle,
        conversation: currentRuntimeWindowState,
      });
    }
    processed += 1;
  }
  return { processed };
}

export function startChatbotInactivityProcessor(params: {
  prisma: PrismaClient;
  intervalMs?: number;
}) {
  const intervalMs = params.intervalMs ?? 60_000;
  const timer = setInterval(() => {
    processChatbotInactivityTimeouts({ prisma: params.prisma }).catch((error) => {
      logger.error({
        event: "chatbot.inactivity.processor.error",
        message: error instanceof Error ? error.message : "unknown_error",
      });
    });
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
