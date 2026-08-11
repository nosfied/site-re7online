import { Prisma, type PrismaClient } from "@prisma/client";
import { createWebSessionQrMemoryStore } from "./qrMemoryStore.js";
import {
  writeWebSessionLifecycleMetadata,
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
  if (patch.observedState === "DISCONNECTED" || patch.observedState === "ERROR") {
    lifecyclePatch.lastDisconnectedAt = timestamp;
  }
  return writeWebSessionLifecycleMetadata(metadata, lifecyclePatch);
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
}) {
  const account = await params.prisma.channelAccount.findUnique({
    where: { id: params.accountId },
    select: { id: true, metadata: true },
  });
  if (!account) return;
  await params.prisma.channelAccount.update({
    where: { id: account.id },
    data: {
      ...(params.status ? { status: params.status } : {}),
      metadata: webSessionMetadataPatch(account.metadata, {
        observedState: params.observedState,
        lastErrorCode: params.errorCode,
      }) as Prisma.InputJsonObject,
    },
  });
}
