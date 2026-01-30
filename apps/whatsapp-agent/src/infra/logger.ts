type LogLevel = "info" | "warn" | "error";

const REDACT_KEYS = ["token", "authorization"];

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
  const output = JSON.stringify(redact(data));
  console[level](output);
}

export const logger = {
  info: (data: Record<string, unknown>) => log("info", data),
  warn: (data: Record<string, unknown>) => log("warn", data),
  error: (data: Record<string, unknown>) => log("error", data),
};
