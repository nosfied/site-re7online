import type { SerializedWebSessionAuthState } from "../../../whatsapp-agent/src/web-session/webSessionAuthStore.js";

type BaileysSocketFactoryParams = {
  authState: unknown;
  browserName?: string;
  onQr?: (qr: string) => void;
  onConnected?: () => void;
  onDisconnected?: (reason: unknown) => void;
  onConnectionUpdate?: (update: BaileysConnectionUpdateEvent) => Promise<void> | void;
  onCredentialsUpdate?: (state: SerializedWebSessionAuthState) => Promise<void> | void;
  onMessagesUpsert?: (event: BaileysMessagesUpsertEvent) => Promise<void> | void;
  onMessagesUpdate?: (event: BaileysMessagesUpdateEvent) => Promise<void> | void;
  onSocketNode?: (event: BaileysSocketNodeEvent) => Promise<void> | void;
  onEventBatch?: (events: Record<string, unknown>) => Promise<void> | void;
};

export type BaileysMessagesUpsertEvent = {
  type?: string;
  messages?: unknown[];
};

export type BaileysConnectionUpdateEvent = {
  qr?: string;
  connection?: string;
  lastDisconnect?: unknown;
  receivedPendingNotifications?: boolean;
  isNewLogin?: boolean;
};

export type BaileysMessagesUpdateEvent = Array<{
  key?: unknown;
  update?: Record<string, unknown>;
}>;

export type BaileysSocketNodeEvent = {
  name: string;
  tag?: string | null;
  type?: string | null;
  className?: string | null;
  childCount: number;
};

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
    on?: (eventName: string, handler: (node: unknown) => unknown) => void;
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
  socket.ev.on("connection.update", async (update: BaileysConnectionUpdateEvent) => {
    await params.onConnectionUpdate?.(update ?? {});
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
  const socketNodeEvents = ["CB:message", "CB:notification", "CB:receipt", "CB:ack,class:message"];
  if (typeof socket.ws?.on === "function") {
    for (const eventName of socketNodeEvents) {
      socket.ws.on(eventName, async (node: unknown) => {
        await params.onSocketNode?.(summarizeSocketNode(eventName, node));
      });
    }
  }
  if (typeof socket.ev.process === "function") {
    socket.ev.process(async (events: Record<string, unknown>) => {
      await params.onEventBatch?.(events ?? {});
    });
  }
  return socket;
}

function summarizeSocketNode(eventName: string, node: unknown): BaileysSocketNodeEvent {
  const record = node && typeof node === "object" && !Array.isArray(node)
    ? node as Record<string, unknown>
    : {};
  const attrs = record.attrs && typeof record.attrs === "object" && !Array.isArray(record.attrs)
    ? record.attrs as Record<string, unknown>
    : {};
  return {
    name: eventName,
    tag: typeof record.tag === "string" ? record.tag : null,
    type: typeof attrs.type === "string" ? attrs.type : null,
    className: typeof attrs.class === "string" ? attrs.class : null,
    childCount: Array.isArray(record.content) ? record.content.length : 0,
  };
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
