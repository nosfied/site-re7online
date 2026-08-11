import type { SerializedWebSessionAuthState } from "../../../whatsapp-agent/src/web-session/webSessionAuthStore.js";

type BaileysSocketFactoryParams = {
  authState: unknown;
  browserName?: string;
  onQr?: (qr: string) => void;
  onCredentialsUpdate?: (state: SerializedWebSessionAuthState) => Promise<void> | void;
};

type BaileysModuleLike = {
  default?: (params: Record<string, unknown>) => BaileysSocketLike;
  makeWASocket?: (params: Record<string, unknown>) => BaileysSocketLike;
  Browsers?: {
    ubuntu?: (browserName: string) => unknown;
  };
};

type BaileysSocketLike = {
  ev: {
    on: (eventName: string, handler: (...args: never[]) => unknown) => void;
  };
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
  return createBaileysSocketFromModule(module as unknown as BaileysModuleLike, params);
}

export function createBaileysSocketFromModule(
  module: BaileysModuleLike,
  params: BaileysSocketFactoryParams
) {
  const makeWASocket = module.default ?? module.makeWASocket;
  if (!makeWASocket) {
    throw new Error("baileys_socket_factory_unavailable");
  }
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
