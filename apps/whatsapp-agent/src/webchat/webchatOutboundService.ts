import crypto from "node:crypto";
import { ConversationOperationalStatus, MessageStatus, MessageType, Prisma, type PrismaClient } from "@prisma/client";
import { getFeatures } from "../features/clientFeatures.js";
import { recordConversationAgentOutboundMetrics } from "../metrics/conversationMetrics.js";
import { checkUsageGate } from "../usage/usageGate.js";
import { logger } from "../logger/logger.js";

const MAX_MESSAGE_LENGTH = 4_000;

type JsonInput = Record<string, unknown>;

type UsageGateCheck = typeof checkUsageGate;
type MetricsRecorder = typeof recordConversationAgentOutboundMetrics;

function normalizeText(input: unknown, maxLength: number) {
  if (typeof input !== "string") return "";
  return input.trim().replace(/\r\n/g, "\n").replace(/\r/g, "\n").slice(0, maxLength);
}

function normalizeWebchatDomain(input: unknown) {
  const value = normalizeText(input, 253).toLowerCase();
  if (!value) return "";
  try {
    const parsed = value.startsWith("http://") || value.startsWith("https://")
      ? new URL(value)
      : new URL(`https://${value}`);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return value
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .replace(/:\d+$/, "")
      .replace(/^www\./, "")
      .trim();
  }
}

function shortHash(input: string, size = 24) {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, size);
}

function logWebchatOutbound(params: {
  event: "webchat.message.outbound_created" | "webchat.outbound.blocked";
  tenantKey: string;
  channelAccountId?: string | null;
  externalUserHash?: string | null;
  requestId: string;
  reason?: string;
}) {
  logger.info({
    event: params.event,
    tenantKey: params.tenantKey,
    channel: "webchat",
    provider: "converta",
    channelAccountId: params.channelAccountId ?? null,
    externalUserHash: params.externalUserHash ? params.externalUserHash.slice(0, 16) : null,
    requestId: params.requestId,
    reason: params.reason,
  });
}

async function persistWebchatEvent(params: {
  prisma: PrismaClient;
  clientId: string;
  conversationId?: string | null;
  waId?: string | null;
  waIdCanonical?: string | null;
  messageId?: string | null;
  requestId: string;
  eventName: "webchat.message.outbound_created" | "webchat.outbound.blocked";
  payloadJson: Prisma.InputJsonValue;
}) {
  try {
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
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
    throw error;
  }
}

async function blockOutbound(params: {
  prisma: PrismaClient;
  clientId: string;
  clientKey: string;
  requestId: string;
  reason: string;
  statusCode?: number;
  message?: string;
  channelAccountId?: string | null;
  externalUserHash?: string | null;
  waId?: string | null;
  waIdCanonical?: string | null;
  conversationId?: string | null;
}) {
  logWebchatOutbound({
    event: "webchat.outbound.blocked",
    tenantKey: params.clientKey,
    channelAccountId: params.channelAccountId,
    externalUserHash: params.externalUserHash,
    requestId: params.requestId,
    reason: params.reason,
  });
  await persistWebchatEvent({
    prisma: params.prisma,
    clientId: params.clientId,
    conversationId: params.conversationId,
    waId: params.waId,
    waIdCanonical: params.waIdCanonical,
    requestId: params.requestId,
    eventName: "webchat.outbound.blocked",
    payloadJson: {
      reason: params.reason,
      channelAccountId: params.channelAccountId ?? null,
      externalUserHash: params.externalUserHash ? params.externalUserHash.slice(0, 16) : null,
    } satisfies Prisma.InputJsonValue,
  });
  return {
    ok: false as const,
    statusCode: params.statusCode ?? 409,
    error: params.reason,
    message: params.message,
  };
}

export type WebchatOutboundResult =
  | {
      ok: true;
      status: "SENT";
      messageId: string;
      metaMessageId: null;
      createdAt: string;
    }
  | { ok: false; statusCode: number; error: string; message?: string };

export async function createWebchatOutboundMessage(params: {
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
  usageGateCheck?: UsageGateCheck;
  metricsRecorder?: MetricsRecorder;
}): Promise<WebchatOutboundResult> {
  const textRaw = String(params.text ?? "");
  const text = normalizeText(textRaw, MAX_MESSAGE_LENGTH);
  if (!text) return { ok: false, statusCode: 400, error: "webchat_message_required" };
  if (textRaw.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, statusCode: 400, error: "webchat_message_too_long" };
  }

  const client = await params.prisma.client.findUnique({
    where: { id: params.clientId },
    select: { id: true, clientKey: true, status: true, features: true, profile: true },
  });
  if (!client || client.clientKey !== params.clientKey) {
    return { ok: false, statusCode: 404, error: "client_not_found" };
  }
  if (client.status !== "ACTIVE") {
    return { ok: false, statusCode: 403, error: "client_inactive" };
  }
  const features = getFeatures(client);
  if (!features.webchat || !features.webchatOutbound) {
    return blockOutbound({
      prisma: params.prisma,
      clientId: params.clientId,
      clientKey: params.clientKey,
      requestId: params.requestId,
      reason: "webchat_outbound_disabled",
      message: "Envio por Webchat ainda não está habilitado neste canal.",
      channelAccountId: params.source?.channelAccountId ?? null,
      waId: params.waId,
    });
  }

  const runtimeState = await params.prisma.conversationRuntimeState.findFirst({
    where: {
      clientId: params.clientId,
      waId: params.waId,
      channel: "webchat",
      ...(params.source?.channelAccountId ? { channelAccountId: params.source.channelAccountId } : {}),
    },
    select: {
      id: true,
      waId: true,
      waIdCanonical: true,
      channelAccountId: true,
      externalUserHash: true,
      assignedAt: true,
      assignedUserId: true,
      departmentId: true,
    },
  });
  if (!runtimeState?.channelAccountId || !runtimeState.externalUserHash) {
    return blockOutbound({
      prisma: params.prisma,
      clientId: params.clientId,
      clientKey: params.clientKey,
      requestId: params.requestId,
      reason: "webchat_session_unavailable",
      message: "Nao ha sessao Webchat valida para envio.",
      channelAccountId: params.source?.channelAccountId ?? null,
      waId: params.waId,
      waIdCanonical: runtimeState?.waIdCanonical ?? null,
    });
  }

  const session = await params.prisma.webchatSession.findFirst({
    where: {
      clientId: params.clientId,
      siteId: runtimeState.channelAccountId,
      status: "active",
      visitor: { is: { visitorIdHash: runtimeState.externalUserHash } },
    },
    include: {
      site: {
        include: {
          allowedDomains: { where: { active: true }, select: { domain: true } },
        },
      },
    },
  });
  if (!session) {
    return blockOutbound({
      prisma: params.prisma,
      clientId: params.clientId,
      clientKey: params.clientKey,
      requestId: params.requestId,
      reason: "webchat_session_unavailable",
      message: "Nao ha sessao Webchat valida para envio.",
      channelAccountId: runtimeState.channelAccountId,
      externalUserHash: runtimeState.externalUserHash,
      waId: params.waId,
      waIdCanonical: runtimeState.waIdCanonical,
    });
  }
  if (session.expiresAt.getTime() <= Date.now()) {
    return blockOutbound({
      prisma: params.prisma,
      clientId: params.clientId,
      clientKey: params.clientKey,
      requestId: params.requestId,
      reason: "webchat_session_expired",
      message: "A sessao Webchat expirou. Aguarde nova mensagem do visitante.",
      channelAccountId: runtimeState.channelAccountId,
      externalUserHash: runtimeState.externalUserHash,
      waId: params.waId,
      waIdCanonical: runtimeState.waIdCanonical,
    });
  }
  if (session.site.status !== "active") {
    return blockOutbound({
      prisma: params.prisma,
      clientId: params.clientId,
      clientKey: params.clientKey,
      requestId: params.requestId,
      reason: "webchat_site_inactive",
      message: "O site Webchat esta inativo.",
      channelAccountId: runtimeState.channelAccountId,
      externalUserHash: runtimeState.externalUserHash,
      waId: params.waId,
      waIdCanonical: runtimeState.waIdCanonical,
    });
  }
  const originDomain = normalizeWebchatDomain(session.originDomain);
  const allowed = session.site.allowedDomains.some((item) => normalizeWebchatDomain(item.domain) === originDomain);
  if (!originDomain || !allowed) {
    return blockOutbound({
      prisma: params.prisma,
      clientId: params.clientId,
      clientKey: params.clientKey,
      requestId: params.requestId,
      reason: "webchat_origin_not_allowed",
      message: "O dominio da sessao Webchat nao esta permitido.",
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
  if (!usageGate.allowed) {
    return { ok: false, statusCode: 429, error: "usage_limit_reached" };
  }

  const createdAt = new Date();
  const messageId = `admin.webchat.send.${params.requestId || shortHash(`${params.waId}:${createdAt.toISOString()}`)}`;
  const conversation = await params.prisma.conversation.findFirst({
    where: {
      clientId: params.clientId,
      waId: params.waId,
      channel: "webchat",
      channelAccountId: runtimeState.channelAccountId,
    },
    select: { id: true },
  });

  await params.prisma.outboundMessage.upsert({
    where: {
      clientId_messageId: {
        clientId: params.clientId,
        messageId,
      },
    },
    create: {
      clientId: params.clientId,
      phoneNumberId: null,
      waId: params.waId,
      waIdCanonical: runtimeState.waIdCanonical ?? params.waId,
      messageId,
      channel: "webchat",
      provider: "converta",
      channelAccountId: runtimeState.channelAccountId,
      externalUserHash: runtimeState.externalUserHash,
      externalUserRef: null,
      externalMessageId: messageId,
      legacyWaId: null,
      type: MessageType.TEXT,
      status: MessageStatus.SENT,
      bodyText: text,
      requestId: params.requestId,
      metaMessageId: null,
      errorBody: null,
      rawPayload: {
        source: "app_inbox_webchat",
        status: MessageStatus.SENT,
        siteId: runtimeState.channelAccountId,
        sessionId: session.id,
        originDomain,
        delivery: "pending_public_polling",
        messageLength: text.length,
      } satisfies Prisma.InputJsonValue,
    },
    update: {
      status: MessageStatus.SENT,
      bodyText: text,
      externalMessageId: messageId,
      metaMessageId: null,
      errorBody: null,
      rawPayload: {
        source: "app_inbox_webchat",
        status: MessageStatus.SENT,
        siteId: runtimeState.channelAccountId,
        sessionId: session.id,
        originDomain,
        delivery: "pending_public_polling",
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
        channel: "webchat",
        channelAccountId: runtimeState.channelAccountId,
      },
      data: { lastOutboundAt: createdAt },
    }),
    params.prisma.conversationRuntimeState.updateMany({
      where: {
        clientId: params.clientId,
        waId: params.waId,
        channel: "webchat",
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
    wasInserted: true,
    assignedAt: runtimeState.assignedAt?.toISOString() ?? null,
    assignedUserId: runtimeState.assignedUserId ?? null,
    requestId: params.requestId,
  });

  await persistWebchatEvent({
    prisma: params.prisma,
    clientId: params.clientId,
    conversationId: conversation?.id ?? null,
    waId: params.waId,
    waIdCanonical: runtimeState.waIdCanonical ?? params.waId,
    messageId,
    requestId: params.requestId,
    eventName: "webchat.message.outbound_created",
    payloadJson: {
      siteId: runtimeState.channelAccountId,
      sessionId: session.id,
      originDomain,
      delivery: "pending_public_polling",
      messageLength: text.length,
    } satisfies Prisma.InputJsonValue,
  });

  logWebchatOutbound({
    event: "webchat.message.outbound_created",
    tenantKey: params.clientKey,
    channelAccountId: runtimeState.channelAccountId,
    externalUserHash: runtimeState.externalUserHash,
    requestId: params.requestId,
  });

  return {
    ok: true,
    status: "SENT",
    messageId,
    metaMessageId: null,
    createdAt: createdAt.toISOString(),
  };
}
