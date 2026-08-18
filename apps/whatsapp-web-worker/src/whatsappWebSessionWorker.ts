import fs from "node:fs/promises";
import crypto from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { getPrisma } from "../../whatsapp-agent/src/db.js";
import { getFeatures } from "../../whatsapp-agent/src/features/clientFeatures.js";
import { logger } from "../../whatsapp-agent/src/logger/logger.js";
import {
  detectWebSessionMediaKind,
  storeWebSessionMediaFile,
  validateWebSessionMedia,
  type WebSessionMediaKind,
} from "../../whatsapp-agent/src/media/webSessionMedia.js";
import {
  calculateWebSessionReconnectBackoff,
  classifyWebSessionDisconnect,
  extractWebSessionDisconnectInfo,
  isWebSessionConnectRequested,
  readWebSessionLifecycle,
} from "../../whatsapp-agent/src/web-session/webSessionLifecycle.js";
import {
  extractWebSessionObservedIdentity,
  reconcileWebSessionObservedIdentity,
} from "../../whatsapp-agent/src/web-session/webSessionIdentity.js";
import { createDurableStagedWebSessionAuthStore } from "../../whatsapp-agent/src/web-session/webSessionAuthStore.js";
import {
  clearWebSessionQrForRuntime,
  markWebSessionRuntimeState,
  setWebSessionQrForRuntime,
} from "../../whatsapp-agent/src/web-session/webSessionConnectionRuntime.js";
import {
  ingestBaileysWebSessionMessage,
  type BaileysInboundMessageLike,
} from "../../whatsapp-agent/src/web-session/webSessionInbound.js";
import type { InboxRealtimeEvent } from "../../whatsapp-agent/src/realtime/events.js";
import {
  normalizeBaileysReceiptStatus,
  recordWebSessionOutboundReceipt,
  type WebSessionDeliveryStatus,
} from "../../whatsapp-agent/src/web-session/webSessionReceipts.js";
import { createBaileysAuthState } from "./web-session/baileysAuthState.js";
import {
  closeBaileysSocket,
  createBaileysSocket,
  type BaileysMessageReceiptUpdateEvent,
  type BaileysSocketLike,
  type BaileysMessagesUpdateEvent,
  type BaileysMessagesUpsertEvent,
} from "./web-session/baileysSocketFactory.js";
import type { WebSessionControlReplyReference } from "./webSessionControlServer.js";
import {
  acquireDedicatedPgAdvisoryLock,
  withDedicatedPgAdvisoryLock,
} from "./web-session/dedicatedPgAdvisoryLock.js";

export type EligibleWebSessionAccount = {
  id: string;
  clientId: string;
  tenantKey: string;
  channelAccountId: string;
  metadata: unknown;
  lifecycle: ReturnType<typeof readWebSessionLifecycle>;
};

type ChannelAccountRecord = {
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
    profile: unknown;
  };
};

type ActiveConnection = {
  tenantKey: string;
  channelAccountId: string;
  startedAtMs: number;
  socket?: BaileysSocketLike;
  close?: () => void;
  release: () => Promise<void>;
};

type WorkerPrismaClient = ReturnType<typeof getPrisma>;
type BaileysAuthKeysLike = {
  get?: (type: string, ids: string[]) => Promise<Record<string, unknown>>;
};

const activeConnections = new Map<string, ActiveConnection>();
const DEFAULT_CONNECTION_OPEN_TIMEOUT_MS = 30_000;
const STALE_ACTIVE_CONNECTING_TIMEOUT_MS = 45_000;
const DEFAULT_SEND_TEXT_TIMEOUT_MS = 15_000;
const DEFAULT_SEND_MEDIA_TIMEOUT_MS = 30_000;
const DEFAULT_AGENT_REALTIME_TIMEOUT_MS = 2_000;

function sanitizeWebSessionAccountRef(params: {
  tenantKey: string;
  channelAccountId: string;
}) {
  const hash = crypto
    .createHash("sha256")
    .update(`${params.tenantKey}:${params.channelAccountId}`)
    .digest("hex")
    .slice(0, 12);
  const digits = params.channelAccountId.replace(/\D/g, "");
  return {
    tenantKey: params.tenantKey,
    channelAccountRef: hash,
    channelAccountIdLast4: digits.length >= 4 ? digits.slice(-4) : null,
  };
}

function webSessionLogAccount(account: Pick<EligibleWebSessionAccount, "tenantKey" | "channelAccountId">) {
  return sanitizeWebSessionAccountRef(account);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readExpectedWebSessionIdentity(metadata: unknown) {
  const webSession = asRecord(asRecord(metadata).webSession);
  const snapshot = asRecord(webSession.authorizationSnapshot);
  return typeof snapshot.authorizedNumberCanonical === "string"
    ? snapshot.authorizedNumberCanonical
    : null;
}

export function setActiveWebSessionConnectionForTesting(accountId: string, active: ActiveConnection | null) {
  if (!active) {
    activeConnections.delete(accountId);
    return;
  }
  activeConnections.set(accountId, active);
}

export function connectionOpenTimeoutRuntimeState() {
  return {
    observedState: "RECONNECTING" as const,
    status: "pending" as const,
    errorCode: "connection_open_timeout",
  };
}

export function nextWebSessionReconnectCount(currentCount: unknown) {
  return Math.max(0, Number.isFinite(Number(currentCount)) ? Math.floor(Number(currentCount)) : 0) + 1;
}

export function resolveWebSessionDisconnectRuntimeState(params: {
  classification: ReturnType<typeof classifyWebSessionDisconnect>;
  stillRequested: boolean;
  reconnectCount: number;
}) {
  if (!params.stillRequested) {
    return {
      observedState: "DISCONNECTED" as const,
      status: "disconnected" as const,
      errorCode: params.classification,
      reconnectCount: params.reconnectCount,
      eventName: "whatsapp.web_session.disconnected" as const,
      eventReason: params.classification,
    };
  }
  if (params.classification === "qr_required") {
    return {
      observedState: "QR_REQUIRED" as const,
      status: "disconnected" as const,
      errorCode: params.classification,
      reconnectCount: params.reconnectCount,
      eventName: "whatsapp.web_session.disconnected" as const,
      eventReason: params.classification,
    };
  }
  return {
    observedState: "RECONNECTING" as const,
    status: "pending" as const,
    errorCode: params.classification,
    reconnectCount: nextWebSessionReconnectCount(params.reconnectCount),
    eventName: "whatsapp.web_session.reconnecting" as const,
    eventReason: params.classification === "terminal_manual" ? "internal_socket_closed" : params.classification,
  };
}

function eventRequestId(account: EligibleWebSessionAccount, eventName: string) {
  return `web-session-worker:${account.id}:${eventName}:${Date.now()}`;
}

function getAgentInternalBaseUrl() {
  const configured = process.env.WHATSAPP_AGENT_INTERNAL_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const port = process.env.WHATSAPP_AGENT_INTERNAL_PORT?.trim() || "3001";
  return `http://127.0.0.1:${port}`;
}

function toRealtimeReceiptStatus(status: WebSessionDeliveryStatus) {
  if (status === "sent") return "SENT" as const;
  if (status === "delivered") return "DELIVERED" as const;
  if (status === "read") return "READ" as const;
  return "FAILED" as const;
}

export function buildWebSessionReceiptRealtimePayload(params: {
  clientId: string;
  messageId: string | null;
  externalMessageId: string | null;
  waId: string | null;
  waIdCanonical: string | null;
  status: WebSessionDeliveryStatus;
  updatedAt: string;
}) {
  return {
    clientId: params.clientId,
    messageId: params.messageId,
    externalMessageId: params.externalMessageId,
    waId: params.waId,
    waIdCanonical: params.waIdCanonical,
    status: toRealtimeReceiptStatus(params.status),
    updatedAt: params.updatedAt,
  };
}

async function notifyAgentWebSessionReceiptRealtime(params: {
  account: EligibleWebSessionAccount;
  payload: ReturnType<typeof buildWebSessionReceiptRealtimePayload>;
}) {
  const token = process.env.WHATSAPP_WEB_WORKER_CONTROL_TOKEN?.trim();
  if (!token || !params.payload.messageId) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_AGENT_REALTIME_TIMEOUT_MS);
  try {
    const response = await fetch(`${getAgentInternalBaseUrl()}/internal/web-session/receipt-realtime`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(params.payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      logger.warn({
        event: "whatsapp.web.receipt.realtime_notify_failed",
        ...webSessionLogAccount(params.account),
        status: params.payload.status,
        reason: `http_${response.status}`,
      });
    }
  } catch (error) {
    logger.warn({
      event: "whatsapp.web.receipt.realtime_notify_failed",
      ...webSessionLogAccount(params.account),
      status: params.payload.status,
      reason: error instanceof Error ? error.name : "unknown_error",
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function buildWebSessionHandoffRealtimePayload(
  event: Extract<InboxRealtimeEvent, { type: "conversation.handoff.updated" }>
) {
  return {
    clientId: event.clientId,
    waId: event.waId,
    waIdCanonical: event.waIdCanonical ?? null,
    mode: "HUMAN" as const,
    handoffStatus: event.handoffStatus,
    assignedUserId: event.assignedUserId ?? null,
    departmentId: event.departmentId ?? null,
    updatedAt: event.updatedAt,
    notificationMessage: event.notificationMessage
      ? {
          messageId: event.notificationMessage.messageId,
          type: event.notificationMessage.type,
          bodyText: event.notificationMessage.bodyText,
          createdAt: event.notificationMessage.createdAt,
        }
      : null,
  };
}

async function notifyAgentWebSessionHandoffRealtime(params: {
  account: EligibleWebSessionAccount;
  event: Extract<InboxRealtimeEvent, { type: "conversation.handoff.updated" }>;
}) {
  const token = process.env.WHATSAPP_WEB_WORKER_CONTROL_TOKEN?.trim();
  if (!token) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_AGENT_REALTIME_TIMEOUT_MS);
  try {
    const response = await fetch(`${getAgentInternalBaseUrl()}/internal/web-session/handoff-realtime`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(buildWebSessionHandoffRealtimePayload(params.event)),
      signal: controller.signal,
    });
    if (!response.ok) {
      logger.warn({
        event: "whatsapp.web.handoff.realtime_notify_failed",
        ...webSessionLogAccount(params.account),
        handoffStatus: params.event.handoffStatus,
        reason: `http_${response.status}`,
      });
    }
  } catch (error) {
    logger.warn({
      event: "whatsapp.web.handoff.realtime_notify_failed",
      ...webSessionLogAccount(params.account),
      handoffStatus: params.event.handoffStatus,
      reason: error instanceof Error ? error.name : "unknown_error",
    });
  } finally {
    clearTimeout(timeout);
  }
}

function splitJid(value?: string | null) {
  const text = String(value ?? "").trim();
  const [identity = "", server = ""] = text.split("@");
  const user = identity.split(":")[0] ?? "";
  return { text, user, server };
}

function isPhoneNumberJid(value?: string | null) {
  const { user, server } = splitJid(value);
  return Boolean(user && (server === "s.whatsapp.net" || server === "hosted"));
}

function isLidJid(value?: string | null) {
  const { user, server } = splitJid(value);
  return Boolean(user && (server === "lid" || server === "hosted.lid"));
}

function normalizeRecipientWaIdForJid(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!/^\d{8,15}$/.test(digits)) return null;
  return digits;
}

function extractExternalMessageId(result: unknown) {
  const record = result && typeof result === "object" && !Array.isArray(result)
    ? result as Record<string, unknown>
    : {};
  const key = record.key && typeof record.key === "object" && !Array.isArray(record.key)
    ? record.key as Record<string, unknown>
    : {};
  return typeof key.id === "string" && key.id.trim() ? key.id.trim() : null;
}

function buildQuotedMessageContent(replyTo: WebSessionControlReplyReference) {
  const text = replyTo.bodyText?.trim() || "Mensagem";
  if (replyTo.messageType === "TEXT") return { conversation: text };
  if (replyTo.messageType === "IMAGE") {
    return { imageMessage: { caption: replyTo.bodyText ?? undefined, mimetype: replyTo.mimeType ?? "image/jpeg" } };
  }
  if (replyTo.messageType === "AUDIO") {
    return { audioMessage: { mimetype: replyTo.mimeType ?? "audio/ogg", ptt: true } };
  }
  if (replyTo.messageType === "VIDEO") {
    return { videoMessage: { caption: replyTo.bodyText ?? undefined, mimetype: replyTo.mimeType ?? "video/mp4" } };
  }
  return {
    documentMessage: {
      title: replyTo.fileName ?? "documento",
      fileName: replyTo.fileName ?? "documento",
      mimetype: replyTo.mimeType ?? "application/octet-stream",
      caption: replyTo.bodyText ?? undefined,
    },
  };
}

function buildQuotedMessageOptions(replyTo?: WebSessionControlReplyReference | null) {
  if (!replyTo) return undefined;
  return {
    quoted: {
      key: {
        id: replyTo.externalMessageId,
        remoteJid: replyTo.remoteJid,
        fromMe: replyTo.fromMe,
      },
      message: buildQuotedMessageContent(replyTo),
    },
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("web_session_send_timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function resolveWebSessionSenderJid(params: {
  message: BaileysInboundMessageLike;
  keys?: BaileysAuthKeysLike | null;
}) {
  const key = params.message.key ?? {};
  const direct = [key.participant, key.remoteJid].find(isPhoneNumberJid);
  if (direct) return direct;

  const lid = [key.participant, key.remoteJid].find(isLidJid);
  if (!lid || !params.keys?.get) return null;
  const parsed = splitJid(lid);
  const reverseKey = `${parsed.user}_reverse`;
  const stored = await params.keys.get("lid-mapping", [reverseKey]);
  const pnUser = typeof stored[reverseKey] === "string" ? String(stored[reverseKey]).trim() : "";
  if (!/^\d+$/.test(pnUser)) return null;
  return `${pnUser}@s.whatsapp.net`;
}

export async function sendTextViaActiveWebSession(params: {
  prisma?: WorkerPrismaClient;
  clientId: string;
  tenantKey: string;
  accountId: string;
  channelAccountId: string;
  recipientWaId: string;
  text: string;
  replyTo?: WebSessionControlReplyReference | null;
  requestId: string;
  timeoutMs?: number;
}) {
  const prisma = params.prisma ?? getPrisma();
  const text = params.text.trim();
  const recipientDigits = normalizeRecipientWaIdForJid(params.recipientWaId);
  if (!text || !recipientDigits) {
    return { ok: false as const, statusCode: 400, error: "bad_request" };
  }
  const account = await prisma.channelAccount.findFirst({
    where: {
      id: params.accountId,
      clientId: params.clientId,
      channel: "whatsapp",
      provider: "web_session",
      channelAccountId: params.channelAccountId,
    },
    include: {
      client: {
        select: {
          id: true,
          clientKey: true,
          status: true,
          features: true,
          profile: true,
        },
      },
    },
  }) as ChannelAccountRecord | null;
  if (!account || account.client.clientKey !== params.tenantKey) {
    return { ok: false as const, statusCode: 404, error: "web_session_account_not_found" };
  }
  if (!isEligibleWebSessionAccount(account) || account.status !== "connected") {
    return { ok: false as const, statusCode: 409, error: "web_session_not_connected" };
  }
  const lifecycle = readWebSessionLifecycle(account.metadata);
  if (lifecycle.observedState !== "CONNECTED") {
    return { ok: false as const, statusCode: 409, error: "web_session_not_connected" };
  }
  const active = activeConnections.get(account.id);
  if (!active?.socket?.sendMessage) {
    return { ok: false as const, statusCode: 503, error: "web_session_worker_not_connected" };
  }
  try {
    const result = await withTimeout(
      active.socket.sendMessage(`${recipientDigits}@s.whatsapp.net`, { text }, buildQuotedMessageOptions(params.replyTo)),
      params.timeoutMs ?? DEFAULT_SEND_TEXT_TIMEOUT_MS
    );
    const externalMessageId = extractExternalMessageId(result);
    logger.info({
      event: "whatsapp.web.outbound.sent",
      ...sanitizeWebSessionAccountRef(params),
      requestId: params.requestId,
      hasExternalMessageId: Boolean(externalMessageId),
      hasReplyReference: Boolean(params.replyTo),
    });
    return { ok: true as const, externalMessageId };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown_error";
    logger.warn({
      event: "whatsapp.web.outbound.failed",
      ...sanitizeWebSessionAccountRef(params),
      requestId: params.requestId,
      reason,
    });
    return {
      ok: false as const,
      statusCode: reason === "web_session_send_timeout" ? 504 : 502,
      error: reason === "web_session_send_timeout" ? "web_session_send_timeout" : "web_session_send_failed",
    };
  }
}

export async function sendMediaViaActiveWebSession(params: {
  prisma?: WorkerPrismaClient;
  clientId: string;
  tenantKey: string;
  accountId: string;
  channelAccountId: string;
  recipientWaId: string;
  mediaPath: string;
  mediaKind: WebSessionMediaKind;
  mimeType: string;
  fileName: string | null;
  caption: string | null;
  replyTo?: WebSessionControlReplyReference | null;
  requestId: string;
  timeoutMs?: number;
}) {
  const prisma = params.prisma ?? getPrisma();
  const recipientDigits = normalizeRecipientWaIdForJid(params.recipientWaId);
  if (!recipientDigits || !params.mediaPath.trim()) {
    return { ok: false as const, statusCode: 400, error: "bad_request" };
  }
  const account = await prisma.channelAccount.findFirst({
    where: {
      id: params.accountId,
      clientId: params.clientId,
      channel: "whatsapp",
      provider: "web_session",
      channelAccountId: params.channelAccountId,
    },
    include: {
      client: {
        select: {
          id: true,
          clientKey: true,
          status: true,
          features: true,
          profile: true,
        },
      },
    },
  }) as ChannelAccountRecord | null;
  if (!account || account.client.clientKey !== params.tenantKey) {
    return { ok: false as const, statusCode: 404, error: "web_session_account_not_found" };
  }
  if (!isEligibleWebSessionAccount(account) || account.status !== "connected") {
    return { ok: false as const, statusCode: 409, error: "web_session_not_connected" };
  }
  const lifecycle = readWebSessionLifecycle(account.metadata);
  if (lifecycle.observedState !== "CONNECTED") {
    return { ok: false as const, statusCode: 409, error: "web_session_not_connected" };
  }
  const active = activeConnections.get(account.id);
  if (!active?.socket?.sendMessage) {
    return { ok: false as const, statusCode: 503, error: "web_session_worker_not_connected" };
  }
  let content: Buffer;
  try {
    content = await fs.readFile(params.mediaPath);
    validateWebSessionMedia({
      content,
      mimeType: params.mimeType,
      fileName: params.fileName,
      kind: params.mediaKind,
    });
  } catch (error) {
    logger.warn({
      event: "whatsapp.web.outbound.media.failed",
      ...sanitizeWebSessionAccountRef(params),
      requestId: params.requestId,
      reason: error instanceof Error ? error.message : "media_read_failed",
    });
    return { ok: false as const, statusCode: 400, error: "web_session_media_invalid" };
  }

  const payload =
    params.mediaKind === "image"
      ? { image: content, mimetype: params.mimeType, caption: params.caption ?? undefined }
      : params.mediaKind === "audio"
        ? { audio: content, mimetype: "audio/ogg; codecs=opus", ptt: true }
        : params.mediaKind === "video"
          ? { video: content, mimetype: params.mimeType, caption: params.caption ?? undefined }
          : {
              document: content,
              mimetype: params.mimeType,
              fileName: params.fileName ?? "documento",
              caption: params.caption ?? undefined,
            };
  try {
    const result = await withTimeout(
      active.socket.sendMessage(`${recipientDigits}@s.whatsapp.net`, payload, buildQuotedMessageOptions(params.replyTo)),
      params.timeoutMs ?? DEFAULT_SEND_MEDIA_TIMEOUT_MS
    );
    const externalMessageId = extractExternalMessageId(result);
    logger.info({
      event: "whatsapp.web.outbound.media.sent",
      ...sanitizeWebSessionAccountRef(params),
      requestId: params.requestId,
      mediaKind: params.mediaKind,
      hasExternalMessageId: Boolean(externalMessageId),
      hasReplyReference: Boolean(params.replyTo),
    });
    return { ok: true as const, externalMessageId };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown_error";
    logger.warn({
      event: "whatsapp.web.outbound.media.failed",
      ...sanitizeWebSessionAccountRef(params),
      requestId: params.requestId,
      mediaKind: params.mediaKind,
      reason,
    });
    return {
      ok: false as const,
      statusCode: reason === "web_session_send_timeout" ? 504 : 502,
      error: reason === "web_session_send_timeout" ? "web_session_send_timeout" : "web_session_media_send_failed",
    };
  }
}

export function isTransientConnectingState(account: ChannelAccountRecord) {
  const state = readWebSessionLifecycle(account.metadata).observedState;
  return state === "CONNECTING" || state === "RECONNECTING";
}

async function recordWebSessionWorkerEvent(params: {
  prisma: WorkerPrismaClient;
  account: EligibleWebSessionAccount;
  eventName: string;
  requestSuffix: string;
  payloadJson: Record<string, unknown>;
}) {
  try {
    await params.prisma.event.create({
      data: {
        clientId: params.account.clientId,
        requestId: eventRequestId(params.account, params.requestSuffix),
        eventName: params.eventName,
        payloadJson: params.payloadJson as never,
      },
    });
  } catch (error) {
    logger.warn({
      event: "whatsapp.web.session.event_write_failed",
      ...webSessionLogAccount(params.account),
      eventName: params.eventName,
      message: error instanceof Error ? error.message : "unknown_error",
    });
  }
}

async function isWebSessionStillRequested(params: {
  prisma: WorkerPrismaClient;
  accountId: string;
}) {
  const account = await params.prisma.channelAccount.findUnique({
    where: { id: params.accountId },
    select: { runtimeEnabled: true, metadata: true },
  });
  return Boolean(account?.runtimeEnabled && isWebSessionConnectRequested(account.metadata));
}

export function isEligibleWebSessionAccount(account: ChannelAccountRecord) {
  if (account.client.status !== "ACTIVE") return false;
  if (getFeatures(account.client).whatsappWebSession !== true) return false;
  if (account.channel !== "whatsapp" || account.provider !== "web_session") return false;
  if (!account.enabled || !account.runtimeEnabled) return false;
  if (account.status !== "connected" && account.status !== "pending") return false;
  if (!isWebSessionConnectRequested(account.metadata)) return false;
  return true;
}

export async function listEligibleWebSessionAccounts(prisma: WorkerPrismaClient) {
  const accounts = await prisma.channelAccount.findMany({
    where: {
      channel: "whatsapp",
      provider: "web_session",
    },
    include: {
      client: {
        select: {
          id: true,
          clientKey: true,
          status: true,
          features: true,
          profile: true,
        },
      },
    },
    orderBy: [{ updatedAt: "asc" }],
  }) as ChannelAccountRecord[];
  return accounts
    .filter(isEligibleWebSessionAccount)
    .map((account) => ({
      id: account.id,
      clientId: account.clientId,
      tenantKey: account.client.clientKey,
      channelAccountId: account.channelAccountId,
      metadata: account.metadata,
      lifecycle: readWebSessionLifecycle(account.metadata),
    } satisfies EligibleWebSessionAccount));
}

export function shouldKeepActiveWebSessionConnection(account: ChannelAccountRecord) {
  return isEligibleWebSessionAccount(account);
}

async function reconcileActiveWebSessionConnections(prisma: WorkerPrismaClient) {
  const accountIds = Array.from(activeConnections.keys());
  if (accountIds.length === 0) return;
  const accounts = await prisma.channelAccount.findMany({
    where: { id: { in: accountIds } },
    include: {
      client: {
        select: {
          id: true,
          clientKey: true,
          status: true,
          features: true,
          profile: true,
        },
      },
    },
  }) as ChannelAccountRecord[];
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  for (const accountId of accountIds) {
    const active = activeConnections.get(accountId);
    if (!active) continue;
    const account = accountById.get(accountId);
    if (account && shouldKeepActiveWebSessionConnection(account)) {
      const staleConnecting =
        isTransientConnectingState(account) &&
        Date.now() - active.startedAtMs > STALE_ACTIVE_CONNECTING_TIMEOUT_MS;
      if (!staleConnecting) continue;
      await markWebSessionRuntimeState({
        prisma,
        accountId,
        ...connectionOpenTimeoutRuntimeState(),
      });
      logger.warn({
        event: "whatsapp.web.session.active_timeout",
        ...sanitizeWebSessionAccountRef(active),
      });
    }
    activeConnections.delete(accountId);
    active.close?.();
    await active.release();
    logger.info({
      event: "whatsapp.web.session.active_stopped",
      ...sanitizeWebSessionAccountRef(active),
    });
  }
}

export async function runWhatsAppWebSessionWorker(params: {
  prisma?: WorkerPrismaClient;
  once?: boolean;
  pollIntervalMs?: number;
  abortSignal?: AbortSignal;
} = {}) {
  const prisma = params.prisma ?? getPrisma();
  const pollIntervalMs = params.pollIntervalMs ?? 15_000;
  logger.info({ event: "whatsapp.web.worker.started" });

  do {
    try {
      await reconcileActiveWebSessionConnections(prisma);
      const accounts = await listEligibleWebSessionAccounts(prisma);
      if (accounts.length === 0) {
        logger.info({ event: "whatsapp.web.worker.idle", eligibleAccounts: 0 });
      }
      for (const account of accounts) {
        if (activeConnections.has(account.id)) continue;
        const lock = await acquireDedicatedPgAdvisoryLock({ scope: `web-session-account:${account.id}` });
        if (!lock.acquired) {
          logger.info({
            event: "whatsapp.web.session.lock_skipped",
            ...webSessionLogAccount(account),
            lockHash: lock.lockHash,
          });
          continue;
        }
        try {
          if (activeConnections.has(account.id)) continue;
          logger.info({
            event: "whatsapp.web.session.connecting",
            ...webSessionLogAccount(account),
            observedState: account.lifecycle.observedState,
          });
          activeConnections.set(account.id, {
            tenantKey: account.tenantKey,
            channelAccountId: account.channelAccountId,
            startedAtMs: Date.now(),
            release: async () => {
              await lock.release();
            },
          });
          await connectWebSessionAccount({
            prisma,
            account,
            onTerminal: async () => {
              const active = activeConnections.get(account.id);
              activeConnections.delete(account.id);
              await active?.release();
            },
          });
        } catch (error) {
          activeConnections.delete(account.id);
          await lock.release();
          await markWebSessionRuntimeState({
            prisma,
            accountId: account.id,
            observedState: "ERROR",
            status: "error",
            errorCode: error instanceof Error ? error.message : "unknown_error",
          });
          logger.error({
            event: "whatsapp.web.session.connect_error",
            ...webSessionLogAccount(account),
            message: error instanceof Error ? error.message : "unknown_error",
          });
        }
      }
    } catch (error) {
      logger.error({
        event: "whatsapp.web.worker.loop_error",
        message: error instanceof Error ? error.message : "unknown_error",
      });
    }
    if (params.once) break;
    await delay(
      calculateWebSessionReconnectBackoff({ attempt: 0, baseMs: pollIntervalMs, maxMs: pollIntervalMs }),
      undefined,
      { signal: params.abortSignal }
    ).catch(() => undefined);
  } while (!params.abortSignal?.aborted);

  for (const [accountId, active] of activeConnections.entries()) {
    activeConnections.delete(accountId);
    await active.release();
  }
}

async function connectWebSessionAccount(params: {
  prisma: WorkerPrismaClient;
  account: EligibleWebSessionAccount;
  onTerminal: () => Promise<void>;
}) {
  let terminalHandled = false;
  let socket: Awaited<ReturnType<typeof createBaileysSocket>> | null = null;
  let connectionOpenTimer: ReturnType<typeof setTimeout> | null = null;
  let closingAfterConnectionOpenTimeout = false;
  let closingAfterIdentityConflict = false;
  let inboundCutoverAt: Date | null = null;
  let effectiveAccount = params.account;
  const accountEventRef = (account: Pick<EligibleWebSessionAccount, "tenantKey" | "channelAccountId">) => {
    const sanitized = webSessionLogAccount(account);
    return {
      channelAccountRef: sanitized.channelAccountRef,
      channelAccountIdLast4: sanitized.channelAccountIdLast4,
    };
  };
  const clearConnectionOpenTimer = () => {
    if (!connectionOpenTimer) return;
    clearTimeout(connectionOpenTimer);
    connectionOpenTimer = null;
  };
  const finishTerminal = async () => {
    if (terminalHandled) return;
    terminalHandled = true;
    clearConnectionOpenTimer();
    await params.onTerminal();
  };
  const closeSocket = () => {
    if (socket) closeBaileysSocket(socket);
  };
  const module = await import("@whiskeysockets/baileys");
  const authStore = createDurableStagedWebSessionAuthStore({ prisma: params.prisma });
  const auth = await createBaileysAuthState({
    module: module as unknown as Parameters<typeof createBaileysAuthState>[0]["module"],
    store: authStore.store,
    scope: {
      tenantKey: params.account.tenantKey,
      channelAccountId: params.account.channelAccountId,
    },
    logger,
  });
  await markWebSessionRuntimeState({
    prisma: params.prisma,
    accountId: params.account.id,
    observedState: "CONNECTING",
    status: "pending",
  });
  await recordWebSessionWorkerEvent({
    prisma: params.prisma,
    account: params.account,
    requestSuffix: "connecting",
    eventName: "whatsapp.web_session.connecting",
      payloadJson: {
        channel: "whatsapp",
        provider: "web_session",
        ...accountEventRef(params.account),
      },
  });
  connectionOpenTimer = setTimeout(() => {
    void (async () => {
      await markWebSessionRuntimeState({
        prisma: params.prisma,
        accountId: params.account.id,
        ...connectionOpenTimeoutRuntimeState(),
      });
      await recordWebSessionWorkerEvent({
        prisma: params.prisma,
        account: params.account,
        requestSuffix: "connection-open-timeout",
        eventName: "whatsapp.web_session.error",
        payloadJson: {
          channel: "whatsapp",
          provider: "web_session",
          ...accountEventRef(params.account),
          reason: "connection_open_timeout",
        },
      });
      closingAfterConnectionOpenTimeout = true;
      closeSocket();
      await finishTerminal();
    })();
  }, DEFAULT_CONNECTION_OPEN_TIMEOUT_MS);
  socket = await createBaileysSocket({
    authState: auth.state,
    logger,
    onQr: async (qr) => {
      clearConnectionOpenTimer();
      if (!await isWebSessionStillRequested({ prisma: params.prisma, accountId: params.account.id })) {
        clearWebSessionQrForRuntime(params.account.id);
        return;
      }
      setWebSessionQrForRuntime({ accountId: params.account.id, qr });
      await markWebSessionRuntimeState({
        prisma: params.prisma,
        accountId: params.account.id,
        observedState: "QR_REQUIRED",
        status: "pending",
      });
      await recordWebSessionWorkerEvent({
        prisma: params.prisma,
        account: params.account,
        requestSuffix: "qr-required",
        eventName: "whatsapp.web_session.qr_requested",
        payloadJson: {
          channel: "whatsapp",
          provider: "web_session",
          ...accountEventRef(params.account),
          qrStored: false,
        },
      });
    },
    onCredentialsUpdate: async (update) => {
      auth.mergeCredentials(update);
      await auth.save();
    },
    onConnectionUpdate: async (update) => {
      logger.info({
        event: "whatsapp.web.connection.update",
        ...webSessionLogAccount(effectiveAccount),
        connection: typeof update.connection === "string" ? update.connection : null,
        receivedPendingNotifications: update.receivedPendingNotifications === true,
        isNewLogin: update.isNewLogin === true,
        hasQr: typeof update.qr === "string" && update.qr.length > 0,
        hasDisconnectReason: Boolean(update.lastDisconnect),
      });
    },
    onMessagesUpsert: async (event) => {
      await handleWebSessionMessagesUpsert({
        prisma: params.prisma,
        account: effectiveAccount,
        event,
        authKeys: auth.state.keys as BaileysAuthKeysLike,
        cutoverAt: inboundCutoverAt,
        socket,
      });
    },
    onMessagesUpdate: async (event) => {
      await handleWebSessionOutboundStatusUpdates({
        prisma: params.prisma,
        account: effectiveAccount,
        event,
      });
      await handleWebSessionMessagesUpdate({
        prisma: params.prisma,
        account: effectiveAccount,
        event,
        authKeys: auth.state.keys as BaileysAuthKeysLike,
        cutoverAt: inboundCutoverAt,
        socket,
      });
    },
    onMessageReceiptUpdate: async (event) => {
      await handleWebSessionReceiptUpdates({
        prisma: params.prisma,
        account: effectiveAccount,
        event,
      });
    },
    onSocketNode: async (node) => {
      logger.info({
        event: "whatsapp.web.socket.node",
        ...webSessionLogAccount(effectiveAccount),
        name: node.name,
        tag: node.tag,
        type: node.type,
        className: node.className,
        childCount: node.childCount,
        childTags: node.childTags,
        childAttrsKeys: node.childAttrsKeys,
        encTypes: node.encTypes,
      });
    },
    onEventBatch: async (events) => {
      const eventNames = Object.keys(events).sort();
      if (eventNames.length === 0) return;
      const messagesUpdate = (events as { "messages.update"?: unknown })["messages.update"];
      logger.info({
        event: "whatsapp.web.event_batch",
        ...webSessionLogAccount(effectiveAccount),
        eventNames,
        messagesUpsertCount: Array.isArray((events as { "messages.upsert"?: { messages?: unknown[] } })["messages.upsert"]?.messages)
          ? (events as { "messages.upsert"?: { messages?: unknown[] } })["messages.upsert"]?.messages?.length
          : null,
        messagesUpdateCount: Array.isArray(messagesUpdate) ? messagesUpdate.length : null,
      });
    },
    onConnected: async (connectedSocket) => {
      clearConnectionOpenTimer();
      inboundCutoverAt = new Date();
      clearWebSessionQrForRuntime(params.account.id);
      await auth.save();
      const observedIdentity = extractWebSessionObservedIdentity({
        user: connectedSocket.user,
        creds: auth.state.creds,
      });
      const identityLockScope = observedIdentity
        ? `web-session-identity:${observedIdentity}`
        : `web-session-identity:missing:${params.account.id}`;
      const reconciliationAttempt = await withDedicatedPgAdvisoryLock({
        scope: identityLockScope,
        onBlocked: async (lock) => {
          logger.warn({
            event: "whatsapp.web.identity.lock_skipped",
            ...webSessionLogAccount(params.account),
            lockHash: lock.lockHash,
          });
        },
        run: async () => reconcileWebSessionObservedIdentity({
          prisma: params.prisma,
          accountId: params.account.id,
          observedIdentity,
          expectedIdentity: readExpectedWebSessionIdentity(params.account.metadata),
          requestId: `web-session-identity:${params.account.id}:${Date.now()}`,
          source: "worker_connected",
        }),
      });
      const reconciliation = reconciliationAttempt.ok
        ? reconciliationAttempt.value
        : { ok: false as const, error: "web_session_identity_lock_unavailable" as const };
      if (!reconciliation.ok) {
        await authStore.discardPersisted?.({
          tenantKey: params.account.tenantKey,
          channelAccountId: params.account.channelAccountId,
        });
        await markWebSessionRuntimeState({
          prisma: params.prisma,
          accountId: params.account.id,
          observedState: "ERROR",
          status: "error",
          errorCode: reconciliation.error,
        });
        await recordWebSessionWorkerEvent({
          prisma: params.prisma,
          account: params.account,
          requestSuffix: `identity-${reconciliation.error}`,
          eventName: "whatsapp.web_session.error",
          payloadJson: {
            channel: "whatsapp",
            provider: "web_session",
            ...accountEventRef(params.account),
            reason: reconciliation.error,
            conflict: reconciliation.error === "web_session_identity_conflict",
          },
        });
        if (reconciliation.error === "web_session_identity_mismatch") {
          await recordWebSessionWorkerEvent({
            prisma: params.prisma,
            account: params.account,
            requestSuffix: "identity-mismatch",
            eventName: "whatsapp.web.number.mismatch",
            payloadJson: {
              channel: "whatsapp",
              provider: "web_session",
              ...accountEventRef(params.account),
              expected: reconciliation.expectedIdentityMasked,
              observed: reconciliation.observedIdentityMasked,
            },
          });
        }
        closingAfterIdentityConflict = true;
        closeSocket();
        await finishTerminal();
        return;
      }
      const promotion = await authStore.promote({
        tenantKey: params.account.tenantKey,
        channelAccountId: reconciliation.channelAccountId,
      });
      if (!promotion.ok) {
        await markWebSessionRuntimeState({
          prisma: params.prisma,
          accountId: params.account.id,
          observedState: "ERROR",
          status: "error",
          errorCode: promotion.error,
        });
        await recordWebSessionWorkerEvent({
          prisma: params.prisma,
          account: params.account,
          requestSuffix: `identity-promotion-${promotion.error}`,
          eventName: "whatsapp.web_session.error",
          payloadJson: {
            channel: "whatsapp",
            provider: "web_session",
            ...accountEventRef(params.account),
            reason: promotion.error,
          },
        });
        closingAfterIdentityConflict = true;
        closeSocket();
        await finishTerminal();
        return;
      }
      effectiveAccount = {
        ...effectiveAccount,
        channelAccountId: reconciliation.channelAccountId,
      };
      const active = activeConnections.get(params.account.id);
      if (active) active.channelAccountId = reconciliation.channelAccountId;
      await markWebSessionRuntimeState({
        prisma: params.prisma,
        accountId: params.account.id,
        observedState: "CONNECTED",
        status: "connected",
      });
      await recordWebSessionWorkerEvent({
        prisma: params.prisma,
        account: effectiveAccount,
        requestSuffix: "connected",
        eventName: "whatsapp.web_session.connected",
        payloadJson: {
          channel: "whatsapp",
          provider: "web_session",
          ...accountEventRef(effectiveAccount),
          identityAction: reconciliation.action,
        },
      });
    },
    onDisconnected: async (reason) => {
      clearConnectionOpenTimer();
      if (closingAfterConnectionOpenTimeout || closingAfterIdentityConflict) {
        await finishTerminal();
        return;
      }
      const disconnectInfo = extractWebSessionDisconnectInfo(reason);
      const classification = disconnectInfo.classification;
      clearWebSessionQrForRuntime(params.account.id);
      if (classification === "qr_required") {
        await authStore.store.clear({
          tenantKey: params.account.tenantKey,
          channelAccountId: params.account.channelAccountId,
        });
      }
      const stillRequested = await isWebSessionStillRequested({ prisma: params.prisma, accountId: params.account.id });
      const runtimeState = resolveWebSessionDisconnectRuntimeState({
        classification,
        stillRequested,
        reconnectCount: params.account.lifecycle.reconnectCount,
      });
      await markWebSessionRuntimeState({
        prisma: params.prisma,
        accountId: params.account.id,
        observedState: runtimeState.observedState,
        status: runtimeState.status,
        errorCode: runtimeState.errorCode,
        reconnectCount: runtimeState.reconnectCount,
      });
      await recordWebSessionWorkerEvent({
        prisma: params.prisma,
        account: effectiveAccount,
        requestSuffix: "disconnected",
        eventName: runtimeState.eventName,
        payloadJson: {
          channel: "whatsapp",
          provider: "web_session",
          channelAccountRef: webSessionLogAccount(effectiveAccount).channelAccountRef,
          channelAccountIdLast4: webSessionLogAccount(effectiveAccount).channelAccountIdLast4,
          reason: runtimeState.eventReason,
          rawClassification: classification,
          disconnectReasonCode: disconnectInfo.reasonCode,
          disconnectStatusCode: disconnectInfo.statusCode,
        },
      });
      await finishTerminal();
    },
  }).catch(async (error) => {
    clearConnectionOpenTimer();
    await markWebSessionRuntimeState({
      prisma: params.prisma,
      accountId: params.account.id,
      observedState: "ERROR",
      status: "error",
      errorCode: error instanceof Error ? error.message : "unknown_error",
    });
    await finishTerminal();
  });
  const active = activeConnections.get(params.account.id);
  if (active) {
    active.socket = socket;
    active.close = closeSocket;
  }
}

function messagesFromUpdates(event: BaileysMessagesUpdateEvent): BaileysInboundMessageLike[] {
  return event
    .map((item) => {
      const update = item.update && typeof item.update === "object" && !Array.isArray(item.update)
        ? item.update
        : {};
      if (!update.message || typeof update.message !== "object") return null;
      return {
        key: item.key,
        ...update,
      } as BaileysInboundMessageLike;
    })
    .filter((message): message is BaileysInboundMessageLike => Boolean(message));
}

function getMessageUpdateKey(item: { key?: unknown }) {
  return item.key && typeof item.key === "object" && !Array.isArray(item.key)
    ? item.key as { id?: unknown; fromMe?: unknown; remoteJid?: unknown }
    : {};
}

function getReceiptExternalMessageId(item: { key?: unknown }) {
  const key = getMessageUpdateKey(item);
  return typeof key.id === "string" && key.id.trim() ? key.id.trim() : null;
}

function getReceiptStatusFromMessageUpdate(item: { update?: Record<string, unknown> }) {
  const update = item.update && typeof item.update === "object" && !Array.isArray(item.update)
    ? item.update
    : {};
  return normalizeBaileysReceiptStatus(update.status);
}

function getReceiptStatusFromReceiptUpdate(item: { receipt?: Record<string, unknown> }) {
  const receipt = item.receipt && typeof item.receipt === "object" && !Array.isArray(item.receipt)
    ? item.receipt
    : {};
  if (Object.keys(receipt).length > 0 && receipt.status === undefined && receipt.type === undefined) {
    return "delivered";
  }
  return normalizeBaileysReceiptStatus(receipt.status ?? receipt.type);
}

async function persistWebSessionReceipt(params: {
  prisma: WorkerPrismaClient;
  account: EligibleWebSessionAccount;
  externalMessageId: string | null;
  status: WebSessionDeliveryStatus | null;
  source: "messages.update" | "message-receipt.update";
}) {
  if (!params.externalMessageId || !params.status) return;
  const result = await recordWebSessionOutboundReceipt({
    prisma: params.prisma,
    clientId: params.account.clientId,
    channelAccountId: params.account.channelAccountId,
    externalMessageId: params.externalMessageId,
    status: params.status,
    requestId: `web-session-receipt:${params.account.id}:${params.externalMessageId}:${params.status}`,
  });
  if (result.updated) {
    await notifyAgentWebSessionReceiptRealtime({
      account: params.account,
      payload: buildWebSessionReceiptRealtimePayload({
        clientId: params.account.clientId,
        messageId: result.messageId,
        externalMessageId: result.externalMessageId,
        waId: result.waId,
        waIdCanonical: result.waIdCanonical,
        status: result.status,
        updatedAt: result.updatedAt,
      }),
    });
  }
  logger.info({
    event: "whatsapp.web.receipt.processed",
    ...webSessionLogAccount(params.account),
    source: params.source,
    status: params.status,
    updated: result.updated,
    reason: result.updated ? null : result.reason,
  });
}

async function handleWebSessionOutboundStatusUpdates(params: {
  prisma: WorkerPrismaClient;
  account: EligibleWebSessionAccount;
  event: BaileysMessagesUpdateEvent;
}) {
  for (const item of params.event) {
    const key = getMessageUpdateKey(item);
    if (key.fromMe !== true) continue;
    await persistWebSessionReceipt({
      prisma: params.prisma,
      account: params.account,
      externalMessageId: getReceiptExternalMessageId(item),
      status: getReceiptStatusFromMessageUpdate(item),
      source: "messages.update",
    });
  }
}

async function handleWebSessionReceiptUpdates(params: {
  prisma: WorkerPrismaClient;
  account: EligibleWebSessionAccount;
  event: BaileysMessageReceiptUpdateEvent;
}) {
  for (const item of params.event) {
    await persistWebSessionReceipt({
      prisma: params.prisma,
      account: params.account,
      externalMessageId: getReceiptExternalMessageId(item),
      status: getReceiptStatusFromReceiptUpdate(item),
      source: "message-receipt.update",
    });
  }
}

function summarizeMessageUpdates(event: BaileysMessagesUpdateEvent) {
  const summary = {
    fromMe: 0,
    notFromMe: 0,
    unknownFromMe: 0,
    withMessage: 0,
    withStatus: 0,
    withReceipt: 0,
    withRemoteJid: 0,
  };
  for (const item of event) {
    const key = item.key && typeof item.key === "object" && !Array.isArray(item.key)
      ? item.key as { fromMe?: unknown; remoteJid?: unknown }
      : {};
    const update = item.update && typeof item.update === "object" && !Array.isArray(item.update)
      ? item.update
      : {};
    if (key.fromMe === true) summary.fromMe += 1;
    else if (key.fromMe === false) summary.notFromMe += 1;
    else summary.unknownFromMe += 1;
    if (typeof key.remoteJid === "string" && key.remoteJid.trim()) summary.withRemoteJid += 1;
    if (update.message && typeof update.message === "object") summary.withMessage += 1;
    if (Object.prototype.hasOwnProperty.call(update, "status")) summary.withStatus += 1;
    if (Object.prototype.hasOwnProperty.call(update, "receipt")) summary.withReceipt += 1;
  }
  return summary;
}

function getBaileysInboundMediaDescriptor(message: BaileysInboundMessageLike): {
  kind: WebSessionMediaKind;
  mimeType: string;
  fileName: string | null;
  caption: string | null;
} | null {
  const payload = message.message && typeof message.message === "object" && !Array.isArray(message.message)
    ? message.message as Record<string, unknown>
    : {};
  const candidates: Array<{ key: string; kind: WebSessionMediaKind }> = [
    { key: "imageMessage", kind: "image" },
    { key: "audioMessage", kind: "audio" },
    { key: "documentMessage", kind: "document" },
    { key: "videoMessage", kind: "video" },
  ];
  for (const candidate of candidates) {
    const value = payload[candidate.key];
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const record = value as Record<string, unknown>;
    const mimeType = typeof record.mimetype === "string" ? record.mimetype.trim() : "";
    const fileName = typeof record.fileName === "string" && record.fileName.trim() ? record.fileName.trim() : null;
    const caption = typeof record.caption === "string" && record.caption.trim() ? record.caption.trim() : null;
    const normalizedKind = detectWebSessionMediaKind(mimeType, fileName);
    if (normalizedKind && normalizedKind !== candidate.kind) return null;
    return {
      kind: candidate.kind,
      mimeType: mimeType || "application/octet-stream",
      fileName,
      caption,
    };
  }
  return null;
}

async function attachInboundMedia(params: {
  account: EligibleWebSessionAccount;
  message: BaileysInboundMessageLike;
  socket?: BaileysSocketLike | null;
}) {
  const descriptor = getBaileysInboundMediaDescriptor(params.message);
  if (!descriptor) return params.message;
  const module = await import("@whiskeysockets/baileys");
  const downloadMediaMessage = (module as { downloadMediaMessage?: (...args: unknown[]) => Promise<unknown> }).downloadMediaMessage;
  if (typeof downloadMediaMessage !== "function") {
    logger.warn({
      event: "whatsapp.web.inbound.media.download_failed",
      ...webSessionLogAccount(params.account),
      reason: "download_media_unavailable",
      mediaKind: descriptor.kind,
    });
    return params.message;
  }
  try {
    const downloaded = await downloadMediaMessage(
      params.message,
      "buffer",
      {},
      {
        logger,
        reuploadRequest: typeof params.socket?.updateMediaMessage === "function"
          ? params.socket.updateMediaMessage.bind(params.socket)
          : undefined,
      }
    );
    const content = Buffer.isBuffer(downloaded)
      ? downloaded
      : downloaded instanceof Uint8Array
        ? Buffer.from(downloaded)
        : null;
    if (!content) throw new Error("download_result_not_buffer");
    const externalMessageId = String(params.message.key?.id ?? "").trim() || crypto.randomUUID();
    const stored = await storeWebSessionMediaFile({
      clientId: params.account.clientId,
      messageId: `web.inbound.${params.account.id}.${externalMessageId}`,
      content,
      mimeType: descriptor.mimeType,
      fileName: descriptor.fileName,
      caption: descriptor.caption,
      kind: descriptor.kind,
    });
    logger.info({
      event: "whatsapp.web.inbound.media.persisted",
      ...webSessionLogAccount(params.account),
      mediaKind: stored.kind,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
    });
    return {
      ...params.message,
      webSessionMedia: stored,
    };
  } catch (error) {
    logger.warn({
      event: "whatsapp.web.inbound.media.download_failed",
      ...webSessionLogAccount(params.account),
      mediaKind: descriptor.kind,
      reason: error instanceof Error ? error.message : "unknown_error",
    });
    return params.message;
  }
}

async function handleWebSessionMessagesUpdate(params: {
  prisma: WorkerPrismaClient;
  account: EligibleWebSessionAccount;
  event: BaileysMessagesUpdateEvent;
  authKeys?: BaileysAuthKeysLike | null;
  cutoverAt?: Date | null;
  socket?: BaileysSocketLike | null;
}) {
  const messages = messagesFromUpdates(params.event);
  const updateSummary = summarizeMessageUpdates(params.event);
  logger.info({
    event: "whatsapp.web.inbound.update_received",
    ...webSessionLogAccount(params.account),
    count: params.event.length,
    messagePayloadCount: messages.length,
    updateSummary,
  });
  if (messages.length === 0) return;
  await handleWebSessionMessagesUpsert({
    prisma: params.prisma,
    account: params.account,
    event: { type: "notify", messages },
    authKeys: params.authKeys ?? null,
    cutoverAt: params.cutoverAt ?? null,
    socket: params.socket ?? null,
  });
}

async function handleWebSessionMessagesUpsert(params: {
  prisma: WorkerPrismaClient;
  account: EligibleWebSessionAccount;
  event: BaileysMessagesUpsertEvent;
  authKeys?: BaileysAuthKeysLike | null;
  cutoverAt?: Date | null;
  socket?: BaileysSocketLike | null;
}) {
  const messages = Array.isArray(params.event.messages) ? params.event.messages : [];
  logger.info({
    event: "whatsapp.web.inbound.upsert_received",
    ...webSessionLogAccount(params.account),
    upsertType: params.event.type ?? null,
    count: messages.length,
  });
  if (params.event.type && params.event.type !== "notify") {
    await recordWebSessionWorkerEvent({
      prisma: params.prisma,
      account: params.account,
      requestSuffix: `history-ignored:${Date.now()}`,
      eventName: "whatsapp.web.inbound.ignored",
      payloadJson: {
        channel: "whatsapp",
        provider: "web_session",
        channelAccountRef: webSessionLogAccount(params.account).channelAccountRef,
        channelAccountIdLast4: webSessionLogAccount(params.account).channelAccountIdLast4,
        reason: "non_notify_upsert",
        upsertType: params.event.type,
        count: messages.length,
      },
    });
    return;
  }
  for (const message of messages) {
    try {
      const resolvedSenderJid = await resolveWebSessionSenderJid({
        message: message as BaileysInboundMessageLike,
        keys: params.authKeys ?? null,
      });
      const preparedMessage = await attachInboundMedia({
        account: params.account,
        message: message as BaileysInboundMessageLike,
        socket: params.socket ?? null,
      });
      const result = await ingestBaileysWebSessionMessage({
        prisma: params.prisma,
        clientId: params.account.clientId,
        tenantKey: params.account.tenantKey,
        channelAccountDbId: params.account.id,
        channelAccountId: params.account.channelAccountId,
        message: preparedMessage,
        resolvedSenderJid,
        cutoverAt: params.cutoverAt ?? null,
        publishHandoffRealtime: (event) => notifyAgentWebSessionHandoffRealtime({
          account: params.account,
          event,
        }),
      });
      logger.info({
        event: "whatsapp.web.inbound.processed",
        ...webSessionLogAccount(params.account),
        action: result.action,
        reason: "reason" in result ? result.reason : null,
      });
    } catch (error) {
      logger.error({
        event: "whatsapp.web.inbound.process_failed",
        ...webSessionLogAccount(params.account),
        errorName: error instanceof Error ? error.name : "unknown_error",
        message: error instanceof Error ? error.message : "unknown_error",
      });
    }
  }
}
