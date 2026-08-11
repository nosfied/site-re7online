import { setTimeout as delay } from "node:timers/promises";
import { getPrisma } from "../../whatsapp-agent/src/db.js";
import { getFeatures } from "../../whatsapp-agent/src/features/clientFeatures.js";
import { logger } from "../../whatsapp-agent/src/logger/logger.js";
import {
  calculateWebSessionReconnectBackoff,
  classifyWebSessionDisconnect,
  isWebSessionConnectRequested,
  readWebSessionLifecycle,
} from "../../whatsapp-agent/src/web-session/webSessionLifecycle.js";
import { acquireWebSessionAdvisoryLock } from "../../whatsapp-agent/src/web-session/webSessionAdvisoryLock.js";
import { createQueuedWebSessionAuthStore } from "../../whatsapp-agent/src/web-session/webSessionAuthStore.js";
import {
  clearWebSessionQrForRuntime,
  markWebSessionRuntimeState,
  setWebSessionQrForRuntime,
} from "../../whatsapp-agent/src/web-session/webSessionConnectionRuntime.js";
import {
  ingestBaileysWebSessionMessage,
  type BaileysInboundMessageLike,
} from "../../whatsapp-agent/src/web-session/webSessionInbound.js";
import { createBaileysAuthState } from "./web-session/baileysAuthState.js";
import {
  closeBaileysSocket,
  createBaileysSocket,
  type BaileysSocketLike,
  type BaileysMessagesUpdateEvent,
  type BaileysMessagesUpsertEvent,
} from "./web-session/baileysSocketFactory.js";

export type EligibleWebSessionAccount = {
  id: string;
  clientId: string;
  tenantKey: string;
  channelAccountId: string;
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

function eventRequestId(account: EligibleWebSessionAccount, eventName: string) {
  return `web-session-worker:${account.id}:${eventName}:${Date.now()}`;
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
      active.socket.sendMessage(`${recipientDigits}@s.whatsapp.net`, { text }),
      params.timeoutMs ?? DEFAULT_SEND_TEXT_TIMEOUT_MS
    );
    const externalMessageId = extractExternalMessageId(result);
    logger.info({
      event: "whatsapp.web.outbound.sent",
      tenantKey: params.tenantKey,
      channelAccountId: params.channelAccountId,
      requestId: params.requestId,
      hasExternalMessageId: Boolean(externalMessageId),
    });
    return { ok: true as const, externalMessageId };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown_error";
    logger.warn({
      event: "whatsapp.web.outbound.failed",
      tenantKey: params.tenantKey,
      channelAccountId: params.channelAccountId,
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
      tenantKey: params.account.tenantKey,
      channelAccountId: params.account.channelAccountId,
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
        tenantKey: active.tenantKey,
        channelAccountId: active.channelAccountId,
      });
    }
    activeConnections.delete(accountId);
    active.close?.();
    await active.release();
    logger.info({
      event: "whatsapp.web.session.active_stopped",
      tenantKey: active.tenantKey,
      channelAccountId: active.channelAccountId,
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
        const lock = await acquireWebSessionAdvisoryLock({ prisma, accountId: account.id });
        if (!lock.acquired) {
          logger.info({
            event: "whatsapp.web.session.lock_skipped",
            tenantKey: account.tenantKey,
            channelAccountId: account.channelAccountId,
          });
          continue;
        }
        try {
          if (activeConnections.has(account.id)) continue;
          logger.info({
            event: "whatsapp.web.session.connecting",
            tenantKey: account.tenantKey,
            channelAccountId: account.channelAccountId,
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
            tenantKey: account.tenantKey,
            channelAccountId: account.channelAccountId,
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
  let inboundCutoverAt: Date | null = null;
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
  const auth = await createBaileysAuthState({
    module: module as unknown as Parameters<typeof createBaileysAuthState>[0]["module"],
    store: createQueuedWebSessionAuthStore(params.prisma),
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
      channelAccountId: params.account.channelAccountId,
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
          channelAccountId: params.account.channelAccountId,
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
          channelAccountId: params.account.channelAccountId,
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
        tenantKey: params.account.tenantKey,
        channelAccountId: params.account.channelAccountId,
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
        account: params.account,
        event,
        authKeys: auth.state.keys as BaileysAuthKeysLike,
        cutoverAt: inboundCutoverAt,
      });
    },
    onMessagesUpdate: async (event) => {
      await handleWebSessionMessagesUpdate({
        prisma: params.prisma,
        account: params.account,
        event,
        authKeys: auth.state.keys as BaileysAuthKeysLike,
        cutoverAt: inboundCutoverAt,
      });
    },
    onSocketNode: async (node) => {
      logger.info({
        event: "whatsapp.web.socket.node",
        tenantKey: params.account.tenantKey,
        channelAccountId: params.account.channelAccountId,
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
        tenantKey: params.account.tenantKey,
        channelAccountId: params.account.channelAccountId,
        eventNames,
        messagesUpsertCount: Array.isArray((events as { "messages.upsert"?: { messages?: unknown[] } })["messages.upsert"]?.messages)
          ? (events as { "messages.upsert"?: { messages?: unknown[] } })["messages.upsert"]?.messages?.length
          : null,
        messagesUpdateCount: Array.isArray(messagesUpdate) ? messagesUpdate.length : null,
      });
    },
    onConnected: async () => {
      clearConnectionOpenTimer();
      inboundCutoverAt = new Date();
      clearWebSessionQrForRuntime(params.account.id);
      await auth.save();
      await markWebSessionRuntimeState({
        prisma: params.prisma,
        accountId: params.account.id,
        observedState: "CONNECTED",
        status: "connected",
      });
      await recordWebSessionWorkerEvent({
        prisma: params.prisma,
        account: params.account,
        requestSuffix: "connected",
        eventName: "whatsapp.web_session.connected",
        payloadJson: {
          channel: "whatsapp",
          provider: "web_session",
          channelAccountId: params.account.channelAccountId,
        },
      });
    },
    onDisconnected: async (reason) => {
      clearConnectionOpenTimer();
      if (closingAfterConnectionOpenTimeout) {
        await finishTerminal();
        return;
      }
      const classification = classifyWebSessionDisconnect(reason);
      clearWebSessionQrForRuntime(params.account.id);
      if (!await isWebSessionStillRequested({ prisma: params.prisma, accountId: params.account.id })) {
        await markWebSessionRuntimeState({
          prisma: params.prisma,
          accountId: params.account.id,
          observedState: "DISCONNECTED",
          status: "disconnected",
          errorCode: classification,
        });
        await finishTerminal();
        return;
      }
      await markWebSessionRuntimeState({
        prisma: params.prisma,
        accountId: params.account.id,
        observedState: classification === "reconnectable" ? "RECONNECTING" : "QR_REQUIRED",
        status: classification === "reconnectable" ? "pending" : "disconnected",
        errorCode: classification,
      });
      await recordWebSessionWorkerEvent({
        prisma: params.prisma,
        account: params.account,
        requestSuffix: "disconnected",
        eventName: classification === "reconnectable"
          ? "whatsapp.web_session.reconnecting"
          : "whatsapp.web_session.disconnected",
        payloadJson: {
          channel: "whatsapp",
          provider: "web_session",
          channelAccountId: params.account.channelAccountId,
          reason: classification,
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

async function handleWebSessionMessagesUpdate(params: {
  prisma: WorkerPrismaClient;
  account: EligibleWebSessionAccount;
  event: BaileysMessagesUpdateEvent;
  authKeys?: BaileysAuthKeysLike | null;
  cutoverAt?: Date | null;
}) {
  const messages = messagesFromUpdates(params.event);
  const updateSummary = summarizeMessageUpdates(params.event);
  logger.info({
    event: "whatsapp.web.inbound.update_received",
    tenantKey: params.account.tenantKey,
    channelAccountId: params.account.channelAccountId,
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
  });
}

async function handleWebSessionMessagesUpsert(params: {
  prisma: WorkerPrismaClient;
  account: EligibleWebSessionAccount;
  event: BaileysMessagesUpsertEvent;
  authKeys?: BaileysAuthKeysLike | null;
  cutoverAt?: Date | null;
}) {
  const messages = Array.isArray(params.event.messages) ? params.event.messages : [];
  logger.info({
    event: "whatsapp.web.inbound.upsert_received",
    tenantKey: params.account.tenantKey,
    channelAccountId: params.account.channelAccountId,
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
        channelAccountId: params.account.channelAccountId,
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
      const result = await ingestBaileysWebSessionMessage({
        prisma: params.prisma,
        clientId: params.account.clientId,
        tenantKey: params.account.tenantKey,
        channelAccountDbId: params.account.id,
        channelAccountId: params.account.channelAccountId,
        message: message as BaileysInboundMessageLike,
        resolvedSenderJid,
        cutoverAt: params.cutoverAt ?? null,
      });
      logger.info({
        event: "whatsapp.web.inbound.processed",
        tenantKey: params.account.tenantKey,
        channelAccountId: params.account.channelAccountId,
        action: result.action,
        reason: "reason" in result ? result.reason : null,
      });
    } catch (error) {
      logger.error({
        event: "whatsapp.web.inbound.process_failed",
        tenantKey: params.account.tenantKey,
        channelAccountId: params.account.channelAccountId,
        errorName: error instanceof Error ? error.name : "unknown_error",
        message: error instanceof Error ? error.message : "unknown_error",
      });
    }
  }
}
