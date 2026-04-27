"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import {
  createAppRealtimeClient,
  dispatchAppRealtimeEvent,
  isActiveInboxConversation,
  shouldNotifyMessage,
  type AppRealtimeClient,
  type AppRealtimeEvent,
} from "@/lib/appRealtime";
import { loadAppSession, type AppSession } from "@/lib/appClientApi";

const INBOX_SOUND_ENABLED_STORAGE_KEY = "wa_app_inbox_sound_enabled_v1";
const NOTIFICATION_SOUND_INTERVAL_MS = 320;
const NOTIFICATION_MAX_QUEUE = 10;

function isSoundEnabled() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(INBOX_SOUND_ENABLED_STORAGE_KEY) !== "0";
}

function getSessionKey(session: AppSession | null) {
  if (!session?.token) return null;
  return `${session.baseUrl}:${session.user.clientId}:${session.user.id}:${session.token}`;
}

export default function AppRealtimeBridge() {
  const pathname = usePathname();
  const clientRef = useRef<AppRealtimeClient | null>(null);
  const sessionKeyRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasPrimedAudioRef = useRef(false);
  const notificationQueueRef = useRef(0);
  const notificationTimerRef = useRef<number | null>(null);

  const playNotificationSound = useCallback(() => {
    if (!isSoundEnabled() || !hasPrimedAudioRef.current || typeof window === "undefined") return;
    try {
      const baseAudio = audioRef.current;
      if (!baseAudio) return;
      const nextAudio = baseAudio.cloneNode(true) as HTMLAudioElement;
      nextAudio.volume = 0.95;
      nextAudio.currentTime = 0;
      void nextAudio.play();
    } catch {
      // Browser autoplay policy can block audio; REST/polling still updates state.
    }
  }, []);

  const processNotificationQueue = useCallback(() => {
    if (typeof window === "undefined") return;
    if (notificationQueueRef.current <= 0) {
      notificationTimerRef.current = null;
      return;
    }
    notificationQueueRef.current -= 1;
    playNotificationSound();
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

  const handleRealtimeEvent = useCallback((event: AppRealtimeEvent, session: AppSession) => {
    dispatchAppRealtimeEvent(event);

    if (event.type !== "message.created" || event.clientId !== session.user.clientId) return;
    if (event.message.direction !== "INBOUND") return;
    if (isActiveInboxConversation(event)) return;

    const shouldNotify = shouldNotifyMessage({
      waId: event.waId,
      waIdCanonical: event.waIdCanonical,
      messageId: event.message.messageId,
      metaMessageId: event.message.metaMessageId,
      requestId: event.message.requestId,
      createdAt: event.message.createdAt,
      bodyText: event.message.bodyText,
      direction: event.message.direction,
      type: event.message.type,
    });

    if (shouldNotify) {
      enqueueNotification();
    }
  }, [enqueueNotification]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const audio = new window.Audio("/sounds/inbox-notification.wav");
    audio.preload = "auto";
    audioRef.current = audio;
    return () => {
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const primeNotificationAudio = () => {
      hasPrimedAudioRef.current = true;
    };

    window.addEventListener("pointerdown", primeNotificationAudio, { passive: true });
    window.addEventListener("keydown", primeNotificationAudio);

    return () => {
      window.removeEventListener("pointerdown", primeNotificationAudio);
      window.removeEventListener("keydown", primeNotificationAudio);
    };
  }, []);

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

  return null;
}
