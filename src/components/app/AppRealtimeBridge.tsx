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
const INBOX_SOUND_ENABLED_STORAGE_KEY = "wa_app_inbox_sound_enabled_v1";
const NOTIFICATION_DEBUG_STORAGE_KEY = "converta_notification_debug";
const PUSH_PRESENCE_INTERVAL_MS = 4_000;

function isSoundEnabled() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(INBOX_SOUND_ENABLED_STORAGE_KEY) === "1";
}

function isNotificationDebugEnabled() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(NOTIFICATION_DEBUG_STORAGE_KEY) === "1";
}

function debugNotification(event: string, details: Record<string, unknown> = {}) {
  if (!isNotificationDebugEnabled()) return;
  console.info(JSON.stringify({ event: `notification.${event}`, ...details }));
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

function notifyServiceWorkerAppForeground() {
  if (typeof navigator === "undefined" || typeof document === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (document.visibilityState !== "visible") return;
  navigator.serviceWorker.controller?.postMessage({ type: "converta.app_foreground" });
}

function notifyServiceWorkerAppBackground() {
  if (typeof navigator === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.controller?.postMessage({ type: "converta.app_background" });
}

function isMobileLikeRuntime() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const hasTouch = navigator.maxTouchPoints > 1;
  const iosLike = /iPad|iPhone|iPod/i.test(userAgent) || (platform === "MacIntel" && hasTouch);
  const androidLike = /Android/i.test(userAgent);
  const narrowViewport = window.matchMedia("(max-width: 767px)").matches;
  return iosLike || androidLike || (hasTouch && narrowViewport);
}

function shouldPlayLocalSoundWhenHidden() {
  return !isMobileLikeRuntime();
}

type NotificationDebugWindow = Window &
  typeof globalThis & {
    __convertaNotificationState?: () => Record<string, unknown>;
    __convertaTestNotificationSound?: (sound?: AppNotificationRequest["sound"]) => Promise<Record<string, unknown>>;
  };

export default function AppRealtimeBridge() {
  const pathname = usePathname();
  const [showNotificationNotice, setShowNotificationNotice] = useState(false);
  const clientRef = useRef<AppRealtimeClient | null>(null);
  const sessionKeyRef = useRef<string | null>(null);
  const primaryAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const hasPrimedAudioRef = useRef(false);
  const notificationTimerRef = useRef<number | null>(null);
  const dismissedNotificationNoticeRef = useRef(false);

  const syncAudioState = useCallback((unlocked: boolean) => {
    dispatchAppAudioState({
      unlocked,
      soundEnabled: isSoundEnabled(),
    });
  }, []);

  const playNotificationSound = useCallback((sound: AppNotificationRequest["sound"] = "primary") => {
    if (!isSoundEnabled() || typeof window === "undefined") {
      debugNotification("sound_skipped", { reason: "disabled_or_no_window", sound });
      return;
    }
    try {
      const baseAudio = sound === "active" ? activeAudioRef.current : primaryAudioRef.current;
      if (!baseAudio) {
        debugNotification("sound_skipped", { reason: "audio_not_ready", sound });
        return;
      }
      baseAudio.pause();
      baseAudio.volume = sound === "active" ? 0.42 : 0.95;
      baseAudio.currentTime = 0;
      void baseAudio
        .play()
        .then(() => {
          hasPrimedAudioRef.current = true;
          syncAudioState(true);
          debugNotification("sound_played", { sound });
        })
        .catch((error) => {
          hasPrimedAudioRef.current = false;
          syncAudioState(false);
          debugNotification("sound_blocked", {
            sound,
            errorName: error instanceof Error ? error.name : "unknown",
          });
          // Browser autoplay policy can block audio after reload until the next user gesture.
        });
    } catch {
      hasPrimedAudioRef.current = false;
      debugNotification("sound_failed", { sound });
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
            debugNotification("audio_unlocked");
          })
          .catch((error) => {
            audio.volume = previousVolume || 0.95;
            hasPrimedAudioRef.current = false;
            syncAudioState(false);
            debugNotification("audio_unlock_failed", {
              errorName: error instanceof Error ? error.name : "unknown",
            });
          });
      } catch {
        audio.volume = 0.95;
        hasPrimedAudioRef.current = false;
        syncAudioState(false);
        debugNotification("audio_unlock_failed", { errorName: "exception" });
      }
    }
    if (!attemptedAudio) {
      hasPrimedAudioRef.current = false;
      syncAudioState(false);
      debugNotification("audio_unlock_failed", { errorName: "audio_not_ready" });
    }
  }, [syncAudioState]);

  const processNotificationQueue = useCallback(() => {
    if (typeof window === "undefined") return;
    playNotificationSound("primary");
    notificationTimerRef.current = window.setTimeout(
      () => {
        notificationTimerRef.current = null;
      },
      NOTIFICATION_SOUND_INTERVAL_MS
    );
  }, [playNotificationSound]);

  const enqueueNotification = useCallback(() => {
    if (typeof window === "undefined") return;
    if (notificationTimerRef.current !== null) return;
    processNotificationQueue();
  }, [processNotificationQueue]);

  const handleNotificationRequest = useCallback((request: AppNotificationRequest) => {
    const appIsVisible = document.visibilityState === "visible";
    const allowHiddenLocalSound = !appIsVisible && shouldPlayLocalSoundWhenHidden();
    const soundEnabled = isSoundEnabled();
    debugNotification("request_received", {
      visible: appIsVisible,
      focused: document.hasFocus(),
      allowHiddenLocalSound,
      soundEnabled,
      sound: request.sound,
      notifyBrowser: request.notifyBrowser,
    });
    if (!appIsVisible && !allowHiddenLocalSound) {
      if (notificationTimerRef.current !== null) {
        window.clearTimeout(notificationTimerRef.current);
        notificationTimerRef.current = null;
      }
      debugNotification("request_skipped", { reason: "hidden", sound: request.sound });
      return;
    }
    if (soundEnabled) {
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
    debugNotification("realtime_event", {
      type: event.type,
      direction: event.type === "message.created" ? event.message.direction : undefined,
      visible: typeof document === "undefined" ? true : document.visibilityState === "visible",
      focused: typeof document === "undefined" ? true : document.hasFocus(),
    });

    if (event.type === "message.created") {
      handleInboundNotification(event, session);
      return;
    }
    if (event.type === "conversation.handoff.updated") {
      handleHandoffNotification(event, session);
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
    if (typeof window === "undefined") return;
    const debugWindow = window as NotificationDebugWindow;
    const getAudioState = () => ({
      soundEnabled: isSoundEnabled(),
      debugEnabled: isNotificationDebugEnabled(),
      visible: typeof document === "undefined" ? true : document.visibilityState === "visible",
      focused: typeof document === "undefined" ? true : document.hasFocus(),
      mobileLike: isMobileLikeRuntime(),
      hiddenLocalSound: shouldPlayLocalSoundWhenHidden(),
      hasPrimedAudio: hasPrimedAudioRef.current,
      primaryAudioReady: Boolean(primaryAudioRef.current),
      activeAudioReady: Boolean(activeAudioRef.current),
      primaryReadyState: primaryAudioRef.current?.readyState ?? null,
      activeReadyState: activeAudioRef.current?.readyState ?? null,
    });
    const testNotificationSound = async (sound: AppNotificationRequest["sound"] = "primary") => {
      window.localStorage.setItem(NOTIFICATION_DEBUG_STORAGE_KEY, "1");
      const audio = sound === "active" ? activeAudioRef.current : primaryAudioRef.current;
      const before = getAudioState();
      if (!audio) {
        const result = { ok: false, reason: "audio_not_ready", sound, before };
        debugNotification("manual_test", result);
        return result;
      }
      try {
        audio.pause();
        audio.volume = sound === "active" ? 0.42 : 0.95;
        audio.currentTime = 0;
        await audio.play();
        hasPrimedAudioRef.current = true;
        syncAudioState(true);
        const result = { ok: true, sound, before, after: getAudioState() };
        debugNotification("manual_test", result);
        return result;
      } catch (error) {
        hasPrimedAudioRef.current = false;
        syncAudioState(false);
        const result = {
          ok: false,
          reason: "play_blocked",
          sound,
          errorName: error instanceof Error ? error.name : "unknown",
          before,
          after: getAudioState(),
        };
        debugNotification("manual_test", result);
        return result;
      }
    };
    debugWindow.__convertaNotificationState = getAudioState;
    debugWindow.__convertaTestNotificationSound = testNotificationSound;
    debugNotification("bridge_ready", getAudioState());
    return () => {
      if (debugWindow.__convertaNotificationState === getAudioState) {
        delete debugWindow.__convertaNotificationState;
      }
      if (debugWindow.__convertaTestNotificationSound === testNotificationSound) {
        delete debugWindow.__convertaTestNotificationSound;
      }
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
    const currentPathname = pathname ?? "";
    if (!currentPathname.startsWith("/app/inbox")) {
      setShowNotificationNotice(false);
      return;
    }

    let cancelled = false;
    const timers: number[] = [];
    const updateNotice = () => {
      if (cancelled || dismissedNotificationNoticeRef.current) return;
      setShowNotificationNotice(Boolean(loadAppSession()));
    };

    updateNotice();
    for (const delay of [250, 750, 1500]) {
      timers.push(window.setTimeout(updateNotice, delay));
    }

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [pathname]);

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
      const visible = document.visibilityState === "visible";
      if (visible) {
        notifyServiceWorkerAppForeground();
      } else {
        notifyServiceWorkerAppBackground();
      }
      const endpoint = await getCurrentPushEndpoint().catch(() => null);
      if (!endpoint || cancelled) return;
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
      if (document.visibilityState !== "visible") {
        notifyServiceWorkerAppBackground();
      }
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

  if (!showNotificationNotice) return null;

  return (
    <div
      className="fixed left-1/2 z-[2147483647] w-[min(92vw,420px)] -translate-x-1/2 rounded-2xl border border-amber-300 bg-amber-400 px-4 py-3 text-left text-xs leading-relaxed text-slate-950 shadow-[0_20px_60px_rgba(15,23,42,0.28)]"
      style={{ top: "calc(12px + env(safe-area-inset-top, 0px))" }}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0">
          <span className="font-extrabold">Sininho:</span> controla o som local e as notificacoes nativas deste
          aparelho. No iPhone, notificacoes em segundo plano exigem o Converta instalado na tela inicial e permissao
          liberada.
        </p>
        <button
          type="button"
          onClick={() => {
            dismissedNotificationNoticeRef.current = true;
            primeNotificationAudio();
            setShowNotificationNotice(false);
          }}
          className="shrink-0 rounded-lg bg-slate-950 px-2.5 py-1 text-[11px] font-extrabold text-white"
        >
          OK
        </button>
      </div>
    </div>
  );
}
