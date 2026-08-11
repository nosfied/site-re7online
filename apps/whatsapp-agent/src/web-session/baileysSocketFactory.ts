import type { SerializedWebSessionAuthState } from "./webSessionAuthStore.js";

type BaileysSocketFactoryParams = {
  authState: unknown;
  browserName?: string;
  onQr?: (qr: string) => void;
  onCredentialsUpdate?: (state: SerializedWebSessionAuthState) => Promise<void> | void;
};

const silentLogger = {
  level: "silent",
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
  fatal() {},
  child() {
    return silentLogger;
  },
};

export async function createBaileysSocket(params: BaileysSocketFactoryParams) {
  const module = await import("@whiskeysockets/baileys");
  const makeWASocket = module.default ?? module.makeWASocket;
  const browser =
    module.Browsers?.ubuntu?.(params.browserName ?? "Converta Web Session") ??
    ["Converta", "Chrome", "1.0.0"];
  const socket = makeWASocket({
    auth: params.authState as never,
    browser,
    printQRInTerminal: false,
    logger: silentLogger as never,
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });
  socket.ev.on("connection.update", (update: { qr?: string }) => {
    if (update.qr) params.onQr?.(update.qr);
  });
  socket.ev.on("creds.update", async () => {
    await params.onCredentialsUpdate?.({ updatedAt: new Date().toISOString() });
  });
  return socket;
}
