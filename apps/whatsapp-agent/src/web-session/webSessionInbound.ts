import crypto from "node:crypto";
import { MessageType, Prisma, type PrismaClient } from "@prisma/client";
import { getDefaultOperationalDepartment } from "../bootstrap/defaultOperationalDepartment.js";
import { getPrisma } from "../db.js";
import { logger } from "../logger/logger.js";
import { recordConversationInboundMetrics } from "../metrics/conversationMetrics.js";
import { applyBalancedQueueAssignment } from "../queue/assignmentPolicy.js";
import { publishRealtimeEvent } from "../realtime/hub.js";
import { makeConversationKey } from "../storage/conversationKey.js";
import { canonicalizeBrazilWaId, normalizeWaIdDigits } from "../utils/waid.js";
import { persistConversationWindow, persistInboundMessage } from "../db/persist.js";

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
  replyToExternalMessageId?: string | null;
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

function detectMessageType(message: Record<string, unknown>) {
  if (readTextPayload(message) !== null) return MessageType.TEXT;
  if (isRecord(message.imageMessage)) return MessageType.IMAGE;
  if (isRecord(message.audioMessage)) return MessageType.AUDIO;
  if (isRecord(message.videoMessage)) return MessageType.VIDEO;
  if (isRecord(message.documentMessage)) return MessageType.DOCUMENT;
  return MessageType.UNKNOWN;
}

function extractReplyToExternalMessageId(message: Record<string, unknown>) {
  const extendedText = isRecord(message.extendedTextMessage) ? message.extendedTextMessage : null;
  const contextInfo = isRecord(extendedText?.contextInfo) ? extendedText.contextInfo : null;
  const stanzaId = typeof contextInfo?.stanzaId === "string" ? contextInfo.stanzaId.trim() : "";
  return stanzaId || null;
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
  const text = type === MessageType.TEXT ? readTextPayload(message) : null;
  const senderCanonical = canonicalizeBrazilWaId(sender);
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
      replyToExternalMessageId: extractReplyToExternalMessageId(message),
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
}) {
  const department = await getDefaultOperationalDepartment(params.prisma, params.message.clientId);
  const conversationKey = makeConversationKey(params.message.tenantKey, params.message.sender);
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
      status: "WAITING",
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
      mode: "HUMAN",
      departmentId: department?.id ?? undefined,
      status: "WAITING",
      chatbotActive: false,
      answers: {},
    },
    select: {
      id: true,
      assignedUserId: true,
      departmentId: true,
      queueId: true,
      status: true,
    },
  });
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
  return runtime;
}

async function ensureWebSessionContactIdentity(params: {
  prisma: PrismaClient;
  message: NormalizedWebSessionInboundMessage;
}) {
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
    },
    create: {
      clientId: params.message.clientId,
      waId: params.message.sender,
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
    },
    create: {
      tenantId: params.message.clientId,
      waId: params.message.sender,
      waIdCanonical: params.message.senderCanonical,
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
    eventName: "whatsapp.web.inbound.received",
    requestId: `${requestId}:received`,
  });

  try {
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
      rawPayload: params.message.rawPayload,
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
    const runtime = await ensureWebSessionRuntimeState({
      prisma,
      message: params.message,
      conversationId: conversation?.id ?? null,
      requestId,
    });
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
      mode: "HUMAN",
      handoffStatus: "none",
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
        templateName: null,
        templateLang: null,
        requestId,
        messageId,
        metaMessageId: null,
        errorBody: null,
        createdAt: params.message.timestamp.toISOString(),
      },
    });
    await safeRecordInboundEvent({
      prisma,
      message: params.message,
      clientId: params.message.clientId,
      eventName: "whatsapp.web.inbound.persisted",
      requestId: `${requestId}:persisted`,
      conversationId: conversation?.id ?? null,
    });
    return { ok: true, action: "persisted", waId: params.message.sender, messageId, conversationId: conversation?.id ?? null };
  } catch (error) {
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
