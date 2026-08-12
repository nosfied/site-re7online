import type { SerializedWebSessionAuthState } from "../../../whatsapp-agent/src/web-session/webSessionAuthStore.js";

type BaileysSocketFactoryParams = {
  authState: unknown;
  browserName?: string;
  logger?: BaileysLoggerLike;
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

type BaileysLoggerLike = {
  trace?: (payload: unknown, message?: string) => void;
  debug?: (payload: unknown, message?: string) => void;
  info?: (payload: unknown, message?: string) => void;
  warn?: (payload: unknown, message?: string) => void;
  error?: (payload: unknown, message?: string) => void;
  fatal?: (payload: unknown, message?: string) => void;
  child?: (bindings?: unknown) => BaileysLoggerLike;
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
  childTags: string[];
  childAttrsKeys: string[];
  encTypes: string[];
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

export type BaileysSocketLike = {
  ev: {
    on: (eventName: string, handler: (...args: never[]) => unknown) => void;
    process?: (handler: (events: Record<string, unknown>) => unknown) => unknown;
  };
  sendMessage?: (jid: string, content: Record<string, unknown>) => Promise<unknown>;
  updateMediaMessage?: (message: unknown) => Promise<unknown>;
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

function sanitizeLogPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { payloadType: typeof payload };
  }
  const record = payload as Record<string, unknown>;
  const error = record.error ?? record.err ?? record.ackErr;
  return {
    keys: Object.keys(record).sort(),
    errorName: error instanceof Error ? error.name : null,
    errorMessage: error instanceof Error ? error.message : typeof error === "string" ? error : null,
  };
}

function createBaileysLogger(logger?: BaileysLoggerLike): BaileysLoggerLike {
  if (!logger) return silentLogger;
  const write = (level: "warn" | "error" | "fatal") => (payload: unknown, message?: string) => {
    logger[level]?.({
      event: "whatsapp.web.baileys.log",
      level,
      message: typeof message === "string" ? message : typeof payload === "string" ? payload : null,
      ...sanitizeLogPayload(payload),
    });
  };
  return {
    level: "warn",
    trace() {},
    debug() {},
    info() {},
    warn: write("warn"),
    error: write("error"),
    fatal: write("fatal"),
    child() {
      return createBaileysLogger(logger);
    },
  } as BaileysLoggerLike;
}

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
    logger: createBaileysLogger(params.logger) as never,
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
  const children = Array.isArray(record.content) ? record.content : [];
  const childRecords = children.filter(
    (child): child is Record<string, unknown> => Boolean(child) && typeof child === "object" && !Array.isArray(child)
  );
  const childTags = Array.from(new Set(childRecords.map((child) => child.tag).filter((tag): tag is string => typeof tag === "string"))).sort();
  const childAttrsKeys = Array.from(new Set(
    childRecords.flatMap((child) => {
      const childAttrs = child.attrs && typeof child.attrs === "object" && !Array.isArray(child.attrs)
        ? child.attrs as Record<string, unknown>
        : {};
      return Object.keys(childAttrs).filter((key) => !["from", "id", "participant", "recipient", "to"].includes(key));
    })
  )).sort();
  const encTypes = Array.from(new Set(
    childRecords
      .filter((child) => child.tag === "enc")
      .map((child) => {
        const childAttrs = child.attrs && typeof child.attrs === "object" && !Array.isArray(child.attrs)
          ? child.attrs as Record<string, unknown>
          : {};
        return childAttrs.type;
      })
      .filter((type): type is string => typeof type === "string")
  )).sort();
  return {
    name: eventName,
    tag: typeof record.tag === "string" ? record.tag : null,
    type: typeof attrs.type === "string" ? attrs.type : null,
    className: typeof attrs.class === "string" ? attrs.class : null,
    childCount: children.length,
    childTags,
    childAttrsKeys,
    encTypes,
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
