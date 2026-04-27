import type { InboxMessageItem } from "@/lib/whatsappAdminApi";

export type AppRealtimeStatus = "connected" | "reconnecting" | "offline";

export type AppRealtimeEvent =
  | {
      type: "message.created";
      clientId: string;
      waId: string;
      waIdCanonical?: string | null;
      message: InboxMessageItem;
    };

type AppRealtimeClientOptions = {
  baseUrl: string;
  token: string;
  onMessage: (event: AppRealtimeEvent) => void;
  onStatus?: (status: AppRealtimeStatus) => void;
};

export const APP_REALTIME_EVENT_NAME = "re7:inbox-realtime";

const MAX_NOTIFIED_MESSAGE_KEYS = 500;
const notifiedMessageIds = new Set<string>();
const notifiedMessageOrder: string[] = [];

type ActiveInboxConversation = {
  waId: string | null;
  waIdCanonical: string | null;
};

let activeInboxConversation: ActiveInboxConversation = {
  waId: null,
  waIdCanonical: null,
};

type NotificationCandidate = {
  waId?: string | null;
  waIdCanonical?: string | null;
  messageId?: string | null;
  metaMessageId?: string | null;
  requestId?: string | null;
  createdAt?: string | null;
  bodyText?: string | null;
  direction?: string | null;
  type?: string | null;
};

export type AppRealtimeClient = {
  connect: () => void;
  close: () => void;
};

export function dispatchAppRealtimeEvent(event: AppRealtimeEvent) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AppRealtimeEvent>(APP_REALTIME_EVENT_NAME, { detail: event }));
}

export function addAppRealtimeListener(handler: (event: AppRealtimeEvent) => void) {
  if (typeof window === "undefined") return () => undefined;
  const listener = (event: Event) => {
    handler((event as CustomEvent<AppRealtimeEvent>).detail);
  };
  window.addEventListener(APP_REALTIME_EVENT_NAME, listener);
  return () => window.removeEventListener(APP_REALTIME_EVENT_NAME, listener);
}

export function setActiveInboxConversation(waId: string | null, waIdCanonical?: string | null) {
  activeInboxConversation = {
    waId,
    waIdCanonical: waIdCanonical ?? null,
  };
}

export function isActiveInboxConversation(event: Pick<AppRealtimeEvent, "waId" | "waIdCanonical">) {
  const activeWaId = activeInboxConversation.waId;
  const activeCanonical = activeInboxConversation.waIdCanonical;
  if (!activeWaId && !activeCanonical) return false;
  return (
    event.waId === activeWaId ||
    event.waId === activeCanonical ||
    event.waIdCanonical === activeWaId ||
    event.waIdCanonical === activeCanonical
  );
}

export function shouldNotifyMessage(candidate: NotificationCandidate) {
  if (candidate.direction && candidate.direction !== "INBOUND") return false;

  const primaryId = candidate.messageId ?? candidate.metaMessageId ?? candidate.requestId ?? null;
  const conversationKey = candidate.waIdCanonical ?? candidate.waId ?? "unknown";
  const notificationKey = primaryId
    ? `${conversationKey}:${primaryId}`
    : `${conversationKey}:${candidate.createdAt ?? "unknown"}:${candidate.bodyText ?? ""}:${candidate.type ?? ""}`;

  if (notifiedMessageIds.has(notificationKey)) return false;

  notifiedMessageIds.add(notificationKey);
  notifiedMessageOrder.push(notificationKey);

  while (notifiedMessageOrder.length > MAX_NOTIFIED_MESSAGE_KEYS) {
    const oldestKey = notifiedMessageOrder.shift();
    if (oldestKey) notifiedMessageIds.delete(oldestKey);
  }

  return true;
}

function getRealtimeUrl(baseUrl: string, token: string) {
  const cleanBaseUrl = baseUrl.trim().replace(/\/+$/, "") || "/agent-api";
  const encodedToken = encodeURIComponent(token);

  if (cleanBaseUrl.startsWith("http://") || cleanBaseUrl.startsWith("https://")) {
    const parsed = new URL(cleanBaseUrl);
    parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
    parsed.pathname = `${parsed.pathname.replace(/\/+$/, "")}/app/realtime`;
    parsed.search = `token=${encodedToken}`;
    return parsed.toString();
  }

  if (
    typeof window !== "undefined" &&
    process.env.NODE_ENV === "development" &&
    ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ) {
    return `ws://127.0.0.1:3002/app/realtime?token=${encodedToken}`;
  }

  const origin =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "wss://"
      : "ws://";
  const host = typeof window !== "undefined" ? window.location.host : "";
  return `${origin}${host}${cleanBaseUrl}/app/realtime?token=${encodedToken}`;
}

export function createAppRealtimeClient(options: AppRealtimeClientOptions): AppRealtimeClient {
  let socket: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  let closedByClient = false;
  let reconnectAttempt = 0;

  const setStatus = (status: AppRealtimeStatus) => {
    options.onStatus?.(status);
  };

  const clearReconnect = () => {
    if (reconnectTimer === null || typeof window === "undefined") return;
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  };

  const connect = () => {
    if (typeof window === "undefined" || !options.token.trim()) return;
    clearReconnect();
    closedByClient = false;
    socket?.close();

    socket = new WebSocket(getRealtimeUrl(options.baseUrl, options.token));

    socket.addEventListener("open", () => {
      reconnectAttempt = 0;
      setStatus("connected");
    });

    socket.addEventListener("message", (message) => {
      try {
        const event = JSON.parse(String(message.data)) as AppRealtimeEvent;
        if (event?.type === "message.created") {
          options.onMessage(event);
        }
      } catch {
        // Ignore malformed realtime payloads; REST remains the source of truth.
      }
    });

    socket.addEventListener("close", () => {
      socket = null;
      if (closedByClient) {
        setStatus("offline");
        return;
      }
      setStatus("reconnecting");
      const delay = Math.min(10_000, 500 * 2 ** reconnectAttempt);
      reconnectAttempt += 1;
      reconnectTimer = window.setTimeout(connect, delay);
    });

    socket.addEventListener("error", () => {
      socket?.close();
    });
  };

  return {
    connect,
    close: () => {
      closedByClient = true;
      clearReconnect();
      socket?.close();
      socket = null;
      setStatus("offline");
    },
  };
}
