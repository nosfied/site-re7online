import { captureRuntimeWriteToken, updateRuntimeIfUnchanged, type RuntimeWriteToken } from "../conversation/runtimeWriteFence.js";
import crypto from "node:crypto";
import { HandoffStatus, MessageType, Prisma, type PrismaClient } from "@prisma/client";
import { findDefaultOperationalDepartment } from "../bootstrap/defaultOperationalDepartment.js";
import {
  clearChatbotRuntime,
  extractChatbotFlowId,
  getChatbotConsentKey,
  type ChatbotFlowDefinition,
  validateChatbotFlowDefinition,
} from "../chatbot/chatbotFlow.js";
import { executeChatbotFlowWithConsent, isChatbotConsentRequired } from "../chatbot/chatbotConsentRuntime.js";
import { resolveInitialContactLifecycle } from "../contacts/contactLifecycle.js";
import { reactivateOperationallyExcludedContactIfNeeded } from "../contacts/contactOperationalExclusion.js";
import { resolveDepartmentAwareHandoff } from "../chatbot/departmentAwareHandoff.js";
import { shouldResetClosedConversationForBotReentry } from "../conversation/automationRuntime.js";
import type { ConversationState, QuoteSiteAnswers } from "../conversation/conversation.types.js";
import { activateHumanHandoff, updateOutbound } from "../conversation/conversation.service.js";
import { buildCrmWhatsappExternalUserHash } from "../crm/crmWhatsappIdentity.js";
import { recordCrmConversationContactOrigin } from "../crm/crmContactUpsert.js";
import {
  buildCompletedServiceSnapshotExpectation,
  clearActiveServiceCycle,
  clearSatisfactionRuntimeForNewServiceCycle,
  closeCurrentServiceCycle,
  ensureActiveServiceCycle,
  getActiveServiceCycle,
  getServiceCycleForDisplay,
  isCompletedServiceSnapshotCompatible,
  recordServiceCycleEvent,
  startNewServiceCycle,
  type ServiceCycleSnapshot,
  withServiceCycleSnapshot,
} from "../conversation/serviceCycle.js";
import { getPrisma } from "../db.js";
import {
  buildConversationProtocol,
  buildConversationProtocolNotice,
  normalizeConversationProtocol,
} from "../inbox/conversationProtocol.js";
import {
  shouldProjectConversationToHumanInbox,
  withInboxMessageVisibility,
  type InboxMessageVisibility,
} from "../inbox/messageVisibility.js";
import { logger } from "../logger/logger.js";
import { deleteWebSessionStoredMedia, type WebSessionStoredMedia } from "../media/webSessionMedia.js";
import { recordConversationInboundMetrics } from "../metrics/conversationMetrics.js";
import { applyBalancedQueueAssignment } from "../queue/assignmentPolicy.js";
import { getQueuePosition } from "../queue/queuePosition.js";
import { publishRealtimeEvent } from "../realtime/hub.js";
import type { InboxRealtimeEvent } from "../realtime/events.js";
import { makeConversationKey } from "../storage/conversationKey.js";
import { canonicalizeBrazilWaId, normalizeWaIdDigits } from "../utils/waid.js";
import { persistConversationWindow, persistInboundMessage } from "../db/persist.js";
import {
  isWhatsappMediaAllowed,
  isWhatsappMediaKind,
  resolveAutomationFlagsSettings,
  resolveServiceMessagePolicySettings,
  resolveWhatsappMediaPolicy,
} from "../config/tenantOperationalConfig.js";
import { getDepartmentAvailability } from "../departments/businessHours.js";
import { createWebSessionTextOutboundMessage, normalizeBotMenuOptionMarkdown } from "./webSessionOutboundService.js";
import {
  claimHybridInboundLogicalMessage,
  markHybridInboundLogicalMessageCompleted,
  markHybridInboundLogicalMessageFailedRetryable,
} from "../channels/hybridInboundDedupe.js";

type WebSessionMessageCreatedRealtimePublisher = (
  event: Extract<InboxRealtimeEvent, { type: "message.created" }>
) => Promise<void>;

async function publishWebSessionMessageCreatedRealtime(
  event: Extract<InboxRealtimeEvent, { type: "message.created" }>,
  publisher?: WebSessionMessageCreatedRealtimePublisher
) {
  if (publisher) {
    await publisher(event);
    return;
  }
  publishRealtimeEvent(event);
}

export type WebSessionInboundMessageType = "text" | "image" | "audio" | "video" | "document" | "unknown";

export type NormalizedWebSessionInboundMessage = {
  provider: "web_session";
  channel: "whatsapp";
  clientId: string;
  tenantKey: string;
  channelAccountDbId: string;
  channelAccountId: string;
  externalMessageId: string;
  sender: string;
  senderCanonical: string;
  senderJid: string;
  recipientJid?: string | null;
  timestamp: Date;
  type: MessageType;
  text?: string | null;
  media?: WebSessionStoredMedia | null;
  replyToExternalMessageId?: string | null;
  providerObservedName?: string | null;
  rawPayload: Prisma.InputJsonObject;
};

type BaileysInboundKey = {
  id?: string | null;
  remoteJid?: string | null;
  participant?: string | null;
  fromMe?: boolean | null;
};

export type BaileysInboundMessageLike = {
  key?: BaileysInboundKey | null;
  messageTimestamp?: number | LongLike | Date | string | null;
  message?: Record<string, unknown> | null;
  pushName?: string | null;
  webSessionMedia?: WebSessionStoredMedia | null;
};

type LongLike = {
  toNumber?: () => number;
};

export type WebSessionInboundResult =
  | { ok: true; action: "persisted"; waId: string; messageId: string; conversationId: string | null }
  | { ok: true; action: "duplicate"; waId: string; messageId: string }
  | { ok: true; action: "ignored"; reason: string }
  | { ok: false; action: "failed"; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

const BAILEYS_WRAPPER_KEYS = [
  "ephemeralMessage",
  "viewOnceMessage",
  "viewOnceMessageV2",
  "viewOnceMessageV2Extension",
  "documentWithCaptionMessage",
] as const;

const BAILEYS_CONTENT_KEYS = [
  "conversation",
  "extendedTextMessage",
  "imageMessage",
  "audioMessage",
  "videoMessage",
  "documentMessage",
  "locationMessage",
  "liveLocationMessage",
  "contactMessage",
  "contactsArrayMessage",
  "stickerMessage",
  "reactionMessage",
  "buttonsResponseMessage",
  "listResponseMessage",
  "templateButtonReplyMessage",
  "interactiveResponseMessage",
  "protocolMessage",
  "editedMessage",
  "messageContextInfo",
  "albumMessage",
] as const;

const BAILEYS_STANDALONE_CONTENT_KEYS = [
  "conversation",
  "extendedTextMessage",
  "imageMessage",
  "audioMessage",
  "videoMessage",
  "documentMessage",
  "locationMessage",
  "liveLocationMessage",
  "contactMessage",
  "contactsArrayMessage",
  "stickerMessage",
  "buttonsResponseMessage",
  "listResponseMessage",
  "templateButtonReplyMessage",
  "interactiveResponseMessage",
] as const;

const BAILEYS_UNWRAP_MAX_DEPTH = 5;

function detectBaileysContentKey(message: Record<string, unknown> | null) {
  if (!message) return null;
  for (const key of BAILEYS_CONTENT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(message, key)) return key;
  }
  for (const key of Object.keys(message).sort()) {
    if (Object.prototype.hasOwnProperty.call(message, key)) return key;
  }
  return null;
}

export function unwrapBaileysMessageContent(message: Record<string, unknown>) {
  const wrapperTypes: string[] = [];
  const visited = new Set<Record<string, unknown>>();
  let content = message;
  let viewOnce = false;
  const originalTopLevelType = detectBaileysContentKey(content);

  for (let depth = 0; depth < BAILEYS_UNWRAP_MAX_DEPTH; depth += 1) {
    if (visited.has(content)) break;
    visited.add(content);
    const wrapperKey = BAILEYS_WRAPPER_KEYS.find((key) => {
      const wrapper = isRecord(content[key]) ? content[key] : null;
      return isRecord(wrapper?.message);
    });
    if (!wrapperKey) break;
    wrapperTypes.push(wrapperKey);
    if (wrapperKey.startsWith("viewOnceMessage")) viewOnce = true;
    const wrapper = content[wrapperKey] as Record<string, unknown>;
    content = wrapper.message as Record<string, unknown>;
  }

  return {
    content,
    originalTopLevelType,
    normalizedInnerType: detectBaileysContentKey(content),
    wrapperTypes,
    viewOnce,
  };
}

function getClosedHandoffPolicy(definition: ChatbotFlowDefinition) {
  const raw = isRecord(definition.closedHandoffPolicy) ? definition.closedHandoffPolicy : {};
  const action = getNonEmptyString(raw.action)?.toUpperCase();
  const queuePositionText = getNonEmptyString(raw.queuePositionText);
  return {
    action: action === "QUEUE_FOR_NEXT_OPEN" ? "QUEUE_FOR_NEXT_OPEN" : "REJECT",
    queuePositionText: queuePositionText ?? "Você é o nº {position} da fila de atendimento.",
    hasQueuePositionTextOverride: Boolean(queuePositionText),
    offHoursMessage:
      getNonEmptyString(raw.offHoursMessage) ??
      "No momento não temos nenhum atendente disponível. Você será atendido no primeiro horário do próximo expediente.",
  };
}

async function buildDepartmentAvailabilityById(params: {
  prisma: PrismaClient;
  clientId: string;
  definition: ChatbotFlowDefinition;
  at: Date;
}) {
  const departmentIds = new Set<string>();
  for (const node of Object.values(params.definition.nodes)) {
    if (node.departmentId) departmentIds.add(node.departmentId);
    if (node.type === "menu") {
      for (const option of node.options) {
        const condition = isRecord(option.visibilityCondition) ? option.visibilityCondition : null;
        if (condition?.departmentAvailability && option.departmentId) {
          departmentIds.add(option.departmentId);
        }
      }
    }
  }
  const entries = await Promise.all(
    Array.from(departmentIds).map(async (departmentId) => {
      try {
        const availability = await getDepartmentAvailability(params.prisma, {
          clientId: params.clientId,
          departmentId,
          at: params.at,
        });
        return [departmentId, availability.status] as const;
      } catch {
        return [departmentId, "NO_SCHEDULE"] as const;
      }
    })
  );
  return Object.fromEntries(entries);
}

async function getWebSessionClosePolicy(params: { prisma: PrismaClient; clientId: string }) {
  const config = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const root = isRecord(config?.config) ? config.config : {};
  const closeCommand = isRecord(root.chatbotCloseCommand) ? root.chatbotCloseCommand : {};
  const satisfaction = isRecord(root.satisfactionPolicy) ? root.satisfactionPolicy : {};
  const closeConfirmation = isRecord(closeCommand.confirmation) ? closeCommand.confirmation : {};
  const comment = isRecord(satisfaction.comment) ? satisfaction.comment : {};
  const eligibility = getNonEmptyString(satisfaction.eligibility)?.toUpperCase();
  const command = getNonEmptyString(closeCommand.command);
  const guidanceTemplate = getNonEmptyString(closeCommand.guidanceText);
  return {
    command,
    guidanceText: command
      ? (guidanceTemplate ?? "Para encerrar o atendimento a qualquer momento, digite: {command}")
          .split("{command}").join(command)
      : null,
    closedMessage:
      getNonEmptyString(closeCommand.closedMessage) ??
      "Atendimento encerrado. Obrigado pelo contato.",
    confirmation: {
      enabled: getBoolean(closeConfirmation.enabled, false),
      questionText:
        getNonEmptyString(closeConfirmation.questionText) ??
        "Encerrar o protocolo atual?\n\n1 - Sim\n2 - Não",
      cancelledText:
        getNonEmptyString(closeConfirmation.cancelledText) ??
        "Encerramento cancelado. Seguimos com o atendimento.",
    },
    satisfaction: {
      enabled: satisfaction.enabled === true,
      eligibility: eligibility === "DIRECTED_SERVICE" ? "DIRECTED_SERVICE" : "HUMAN_ONLY",
      ttlMinutes:
        typeof satisfaction.expiresAfterMinutes === "number" && Number.isFinite(satisfaction.expiresAfterMinutes)
          ? Math.max(1, Math.floor(satisfaction.expiresAfterMinutes))
          : typeof satisfaction.ttlMinutes === "number" && Number.isFinite(satisfaction.ttlMinutes)
            ? Math.max(1, Math.floor(satisfaction.ttlMinutes))
          : 15,
      questionText:
        getNonEmptyString(satisfaction.questionText) ??
        "Pesquisa de Satisfação do Protocolo #{protocol}.\n\nComo você avalia este atendimento?\n5 - ⭐⭐⭐⭐⭐\n4 - ⭐⭐⭐⭐\n3 - ⭐⭐⭐\n2 - ⭐⭐\n1 - ⭐\n\nObs.: Você tem 15 minutos para responder à pesquisa.",
      commentEnabled: getBoolean(satisfaction.commentEnabled, getBoolean(comment.enabled, false)),
      commentOfferText:
        getNonEmptyString(satisfaction.commentOfferText) ??
        getNonEmptyString(comment.offerText) ??
        "Poderia compartilhar conosco o que motivou essa avaliação?\n\n1 - Sim\n2 - Não",
      commentPromptText:
        getNonEmptyString(satisfaction.commentPromptText) ??
        getNonEmptyString(comment.promptText) ??
        "Digite o texto:",
      thankYouText:
        getNonEmptyString(satisfaction.thankYouText) ??
        getNonEmptyString(comment.thankYouText) ??
        "Obrigad@ por participar da nossa pesquisa! 😊",
      newServiceGateText:
        getNonEmptyString(satisfaction.newServiceGateText) ??
        "Deseja iniciar um novo atendimento? 😀\n\n1 - Sim. 😁\n2 - Não. 😉",
    },
  };
}

function renderWebSessionCloseTemplate(input: string, params: { protocol: string; contactName?: string | null; at: Date }) {
  const dateTime = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Fortaleza",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(params.at);
  return input
    .replace(/\{protocol\}/g, params.protocol)
    .replace(/\{dataHora\}/g, dateTime)
    .replace(/\{contactName\}/g, params.contactName?.trim() || "contato");
}

function renderProtocolNoticeTemplate(input: string | null, protocol: string) {
  if (!input) return buildConversationProtocolNotice(protocol);
  const rendered = input.replace(/\{\{\s*protocol\s*\}\}/gi, protocol).replace(/\{protocol\}/g, protocol);
  return rendered.includes(protocol) ? rendered : `${rendered}\nProtocolo: ${protocol}`;
}

function getSatisfactionRuntime(state: ConversationState) {
  const answers = isRecord(state.answers) ? state.answers as Record<string, unknown> : {};
  return isRecord(answers.satisfactionRuntime) ? answers.satisfactionRuntime : {};
}

function hasSatisfactionLifecycleRuntime(state: Pick<ConversationState, "answers">) {
  const runtime = getSatisfactionRuntime(state as ConversationState);
  return Boolean(
    isRecord(runtime.commentOffer) ||
      isRecord(runtime.commentInput) ||
      isRecord(runtime.completedSurveyDecision) ||
      runtime.awaitingExpiredSurveyDecision === true
  );
}

function withSatisfactionRuntime(state: ConversationState, runtime: Record<string, unknown> | null): ConversationState {
  const answers = isRecord(state.answers) ? state.answers as Record<string, unknown> : {};
  const nextAnswers = { ...answers };
  if (runtime && Object.keys(runtime).length > 0) {
    nextAnswers.satisfactionRuntime = runtime;
  } else {
    delete nextAnswers.satisfactionRuntime;
  }
  return { ...state, answers: nextAnswers as ConversationState["answers"] };
}

function markExpiredSurveyDecision(state: ConversationState, surveyId: string) {
  return withSatisfactionRuntime(state, {
    ...getSatisfactionRuntime(state),
    awaitingExpiredSurveyDecision: true,
    expiredSurveyId: surveyId,
  });
}

function markCompletedSurveyDecision(state: ConversationState) {
  return withSatisfactionRuntime(state, {
    ...getSatisfactionRuntime(state),
    completedSurveyDecision: {
      awaiting: true,
      prompted: false,
    },
  });
}

function markCompletedSurveyDecisionPrompted(state: ConversationState) {
  return withSatisfactionRuntime(state, {
    ...getSatisfactionRuntime(state),
    completedSurveyDecision: {
      awaiting: true,
      prompted: true,
    },
  });
}

function clearCompletedSurveyDecision(state: ConversationState) {
  const runtime = { ...getSatisfactionRuntime(state) };
  delete runtime.completedSurveyDecision;
  return withSatisfactionRuntime(state, runtime);
}

function markCloseConfirmation(state: ConversationState, requestedAt: Date) {
  return withSatisfactionRuntime(state, {
    ...getSatisfactionRuntime(state),
    closeConfirmation: {
      awaiting: true,
      requestedAt: requestedAt.toISOString(),
      previousMode: state.mode ?? null,
      previousStatus: state.status ?? null,
      previousHandoffStatus: state.handoff?.status ?? null,
      previousDepartmentId: state.departmentId ?? null,
      previousQueueId: state.queueId ?? null,
      previousAssignedUserId: state.assignedUserId ?? null,
      previousAssignedTo: state.assignedTo ?? null,
      previousAssignedAt: state.assignedAt ?? null,
      previousHandoffRequestedAt: state.handoff?.requestedAt ?? null,
      previousHandoffActivatedAt: state.handoff?.activatedAt ?? null,
      previousHandoffReleasedAt: state.handoff?.releasedAt ?? null,
    },
  });
}

function clearCloseConfirmation(state: ConversationState) {
  const runtime = { ...getSatisfactionRuntime(state) };
  delete runtime.closeConfirmation;
  return withSatisfactionRuntime(state, runtime);
}

function getCloseConfirmationRuntime(state: ConversationState) {
  const runtime = getSatisfactionRuntime(state);
  return isRecord(runtime.closeConfirmation) ? runtime.closeConfirmation : null;
}

function getStoredString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function restoreCloseConfirmationState(state: ConversationState): ConversationState {
  const closeConfirmation = getCloseConfirmationRuntime(state);
  const cleared = clearCloseConfirmation(state);
  if (!closeConfirmation) return cleared;
  const previousMode = getStoredString(closeConfirmation.previousMode);
  const previousStatus = getStoredString(closeConfirmation.previousStatus);
  const previousHandoffStatus = getStoredString(closeConfirmation.previousHandoffStatus);
  const previousAssignedAt = getStoredString(closeConfirmation.previousAssignedAt);
  const previousHandoffRequestedAt = getStoredString(closeConfirmation.previousHandoffRequestedAt);
  const previousHandoffActivatedAt = getStoredString(closeConfirmation.previousHandoffActivatedAt);
  const previousHandoffReleasedAt = getStoredString(closeConfirmation.previousHandoffReleasedAt);
  return {
    ...cleared,
    mode: previousMode === "BOT" ? "BOT" : "HUMAN",
    status: previousStatus === "WAITING" || previousStatus === "IN_PROGRESS" || previousStatus === "CLOSED"
      ? previousStatus
      : cleared.status,
    closedAt: previousStatus === "CLOSED" ? cleared.closedAt : null,
    departmentId: getStoredString(closeConfirmation.previousDepartmentId) ?? cleared.departmentId ?? null,
    queueId: getStoredString(closeConfirmation.previousQueueId) ?? cleared.queueId ?? null,
    assignedUserId: getStoredString(closeConfirmation.previousAssignedUserId) ?? cleared.assignedUserId ?? null,
    assignedTo: getStoredString(closeConfirmation.previousAssignedTo) ?? cleared.assignedTo ?? null,
    assignedAt: previousAssignedAt ?? cleared.assignedAt ?? null,
    handoff: {
      ...cleared.handoff,
      status:
        previousHandoffStatus === "active" ||
        previousHandoffStatus === "pending" ||
        previousHandoffStatus === "none"
          ? previousHandoffStatus
          : cleared.handoff.status,
      requestedAt: previousHandoffRequestedAt ?? cleared.handoff.requestedAt,
      activatedAt: previousHandoffActivatedAt ?? cleared.handoff.activatedAt,
      releasedAt: previousHandoffReleasedAt ?? cleared.handoff.releasedAt,
    },
  };
}

function markSatisfactionCommentOffer(state: ConversationState, surveyId: string, responseId: string) {
  return withSatisfactionRuntime(state, {
    ...getSatisfactionRuntime(state),
    commentOffer: {
      awaiting: true,
      surveyId,
      responseId,
    },
  });
}

function markSatisfactionCommentInput(state: ConversationState, surveyId: string, responseId: string) {
  const runtime = { ...getSatisfactionRuntime(state) };
  delete runtime.commentOffer;
  runtime.commentInput = {
    awaiting: true,
    surveyId,
    responseId,
  };
  return withSatisfactionRuntime(state, runtime);
}

function clearSatisfactionCommentRuntime(state: ConversationState) {
  const runtime = { ...getSatisfactionRuntime(state) };
  delete runtime.commentOffer;
  delete runtime.commentInput;
  return withSatisfactionRuntime(state, runtime);
}

function clearExpiredSurveyDecision(state: ConversationState) {
  const runtime = { ...getSatisfactionRuntime(state) };
  delete runtime.awaitingExpiredSurveyDecision;
  delete runtime.expiredSurveyId;
  return withSatisfactionRuntime(state, runtime);
}

function getOperationalProtocol(state: ConversationState) {
  return getActiveServiceCycle(state)?.protocol ?? null;
}

function ensureOperationalProtocol(state: ConversationState, issuedAt: Date) {
  const result = ensureActiveServiceCycle(state, issuedAt, "web_session");
  return {
    state: result.state,
    protocol: result.cycle.protocol,
    cycle: result.cycle,
    created: result.created,
  };
}

function buildInboundNotificationMessage(params: {
  internalMessageId: string | null;
  message: NormalizedWebSessionInboundMessage;
  messageId: string;
  requestId: string;
}) {
  return {
    internalMessageId: params.internalMessageId,
    messageKind: "inbound" as const,
    direction: "INBOUND" as const,
    type: params.message.type,
    status: "RECEIVED" as const,
    intent: null,
    bodyText: params.message.text ?? null,
    requestId: params.requestId,
    messageId: params.messageId,
    metaMessageId: null,
    createdAt: params.message.timestamp.toISOString(),
  };
}

function clearWebSessionServiceCycleState(state: ConversationState): ConversationState {
  const cleared = clearSatisfactionRuntimeForNewServiceCycle(clearActiveServiceCycle(state));
  const answers = isRecord(cleared.answers) ? cleared.answers as Record<string, unknown> : {};
  const nextAnswers = { ...answers };
  delete nextAnswers.flowContext;
  delete nextAnswers.flowTags;
  delete nextAnswers.protocolContinuation;
  return {
    ...cleared,
    answers: nextAnswers as ConversationState["answers"],
    departmentId: null,
    queueId: null,
  };
}

function getAcceptedConsentRestartNode(definition: ChatbotFlowDefinition, state: ConversationState) {
  const startNode = definition.nodes[definition.start];
  if (startNode?.type !== "consent") return null;
  const answers = isRecord(state.answers) ? state.answers as Record<string, unknown> : {};
  const runtime = isRecord(answers.chatbotRuntime) ? answers.chatbotRuntime : {};
  const acceptedConsents = isRecord(runtime.acceptedConsents) ? runtime.acceptedConsents : {};
  return acceptedConsents[getChatbotConsentKey(startNode)] === true ? startNode.onAccepted : null;
}

function maskIdentifier(value: string) {
  const digits = normalizeWaIdDigits(value);
  const suffix = digits.length >= 4 ? digits.slice(-4) : null;
  const hash = crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
  return { suffix, hash, length: digits.length };
}

function externalUserHash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function isAnonymizedMarker(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.startsWith("anon:") ||
    normalized.startsWith("hash:anon:") ||
    normalized === "usuario anonimizado" ||
    normalized === "usuário anonimizado" ||
    normalized.includes("******")
  );
}

function normalizeProviderObservedName(value: unknown) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text || isAnonymizedMarker(text)) return null;
  return text.slice(0, 160);
}

export function extractPhoneFromBaileysJid(jid?: string | null) {
  const value = String(jid ?? "").trim();
  if (!value) return null;
  const [identity, server = ""] = value.split("@");
  if (!identity || !server) return null;
  if (server !== "s.whatsapp.net" && server !== "hosted") return null;
  const phone = normalizeWaIdDigits(identity.split(":")[0] ?? "");
  return phone || null;
}

function pickSenderJid(params: { key: BaileysInboundKey; resolvedSenderJid?: string | null }) {
  const candidates = [params.resolvedSenderJid, params.key.participant, params.key.remoteJid];
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (value && extractPhoneFromBaileysJid(value)) return value;
  }
  return String(params.key.participant ?? params.key.remoteJid ?? "");
}

export function shouldIgnoreBaileysInboundMessage(message: BaileysInboundMessageLike) {
  const key = message.key ?? {};
  const remoteJid = String(key.remoteJid ?? "").trim();
  if (!String(key.id ?? "").trim()) return { ignore: true as const, reason: "missing_message_id" };
  if (key.fromMe === true) return { ignore: true as const, reason: "from_me" };
  if (!remoteJid) return { ignore: true as const, reason: "missing_remote_jid" };
  if (remoteJid.endsWith("@g.us")) return { ignore: true as const, reason: "group" };
  if (remoteJid === "status@broadcast") return { ignore: true as const, reason: "status_broadcast" };
  if (remoteJid.endsWith("@newsletter")) return { ignore: true as const, reason: "newsletter" };
  if (!extractPhoneFromBaileysJid(pickSenderJid({ key }))) {
    return { ignore: true as const, reason: "unsupported_jid" };
  }
  if (!message.message || Object.keys(message.message).length === 0) {
    return { ignore: true as const, reason: "empty_message" };
  }
  return { ignore: false as const };
}

function timestampToDate(value: BaileysInboundMessageLike["messageTimestamp"]) {
  if (value instanceof Date) return value;
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value * 1000);
  if (typeof value === "string" && Number.isFinite(Number(value))) return new Date(Number(value) * 1000);
  if (value && typeof value === "object" && typeof value.toNumber === "function") {
    return new Date(value.toNumber() * 1000);
  }
  return new Date();
}

function readTextPayload(message: Record<string, unknown>) {
  const conversation = typeof message.conversation === "string" ? message.conversation : null;
  const extendedText = isRecord(message.extendedTextMessage)
    ? typeof message.extendedTextMessage.text === "string"
      ? message.extendedTextMessage.text
      : null
    : null;
  return conversation ?? extendedText;
}

function readMediaCaption(message: Record<string, unknown>, type: MessageType) {
  const key =
    type === MessageType.IMAGE
      ? "imageMessage"
      : type === MessageType.VIDEO
        ? "videoMessage"
        : type === MessageType.DOCUMENT
          ? "documentMessage"
          : null;
  if (!key) return null;
  const media = isRecord(message[key]) ? message[key] : null;
  return typeof media?.caption === "string" && media.caption.trim() ? media.caption.trim() : null;
}

function detectMessageType(message: Record<string, unknown>) {
  if (readTextPayload(message) !== null) return MessageType.TEXT;
  if (isRecord(message.imageMessage)) return MessageType.IMAGE;
  if (isRecord(message.audioMessage)) return MessageType.AUDIO;
  if (isRecord(message.videoMessage)) return MessageType.VIDEO;
  if (isRecord(message.documentMessage)) return MessageType.DOCUMENT;
  return MessageType.UNKNOWN;
}

function hasStandaloneBaileysContent(value: unknown, depth = 0): boolean {
  if (!isRecord(value) || depth > BAILEYS_UNWRAP_MAX_DEPTH) return false;
  if (BAILEYS_STANDALONE_CONTENT_KEYS.some((key) => Object.prototype.hasOwnProperty.call(value, key))) {
    return true;
  }
  for (const key of ["message", "editedMessage"]) {
    if (hasStandaloneBaileysContent(value[key], depth + 1)) return true;
  }
  return BAILEYS_WRAPPER_KEYS.some((key) => {
    const wrapper = isRecord(value[key]) ? value[key] : null;
    return hasStandaloneBaileysContent(wrapper?.message, depth + 1);
  });
}

function classifyNonContentBaileysMessage(content: Record<string, unknown>) {
  const type = detectBaileysContentKey(content);
  if (type === "reactionMessage") return "reactionMessage";
  if (type === "messageContextInfo") return hasStandaloneBaileysContent(content) ? null : "messageContextInfo";
  if (type === "albumMessage") return hasStandaloneBaileysContent(content.albumMessage) ? null : "albumMessage";
  if (type === "protocolMessage") {
    const protocol = isRecord(content.protocolMessage) ? content.protocolMessage : null;
    return hasStandaloneBaileysContent(protocol) ? null : "protocolMessage";
  }
  return null;
}

function extractReplyToExternalMessageId(message: Record<string, unknown>) {
  const keys = ["extendedTextMessage", "imageMessage", "audioMessage", "videoMessage", "documentMessage"];
  for (const key of keys) {
    const node = isRecord(message[key]) ? message[key] : null;
    const contextInfo = isRecord(node?.contextInfo) ? node.contextInfo : null;
    const stanzaId = typeof contextInfo?.stanzaId === "string" ? contextInfo.stanzaId.trim() : "";
    if (stanzaId) return stanzaId;
  }
  return null;
}

async function resolveInboundQuotedReference(params: {
  prisma: PrismaClient;
  message: NormalizedWebSessionInboundMessage;
}) {
  const externalMessageId = params.message.replyToExternalMessageId?.trim();
  if (!externalMessageId) return null;
  const sharedWhere = {
    clientId: params.message.clientId,
    externalMessageId,
    OR: [
      { waId: params.message.sender },
      { waIdCanonical: params.message.senderCanonical },
    ],
  };
  const [inbound, outbound] = await Promise.all([
    params.prisma.inboundMessage.findFirst({
      where: sharedWhere,
      select: { id: true, type: true, bodyText: true },
    }),
    params.prisma.outboundMessage.findFirst({
      where: sharedWhere,
      select: { id: true, type: true, bodyText: true },
    }),
  ]);
  const target = outbound
    ? { kind: "outbound" as const, id: outbound.id, type: outbound.type, bodyText: outbound.bodyText }
    : inbound
      ? { kind: "inbound" as const, id: inbound.id, type: inbound.type, bodyText: inbound.bodyText }
      : null;
  if (!target) {
    return {
      replyToKind: "inbound" as const,
      replyToInternalMessageId: "",
      replyToProvider: "web_session",
      replyToProviderMessagePresent: true,
      replyToMetaMessagePresent: false,
      previewType: null,
      contextRequested: true,
      contextResolved: false,
      contextAttached: true,
      referenceUnavailable: true,
      mode: "reply",
    } satisfies Prisma.InputJsonObject;
  }
  return {
    replyToKind: target.kind,
    replyToInternalMessageId: target.id,
    replyToProvider: "web_session",
    replyToProviderMessagePresent: true,
    replyToMetaMessagePresent: false,
    previewType: target.type,
    clientPreviewBody: buildClientQuotedReferencePreviewBody(target.bodyText),
    replyToType: target.type,
    originalType: target.type,
    contextRequested: true,
    contextResolved: true,
    contextAttached: true,
    mode: "reply",
  } satisfies Prisma.InputJsonObject;
}

function buildClientQuotedReferencePreviewBody(bodyText: string | null | undefined) {
  const normalized = String(bodyText ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > 240 ? `${normalized.slice(0, 237)}...` : normalized;
}

function serializeQuotedReferenceForRawPayload(reference: Prisma.InputJsonObject) {
  const { clientPreviewBody: _clientPreviewBody, ...rawReference } = reference;
  return rawReference satisfies Prisma.InputJsonObject;
}

export function normalizeBaileysInboundMessage(params: {
  clientId: string;
  tenantKey: string;
  channelAccountDbId: string;
  channelAccountId: string;
  message: BaileysInboundMessageLike;
  resolvedSenderJid?: string | null;
}): { ok: true; message: NormalizedWebSessionInboundMessage } | { ok: false; reason: string } {
  const ignore = shouldIgnoreBaileysInboundMessage({
    ...params.message,
    key: {
      ...(params.message.key ?? {}),
      participant: params.resolvedSenderJid ?? params.message.key?.participant,
    },
  });
  if (ignore.ignore) return { ok: false, reason: ignore.reason };
  const key = params.message.key ?? {};
  const message = params.message.message;
  if (!message) return { ok: false, reason: "empty_message" };
  const unwrapped = unwrapBaileysMessageContent(message);
  const content = unwrapped.viewOnce ? message : unwrapped.content;
  const nonContentType = classifyNonContentBaileysMessage(content);
  if (nonContentType) return { ok: false, reason: `non_content_${nonContentType}` };
  const senderJid = pickSenderJid({ key, resolvedSenderJid: params.resolvedSenderJid });
  const sender = extractPhoneFromBaileysJid(senderJid);
  if (!sender) return { ok: false, reason: "unsupported_jid" };
  const externalMessageId = String(key.id ?? "").trim();
  const type = detectMessageType(content);
  const text = type === MessageType.TEXT ? readTextPayload(content) : readMediaCaption(content, type);
  const senderCanonical = canonicalizeBrazilWaId(sender);
  const media = params.message.webSessionMedia ?? null;
  const providerObservedName = normalizeProviderObservedName(params.message.pushName);
  const contentDiagnostics = {
    originalTopLevelType: unwrapped.originalTopLevelType,
    normalizedInnerType: unwrapped.normalizedInnerType,
    wrapperTypes: unwrapped.wrapperTypes,
    viewOnce: unwrapped.viewOnce,
  };
  return {
    ok: true,
    message: {
      provider: "web_session",
      channel: "whatsapp",
      clientId: params.clientId,
      tenantKey: params.tenantKey,
      channelAccountDbId: params.channelAccountDbId,
      channelAccountId: params.channelAccountId,
      externalMessageId,
      sender,
      senderCanonical,
      senderJid,
      recipientJid: key.remoteJid ?? null,
      timestamp: timestampToDate(params.message.messageTimestamp),
      type,
      text,
      media,
      replyToExternalMessageId: extractReplyToExternalMessageId(message),
      providerObservedName,
      rawPayload: {
        provider: "web_session",
        channel: "whatsapp",
        channelAccountId: params.channelAccountId,
        externalMessageId,
        sender: maskIdentifier(sender),
        senderJidServer: senderJid.split("@")[1] ?? null,
        type,
        hasText: Boolean(text),
        hasReplyReference: Boolean(extractReplyToExternalMessageId(message)),
        providerObservedNamePresent: Boolean(providerObservedName),
        contentDiagnostics,
        ...(media
          ? {
              media: {
                mediaId: media.mediaId,
                mediaRef: media.mediaRef,
                storageRef: media.storageRef,
                storageProvider: media.storageProvider,
                mimeType: media.mimeType,
                fileName: media.fileName,
                caption: media.caption,
                sizeBytes: media.sizeBytes,
              },
            }
          : {}),
      },
    },
  };
}

function buildLocalMessageId(message: Pick<NormalizedWebSessionInboundMessage, "channelAccountDbId" | "externalMessageId">) {
  return `web:${message.channelAccountDbId}:${message.externalMessageId}`;
}

async function recordInboundEvent(params: {
  prisma: PrismaClient;
  message?: NormalizedWebSessionInboundMessage | null;
  clientId: string;
  eventName: string;
  requestId: string;
  reason?: string | null;
  conversationId?: string | null;
  serviceCycle?: ReturnType<typeof getServiceCycleForDisplay>;
}) {
  const identifier = params.message ? maskIdentifier(params.message.sender) : null;
  await params.prisma.event.create({
      data: {
        clientId: params.clientId,
        conversationId: params.conversationId ?? undefined,
      waId: undefined,
      waIdCanonical: undefined,
        messageId: params.message ? buildLocalMessageId(params.message) : undefined,
      requestId: params.requestId,
      eventName: params.eventName,
      payloadJson: {
        channel: "whatsapp",
        provider: "web_session",
        channelAccountId: params.message?.channelAccountId ?? null,
        externalMessageId: params.message?.externalMessageId ?? null,
        mediaKind: params.message?.media?.kind ?? null,
        mediaStored: Boolean(params.message?.media),
        waIdSuffix: identifier?.suffix ?? null,
        waIdLength: identifier?.length ?? null,
        reason: params.reason ?? null,
        serviceCycle: params.serviceCycle
          ? {
              protocol: params.serviceCycle.protocol,
              cycleId: params.serviceCycle.cycleId,
              issuedAt: params.serviceCycle.issuedAt,
            }
          : null,
      } satisfies Prisma.InputJsonObject,
    },
  });
}

async function safeRecordInboundEvent(params: Parameters<typeof recordInboundEvent>[0]) {
  try {
    await recordInboundEvent(params);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
    logger.warn({
      event: "whatsapp.web.inbound.event_write_failed",
      eventName: params.eventName,
      reason: params.reason ?? null,
      errorName: error instanceof Error ? error.name : "unknown_error",
    });
  }
}

async function safeRecordServiceCycleEvent(params: Parameters<typeof recordServiceCycleEvent>[0]) {
  try {
    await recordServiceCycleEvent(params);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
    if (params.completedService) throw error;
    logger.warn({
      event: "conversation.protocol.event_write_failed",
      action: params.action,
      clientId: params.clientId,
      errorName: error instanceof Error ? error.name : "unknown_error",
    });
  }
}

async function ensureWebSessionRuntimeState(params: {
  prisma: PrismaClient;
  message: NormalizedWebSessionInboundMessage;
  conversationId: string | null;
  requestId: string;
  chatbotEntryPointAvailable: boolean;
}) {
  const department = await findDefaultOperationalDepartment(params.prisma, params.message.clientId);
  const conversationKey = makeConversationKey(params.message.tenantKey, params.message.sender);
  const existing = await params.prisma.conversationRuntimeState.findUnique({
    where: {
      clientId_waId: {
        clientId: params.message.clientId,
        waId: params.message.sender,
      },
    },
    select: {
      mode: true,
      handoffStatus: true,
      chatbotActive: true,
      chatbotNodeId: true,
      flow: true,
      status: true,
      closedAt: true,
      assignedUserId: true,
      departmentId: true,
      queueId: true,
      answers: true,
    },
  });
  const existingAnswers = isRecord(existing?.answers) ? existing.answers as Record<string, unknown> : {};
  const existingSatisfactionRuntime = isRecord(existingAnswers.satisfactionRuntime)
    ? existingAnswers.satisfactionRuntime
    : {};
  const existingCompletedSurveyDecision = isRecord(existingSatisfactionRuntime.completedSurveyDecision)
    ? existingSatisfactionRuntime.completedSurveyDecision
    : null;
  const existingPendingSurvey = existing?.status === "CLOSED" && params.conversationId
    ? await params.prisma.satisfactionSurvey.findFirst({
        where: {
          clientId: params.message.clientId,
          conversationId: params.conversationId,
          type: "csat",
          status: { in: ["sent", "pending"] },
        },
        select: { id: true },
      })
    : null;
  const shouldPreserveClosedSatisfactionLifecycle =
    existing?.status === "CLOSED" &&
    (Boolean(existingPendingSurvey) ||
      hasSatisfactionLifecycleRuntime({ answers: existingAnswers }) ||
      existingCompletedSurveyDecision?.awaiting === true);
  const shouldResetClosedConversation =
    !shouldPreserveClosedSatisfactionLifecycle &&
    shouldResetClosedConversationForBotReentry({
      status: existing?.status ?? null,
      closedAt: existing?.closedAt ? existing.closedAt.toISOString() : null,
      inboundAt: params.message.timestamp,
    });
  const resetClosedState = shouldResetClosedConversation
    ? clearWebSessionServiceCycleState(
        clearChatbotRuntime({
          clientKey: params.message.tenantKey,
          conversationKey,
          waId: params.message.sender,
          waIdCanonical: params.message.senderCanonical,
          channel: "whatsapp",
          provider: "web_session",
          channelAccountId: params.message.channelAccountId,
          firstSeenAt: params.message.timestamp.toISOString(),
          lastInboundAt: params.message.timestamp.toISOString(),
          window: {
            isOpen: true,
            expiresAt: new Date(params.message.timestamp.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          },
          intent: "unknown",
          handoff: { status: "none" },
          flow: existing?.flow as ConversationState["flow"],
          chatbotNodeId: existing?.chatbotNodeId ?? undefined,
          chatbotActive: existing?.chatbotActive ?? false,
          answers: existing?.answers as ConversationState["answers"],
          mode: existing?.mode === "BOT" ? "BOT" : "HUMAN",
          assignedUserId: existing?.assignedUserId ?? null,
          departmentId: existing?.departmentId ?? null,
          queueId: existing?.queueId ?? null,
          status: existing?.status ?? null,
          closedAt: existing?.closedAt ? existing.closedAt.toISOString() : null,
        })
      )
    : null;
  const existingOperationalHumanDestination = Boolean(existing?.departmentId && existing?.queueId);
  const existingInvalidHumanHandoff =
    (existing?.handoffStatus === "ACTIVE" ||
      existing?.handoffStatus === "PENDING" ||
      existing?.status === "WAITING" ||
      existing?.status === "IN_PROGRESS" ||
      existing?.mode === "HUMAN") &&
    !existingOperationalHumanDestination &&
    !existing?.assignedUserId &&
    !shouldPreserveClosedSatisfactionLifecycle;
  const existingHumanTakeover =
    !shouldResetClosedConversation &&
    (((existing?.handoffStatus === "ACTIVE" || existing?.handoffStatus === "PENDING") &&
      existingOperationalHumanDestination) ||
      Boolean(existing?.assignedUserId) ||
      (existing?.status === "WAITING" && existingOperationalHumanDestination) ||
      (existing?.status === "IN_PROGRESS" && existingOperationalHumanDestination) ||
      shouldPreserveClosedSatisfactionLifecycle);
  const shouldStartBot = params.chatbotEntryPointAvailable && !existingHumanTakeover;
  const runtime = await params.prisma.conversationRuntimeState.upsert({
    where: {
      clientId_waId: {
        clientId: params.message.clientId,
        waId: params.message.sender,
      },
    },
    update: {
      waIdCanonical: params.message.senderCanonical,
      conversationKey,
      channel: "whatsapp",
      provider: "web_session",
      channelAccountId: params.message.channelAccountId,
      externalUserHash: externalUserHash(params.message.senderCanonical),
      externalUserRef: params.message.senderCanonical,
      legacyWaId: params.message.sender,
      windowIsOpen: true,
      windowExpiresAt: new Date(params.message.timestamp.getTime() + 24 * 60 * 60 * 1000),
      lastInboundAt: params.message.timestamp,
      lastInboundMessageId: buildLocalMessageId(params.message),
      ...(!shouldStartBot && !existing?.departmentId ? { departmentId: department?.id ?? undefined } : {}),
      ...(shouldStartBot
        ? {
            mode: "BOT",
            status: null,
            handoffStatus: "NONE",
            handoffRequestedAt: null,
            handoffActivatedAt: null,
            handoffReleasedAt: null,
            assignedUserId: null,
            assignedTo: null,
            assignedAt: null,
            closedAt: null,
            ...(shouldResetClosedConversation && resetClosedState
              ? {
                  flow: resetClosedState.flow,
                  flowStep: resetClosedState.flowStep,
                  chatbotNodeId: resetClosedState.chatbotNodeId ?? null,
                  chatbotActive: resetClosedState.chatbotActive ?? false,
                  answers: resetClosedState.answers ?? {},
                  departmentId: null,
                  queueId: null,
                }
              : {}),
            ...(existingInvalidHumanHandoff
              ? {
                  departmentId: null,
                  queueId: null,
                }
              : {}),
          }
        : shouldResetClosedConversation
          ? {
              mode: "HUMAN",
              status: "WAITING",
              handoffStatus: "NONE",
              handoffRequestedAt: null,
              handoffActivatedAt: null,
              handoffReleasedAt: null,
              assignedUserId: null,
              assignedTo: null,
              assignedAt: null,
              closedAt: null,
              flow: resetClosedState?.flow,
              flowStep: resetClosedState?.flowStep,
              chatbotNodeId: resetClosedState?.chatbotNodeId ?? null,
              chatbotActive: resetClosedState?.chatbotActive ?? false,
              answers: resetClosedState?.answers ?? {},
              departmentId: department?.id ?? null,
              queueId: null,
            }
          : {
              status: existing?.status ?? "WAITING",
              ...(shouldPreserveClosedSatisfactionLifecycle ? {} : { closedAt: null }),
            }),
    },
    create: {
      clientId: params.message.clientId,
      waId: params.message.sender,
      waIdCanonical: params.message.senderCanonical,
      conversationKey,
      channel: "whatsapp",
      provider: "web_session",
      channelAccountId: params.message.channelAccountId,
      externalUserHash: externalUserHash(params.message.senderCanonical),
      externalUserRef: params.message.senderCanonical,
      legacyWaId: params.message.sender,
      firstSeenAt: params.message.timestamp,
      windowIsOpen: true,
      windowExpiresAt: new Date(params.message.timestamp.getTime() + 24 * 60 * 60 * 1000),
      lastInboundAt: params.message.timestamp,
      lastInboundMessageId: buildLocalMessageId(params.message),
      intent: "unknown",
      handoffStatus: "NONE",
      mode: shouldStartBot ? "BOT" : "HUMAN",
      departmentId: shouldStartBot ? undefined : department?.id ?? undefined,
      status: shouldStartBot ? undefined : "WAITING",
      chatbotActive: false,
      answers: {},
    },
    select: {
      clientId: true, waId: true, channel: true, provider: true, channelAccountId: true,
      updatedAt: true,
      version: true,
      id: true,
      firstSeenAt: true,
      windowIsOpen: true,
      windowExpiresAt: true,
      lastInboundAt: true,
      lastOutboundAt: true,
      lastInboundMessageId: true,
      lastOutboundMessageId: true,
      intent: true,
      handoffStatus: true,
      handoffRequestedAt: true,
      handoffActivatedAt: true,
      handoffReleasedAt: true,
      flow: true,
      flowStep: true,
      chatbotNodeId: true,
      chatbotActive: true,
      answers: true,
      mode: true,
      assignedUserId: true,
      assignedTo: true,
      assignedAt: true,
      departmentId: true,
      queueId: true,
      status: true,
      closedAt: true,
    },
  });
  if (runtime.mode === "HUMAN" || runtime.status === "WAITING" || runtime.status === "IN_PROGRESS") {
    await applyBalancedQueueAssignment({
      prisma: params.prisma,
      clientId: params.message.clientId,
      conversationId: params.conversationId,
      runtimeStateId: runtime.id,
      waId: params.message.sender,
      waIdCanonical: params.message.senderCanonical,
      departmentId: runtime.departmentId,
      queueId: runtime.queueId,
      status: runtime.status,
      assignedUserId: runtime.assignedUserId,
      requestId: params.requestId,
      source: "whatsapp.web.inbound",
    });
  }
  return { ...runtime, closedBotReentry: shouldResetClosedConversation };
}

type WebSessionRuntimeState = Awaited<ReturnType<typeof ensureWebSessionRuntimeState>>;

function dateToIso(value?: Date | null) {
  return value ? value.toISOString() : undefined;
}

function normalizeHandoffStatus(status?: HandoffStatus | string | null) {
  if (status === "PENDING") return "pending";
  if (status === "ACTIVE") return "active";
  return "none";
}

function shouldProjectStateToHumanInbox(state: ConversationState) {
  return shouldProjectConversationToHumanInbox({
    status: state.status,
    mode: state.mode,
    handoffStatus: state.handoff.status,
    assignedUserId: state.assignedUserId ?? null,
    assignedAt: state.assignedAt ?? null,
    departmentId: state.departmentId ?? null,
    queueId: state.queueId ?? null,
    handoffActivatedAt: state.handoff.activatedAt ?? null,
  });
}

function runtimeToConversationState(params: {
  runtime: WebSessionRuntimeState;
  message: NormalizedWebSessionInboundMessage;
}): ConversationState {
  return {
    runtimeWriteToken: captureRuntimeWriteToken(params.runtime),
    clientKey: params.message.tenantKey,
    conversationKey: makeConversationKey(params.message.tenantKey, params.message.sender),
    waId: params.message.sender,
    waIdCanonical: params.message.senderCanonical,
    firstSeenAt: dateToIso(params.runtime.firstSeenAt) ?? params.message.timestamp.toISOString(),
    lastInboundAt: dateToIso(params.runtime.lastInboundAt) ?? params.message.timestamp.toISOString(),
    lastOutboundAt: dateToIso(params.runtime.lastOutboundAt),
    lastInboundMessageId: params.runtime.lastInboundMessageId ?? buildLocalMessageId(params.message),
    lastOutboundMessageId: params.runtime.lastOutboundMessageId ?? undefined,
    window: {
      isOpen: params.runtime.windowIsOpen,
      expiresAt: dateToIso(params.runtime.windowExpiresAt),
    },
    intent: params.runtime.intent === "pricing" || params.runtime.intent === "support" || params.runtime.intent === "handoff"
      ? params.runtime.intent
      : "unknown",
    handoff: {
      status: normalizeHandoffStatus(params.runtime.handoffStatus),
      requestedAt: dateToIso(params.runtime.handoffRequestedAt),
      activatedAt: dateToIso(params.runtime.handoffActivatedAt),
      releasedAt: dateToIso(params.runtime.handoffReleasedAt),
    },
    flow: extractChatbotFlowId(params.runtime.flow) ? (params.runtime.flow as ConversationState["flow"]) : undefined,
    flowStep: params.runtime.flowStep ?? undefined,
    chatbotNodeId: params.runtime.chatbotNodeId ?? undefined,
    chatbotActive: params.runtime.chatbotActive,
    answers: (params.runtime.answers && typeof params.runtime.answers === "object" && !Array.isArray(params.runtime.answers)
      ? params.runtime.answers
      : {}) as QuoteSiteAnswers,
    mode: params.runtime.mode === "BOT" ? "BOT" : "HUMAN",
    assignedUserId: params.runtime.assignedUserId ?? null,
    assignedTo: params.runtime.assignedTo ?? null,
    assignedAt: dateToIso(params.runtime.assignedAt) ?? null,
    departmentId: params.runtime.departmentId ?? null,
    queueId: params.runtime.queueId ?? null,
    status: params.runtime.status ?? null,
    closedAt: dateToIso(params.runtime.closedAt) ?? null,
  };
}

async function loadWebSessionChatbotFlow(params: {
  prisma: PrismaClient;
  clientId: string;
  state?: ConversationState | null;
}) {
  const activeFlowId = extractChatbotFlowId(params.state?.flow);
  if (params.state?.chatbotActive && activeFlowId) {
    return params.prisma.chatbotFlow.findFirst({
      where: { id: activeFlowId, clientId: params.clientId, isActive: true },
      select: { id: true, definition: true },
    });
  }
  return params.prisma.chatbotFlow.findFirst({
    where: { clientId: params.clientId, isActive: true, entryPoint: true },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, definition: true },
  });
}

async function persistWebSessionRuntimeState(params: {
  prisma: PrismaClient;
  clientId: string;
  waId: string;
  state: ConversationState;
  expected?: RuntimeWriteToken;
}) {
  const write = {
    where: {
      clientId_waId: {
        clientId: params.clientId,
        waId: params.waId,
      },
    },
    data: {
      lastOutboundAt: params.state.lastOutboundAt ? new Date(params.state.lastOutboundAt) : undefined,
      lastOutboundMessageId: params.state.lastOutboundMessageId ?? undefined,
      intent: params.state.intent ?? "unknown",
      handoffStatus:
        params.state.handoff.status === "pending"
          ? "PENDING"
          : params.state.handoff.status === "active"
            ? "ACTIVE"
            : "NONE",
      handoffRequestedAt: params.state.handoff.requestedAt ? new Date(params.state.handoff.requestedAt) : null,
      handoffActivatedAt: params.state.handoff.activatedAt ? new Date(params.state.handoff.activatedAt) : null,
      handoffReleasedAt: params.state.handoff.releasedAt ? new Date(params.state.handoff.releasedAt) : null,
      flow: params.state.flow ?? null,
      flowStep: params.state.flowStep ?? null,
      chatbotNodeId: params.state.chatbotNodeId ?? null,
      chatbotActive: params.state.chatbotActive === true,
      answers: (params.state.answers ?? {}) as Prisma.InputJsonValue,
      mode: params.state.mode ?? "BOT",
      assignedUserId: params.state.assignedUserId ?? null,
      assignedTo: params.state.assignedTo ?? null,
      assignedAt: params.state.assignedAt ? new Date(params.state.assignedAt) : null,
      departmentId: params.state.departmentId ?? null,
      queueId: params.state.queueId ?? null,
      status: params.state.status ?? null,
      closedAt: params.state.closedAt ? new Date(params.state.closedAt) : null,
    },
  } satisfies Prisma.ConversationRuntimeStateUpdateArgs;
  const expected = params.expected ?? params.state.runtimeWriteToken;
  if (expected) {
    const token = await updateRuntimeIfUnchanged({ prisma: params.prisma, clientId: params.clientId,
      waId: params.waId, expected, data: write.data });
    if (!token) {
      logger.info({ event: "automation.runtime.stale_write_skipped", clientId: params.clientId });
      return false;
    }
    params.state.runtimeWriteToken = token;
    return true;
  }
  await params.prisma.conversationRuntimeState.update(write);
  return true;
}

async function shouldReopenClosedConversationWindow(params: {
  prisma: PrismaClient;
  clientId: string;
  waId: string;
}) {
  const [conversation, runtime] = await Promise.all([
    params.prisma.conversation.findUnique({
      where: { clientId_waId: { clientId: params.clientId, waId: params.waId } },
      select: { id: true, closedAt: true },
    }),
    params.prisma.conversationRuntimeState.findUnique({
      where: { clientId_waId: { clientId: params.clientId, waId: params.waId } },
      select: { status: true, closedAt: true, answers: true },
    }),
  ]);
  const runtimeState = {
    answers:
      runtime?.answers && typeof runtime.answers === "object" && !Array.isArray(runtime.answers)
        ? runtime.answers as ConversationState["answers"]
        : {},
  };
  const isClosed =
    Boolean(conversation?.closedAt) ||
    runtime?.status === "CLOSED" ||
    Boolean(runtime?.closedAt);
  if (!isClosed) return true;
  if (hasSatisfactionLifecycleRuntime(runtimeState)) return false;
  if (!conversation?.id) return true;
  const pendingSurvey = await params.prisma.satisfactionSurvey.findFirst({
    where: {
      clientId: params.clientId,
      conversationId: conversation.id,
      type: "csat",
      status: { in: ["sent", "pending"] },
    },
    select: { id: true },
  });
  return !pendingSurvey;
}

async function shouldPreclassifyInboundAsSatisfactionManagement(params: {
  prisma: PrismaClient;
  clientId: string;
  waId: string;
}) {
  const [conversation, runtime] = await Promise.all([
    params.prisma.conversation.findUnique({
      where: { clientId_waId: { clientId: params.clientId, waId: params.waId } },
      select: { id: true, closedAt: true },
    }),
    params.prisma.conversationRuntimeState.findUnique({
      where: { clientId_waId: { clientId: params.clientId, waId: params.waId } },
      select: { status: true, closedAt: true, answers: true },
    }),
  ]);
  const runtimeState = {
    answers:
      runtime?.answers && typeof runtime.answers === "object" && !Array.isArray(runtime.answers)
        ? runtime.answers as ConversationState["answers"]
        : {},
  };
  const isClosed =
    Boolean(conversation?.closedAt) ||
    runtime?.status === "CLOSED" ||
    Boolean(runtime?.closedAt);
  if (!isClosed) return false;
  if (hasSatisfactionLifecycleRuntime(runtimeState)) return true;
  if (!conversation?.id) return false;
  const pendingSurvey = await params.prisma.satisfactionSurvey.findFirst({
    where: {
      clientId: params.clientId,
      conversationId: conversation.id,
      type: "csat",
      status: { in: ["sent", "pending"] },
    },
    select: { id: true },
  });
  return Boolean(pendingSurvey);
}

async function sendWebSessionBotText(params: {
  prisma: PrismaClient;
  clientId: string;
  clientKey: string;
  waId: string;
  waIdCanonical: string;
  channelAccountId: string | null;
  requestId: string;
  text: string;
  state: ConversationState;
  serviceCycle?: ServiceCycleSnapshot | null;
  inboxVisibility?: InboxMessageVisibility;
  inboxInteractionKind?: string | null;
  publishMessageCreatedRealtime?: WebSessionMessageCreatedRealtimePublisher;
}) {
  if (!params.text.trim()) return params.state;
  const serviceCycle = params.serviceCycle ?? getServiceCycleForDisplay(params.state);
  const inferredManagementKind = params.requestId.includes(":survey") ? "satisfaction" : null;
  const inboxInteractionKind = params.inboxInteractionKind ?? inferredManagementKind;
  const inboxVisibility = params.inboxVisibility ?? (inboxInteractionKind ? "management_only" : undefined);
  const outboundResult = await createWebSessionTextOutboundMessage({
    prisma: params.prisma,
    waId: params.waId,
    waIdCanonical: params.waIdCanonical,
    text: normalizeBotMenuOptionMarkdown(params.text),
    runtimeWriteToken: params.state.runtimeWriteToken,
    clientKey: params.clientKey,
    clientId: params.clientId,
    requestId: params.requestId,
    actorUserId: null,
    outboundSource: "bot",
    skipAgentSignature: true,
    serviceCycle,
    inboxVisibility,
    inboxInteractionKind,
    source: {
      channel: "whatsapp",
      provider: "web_session",
      channelAccountId: params.channelAccountId,
    },
  });
  if (outboundResult.ok && outboundResult.status === "SENT") {
    const nextState = updateOutbound(params.state, outboundResult.messageId, outboundResult.createdAt);
    const humanInboxVisible =
      inboxVisibility === "management_only" ? false : shouldProjectStateToHumanInbox(nextState);
    const eventInboxVisibility: InboxMessageVisibility = humanInboxVisible ? "human_timeline" : "management_only";
    await publishWebSessionMessageCreatedRealtime({
      type: "message.created",
      clientId: params.clientId,
      waId: params.waId,
      waIdCanonical: params.waIdCanonical,
      mode: nextState.mode === "HUMAN" ? "HUMAN" : "BOT",
      handoffStatus: nextState.handoff.status,
      humanInboxVisible,
      assignedUserId: nextState.assignedUserId ?? null,
      departmentId: nextState.departmentId ?? null,
      protocol: serviceCycle?.protocol ?? null,
      cycleId: serviceCycle?.cycleId ?? null,
      message: {
        inboxVisibility: eventInboxVisibility,
        protocol: serviceCycle?.protocol ?? null,
        cycleId: serviceCycle?.cycleId ?? null,
        internalMessageId: outboundResult.internalMessageId,
        messageKind: "outbound",
        direction: "OUTBOUND",
        type: "TEXT",
        status: "SENT",
        intent: nextState.intent ?? null,
        bodyText: outboundResult.bodyText,
        media: null,
        templateName: null,
        templateLang: null,
        requestId: params.requestId,
        messageId: outboundResult.messageId,
        metaMessageId: null,
        errorBody: null,
        createdAt: outboundResult.createdAt,
      },
    }, params.publishMessageCreatedRealtime);
    return nextState;
  }
  return params.state;
}

async function sendWebSessionHandoffNotifications(params: {
  prisma: PrismaClient;
  clientId: string;
  clientKey: string;
  waId: string;
  waIdCanonical: string;
  channelAccountId: string | null;
  requestId: string;
  conversationId: string | null;
  runtimeStateId: string;
  queueId: string | null;
  state: ConversationState;
  now: Date;
  closedHandoffPolicy: ReturnType<typeof getClosedHandoffPolicy>;
  closePolicy: Awaited<ReturnType<typeof getWebSessionClosePolicy>>;
  transitionText: string | null;
  includeOffHoursMessage: boolean;
  serviceCycle?: ServiceCycleSnapshot | null;
}) {
  const serviceCycle = params.serviceCycle ?? getServiceCycleForDisplay(params.state);
  const protocol =
    serviceCycle?.protocol ??
    getOperationalProtocol(params.state) ??
    buildConversationProtocol({ id: params.conversationId, createdAt: params.now });
  const closeCommandGuidance =
    params.closePolicy.command && params.transitionText?.includes(params.closePolicy.command)
      ? null
      : params.closePolicy.guidanceText;
  const serviceMessages = await resolveServiceMessagePolicySettings({
    prisma: params.prisma,
    clientId: params.clientId,
  });
  const position = await getQueuePosition({
    prisma: params.prisma,
    clientId: params.clientId,
    runtimeStateId: params.runtimeStateId,
    queueId: params.queueId,
  });
  const notifications = buildWebSessionHandoffNotificationPlan({
    handoffText: params.transitionText,
    protocolText: renderProtocolNoticeTemplate(serviceMessages.settings.protocolNotice.text, protocol),
    protocolEnabled: serviceMessages.settings.protocolNotice.enabled,
    closeCommandGuidance,
    queuePositionText: position
      ? (
          params.closedHandoffPolicy.hasQueuePositionTextOverride
            ? params.closedHandoffPolicy.queuePositionText
            : serviceMessages.settings.queuePositionNotice.text ?? params.closedHandoffPolicy.queuePositionText
        ).replace("{position}", String(position))
      : null,
    queuePositionEnabled: serviceMessages.settings.queuePositionNotice.enabled,
    offHoursMessage: params.includeOffHoursMessage ? params.closedHandoffPolicy.offHoursMessage : null,
  });
  let nextState = params.state;
  for (const notification of notifications) {
    nextState = await sendWebSessionBotText({
      prisma: params.prisma,
      clientId: params.clientId,
      clientKey: params.clientKey,
      waId: params.waId,
      waIdCanonical: params.waIdCanonical,
      channelAccountId: params.channelAccountId,
      requestId: `${params.requestId}:${notification.requestSuffix}`,
      text: notification.text,
      state: nextState,
      serviceCycle,
    });
  }
  return nextState;
}

export function buildWebSessionHandoffNotificationPlan(params: {
  handoffText?: string | null;
  protocolText: string;
  protocolEnabled?: boolean;
  closeCommandGuidance: string | null;
  queuePositionText: string | null;
  queuePositionEnabled?: boolean;
  offHoursMessage: string | null;
}) {
  return [
    ...(params.handoffText?.trim()
      ? [{ requestSuffix: "handoff", text: params.handoffText }]
      : []),
    ...(params.protocolEnabled === false ? [] : [{ requestSuffix: "protocol", text: params.protocolText }]),
    ...(params.closeCommandGuidance
      ? [{ requestSuffix: "close-command-guidance", text: params.closeCommandGuidance }]
      : []),
    ...(params.queuePositionEnabled !== false && params.queuePositionText
      ? [{ requestSuffix: "queue-position", text: params.queuePositionText }]
      : []),
    ...(params.offHoursMessage
      ? [{ requestSuffix: "off-hours", text: params.offHoursMessage }]
      : []),
  ];
}

async function sendWebSessionSatisfactionSurvey(params: {
  prisma: PrismaClient;
  clientId: string;
  clientKey: string;
  waId: string;
  waIdCanonical: string;
  channelAccountId: string | null;
  requestId: string;
  conversationId: string | null;
  protocol: string;
  state: ConversationState;
  now?: Date;
  assignedUserId?: string | null;
}) {
  const policy = await getWebSessionClosePolicy({ prisma: params.prisma, clientId: params.clientId });
  if (!policy.satisfaction.enabled || !params.conversationId) return params.state;
  const assignedUserId = params.assignedUserId ?? params.state.assignedUserId ?? null;
  if (!assignedUserId && policy.satisfaction.eligibility !== "DIRECTED_SERVICE") return params.state;
  const now = params.now ?? new Date();
  const expiresAt = new Date(now.getTime() + policy.satisfaction.ttlMinutes * 60_000);
  const existing = await params.prisma.satisfactionSurvey.findFirst({
    where: {
      clientId: params.clientId,
      conversationId: params.conversationId,
      type: "csat",
      source: "human_close",
      status: { in: ["sent", "pending"] },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (existing) return params.state;
  const initializedState = clearSatisfactionRuntimeForNewServiceCycle(params.state);
  const surveyCycle = getServiceCycleForDisplay(initializedState);
  const survey = await params.prisma.satisfactionSurvey.create({
    data: {
      clientId: params.clientId,
      conversationId: params.conversationId,
      departmentId: initializedState.departmentId ?? null,
      assignedUserId,
      channel: "whatsapp",
      type: "csat",
      status: "sent",
      questionText: policy.satisfaction.questionText.replace("{protocol}", params.protocol),
      commentEnabled: policy.satisfaction.commentEnabled,
      source: "human_close",
      sentAt: now,
      expiresAt,
      metadata: {
        protocol: params.protocol,
        cycleId: surveyCycle?.cycleId ?? null,
        issuedAt: surveyCycle?.issuedAt ?? null,
        trigger: "HUMAN_CONVERSATION_CLOSED",
        ttlMinutes: policy.satisfaction.ttlMinutes,
        provider: "web_session",
        attribution: assignedUserId ? "last_assigned_agent" : "no_assigned_agent",
        eligibility: policy.satisfaction.eligibility,
        queueId: initializedState.queueId ?? null,
      },
    },
  });
  return sendWebSessionBotText({
    prisma: params.prisma,
    clientId: params.clientId,
    clientKey: params.clientKey,
    waId: params.waId,
    waIdCanonical: params.waIdCanonical,
    channelAccountId: params.channelAccountId,
    requestId: `${params.requestId}:survey:${survey.id}`,
    text: survey.questionText,
    state: initializedState,
    inboxVisibility: "management_only",
    inboxInteractionKind: "satisfaction_csat_prompt",
  });
}

async function restartWebSessionBotConversation(params: {
  prisma: PrismaClient;
  clientId: string;
  clientKey: string;
  waId: string;
  waIdCanonical: string;
  channelAccountId: string | null;
  conversationId: string | null;
  requestId: string;
  state: ConversationState;
  now: Date;
  inboundText?: string | null;
}) {
  const baseState: ConversationState = {
    ...clearWebSessionServiceCycleState(clearChatbotRuntime(params.state)),
    mode: "BOT" as const,
    status: null,
    closedAt: null,
  };
  const started = startNewServiceCycle(baseState, params.now, "web_session");
  const nextState = started.state;
  await safeRecordServiceCycleEvent({
    prisma: params.prisma,
    clientId: params.clientId,
    conversationId: params.conversationId,
    waId: params.waId,
    waIdCanonical: params.waIdCanonical,
    requestId: params.requestId,
    action: "started",
    cycle: started.cycle,
  });
  const chatbotFlow = await loadWebSessionChatbotFlow({
    prisma: params.prisma,
    clientId: params.clientId,
    state: nextState,
  });
  if (!chatbotFlow) return nextState;
  const validatedDefinition = validateChatbotFlowDefinition(chatbotFlow.definition);
  if (!validatedDefinition.ok) return nextState;
  const departmentAvailabilityById = await buildDepartmentAvailabilityById({
    prisma: params.prisma,
    clientId: params.clientId,
    definition: validatedDefinition.definition,
    at: params.now,
  });
  const acceptedRestartNode = getAcceptedConsentRestartNode(validatedDefinition.definition, nextState);
  const chatbotResult = await executeChatbotFlowWithConsent({
    prisma: params.prisma,
    clientId: params.clientId,
    waId: params.waId,
    sourceChannel: "whatsapp",
    sourceProvider: "web_session",
    source: "chatbot",
    requestId: params.requestId,
    flowId: chatbotFlow.id,
    definition: validatedDefinition.definition,
    state: nextState,
    inboundText: null,
    nowIso: params.now.toISOString(),
    startNodeId: acceptedRestartNode ?? undefined,
    options: { departmentAvailabilityById },
  });
  const state = chatbotResult.state;
  if (!chatbotResult.replyText?.trim()) return state;
  return sendWebSessionBotText({
    prisma: params.prisma,
    clientId: params.clientId,
    clientKey: params.clientKey,
    waId: params.waId,
    waIdCanonical: params.waIdCanonical,
    channelAccountId: params.channelAccountId,
    requestId: `${params.requestId}:new-service-start`,
    text: chatbotResult.replyText,
    state,
  });
}

export async function closeWebSessionHumanService(params: {
  prisma: PrismaClient;
  clientId: string;
  clientKey: string;
  waId: string;
  waIdCanonical: string;
  channelAccountId: string | null;
  requestId: string;
  conversationId: string | null;
  protocol: string;
  state: ConversationState;
  now: Date;
  assignedUserId?: string | null;
  closedByUserId?: string | null;
  contactName?: string | null;
  closeReason?: string;
  closeSource?: string;
}) {
  if (params.state.status === "CLOSED" && params.state.closedAt) {
    return params.state;
  }
  const closePolicy = await getWebSessionClosePolicy({ prisma: params.prisma, clientId: params.clientId });
  const closingAssignedUserId = params.assignedUserId ?? params.state.assignedUserId ?? null;
  const closedCycleResult = closeCurrentServiceCycle({
    state: params.state,
    at: params.now,
    reason: params.closeReason ?? "service_closed",
    source: params.closeSource ?? "web_session",
  });
  const completedService = {
    assignedUserId: closingAssignedUserId,
    departmentId: params.state.departmentId ?? null,
    queueId: params.state.queueId ?? null,
    closedByUserId: params.closedByUserId ?? null,
  };
  const existingSnapshot = closedCycleResult.cycle
    ? await params.prisma.completedServiceSnapshot.findUnique({
        where: {
          clientId_cycleId: {
            clientId: params.clientId,
            cycleId: closedCycleResult.cycle.cycleId,
          },
        },
        select: {
          conversationId: true,
          protocol: true,
          closedAt: true,
          assignedUserId: true,
          departmentId: true,
          queueId: true,
          closedByUserId: true,
          closeReason: true,
          closeSource: true,
        },
      })
    : null;
  if (existingSnapshot && closedCycleResult.cycle) {
    const expected = buildCompletedServiceSnapshotExpectation({
      clientId: params.clientId,
      conversationId: params.conversationId,
      cycle: closedCycleResult.cycle,
      attribution: completedService,
    });
    if (
      !isCompletedServiceSnapshotCompatible(existingSnapshot, expected, {
        allowDifferentClosedAt: true,
        allowDifferentClosedByUserId: true,
      })
    ) {
      throw new Error("completed_service_snapshot_conflict");
    }
    const answers = isRecord(closedCycleResult.state.answers)
      ? { ...closedCycleResult.state.answers }
      : {};
    answers.lastClosedServiceCycle = {
      ...closedCycleResult.cycle,
      closedAt: existingSnapshot.closedAt.toISOString(),
      closeReason: existingSnapshot.closeReason ?? closedCycleResult.cycle.closeReason,
      closeSource: existingSnapshot.closeSource ?? closedCycleResult.cycle.closeSource,
    };
    return {
      ...clearCloseConfirmation(clearChatbotRuntime({
        ...closedCycleResult.state,
        answers: answers as ConversationState["answers"],
      })),
      mode: "HUMAN" as const,
      assignedUserId: null,
      assignedTo: null,
      assignedAt: null,
      handoff: { ...params.state.handoff, status: "none" as const },
      status: "CLOSED" as const,
      closedAt: existingSnapshot.closedAt.toISOString(),
    };
  }
  if (closedCycleResult.cycle) {
    await safeRecordServiceCycleEvent({
      prisma: params.prisma,
      clientId: params.clientId,
      conversationId: params.conversationId,
      waId: params.waId,
      waIdCanonical: params.waIdCanonical,
      requestId: params.requestId,
      action: "closed",
      cycle: closedCycleResult.cycle,
      completedService,
    });
  }
  const closedProtocol = closedCycleResult.cycle?.protocol ?? params.protocol;
  const serviceMessages = await resolveServiceMessagePolicySettings({
    prisma: params.prisma,
    clientId: params.clientId,
  });
  let nextState: ConversationState = {
    ...clearCloseConfirmation(clearChatbotRuntime(closedCycleResult.state)),
    mode: "HUMAN" as const,
    assignedUserId: null,
    assignedTo: null,
    assignedAt: null,
    handoff: { ...params.state.handoff, status: "none" as const },
    status: "CLOSED" as const,
    closedAt: params.now.toISOString(),
  };
  if (serviceMessages.settings.closeNotice.enabled) {
    nextState = await sendWebSessionBotText({
      prisma: params.prisma,
      clientId: params.clientId,
      clientKey: params.clientKey,
      waId: params.waId,
      waIdCanonical: params.waIdCanonical,
      channelAccountId: params.channelAccountId,
      requestId: `${params.requestId}:close-message`,
      text: renderWebSessionCloseTemplate(closePolicy.closedMessage, {
        protocol: closedProtocol,
        contactName: params.contactName,
        at: params.now,
      }),
      state: nextState,
    });
  }
  return sendWebSessionSatisfactionSurvey({
    prisma: params.prisma,
    clientId: params.clientId,
    clientKey: params.clientKey,
    waId: params.waId,
    waIdCanonical: params.waIdCanonical,
    channelAccountId: params.channelAccountId,
    requestId: params.requestId,
    conversationId: params.conversationId,
    protocol: closedProtocol,
    state: nextState,
    now: params.now,
    assignedUserId: closingAssignedUserId,
  });
}

function satisfactionCategory(score: number) {
  if (score <= 2) return "negative";
  if (score === 3) return "neutral";
  return "positive";
}

async function handleWebSessionSatisfactionInbound(params: {
  prisma: PrismaClient;
  clientId: string;
  clientKey: string;
  waId: string;
  waIdCanonical: string;
  channelAccountId: string | null;
  conversationId: string | null;
  inboundText: string | null | undefined;
  requestId: string;
  state: ConversationState;
  now: Date;
}) {
  if (!params.conversationId) return { handled: false as const, state: params.state };
  const text = String(params.inboundText ?? "").trim();
  const satisfactionRuntime = getSatisfactionRuntime(params.state);
  const closePolicy = await getWebSessionClosePolicy({ prisma: params.prisma, clientId: params.clientId });
  const commentOffer = isRecord(satisfactionRuntime.commentOffer) ? satisfactionRuntime.commentOffer : null;
  if (commentOffer?.awaiting === true) {
    const surveyId = getNonEmptyString(commentOffer.surveyId);
    const responseId = getNonEmptyString(commentOffer.responseId);
    if (!surveyId || !responseId) {
      return { handled: true as const, state: clearSatisfactionCommentRuntime(params.state) };
    }
    if (text === "1") {
      const state = await sendWebSessionBotText({
        prisma: params.prisma,
        clientId: params.clientId,
        clientKey: params.clientKey,
        waId: params.waId,
        waIdCanonical: params.waIdCanonical,
        channelAccountId: params.channelAccountId,
        requestId: `${params.requestId}:survey-comment-prompt`,
        text: closePolicy.satisfaction.commentPromptText,
        state: markSatisfactionCommentInput(params.state, surveyId, responseId),
      });
      return { handled: true as const, state };
    }
    if (text === "2") {
      await params.prisma.satisfactionSurvey.update({
        where: { id: surveyId },
        data: { status: "responded" },
      });
      const state = await sendWebSessionBotText({
        prisma: params.prisma,
        clientId: params.clientId,
        clientKey: params.clientKey,
        waId: params.waId,
        waIdCanonical: params.waIdCanonical,
        channelAccountId: params.channelAccountId,
        requestId: `${params.requestId}:survey-thanks`,
        text: closePolicy.satisfaction.thankYouText,
        state: markCompletedSurveyDecision(clearSatisfactionCommentRuntime(params.state)),
      });
      return { handled: true as const, state };
    }
    const state = await sendWebSessionBotText({
      prisma: params.prisma,
      clientId: params.clientId,
      clientKey: params.clientKey,
      waId: params.waId,
      waIdCanonical: params.waIdCanonical,
      channelAccountId: params.channelAccountId,
      requestId: `${params.requestId}:survey-comment-offer-repeat`,
      text: closePolicy.satisfaction.commentOfferText,
      state: params.state,
    });
    return { handled: true as const, state };
  }
  const commentInput = isRecord(satisfactionRuntime.commentInput) ? satisfactionRuntime.commentInput : null;
  if (commentInput?.awaiting === true) {
    const surveyId = getNonEmptyString(commentInput.surveyId);
    const responseId = getNonEmptyString(commentInput.responseId);
    if (!surveyId || !responseId) {
      return { handled: true as const, state: clearSatisfactionCommentRuntime(params.state) };
    }
    const comment = text.slice(0, 2000);
    await params.prisma.satisfactionResponse.update({
      where: { id: responseId },
      data: { comment: comment || null },
    });
    await params.prisma.satisfactionSurvey.update({
      where: { id: surveyId },
      data: { status: "responded" },
    });
    const state = await sendWebSessionBotText({
      prisma: params.prisma,
      clientId: params.clientId,
      clientKey: params.clientKey,
      waId: params.waId,
      waIdCanonical: params.waIdCanonical,
      channelAccountId: params.channelAccountId,
      requestId: `${params.requestId}:survey-thanks`,
      text: closePolicy.satisfaction.thankYouText,
      state: markCompletedSurveyDecision(clearSatisfactionCommentRuntime(params.state)),
    });
    return { handled: true as const, state };
  }
  const survey = await params.prisma.satisfactionSurvey.findFirst({
    where: {
      clientId: params.clientId,
      conversationId: params.conversationId,
      type: "csat",
      status: { in: ["sent", "pending"] },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      questionText: true,
      expiresAt: true,
      contactId: true,
      leadId: true,
      commentEnabled: true,
    },
  });
  if (!survey) {
    const completedSurveyDecision = isRecord(satisfactionRuntime.completedSurveyDecision)
      ? satisfactionRuntime.completedSurveyDecision
      : null;
    if (completedSurveyDecision?.awaiting === true) {
      if (completedSurveyDecision.prompted === true && text === "1") {
        const nextState = clearCompletedSurveyDecision(params.state);
        const state = await restartWebSessionBotConversation({
          prisma: params.prisma,
          clientId: params.clientId,
          clientKey: params.clientKey,
          waId: params.waId,
          waIdCanonical: params.waIdCanonical,
          channelAccountId: params.channelAccountId,
          conversationId: params.conversationId,
          requestId: params.requestId,
          state: nextState,
          now: params.now,
          inboundText: text,
        });
        return {
          handled: true as const,
          state,
        };
      }
      if (completedSurveyDecision.prompted === true && text === "2") {
        const nextState = {
          ...clearCompletedSurveyDecision(params.state),
          status: "CLOSED" as const,
          closedAt: params.state.closedAt ?? params.now.toISOString(),
        };
        await sendWebSessionBotText({
          prisma: params.prisma,
          clientId: params.clientId,
          clientKey: params.clientKey,
          waId: params.waId,
          waIdCanonical: params.waIdCanonical,
          channelAccountId: params.channelAccountId,
          requestId: `${params.requestId}:survey-completed-close`,
          text: "Atendimento encerrado. Obrigado pelo contato.",
          state: nextState,
        });
        return { handled: true as const, state: nextState };
      }
      const state = await sendWebSessionBotText({
        prisma: params.prisma,
        clientId: params.clientId,
        clientKey: params.clientKey,
        waId: params.waId,
        waIdCanonical: params.waIdCanonical,
        channelAccountId: params.channelAccountId,
        requestId: `${params.requestId}:survey-completed-choice`,
        text: closePolicy.satisfaction.newServiceGateText,
        state: markCompletedSurveyDecisionPrompted(params.state),
      });
      return { handled: true as const, state };
    }
    if (satisfactionRuntime.awaitingExpiredSurveyDecision === true) {
      if (text === "1") {
        const nextState = clearExpiredSurveyDecision(params.state);
        const state = await restartWebSessionBotConversation({
          prisma: params.prisma,
          clientId: params.clientId,
          clientKey: params.clientKey,
          waId: params.waId,
          waIdCanonical: params.waIdCanonical,
          channelAccountId: params.channelAccountId,
          conversationId: params.conversationId,
          requestId: params.requestId,
          state: nextState,
          now: params.now,
          inboundText: text,
        });
        return {
          handled: true as const,
          state,
        };
      }
      if (text === "2") {
        const nextState = {
          ...clearExpiredSurveyDecision(params.state),
          status: "CLOSED" as const,
          closedAt: params.now.toISOString(),
        };
        await sendWebSessionBotText({
          prisma: params.prisma,
          clientId: params.clientId,
          clientKey: params.clientKey,
          waId: params.waId,
          waIdCanonical: params.waIdCanonical,
          channelAccountId: params.channelAccountId,
          requestId: `${params.requestId}:survey-expired-close`,
          text: "Atendimento encerrado. Obrigado pelo contato.",
          state: nextState,
        });
        return { handled: true as const, state: nextState };
      }
      const state = await sendWebSessionBotText({
        prisma: params.prisma,
        clientId: params.clientId,
        clientKey: params.clientKey,
        waId: params.waId,
        waIdCanonical: params.waIdCanonical,
        channelAccountId: params.channelAccountId,
        requestId: `${params.requestId}:survey-expired-choice`,
        text: "Tempo de resposta da pesquisa esgotado.\n\nDeseja iniciar um novo atendimento? 😃\n\n1 - Sim. 😁\n2 - Não. 😉",
        state: params.state,
      });
      return { handled: true as const, state };
    }
    return { handled: false as const, state: params.state };
  }
  const score = /^\d+$/.test(text) ? Number(text) : NaN;
  const expired = survey.expiresAt ? survey.expiresAt.getTime() <= params.now.getTime() : false;
  if (expired) {
    await params.prisma.satisfactionSurvey.update({
      where: { id: survey.id },
      data: { status: "expired" },
    });
    const state = await sendWebSessionBotText({
      prisma: params.prisma,
      clientId: params.clientId,
      clientKey: params.clientKey,
      waId: params.waId,
      waIdCanonical: params.waIdCanonical,
      channelAccountId: params.channelAccountId,
      requestId: `${params.requestId}:survey-expired`,
      text: "Tempo de resposta da pesquisa esgotado.\n\nDeseja iniciar um novo atendimento? 😃\n\n1 - Sim. 😁\n2 - Não. 😉",
      state: markExpiredSurveyDecision(params.state, survey.id),
    });
    return { handled: true as const, state };
  }
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    const state = await sendWebSessionBotText({
      prisma: params.prisma,
      clientId: params.clientId,
      clientKey: params.clientKey,
      waId: params.waId,
      waIdCanonical: params.waIdCanonical,
      channelAccountId: params.channelAccountId,
      requestId: `${params.requestId}:survey-invalid`,
      text: "Responda a pesquisa com uma nota de 1 a 5.",
      state: params.state,
    });
    return { handled: true as const, state };
  }
  const respondedAt = params.now;
  const response = await params.prisma.satisfactionResponse.create({
    data: {
      clientId: params.clientId,
      surveyId: survey.id,
      conversationId: params.conversationId,
      contactId: survey.contactId,
      leadId: survey.leadId,
      score,
      category: satisfactionCategory(score),
      source: "whatsapp_web_session",
      respondedAt,
    },
  });
  const shouldAskComment = survey.commentEnabled === true && closePolicy.satisfaction.commentEnabled;
  await params.prisma.satisfactionSurvey.update({
    where: { id: survey.id },
    data: { status: "responded", answeredAt: respondedAt },
  });
  const state = await sendWebSessionBotText({
    prisma: params.prisma,
    clientId: params.clientId,
    clientKey: params.clientKey,
    waId: params.waId,
    waIdCanonical: params.waIdCanonical,
    channelAccountId: params.channelAccountId,
    requestId: shouldAskComment ? `${params.requestId}:survey-comment-offer` : `${params.requestId}:survey-thanks`,
    text: shouldAskComment ? closePolicy.satisfaction.commentOfferText : closePolicy.satisfaction.thankYouText,
    state: shouldAskComment
      ? markSatisfactionCommentOffer(params.state, survey.id, response.id)
      : markCompletedSurveyDecision(clearSatisfactionCommentRuntime(params.state)),
  });
  return { handled: true as const, state };
}

async function ensureWebSessionContactIdentity(params: {
  prisma: PrismaClient;
  message: NormalizedWebSessionInboundMessage;
  consentRequired: boolean;
}) {
  const providerObservedName = normalizeProviderObservedName(params.message.providerObservedName);
  const confirmedIdentityCandidates = Array.from(
    new Set([params.message.sender, params.message.senderCanonical].map(normalizeWaIdDigits).filter(Boolean))
  );
  const confirmedHashCandidates = Array.from(
    new Set([
      externalUserHash(params.message.senderCanonical),
      externalUserHash(params.message.sender),
      buildCrmWhatsappExternalUserHash(params.message.sender),
      ...confirmedIdentityCandidates.map(buildCrmWhatsappExternalUserHash),
    ])
  );
  const [existingContact, existingLead] = await Promise.all([
    params.prisma.contact.findUnique({
      where: {
        clientId_waId: {
          clientId: params.message.clientId,
          waId: params.message.sender,
        },
      },
      select: { id: true, name: true, lifecycle: true },
    }),
    params.prisma.lead.findUnique({
      where: {
        tenantId_waId: {
          tenantId: params.message.clientId,
          waId: params.message.sender,
        },
      },
      select: { id: true, name: true },
    }),
  ]);
  const relatedIdentity =
    existingContact
      ? null
      : await resolveSingleWebSessionInboundContactCandidate(params.prisma, {
          clientId: params.message.clientId,
          identityCandidates: confirmedIdentityCandidates,
          externalUserHashCandidates: confirmedHashCandidates,
        });
  const reusableContact = existingContact ?? relatedIdentity?.contact ?? null;
  const preliminaryLead = existingLead ?? relatedIdentity?.lead ?? null;
  const safeContactName =
    providerObservedName && !reusableContact?.name && !isAnonymizedMarker(reusableContact?.name)
      ? providerObservedName
      : undefined;
  const safeLeadName =
    providerObservedName && !preliminaryLead?.name && !isAnonymizedMarker(preliminaryLead?.name)
      ? providerObservedName
      : undefined;
  const contact = reusableContact
    ? await params.prisma.contact.update({
        where: { id: reusableContact.id },
        data: {
          channel: "whatsapp",
          provider: "web_session",
          channelAccountId: params.message.channelAccountId,
          externalUserHash: externalUserHash(params.message.senderCanonical),
          externalUserRef: params.message.senderCanonical,
          legacyWaId: params.message.sender,
          ...(safeContactName ? { name: safeContactName } : {}),
        },
        select: { id: true },
      })
    : await params.prisma.contact.upsert({
        where: {
          clientId_waId: {
            clientId: params.message.clientId,
            waId: params.message.sender,
          },
        },
        update: {
          channel: "whatsapp",
          provider: "web_session",
          channelAccountId: params.message.channelAccountId,
          externalUserHash: externalUserHash(params.message.senderCanonical),
          externalUserRef: params.message.senderCanonical,
          legacyWaId: params.message.sender,
          ...(safeContactName ? { name: safeContactName } : {}),
        },
        create: {
          clientId: params.message.clientId,
          waId: params.message.sender,
          ...(safeContactName ? { name: safeContactName } : {}),
          channel: "whatsapp",
          provider: "web_session",
          channelAccountId: params.message.channelAccountId,
          externalUserHash: externalUserHash(params.message.senderCanonical),
          externalUserRef: params.message.senderCanonical,
          legacyWaId: params.message.sender,
          lifecycle: resolveInitialContactLifecycle({ consentRequired: params.consentRequired }),
        },
        select: { id: true },
      });
  const identity = await params.prisma.contactChannelIdentity.upsert({
    where: {
      clientId_channel_provider_channelAccountId_externalUserHash: {
        clientId: params.message.clientId,
        channel: "whatsapp",
        provider: "web_session",
        channelAccountId: params.message.channelAccountId,
        externalUserHash: externalUserHash(params.message.senderCanonical),
      },
    },
    update: {
      contactId: contact.id,
      externalUserRef: params.message.senderCanonical,
      legacyWaId: params.message.sender,
      lastSeenAt: params.message.timestamp,
    },
    create: {
      clientId: params.message.clientId,
      contactId: contact.id,
      channel: "whatsapp",
      provider: "web_session",
      channelAccountId: params.message.channelAccountId,
      externalUserHash: externalUserHash(params.message.senderCanonical),
      externalUserRef: params.message.senderCanonical,
      legacyWaId: params.message.sender,
      firstSeenAt: params.message.timestamp,
      lastSeenAt: params.message.timestamp,
    },
    select: { id: true },
  });
  const identityLead = await params.prisma.lead.findFirst({
    where: {
      tenantId: params.message.clientId,
      channel: "whatsapp",
      provider: "web_session",
      channelAccountId: params.message.channelAccountId,
      externalUserHash: externalUserHash(params.message.senderCanonical),
    },
    select: { id: true, name: true, contactChannelIdentityId: true },
  });
  const reusableLead = identityLead ?? preliminaryLead;
  const lead = reusableLead
    ? await params.prisma.lead.update({
        where: { id: reusableLead.id },
        data: {
          waIdCanonical: params.message.senderCanonical,
          channel: "whatsapp",
          provider: "web_session",
          channelAccountId: params.message.channelAccountId,
          externalUserHash: externalUserHash(params.message.senderCanonical),
          externalUserRef: params.message.senderCanonical,
          legacyWaId: params.message.sender,
          contactChannelIdentityId: identity.id,
          ...(safeLeadName ? { name: safeLeadName } : {}),
        },
        select: { id: true },
      })
    : await params.prisma.lead.upsert({
        where: {
          tenantId_waId: {
            tenantId: params.message.clientId,
            waId: params.message.sender,
          },
        },
        update: {
          waIdCanonical: params.message.senderCanonical,
          channel: "whatsapp",
          provider: "web_session",
          channelAccountId: params.message.channelAccountId,
          externalUserHash: externalUserHash(params.message.senderCanonical),
          externalUserRef: params.message.senderCanonical,
          legacyWaId: params.message.sender,
          contactChannelIdentityId: identity.id,
          ...(safeLeadName ? { name: safeLeadName } : {}),
        },
        create: {
          tenantId: params.message.clientId,
          waId: params.message.sender,
          waIdCanonical: params.message.senderCanonical,
          ...(safeLeadName ? { name: safeLeadName } : {}),
          channel: "whatsapp",
          provider: "web_session",
          channelAccountId: params.message.channelAccountId,
          externalUserHash: externalUserHash(params.message.senderCanonical),
          externalUserRef: params.message.senderCanonical,
          legacyWaId: params.message.sender,
          contactChannelIdentityId: identity.id,
          phone: params.message.sender,
          status: "NEW",
        },
        select: { id: true },
      });
  await reactivateOperationallyExcludedContactIfNeeded(params.prisma, {
    clientId: params.message.clientId,
    leadId: lead.id,
    contactId: contact.id,
    waId: params.message.sender,
    waIdCanonical: params.message.senderCanonical,
    requestId: `web-session-contact-reactivation:${params.message.channelAccountDbId}:${params.message.externalMessageId}`,
    source: "web_session_inbound",
  });
  await recordCrmConversationContactOrigin({
    clientId: params.message.clientId,
    leadId: lead.id,
    contactId: contact.id,
    waId: params.message.sender,
    waIdCanonical: params.message.senderCanonical,
    requestId: `web-session-contact-origin:${params.message.channelAccountDbId}:${params.message.externalMessageId}`,
    source: "web_session_inbound",
  });
}

async function resolveSingleWebSessionInboundContactCandidate(
  prisma: PrismaClient,
  params: {
    clientId: string;
    identityCandidates: string[];
    externalUserHashCandidates: string[];
  }
) {
  const [identities, contacts, leads] = await Promise.all([
    prisma.contactChannelIdentity.findMany({
      where: {
        clientId: params.clientId,
        channel: "whatsapp",
        OR: [
          { externalUserRef: { in: params.identityCandidates } },
          { legacyWaId: { in: params.identityCandidates } },
          { externalUserHash: { in: params.externalUserHashCandidates } },
        ],
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 5,
      select: {
        id: true,
        contactId: true,
        contact: { select: { id: true, name: true, lifecycle: true } },
      },
    }),
    prisma.contact.findMany({
      where: {
        clientId: params.clientId,
        OR: [
          { waId: { in: params.identityCandidates } },
          { externalUserRef: { in: params.identityCandidates } },
          { legacyWaId: { in: params.identityCandidates } },
          { externalUserHash: { in: params.externalUserHashCandidates } },
        ],
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 5,
      select: { id: true, name: true, lifecycle: true },
    }),
    prisma.lead.findMany({
      where: {
        tenantId: params.clientId,
        OR: [
          { waId: { in: params.identityCandidates } },
          { waIdCanonical: { in: params.identityCandidates } },
          { externalUserRef: { in: params.identityCandidates } },
          { legacyWaId: { in: params.identityCandidates } },
          { externalUserHash: { in: params.externalUserHashCandidates } },
        ],
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 5,
      select: { id: true, name: true, contactChannelIdentityId: true },
    }),
  ]);
  const contactById = new Map<string, { id: string; name: string | null; lifecycle: string | null }>();
  for (const contact of contacts) contactById.set(contact.id, contact);
  for (const identity of identities) {
    if (identity.contact) contactById.set(identity.contact.id, identity.contact);
  }
  if (contactById.size !== 1) return null;
  const contact = Array.from(contactById.values())[0] ?? null;
  const leadCandidates = leads.filter((lead) => {
    if (!lead.contactChannelIdentityId) return true;
    return identities.some((identity) => identity.id === lead.contactChannelIdentityId || identity.contactId === contact?.id);
  });
  const uniqueLeadIds = new Set(leadCandidates.map((lead) => lead.id));
  if (uniqueLeadIds.size > 1) return { contact, lead: null };
  return { contact, lead: leadCandidates[0] ?? null };
}

export async function ingestWebSessionInboundMessage(params: {
  prisma?: PrismaClient;
  message: NormalizedWebSessionInboundMessage;
  publishMessageCreatedRealtime?: WebSessionMessageCreatedRealtimePublisher;
  publishHandoffRealtime?: (
    event: Extract<InboxRealtimeEvent, { type: "conversation.handoff.updated" }>
  ) => Promise<void>;
}): Promise<WebSessionInboundResult> {
  const prisma = params.prisma ?? getPrisma();
  const messageId = buildLocalMessageId(params.message);
  const requestId = `web-session-inbound:${params.message.channelAccountDbId}:${params.message.externalMessageId}`;
  let logicalClaimForProcessing: Awaited<ReturnType<typeof claimHybridInboundLogicalMessage>> | null = null;
  let logicalProcessingFailed = false;
  const markLogicalProcessingCompleted = async () => {
    if (!logicalClaimForProcessing?.claimed || !logicalClaimForProcessing.key) return;
    try {
      await markHybridInboundLogicalMessageCompleted({
        prisma,
        clientId: params.message.clientId,
        senderWaIdCanonical: params.message.senderCanonical,
        provider: "web_session",
        providerMessageId: params.message.externalMessageId,
        requestId,
      });
    } catch (error) {
      logger.warn({
        event: "whatsapp.hybrid.inbound.logical_message.completed_marker_failed",
        clientId: params.message.clientId,
        provider: "web_session",
        requestId,
        errorName: error instanceof Error ? error.name : "unknown_error",
        errorCode: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined,
      });
    }
  };
  const markLogicalProcessingFailedRetryable = async (reason: string) => {
    if (!logicalClaimForProcessing?.claimed || !logicalClaimForProcessing.key) return;
    logicalProcessingFailed = true;
    try {
      await markHybridInboundLogicalMessageFailedRetryable({
        prisma,
        clientId: params.message.clientId,
        senderWaIdCanonical: params.message.senderCanonical,
        provider: "web_session",
        providerMessageId: params.message.externalMessageId,
        requestId,
        reason,
      });
    } catch (error) {
      logger.warn({
        event: "whatsapp.hybrid.inbound.logical_message.failed_retryable_marker_failed",
        clientId: params.message.clientId,
        provider: "web_session",
        requestId,
        reason,
        errorName: error instanceof Error ? error.name : "unknown_error",
        errorCode: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined,
      });
    }
  };
  await safeRecordInboundEvent({
    prisma,
    message: params.message,
    clientId: params.message.clientId,
    eventName: params.message.media
      ? "whatsapp.web.inbound.media.received"
      : "whatsapp.web.inbound.received",
    requestId: `${requestId}:received`,
  });

  try {
    const quotedReference = await resolveInboundQuotedReference({ prisma, message: params.message });
    let rawPayload: Prisma.InputJsonObject = {
      ...(params.message.rawPayload as Record<string, unknown>),
      ...(quotedReference ? { contextualReply: serializeQuotedReferenceForRawPayload(quotedReference) } : {}),
    };
    if (
      await shouldPreclassifyInboundAsSatisfactionManagement({
        prisma,
        clientId: params.message.clientId,
        waId: params.message.sender,
      })
    ) {
      rawPayload = withInboxMessageVisibility(rawPayload, "management_only", "satisfaction");
    }
    const logicalClaim = await claimHybridInboundLogicalMessage({
      prisma,
      clientId: params.message.clientId,
      senderWaIdCanonical: params.message.senderCanonical,
      provider: "web_session",
      providerMessageId: params.message.externalMessageId,
      requestId,
    });
    logicalClaimForProcessing = logicalClaim;
    if (!logicalClaim.claimed) {
      await deleteWebSessionStoredMedia(params.message.media);
      await safeRecordInboundEvent({
        prisma,
        message: params.message,
        clientId: params.message.clientId,
        eventName: "whatsapp.web.inbound.duplicate",
        requestId: `${requestId}:logical-duplicate`,
        reason: "hybrid_logical_message_exists",
      });
      return { ok: true, action: "duplicate", waId: params.message.sender, messageId };
    }
    const inserted = await persistInboundMessage({
      clientId: params.message.clientId,
      phoneNumberId: undefined,
      channel: "whatsapp",
      provider: "web_session",
      channelAccountId: params.message.channelAccountId,
      externalMessageId: params.message.externalMessageId,
      waId: params.message.sender,
      waIdCanonical: params.message.senderCanonical,
      messageId,
      type: params.message.type,
      bodyText: params.message.text,
      allowlistHit: true,
      requestId,
      rawPayload,
    });
    if (!inserted) {
      const existing = await prisma.inboundMessage.findUnique({
        where: { clientId_messageId: { clientId: params.message.clientId, messageId } },
        select: { id: true },
      });
      if (existing) {
        if (logicalClaim.reason === "retry_same_winner") {
          await safeRecordInboundEvent({
            prisma,
            message: params.message,
            clientId: params.message.clientId,
            eventName: "whatsapp.web.inbound.retry",
            requestId: `${requestId}:retry-same-winner`,
            reason: "message_id_exists_retrying_downstream",
          });
        } else {
        await safeRecordInboundEvent({
          prisma,
          message: params.message,
          clientId: params.message.clientId,
          eventName: "whatsapp.web.inbound.duplicate",
          requestId: `${requestId}:duplicate`,
          reason: "message_id_exists",
        });
        return { ok: true, action: "duplicate", waId: params.message.sender, messageId };
        }
      } else {
        await markLogicalProcessingFailedRetryable("blocked_by_guard");
        await safeRecordInboundEvent({
          prisma,
          message: params.message,
          clientId: params.message.clientId,
          eventName: "whatsapp.web.inbound.ignored",
          requestId: `${requestId}:blocked`,
          reason: "blocked_by_guard",
        });
        return { ok: true, action: "ignored", reason: "blocked_by_guard" };
      }
    }

    const reopenClosedWindow = await shouldReopenClosedConversationWindow({
      prisma,
      clientId: params.message.clientId,
      waId: params.message.sender,
    });
    await persistConversationWindow({
      clientId: params.message.clientId,
      waId: params.message.sender,
      waIdCanonical: params.message.senderCanonical,
      channel: "whatsapp",
      provider: "web_session",
      channelAccountId: params.message.channelAccountId,
      externalUserHash: externalUserHash(params.message.senderCanonical),
      externalUserRef: params.message.senderCanonical,
      legacyWaId: params.message.sender,
      windowIsOpen: true,
      windowExpiresAt: new Date(params.message.timestamp.getTime() + 24 * 60 * 60 * 1000),
      lastInboundAt: params.message.timestamp,
      reopenClosed: reopenClosedWindow,
      requestId,
    });
    const conversation = await prisma.conversation.findUnique({
      where: { clientId_waId: { clientId: params.message.clientId, waId: params.message.sender } },
      select: { id: true },
    });
    const automationFlags = await resolveAutomationFlagsSettings({
      prisma,
      clientId: params.message.clientId,
      tenant: null,
    });
    const entryPointFlow =
      automationFlags.settings.disableChatbot === true
        ? null
        : await loadWebSessionChatbotFlow({
            prisma,
            clientId: params.message.clientId,
            state: null,
          });
    const validatedEntryPointFlow = entryPointFlow ? validateChatbotFlowDefinition(entryPointFlow.definition) : null;
    const consentRequired =
      validatedEntryPointFlow?.ok === true ? isChatbotConsentRequired(validatedEntryPointFlow.definition) : false;
    await ensureWebSessionContactIdentity({ prisma, message: params.message, consentRequired });
    const runtime = await ensureWebSessionRuntimeState({
      prisma,
      message: params.message,
      conversationId: conversation?.id ?? null,
      requestId,
      chatbotEntryPointAvailable: Boolean(entryPointFlow),
    });
    let runtimeConversationState = runtimeToConversationState({ runtime, message: params.message });
    let currentChatbotFlow: Awaited<ReturnType<typeof loadWebSessionChatbotFlow>> | null | undefined;
    const closePolicy = await getWebSessionClosePolicy({ prisma, clientId: params.message.clientId });
    let satisfactionResult: Awaited<ReturnType<typeof handleWebSessionSatisfactionInbound>> | null = null;
    let inboundInboxVisibility: InboxMessageVisibility | undefined;
    if (closePolicy.satisfaction.enabled) {
      satisfactionResult = await handleWebSessionSatisfactionInbound({
        prisma,
        clientId: params.message.clientId,
        clientKey: params.message.tenantKey,
        waId: params.message.sender,
        waIdCanonical: params.message.senderCanonical,
        channelAccountId: params.message.channelAccountId,
        conversationId: conversation?.id ?? null,
        inboundText: params.message.text,
        requestId,
        state: runtimeConversationState,
        now: params.message.timestamp,
      });
      runtimeConversationState = satisfactionResult.state;
      if (satisfactionResult.handled === true) {
        inboundInboxVisibility = "management_only";
        rawPayload = withInboxMessageVisibility(rawPayload, "management_only", "satisfaction");
        await prisma.inboundMessage.update({
          where: { clientId_messageId: { clientId: params.message.clientId, messageId } },
          data: { rawPayload },
        });
      }
    }
    if (
      !inboundInboxVisibility &&
      automationFlags.settings.disableChatbot !== true &&
      runtimeConversationState.mode !== "HUMAN" &&
      runtimeConversationState.handoff.status === "none" &&
      runtimeConversationState.chatbotActive &&
      runtimeConversationState.chatbotNodeId
    ) {
      currentChatbotFlow = await loadWebSessionChatbotFlow({
        prisma,
        clientId: params.message.clientId,
        state: runtimeConversationState,
      });
      const validatedCurrentFlow = currentChatbotFlow
        ? validateChatbotFlowDefinition(currentChatbotFlow.definition)
        : null;
      const currentNode = validatedCurrentFlow?.ok
        ? validatedCurrentFlow.definition.nodes[runtimeConversationState.chatbotNodeId]
        : null;
      if (currentNode?.type === "consent") {
        inboundInboxVisibility = "management_only";
        rawPayload = withInboxMessageVisibility(rawPayload, "management_only", "consent");
        await prisma.inboundMessage.update({
          where: { clientId_messageId: { clientId: params.message.clientId, messageId } },
          data: { rawPayload },
        });
      }
    }
    const shouldHaveActiveServiceCycle =
      satisfactionResult?.handled !== true &&
      runtimeConversationState.status !== "CLOSED" &&
      !runtimeConversationState.closedAt &&
      (runtimeConversationState.mode === "BOT" ||
        runtimeConversationState.status === "WAITING" ||
        runtimeConversationState.status === "IN_PROGRESS");
    if (shouldHaveActiveServiceCycle) {
      const cycleResult = ensureActiveServiceCycle(
        runtimeConversationState,
        params.message.timestamp,
        "web_session"
      );
      runtimeConversationState = cycleResult.state;
      if (cycleResult.created) {
        await persistWebSessionRuntimeState({
          prisma,
          clientId: params.message.clientId,
          waId: params.message.sender,
          state: runtimeConversationState,
        });
        await safeRecordServiceCycleEvent({
          prisma,
          clientId: params.message.clientId,
          conversationId: conversation?.id ?? null,
          waId: params.message.sender,
          waIdCanonical: params.message.senderCanonical,
          requestId,
          action: "started",
          cycle: cycleResult.cycle,
        });
      }
        await prisma.inboundMessage.update({
          where: { clientId_messageId: { clientId: params.message.clientId, messageId } },
          data: { rawPayload: withServiceCycleSnapshot(rawPayload, cycleResult.cycle) },
        });
        rawPayload = withServiceCycleSnapshot(rawPayload, cycleResult.cycle);
      }
    await recordConversationInboundMetrics({
      prisma,
      clientId: params.message.clientId,
      waId: params.message.sender,
      occurredAt: params.message.timestamp,
      wasInserted: true,
    });
    const insertedMessage = await prisma.inboundMessage.findUnique({
      where: { clientId_messageId: { clientId: params.message.clientId, messageId } },
      select: { id: true },
    });
    const inboundNotificationMessage = buildInboundNotificationMessage({
      internalMessageId: insertedMessage?.id ?? null,
      message: params.message,
      messageId,
      requestId,
    });
    const inboundServiceCycle = getActiveServiceCycle(runtimeConversationState);
    const humanInboxVisible =
      inboundInboxVisibility === "management_only" ? false : shouldProjectStateToHumanInbox(runtimeConversationState);
    const eventInboxVisibility: InboxMessageVisibility = humanInboxVisible ? "human_timeline" : "management_only";
    await publishWebSessionMessageCreatedRealtime({
      type: "message.created",
      clientId: params.message.clientId,
      waId: params.message.sender,
      waIdCanonical: params.message.senderCanonical,
      mode: runtimeConversationState.mode === "HUMAN" ? "HUMAN" : "BOT",
      handoffStatus: runtimeConversationState.handoff.status,
      humanInboxVisible,
      assignedUserId: runtime.assignedUserId ?? null,
      departmentId: runtime.departmentId ?? null,
      protocol: inboundServiceCycle?.protocol ?? null,
      cycleId: inboundServiceCycle?.cycleId ?? null,
      message: {
        inboxVisibility: eventInboxVisibility,
        protocol: inboundServiceCycle?.protocol ?? null,
        cycleId: inboundServiceCycle?.cycleId ?? null,
        internalMessageId: inboundNotificationMessage.internalMessageId,
        messageKind: "inbound",
        direction: "INBOUND",
        type: params.message.type,
        status: "RECEIVED",
        intent: null,
        bodyText: params.message.text ?? null,
        media: params.message.media
          ? {
              kind: params.message.media.kind,
              mimeType: params.message.media.mimeType,
              fileName: params.message.media.fileName,
              caption: params.message.media.caption,
              hasDownload: true,
              downloadUrl: `/app/conversation/${encodeURIComponent(params.message.sender)}/messages/${encodeURIComponent(messageId)}/media`,
            }
          : null,
        templateName: null,
        templateLang: null,
        requestId,
        messageId,
        metaMessageId: null,
        errorBody: null,
        createdAt: params.message.timestamp.toISOString(),
        replyTo: quotedReference && quotedReference.contextResolved === true
          ? {
              kind: quotedReference.replyToKind,
              id: quotedReference.replyToInternalMessageId,
              previewType: quotedReference.previewType,
              mode: "reply",
              previewBody:
                typeof quotedReference.clientPreviewBody === "string"
                  ? quotedReference.clientPreviewBody
                  : null,
            }
          : quotedReference
            ? {
                kind: "inbound",
                id: "",
                previewType: null,
                mode: "reply",
                previewBody: "Mensagem original indisponivel",
              }
            : null,
      },
    }, params.publishMessageCreatedRealtime);
    if (satisfactionResult?.handled === true) {
      await persistWebSessionRuntimeState({
        prisma,
        clientId: params.message.clientId,
        waId: params.message.sender,
        state: runtimeConversationState,
      });
      await safeRecordInboundEvent({
        prisma,
        message: params.message,
        clientId: params.message.clientId,
        eventName: "whatsapp.web.satisfaction.handled",
        requestId: `${requestId}:satisfaction`,
        conversationId: conversation?.id ?? null,
      });
      return { ok: true, action: "persisted", waId: params.message.sender, messageId, conversationId: conversation?.id ?? null };
    }
    const closeConfirmation = getCloseConfirmationRuntime(runtimeConversationState);
    if (closeConfirmation?.awaiting === true) {
      const inboundChoice = String(params.message.text ?? "").trim();
      const protocol =
        getOperationalProtocol(runtimeConversationState) ??
        buildConversationProtocol({ id: conversation?.id ?? null, createdAt: params.message.timestamp });
      if (inboundChoice === "1") {
        runtimeConversationState = await closeWebSessionHumanService({
          prisma,
          clientId: params.message.clientId,
          clientKey: params.message.tenantKey,
          waId: params.message.sender,
          waIdCanonical: params.message.senderCanonical,
          channelAccountId: params.message.channelAccountId,
          requestId,
          conversationId: conversation?.id ?? null,
          protocol,
          state: runtimeConversationState,
          now: params.message.timestamp,
        });
        await persistWebSessionRuntimeState({
          prisma,
          clientId: params.message.clientId,
          waId: params.message.sender,
          state: runtimeConversationState,
        });
        await safeRecordInboundEvent({
          prisma,
          message: params.message,
          clientId: params.message.clientId,
          eventName: "whatsapp.web.close_command.confirmed",
          requestId: `${requestId}:close-command-confirmed`,
          conversationId: conversation?.id ?? null,
        });
        return { ok: true, action: "persisted", waId: params.message.sender, messageId, conversationId: conversation?.id ?? null };
      }
      if (inboundChoice === "2") {
        runtimeConversationState = await sendWebSessionBotText({
          prisma,
          clientId: params.message.clientId,
          clientKey: params.message.tenantKey,
          waId: params.message.sender,
          waIdCanonical: params.message.senderCanonical,
          channelAccountId: params.message.channelAccountId,
          requestId: `${requestId}:close-command-cancelled`,
          text: closePolicy.confirmation.cancelledText,
          state: restoreCloseConfirmationState(runtimeConversationState),
        });
        await persistWebSessionRuntimeState({
          prisma,
          clientId: params.message.clientId,
          waId: params.message.sender,
          state: runtimeConversationState,
        });
        await safeRecordInboundEvent({
          prisma,
          message: params.message,
          clientId: params.message.clientId,
          eventName: "whatsapp.web.close_command.cancelled",
          requestId: `${requestId}:close-command-cancelled`,
          conversationId: conversation?.id ?? null,
        });
        return { ok: true, action: "persisted", waId: params.message.sender, messageId, conversationId: conversation?.id ?? null };
      }
      runtimeConversationState = await sendWebSessionBotText({
        prisma,
        clientId: params.message.clientId,
        clientKey: params.message.tenantKey,
        waId: params.message.sender,
        waIdCanonical: params.message.senderCanonical,
        channelAccountId: params.message.channelAccountId,
        requestId: `${requestId}:close-command-repeat`,
        text: closePolicy.confirmation.questionText,
        state: runtimeConversationState,
      });
      await persistWebSessionRuntimeState({
        prisma,
        clientId: params.message.clientId,
        waId: params.message.sender,
        state: runtimeConversationState,
      });
      return { ok: true, action: "persisted", waId: params.message.sender, messageId, conversationId: conversation?.id ?? null };
    }
    if (
      closePolicy.command &&
      String(params.message.text ?? "").trim().toLowerCase() === closePolicy.command.toLowerCase() &&
      runtimeConversationState.status !== "CLOSED" &&
      !runtimeConversationState.closedAt &&
      (runtimeConversationState.mode === "HUMAN" ||
        runtimeConversationState.status === "WAITING" ||
        runtimeConversationState.status === "IN_PROGRESS")
    ) {
      const protocol =
        getOperationalProtocol(runtimeConversationState) ??
        buildConversationProtocol({ id: conversation?.id ?? null, createdAt: params.message.timestamp });
      if (closePolicy.confirmation.enabled) {
        runtimeConversationState = await sendWebSessionBotText({
          prisma,
          clientId: params.message.clientId,
          clientKey: params.message.tenantKey,
          waId: params.message.sender,
          waIdCanonical: params.message.senderCanonical,
          channelAccountId: params.message.channelAccountId,
          requestId: `${requestId}:close-command-confirmation`,
          text: closePolicy.confirmation.questionText,
          state: markCloseConfirmation(runtimeConversationState, params.message.timestamp),
        });
      } else {
        runtimeConversationState = await closeWebSessionHumanService({
          prisma,
          clientId: params.message.clientId,
          clientKey: params.message.tenantKey,
          waId: params.message.sender,
          waIdCanonical: params.message.senderCanonical,
          channelAccountId: params.message.channelAccountId,
          requestId,
          conversationId: conversation?.id ?? null,
          protocol,
          state: runtimeConversationState,
          now: params.message.timestamp,
        });
      }
      await persistWebSessionRuntimeState({
        prisma,
        clientId: params.message.clientId,
        waId: params.message.sender,
        state: runtimeConversationState,
      });
      await safeRecordInboundEvent({
        prisma,
        message: params.message,
        clientId: params.message.clientId,
        eventName: closePolicy.confirmation.enabled
          ? "whatsapp.web.close_command.confirmation_requested"
          : "whatsapp.web.close_command.handled",
        requestId: `${requestId}:close-command`,
        conversationId: conversation?.id ?? null,
      });
      return { ok: true, action: "persisted", waId: params.message.sender, messageId, conversationId: conversation?.id ?? null };
    }
    if (
      automationFlags.settings.disableChatbot !== true &&
      runtimeConversationState.mode !== "HUMAN" &&
      runtimeConversationState.handoff.status === "none"
    ) {
      const chatbotFlow = runtimeConversationState.chatbotActive
        ? (currentChatbotFlow ??
            await loadWebSessionChatbotFlow({
              prisma,
              clientId: params.message.clientId,
              state: runtimeConversationState,
            }))
        : entryPointFlow;
      if (chatbotFlow) {
        const validatedDefinition = validateChatbotFlowDefinition(chatbotFlow.definition);
        if (!validatedDefinition.ok) {
          runtimeConversationState = clearChatbotRuntime(runtimeConversationState);
          await persistWebSessionRuntimeState({
            prisma,
            clientId: params.message.clientId,
            waId: params.message.sender,
            state: runtimeConversationState,
          });
          logger.error({
            event: "whatsapp.web.chatbot.definition.invalid",
            clientId: params.message.clientId,
            flowId: chatbotFlow.id,
            reason: validatedDefinition.message,
          });
          } else {
          const departmentAvailabilityById = await buildDepartmentAvailabilityById({
            prisma,
            clientId: params.message.clientId,
            definition: validatedDefinition.definition,
            at: params.message.timestamp,
          });
          const chatbotResult = await executeChatbotFlowWithConsent({
            prisma,
            clientId: params.message.clientId,
            waId: params.message.sender,
            sourceChannel: "whatsapp",
            sourceProvider: "web_session",
            source: "chatbot",
            requestId,
            flowId: chatbotFlow.id,
            definition: validatedDefinition.definition,
            state: runtimeConversationState,
            inboundText: runtime.closedBotReentry || !runtimeConversationState.chatbotActive
              ? null
              : params.message.text,
            nowIso: params.message.timestamp.toISOString(),
            options: { departmentAvailabilityById },
          });
          runtimeConversationState = chatbotResult.state;
          if (chatbotResult.managementInteraction?.inboundKind) {
            inboundInboxVisibility = "management_only";
            rawPayload = withInboxMessageVisibility(
              rawPayload,
              "management_only",
              chatbotResult.managementInteraction.inboundKind
            );
            await prisma.inboundMessage.update({
              where: { clientId_messageId: { clientId: params.message.clientId, messageId } },
              data: { rawPayload },
            });
          }
          const closedHandoffPolicy = getClosedHandoffPolicy(validatedDefinition.definition);
          const handoffDecision = chatbotResult.pendingHandoff
            ? await resolveDepartmentAwareHandoff(prisma, {
                clientId: params.message.clientId,
                pendingHandoff: chatbotResult.pendingHandoff,
                currentDepartmentId: runtimeConversationState.departmentId ?? null,
                currentQueueId: runtimeConversationState.queueId ?? null,
                at: params.message.timestamp,
              })
            : null;
          const queueClosedHandoff = Boolean(
            chatbotResult.pendingHandoff &&
            handoffDecision?.kind === "closed" &&
            closedHandoffPolicy.action === "QUEUE_FOR_NEXT_OPEN"
          );
          const shouldSendHandoffNotifications = Boolean(
            chatbotResult.pendingHandoff &&
            (queueClosedHandoff || (handoffDecision?.kind !== "closed" && handoffDecision?.kind !== "blocked"))
          );
          const replyText = shouldSendHandoffNotifications
            ? undefined
            : handoffDecision?.kind === "closed" && !queueClosedHandoff
              ? handoffDecision.closedText
              : handoffDecision?.kind === "blocked"
                ? undefined
                : chatbotResult.replyText;
          for (const event of chatbotResult.events ?? []) {
            logger.info({
              ...event,
              clientId: params.message.clientId,
              provider: "web_session",
            });
          }
          if (replyText?.trim()) {
            const normalizedReplyText = normalizeBotMenuOptionMarkdown(replyText);
            const replyServiceCycle = getActiveServiceCycle(runtimeConversationState);
            const outboundResult = await createWebSessionTextOutboundMessage({
              prisma,
              waId: params.message.sender,
              waIdCanonical: params.message.senderCanonical,
              text: normalizedReplyText,
              runtimeWriteToken: runtimeConversationState.runtimeWriteToken,
              clientKey: params.message.tenantKey,
              clientId: params.message.clientId,
              requestId: `${requestId}:bot-reply`,
              actorUserId: null,
              outboundSource: "bot",
              skipAgentSignature: true,
              serviceCycle: replyServiceCycle,
              inboxVisibility: chatbotResult.managementInteraction?.outboundKind
                ? "management_only"
                : undefined,
              inboxInteractionKind: chatbotResult.managementInteraction?.outboundKind ?? null,
              source: {
                channel: "whatsapp",
                provider: "web_session",
                channelAccountId: params.message.channelAccountId,
              },
            });
            if (outboundResult.ok && outboundResult.status === "SENT") {
              runtimeConversationState = updateOutbound(
                runtimeConversationState,
                outboundResult.messageId,
                outboundResult.createdAt
              );
              const humanInboxVisible = chatbotResult.managementInteraction?.outboundKind
                ? false
                : shouldProjectStateToHumanInbox(runtimeConversationState);
              const eventInboxVisibility: InboxMessageVisibility = humanInboxVisible
                ? "human_timeline"
                : "management_only";
              await publishWebSessionMessageCreatedRealtime({
                type: "message.created",
                clientId: params.message.clientId,
                waId: params.message.sender,
                waIdCanonical: params.message.senderCanonical,
                mode: runtimeConversationState.mode === "HUMAN" ? "HUMAN" : "BOT",
                handoffStatus: runtimeConversationState.handoff.status,
                humanInboxVisible,
                assignedUserId: runtimeConversationState.assignedUserId ?? null,
                departmentId: runtimeConversationState.departmentId ?? null,
                protocol: replyServiceCycle?.protocol ?? null,
                cycleId: replyServiceCycle?.cycleId ?? null,
                message: {
                  inboxVisibility: eventInboxVisibility,
                  protocol: replyServiceCycle?.protocol ?? null,
                  cycleId: replyServiceCycle?.cycleId ?? null,
                  internalMessageId: outboundResult.internalMessageId,
                  messageKind: "outbound",
                  direction: "OUTBOUND",
                  type: "TEXT",
                  status: "SENT",
                  intent: runtimeConversationState.intent ?? null,
                  bodyText: outboundResult.bodyText,
                  media: null,
                  templateName: null,
                  templateLang: null,
                  requestId: `${requestId}:bot-reply`,
                  messageId: outboundResult.messageId,
                  metaMessageId: null,
                  errorBody: null,
                  createdAt: outboundResult.createdAt,
                },
              }, params.publishMessageCreatedRealtime);
            }
          }
          let handoffServiceCycle: ServiceCycleSnapshot | null = null;
          if (
            shouldSendHandoffNotifications &&
            chatbotResult.pendingHandoff
          ) {
            const activated = activateHumanHandoff(
              clearChatbotRuntime(runtimeConversationState),
              params.message.timestamp.toISOString(),
              chatbotResult.pendingHandoff.feedbackText
            );
            runtimeConversationState = {
              ...activated.state,
              mode: "HUMAN",
              assignedUserId: null,
              assignedTo: null,
              assignedAt: null,
              status: "WAITING",
              closedAt: null,
              departmentId: handoffDecision?.departmentId ?? activated.state.departmentId ?? null,
              queueId: handoffDecision?.queueId ?? activated.state.queueId ?? null,
            };
            const protocolResult = ensureOperationalProtocol(runtimeConversationState, params.message.timestamp);
            runtimeConversationState = protocolResult.state;
            handoffServiceCycle = protocolResult.cycle;
            if (protocolResult.created) {
              await safeRecordServiceCycleEvent({
                prisma,
                clientId: params.message.clientId,
                conversationId: conversation?.id ?? null,
                waId: params.message.sender,
                waIdCanonical: params.message.senderCanonical,
                requestId,
                action: "started",
                cycle: protocolResult.cycle,
              });
            }
          } else if (handoffDecision?.kind === "closed" || handoffDecision?.kind === "blocked") {
            runtimeConversationState = {
              ...clearChatbotRuntime(runtimeConversationState),
              mode: runtimeConversationState.mode === "HUMAN" ? "HUMAN" : "BOT",
              departmentId: handoffDecision.departmentId ?? runtimeConversationState.departmentId ?? null,
              queueId: handoffDecision.queueId ?? runtimeConversationState.queueId ?? null,
            };
          }
          const persisted = await persistWebSessionRuntimeState({
            prisma,
            clientId: params.message.clientId,
            waId: params.message.sender,
            state: runtimeConversationState,
            expected: runtimeConversationState.runtimeWriteToken,
          });
          if (!persisted) return { ok: true, action: "persisted", waId: params.message.sender, messageId, conversationId: conversation?.id ?? null };
          const postFlowRuntime = await prisma.conversationRuntimeState.findUnique({
            where: {
              clientId_waId: {
                clientId: params.message.clientId,
                waId: params.message.sender,
              },
            },
            select: {
              id: true,
              assignedUserId: true,
              departmentId: true,
              queueId: true,
              status: true,
            },
          });
          if (
            postFlowRuntime &&
            (queueClosedHandoff || handoffDecision?.kind !== "closed") &&
            handoffDecision?.kind !== "blocked" &&
            (runtimeConversationState.mode === "HUMAN" || runtimeConversationState.status === "WAITING")
          ) {
            let effectiveRuntime = postFlowRuntime;
            if (!queueClosedHandoff) {
              await applyBalancedQueueAssignment({
                prisma,
                clientId: params.message.clientId,
                conversationId: conversation?.id ?? null,
                runtimeStateId: postFlowRuntime.id,
                waId: params.message.sender,
                waIdCanonical: params.message.senderCanonical,
                departmentId: postFlowRuntime.departmentId,
                queueId: postFlowRuntime.queueId,
                status: postFlowRuntime.status,
                assignedUserId: postFlowRuntime.assignedUserId,
                requestId,
                source: "whatsapp.web.chatbot.handoff",
              });
              const refreshedRuntime = await prisma.conversationRuntimeState.findUnique({
                where: {
                  clientId_waId: {
                    clientId: params.message.clientId,
                    waId: params.message.sender,
                  },
                },
                select: {
                  id: true,
                  assignedUserId: true,
                  departmentId: true,
                  queueId: true,
                  status: true,
                },
              });
              if (refreshedRuntime) effectiveRuntime = refreshedRuntime;
            }
            const effectiveQueue = effectiveRuntime.queueId
              ? await prisma.queue.findFirst({
                  where: { id: effectiveRuntime.queueId, clientId: params.message.clientId },
                  select: { id: true, name: true, departmentId: true },
                })
              : null;
            const effectiveDepartmentId =
              effectiveQueue?.departmentId ?? effectiveRuntime.departmentId ?? null;
            const stateForHandoffNotifications: ConversationState = {
              ...runtimeConversationState,
              mode: "HUMAN",
              handoff: {
                ...runtimeConversationState.handoff,
                status:
                  runtimeConversationState.handoff.status === "none"
                    ? "active"
                    : runtimeConversationState.handoff.status,
              },
              assignedUserId: effectiveRuntime.assignedUserId ?? null,
              departmentId: effectiveDepartmentId,
              queueId: effectiveQueue?.id ?? effectiveRuntime.queueId ?? null,
              status: effectiveRuntime.status ?? runtimeConversationState.status ?? "WAITING",
              closedAt: null,
            };
            runtimeConversationState = await sendWebSessionHandoffNotifications({
              prisma,
              clientId: params.message.clientId,
              clientKey: params.message.tenantKey,
              waId: params.message.sender,
              waIdCanonical: params.message.senderCanonical,
              channelAccountId: params.message.channelAccountId,
              requestId,
              conversationId: conversation?.id ?? null,
              runtimeStateId: effectiveRuntime.id,
              queueId: stateForHandoffNotifications.queueId ?? null,
              state: stateForHandoffNotifications,
              now: params.message.timestamp,
              closedHandoffPolicy,
              closePolicy,
              transitionText: chatbotResult.replyText ?? null,
              includeOffHoursMessage: queueClosedHandoff,
              serviceCycle: handoffServiceCycle ?? getServiceCycleForDisplay(stateForHandoffNotifications),
            });
            await persistWebSessionRuntimeState({
              prisma,
              clientId: params.message.clientId,
              waId: params.message.sender,
              state: runtimeConversationState,
            });
            const [handoffDepartment, handoffAssignedUser] = await Promise.all([
              effectiveDepartmentId
                ? prisma.department.findFirst({
                    where: { id: effectiveDepartmentId, clientId: params.message.clientId },
                    select: { name: true },
                  })
                : null,
              effectiveRuntime.assignedUserId
                ? prisma.user.findFirst({
                    where: { id: effectiveRuntime.assignedUserId, clientId: params.message.clientId },
                    select: { name: true },
                  })
                : null,
            ]);
            const handoffRealtimeEvent = {
              type: "conversation.handoff.updated",
              clientId: params.message.clientId,
              waId: params.message.sender,
              waIdCanonical: params.message.senderCanonical,
              mode: "HUMAN",
              handoffStatus:
                runtimeConversationState.handoff.status === "none"
                  ? "active"
                  : runtimeConversationState.handoff.status,
              status: effectiveRuntime.status ?? runtimeConversationState.status ?? "WAITING",
              humanInboxVisible: true,
              assignedUserId: effectiveRuntime.assignedUserId ?? null,
              assignedUserName: handoffAssignedUser?.name ?? null,
              departmentId: effectiveDepartmentId,
              departmentName: handoffDepartment?.name ?? null,
              queueId: effectiveQueue?.id ?? effectiveRuntime.queueId ?? null,
              queueName: effectiveQueue?.name ?? null,
              protocol: getActiveServiceCycle(runtimeConversationState)?.protocol ?? null,
              cycleId: getActiveServiceCycle(runtimeConversationState)?.cycleId ?? null,
              lastInboundAt: inboundNotificationMessage.createdAt,
              updatedAt: new Date().toISOString(),
              notificationMessage: {
                messageId: inboundNotificationMessage.messageId,
                type: inboundNotificationMessage.type,
                bodyText: inboundNotificationMessage.bodyText,
                createdAt: inboundNotificationMessage.createdAt,
              },
            } satisfies Extract<InboxRealtimeEvent, { type: "conversation.handoff.updated" }>;
            if (params.publishHandoffRealtime) {
              await params.publishHandoffRealtime(handoffRealtimeEvent);
            } else {
              publishRealtimeEvent(handoffRealtimeEvent);
            }
          }
          await safeRecordInboundEvent({
            prisma,
            message: params.message,
            clientId: params.message.clientId,
            eventName: "whatsapp.web.chatbot.flow.checked",
            requestId: `${requestId}:chatbot`,
            conversationId: conversation?.id ?? null,
            reason: chatbotResult.handled ? "handled" : "not_handled",
          });
        }
      } else if (runtimeConversationState.chatbotActive && extractChatbotFlowId(runtimeConversationState.flow)) {
        const previousFlowId = extractChatbotFlowId(runtimeConversationState.flow);
        runtimeConversationState = clearChatbotRuntime(runtimeConversationState);
        await persistWebSessionRuntimeState({
          prisma,
          clientId: params.message.clientId,
          waId: params.message.sender,
          state: runtimeConversationState,
        });
        logger.info({
          event: "flow.runtime_coherence.cleared",
          reason: "flow_not_executable",
          clientId: params.message.clientId,
          clientKey: params.message.tenantKey,
          flowId: previousFlowId,
          provider: "web_session",
          requestId,
        });
      }
    }
    await safeRecordInboundEvent({
      prisma,
      message: params.message,
      clientId: params.message.clientId,
      eventName: params.message.media
        ? "whatsapp.web.inbound.media.persisted"
        : "whatsapp.web.inbound.persisted",
      requestId: `${requestId}:persisted`,
      conversationId: conversation?.id ?? null,
    });
    return { ok: true, action: "persisted", waId: params.message.sender, messageId, conversationId: conversation?.id ?? null };
  } catch (error) {
    await markLogicalProcessingFailedRetryable(
      error instanceof Prisma.PrismaClientKnownRequestError
        ? error.code
        : error instanceof Error
          ? error.name
          : "unknown_error"
    );
    await deleteWebSessionStoredMedia(params.message.media);
    await safeRecordInboundEvent({
      prisma,
      message: params.message,
      clientId: params.message.clientId,
      eventName: "whatsapp.web.inbound.failed",
      requestId: `${requestId}:failed`,
      reason: "persist_error",
    });
    logger.error({
      event: "whatsapp.web.inbound.failed",
      clientId: params.message.clientId,
      channelAccountId: params.message.channelAccountId,
      waIdSuffix: maskIdentifier(params.message.sender).suffix,
      errorName: error instanceof Error ? error.name : "unknown_error",
      errorCode: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined,
    });
    return { ok: false, action: "failed", reason: "persist_error" };
  } finally {
    if (!logicalProcessingFailed) {
      await markLogicalProcessingCompleted();
    }
  }
}

export async function ingestBaileysWebSessionMessage(params: {
  prisma?: PrismaClient;
  clientId: string;
  tenantKey: string;
  channelAccountDbId: string;
  channelAccountId: string;
  message: BaileysInboundMessageLike;
  resolvedSenderJid?: string | null;
  cutoverAt?: Date | null;
  publishMessageCreatedRealtime?: WebSessionMessageCreatedRealtimePublisher;
  publishHandoffRealtime?: (
    event: Extract<InboxRealtimeEvent, { type: "conversation.handoff.updated" }>
  ) => Promise<void>;
}) {
  const prisma = params.prisma ?? getPrisma();
  const normalized = normalizeBaileysInboundMessage(params);
  if (!normalized.ok) {
    await safeRecordInboundEvent({
      prisma,
      clientId: params.clientId,
      eventName: "whatsapp.web.inbound.ignored",
      requestId: `web-session-inbound:${params.channelAccountDbId}:ignored:${Date.now()}`,
      reason: normalized.reason,
    });
    return { ok: true as const, action: "ignored" as const, reason: normalized.reason };
  }
  if (params.cutoverAt && normalized.message.timestamp < params.cutoverAt) {
    await safeRecordInboundEvent({
      prisma,
      message: normalized.message,
      clientId: params.clientId,
      eventName: "whatsapp.web.inbound.ignored",
      requestId: `web-session-inbound:${params.channelAccountDbId}:${normalized.message.externalMessageId}:before-cutover`,
      reason: "before_cutover",
    });
    return { ok: true as const, action: "ignored" as const, reason: "before_cutover" };
  }
  const normalizedKind = normalized.message.type.toLowerCase();
  if (isWhatsappMediaKind(normalizedKind)) {
    const mediaPolicy = await resolveWhatsappMediaPolicy({
      prisma,
      clientId: params.clientId,
    });
    if (!isWhatsappMediaAllowed(mediaPolicy.policy, "inbound", normalizedKind)) {
      if (normalized.message.media) {
        await deleteWebSessionStoredMedia(normalized.message.media).catch((error) => {
          logger.warn({
            event: "whatsapp.web.inbound.media_policy.cleanup_failed",
            clientId: params.clientId,
            requestId: `web-session-inbound:${params.channelAccountDbId}:${normalized.message.externalMessageId}:media-policy`,
            mediaKind: normalizedKind,
            message: (error as Error).message,
          });
        });
      }
      await safeRecordInboundEvent({
        prisma,
        message: normalized.message,
        clientId: params.clientId,
        eventName: "whatsapp.media_policy.blocked",
        requestId: `web-session-inbound:${params.channelAccountDbId}:${normalized.message.externalMessageId}:media-policy`,
        reason: "media_type_not_allowed",
      });
      return { ok: true as const, action: "ignored" as const, reason: "media_type_not_allowed" };
    }
  }
  return ingestWebSessionInboundMessage({
    prisma,
    message: normalized.message,
    publishMessageCreatedRealtime: params.publishMessageCreatedRealtime,
    publishHandoffRealtime: params.publishHandoffRealtime,
  });
}
