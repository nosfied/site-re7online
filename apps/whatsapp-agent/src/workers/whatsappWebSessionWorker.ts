import { setTimeout as delay } from "node:timers/promises";
import { type PrismaClient } from "@prisma/client";
import { getPrisma } from "../db.js";
import { getFeatures } from "../features/clientFeatures.js";
import { logger } from "../logger/logger.js";
import {
  calculateWebSessionReconnectBackoff,
  isWebSessionConnectRequested,
  readWebSessionLifecycle,
} from "../web-session/webSessionLifecycle.js";
import { acquireWebSessionAdvisoryLock } from "../web-session/webSessionAdvisoryLock.js";

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
        logger.info({
          event: "whatsapp.web.session.connecting",
          tenantKey: account.tenantKey,
          channelAccountId: account.channelAccountId,
          observedState: account.lifecycle.observedState,
        });
      } finally {
        await lock.release();
      }
    }
    if (params.once) break;
    await delay(
      calculateWebSessionReconnectBackoff({ attempt: 0, baseMs: pollIntervalMs, maxMs: pollIntervalMs }),
      undefined,
      { signal: params.abortSignal }
    ).catch(() => undefined);
  } while (!params.abortSignal?.aborted);
}

if (process.argv[1]?.endsWith("whatsappWebSessionWorker.js")) {
  const abortController = new AbortController();
  process.once("SIGTERM", () => abortController.abort());
  process.once("SIGINT", () => abortController.abort());
  runWhatsAppWebSessionWorker({ abortSignal: abortController.signal }).catch((error) => {
    logger.error({
      event: "whatsapp.web.worker.error",
      message: error instanceof Error ? error.message : "unknown_error",
    });
    process.exitCode = 1;
  });
}
