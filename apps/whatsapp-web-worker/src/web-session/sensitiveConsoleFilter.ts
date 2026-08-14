const SENSITIVE_LIBSIGNAL_SESSION_PREFIX = "Closing session:";

let installed = false;

function isSensitiveConsoleInfo(args: unknown[]) {
  return typeof args[0] === "string" && args[0].startsWith(SENSITIVE_LIBSIGNAL_SESSION_PREFIX);
}

export function installSensitiveConsoleFilter() {
  if (installed) return;
  installed = true;
  const originalInfo = console.info.bind(console);
  console.info = (...args: unknown[]) => {
    if (isSensitiveConsoleInfo(args)) return;
    originalInfo(...args);
  };
}
