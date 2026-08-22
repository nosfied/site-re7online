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

export type WebSessionPrePairingOutboundState = {
  enabled: boolean;
  capturedAt: string;
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

function normalizePrePairingOutboundState(value: unknown): WebSessionPrePairingOutboundState | null {
  const record = asRecord(value);
  if (typeof record.enabled !== "boolean") return null;
  const capturedAt = normalizeIso(record.capturedAt);
  if (!capturedAt) return null;
  return { enabled: record.enabled, capturedAt };
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

export function readWebSessionPrePairingOutboundState(metadata: unknown): WebSessionPrePairingOutboundState | null {
  const webSession = asRecord(asRecord(metadata).webSession);
  return normalizePrePairingOutboundState(webSession.prePairingOutboundEnabled);
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

export function writeWebSessionPrePairingOutboundMetadata(
  metadata: unknown,
  snapshot: WebSessionPrePairingOutboundState | null
): Prisma.InputJsonObject {
  const base = asRecord(metadata);
  const { qr: _qr, pairingCode: _pairingCode, ...existingWebSession } = asRecord(base.webSession);
  const nextWebSession = { ...existingWebSession };
  if (snapshot) {
    nextWebSession.prePairingOutboundEnabled = {
      enabled: snapshot.enabled,
      capturedAt: snapshot.capturedAt,
    };
  } else {
    delete nextWebSession.prePairingOutboundEnabled;
  }
  return {
    ...base,
    webSession: nextWebSession as Prisma.InputJsonObject,
  };
}

export function isWebSessionConnectRequested(metadata: unknown) {
  return readWebSessionLifecycle(metadata).desiredState === "CONNECTED";
}

export type WebSessionDisconnectClassification = "reconnectable" | "qr_required" | "terminal_manual";

export type WebSessionDisconnectInfo = {
  statusCode: number | null;
  boomStatusCode: number | null;
  reasonCode: string | null;
  classification: WebSessionDisconnectClassification;
  classificationSource: string;
};

function disconnectReasonText(reason: unknown): string {
  if (typeof reason === "string") return reason;
  if (reason instanceof Error) return reason.message;
  if (!reason || typeof reason !== "object") return "";
  const record = reason as Record<string, unknown>;
  return [
    record.message,
    record.reason,
    record.error,
    record.statusCode,
    disconnectReasonText(record.lastDisconnect),
    disconnectReasonText(record.error),
    disconnectReasonText(record.output),
  ].filter((value) => value !== undefined && value !== null).join(" ");
}

function getNestedRecord(value: unknown, key: string): Record<string, unknown> {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const nested = record[key];
  return nested && typeof nested === "object" && !Array.isArray(nested)
    ? nested as Record<string, unknown>
    : {};
}

function normalizeStatusCode(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function extractDisconnectStatusCode(reason: unknown): number | null {
  if (!reason || typeof reason !== "object") return null;
  const record = reason as Record<string, unknown>;
  return normalizeStatusCode(record.statusCode) ??
    normalizeStatusCode(record.status) ??
    normalizeStatusCode(getNestedRecord(reason, "output").statusCode) ??
    normalizeStatusCode(getNestedRecord(reason, "output").status) ??
    normalizeStatusCode(getNestedRecord(record.error, "output").statusCode) ??
    normalizeStatusCode(getNestedRecord(record.lastDisconnect, "error").statusCode) ??
    normalizeStatusCode(getNestedRecord(getNestedRecord(record.lastDisconnect, "error"), "output").statusCode);
}

function extractBoomOutputStatusCode(reason: unknown): number | null {
  if (!reason || typeof reason !== "object") return null;
  const record = reason as Record<string, unknown>;
  return normalizeStatusCode(getNestedRecord(reason, "output").statusCode) ??
    normalizeStatusCode(getNestedRecord(record.error, "output").statusCode) ??
    normalizeStatusCode(getNestedRecord(getNestedRecord(record.lastDisconnect, "error"), "output").statusCode);
}

function sanitizeReasonCode(value: unknown) {
  if (typeof value !== "string") return null;
  return value.trim().replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 80) || null;
}

function extractExplicitReasonCode(reason: unknown): string | null {
  if (typeof reason === "string") return sanitizeReasonCode(reason);
  if (reason instanceof Error) return sanitizeReasonCode(reason.message);
  if (!reason || typeof reason !== "object") return null;
  const record = reason as Record<string, unknown>;
  return sanitizeReasonCode(record.reason) ??
    sanitizeReasonCode(record.code) ??
    sanitizeReasonCode(record.name) ??
    sanitizeReasonCode(record.message) ??
    extractExplicitReasonCode(record.error) ??
    extractExplicitReasonCode(record.lastDisconnect);
}

function classifyByDisconnectStatusCode(statusCode: number): WebSessionDisconnectClassification | null {
  // @whiskeysockets/baileys@7.0.0-rc13 DisconnectReason:
  // 408 timedOut/connectionLost, 428 connectionClosed, 503 unavailableService, 515 restartRequired.
  if (statusCode === 408 || statusCode === 428 || statusCode === 503 || statusCode === 515) return "reconnectable";
  // 401 loggedOut, 403 forbidden, 411 multideviceMismatch, 440 connectionReplaced, 500 badSession.
  if (statusCode === 401 || statusCode === 403 || statusCode === 411 || statusCode === 440 || statusCode === 500) return "qr_required";
  return null;
}

export function extractWebSessionDisconnectInfo(reason: unknown): WebSessionDisconnectInfo {
  const normalized = disconnectReasonText(reason).toLowerCase();
  const statusCode = extractDisconnectStatusCode(reason);
  const boomStatusCode = extractBoomOutputStatusCode(reason);
  const explicitReasonCode = extractExplicitReasonCode(reason);
  if (
    normalized.includes("logout") ||
    normalized.includes("logged_out") ||
    normalized.includes("invalid") ||
    normalized.includes("401")
  ) {
    return {
      statusCode,
      boomStatusCode,
      reasonCode: explicitReasonCode ?? (statusCode ? `baileys_${statusCode}` : "logged_out"),
      classification: "qr_required",
      classificationSource: "reason_text",
    };
  }
  if (
    normalized.includes("manual") ||
    normalized.includes("disabled") ||
    normalized.includes("admin_disconnect")
  ) {
    return {
      statusCode,
      boomStatusCode,
      reasonCode: explicitReasonCode ?? "admin_disconnect",
      classification: "terminal_manual",
      classificationSource: "reason_text",
    };
  }
  if (statusCode !== null) {
    const classification = classifyByDisconnectStatusCode(statusCode);
    if (classification) {
      return {
        statusCode,
        boomStatusCode,
        reasonCode: explicitReasonCode ?? `baileys_${statusCode}`,
        classification,
        classificationSource: "status_code",
      };
    }
  }
  return {
    statusCode,
    boomStatusCode,
    reasonCode: explicitReasonCode ?? (statusCode ? `baileys_${statusCode}` : "unknown_disconnect"),
    classification: "reconnectable",
    classificationSource: "default",
  };
}

export function classifyWebSessionDisconnect(reason: unknown): WebSessionDisconnectClassification {
  return extractWebSessionDisconnectInfo(reason).classification;
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
