import type { SerializedWebSessionAuthState } from "../../../whatsapp-agent/src/web-session/webSessionAuthStore.js";

type BaileysSocketFactoryParams = {
  authState: unknown;
  browserName?: string;
  onQr?: (qr: string) => void;
  onConnected?: () => void;
  onDisconnected?: (reason: unknown) => void;
  onCredentialsUpdate?: (state: SerializedWebSessionAuthState) => Promise<void> | void;
  onMessagesUpsert?: (event: BaileysMessagesUpsertEvent) => Promise<void> | void;
  onMessagesUpdate?: (event: BaileysMessagesUpdateEvent) => Promise<void> | void;
  onEventBatch?: (events: Record<string, unknown>) => Promise<void> | void;
};

export type BaileysMessagesUpsertEvent = {
  type?: string;
  messages?: unknown[];
};

export type BaileysMessagesUpdateEvent = Array<{
  key?: unknown;
  update?: Record<string, unknown>;
}>;

type BaileysModuleLike = {
  default?: (params: Record<string, unknown>) => BaileysSocketLike;
  makeWASocket?: (params: Record<string, unknown>) => BaileysSocketLike;
  fetchLatestBaileysVersion?: () => Promise<{ version: unknown }>;
  Browsers?: {
    macOS?: (browserName: string) => unknown;
    ubuntu?: (browserName: string) => unknown;
  };
};

type BaileysSocketLike = {
  ev: {
    on: (eventName: string, handler: (...args: never[]) => unknown) => void;
    process?: (handler: (events: Record<string, unknown>) => unknown) => unknown;
  };
  end?: (error?: Error) => void;
  ws?: {
    close?: () => void;
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

export async function createBaileysSocketFromModule(
  module: BaileysModuleLike,
  params: BaileysSocketFactoryParams
) {
  const makeWASocket = module.default ?? module.makeWASocket;
  if (!makeWASocket) {
    throw new Error("baileys_socket_factory_unavailable");
  }
  const browser =
    module.Browsers?.macOS?.("Desktop") ??
    module.Browsers?.ubuntu?.(params.browserName ?? "Converta Web Session") ??
    ["Converta", "Desktop", "1.0.0"];
  const version = module.fetchLatestBaileysVersion
    ? (await module.fetchLatestBaileysVersion()).version
    : undefined;
  const socket = makeWASocket({
    ...(version ? { version } : {}),
    auth: params.authState as never,
    browser,
    printQRInTerminal: false,
    logger: silentLogger as never,
    markOnlineOnConnect: true,
    syncFullHistory: false,
  });
  socket.ev.on("connection.update", (update: { qr?: string; connection?: string; lastDisconnect?: unknown }) => {
    if (update.qr) params.onQr?.(update.qr);
    if (update.connection === "open") params.onConnected?.();
    if (update.connection === "close") params.onDisconnected?.(update.lastDisconnect);
  });
  socket.ev.on("creds.update", async (update: SerializedWebSessionAuthState) => {
    await params.onCredentialsUpdate?.(update ?? {});
  });
  socket.ev.on("messages.upsert", async (event: BaileysMessagesUpsertEvent) => {
    await params.onMessagesUpsert?.(event ?? {});
  });
  socket.ev.on("messages.update", async (event: BaileysMessagesUpdateEvent) => {
    await params.onMessagesUpdate?.(Array.isArray(event) ? event : []);
  });
  if (typeof socket.ev.process === "function") {
    socket.ev.process(async (events: Record<string, unknown>) => {
      await params.onEventBatch?.(events ?? {});
    });
  }
  return socket;
}

export function closeBaileysSocket(socket: BaileysSocketLike) {
  if (typeof socket.end === "function") {
    socket.end(new Error("web_session_admin_disconnect"));
    return;
  }
  if (typeof socket.ws?.close === "function") {
    socket.ws.close();
  }
}
