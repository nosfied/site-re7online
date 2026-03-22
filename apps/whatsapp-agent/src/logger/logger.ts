import { AsyncLocalStorage } from "node:async_hooks";

type LogLevel = "info" | "warn" | "error";
type LogContext = Record<string, unknown>;

const REDACT_KEYS = ["token", "authorization"];
const logContextStorage = new AsyncLocalStorage<LogContext>();

function redact(obj: Record<string, unknown>) {
  const clone: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lower = key.toLowerCase();
    if (REDACT_KEYS.some((k) => lower.includes(k))) {
      clone[key] = "***";
    } else {
      clone[key] = value;
    }
  }
  return clone;
}

function log(level: LogLevel, data: Record<string, unknown>) {
  const context = logContextStorage.getStore() ?? {};
  const output = JSON.stringify(redact({ ...context, ...data }));
  console[level](output);
}

export const logger = {
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
