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

export type AppRealtimeClient = {
  connect: () => void;
  close: () => void;
};

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
