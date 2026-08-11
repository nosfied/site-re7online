import { Prisma } from "@prisma/client";

export type WebSessionDesiredState = "DISCONNECTED" | "CONNECTED";
export type WebSessionObservedState =
  | "DISCONNECTED"
  | "QR_REQUIRED"
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING"
  | "ERROR";

export type WebSessionLifecycleState = {
  desiredState: WebSessionDesiredState;
  observedState: WebSessionObservedState;
  lastConnectedAt: string | null;
  lastDisconnectedAt: string | null;
  lastErrorCode: string | null;
  lastErrorAt: string | null;
  reconnectCount: number;
};

export type WebSessionBackoffInput = {
  attempt: number;
  baseMs?: number;
  maxMs?: number;
  jitterRatio?: number;
  random?: () => number;
};

export const DEFAULT_WEB_SESSION_LIFECYCLE: WebSessionLifecycleState = {
  desiredState: "DISCONNECTED",
  observedState: "DISCONNECTED",
  lastConnectedAt: null,
  lastDisconnectedAt: null,
  lastErrorCode: null,
  lastErrorAt: null,
  reconnectCount: 0,
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeIso(value: unknown) {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function normalizeDesiredState(value: unknown): WebSessionDesiredState {
  return value === "CONNECTED" ? "CONNECTED" : "DISCONNECTED";
}

function normalizeObservedState(value: unknown): WebSessionObservedState {
  return value === "QR_REQUIRED" ||
    value === "CONNECTING" ||
    value === "CONNECTED" ||
    value === "RECONNECTING" ||
    value === "ERROR"
    ? value
    : "DISCONNECTED";
}

function normalizeErrorCode(value: unknown) {
  return typeof value === "string"
    ? value.trim().replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 80) || null
    : null;
}

function normalizeReconnectCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(Math.floor(value), 1000)
    : 0;
}

export function readWebSessionLifecycle(metadata: unknown): WebSessionLifecycleState {
  const webSession = asRecord(asRecord(metadata).webSession);
  return {
    desiredState: normalizeDesiredState(webSession.desiredState),
    observedState: normalizeObservedState(webSession.observedState),
    lastConnectedAt: normalizeIso(webSession.lastConnectedAt),
    lastDisconnectedAt: normalizeIso(webSession.lastDisconnectedAt),
    lastErrorCode: normalizeErrorCode(webSession.lastErrorCode),
    lastErrorAt: normalizeIso(webSession.lastErrorAt),
    reconnectCount: normalizeReconnectCount(webSession.reconnectCount),
  };
}

export function writeWebSessionLifecycleMetadata(
  metadata: unknown,
  patch: Partial<WebSessionLifecycleState>
): Prisma.InputJsonObject {
  const current = readWebSessionLifecycle(metadata);
  const base = asRecord(metadata);
  const { qr: _qr, pairingCode: _pairingCode, ...existingWebSession } = asRecord(base.webSession);
  const next: WebSessionLifecycleState = {
    ...current,
    ...patch,
  };
  return {
    ...base,
    webSession: {
      ...existingWebSession,
      ...next,
    },
  };
}

export function isWebSessionConnectRequested(metadata: unknown) {
  return readWebSessionLifecycle(metadata).desiredState === "CONNECTED";
}

export function classifyWebSessionDisconnect(reason: unknown): "reconnectable" | "qr_required" | "terminal_manual" {
  const normalized = typeof reason === "string" ? reason.toLowerCase() : "";
  if (
    normalized.includes("logout") ||
    normalized.includes("logged_out") ||
    normalized.includes("invalid") ||
    normalized.includes("401")
  ) {
    return "qr_required";
  }
  if (normalized.includes("manual") || normalized.includes("disabled")) {
    return "terminal_manual";
  }
  return "reconnectable";
}

export function calculateWebSessionReconnectBackoff(input: WebSessionBackoffInput) {
  const attempt = Math.max(0, Math.floor(input.attempt));
  const baseMs = input.baseMs ?? 1000;
  const maxMs = input.maxMs ?? 60_000;
  const jitterRatio = Math.max(0, Math.min(input.jitterRatio ?? 0.25, 1));
  const rawDelay = Math.min(maxMs, baseMs * 2 ** attempt);
  const jitter = rawDelay * jitterRatio * ((input.random ?? Math.random)() - 0.5) * 2;
  return Math.max(baseMs, Math.round(Math.min(maxMs, rawDelay + jitter)));
}
