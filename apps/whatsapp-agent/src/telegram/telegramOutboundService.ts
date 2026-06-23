import crypto from "node:crypto";
import { ConversationOperationalStatus, MessageStatus, MessageType, Prisma, type PrismaClient } from "@prisma/client";
import { checkUsageGate } from "../usage/usageGate.js";
import { decryptMessengerExternalUserRef } from "../channels/messengerOutbound.js";
import { getFeatures } from "../features/clientFeatures.js";
import { logger } from "../logger/logger.js";
import { recordConversationAgentOutboundMetrics } from "../metrics/conversationMetrics.js";

const TELEGRAM_SECRET_KIND = "telegramBotToken";
const TELEGRAM_API_BASE_URL = "https://api.telegram.org";
const MAX_MESSAGE_LENGTH = 4_000;

type UsageGateCheck = typeof checkUsageGate;
type MetricsRecorder = typeof recordConversationAgentOutboundMetrics;

function normalizeText(input: unknown, maxLength = MAX_MESSAGE_LENGTH) {
  if (typeof input !== "string") return "";
  return input.trim().replace(/\r\n/g, "\n").replace(/\r/g, "\n").slice(0, maxLength);
}

function getEncryptionKey() {
  const value = process.env.CHANNEL_ACCOUNT_SECRET_KEY?.trim();
  if (!value) return null;
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

function decryptTelegramSecret(ciphertext: string | null | undefined) {
  const raw = ciphertext?.trim();
  const key = getEncryptionKey();
  if (!raw || !key || !raw.startsWith("v1:")) return null;
  const parts = raw.split(":");
  if (parts.length !== 4) return null;
  try {
    const [, ivRaw, tagRaw, encryptedRaw] = parts;
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivRaw, "base64"));
    decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, "base64")),
      decipher.final(),
    ]).toString("utf8").trim() || null;
  } catch {
    return null;
  }
}

function sanitizeErrorBody(value: string | null) {
  const raw = value?.trim();
  if (!raw) return null;
  return raw
    .replace(/bot[0-9]+:[A-Za-z0-9_-]+/g, "bot<redacted>")
    .replace(/\"token\"\s*:\s*\"[^\"]+\"/g, "\"token\":\"<redacted>\"")
    .slice(0, 2000);
}

function logTelegramOutbound(params: {
  event: "telegram.outbound.sent" | "telegram.outbound.failed" | "telegram.outbound.blocked";
  tenantKey: string;
  channelAccountId?: string | null;
  externalUserHash?: string | null;
  requestId: string;
  reason?: string;
  status?: number | null;
}) {
  logger.info({
    event: params.event,
    tenantKey: params.tenantKey,
    channel: "telegram",
    provider: "telegram",
    channelAccountId: params.channelAccountId ?? null,
    externalUserHash: params.externalUserHash ? params.externalUserHash.slice(0, 16) : null,
    requestId: params.requestId,
    reason: params.reason,
    status: params.status ?? null,
  });
}

async function persistTelegramOutboundEvent(params: {
  prisma: PrismaClient;
  clientId: string;
  conversationId?: string | null;
  waId?: string | null;
  waIdCanonical?: string | null;
  messageId?: string | null;
  requestId: string;
  eventName: "telegram.outbound.sent" | "telegram.outbound.failed" | "telegram.outbound.blocked";
  payloadJson: Prisma.InputJsonValue;
}) {
  await params.prisma.event.create({
    data: {
      clientId: params.clientId,
      conversationId: params.conversationId ?? undefined,
      waId: params.waId ?? undefined,
      waIdCanonical: params.waIdCanonical ?? undefined,
      messageId: params.messageId ?? undefined,
      requestId: params.requestId,
      eventName: params.eventName,
      payloadJson: params.payloadJson,
    },
  });
}

async function blockTelegramOutbound(params: {
  prisma: PrismaClient;
  clientId: string;
  clientKey: string;
  requestId: string;
  reason: string;
  message?: string;
  statusCode?: number;
  channelAccountId?: string | null;
  externalUserHash?: string | null;
  waId?: string | null;
  waIdCanonical?: string | null;
  conversationId?: string | null;
}) {
  logTelegramOutbound({
    event: "telegram.outbound.blocked",
    tenantKey: params.clientKey,
    channelAccountId: params.channelAccountId,
    externalUserHash: params.externalUserHash,
    requestId: params.requestId,
    reason: params.reason,
  });
  await persistTelegramOutboundEvent({
    prisma: params.prisma,
    clientId: params.clientId,
    conversationId: params.conversationId,
    waId: params.waId,
    waIdCanonical: params.waIdCanonical,
    requestId: params.requestId,
    eventName: "telegram.outbound.blocked",
    payloadJson: {
      reason: params.reason,
      channelAccountId: params.channelAccountId ?? null,
      externalUserHash: params.externalUserHash ? params.externalUserHash.slice(0, 16) : null,
    } satisfies Prisma.InputJsonObject,
  });
  return {
    ok: false as const,
    statusCode: params.statusCode ?? 409,
    error: params.reason,
    message: params.message,
  };
}

export async function sendTelegramTextMessage(params: {
  botToken: string;
  chatId: string;
  text: string;
  fetchImpl?: typeof fetch;
}): Promise<
  | { ok: true; status: number; messageId: string | null }
  | { ok: false; status: number; errorBody: string | null }
> {
  const fetchImpl = params.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${TELEGRAM_API_BASE_URL}/bot${params.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: params.chatId,
        text: params.text,
      }),
    });
  } catch (error) {
    return {
      ok: false,
      status: 0,
      errorBody: sanitizeErrorBody((error as Error).message) ?? "telegram_request_failed",
    };
  }
  const bodyText = await response.text().catch(() => "");
  if (!response.ok) {
    return { ok: false, status: response.status, errorBody: sanitizeErrorBody(bodyText) };
  }
  let parsed: unknown = null;
  try {
    parsed = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    parsed = null;
  }
  const result =
    parsed && typeof parsed === "object" && "result" in parsed
      ? (parsed as { result?: unknown }).result
      : null;
  const messageId =
    result && typeof result === "object" && "message_id" in result
      ? String((result as { message_id?: unknown }).message_id ?? "").trim() || null
      : null;
  return { ok: true, status: response.status, messageId };
}

export type TelegramOutboundResult =
  | { ok: true; status: "SENT" | "FAILED"; messageId: string; metaMessageId: string | null; createdAt: string }
  | { ok: false; statusCode: number; error: string; message?: string };

export async function createTelegramOutboundMessage(params: {
  prisma: PrismaClient;
  requestId: string;
  clientId: string;
  clientKey: string;
  waId: string;
  text: string;
  source?: {
    channel?: string | null;
    provider?: string | null;
    channelAccountId?: string | null;
  } | null;
  fetchImpl?: typeof fetch;
  usageGateCheck?: UsageGateCheck;
  metricsRecorder?: MetricsRecorder;
}): Promise<TelegramOutboundResult> {
  const textRaw = String(params.text ?? "");
  const text = normalizeText(textRaw, MAX_MESSAGE_LENGTH);
  if (!text) return { ok: false, statusCode: 400, error: "telegram_message_required" };
  if (textRaw.length > MAX_MESSAGE_LENGTH) return { ok: false, statusCode: 400, error: "telegram_message_too_long" };

  const client = await params.prisma.client.findUnique({
    where: { id: params.clientId },
    select: { id: true, clientKey: true, status: true, features: true, profile: true },
  });
  if (!client || client.clientKey !== params.clientKey) return { ok: false, statusCode: 404, error: "client_not_found" };
  if (client.status !== "ACTIVE") return { ok: false, statusCode: 403, error: "client_inactive" };
  const features = getFeatures(client);
  if (!features.telegram || !features.telegramOutbound) {
    return blockTelegramOutbound({
      prisma: params.prisma,
      clientId: params.clientId,
      clientKey: params.clientKey,
      requestId: params.requestId,
      reason: "telegram_outbound_disabled",
      message: "Envio por Telegram ainda não está habilitado neste canal.",
      channelAccountId: params.source?.channelAccountId ?? null,
      waId: params.waId,
    });
  }

  const runtimeState = await params.prisma.conversationRuntimeState.findFirst({
    where: {
      clientId: params.clientId,
      waId: params.waId,
      channel: "telegram",
      ...(params.source?.channelAccountId ? { channelAccountId: params.source.channelAccountId } : {}),
    },
    select: {
      id: true,
      waId: true,
      waIdCanonical: true,
      channelAccountId: true,
      externalUserHash: true,
      externalUserRef: true,
      assignedAt: true,
      assignedUserId: true,
      mode: true,
      status: true,
    },
  });
  if (!runtimeState?.channelAccountId || !runtimeState.externalUserHash) {
    return blockTelegramOutbound({
      prisma: params.prisma,
      clientId: params.clientId,
      clientKey: params.clientKey,
      requestId: params.requestId,
      reason: "telegram_chat_unavailable",
      message: "Nao ha referencia segura do contato Telegram para envio. Aguarde nova mensagem do usuario.",
      channelAccountId: params.source?.channelAccountId ?? null,
      waId: params.waId,
      waIdCanonical: runtimeState?.waIdCanonical ?? null,
    });
  }

  const account = await params.prisma.channelAccount.findFirst({
    where: {
      clientId: params.clientId,
      channel: "telegram",
      provider: "telegram",
      channelAccountId: runtimeState.channelAccountId,
    },
    include: {
      secrets: { where: { secretKind: TELEGRAM_SECRET_KIND }, select: { status: true, secretCiphertext: true } },
    },
  });
  if (!account || !account.enabled || !account.runtimeEnabled || !account.outboundEnabled || account.status !== "connected") {
    return blockTelegramOutbound({
      prisma: params.prisma,
      clientId: params.clientId,
      clientKey: params.clientKey,
      requestId: params.requestId,
      reason: "telegram_account_inactive",
      message: "Conta Telegram inativa para envio.",
      channelAccountId: runtimeState.channelAccountId,
      externalUserHash: runtimeState.externalUserHash,
      waId: params.waId,
      waIdCanonical: runtimeState.waIdCanonical,
    });
  }
  const tokenSecret = account.secrets.find((secret) => secret.status === "configured" && secret.secretCiphertext);
  const botToken = decryptTelegramSecret(tokenSecret?.secretCiphertext);
  if (!botToken || account.tokenStatus !== "configured") {
    return blockTelegramOutbound({
      prisma: params.prisma,
      clientId: params.clientId,
      clientKey: params.clientKey,
      requestId: params.requestId,
      reason: "telegram_token_missing",
      message: "Token Telegram indisponivel para envio.",
      channelAccountId: runtimeState.channelAccountId,
      externalUserHash: runtimeState.externalUserHash,
      waId: params.waId,
      waIdCanonical: runtimeState.waIdCanonical,
    });
  }

  const chatId = decryptMessengerExternalUserRef(runtimeState.externalUserRef);
  if (!chatId) {
    return blockTelegramOutbound({
      prisma: params.prisma,
      clientId: params.clientId,
      clientKey: params.clientKey,
      requestId: params.requestId,
      reason: "telegram_chat_unavailable",
      message: "Nao ha referencia segura do contato Telegram para envio. Aguarde nova mensagem do usuario.",
      channelAccountId: runtimeState.channelAccountId,
      externalUserHash: runtimeState.externalUserHash,
      waId: params.waId,
      waIdCanonical: runtimeState.waIdCanonical,
    });
  }

  const usageGate = await (params.usageGateCheck ?? checkUsageGate)({
    clientId: params.clientId,
    clientKey: params.clientKey,
    messageType: "text",
    requestId: params.requestId,
    waId: params.waId,
  });
  if (!usageGate.allowed) return { ok: false, statusCode: 429, error: "usage_limit_reached" };

  const sendResult = await sendTelegramTextMessage({
    botToken,
    chatId,
    text,
    fetchImpl: params.fetchImpl,
  });
  const status = sendResult.ok ? MessageStatus.SENT : MessageStatus.FAILED;
  const createdAt = new Date();
  const messageId = `admin.telegram.send.${params.requestId}`;
  const metaMessageId = sendResult.ok ? sendResult.messageId : null;
  const conversation = await params.prisma.conversation.findFirst({
    where: {
      clientId: params.clientId,
      waId: params.waId,
      channel: "telegram",
      channelAccountId: runtimeState.channelAccountId,
    },
    select: { id: true },
  });

  await params.prisma.outboundMessage.upsert({
    where: { clientId_messageId: { clientId: params.clientId, messageId } },
    create: {
      clientId: params.clientId,
      phoneNumberId: null,
      waId: params.waId,
      waIdCanonical: runtimeState.waIdCanonical ?? params.waId,
      messageId,
      channel: "telegram",
      provider: "telegram",
      channelAccountId: runtimeState.channelAccountId,
      externalUserHash: runtimeState.externalUserHash,
      externalUserRef: runtimeState.externalUserRef,
      externalMessageId: metaMessageId,
      legacyWaId: null,
      type: MessageType.TEXT,
      status,
      bodyText: text,
      requestId: params.requestId,
      metaMessageId,
      errorBody: sendResult.ok ? null : sendResult.errorBody,
      rawPayload: {
        source: "app_inbox_telegram",
        status,
        providerStatus: sendResult.status,
        messageLength: text.length,
      } satisfies Prisma.InputJsonValue,
    },
    update: {
      status,
      bodyText: text,
      externalMessageId: metaMessageId,
      metaMessageId,
      errorBody: sendResult.ok ? null : sendResult.errorBody,
      rawPayload: {
        source: "app_inbox_telegram",
        status,
        providerStatus: sendResult.status,
        messageLength: text.length,
      } satisfies Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  await Promise.all([
    params.prisma.conversation.updateMany({
      where: {
        clientId: params.clientId,
        waId: params.waId,
        channel: "telegram",
        channelAccountId: runtimeState.channelAccountId,
      },
      data: { lastOutboundAt: createdAt },
    }),
    params.prisma.conversationRuntimeState.updateMany({
      where: {
        clientId: params.clientId,
        waId: params.waId,
        channel: "telegram",
        channelAccountId: runtimeState.channelAccountId,
      },
      data: {
        lastOutboundAt: createdAt,
        lastOutboundMessageId: messageId,
        status: ConversationOperationalStatus.IN_PROGRESS,
      },
    }),
  ]);

  await (params.metricsRecorder ?? recordConversationAgentOutboundMetrics)({
    prisma: params.prisma,
    clientId: params.clientId,
    waId: params.waId,
    occurredAt: createdAt,
    wasInserted: sendResult.ok,
    assignedAt: runtimeState.assignedAt?.toISOString() ?? null,
    assignedUserId: runtimeState.assignedUserId ?? null,
    requestId: params.requestId,
  });
  await persistTelegramOutboundEvent({
    prisma: params.prisma,
    clientId: params.clientId,
    conversationId: conversation?.id ?? null,
    waId: params.waId,
    waIdCanonical: runtimeState.waIdCanonical ?? params.waId,
    messageId,
    requestId: params.requestId,
    eventName: sendResult.ok ? "telegram.outbound.sent" : "telegram.outbound.failed",
    payloadJson: {
      channelAccountId: runtimeState.channelAccountId,
      externalUserHash: runtimeState.externalUserHash.slice(0, 16),
      status,
      providerStatus: sendResult.status,
    } satisfies Prisma.InputJsonObject,
  });
  logTelegramOutbound({
    event: sendResult.ok ? "telegram.outbound.sent" : "telegram.outbound.failed",
    tenantKey: params.clientKey,
    channelAccountId: runtimeState.channelAccountId,
    externalUserHash: runtimeState.externalUserHash,
    requestId: params.requestId,
    status: sendResult.status,
  });

  return {
    ok: true,
    status,
    messageId,
    metaMessageId,
    createdAt: createdAt.toISOString(),
  };
}
