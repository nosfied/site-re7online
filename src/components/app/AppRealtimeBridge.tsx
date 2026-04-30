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
import { loadAppSession, type AppSession } from "@/lib/appClientApi";

const INBOX_SOUND_ENABLED_STORAGE_KEY = "wa_app_inbox_sound_enabled_v1";
const NOTIFICATION_SOUND_INTERVAL_MS = 320;
const NOTIFICATION_MAX_QUEUE = 10;

function isSoundEnabled() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(INBOX_SOUND_ENABLED_STORAGE_KEY) !== "0";
}

function getNotificationPermissionState() {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

function getSessionKey(session: AppSession | null) {
  if (!session?.token) return null;
  return `${session.baseUrl}:${session.user.clientId}:${session.user.id}:${session.token}`;
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
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState(getNotificationPermissionState);

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
      const nextAudio = baseAudio.cloneNode(true) as HTMLAudioElement;
      nextAudio.volume = sound === "active" ? 0.42 : 0.95;
      nextAudio.currentTime = 0;
      void nextAudio
        .play()
        .then(() => {
          hasPrimedAudioRef.current = true;
          syncAudioState(true);
        })
        .catch(() => {
          syncAudioState(false);
          // Browser autoplay policy can block audio after reload until the next user gesture.
        });
    } catch {
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
            syncAudioState(false);
          });
      } catch {
        audio.volume = 0.95;
        syncAudioState(false);
      }
    }
    if (!attemptedAudio) {
      syncAudioState(false);
    }
  }, [syncAudioState]);

  const activateAlerts = useCallback(() => {
    if (typeof window === "undefined") return;
    primeNotificationAudio();
    if ("Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission()
        .then(() => {
          setNotificationPermission(getNotificationPermissionState());
        })
        .catch(() => {
          setNotificationPermission(getNotificationPermissionState());
        });
    } else {
      setNotificationPermission(getNotificationPermissionState());
    }
  }, [primeNotificationAudio]);

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

  const showBrowserNotification = useCallback((request: AppNotificationRequest, silent = true) => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    try {
      new Notification(request.title, {
        body: request.body,
        tag: request.key,
        silent,
      });
    } catch {
      // Notification support varies by browser/profile; internal updates continue.
    }
  }, []);

  const handleNotificationRequest = useCallback((request: AppNotificationRequest) => {
    const appIsFocused = document.visibilityState === "visible" && document.hasFocus();
    const soundEnabled = isSoundEnabled();
    const audioAlreadyPrimed = hasPrimedAudioRef.current;
    if (request.notifyBrowser && (!appIsFocused || !audioAlreadyPrimed)) {
      showBrowserNotification(request, audioAlreadyPrimed);
    }
    if (soundEnabled) {
      if (request.sound === "active") {
        playNotificationSound("active");
      } else {
        enqueueNotification();
      }
    }
  }, [enqueueNotification, playNotificationSound, showBrowserNotification]);

  const handleInboundNotification = useCallback((
    event: Extract<AppRealtimeEvent, { type: "message.created" }>
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
    });
  }, []);

  const handleHandoffNotification = useCallback((
    event: Extract<AppRealtimeEvent, { type: "conversation.handoff.updated" }>
  ) => {
    handleRealtimeNotificationCandidate({
      source: "websocket",
      kind: "handoff",
      conversationIdentity: getConversationIdentityFromRealtimeEvent(event) ?? null,
      createdAt: event.updatedAt,
      direction: "INBOUND",
      mode: event.mode,
      handoffStatus: event.handoffStatus,
    });
  }, []);

  const handleRealtimeEvent = useCallback((event: AppRealtimeEvent, session: AppSession) => {
    dispatchAppRealtimeEvent(event);

    if (event.clientId !== session.user.clientId) return;
    if (event.type === "message.created") {
      handleInboundNotification(event);
      return;
    }
    if (event.type === "conversation.handoff.updated") {
      handleHandoffNotification(event);
    }
  }, [handleHandoffNotification, handleInboundNotification]);

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
    window.addEventListener("pointerdown", primeNotificationAudio, { passive: true });
    window.addEventListener("keydown", primeNotificationAudio);
    window.addEventListener(APP_AUDIO_UNLOCK_EVENT_NAME, primeNotificationAudio);

    return () => {
      window.removeEventListener("pointerdown", primeNotificationAudio);
      window.removeEventListener("keydown", primeNotificationAudio);
      window.removeEventListener(APP_AUDIO_UNLOCK_EVENT_NAME, primeNotificationAudio);
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

  const currentPathname = pathname ?? "";
  const shouldShowAlertActivation =
    currentPathname.startsWith("/app") &&
    currentPathname !== "/app/login" &&
    isSoundEnabled() &&
    (!audioUnlocked || notificationPermission === "default");

  if (!shouldShowAlertActivation) return null;

  return (
    <button
      type="button"
      onClick={activateAlerts}
      className="fixed left-1/2 top-1/2 z-[70] flex w-[min(92vw,320px)] -translate-x-1/2 -translate-y-1/2 items-center gap-3 rounded-xl border border-amber-300/35 bg-[#1b1830]/95 px-4 py-3 text-left text-xs text-amber-50 shadow-[0_18px_52px_rgba(0,0,0,0.34)] backdrop-blur transition hover:bg-[#2a2340]"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-300/20 text-base">
        🔔
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">Ativar alertas</span>
        <span className="block text-amber-50/75">Necessario apos atualizar a pagina.</span>
      </span>
    </button>
  );
}
