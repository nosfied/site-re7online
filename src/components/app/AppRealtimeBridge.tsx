"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  addAppNotificationListener,
  APP_AUDIO_UNLOCK_EVENT_NAME,
  createAppRealtimeClient,
  dispatchAppAudioState,
  dispatchAppRealtimeEvent,
  getConversationIdentityFromRealtimeEvent,
  handleRealtimeNotificationCandidate,
  setActiveConversationIdentity,
  type AppRealtimeClient,
  type AppRealtimeEvent,
  type AppNotificationRequest,
} from "@/lib/appRealtime";
import { loadAppSession, updateAppPushPresence, type AppSession } from "@/lib/appClientApi";

const NOTIFICATION_SOUND_INTERVAL_MS = 320;
const NOTIFICATION_MAX_QUEUE = 10;
const INBOX_SOUND_ENABLED_STORAGE_KEY = "wa_app_inbox_sound_enabled_v1";
const PUSH_PRESENCE_INTERVAL_MS = 8_000;

function isSoundEnabled() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(INBOX_SOUND_ENABLED_STORAGE_KEY) === "1";
}

function getNotificationPermissionState() {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

function getSessionKey(session: AppSession | null) {
  if (!session?.token) return null;
  return `${session.baseUrl}:${session.user.clientId}:${session.user.id}:${session.token}`;
}

async function getCurrentPushEndpoint() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  return subscription?.endpoint ?? null;
}

export default function AppRealtimeBridge() {
  const pathname = usePathname();
  const clientRef = useRef<AppRealtimeClient | null>(null);
  const sessionKeyRef = useRef<string | null>(null);
  const primaryAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const hasPrimedAudioRef = useRef(false);
  const notificationQueueRef = useRef(0);
  const notificationTimerRef = useRef<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState("unsupported");
  const [dismissedActivationPrompt, setDismissedActivationPrompt] = useState(false);

  const syncAudioState = useCallback((unlocked: boolean) => {
    setAudioUnlocked(unlocked);
    setNotificationPermission(getNotificationPermissionState());
    dispatchAppAudioState({
      unlocked,
      soundEnabled: isSoundEnabled(),
    });
  }, []);

  const playNotificationSound = useCallback((sound: AppNotificationRequest["sound"] = "primary") => {
    if (!isSoundEnabled() || typeof window === "undefined") return;
    try {
      const baseAudio = sound === "active" ? activeAudioRef.current : primaryAudioRef.current;
      if (!baseAudio) return;
      const audio = new window.Audio(baseAudio.currentSrc || baseAudio.src);
      audio.preload = "auto";
      audio.volume = sound === "active" ? 0.42 : 0.95;
      void audio
        .play()
        .then(() => {
          hasPrimedAudioRef.current = true;
          syncAudioState(true);
        })
        .catch(() => {
          hasPrimedAudioRef.current = false;
          syncAudioState(false);
          // Browser autoplay policy can block audio after reload until the next user gesture.
        });
    } catch {
      hasPrimedAudioRef.current = false;
      // Browser autoplay policy can block audio; REST/polling still updates state.
    }
  }, [syncAudioState]);

  const primeNotificationAudio = useCallback(() => {
    if (typeof window === "undefined") return;
    let attemptedAudio = false;
    for (const audio of [primaryAudioRef.current, activeAudioRef.current]) {
      if (!audio) continue;
      attemptedAudio = true;
      try {
        const previousVolume = audio.volume;
        audio.volume = 0;
        const playAttempt = audio.play();
        void playAttempt
          .then(() => {
            audio.pause();
            audio.currentTime = 0;
            audio.volume = previousVolume || 0.95;
            hasPrimedAudioRef.current = true;
            syncAudioState(true);
          })
          .catch(() => {
            audio.volume = previousVolume || 0.95;
            hasPrimedAudioRef.current = false;
            syncAudioState(false);
          });
      } catch {
        audio.volume = 0.95;
        hasPrimedAudioRef.current = false;
        syncAudioState(false);
      }
    }
    if (!attemptedAudio) {
      hasPrimedAudioRef.current = false;
      syncAudioState(false);
    }
  }, [syncAudioState]);

  const dismissAlertActivation = useCallback(() => {
    setDismissedActivationPrompt(true);
  }, []);

  const processNotificationQueue = useCallback(() => {
    if (typeof window === "undefined") return;
    if (notificationQueueRef.current <= 0) {
      notificationTimerRef.current = null;
      return;
    }
    notificationQueueRef.current -= 1;
    playNotificationSound("primary");
    notificationTimerRef.current = window.setTimeout(
      processNotificationQueue,
      NOTIFICATION_SOUND_INTERVAL_MS
    );
  }, [playNotificationSound]);

  const enqueueNotification = useCallback(() => {
    if (typeof window === "undefined") return;
    notificationQueueRef.current = Math.min(NOTIFICATION_MAX_QUEUE, notificationQueueRef.current + 1);
    if (notificationTimerRef.current !== null) return;
    processNotificationQueue();
  }, [processNotificationQueue]);

  const handleNotificationRequest = useCallback((request: AppNotificationRequest) => {
    const appIsVisible = document.visibilityState === "visible";
    const soundEnabled = isSoundEnabled();
    if (soundEnabled && appIsVisible) {
      if (request.sound === "active") {
        playNotificationSound("active");
      } else {
        enqueueNotification();
      }
    }
  }, [enqueueNotification, playNotificationSound]);

  const handleInboundNotification = useCallback((
    event: Extract<AppRealtimeEvent, { type: "message.created" }>,
    session: AppSession
  ) => {
    if (event.message.direction !== "INBOUND") return;

    handleRealtimeNotificationCandidate({
      source: "websocket",
      kind: "message",
      conversationIdentity: getConversationIdentityFromRealtimeEvent(event) ?? null,
      messageId: event.message.messageId,
      metaMessageId: event.message.metaMessageId,
      requestId: event.message.requestId,
      createdAt: event.message.createdAt,
      bodyText: event.message.bodyText,
      direction: event.message.direction,
      mode: event.mode,
      handoffStatus: event.handoffStatus,
      assignedUserId: event.assignedUserId ?? null,
      departmentId: event.departmentId ?? null,
      userId: session.user.id,
      userDepartmentId: session.user.departmentId ?? null,
      userDepartmentName: session.user.departmentName ?? null,
      userRole: session.user.role,
    });
  }, []);

  const handleHandoffNotification = useCallback((
    event: Extract<AppRealtimeEvent, { type: "conversation.handoff.updated" }>,
    session: AppSession
  ) => {
    handleRealtimeNotificationCandidate({
      source: "websocket",
      kind: "handoff",
      conversationIdentity: getConversationIdentityFromRealtimeEvent(event) ?? null,
      createdAt: event.updatedAt,
      direction: "INBOUND",
      mode: event.mode,
      handoffStatus: event.handoffStatus,
      assignedUserId: event.assignedUserId ?? null,
      departmentId: event.departmentId ?? null,
      userId: session.user.id,
      userDepartmentId: session.user.departmentId ?? null,
      userDepartmentName: session.user.departmentName ?? null,
      userRole: session.user.role,
    });
  }, []);

  const handleRealtimeEvent = useCallback((event: AppRealtimeEvent, session: AppSession) => {
    if (event.clientId !== session.user.clientId) return;

    dispatchAppRealtimeEvent(event);

    if (event.type === "message.created") {
      handleInboundNotification(event, session);
      return;
    }
    if (event.type === "conversation.handoff.updated") {
      handleHandoffNotification(event, session);
    }
  }, [handleHandoffNotification, handleInboundNotification]);

  useEffect(() => {
    setMounted(true);
    setNotificationPermission(getNotificationPermissionState());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const primaryAudio = new window.Audio("/sounds/inbox-notification.wav");
    primaryAudio.preload = "auto";
    const activeAudio = new window.Audio("/sounds/inbox-active-message.wav");
    activeAudio.preload = "auto";
    primaryAudioRef.current = primaryAudio;
    activeAudioRef.current = activeAudio;
    syncAudioState(hasPrimedAudioRef.current);
    return () => {
      primaryAudioRef.current = null;
      activeAudioRef.current = null;
    };
  }, [syncAudioState]);

  useEffect(() => {
    return addAppNotificationListener(handleNotificationRequest);
  }, [handleNotificationRequest]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.addEventListener(APP_AUDIO_UNLOCK_EVENT_NAME, primeNotificationAudio);

    return () => {
      window.removeEventListener(APP_AUDIO_UNLOCK_EVENT_NAME, primeNotificationAudio);
    };
  }, [primeNotificationAudio]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleUserGesture = () => {
      if (!isSoundEnabled()) return;
      if (hasPrimedAudioRef.current) return;
      primeNotificationAudio();
    };
    window.addEventListener("pointerdown", handleUserGesture, { passive: true });
    window.addEventListener("touchstart", handleUserGesture, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", handleUserGesture);
      window.removeEventListener("touchstart", handleUserGesture);
    };
  }, [primeNotificationAudio]);

  useEffect(
    () => () => {
      if (typeof window !== "undefined" && notificationTimerRef.current !== null) {
        window.clearTimeout(notificationTimerRef.current);
      }
      notificationTimerRef.current = null;
      notificationQueueRef.current = 0;
      clientRef.current?.close();
      clientRef.current = null;
      sessionKeyRef.current = null;
    },
    []
  );

  useEffect(() => {
    const currentPathname = pathname ?? "";
    if (!currentPathname.startsWith("/app/inbox")) {
      setActiveConversationIdentity(null);
    }

    if (!currentPathname.startsWith("/app") || currentPathname === "/app/login") {
      clientRef.current?.close();
      clientRef.current = null;
      sessionKeyRef.current = null;
      return;
    }

    const session = loadAppSession();
    const sessionKey = getSessionKey(session);
    if (!session || !sessionKey) {
      clientRef.current?.close();
      clientRef.current = null;
      sessionKeyRef.current = null;
      return;
    }

    if (sessionKeyRef.current === sessionKey && clientRef.current) return;

    clientRef.current?.close();
    sessionKeyRef.current = sessionKey;
    const realtime = createAppRealtimeClient({
      baseUrl: session.baseUrl,
      token: session.token,
      onMessage: (event) => handleRealtimeEvent(event, session),
    });
    clientRef.current = realtime;
    realtime.connect();
  }, [handleRealtimeEvent, pathname]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const currentPathname = pathname ?? "";
    if (!currentPathname.startsWith("/app") || currentPathname === "/app/login") return;

    const session = loadAppSession();
    if (!session) return;

    let cancelled = false;
    let lastSentKey = "";
    let lastSentAt = 0;

    const sendPresence = async (force = false) => {
      if (cancelled) return;
      const endpoint = await getCurrentPushEndpoint().catch(() => null);
      if (!endpoint || cancelled) return;
      const visible = document.visibilityState === "visible";
      const focused = document.hasFocus();
      const now = Date.now();
      const key = `${endpoint}:${visible ? "1" : "0"}:${focused ? "1" : "0"}`;
      if (!force && key === lastSentKey && now - lastSentAt < PUSH_PRESENCE_INTERVAL_MS) return;
      lastSentKey = key;
      lastSentAt = now;
      await updateAppPushPresence(session, endpoint, { visible, focused }, { keepalive: !visible || !focused })
        .catch(() => undefined);
    };

    const handlePresenceChange = () => {
      void sendPresence(true);
    };
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void sendPresence(false);
      }
    }, PUSH_PRESENCE_INTERVAL_MS);

    void sendPresence(true);
    document.addEventListener("visibilitychange", handlePresenceChange);
    window.addEventListener("focus", handlePresenceChange);
    window.addEventListener("blur", handlePresenceChange);
    window.addEventListener("pagehide", handlePresenceChange);
    window.addEventListener("pageshow", handlePresenceChange);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handlePresenceChange);
      window.removeEventListener("focus", handlePresenceChange);
      window.removeEventListener("blur", handlePresenceChange);
      window.removeEventListener("pagehide", handlePresenceChange);
      window.removeEventListener("pageshow", handlePresenceChange);
    };
  }, [pathname]);

  const currentPathname = pathname ?? "";
  const shouldShowAlertActivation =
    mounted &&
    !dismissedActivationPrompt &&
    currentPathname.startsWith("/app") &&
    currentPathname !== "/app/login" &&
    isSoundEnabled() &&
    (!audioUnlocked || notificationPermission === "default");

  if (!shouldShowAlertActivation) return null;

  return (
    <div className="fixed left-1/2 top-[calc(1rem+var(--safe-top))] z-[10000] hidden w-[min(92vw,340px)] -translate-x-1/2 rounded-xl border border-amber-700 bg-amber-500 p-3 text-left text-xs text-slate-950 shadow-[0_18px_52px_rgba(0,0,0,0.2)] backdrop-blur md:block">
      <div className="flex items-center gap-3">
        <span className="min-w-0">
          <span className="block font-semibold">Restaurar som das notificacoes</span>
          <span className="block text-slate-900/75">
            Apos atualizar a pagina, clique duas vezes no sininho do inbox para restaurar os alertas sonoros.
          </span>
        </span>
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={dismissAlertActivation}
          className="rounded-md bg-slate-950 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-slate-800"
        >
          Entendi
        </button>
      </div>
    </div>
  );
}
