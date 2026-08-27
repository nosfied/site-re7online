import { type PrismaClient } from "@prisma/client";
import { getFeatures } from "../features/clientFeatures.js";
import { persistEvent } from "../db/persist.js";
import {
  DEFAULT_WEB_SESSION_LIFECYCLE,
  readWebSessionPrePairingOutboundState,
  readWebSessionLifecycle,
  writeWebSessionPrePairingOutboundMetadata,
} from "./webSessionLifecycle.js";
import {
  clearAllWebSessionAuthState,
  loadWebSessionAuthState,
  WEB_SESSION_AUTH_SECRET_KIND,
  WEB_SESSION_AUTH_STAGING_SECRET_KIND,
} from "./webSessionAuthStore.js";
import {
  clearWebSessionQrForRuntime,
  getWebSessionQrFromRuntime,
  webSessionMetadataPatch,
} from "./webSessionConnectionRuntime.js";
import {
  fingerprintWebSessionNumber,
  markWebSessionAuthorizationReleased,
  maskWebSessionNumber,
  resolveWebSessionAuthorization,
  saveWebSessionAuthorization,
} from "./webSessionAuthorization.js";
import {
  resolveHybridWhatsappIdentityStatus,
  resolveWhatsappPrimaryTransport,
  validateWebSessionNumberAgainstMeta,
} from "./hybridIdentity.js";

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

function isObservedWhatsappIdentity(value: string) {
  return /^\d{8,}$/.test(value);
}

function buildArchivedChannelAccountId(accountId: string, channelAccountId: string) {
  return `archived:${accountId}:${fingerprintWebSessionNumber(channelAccountId)}`;
}

export function resolveWebSessionPrePairingOutboundIntent(account: {
  metadata: unknown;
  outboundEnabled: boolean;
}) {
  const lifecycle = readWebSessionLifecycle(account.metadata);
  return lifecycle.lastConnectedAt ? account.outboundEnabled : true;
}

export async function getWebSessionAccount(params: {
  prisma: PrismaClient;
  clientId: string;
}) {
  const accounts = await params.prisma.channelAccount.findMany({
    where: {
      clientId: params.clientId,
      channel: WEB_SESSION_CHANNEL,
      provider: WEB_SESSION_PROVIDER,
      status: { not: "archived_duplicate" },
    },
    include: {
      secrets: {
        where: { secretKind: { in: [WEB_SESSION_AUTH_SECRET_KIND, WEB_SESSION_AUTH_STAGING_SECRET_KIND] } },
        select: { secretKind: true, status: true, secretCiphertext: true, updatedAt: true },
      },
    },
    orderBy: [{ updatedAt: "desc" }],
  });
  return accounts.sort((left, right) => {
    const leftApproved = left.secrets.some(
      (secret) => secret.secretKind === WEB_SESSION_AUTH_SECRET_KIND && secret.status === "configured" && secret.secretCiphertext
    );
    const rightApproved = right.secrets.some(
      (secret) => secret.secretKind === WEB_SESSION_AUTH_SECRET_KIND && secret.status === "configured" && secret.secretCiphertext
    );
    if (leftApproved !== rightApproved) return leftApproved ? -1 : 1;
    const leftRealIdentity = /^\d{8,}$/.test(left.channelAccountId);
    const rightRealIdentity = /^\d{8,}$/.test(right.channelAccountId);
    if (leftRealIdentity !== rightRealIdentity) return leftRealIdentity ? -1 : 1;
    const leftActive = left.runtimeEnabled || left.status === "connected" || left.status === "pending";
    const rightActive = right.runtimeEnabled || right.status === "connected" || right.status === "pending";
    if (leftActive !== rightActive) return leftActive ? -1 : 1;
    return right.updatedAt.getTime() - left.updatedAt.getTime();
  })[0] ?? null;
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
  const authorization = await resolveWebSessionAuthorization({ prisma: params.prisma, clientId: params.client.id });
  const approvedSecret = account?.secrets?.find((secret) => secret.secretKind === WEB_SESSION_AUTH_SECRET_KIND) ?? null;
  const stagingSecret = account?.secrets?.find((secret) => secret.secretKind === WEB_SESSION_AUTH_STAGING_SECRET_KIND) ?? null;
  const lifecycle = account ? readWebSessionLifecycle(account.metadata) : DEFAULT_WEB_SESSION_LIFECYCLE;
  const hybridIdentity = await resolveHybridWhatsappIdentityStatus({
    prisma: params.prisma,
    clientId: params.client.id,
  });
  const primaryTransport = await resolveWhatsappPrimaryTransport({
    prisma: params.prisma,
    clientId: params.client.id,
  });
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
      configured: Boolean(approvedSecret?.status === "configured" && approvedSecret.secretCiphertext),
      approvedConfigured: Boolean(approvedSecret?.status === "configured" && approvedSecret.secretCiphertext),
      stagingConfigured: Boolean(stagingSecret?.status === "configured" && stagingSecret.secretCiphertext),
      secretKind: WEB_SESSION_AUTH_SECRET_KIND,
      stagingSecretKind: WEB_SESSION_AUTH_STAGING_SECRET_KIND,
      updatedAt: approvedSecret?.updatedAt?.toISOString() ?? null,
      stagingUpdatedAt: stagingSecret?.updatedAt?.toISOString() ?? null,
    },
    authorization,
    hybridIdentity,
    primaryTransport,
    detectedNumber: account
      ? {
          masked: maskWebSessionNumber(account.channelAccountId),
          matchesAuthorized: Boolean(
            authorization.authorizedNumberCanonical &&
              authorization.authorizedNumberCanonical === account.channelAccountId
          ),
        }
      : null,
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

export async function authorizeWebSessionNumber(params: {
  prisma: PrismaClient;
  client: ScopedClient;
  actorUserId: string;
  requestId: string;
  number: string;
}) {
  const validation = await validateWebSessionNumberAgainstMeta({
    prisma: params.prisma,
    clientId: params.client.id,
    number: params.number,
  });
  if (!validation.ok) {
    return {
      ok: false as const,
      status: validation.status,
      code: validation.code,
      details: "metaNumberMasked" in validation
        ? {
            metaNumberMasked: validation.metaNumberMasked,
            webNumberMasked: validation.webNumberMasked,
          }
        : undefined,
    };
  }
  const result = await saveWebSessionAuthorization({
    prisma: params.prisma,
    clientId: params.client.id,
    actorUserId: params.actorUserId,
    number: params.number,
  });
  if (!result.ok) return { ok: false as const, status: 400, code: result.error };
  await persistEvent({
    clientId: params.client.id,
    requestId: `${params.requestId}:web-session-number-authorized`,
    eventName: "whatsapp.web.number.authorized",
    payloadJson: {
      actorUserId: params.actorUserId,
      channel: WEB_SESSION_CHANNEL,
      provider: WEB_SESSION_PROVIDER,
      number: {
        masked: result.authorization.authorizedNumberMasked,
        hash: fingerprintWebSessionNumber(result.authorization.authorizedNumberCanonical),
      },
    },
  });
  return { ok: true as const, status: await serializeWebSessionStatus({ prisma: params.prisma, client: params.client }) };
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
  const authorization = await resolveWebSessionAuthorization({ prisma: params.prisma, clientId: params.client.id });
  if (
    !authorization.authorizedNumberCanonical ||
    authorization.status === "RELEASED" ||
    authorization.status === "INVALIDATED_BY_META_IDENTITY_CHANGE"
  ) {
    return { ok: false as const, status: 409, code: "web_session_number_not_authorized" };
  }
  const validation = await validateWebSessionNumberAgainstMeta({
    prisma: params.prisma,
    clientId: params.client.id,
    number: authorization.authorizedNumberCanonical,
  });
  if (!validation.ok) {
    return { ok: false as const, status: validation.status, code: validation.code };
  }
  const metadata = webSessionMetadataPatch(account.metadata, {
    desiredState: "CONNECTED",
    observedState: "CONNECTING",
    authorizationSnapshot: {
      authorizedNumberCanonical: authorization.authorizedNumberCanonical,
      authorizedNumberMasked: authorization.authorizedNumberMasked,
      authorizedNumberHash: fingerprintWebSessionNumber(authorization.authorizedNumberCanonical),
      status: authorization.status,
      capturedAt: new Date().toISOString(),
    },
  });
  const prePairingOutbound = readWebSessionPrePairingOutboundState(account.metadata);
  const outboundIntent = resolveWebSessionPrePairingOutboundIntent(account);
  const metadataWithOutboundSnapshot = prePairingOutbound
    ? metadata
    : writeWebSessionPrePairingOutboundMetadata(metadata, {
      enabled: outboundIntent,
      capturedAt: new Date().toISOString(),
    });
  await params.prisma.channelAccount.update({
    where: { id: account.id },
    data: {
      enabled: true,
      runtimeEnabled: true,
      inboundPersistenceEnabled: true,
      outboundEnabled: false,
      status: "pending",
      metadata: metadataWithOutboundSnapshot,
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

export async function releaseWebSessionNumber(params: {
  prisma: PrismaClient;
  client: ScopedClient;
  actorUserId: string;
  requestId: string;
}) {
  const currentAuthorization = await resolveWebSessionAuthorization({ prisma: params.prisma, clientId: params.client.id });
  const accounts = await params.prisma.channelAccount.findMany({
    where: {
      clientId: params.client.id,
      channel: WEB_SESSION_CHANNEL,
      provider: WEB_SESSION_PROVIDER,
      status: { not: "archived_duplicate" },
    },
    select: { id: true, channelAccountId: true, metadata: true },
  });
  for (const item of accounts) {
    clearWebSessionQrForRuntime(item.id);
    await clearAllWebSessionAuthState({
      prisma: params.prisma,
      tenantKey: params.client.clientKey,
      channelAccountId: item.channelAccountId,
    });
    const archivedChannelAccountId = isObservedWhatsappIdentity(item.channelAccountId)
      ? buildArchivedChannelAccountId(item.id, item.channelAccountId)
      : item.channelAccountId;
    await params.prisma.channelAccount.update({
      where: { id: item.id },
      data: {
        channelAccountId: archivedChannelAccountId,
        runtimeEnabled: false,
        inboundPersistenceEnabled: false,
        outboundEnabled: false,
        status: "disabled",
        metadata: webSessionMetadataPatch(item.metadata, {
          desiredState: "DISCONNECTED",
          observedState: "DISCONNECTED",
          lastErrorCode: null,
          reconnectCount: 0,
        }),
      },
    });
    if (archivedChannelAccountId !== item.channelAccountId) {
      await persistEvent({
        clientId: params.client.id,
        requestId: `${params.requestId}:web-session-identity-archived:${item.id}`,
        eventName: "whatsapp.web.identity.released_archived",
        payloadJson: {
          actorUserId: params.actorUserId,
          channel: WEB_SESSION_CHANNEL,
          provider: WEB_SESSION_PROVIDER,
          channelAccountId: item.id,
          previousNumberMasked: maskWebSessionNumber(item.channelAccountId),
          previousNumberHash: fingerprintWebSessionNumber(item.channelAccountId),
        },
      });
    }
  }
  await markWebSessionAuthorizationReleased({
    prisma: params.prisma,
    clientId: params.client.id,
    actorUserId: params.actorUserId,
  });
  await persistEvent({
    clientId: params.client.id,
    requestId: `${params.requestId}:web-session-number-released`,
    eventName: "whatsapp.web.number.released",
    payloadJson: {
      actorUserId: params.actorUserId,
      channel: WEB_SESSION_CHANNEL,
      provider: WEB_SESSION_PROVIDER,
      number: {
        masked: currentAuthorization.authorizedNumberMasked,
        hash: fingerprintWebSessionNumber(currentAuthorization.authorizedNumberCanonical),
      },
      accountReleased: accounts.length > 0,
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
  await clearAllWebSessionAuthState({
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
