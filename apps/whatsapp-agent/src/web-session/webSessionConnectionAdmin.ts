import { type PrismaClient } from "@prisma/client";
import { getFeatures } from "../features/clientFeatures.js";
import { persistEvent } from "../db/persist.js";
import {
  DEFAULT_WEB_SESSION_LIFECYCLE,
  readWebSessionLifecycle,
} from "./webSessionLifecycle.js";
import {
  clearWebSessionAuthState,
  loadWebSessionAuthState,
  WEB_SESSION_AUTH_SECRET_KIND,
} from "./webSessionAuthStore.js";
import {
  clearWebSessionQrForRuntime,
  getWebSessionQrFromRuntime,
  webSessionMetadataPatch,
} from "./webSessionConnectionRuntime.js";

export const WEB_SESSION_CHANNEL = "whatsapp";
export const WEB_SESSION_PROVIDER = "web_session";
export const DEFAULT_WEB_SESSION_ACCOUNT_ID = "web-session-default";

type ScopedClient = {
  id: string;
  clientKey: string;
  status: string;
  features: unknown;
  profile: unknown;
};

function sanitizeDisplayName(value: unknown) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, 80) || null
    : null;
}

function sanitizeChannelAccountId(value: unknown) {
  if (typeof value !== "string") return DEFAULT_WEB_SESSION_ACCOUNT_ID;
  return value.trim().replace(/[^a-zA-Z0-9_.:-]/g, "").slice(0, 120) || DEFAULT_WEB_SESSION_ACCOUNT_ID;
}

export async function getWebSessionAccount(params: {
  prisma: PrismaClient;
  clientId: string;
}) {
  return params.prisma.channelAccount.findFirst({
    where: {
      clientId: params.clientId,
      channel: WEB_SESSION_CHANNEL,
      provider: WEB_SESSION_PROVIDER,
    },
    include: {
      secrets: {
        where: { secretKind: WEB_SESSION_AUTH_SECRET_KIND },
        select: { status: true, secretCiphertext: true, updatedAt: true },
      },
    },
    orderBy: [{ updatedAt: "desc" }],
  });
}

async function readWorkerQr(accountId: string) {
  const baseUrl = process.env.WHATSAPP_WEB_WORKER_CONTROL_URL?.trim();
  if (!baseUrl) return null;
  const token = process.env.WHATSAPP_WEB_WORKER_CONTROL_TOKEN?.trim();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/web-session/accounts/${encodeURIComponent(accountId)}/qr`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = await response.json() as { qr?: unknown };
    return typeof body.qr === "string" && body.qr ? body.qr : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function serializeWebSessionStatus(params: {
  prisma: PrismaClient;
  client: ScopedClient;
}) {
  const account = await getWebSessionAccount({ prisma: params.prisma, clientId: params.client.id });
  const secret = account?.secrets?.[0] ?? null;
  const lifecycle = account ? readWebSessionLifecycle(account.metadata) : DEFAULT_WEB_SESSION_LIFECYCLE;
  return {
    configured: Boolean(account),
    featureEnabled: getFeatures(params.client).whatsappWebSession === true,
    account: account
      ? {
          id: account.id,
          channelAccountId: account.channelAccountId,
          displayName: account.displayName,
          channel: account.channel,
          provider: account.provider,
          enabled: account.enabled,
          runtimeEnabled: account.runtimeEnabled,
          inboundPersistenceEnabled: account.inboundPersistenceEnabled,
          outboundEnabled: account.outboundEnabled,
          status: account.status,
          tokenStatus: account.tokenStatus,
          lastUpdatedAt: account.updatedAt.toISOString(),
        }
      : null,
    lifecycle,
    authState: {
      configured: Boolean(secret?.status === "configured" && secret.secretCiphertext),
      secretKind: WEB_SESSION_AUTH_SECRET_KIND,
      updatedAt: secret?.updatedAt?.toISOString() ?? null,
    },
    qr: {
      available: account ? getWebSessionQrFromRuntime(account.id) !== null : false,
      ttlMs: 60_000,
    },
  };
}

export async function prepareWebSessionAccount(params: {
  prisma: PrismaClient;
  client: ScopedClient;
  actorUserId: string;
  requestId: string;
  input?: Record<string, unknown>;
}) {
  const channelAccountId = sanitizeChannelAccountId(params.input?.channelAccountId);
  const displayName = sanitizeDisplayName(params.input?.displayName) ?? "WhatsApp Business";
  const account = await params.prisma.channelAccount.upsert({
    where: {
      clientId_provider_channel_channelAccountId: {
        clientId: params.client.id,
        provider: WEB_SESSION_PROVIDER,
        channel: WEB_SESSION_CHANNEL,
        channelAccountId,
      },
    },
    create: {
      clientId: params.client.id,
      channel: WEB_SESSION_CHANNEL,
      provider: WEB_SESSION_PROVIDER,
      channelAccountId,
      displayName,
      enabled: true,
      runtimeEnabled: false,
      inboundPersistenceEnabled: false,
      outboundEnabled: false,
      automationEnabled: false,
      aiEnabled: false,
      handoffEnabled: false,
      status: "pending",
      tokenStatus: "not_required",
      metadata: webSessionMetadataPatch(null, {
        desiredState: "DISCONNECTED",
        observedState: "DISCONNECTED",
      }),
    },
    update: {
      displayName,
      enabled: true,
      inboundPersistenceEnabled: false,
      outboundEnabled: false,
      automationEnabled: false,
      aiEnabled: false,
      handoffEnabled: false,
      tokenStatus: "not_required",
    },
  });
  await persistEvent({
    clientId: params.client.id,
    requestId: `${params.requestId}:web-session-created:${account.id}`,
    eventName: "whatsapp.web_session.created",
    payloadJson: {
      actorUserId: params.actorUserId,
      channel: WEB_SESSION_CHANNEL,
      provider: WEB_SESSION_PROVIDER,
      channelAccountId: account.channelAccountId,
    },
  });
  return serializeWebSessionStatus({ prisma: params.prisma, client: params.client });
}

export async function requestWebSessionConnect(params: {
  prisma: PrismaClient;
  client: ScopedClient;
  actorUserId: string;
  requestId: string;
}) {
  const account = await getWebSessionAccount({ prisma: params.prisma, clientId: params.client.id });
  if (!account) return { ok: false as const, status: 404, code: "web_session_account_not_found" };
  if (getFeatures(params.client).whatsappWebSession !== true) {
    return { ok: false as const, status: 403, code: "web_session_feature_disabled" };
  }
  const metadata = webSessionMetadataPatch(account.metadata, {
    desiredState: "CONNECTED",
    observedState: "CONNECTING",
  });
  await params.prisma.channelAccount.update({
    where: { id: account.id },
    data: {
      enabled: true,
      runtimeEnabled: true,
      inboundPersistenceEnabled: true,
      outboundEnabled: false,
      status: "pending",
      metadata,
    },
  });
  await persistEvent({
    clientId: params.client.id,
    requestId: `${params.requestId}:web-session-qr-requested:${account.id}`,
    eventName: "whatsapp.web_session.qr_requested",
    payloadJson: {
      actorUserId: params.actorUserId,
      channel: WEB_SESSION_CHANNEL,
      provider: WEB_SESSION_PROVIDER,
      channelAccountId: account.channelAccountId,
    },
  });
  return { ok: true as const, status: await serializeWebSessionStatus({ prisma: params.prisma, client: params.client }) };
}

export async function disconnectWebSession(params: {
  prisma: PrismaClient;
  client: ScopedClient;
  actorUserId: string;
  requestId: string;
}) {
  const account = await getWebSessionAccount({ prisma: params.prisma, clientId: params.client.id });
  if (!account) return { ok: false as const, status: 404, code: "web_session_account_not_found" };
  clearWebSessionQrForRuntime(account.id);
  await params.prisma.channelAccount.update({
    where: { id: account.id },
    data: {
      runtimeEnabled: false,
      status: "disconnected",
      metadata: webSessionMetadataPatch(account.metadata, {
        desiredState: "DISCONNECTED",
        observedState: "DISCONNECTED",
      }),
    },
  });
  await persistEvent({
    clientId: params.client.id,
    requestId: `${params.requestId}:web-session-disconnected:${account.id}`,
    eventName: "whatsapp.web_session.disconnected",
    payloadJson: {
      actorUserId: params.actorUserId,
      channel: WEB_SESSION_CHANNEL,
      provider: WEB_SESSION_PROVIDER,
      channelAccountId: account.channelAccountId,
      reason: "admin_disconnect",
    },
  });
  return { ok: true as const, status: await serializeWebSessionStatus({ prisma: params.prisma, client: params.client }) };
}

export async function resetWebSession(params: {
  prisma: PrismaClient;
  client: ScopedClient;
  actorUserId: string;
  requestId: string;
}) {
  const account = await getWebSessionAccount({ prisma: params.prisma, clientId: params.client.id });
  if (!account) return { ok: false as const, status: 404, code: "web_session_account_not_found" };
  clearWebSessionQrForRuntime(account.id);
  await clearWebSessionAuthState({
    prisma: params.prisma,
    tenantKey: params.client.clientKey,
    channelAccountId: account.channelAccountId,
  });
  await params.prisma.channelAccount.update({
    where: { id: account.id },
    data: {
      runtimeEnabled: false,
      inboundPersistenceEnabled: false,
      outboundEnabled: false,
      status: "pending",
      metadata: webSessionMetadataPatch(account.metadata, {
        desiredState: "DISCONNECTED",
        observedState: "DISCONNECTED",
        lastErrorCode: null,
        reconnectCount: 0,
      }),
    },
  });
  await persistEvent({
    clientId: params.client.id,
    requestId: `${params.requestId}:web-session-reset:${account.id}`,
    eventName: "whatsapp.web_session.reset",
    payloadJson: {
      actorUserId: params.actorUserId,
      channel: WEB_SESSION_CHANNEL,
      provider: WEB_SESSION_PROVIDER,
      channelAccountId: account.channelAccountId,
    },
  });
  return { ok: true as const, status: await serializeWebSessionStatus({ prisma: params.prisma, client: params.client }) };
}

export async function getWebSessionQr(params: {
  prisma: PrismaClient;
  client: ScopedClient;
}) {
  const account = await getWebSessionAccount({ prisma: params.prisma, clientId: params.client.id });
  if (!account) return { ok: false as const, status: 404, code: "web_session_account_not_found" };
  const qr = getWebSessionQrFromRuntime(account.id) ?? await readWorkerQr(account.id);
  return {
    ok: true as const,
    qr,
    expired: qr === null && readWebSessionLifecycle(account.metadata).observedState === "QR_REQUIRED",
    lifecycle: readWebSessionLifecycle(account.metadata),
  };
}

export async function hasWebSessionAuthState(params: {
  prisma: PrismaClient;
  tenantKey: string;
  channelAccountId: string;
}) {
  const result = await loadWebSessionAuthState(params);
  return result.ok && result.state !== null;
}
