type LogLevel = "info" | "warn" | "error";

function log(level: LogLevel, message: string) {
  const prefix = `[${level.toUpperCase()}]`;
  // eslint-disable-next-line no-console
  console[level](`${prefix} ${message}`);
}

export const logger = {
  info: (message: string) => log("info", message),
  warn: (message: string) => log("warn", message),
  error: (message: string) => log("error", message),
};
