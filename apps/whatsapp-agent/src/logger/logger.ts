import { AsyncLocalStorage } from "node:async_hooks";

type LogLevel = "debug" | "info" | "warn" | "error";
type LogContext = Record<string, unknown>;

const REDACT_VALUE = "[REDACTED]";
const MASKED_VALUE = "[MASKED]";
const REDACT_KEY_PARTS = [
  "authorization",
  "bearer",
  "cookie",
  "set-cookie",
  "token",
  "secret",
  "ciphertext",
  "password",
  "rawpayload",
  "raw_payload",
  "payloadraw",
  "payload_raw",
  "mediaurl",
  "media_url",
  "transcript",
];
const REDACT_KEY_EXACT = new Set([
  "code",
  "otp",
  "totp",
  "totpcode",
  "mfacode",
  "recoverycode",
  "recoverycodes",
]);
const MASK_KEY_EXACT = new Set(["email", "phone", "phonenumber", "waid", "externaluserref"]);
const logContextStorage = new AsyncLocalStorage<LogContext>();

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function shouldRedactKey(key: string) {
  const lower = key.toLowerCase();
  const normalized = normalizeKey(key);
  return REDACT_KEY_EXACT.has(normalized) || REDACT_KEY_PARTS.some((part) => lower.includes(part));
}

function shouldMaskKey(key: string) {
  return MASK_KEY_EXACT.has(normalizeKey(key));
}

function maskValue(value: unknown) {
  if (value == null) return value;
  const text = String(value);
  if (!text) return text;
  if (text.includes("@")) {
    const [local, domain] = text.split("@");
    return `${local.slice(0, 2)}***@${domain ?? "***"}`;
  }
  const digits = text.replace(/\D/g, "");
  if (digits.length >= 8) return `***${digits.slice(-4)}`;
  if (text.length > 6) return `${text.slice(0, 2)}***${text.slice(-2)}`;
  return MASKED_VALUE;
}

export function redactLogValue(value: unknown, key = ""): unknown {
  if (key && shouldRedactKey(key)) return REDACT_VALUE;
  if (key && shouldMaskKey(key)) return maskValue(value);
  if (Array.isArray(value)) return value.map((item) => redactLogValue(item));
  if (value && typeof value === "object") {
    if (value instanceof Date) return value.toISOString();
    const clone: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
      clone[entryKey] = redactLogValue(entryValue, entryKey);
    }
    return clone;
  }
  return value;
}

export function buildLogRecord(level: LogLevel, data: Record<string, unknown>) {
  const context = logContextStorage.getStore() ?? {};
  const merged = { ...context, ...data };
  const clientId = typeof merged.clientId === "string" ? merged.clientId : null;
  const tenantId = typeof merged.tenantId === "string" ? merged.tenantId : clientId;
  return redactLogValue({
    timestamp: new Date().toISOString(),
    level,
    event: typeof merged.event === "string" ? merged.event : "log.event",
    requestId: merged.requestId ?? null,
    correlationId: merged.correlationId ?? merged.requestId ?? null,
    tenantId,
    userId: merged.userId ?? null,
    channel: merged.channel ?? null,
    module: merged.module ?? null,
    durationMs: merged.durationMs ?? null,
    ...merged,
  }) as Record<string, unknown>;
}

function log(level: LogLevel, data: Record<string, unknown>) {
  const output = JSON.stringify(buildLogRecord(level, data));
  const writer = level === "debug" ? console.debug : console[level];
  writer(output);
}

export const logger = {
  debug: (data: Record<string, unknown>) => log("debug", data),
  info: (data: Record<string, unknown>) => log("info", data),
  warn: (data: Record<string, unknown>) => log("warn", data),
  error: (data: Record<string, unknown>) => log("error", data),
  withContext<T>(context: LogContext, fn: () => T): T {
    const current = logContextStorage.getStore() ?? {};
    return logContextStorage.run({ ...current, ...context }, fn);
  },
  updateContext(context: LogContext) {
    const current = logContextStorage.getStore();
    if (!current) return;
    Object.assign(current, context);
  },
  getContext(): LogContext {
    return { ...(logContextStorage.getStore() ?? {}) };
  },
};
