import { recordOwnRuntimeOutboundActivity, invalidateRuntimeWriteToken, type RuntimeWriteToken } from "../conversation/runtimeWriteFence.js";
import { MessageStatus, MessageType, type PrismaClient } from "@prisma/client";
import type { ServiceCycleSnapshot } from "../conversation/serviceCycle.js";
import { applyAgentSignature } from "../inbox/agentSignature.js";
import type { InboxMessageVisibility } from "../inbox/messageVisibility.js";
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
import { getBrazilNinthDigitVariant } from "../crm/crmWhatsappIdentity.js";
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

type WorkerResolveRecipientResult =
  | { ok: true; recipientWaId: string; resolvedJid: string | null }
  | { ok: false; statusCode?: number; error?: string; reason?: "not_registered" | "ambiguous" | "worker_unavailable" };

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
  outboundEnabled: boolean;
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

export type WebSessionChannelSwitchWarning = {
  pending: true;
  previousIdentityMasked: string;
  currentIdentityMasked: string;
};

function maskWaId(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? `****${digits.slice(-4)}` : "unknown";
}

function normalizeWebSessionIdentityKey(value?: string | null) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  const digits = normalized.replace(/\D/g, "");
  return digits || normalized.toLowerCase();
}

function maskWebSessionIdentity(value?: string | null) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? `****${digits.slice(-4)}` : "****";
}

function normalizeRecipientWaId(value: string) {
  const digits = value.replace(/\D/g, "");
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

export async function resolveWebSessionTransportRecipientWaId(params: {
  prisma: PrismaClient;
  clientId: string;
  waId: string;
  waIdCanonical?: string | null;
  channelAccountId: string;
}) {
  // Web Session must send to the provider-observed identity. The canonical field
  // is useful for grouping/search, but may contain legacy BR normalization variants.
  const selected = normalizeRecipientWaId(params.waId) ?? normalizeRecipientWaId(params.waIdCanonical ?? "");
  if (!selected) return null;
  const conversation = await params.prisma.conversation.findUnique({
    where: { clientId_waId: { clientId: params.clientId, waId: params.waId } },
    select: { provider: true, channelAccountId: true, legacyWaId: true, deletedAt: true, anonymizedAt: true },
  });
  const observed = normalizeRecipientWaId(conversation?.legacyWaId ?? "");
  return conversation?.provider === "web_session" &&
    conversation.channelAccountId === params.channelAccountId &&
    !conversation.deletedAt && !conversation.anonymizedAt &&
    observed && getBrazilNinthDigitVariant(selected) === observed
      ? observed : selected;
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
  if (!account.enabled || !account.outboundEnabled || !account.runtimeEnabled) return false;
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
  runtimeWriteToken?: RuntimeWriteToken;
}) {
  const waIdCanonical = params.waIdCanonical ?? params.waId;
  const identityWhere = {
    clientId: params.clientId,
    channel: "whatsapp",
    OR: [{ waId: params.waId }, { waIdCanonical }],
  };
  try {
    await Promise.all([
      params.prisma.conversation.updateMany({
        where: { ...identityWhere, AND: [{ OR: [{ lastOutboundAt: null }, { lastOutboundAt: { lte: params.sentAt } }] }] },
        data: {
          ...(params.runtimeWriteToken ? {} : { provider: "web_session", channelAccountId: params.channelAccountId }),
          lastOutboundAt: params.sentAt,
        },
      }),
      (async () => {
        const expected = params.runtimeWriteToken;
        if (expected && await recordOwnRuntimeOutboundActivity({
          prisma: params.prisma, clientId: params.clientId, waId: params.waId, expected,
          sentAt: params.sentAt, messageId: params.messageId, channelAccountId: params.channelAccountId,
        })) return;
        // Accepted outbound survives a conflict, without restoring control or older activity.
        await params.prisma.conversationRuntimeState.updateMany({
          where: { ...identityWhere, AND: [{ OR: [{ lastOutboundAt: null }, { lastOutboundAt: { lte: params.sentAt } }] }] },
          data: { ...(expected ? {} : { provider: "web_session", channelAccountId: params.channelAccountId }),
            lastOutboundAt: params.sentAt, lastOutboundMessageId: params.messageId },
        });
      })(),
    ]);
  } catch (error) {
    if (!params.runtimeWriteToken) throw error;
    invalidateRuntimeWriteToken(params.runtimeWriteToken);
    logger.error({ event: "automation.runtime.activity_write_failed", clientId: params.clientId,
      messageId: params.messageId, error: (error as Error).message });
  }
}

async function findWebSessionAccount(params: {
  prisma: PrismaClient;
  clientId: string;
  clientKey: string;
  channelAccountId?: string | null;
}) {
  const findAccount = async (channelAccountId?: string | null) => (
    await params.prisma.channelAccount.findFirst({
      where: {
        clientId: params.clientId,
        channel: "whatsapp",
        provider: "web_session",
        ...(channelAccountId ? { channelAccountId } : {}),
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
    })
  ) as WebSessionChannelAccount | null;

  const account = await findAccount(params.channelAccountId);
  if (account && account.client.clientKey !== params.clientKey) return null;
  if (params.channelAccountId && (!account || !isWebSessionAccountConnected(account))) {
    const currentAccount = await findAccount(null);
    if (
      currentAccount &&
      currentAccount.client.clientKey === params.clientKey &&
      isWebSessionAccountConnected(currentAccount)
    ) {
      return currentAccount;
    }
  }
  if (!account) return null;
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

async function callWorkerResolveRecipient(params: {
  account: WebSessionChannelAccount;
  tenantKey: string;
  candidates: string[];
  requestId: string;
}) {
  const baseUrl = process.env.WHATSAPP_WEB_WORKER_CONTROL_URL?.trim();
  if (!baseUrl) {
    return { ok: false as const, statusCode: 503, error: "web_session_worker_unavailable", reason: "worker_unavailable" as const };
  }
  const token = process.env.WHATSAPP_WEB_WORKER_CONTROL_TOKEN?.trim();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 16_000);
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/web-session/resolve-recipient`, {
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
        candidates: params.candidates,
        requestId: params.requestId,
      }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({})) as WorkerResolveRecipientResult;
    if (!response.ok || !body.ok) {
      return {
        ok: false as const,
        statusCode: response.status || (!body.ok && body.statusCode) || 502,
        error: body.ok ? "web_session_recipient_resolution_failed" : body.error ?? "web_session_recipient_resolution_failed",
        reason: body.ok ? undefined : body.reason,
      };
    }
    return body;
  } catch (error) {
    return {
      ok: false as const,
      statusCode: error instanceof Error && error.name === "AbortError" ? 504 : 502,
      error: error instanceof Error && error.name === "AbortError"
        ? "web_session_recipient_resolution_timeout"
        : "web_session_worker_unavailable",
      reason: "worker_unavailable" as const,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveWebSessionTextAvailability(params: {
  prisma: PrismaClient;
  clientId: string;
  clientKey: string;
  channelAccountId?: string | null;
  requireExactAccount?: boolean;
}) {
  const account = await findWebSessionAccount(params);
  if (params.requireExactAccount && account?.channelAccountId !== params.channelAccountId) return "unknown" as const;
  if (!account || !account.enabled || !account.outboundEnabled || !account.runtimeEnabled ||
    account.client.status !== "ACTIVE" || !getFeatures(account.client).whatsappWebSession) return "policy_blocked" as const;
  if (isWebSessionAccountConnected(account)) return "ready" as const;
  const metadata = account.metadata as { webSession?: { observedState?: unknown } } | null;
  return account.status === "disconnected" && metadata?.webSession?.observedState === "DISCONNECTED"
    ? "disconnected" as const : "unknown" as const;
}

export async function isWebSessionTextOutboundReady(params: {
  prisma: PrismaClient;
  clientId: string;
  clientKey: string;
  channelAccountId?: string | null;
}) {
  return await resolveWebSessionTextAvailability(params) === "ready";
}

export async function resolveWebSessionChannelSwitchWarning(params: {
  prisma: PrismaClient;
  clientId: string;
  clientKey: string;
  waId?: string | null;
  waIdCanonical?: string | null;
  channelAccountId?: string | null;
}): Promise<WebSessionChannelSwitchWarning | null> {
  const currentAccount = await findWebSessionAccount({
    prisma: params.prisma,
    clientId: params.clientId,
    clientKey: params.clientKey,
    channelAccountId: params.channelAccountId ?? null,
  });
  if (!currentAccount || !isWebSessionAccountConnected(currentAccount)) return null;

  const currentIdentityKey = normalizeWebSessionIdentityKey(currentAccount.channelAccountId);
  if (!currentIdentityKey) return null;
  const identityCandidates = Array.from(
    new Set([params.waId, params.waIdCanonical].map((value) => String(value ?? "").trim()).filter(Boolean))
  );
  if (identityCandidates.length === 0) return null;

  const latestSentOutbound = await params.prisma.outboundMessage.findFirst({
    where: {
      clientId: params.clientId,
      channel: "whatsapp",
      provider: "web_session",
      status: MessageStatus.SENT,
      channelAccountId: { not: null },
      OR: [
        { waId: { in: identityCandidates } },
        { waIdCanonical: { in: identityCandidates } },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: { channelAccountId: true },
  });
  const previousIdentityKey = normalizeWebSessionIdentityKey(latestSentOutbound?.channelAccountId);
  if (!previousIdentityKey || previousIdentityKey === currentIdentityKey) return null;
  return {
    pending: true,
    previousIdentityMasked: maskWebSessionIdentity(latestSentOutbound?.channelAccountId),
    currentIdentityMasked: maskWebSessionIdentity(currentAccount.channelAccountId),
  };
}

export async function resolveWebSessionTextRecipient(params: {
  prisma: PrismaClient;
  clientId: string;
  clientKey: string;
  channelAccountId?: string | null;
  candidates: string[];
  requestId: string;
}) {
  const account = await findWebSessionAccount(params);
  if (!account) return { ok: false as const, reason: "not_registered" as const };
  if (!isWebSessionAccountConnected(account)) {
    return { ok: false as const, reason: "worker_unavailable" as const };
  }
  const candidates = Array.from(
    new Set(params.candidates.map((candidate) => normalizeRecipientWaId(candidate)).filter(Boolean))
  ) as string[];
  if (candidates.length === 0) return { ok: false as const, reason: "not_registered" as const };
  const result = await callWorkerResolveRecipient({
    account,
    tenantKey: params.clientKey,
    candidates,
    requestId: params.requestId,
  });
  if (!result.ok) {
    return {
      ok: false as const,
      reason: result.reason === "ambiguous" ? "ambiguous" as const : "not_registered" as const,
    };
  }
  return { ok: true as const, recipientWaId: result.recipientWaId, resolvedJid: result.resolvedJid };
}

export async function createWebSessionTextOutboundMessage(params: {
  beforeSubmit?: (prepared: { channelAccountId: string }) => Promise<string | null>;
  prisma: PrismaClient;
  waId: string;
  waIdCanonical?: string | null;
  text: string;
  clientKey: string;
  clientId: string;
  requestId: string;
  runtimeWriteToken?: RuntimeWriteToken;
  actorUserId?: string | null;
  outboundSource?: "inbox_text" | "canned_reply" | "protocol_notice" | "bot";
  cannedReplyId?: string | null;
  skipAgentSignature?: boolean;
  serviceCycle?: ServiceCycleSnapshot | null;
  inboxVisibility?: InboxMessageVisibility;
  inboxInteractionKind?: string | null;
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
  const account = await findWebSessionAccount({
    prisma: params.prisma,
    clientId: params.clientId,
    clientKey: params.clientKey,
    channelAccountId: params.source?.channelAccountId ?? null,
  });
  if (!account) return { ok: false, statusCode: 409, error: "web_session_account_not_found" };
  const recipientWaId = await resolveWebSessionTransportRecipientWaId({ ...params, channelAccountId: account.channelAccountId });
  if (!recipientWaId) return { ok: false, statusCode: 400, error: "bad_request" };
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

  const blocked = await params.beforeSubmit?.({ channelAccountId: account.channelAccountId });
  if (blocked) return { ok: false, statusCode: 409, error: blocked };
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
    ...(params.inboxVisibility
      ? {
          inboxVisibility: params.inboxVisibility,
          inboxInteractionKind: params.inboxInteractionKind ?? outboundSource,
        }
      : {}),
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
    bodyText: outboundText,
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
      runtimeWriteToken: outboundSource === "bot" ? params.runtimeWriteToken : undefined,
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
      bodyText: outboundText,
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
    bodyText: outboundText,
    agentSignatureApplied: signedBody.signatureApplied,
    agentSignatureFormat: signedBody.signatureFormat,
  };
}

export async function createWebSessionMediaOutboundMessage(params: {
  beforeSubmit?: (prepared: { channelAccountId: string }) => Promise<string | null>;
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
  let recipientWaId = normalizeRecipientWaId(params.waId) ?? normalizeRecipientWaId(params.waIdCanonical ?? "");
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
  const resolvedRecipientWaId = await resolveWebSessionTransportRecipientWaId({ ...params, channelAccountId: account.channelAccountId });
  if (!resolvedRecipientWaId) return { ok: false, statusCode: 400, error: "bad_request" };
  recipientWaId = resolvedRecipientWaId;
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
  const blocked = await params.beforeSubmit?.({ channelAccountId: account.channelAccountId });
  if (blocked) return { ok: false, statusCode: 409, error: blocked };
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
