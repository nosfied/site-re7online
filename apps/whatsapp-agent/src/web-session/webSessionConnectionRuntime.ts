import { Prisma, type PrismaClient } from "@prisma/client";
import { createWebSessionQrMemoryStore } from "./qrMemoryStore.js";
import {
  readWebSessionPrePairingOutboundState,
  writeWebSessionLifecycleMetadata,
  writeWebSessionPrePairingOutboundMetadata,
  type WebSessionObservedState,
} from "./webSessionLifecycle.js";

const qrStore = createWebSessionQrMemoryStore();

function nowIso() {
  return new Date().toISOString();
}

export function webSessionMetadataPatch(metadata: unknown, patch: {
  desiredState?: "CONNECTED" | "DISCONNECTED";
  observedState?: WebSessionObservedState;
  lastErrorCode?: string | null;
  reconnectCount?: number;
  authorizationSnapshot?: {
    authorizedNumberCanonical: string;
    authorizedNumberMasked: string | null;
    authorizedNumberHash: string | null;
    status: string;
    capturedAt: string;
  };
}) {
  const timestamp = nowIso();
  const lifecyclePatch: Parameters<typeof writeWebSessionLifecycleMetadata>[1] = {};
  if (patch.desiredState) lifecyclePatch.desiredState = patch.desiredState;
  if (patch.observedState) lifecyclePatch.observedState = patch.observedState;
  if (patch.lastErrorCode !== undefined) {
    lifecyclePatch.lastErrorCode = patch.lastErrorCode;
    lifecyclePatch.lastErrorAt = patch.lastErrorCode ? timestamp : null;
  }
  if (patch.reconnectCount !== undefined) lifecyclePatch.reconnectCount = patch.reconnectCount;
  if (patch.observedState === "CONNECTED") {
    lifecyclePatch.lastConnectedAt = timestamp;
    lifecyclePatch.lastErrorCode = null;
    lifecyclePatch.lastErrorAt = null;
  }
  if (
    patch.observedState === "DISCONNECTED" ||
    patch.observedState === "ERROR" ||
    patch.observedState === "QR_REQUIRED" ||
    patch.observedState === "RECONNECTING"
  ) {
    lifecyclePatch.lastDisconnectedAt = timestamp;
  }
  const next = writeWebSessionLifecycleMetadata(metadata, lifecyclePatch);
  if (patch.authorizationSnapshot) {
    const currentWebSession =
      next.webSession && typeof next.webSession === "object" && !Array.isArray(next.webSession)
        ? next.webSession
        : {};
    return {
      ...next,
      webSession: {
        ...currentWebSession,
        authorizationSnapshot: patch.authorizationSnapshot,
      },
    };
  }
  return next;
}

export function setWebSessionQrForRuntime(params: {
  accountId: string;
  qr: string;
}) {
  qrStore.set(params.accountId, params.qr);
}

export function getWebSessionQrFromRuntime(accountId: string) {
  return qrStore.get(accountId);
}

export function clearWebSessionQrForRuntime(accountId: string) {
  qrStore.clear(accountId);
}

export async function markWebSessionRuntimeState(params: {
  prisma: PrismaClient;
  accountId: string;
  observedState: WebSessionObservedState;
  status?: string;
  errorCode?: string | null;
  reconnectCount?: number;
}) {
  const account = await params.prisma.channelAccount.findUnique({
    where: { id: params.accountId },
    select: { id: true, metadata: true, outboundEnabled: true },
  });
  if (!account) return;
  const patchedMetadata = webSessionMetadataPatch(account.metadata, {
    observedState: params.observedState,
    lastErrorCode: params.errorCode,
    reconnectCount: params.reconnectCount,
  });
  const prePairingOutbound = params.observedState === "CONNECTED"
    ? readWebSessionPrePairingOutboundState(account.metadata)
    : null;
  const metadata = prePairingOutbound
    ? writeWebSessionPrePairingOutboundMetadata(patchedMetadata, null)
    : patchedMetadata;
  await params.prisma.channelAccount.update({
    where: { id: account.id },
    data: {
      ...(params.status ? { status: params.status } : {}),
      ...(prePairingOutbound && account.outboundEnabled === false
        ? { outboundEnabled: prePairingOutbound.enabled }
        : {}),
      metadata: metadata as Prisma.InputJsonObject,
    },
  });
}
