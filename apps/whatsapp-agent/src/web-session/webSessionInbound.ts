import crypto from "node:crypto";
import { HandoffStatus, MessageType, Prisma, type PrismaClient } from "@prisma/client";
import { getDefaultOperationalDepartment } from "../bootstrap/defaultOperationalDepartment.js";
import {
  clearChatbotRuntime,
  executeChatbotFlow,
  extractChatbotFlowId,
  validateChatbotFlowDefinition,
} from "../chatbot/chatbotFlow.js";
import type { ConversationState, QuoteSiteAnswers } from "../conversation/conversation.types.js";
import { activateHumanHandoff, updateOutbound } from "../conversation/conversation.service.js";
import { getPrisma } from "../db.js";
import { logger } from "../logger/logger.js";
import { deleteWebSessionStoredMedia, type WebSessionStoredMedia } from "../media/webSessionMedia.js";
import { recordConversationInboundMetrics } from "../metrics/conversationMetrics.js";
import { applyBalancedQueueAssignment } from "../queue/assignmentPolicy.js";
import { publishRealtimeEvent } from "../realtime/hub.js";
import { makeConversationKey } from "../storage/conversationKey.js";
import { canonicalizeBrazilWaId, normalizeWaIdDigits } from "../utils/waid.js";
import { persistConversationWindow, persistInboundMessage } from "../db/persist.js";
import { resolveAutomationFlagsSettings } from "../config/tenantOperationalConfig.js";
import { createWebSessionTextOutboundMessage } from "./webSessionOutboundService.js";

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
  const senderJid = pickSenderJid({ key, resolvedSenderJid: params.resolvedSenderJid });
  const sender = extractPhoneFromBaileysJid(senderJid);
  if (!sender) return { ok: false, reason: "unsupported_jid" };
  const externalMessageId = String(key.id ?? "").trim();
  const type = detectMessageType(message);
  const text = type === MessageType.TEXT ? readTextPayload(message) : readMediaCaption(message, type);
  const senderCanonical = canonicalizeBrazilWaId(sender);
  const media = params.message.webSessionMedia ?? null;
  const providerObservedName = normalizeProviderObservedName(params.message.pushName);
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

async function ensureWebSessionRuntimeState(params: {
  prisma: PrismaClient;
  message: NormalizedWebSessionInboundMessage;
  conversationId: string | null;
  requestId: string;
  chatbotEntryPointAvailable: boolean;
}) {
  const department = await getDefaultOperationalDepartment(params.prisma, params.message.clientId);
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
      assignedUserId: true,
    },
  });
  const existingHumanMode = existing?.mode === "HUMAN" || existing?.handoffStatus === "ACTIVE" || existing?.handoffStatus === "PENDING";
  const shouldStartBot = params.chatbotEntryPointAvailable && !existingHumanMode;
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
      departmentId: department?.id ?? undefined,
      ...(shouldStartBot
        ? {
            mode: "BOT",
            status: null,
            assignedUserId: null,
            assignedTo: null,
            assignedAt: null,
          }
        : {
            status: existing?.status ?? "WAITING",
          }),
      closedAt: null,
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
      departmentId: department?.id ?? undefined,
      status: shouldStartBot ? undefined : "WAITING",
      chatbotActive: false,
      answers: {},
    },
    select: {
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
  return runtime;
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

function runtimeToConversationState(params: {
  runtime: WebSessionRuntimeState;
  message: NormalizedWebSessionInboundMessage;
}): ConversationState {
  return {
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
}) {
  await params.prisma.conversationRuntimeState.update({
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
  });
}

async function ensureWebSessionContactIdentity(params: {
  prisma: PrismaClient;
  message: NormalizedWebSessionInboundMessage;
}) {
  const providerObservedName = normalizeProviderObservedName(params.message.providerObservedName);
  const [existingContact, existingLead] = await Promise.all([
    params.prisma.contact.findUnique({
      where: {
        clientId_waId: {
          clientId: params.message.clientId,
          waId: params.message.sender,
        },
      },
      select: { id: true, name: true },
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
  const safeContactName =
    providerObservedName && !existingContact?.name && !isAnonymizedMarker(existingContact?.name)
      ? providerObservedName
      : undefined;
  const safeLeadName =
    providerObservedName && !existingLead?.name && !isAnonymizedMarker(existingLead?.name)
      ? providerObservedName
      : undefined;
  const contact = await params.prisma.contact.upsert({
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
  await params.prisma.lead.upsert({
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
}

export async function ingestWebSessionInboundMessage(params: {
  prisma?: PrismaClient;
  message: NormalizedWebSessionInboundMessage;
}): Promise<WebSessionInboundResult> {
  const prisma = params.prisma ?? getPrisma();
  const messageId = buildLocalMessageId(params.message);
  const requestId = `web-session-inbound:${params.message.channelAccountDbId}:${params.message.externalMessageId}`;
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
    const rawPayload = {
      ...(params.message.rawPayload as Record<string, unknown>),
      ...(quotedReference ? { contextualReply: serializeQuotedReferenceForRawPayload(quotedReference) } : {}),
    } satisfies Prisma.InputJsonObject;
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
      reopenClosed: true,
      requestId,
    });
    const conversation = await prisma.conversation.findUnique({
      where: { clientId_waId: { clientId: params.message.clientId, waId: params.message.sender } },
      select: { id: true },
    });
    await ensureWebSessionContactIdentity({ prisma, message: params.message });
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
    const runtime = await ensureWebSessionRuntimeState({
      prisma,
      message: params.message,
      conversationId: conversation?.id ?? null,
      requestId,
      chatbotEntryPointAvailable: Boolean(entryPointFlow),
    });
    let runtimeConversationState = runtimeToConversationState({ runtime, message: params.message });
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
    publishRealtimeEvent({
      type: "message.created",
      clientId: params.message.clientId,
      waId: params.message.sender,
      waIdCanonical: params.message.senderCanonical,
      mode: runtimeConversationState.mode === "HUMAN" ? "HUMAN" : "BOT",
      handoffStatus: runtimeConversationState.handoff.status,
      assignedUserId: runtime.assignedUserId ?? null,
      departmentId: runtime.departmentId ?? null,
      message: {
        internalMessageId: insertedMessage?.id ?? null,
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
    });
    if (
      automationFlags.settings.disableChatbot !== true &&
      runtimeConversationState.mode !== "HUMAN" &&
      runtimeConversationState.handoff.status === "none"
    ) {
      const chatbotFlow = runtimeConversationState.chatbotActive
        ? await loadWebSessionChatbotFlow({
            prisma,
            clientId: params.message.clientId,
            state: runtimeConversationState,
          })
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
          const chatbotResult = executeChatbotFlow({
            flowId: chatbotFlow.id,
            definition: validatedDefinition.definition,
            state: runtimeConversationState,
            inboundText: params.message.text,
            nowIso: params.message.timestamp.toISOString(),
          });
          runtimeConversationState = chatbotResult.state;
          for (const event of chatbotResult.events ?? []) {
            logger.info({
              ...event,
              clientId: params.message.clientId,
              provider: "web_session",
            });
          }
          if (chatbotResult.replyText?.trim()) {
            const outboundResult = await createWebSessionTextOutboundMessage({
              prisma,
              waId: params.message.sender,
              waIdCanonical: params.message.senderCanonical,
              text: chatbotResult.replyText,
              clientKey: params.message.tenantKey,
              clientId: params.message.clientId,
              requestId: `${requestId}:bot-reply`,
              actorUserId: null,
              outboundSource: "bot",
              skipAgentSignature: true,
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
              publishRealtimeEvent({
                type: "message.created",
                clientId: params.message.clientId,
                waId: params.message.sender,
                waIdCanonical: params.message.senderCanonical,
                mode: runtimeConversationState.mode === "HUMAN" ? "HUMAN" : "BOT",
                handoffStatus: runtimeConversationState.handoff.status,
                assignedUserId: runtimeConversationState.assignedUserId ?? null,
                departmentId: runtimeConversationState.departmentId ?? null,
                message: {
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
              });
            }
          }
          if (chatbotResult.pendingHandoff) {
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
            };
          }
          await persistWebSessionRuntimeState({
            prisma,
            clientId: params.message.clientId,
            waId: params.message.sender,
            state: runtimeConversationState,
          });
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
            (runtimeConversationState.mode === "HUMAN" || runtimeConversationState.status === "WAITING")
          ) {
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
            publishRealtimeEvent({
              type: "conversation.handoff.updated",
              clientId: params.message.clientId,
              waId: params.message.sender,
              waIdCanonical: params.message.senderCanonical,
              mode: "HUMAN",
              handoffStatus:
                runtimeConversationState.handoff.status === "none"
                  ? "active"
                  : runtimeConversationState.handoff.status,
              assignedUserId: postFlowRuntime.assignedUserId ?? null,
              departmentId: postFlowRuntime.departmentId ?? null,
              updatedAt: new Date().toISOString(),
            });
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
    });
    return { ok: false, action: "failed", reason: "persist_error" };
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
  return ingestWebSessionInboundMessage({ prisma, message: normalized.message });
}
