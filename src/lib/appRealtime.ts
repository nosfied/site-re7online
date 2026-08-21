import type { ConversationOperationalStatus, InboxMessageItem } from "@/lib/whatsappAdminApi";

export type AppRealtimeStatus = "connected" | "reconnecting" | "offline";
export type AppConversationMode = "BOT" | "HUMAN";
export type AppHandoffStatus = "none" | "pending" | "active";

export type AppRealtimeEvent =
  | {
      type: "message.created";
      clientId: string;
      waId: string;
      waIdCanonical?: string | null;
      message: InboxMessageItem;
      mode?: AppConversationMode | null;
      handoffStatus?: AppHandoffStatus | null;
      humanInboxVisible?: boolean;
      assignedUserId?: string | null;
      departmentId?: string | null;
      protocol?: string | null;
      cycleId?: string | null;
    }
  | {
      type: "message.status.updated";
      clientId: string;
      waId?: string | null;
      waIdCanonical?: string | null;
      messageId?: string | null;
      metaMessageId?: string | null;
      status: "SENT" | "DELIVERED" | "READ" | "FAILED";
      errorBody?: string | null;
      updatedAt: string;
    }
  | {
      type: "conversation.handoff.updated";
      clientId: string;
      waId: string;
      waIdCanonical?: string | null;
      mode?: AppConversationMode | null;
      handoffStatus?: AppHandoffStatus | null;
      status?: ConversationOperationalStatus | null;
      humanInboxVisible?: boolean;
      assignedUserId?: string | null;
      assignedUserName?: string | null;
      assignedAt?: string | null;
      departmentId?: string | null;
      departmentName?: string | null;
      queueId?: string | null;
      queueName?: string | null;
      protocol?: string | null;
      cycleId?: string | null;
      closedAt?: string | null;
      lastInboundAt?: string | null;
      updatedAt: string;
      reason?: string | null;
      notificationMessage?: {
        messageId: string | null;
        type: string;
        bodyText: string | null;
        createdAt: string;
      } | null;
    }
  | {
      type: "conversation.read_state.updated";
      clientId: string;
      waId: string;
      waIdCanonical?: string | null;
      readState: {
        lastReadAtByConversationKey: Record<string, string>;
        manuallyUnreadByConversationKey: Record<string, boolean>;
      };
      readScope?: { type: "shared" } | { type: "assigned"; assignedUserId: string };
      unread: boolean;
      activityAt?: string | null;
      updatedAt: string;
    };

type AppRealtimeClientOptions = {
  baseUrl: string;
  token: string;
  onMessage: (event: AppRealtimeEvent) => void;
  onStatus?: (status: AppRealtimeStatus) => void;
};

export const APP_REALTIME_EVENT_NAME = "re7:inbox-realtime";
export const APP_NOTIFICATION_EVENT_NAME = "re7:app-notification";
export const APP_AUDIO_STATE_EVENT_NAME = "re7:app-audio-state";
export const APP_AUDIO_UNLOCK_EVENT_NAME = "re7:app-audio-unlock";

const MAX_NOTIFIED_MESSAGE_KEYS = 500;
const notifiedMessageIds = new Set<string>();
const notifiedMessageOrder: string[] = [];
let activeConversationIdentity: string | null = null;

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

export type AppNotificationRequest = {
  key: string;
  title: string;
  body: string;
  sound: "primary" | "active";
  notifyBrowser: boolean;
};

export type AppAudioState = {
  unlocked: boolean;
  soundEnabled: boolean;
};

export type AppNotificationCandidate = {
  source: "websocket" | "polling";
  kind?: "message" | "handoff";
  conversationIdentity: string | null;
  messageId?: string | null;
  metaMessageId?: string | null;
  requestId?: string | null;
  createdAt?: string | null;
  direction?: string | null;
  bodyText?: string | null;
  mode?: AppConversationMode | null;
  handoffStatus?: AppHandoffStatus | null;
  assignedUserId?: string | null;
  departmentId?: string | null;
  userId?: string | null;
  userDepartmentId?: string | null;
  userDepartmentIds?: string[];
  userDepartmentName?: string | null;
  userRole?: string | null;
  title?: string;
  body?: string;
  backendEligible?: boolean;
};

export function buildRealtimeNotificationUserContext(user: {
  id?: string | null;
  role?: string | null;
  departmentId?: string | null;
  departmentIds?: string[] | null;
  departmentName?: string | null;
}) {
  return {
    userId: user.id ?? null,
    userDepartmentId: user.departmentId ?? null,
    userDepartmentIds: Array.isArray(user.departmentIds) ? user.departmentIds : [],
    userDepartmentName: user.departmentName ?? null,
    userRole: user.role ?? null,
  };
}

type InboundOrHandoffNotificationInput = {
  conversationIdentity: string | null;
  notificationKey: string;
  direction?: string | null;
  mode?: AppConversationMode | null;
  handoffStatus?: AppHandoffStatus | null;
  assignedUserId?: string | null;
  departmentId?: string | null;
  userId?: string | null;
  userDepartmentId?: string | null;
  userDepartmentIds?: string[];
  userDepartmentName?: string | null;
  userRole?: string | null;
  isHandoffTransition?: boolean;
  backendEligible?: boolean;
};

function resolveNotificationSound(input: InboundOrHandoffNotificationInput) {
  if (input.direction && input.direction.toUpperCase() !== "INBOUND") return null;
  if (!input.conversationIdentity) return null;
  if (!input.backendEligible && !canUserReceiveTargetedNotification(input, {
    id: input.userId,
    role: input.userRole,
    departmentId: input.userDepartmentId,
    departmentIds: input.userDepartmentIds,
  })) {
    return null;
  }
  if (!input.isHandoffTransition && !isHumanNotificationContext(input.mode, input.handoffStatus)) return null;
  if (input.isHandoffTransition && !isHumanNotificationContext(input.mode, input.handoffStatus)) return null;

  const isActiveConversation = input.conversationIdentity === getActiveConversationIdentity();
  if (isActiveConversation && isAppVisible()) {
    return "active" as const;
  }
  return "primary" as const;
}

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

export function dispatchAppNotificationRequest(request: AppNotificationRequest) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AppNotificationRequest>(APP_NOTIFICATION_EVENT_NAME, { detail: request }));
}

export function addAppNotificationListener(handler: (request: AppNotificationRequest) => void) {
  if (typeof window === "undefined") return () => undefined;
  const listener = (event: Event) => {
    handler((event as CustomEvent<AppNotificationRequest>).detail);
  };
  window.addEventListener(APP_NOTIFICATION_EVENT_NAME, listener);
  return () => window.removeEventListener(APP_NOTIFICATION_EVENT_NAME, listener);
}

export function dispatchAppAudioState(state: AppAudioState) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AppAudioState>(APP_AUDIO_STATE_EVENT_NAME, { detail: state }));
}

export function addAppAudioStateListener(handler: (state: AppAudioState) => void) {
  if (typeof window === "undefined") return () => undefined;
  const listener = (event: Event) => {
    handler((event as CustomEvent<AppAudioState>).detail);
  };
  window.addEventListener(APP_AUDIO_STATE_EVENT_NAME, listener);
  return () => window.removeEventListener(APP_AUDIO_STATE_EVENT_NAME, listener);
}

export function requestAppNotificationAudioUnlock() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(APP_AUDIO_UNLOCK_EVENT_NAME));
}

export function setActiveInboxConversation(waId: string | null, waIdCanonical?: string | null) {
  setActiveConversationIdentity(waIdCanonical ?? waId ?? null);
}

export function setActiveConversationIdentity(identity: string | null) {
  activeConversationIdentity = identity;
}

export function getActiveConversationIdentity() {
  return activeConversationIdentity;
}

export function isActiveInboxConversation(event: Pick<AppRealtimeEvent, "waId" | "waIdCanonical">) {
  const activeIdentity = getActiveConversationIdentity();
  if (!activeIdentity) return false;
  return getConversationIdentityFromRealtimeEvent(event) === activeIdentity;
}

export function getConversationIdentityFromRealtimeEvent(
  event: Pick<AppRealtimeEvent, "waId" | "waIdCanonical">
) {
  return event.waIdCanonical ?? event.waId;
}

export function buildNotificationKey(candidate: NotificationCandidate) {
  const primaryId = candidate.messageId ?? candidate.metaMessageId ?? candidate.requestId ?? null;
  const conversationIdentity = candidate.waIdCanonical ?? candidate.waId ?? "unknown";
  return primaryId
    ? `message:${primaryId}`
    : `message:${conversationIdentity}:${candidate.createdAt ?? "unknown"}:${candidate.bodyText ?? ""}:${candidate.direction ?? ""}`;
}

export function buildHandoffNotificationKey(
  conversationIdentity: string | null,
  handoffStatus?: string | null,
  updatedAt?: string | null
) {
  return `handoff:${conversationIdentity ?? "unknown"}:${handoffStatus ?? "unknown"}:${updatedAt ?? "unknown"}`;
}

export function shouldProcessNotification(key: string) {
  if (!key || notifiedMessageIds.has(key)) return false;

  notifiedMessageIds.add(key);
  notifiedMessageOrder.push(key);

  while (notifiedMessageOrder.length > MAX_NOTIFIED_MESSAGE_KEYS) {
    const oldestKey = notifiedMessageOrder.shift();
    if (oldestKey) notifiedMessageIds.delete(oldestKey);
  }

  return true;
}

export function shouldNotifyMessage(candidate: NotificationCandidate) {
  if (candidate.direction && candidate.direction.toUpperCase() !== "INBOUND") return false;
  return shouldProcessNotification(buildNotificationKey(candidate));
}

function isHumanNotificationContext(
  mode?: AppConversationMode | null,
  handoffStatus?: AppHandoffStatus | null
) {
  return mode === "HUMAN" || handoffStatus === "pending" || handoffStatus === "active";
}

export function isDepartmentScopedRole(role?: string | null) {
  const normalized = String(role || "").trim().toUpperCase();
  return normalized === "AGENT" || normalized === "SUPERVISOR";
}

export function canUserReceiveDepartmentNotification(
  role?: string | null,
  userDepartmentId?: string | null,
  eventDepartmentId?: string | null
) {
  if (!isDepartmentScopedRole(role)) return true;
  if (!userDepartmentId) return false;
  return eventDepartmentId === userDepartmentId;
}

export function canUserReceiveTargetedNotification(
  target: { assignedUserId?: string | null; departmentId?: string | null },
  user: {
    id?: string | null;
    role?: string | null;
    departmentId?: string | null;
    departmentIds?: string[];
  }
) {
  const assignedUserId = String(target.assignedUserId ?? "").trim();
  if (assignedUserId) {
    return String(user.id ?? "").trim() === assignedUserId;
  }
  const departmentId = String(target.departmentId ?? "").trim();
  if (departmentId) {
    if (!isDepartmentScopedRole(user.role)) return true;
    const userDepartmentIds = Array.isArray(user.departmentIds)
      ? user.departmentIds.map((value) => String(value ?? "").trim()).filter(Boolean)
      : [];
    if (userDepartmentIds.length > 0) return userDepartmentIds.includes(departmentId);
    return String(user.departmentId ?? "").trim() === departmentId;
  }
  if (!isDepartmentScopedRole(user.role)) return true;
  return false;
}

export function isConversationAssignedToAnotherUser(
  target: { assignedUserId?: string | null },
  user: { id?: string | null } | null | undefined
) {
  const assignedUserId = String(target.assignedUserId ?? "").trim();
  if (!assignedUserId) return false;
  return String(user?.id ?? "").trim() !== assignedUserId;
}

export function canUserReceiveRealtimeEvent(
  event: AppRealtimeEvent,
  user: { role?: string | null; departmentId?: string | null }
) {
  return true;
}

function isAppVisible() {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
}

export function shouldNotifyInboundOrHandoff(input: InboundOrHandoffNotificationInput) {
  if (!resolveNotificationSound(input)) return false;
  return shouldProcessNotification(input.notificationKey);
}

export function handleRealtimeNotificationCandidate(candidate: AppNotificationCandidate) {
  const notificationKey =
    candidate.kind === "handoff"
      ? buildHandoffNotificationKey(
          candidate.conversationIdentity,
          candidate.handoffStatus ?? candidate.mode,
          candidate.createdAt ?? null
        )
      : buildNotificationKey({
          waId: candidate.conversationIdentity,
          messageId: candidate.messageId,
          metaMessageId: candidate.metaMessageId,
          requestId: candidate.requestId,
          createdAt: candidate.createdAt,
          bodyText: candidate.bodyText,
          direction: candidate.direction,
        });

  const notificationInput = {
    conversationIdentity: candidate.conversationIdentity,
    notificationKey,
    direction: candidate.direction,
    mode: candidate.mode,
    handoffStatus: candidate.handoffStatus,
    assignedUserId: candidate.assignedUserId,
    departmentId: candidate.departmentId,
    userId: candidate.userId,
    userDepartmentId: candidate.userDepartmentId,
    userDepartmentIds: candidate.userDepartmentIds,
    userDepartmentName: candidate.userDepartmentName,
    userRole: candidate.userRole,
    isHandoffTransition: candidate.kind === "handoff",
    backendEligible: candidate.backendEligible,
  };
  const sound = resolveNotificationSound(notificationInput);
  if (!sound) return false;
  const shouldNotify = shouldProcessNotification(notificationKey);

  if (!shouldNotify) return false;

  dispatchAppNotificationRequest({
    key: notificationKey,
    title:
      candidate.title ??
      (candidate.kind === "handoff" ? "Novo atendimento humano no Converta" : "Nova mensagem no Converta"),
    body:
      candidate.body ??
      (candidate.kind === "handoff"
        ? "Uma conversa foi transferida para atendimento."
        : candidate.bodyText || "Voce recebeu uma nova mensagem."),
    sound,
    notifyBrowser: sound === "primary",
  });

  return true;
}

export function requestBrowserNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "default") return;
  void Notification.requestPermission().catch(() => undefined);
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
        if (
          event?.type === "message.created" ||
          event?.type === "message.status.updated" ||
          event?.type === "conversation.handoff.updated" ||
          event?.type === "conversation.read_state.updated"
        ) {
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
