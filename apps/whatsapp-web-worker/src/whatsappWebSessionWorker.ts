import { setTimeout as delay } from "node:timers/promises";
import { type PrismaClient } from "@prisma/client";
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
import { createBaileysAuthState } from "./web-session/baileysAuthState.js";
import { createBaileysSocket } from "./web-session/baileysSocketFactory.js";

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
  release: () => Promise<void>;
};

const activeConnections = new Map<string, ActiveConnection>();

function eventRequestId(account: EligibleWebSessionAccount, eventName: string) {
  return `web-session-worker:${account.id}:${eventName}:${Date.now()}`;
}

async function recordWebSessionWorkerEvent(params: {
  prisma: PrismaClient;
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
        payloadJson: params.payloadJson,
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

export function isEligibleWebSessionAccount(account: ChannelAccountRecord) {
  if (account.client.status !== "ACTIVE") return false;
  if (getFeatures(account.client).whatsappWebSession !== true) return false;
  if (account.channel !== "whatsapp" || account.provider !== "web_session") return false;
  if (!account.enabled || !account.runtimeEnabled) return false;
  if (account.status !== "connected" && account.status !== "pending") return false;
  if (!isWebSessionConnectRequested(account.metadata)) return false;
  return true;
}

export async function listEligibleWebSessionAccounts(prisma: PrismaClient) {
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

export async function runWhatsAppWebSessionWorker(params: {
  prisma?: PrismaClient;
  once?: boolean;
  pollIntervalMs?: number;
  abortSignal?: AbortSignal;
} = {}) {
  const prisma = params.prisma ?? getPrisma();
  const pollIntervalMs = params.pollIntervalMs ?? 15_000;
  logger.info({ event: "whatsapp.web.worker.started" });

  do {
    const accounts = await listEligibleWebSessionAccounts(prisma);
    if (accounts.length === 0) {
      logger.info({ event: "whatsapp.web.worker.idle", eligibleAccounts: 0 });
    }
    for (const account of accounts) {
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
  prisma: PrismaClient;
  account: EligibleWebSessionAccount;
  onTerminal: () => Promise<void>;
}) {
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
  createBaileysSocket({
    authState: auth.state,
    onQr: async (qr) => {
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
    onConnected: async () => {
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
      const classification = classifyWebSessionDisconnect(reason);
      clearWebSessionQrForRuntime(params.account.id);
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
      await params.onTerminal();
    },
  }).catch(async (error) => {
    await markWebSessionRuntimeState({
      prisma: params.prisma,
      accountId: params.account.id,
      observedState: "ERROR",
      status: "error",
      errorCode: error instanceof Error ? error.message : "unknown_error",
    });
    await params.onTerminal();
  });
}
