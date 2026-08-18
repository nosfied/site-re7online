import { MessageStatus, MessageType, type PrismaClient } from "@prisma/client";
import type { ServiceCycleSnapshot } from "../conversation/serviceCycle.js";
import { applyAgentSignature } from "../inbox/agentSignature.js";
import { persistEvent, persistOutboundMessage } from "../db/persist.js";
import { getFeatures } from "../features/clientFeatures.js";
import { logger } from "../logger/logger.js";
import { transcodeAudioToOggOpus } from "../media/audioTranscode.js";
import {
  detectWebSessionMediaKind,
  storeWebSessionMediaFile,
  validateWebSessionMedia,
  type WebSessionMediaKind,
} from "../media/webSessionMedia.js";
import { recordConversationAgentOutboundMetrics } from "../metrics/conversationMetrics.js";
import {
  isWhatsappMediaAllowed,
  resolveAgentSignatureSettings,
  resolveWhatsappMediaPolicy,
} from "../config/tenantOperationalConfig.js";
import { readWebSessionLifecycle } from "./webSessionLifecycle.js";

type WebSessionOutboundConversationState = {
  assignedAt?: Date | string | null;
  assignedUserId?: string | null;
};

type WorkerSendTextResult =
  | { ok: true; externalMessageId: string | null }
  | { ok: false; statusCode?: number; error?: string; message?: string };

type WorkerSendMediaResult =
  | { ok: true; externalMessageId: string | null }
  | { ok: false; statusCode?: number; error?: string; message?: string };

export type WebSessionReplyReference = {
  externalMessageId: string;
  remoteJid: string;
  fromMe: boolean;
  messageType: "TEXT" | "IMAGE" | "AUDIO" | "DOCUMENT" | "VIDEO";
  bodyText?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
};

type WebSessionChannelAccount = {
  id: string;
  clientId: string;
  channel: string;
  provider: string;
  channelAccountId: string;
  enabled: boolean;
  runtimeEnabled: boolean;
  status: string;
  metadata: unknown;
  client: {
    id: string;
    clientKey: string;
    status: string;
    features: unknown;
  };
};

function maskWaId(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? `****${digits.slice(-4)}` : "unknown";
}

function normalizeRecipientWaId(value: string) {
  const digits = value.replace(/\D/g, "");
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

function resolveWebSessionTransportRecipientWaId(params: { waId: string; waIdCanonical?: string | null }) {
  // Web Session must send to the provider-observed identity. The canonical field
  // is useful for grouping/search, but may contain legacy BR normalization variants.
  return normalizeRecipientWaId(params.waId) ?? normalizeRecipientWaId(params.waIdCanonical ?? "");
}

export function normalizeBotMenuOptionMarkdown(text: string) {
  if (!/(Digite o n[uú]mero|Digite, atentamente, apenas a numera[cç][aã]o)/i.test(text)) return text;
  return text
    .split("\n")
    .map((line) => {
      if (/^\*\d+\*\s+-\s+/.test(line)) return line;
      const match = line.match(/^(\d+)\s*[.)-]\s+(.+)$/);
      if (!match) return line;
      const number = Number.parseInt(match[1] ?? "", 10);
      const label = (match[2] ?? "").trim();
      if (!Number.isFinite(number) || !label) return line;
      return `*${number}* - ${label}`;
    })
    .join("\n");
}

function isWebSessionAccountConnected(account: WebSessionChannelAccount) {
  if (account.client.status !== "ACTIVE") return false;
  if (getFeatures(account.client).whatsappWebSession !== true) return false;
  if (account.channel !== "whatsapp" || account.provider !== "web_session") return false;
  if (!account.enabled || !account.runtimeEnabled) return false;
  if (account.status !== "connected") return false;
  return readWebSessionLifecycle(account.metadata).observedState === "CONNECTED";
}

async function markWebSessionOutboundActivity(params: {
  prisma: PrismaClient;
  clientId: string;
  waId: string;
  waIdCanonical?: string | null;
  channelAccountId: string;
  sentAt: Date;
  messageId: string;
}) {
  const waIdCanonical = params.waIdCanonical ?? params.waId;
  const identityWhere = {
    clientId: params.clientId,
    channel: "whatsapp",
    OR: [{ waId: params.waId }, { waIdCanonical }],
  };
  await Promise.all([
    params.prisma.conversation.updateMany({
      where: identityWhere,
      data: {
        provider: "web_session",
        channelAccountId: params.channelAccountId,
        lastOutboundAt: params.sentAt,
      },
    }),
    params.prisma.conversationRuntimeState.updateMany({
      where: identityWhere,
      data: {
        provider: "web_session",
        channelAccountId: params.channelAccountId,
        lastOutboundAt: params.sentAt,
        lastOutboundMessageId: params.messageId,
      },
    }),
  ]);
}

async function findWebSessionAccount(params: {
  prisma: PrismaClient;
  clientId: string;
  clientKey: string;
  channelAccountId?: string | null;
}) {
  const account = await params.prisma.channelAccount.findFirst({
    where: {
      clientId: params.clientId,
      channel: "whatsapp",
      provider: "web_session",
      ...(params.channelAccountId ? { channelAccountId: params.channelAccountId } : {}),
    },
    include: {
      client: {
        select: {
          id: true,
          clientKey: true,
          status: true,
          features: true,
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }],
  }) as WebSessionChannelAccount | null;
  if (!account || account.client.clientKey !== params.clientKey) return null;
  return account;
}

async function callWorkerSendText(params: {
  account: WebSessionChannelAccount;
  tenantKey: string;
  recipientWaId: string;
  text: string;
  replyTo?: WebSessionReplyReference | null;
  requestId: string;
}) {
  const baseUrl = process.env.WHATSAPP_WEB_WORKER_CONTROL_URL?.trim();
  if (!baseUrl) {
    return { ok: false as const, statusCode: 503, error: "web_session_worker_unavailable" };
  }
  const token = process.env.WHATSAPP_WEB_WORKER_CONTROL_TOKEN?.trim();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 16_000);
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/web-session/send-text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        clientId: params.account.clientId,
        tenantKey: params.tenantKey,
        accountId: params.account.id,
        channelAccountId: params.account.channelAccountId,
        recipientWaId: params.recipientWaId,
        text: params.text,
        replyTo: params.replyTo ?? null,
        requestId: params.requestId,
      }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({})) as WorkerSendTextResult;
    if (!response.ok || !body.ok) {
      const workerStatusCode = !body.ok && typeof body.statusCode === "number" ? body.statusCode : null;
      return {
        ok: false as const,
        statusCode: response.status || workerStatusCode || 502,
        error: body.ok ? "web_session_send_failed" : body.error ?? "web_session_send_failed",
        message: body.ok ? undefined : body.message,
      };
    }
    return { ok: true as const, externalMessageId: body.externalMessageId ?? null };
  } catch (error) {
    return {
      ok: false as const,
      statusCode: error instanceof Error && error.name === "AbortError" ? 504 : 502,
      error: error instanceof Error && error.name === "AbortError"
        ? "web_session_send_timeout"
        : "web_session_worker_unavailable",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function callWorkerSendMedia(params: {
  account: WebSessionChannelAccount;
  tenantKey: string;
  recipientWaId: string;
  mediaPath: string;
  mediaKind: WebSessionMediaKind;
  mimeType: string;
  fileName: string | null;
  caption: string | null;
  replyTo?: WebSessionReplyReference | null;
  requestId: string;
}) {
  const baseUrl = process.env.WHATSAPP_WEB_WORKER_CONTROL_URL?.trim();
  if (!baseUrl) {
    return { ok: false as const, statusCode: 503, error: "web_session_worker_unavailable" };
  }
  const token = process.env.WHATSAPP_WEB_WORKER_CONTROL_TOKEN?.trim();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/web-session/send-media`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        clientId: params.account.clientId,
        tenantKey: params.tenantKey,
        accountId: params.account.id,
        channelAccountId: params.account.channelAccountId,
        recipientWaId: params.recipientWaId,
        mediaPath: params.mediaPath,
        mediaKind: params.mediaKind,
        mimeType: params.mimeType,
        fileName: params.fileName,
        caption: params.caption,
        replyTo: params.replyTo ?? null,
        requestId: params.requestId,
      }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({})) as WorkerSendMediaResult;
    if (!response.ok || !body.ok) {
      const workerStatusCode = !body.ok && typeof body.statusCode === "number" ? body.statusCode : null;
      return {
        ok: false as const,
        statusCode: response.status || workerStatusCode || 502,
        error: body.ok ? "web_session_media_send_failed" : body.error ?? "web_session_media_send_failed",
        message: body.ok ? undefined : body.message,
      };
    }
    return { ok: true as const, externalMessageId: body.externalMessageId ?? null };
  } catch (error) {
    return {
      ok: false as const,
      statusCode: error instanceof Error && error.name === "AbortError" ? 504 : 502,
      error: error instanceof Error && error.name === "AbortError"
        ? "web_session_send_timeout"
        : "web_session_worker_unavailable",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function isWebSessionTextOutboundReady(params: {
  prisma: PrismaClient;
  clientId: string;
  clientKey: string;
  channelAccountId?: string | null;
}) {
  const account = await findWebSessionAccount(params);
  return Boolean(account && isWebSessionAccountConnected(account));
}

export async function createWebSessionTextOutboundMessage(params: {
  prisma: PrismaClient;
  waId: string;
  waIdCanonical?: string | null;
  text: string;
  clientKey: string;
  clientId: string;
  requestId: string;
  actorUserId?: string | null;
  outboundSource?: "inbox_text" | "canned_reply" | "protocol_notice" | "bot";
  cannedReplyId?: string | null;
  skipAgentSignature?: boolean;
  serviceCycle?: ServiceCycleSnapshot | null;
  source?: {
    channel?: string | null;
    provider?: string | null;
    channelAccountId?: string | null;
  };
  conversation?: WebSessionOutboundConversationState | null;
  reply?: {
    replyToKind: "inbound" | "outbound";
    replyToInternalMessageId: string;
    replyToProvider: "web_session";
    replyToProviderMessageId: string;
    previewType: MessageType;
    mode: "reply" | "rectify";
    transportReference: WebSessionReplyReference;
  } | null;
}): Promise<
  | {
      ok: true;
      status: "SENT" | "FAILED";
      messageId: string;
      internalMessageId: string | null;
      metaMessageId: null;
      createdAt: string;
      bodyText: string;
      agentSignatureApplied: boolean;
      agentSignatureFormat: "bold_line" | null;
    }
  | {
      ok: false;
      statusCode: number;
      error: string;
      message?: string;
      errorPayload?: { code: string; message: string; details: string };
      errorDetails?: string | null;
    }
> {
  const recipientWaId = resolveWebSessionTransportRecipientWaId(params);
  if (!recipientWaId) return { ok: false, statusCode: 400, error: "bad_request" };
  const account = await findWebSessionAccount({
    prisma: params.prisma,
    clientId: params.clientId,
    clientKey: params.clientKey,
    channelAccountId: params.source?.channelAccountId ?? null,
  });
  if (!account) return { ok: false, statusCode: 409, error: "web_session_account_not_found" };
  if (!isWebSessionAccountConnected(account)) {
    return {
      ok: false,
      statusCode: 409,
      error: "web_session_disconnected",
      message: "Este canal esta temporariamente desconectado.",
    };
  }

  const [actorUser, agentSignatureSettings] = await Promise.all([
    params.actorUserId
      ? params.prisma.user.findFirst({
          where: { id: params.actorUserId, clientId: params.clientId, isActive: true },
          select: { name: true },
        })
      : Promise.resolve(null),
    resolveAgentSignatureSettings({
      prisma: params.prisma,
      clientId: params.clientId,
    }),
  ]);
  const outboundText = normalizeBotMenuOptionMarkdown(params.text);
  const signedBody = params.skipAgentSignature
    ? {
        ok: true as const,
        bodyText: outboundText,
        signatureApplied: false,
        signatureFormat: null,
      }
    : applyAgentSignature({
        bodyText: outboundText,
        actorDisplayName: actorUser?.name ?? null,
        settings: agentSignatureSettings?.settings ?? null,
      });
  if (!signedBody.ok) {
    return { ok: false, statusCode: 400, error: "message_too_long" };
  }

  const sendResult = await callWorkerSendText({
    account,
    tenantKey: params.clientKey,
    recipientWaId,
    text: signedBody.bodyText,
    replyTo: params.reply?.transportReference ?? null,
    requestId: params.requestId,
  });
  const status = sendResult.ok ? MessageStatus.SENT : MessageStatus.FAILED;
  const messageId = `web.session.send.${params.requestId}`;
  const createdAt = new Date();
  const outboundSource = params.outboundSource ?? "inbox_text";
  const rawPayload = {
    source: outboundSource,
    cannedReplyId: params.cannedReplyId ?? null,
    provider: "web_session",
    channelAccountId: account.channelAccountId,
    externalMessageId: sendResult.ok ? sendResult.externalMessageId : null,
    actor: {
      source: outboundSource === "bot" ? "bot" : "human_inbox",
      userId: outboundSource === "bot" ? null : params.actorUserId ?? null,
    },
    agentSignatureApplied: signedBody.signatureApplied,
    agentSignatureFormat: signedBody.signatureFormat,
    ...(params.serviceCycle
      ? {
          serviceCycle: {
            protocol: params.serviceCycle.protocol,
            cycleId: params.serviceCycle.cycleId,
            issuedAt: params.serviceCycle.issuedAt,
          },
        }
      : {}),
    ...(params.reply
      ? {
          contextualReply: {
            replyToKind: params.reply.replyToKind,
            replyToInternalMessageId: params.reply.replyToInternalMessageId,
            replyToProvider: "web_session",
            replyToProviderMessagePresent: true,
            replyToMetaMessagePresent: false,
            previewType: params.reply.previewType,
            replyToType: params.reply.previewType,
            originalType: params.reply.previewType,
            contextRequested: true,
            contextResolved: true,
            contextAttached: sendResult.ok,
            mode: params.reply.mode,
          },
        }
      : {}),
    status: sendResult.ok ? "sent" : "failed",
    error: sendResult.ok ? null : sendResult.error,
  };
  const outboundInserted = await persistOutboundMessage({
    clientId: params.clientId,
    channel: "whatsapp",
    provider: "web_session",
    channelAccountId: account.channelAccountId,
    externalMessageId: sendResult.ok ? sendResult.externalMessageId : null,
    waId: params.waId,
    waIdCanonical: params.waIdCanonical ?? recipientWaId,
    messageId,
    type: MessageType.TEXT,
    status,
    bodyText: signedBody.bodyText,
    requestId: params.requestId,
    metaMessageId: null,
    errorBody: sendResult.ok ? null : sendResult.error,
    rawPayload,
  });
  await persistEvent({
    clientId: params.clientId,
    waId: params.waId,
    waIdCanonical: params.waIdCanonical ?? recipientWaId,
    messageId,
    requestId: `web-session-outbound:${messageId}`,
    eventName: sendResult.ok ? "inbox.web_session.text.sent" : "inbox.web_session.text.failed",
    payloadJson: {
      source: outboundSource,
      cannedReplyId: params.cannedReplyId ?? null,
      provider: "web_session",
      channelAccountId: account.channelAccountId,
      outboundMessageId: messageId,
      externalMessageIdPresent: sendResult.ok ? Boolean(sendResult.externalMessageId) : false,
      contextualReply: params.reply
        ? {
            replyToKind: params.reply.replyToKind,
            replyToInternalMessageId: params.reply.replyToInternalMessageId,
            replyToType: params.reply.previewType,
            replyToProvider: "web_session",
            replyToProviderMessagePresent: true,
            mode: params.reply.mode,
          }
        : null,
      waIdLast4: recipientWaId.slice(-4),
      waIdLength: recipientWaId.length,
      error: sendResult.ok ? null : sendResult.error,
      serviceCycle: params.serviceCycle
        ? {
            protocol: params.serviceCycle.protocol,
            cycleId: params.serviceCycle.cycleId,
            issuedAt: params.serviceCycle.issuedAt,
          }
        : null,
    },
  });
  if (sendResult.ok && outboundSource !== "bot" && params.actorUserId) {
    await recordConversationAgentOutboundMetrics({
      prisma: params.prisma,
      clientId: params.clientId,
      waId: params.waId,
      occurredAt: createdAt,
      wasInserted: outboundInserted,
      assignedAt: params.conversation?.assignedAt instanceof Date
        ? params.conversation.assignedAt.toISOString()
        : params.conversation?.assignedAt ?? null,
      assignedUserId: params.conversation?.assignedUserId ?? null,
      requestId: params.requestId,
    });
  }
  if (sendResult.ok) {
    await markWebSessionOutboundActivity({
      prisma: params.prisma,
      clientId: params.clientId,
      waId: params.waId,
      waIdCanonical: params.waIdCanonical ?? recipientWaId,
      channelAccountId: account.channelAccountId,
      sentAt: createdAt,
      messageId,
    });
  }
  logger.info({
    event: sendResult.ok ? "whatsapp.web_session.outbound.persisted" : "whatsapp.web_session.outbound.failed",
    tenantKey: params.clientKey,
    channelAccountId: account.channelAccountId,
    requestId: params.requestId,
    waId: maskWaId(recipientWaId),
    hasExternalMessageId: sendResult.ok ? Boolean(sendResult.externalMessageId) : false,
    error: sendResult.ok ? null : sendResult.error,
  });
  if (!sendResult.ok) {
    return {
      ok: true,
      status: "FAILED",
      messageId,
      internalMessageId: null,
      metaMessageId: null,
      createdAt: createdAt.toISOString(),
      bodyText: signedBody.bodyText,
      agentSignatureApplied: signedBody.signatureApplied,
      agentSignatureFormat: signedBody.signatureFormat,
    };
  }
  const persistedOutbound = await params.prisma.outboundMessage.findUnique({
    where: {
      clientId_messageId: {
        clientId: params.clientId,
        messageId,
      },
    },
    select: { id: true },
  });
  return {
    ok: true,
    status: "SENT",
    messageId,
    internalMessageId: persistedOutbound?.id ?? null,
    metaMessageId: null,
    createdAt: createdAt.toISOString(),
    bodyText: signedBody.bodyText,
    agentSignatureApplied: signedBody.signatureApplied,
    agentSignatureFormat: signedBody.signatureFormat,
  };
}

export async function createWebSessionMediaOutboundMessage(params: {
  prisma: PrismaClient;
  waId: string;
  waIdCanonical?: string | null;
  clientKey: string;
  clientId: string;
  requestId: string;
  actorUserId: string;
  mimeType: string;
  fileName?: string | null;
  caption?: string | null;
  content: Buffer;
  serviceCycle?: ServiceCycleSnapshot | null;
  source?: {
    channel?: string | null;
    provider?: string | null;
    channelAccountId?: string | null;
  };
  conversation?: WebSessionOutboundConversationState | null;
  reply?: {
    replyToKind: "inbound" | "outbound";
    replyToInternalMessageId: string;
    replyToProvider: "web_session";
    replyToProviderMessageId: string;
    previewType: MessageType;
    mode: "reply" | "rectify";
    transportReference: WebSessionReplyReference;
  } | null;
}): Promise<
  | {
      ok: true;
      status: "SENT" | "FAILED";
      messageId: string;
      internalMessageId: string | null;
      metaMessageId: null;
      createdAt: string;
      mediaType: "IMAGE" | "DOCUMENT" | "AUDIO" | "VIDEO";
      bodyText: string | null;
      media: {
        kind: "image" | "document" | "audio" | "video";
        mimeType: string;
        fileName: string | null;
        caption: string | null;
        hasDownload: boolean;
        downloadUrl: string;
      };
    }
  | {
      ok: false;
      statusCode: number;
      error: string;
      message?: string;
      errorPayload?: { code: string; message: string; details: string };
      errorDetails?: string | null;
    }
> {
  const recipientWaId = resolveWebSessionTransportRecipientWaId(params);
  if (!recipientWaId) return { ok: false, statusCode: 400, error: "bad_request" };
  const mediaKind = detectWebSessionMediaKind(params.mimeType, params.fileName);
  if (!mediaKind) return { ok: false, statusCode: 400, error: "unsupported_media_type" };
  const mediaPolicy = await resolveWhatsappMediaPolicy({
    prisma: params.prisma,
    clientId: params.clientId,
  });
  if (!isWhatsappMediaAllowed(mediaPolicy.policy, "outbound", mediaKind)) {
    await persistEvent({
      clientId: params.clientId,
      waId: params.waId,
      waIdCanonical: params.waIdCanonical ?? recipientWaId,
      requestId: `web-session-outbound-media-policy:${params.requestId}`,
      eventName: "whatsapp.media_policy.blocked",
      payloadJson: {
        direction: "outbound",
        provider: "web_session",
        channel: "whatsapp",
        mediaKind,
        source: "inbox_media",
      },
    });
    return {
      ok: false,
      statusCode: 403,
      error: "media_type_not_allowed",
      message: "Este tipo de midia nao esta habilitado para este atendimento.",
    };
  }
  try {
    validateWebSessionMedia({
      content: params.content,
      mimeType: params.mimeType,
      fileName: params.fileName,
      kind: mediaKind,
    });
  } catch (error) {
    const statusCode = error instanceof Error && "status" in error && typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : 400;
    return { ok: false, statusCode, error: "unsupported_media_type" };
  }

  let uploadContent = params.content;
  let uploadMimeType = params.mimeType;
  let uploadFileName = params.fileName ?? null;

  if (mediaKind === "audio") {
    const transcoded = await transcodeAudioToOggOpus({
      inputBuffer: params.content,
      inputMimeType: params.mimeType,
      fileName: params.fileName,
      requestId: params.requestId,
      clientId: params.clientId,
      clientKey: params.clientKey,
    });
    if (!transcoded.ok) {
      return {
        ok: false,
        statusCode: 502,
        error: "audio_transcode_failed",
        errorDetails: transcoded.details ?? transcoded.error,
      };
    }
    uploadContent = transcoded.buffer;
    uploadMimeType = transcoded.mimeType;
    uploadFileName = transcoded.fileName;
  }

  const account = await findWebSessionAccount({
    prisma: params.prisma,
    clientId: params.clientId,
    clientKey: params.clientKey,
    channelAccountId: params.source?.channelAccountId ?? null,
  });
  if (!account) return { ok: false, statusCode: 409, error: "web_session_account_not_found" };
  if (!isWebSessionAccountConnected(account)) {
    return {
      ok: false,
      statusCode: 409,
      error: "web_session_disconnected",
      message: "Este canal esta temporariamente desconectado.",
    };
  }

  const messageId = `web.session.send_media.${params.requestId}`;
  const createdAt = new Date();
  const stored = await storeWebSessionMediaFile({
    clientId: params.clientId,
    messageId,
    content: uploadContent,
    mimeType: uploadMimeType,
    fileName: uploadFileName,
    caption: params.caption ?? null,
    kind: mediaKind,
  });
  const sendResult = await callWorkerSendMedia({
    account,
    tenantKey: params.clientKey,
    recipientWaId,
    mediaPath: stored.absolutePath,
    mediaKind: stored.kind,
    mimeType: stored.mimeType,
    fileName: stored.fileName,
    caption: stored.caption,
    replyTo: params.reply?.transportReference ?? null,
    requestId: params.requestId,
  });
  const status = sendResult.ok ? MessageStatus.SENT : MessageStatus.FAILED;
  const prismaType =
    stored.kind === "image"
      ? MessageType.IMAGE
      : stored.kind === "audio"
        ? MessageType.AUDIO
        : stored.kind === "video"
          ? MessageType.VIDEO
          : MessageType.DOCUMENT;
  const rawPayload = {
    type: stored.kind,
    media: {
      mediaId: stored.mediaId,
      mediaRef: stored.mediaRef,
      storageRef: stored.storageRef,
      storageProvider: stored.storageProvider,
      mimeType: stored.mimeType,
      fileName: stored.fileName,
      caption: stored.caption,
      sizeBytes: stored.sizeBytes,
    },
    source: "inbox_media",
    provider: "web_session",
    channelAccountId: account.channelAccountId,
    externalMessageId: sendResult.ok ? sendResult.externalMessageId : null,
    actor: {
      source: "human_inbox",
      userId: params.actorUserId,
    },
    ...(params.serviceCycle
      ? {
          serviceCycle: {
            protocol: params.serviceCycle.protocol,
            cycleId: params.serviceCycle.cycleId,
            issuedAt: params.serviceCycle.issuedAt,
          },
        }
      : {}),
    ...(params.reply
      ? {
          contextualReply: {
            replyToKind: params.reply.replyToKind,
            replyToInternalMessageId: params.reply.replyToInternalMessageId,
            replyToProvider: "web_session",
            replyToProviderMessagePresent: true,
            replyToMetaMessagePresent: false,
            previewType: params.reply.previewType,
            replyToType: params.reply.previewType,
            originalType: params.reply.previewType,
            contextRequested: true,
            contextResolved: true,
            contextAttached: sendResult.ok,
            mode: params.reply.mode,
          },
        }
      : {}),
    status: sendResult.ok ? "sent" : "failed",
    error: sendResult.ok ? null : sendResult.error,
  };
  const existingOutbound = await params.prisma.outboundMessage.findUnique({
    where: {
      clientId_messageId: {
        clientId: params.clientId,
        messageId,
      },
    },
    select: { id: true },
  });
  const outboundData = {
    clientId: params.clientId,
    channel: "whatsapp",
    provider: "web_session",
    channelAccountId: account.channelAccountId,
    externalMessageId: sendResult.ok ? sendResult.externalMessageId : null,
    waId: params.waId,
    waIdCanonical: params.waIdCanonical ?? recipientWaId,
    messageId,
    type: prismaType,
    status,
    bodyText: stored.caption,
    requestId: params.requestId,
    metaMessageId: null,
    errorBody: sendResult.ok ? null : sendResult.error,
    rawPayload,
  };
  const persistedOutbound = existingOutbound
    ? await params.prisma.outboundMessage.update({
        where: {
          clientId_messageId: {
            clientId: params.clientId,
            messageId,
          },
        },
        data: outboundData,
        select: { id: true },
      })
    : await params.prisma.outboundMessage.create({
        data: outboundData,
        select: { id: true },
      });
  const outboundInserted = !existingOutbound;
  await persistEvent({
    clientId: params.clientId,
    waId: params.waId,
    waIdCanonical: params.waIdCanonical ?? recipientWaId,
    messageId,
    requestId: `web-session-outbound-media:${messageId}`,
    eventName: sendResult.ok ? "whatsapp.web.outbound.media.sent" : "whatsapp.web.outbound.media.failed",
    payloadJson: {
      source: "inbox_media",
      provider: "web_session",
      channelAccountId: account.channelAccountId,
      outboundMessageId: messageId,
      externalMessageIdPresent: sendResult.ok ? Boolean(sendResult.externalMessageId) : false,
      contextualReply: params.reply
        ? {
            replyToKind: params.reply.replyToKind,
            replyToInternalMessageId: params.reply.replyToInternalMessageId,
            replyToType: params.reply.previewType,
            replyToProvider: "web_session",
            replyToProviderMessagePresent: true,
            mode: params.reply.mode,
          }
        : null,
      mediaKind: stored.kind,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      waIdLast4: recipientWaId.slice(-4),
      waIdLength: recipientWaId.length,
      error: sendResult.ok ? null : sendResult.error,
      serviceCycle: params.serviceCycle
        ? {
            protocol: params.serviceCycle.protocol,
            cycleId: params.serviceCycle.cycleId,
            issuedAt: params.serviceCycle.issuedAt,
          }
        : null,
    },
  });
  if (sendResult.ok) {
    await recordConversationAgentOutboundMetrics({
      prisma: params.prisma,
      clientId: params.clientId,
      waId: params.waId,
      occurredAt: createdAt,
      wasInserted: outboundInserted,
      assignedAt: params.conversation?.assignedAt instanceof Date
        ? params.conversation.assignedAt.toISOString()
        : params.conversation?.assignedAt ?? null,
      assignedUserId: params.conversation?.assignedUserId ?? null,
      requestId: params.requestId,
    });
    await markWebSessionOutboundActivity({
      prisma: params.prisma,
      clientId: params.clientId,
      waId: params.waId,
      waIdCanonical: params.waIdCanonical ?? recipientWaId,
      channelAccountId: account.channelAccountId,
      sentAt: createdAt,
      messageId,
    });
  }
  logger.info({
    event: sendResult.ok ? "whatsapp.web_session.outbound_media.persisted" : "whatsapp.web_session.outbound_media.failed",
    tenantKey: params.clientKey,
    channelAccountId: account.channelAccountId,
    requestId: params.requestId,
    waId: maskWaId(recipientWaId),
    mediaKind: stored.kind,
    hasExternalMessageId: sendResult.ok ? Boolean(sendResult.externalMessageId) : false,
    error: sendResult.ok ? null : sendResult.error,
  });
  return {
    ok: true,
    status,
    messageId,
    internalMessageId: persistedOutbound?.id ?? null,
    metaMessageId: null,
    createdAt: createdAt.toISOString(),
    mediaType: prismaType,
    bodyText: stored.caption,
    media: {
      kind: stored.kind,
      mimeType: stored.mimeType,
      fileName: stored.fileName,
      caption: stored.caption,
      hasDownload: true,
      downloadUrl: `/app/conversation/${encodeURIComponent(params.waId)}/messages/${encodeURIComponent(messageId)}/media`,
    },
  };
}
