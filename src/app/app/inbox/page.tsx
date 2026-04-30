"use client";

import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import AppShell from "@/components/app/AppShell";
import { FeedbackToast } from "@/components/ui/FeedbackToast";
import {
  addAppRealtimeListener,
  handleRealtimeNotificationCandidate,
  requestBrowserNotificationPermission,
  setActiveConversationIdentity,
  setActiveInboxConversation,
  type AppRealtimeEvent,
} from "@/lib/appRealtime";
import {
  AppInboxReadState,
  AppSession,
  claimAppConversation,
  clearAppSession,
  createAppLeadNote,
  fetchAppConversation,
  fetchAppConversations,
  fetchAppLeadNotes,
  sendAppConversationMedia,
  fetchAppUsers,
  updateAppLead,
  loadAppSession,
  releaseAppConversation,
  saveAppSession,
  fetchAppConversationMedia,
  sendAppConversationMessage,
  transferAppConversation,
  updateAppConversationStatus,
  updateAppLeadStatus,
  updateAppConversationReadState,
} from "@/lib/appClientApi";
import {
  ConversationOperationalStatus,
  formatDateTime,
  InboxConversationItem,
  InboxMessageItem,
  LeadNoteItem,
  LeadStatus,
  AdminUserItem,
  AdminConnection,
  AdminDepartmentItem,
  fetchAdminClients,
  fetchDepartments,
  loadAdminConnection,
  transferConversationDepartment,
} from "@/lib/whatsappAdminApi";

const LEAD_STATUS_OPTIONS: LeadStatus[] = [
  "NEW",
  "QUALIFIED",
  "WAITING_ATTENDANT",
  "IN_ATTENDANCE",
  "CLOSED",
];

const INBOX_SOUND_ENABLED_STORAGE_KEY = "wa_app_inbox_sound_enabled_v1";
const MEDIA_NOT_FOUND_TTL_MS = 5 * 60 * 1000;
const CONVERSATION_PAGE_SIZE = 30;
const mediaBlobCache = new Map<string, Blob>();
const mediaNotFoundCache = new Map<string, number>();

function getMediaCacheKey(messageId: string | null, mediaKind?: string | null) {
  if (!messageId) return null;
  return `${messageId}:${mediaKind ?? "unknown"}`;
}

function getConversationLabel(item: InboxConversationItem) {
  return item.leadName || item.leadPhone || "Sem nome";
}

function getLeadStatusLabel(status?: string | null) {
  switch ((status || "").trim().toUpperCase()) {
    case "NEW":
      return "Novo";
    case "QUALIFIED":
      return "Qualificado";
    case "WAITING_ATTENDANT":
      return "Aguardando atendimento";
    case "IN_ATTENDANCE":
      return "Em atendimento";
    case "CLOSED":
      return "Encerrado";
    default:
      return "Sem andamento";
  }
}

function getMessageContentLabel(item: InboxMessageItem) {
  switch (item.type) {
    case "AUDIO":
      return "Audio";
    case "IMAGE":
      return "Imagem";
    case "VIDEO":
      return "Video";
    case "DOCUMENT":
      return "Documento";
    case "TEMPLATE":
      return "Template";
    default:
      return "Mensagem";
  }
}

function MediaBubble({
  session,
  waId,
  item,
  autoLoad = false,
}: {
  session: AppSession | null;
  waId: string | null;
  item: InboxMessageItem;
  autoLoad?: boolean;
}) {
  const media = item.media;
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [mediaBlob, setMediaBlob] = useState<Blob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const mediaCacheKey = getMediaCacheKey(item.messageId, media?.kind);

  const clearLoadedMedia = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setObjectUrl(null);
    setMediaBlob(null);
  }, []);

  const loadMedia = useCallback(async () => {
    if (!session || !waId || !media?.hasDownload || !item.messageId || !mediaCacheKey) return;
    const cachedBlob = mediaBlobCache.get(mediaCacheKey);
    if (cachedBlob) {
      const nextObjectUrl = URL.createObjectURL(cachedBlob);
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
      objectUrlRef.current = nextObjectUrl;
      setMediaBlob(cachedBlob);
      setObjectUrl(nextObjectUrl);
      setError(null);
      return;
    }
    const lastNotFoundAt = mediaNotFoundCache.get(mediaCacheKey);
    if (lastNotFoundAt && Date.now() - lastNotFoundAt < MEDIA_NOT_FOUND_TTL_MS) {
      setError("Midia indisponivel.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetchAppConversationMedia(session, waId, item.messageId);
      const nextObjectUrl = URL.createObjectURL(response.blob);
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
      objectUrlRef.current = nextObjectUrl;
      mediaBlobCache.set(mediaCacheKey, response.blob);
      mediaNotFoundCache.delete(mediaCacheKey);
      setMediaBlob(response.blob);
      setObjectUrl(nextObjectUrl);
    } catch (err) {
      if ((err as { status?: number }).status === 404) {
        mediaNotFoundCache.set(mediaCacheKey, Date.now());
        setError("Midia indisponivel.");
      } else {
        setError("Falha ao carregar midia.");
      }
    } finally {
      setLoading(false);
    }
  }, [item.messageId, media?.hasDownload, mediaCacheKey, session, waId]);

  useEffect(() => {
    if (!session || !media?.hasDownload || !item.messageId || !waId) {
      clearLoadedMedia();
      setLoading(false);
      setError(null);
      return;
    }
    clearLoadedMedia();
    setLoading(false);
    setError(null);

    if (!autoLoad || media.kind === "document" || media.kind === "video" || media.kind === "audio") {
      return;
    }

    void loadMedia();

    return () => {
      clearLoadedMedia();
    };
  }, [clearLoadedMedia, item.messageId, loadMedia, media?.hasDownload, media?.kind, session, waId]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  const handleDownload = useCallback(async () => {
    if (!session || !waId || !media?.hasDownload || !item.messageId) return;
    setError(null);
    try {
      const blob = mediaBlob ?? (await fetchAppConversationMedia(session, waId, item.messageId)).blob;
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = media.fileName || `${item.messageId}`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch {
      setError("Falha ao baixar midia.");
    }
  }, [item.messageId, media?.fileName, media?.hasDownload, mediaBlob, session, waId]);

  if (!media) return null;

  return (
    <div className="mt-2 space-y-2">
      {!media.hasDownload && !objectUrl ? (
        <p className="text-sm italic text-slate-700">
          {media.kind === "image"
            ? "Imagem enviada"
            : media.kind === "audio"
              ? "Audio enviado"
              : media.kind === "video"
                ? "Video enviado"
                : media.fileName
                  ? `Documento enviado (${media.fileName})`
                  : "Documento enviado"}
        </p>
      ) : null}
      {media.kind === "image" ? (
        objectUrl ? (
          <a href={objectUrl} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={objectUrl}
              alt={media.caption || "Imagem recebida"}
              className="max-h-72 rounded-xl border border-black/10 object-contain"
            />
          </a>
        ) : loading ? (
          <p className="text-xs text-slate-600">Carregando imagem...</p>
        ) : null
      ) : null}

      {media.kind === "audio" ? (
        objectUrl ? (
          <audio
            src={objectUrl}
            controls
            preload="metadata"
            className="block w-[18rem] max-w-full min-w-[18rem]"
          />
        ) : loading ? (
          <p className="text-xs text-slate-600">Carregando audio...</p>
        ) : media.hasDownload ? (
          <button
            type="button"
            onClick={() => void loadMedia()}
            className="rounded-lg border border-[#d4c7b5] bg-white/80 px-3 py-2 text-sm text-slate-900"
          >
            Carregar audio
          </button>
        ) : null
      ) : null}

      {media.kind === "video" ? (
        objectUrl ? (
          <video
            src={objectUrl}
            controls
            preload="metadata"
            className="max-h-72 w-full rounded-xl border border-black/10"
          />
        ) : loading ? (
          <p className="text-xs text-slate-600">Carregando video...</p>
        ) : media.hasDownload ? (
          <button
            type="button"
            onClick={() => void loadMedia()}
            className="rounded-lg border border-[#d4c7b5] bg-white/80 px-3 py-2 text-sm text-slate-900"
          >
            Carregar midia
          </button>
        ) : null
      ) : null}

      {media.kind === "document" ? (
        <button
          type="button"
          onClick={() => void handleDownload()}
          disabled={!media.hasDownload}
          className="rounded-lg border border-[#d4c7b5] bg-white/80 px-3 py-2 text-sm text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Baixar documento{media.fileName ? ` (${media.fileName})` : ""}
        </button>
      ) : null}

      {media.caption ? <p className="wa-bubble-text text-sm leading-relaxed">{media.caption}</p> : null}
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}

function getConversationIdentity(item: Pick<InboxConversationItem, "waId" | "waIdCanonical">) {
  return item.waIdCanonical ?? item.waId;
}

type InboxReadState = AppInboxReadState;

const EMPTY_READ_STATE: InboxReadState = {
  lastReadAtByConversationKey: {},
  manuallyUnreadByConversationKey: {},
};

function getLatestReadAt(current?: string | null, incoming?: string | null) {
  if (!current) return incoming ?? null;
  if (!incoming) return current;
  const currentTimestamp = Date.parse(current);
  const incomingTimestamp = Date.parse(incoming);
  if (!Number.isFinite(currentTimestamp)) return incoming;
  if (!Number.isFinite(incomingTimestamp)) return current;
  return incomingTimestamp > currentTimestamp ? incoming : current;
}

function mergeReadStatePreservingLocal(current: InboxReadState, incoming: InboxReadState): InboxReadState {
  const lastReadAtByConversationKey = { ...incoming.lastReadAtByConversationKey };
  for (const [conversationKey, currentReadAt] of Object.entries(current.lastReadAtByConversationKey)) {
    const latestReadAt = getLatestReadAt(
      currentReadAt,
      incoming.lastReadAtByConversationKey[conversationKey]
    );
    if (latestReadAt) {
      lastReadAtByConversationKey[conversationKey] = latestReadAt;
    }
  }

  const manuallyUnreadByConversationKey = { ...incoming.manuallyUnreadByConversationKey };
  for (const [conversationKey, isUnread] of Object.entries(current.manuallyUnreadByConversationKey)) {
    if (isUnread) {
      manuallyUnreadByConversationKey[conversationKey] = true;
    }
  }

  for (const conversationKey of Object.keys(manuallyUnreadByConversationKey)) {
    const currentReadAt = current.lastReadAtByConversationKey[conversationKey];
    const latestReadAt = lastReadAtByConversationKey[conversationKey];
    if (
      !current.manuallyUnreadByConversationKey[conversationKey] &&
      currentReadAt &&
      latestReadAt &&
      latestReadAt === currentReadAt
    ) {
      delete manuallyUnreadByConversationKey[conversationKey];
    }
  }

  return {
    lastReadAtByConversationKey,
    manuallyUnreadByConversationKey,
  };
}

const QUICK_EMOJIS = ["😀", "😂", "😍", "❤️", "🙏", "👍", "👋", "👏", "🔥", "✅"];
const CONVERSATION_FILTERS = [
  { value: "ALL", label: "Todas" },
  { value: "WAITING", label: "Aguardando" },
  { value: "IN_PROGRESS", label: "Em atendimento" },
  { value: "WAITING_USER", label: "Aguardando cliente" },
  { value: "CLOSED", label: "Finalizadas" },
  { value: "MINE", label: "Minhas" },
  { value: "UNASSIGNED", label: "Nao atribuidas" },
] as const;

type ConversationFilter = (typeof CONVERSATION_FILTERS)[number]["value"];
type DepartmentFilter = "ALL" | string;

type DepartmentOption = {
  id: string;
  name: string;
};

type PendingOutgoingMessage = {
  waId: string;
  conversationKey: string;
  text: string;
};

type PendingUnreadScrollTarget = {
  conversationKey: string;
  lastReadAt: string | null;
};

type PendingReadAfterHydration = {
  conversationKey: string;
  activityAt: string | null;
  waId: string | null;
};

type AudioRecordingState = "idle" | "recording" | "stopping";

function getSupportedRecordingMimeType() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return null;
  }
  const candidates = [
    "audio/ogg; codecs=opus",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
  ];
  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return null;
}

function normalizeRecordedAudioMimeType(mimeType: string) {
  const normalized = mimeType.trim().toLowerCase();
  if (!normalized) return "audio/ogg; codecs=opus";
  if (normalized.includes("audio/ogg") && normalized.includes("opus")) {
    return "audio/ogg; codecs=opus";
  }
  if (normalized.includes("audio/mp4")) {
    return "audio/mp4";
  }
  if (normalized.includes("audio/aac")) {
    return "audio/aac";
  }
  if (normalized.includes("audio/mpeg")) {
    return "audio/mpeg";
  }
  return normalized;
}

function getRecordingFileExtension(mimeType: string) {
  const normalized = mimeType.trim().toLowerCase();
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("mp4")) return "m4a";
  return "audio";
}

function getConversationActivityAt(item: InboxConversationItem) {
  // Activity priority stays explicit: last visible message, then conversation update timestamp.
  return item.lastMessage?.createdAt ?? item.lastInboundAt ?? item.lastOutboundAt ?? item.updatedAt;
}

function getConversationActivityTimestamp(item: InboxConversationItem) {
  const activityAt = getConversationActivityAt(item);
  const timestamp = Date.parse(activityAt);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function sortConversationsByRecent(items: InboxConversationItem[]) {
  return [...items].sort((a, b) => {
    const aTs = getConversationActivityTimestamp(a);
    const bTs = getConversationActivityTimestamp(b);
    if (aTs === null && bTs === null) return 0;
    if (aTs === null) return 1;
    if (bTs === null) return -1;
    return bTs - aTs;
  });
}

function dedupeConversationsByIdentity(items: InboxConversationItem[]) {
  const byIdentity = new Map<string, InboxConversationItem>();
  for (const item of sortConversationsByRecent(items)) {
    const identity = getConversationIdentity(item);
    if (!byIdentity.has(identity)) {
      byIdentity.set(identity, item);
      continue;
    }

    const existing = byIdentity.get(identity)!;
    const existingTs = getConversationActivityTimestamp(existing) ?? Number.NEGATIVE_INFINITY;
    const nextTs = getConversationActivityTimestamp(item) ?? Number.NEGATIVE_INFINITY;
    if (nextTs > existingTs) {
      byIdentity.set(identity, item);
      continue;
    }

    if (!existing.waIdCanonical && item.waIdCanonical) {
      byIdentity.set(identity, {
        ...existing,
        waIdCanonical: item.waIdCanonical,
      });
    }
  }
  return sortConversationsByRecent(Array.from(byIdentity.values()));
}

function mergeConversationsPreservingStableOrder(
  current: InboxConversationItem[],
  incoming: InboxConversationItem[]
) {
  if (current.length === 0) return incoming;
  const currentIndexByIdentity = new Map<string, number>();
  current.forEach((item, index) => {
    const identity = getConversationIdentity(item);
    currentIndexByIdentity.set(identity, index);
  });

  const incomingByIdentity = new Map<string, InboxConversationItem>();
  for (const item of incoming) {
    incomingByIdentity.set(getConversationIdentity(item), item);
  }

  const merged = [
    ...current.map((item) => incomingByIdentity.get(getConversationIdentity(item)) ?? item),
    ...incoming.filter((item) => !currentIndexByIdentity.has(getConversationIdentity(item))),
  ];

  return merged;
}

function updateConversationInPlace(
  current: InboxConversationItem[],
  conversationKey: string,
  updater: (item: InboxConversationItem) => InboxConversationItem
) {
  return current.map((item) => (getConversationIdentity(item) === conversationKey ? updater(item) : item));
}

function isConversationUnread(item: InboxConversationItem, state: InboxReadState) {
  if (state.manuallyUnreadByConversationKey[getConversationIdentity(item)]) return true;
  if (item.lastMessage?.direction !== "INBOUND") return false;
  const activityAt = getConversationActivityTimestamp(item);
  const lastReadAt = Date.parse(
    state.lastReadAtByConversationKey[getConversationIdentity(item)] ?? ""
  );
  if (activityAt === null) return false;
  if (!Number.isFinite(lastReadAt)) return true;
  return activityAt > lastReadAt;
}

function getMessageStatusTicks(item: InboxMessageItem) {
  if (item.direction !== "OUTBOUND") return null;
  const normalized = item.status.trim().toUpperCase();
  if (normalized === "READ") {
    return {
      label: "✓✓",
      className: "text-sky-600",
      ariaLabel: "lida",
      title: "Lida",
    };
  }
  if (normalized === "DELIVERED") {
    return {
      label: "✓✓",
      className: "text-slate-500",
      ariaLabel: "entregue",
      title: "Entregue",
    };
  }
  if (normalized === "SENT") {
    return {
      label: "✓",
      className: "text-slate-500",
      ariaLabel: "enviada",
      title: "Enviada",
    };
  }
  if (normalized === "FAILED" || normalized === "ERROR") {
    return {
      label: "!",
      className: "text-red-600",
      ariaLabel: "falhou",
      title: "Falha no envio",
    };
  }
  if (normalized === "PENDING" || normalized === "QUEUED" || normalized === "SENDING") {
    return {
      label: "...",
      className: "text-slate-500",
      ariaLabel: "enviando",
      title: "Enviando",
    };
  }
  return null;
}

function renderMessageStatusTicks(item: InboxMessageItem) {
  const ticks = getMessageStatusTicks(item);
  if (!ticks) return null;
  if (ticks.label === "!") {
    return (
      <span aria-label={ticks.ariaLabel} title={ticks.title} className={`font-semibold ${ticks.className}`}>
        !
      </span>
    );
  }

  const glyphs = ticks.label.split("");
  return (
    <span aria-label={ticks.ariaLabel} title={ticks.title} className={`inline-flex items-center ${ticks.className}`}>
      {glyphs.map((glyph, index) => (
        <span
          key={`${ticks.ariaLabel}-${index}`}
          className={index === 0 ? "" : "-ml-0.5"}
        >
          {glyph}
        </span>
      ))}
    </span>
  );
}

function getLatestMessageSignature(items: InboxMessageItem[]) {
  if (items.length === 0) return null;
  const latest = items[items.length - 1];
  return `${latest.createdAt}:${latest.messageId ?? latest.metaMessageId ?? latest.requestId ?? latest.direction}`;
}

function getMessageIdentity(item: InboxMessageItem) {
  return `${item.direction}:${item.messageId ?? item.metaMessageId ?? item.requestId ?? item.createdAt}:${item.type}`;
}

function getMessageStatusPriority(status?: string | null) {
  switch ((status || "").trim().toUpperCase()) {
    case "FAILED":
    case "ERROR":
      return 99;
    case "READ":
      return 3;
    case "DELIVERED":
      return 2;
    case "SENT":
      return 1;
    case "PENDING":
    case "QUEUED":
    case "SENDING":
      return 0;
    default:
      return -1;
  }
}

function shouldApplyStatusUpdate(currentStatus: string | null | undefined, nextStatus: string | null | undefined) {
  const currentPriority = getMessageStatusPriority(currentStatus);
  const nextPriority = getMessageStatusPriority(nextStatus);
  if (nextPriority < 0) return false;
  if (currentPriority === 99 && nextPriority !== 99) return false;
  return nextPriority >= currentPriority;
}

function isStatusUpdateTarget(
  item: InboxMessageItem,
  event: Extract<AppRealtimeEvent, { type: "message.status.updated" }>
) {
  if (item.direction !== "OUTBOUND") return false;
  if (event.metaMessageId && item.metaMessageId === event.metaMessageId) return true;
  if (event.messageId && item.messageId === event.messageId) return true;
  return false;
}

function applyStatusUpdateToMessages(
  items: InboxMessageItem[],
  event: Extract<AppRealtimeEvent, { type: "message.status.updated" }>
) {
  let didUpdate = false;
  const nextItems = items.map((item) => {
    if (!isStatusUpdateTarget(item, event)) return item;
    if (!shouldApplyStatusUpdate(item.status, event.status)) return item;
    didUpdate = true;
    return {
      ...item,
      status: event.status,
      errorBody: event.errorBody ?? item.errorBody,
      metaMessageId: item.metaMessageId ?? event.metaMessageId ?? null,
      messageId: item.messageId ?? event.messageId ?? null,
    };
  });
  return didUpdate ? nextItems : items;
}

function getInboundNotificationIdentity(waId: string | null, item: InboxMessageItem) {
  if (item.direction !== "INBOUND") return null;
  return `${waId ?? "unknown"}:${item.messageId ?? item.metaMessageId ?? item.createdAt}:${item.type}`;
}

function findFirstUnreadMessageIndex(items: InboxMessageItem[], lastReadAt: string | null) {
  const lastReadTimestamp = Date.parse(lastReadAt ?? "");
  const hasReadTimestamp = Number.isFinite(lastReadTimestamp);
  return items.findIndex((item) => {
    if (item.direction !== "INBOUND") return false;
    if (!hasReadTimestamp) return true;
    const createdAt = Date.parse(item.createdAt);
    return Number.isFinite(createdAt) && createdAt > lastReadTimestamp;
  });
}

function countUnseenInboundMessages(
  waId: string | null,
  items: InboxMessageItem[],
  seenKeys: Set<string>
) {
  let count = 0;
  for (const item of items) {
    const identity = getInboundNotificationIdentity(waId, item);
    if (!identity || seenKeys.has(identity)) continue;
    seenKeys.add(identity);
    count += 1;
  }
  return count;
}

function rememberInboundMessages(
  waId: string | null,
  items: InboxMessageItem[],
  seenKeys: Set<string>
) {
  for (const item of items) {
    const identity = getInboundNotificationIdentity(waId, item);
    if (identity) seenKeys.add(identity);
  }
}

function mergeMessagesByIdentity(current: InboxMessageItem[], incoming: InboxMessageItem[]) {
  if (incoming.length === 0) return current;
  const next = [...current];
  const seen = new Set(current.map(getMessageIdentity));
  for (const item of incoming) {
    const identity = getMessageIdentity(item);
    if (seen.has(identity)) continue;
    seen.add(identity);
    next.push(item);
  }
  next.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  return next;
}

function sortMessagesAscending(items: InboxMessageItem[]) {
  return [...items].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

function shouldPlayInboundNotificationForConversation(
  item: Pick<InboxConversationItem, "mode" | "handoffStatus">
) {
  return item.mode === "HUMAN" || item.handoffStatus === "active" || item.handoffStatus === "pending";
}

function getHumanFlowConversationKeys(items: InboxConversationItem[]) {
  const keys = new Set<string>();
  for (const item of items) {
    if (shouldPlayInboundNotificationForConversation(item)) {
      keys.add(getConversationIdentity(item));
    }
  }
  return keys;
}

function getLatestInboundConversationSignature(items: InboxConversationItem[]) {
  let latestItem: InboxConversationItem | null = null;
  let latestTs = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    if (!shouldPlayInboundNotificationForConversation(item)) continue;
    if (!item.lastInboundAt) continue;
    const ts = Date.parse(item.lastInboundAt);
    if (!Number.isFinite(ts) || ts <= latestTs) continue;
    latestTs = ts;
    latestItem = item;
  }
  if (!latestItem?.lastInboundAt) return null;
  return `${getConversationIdentity(latestItem)}:${latestItem.lastInboundAt}`;
}

function getLatestInboundConversationTimestamp(items: InboxConversationItem[]) {
  let latestTs = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    if (!shouldPlayInboundNotificationForConversation(item)) continue;
    if (!item.lastInboundAt) continue;
    const ts = Date.parse(item.lastInboundAt);
    if (!Number.isFinite(ts) || ts <= latestTs) continue;
    latestTs = ts;
  }
  return Number.isFinite(latestTs) ? latestTs : null;
}

function applyConversationOperationalPayload(
  item: InboxConversationItem,
  payload: {
    waId?: string | null;
    waIdCanonical?: string | null;
    mode: "BOT" | "HUMAN";
    handoffStatus?: "none" | "pending" | "active" | null;
    assignedUserId: string | null;
    assignedTo: string | null;
    assignedUserName: string | null;
    assignedAt: string | null;
    departmentId: string | null;
    departmentName: string | null;
    queueId: string | null;
    queueName: string | null;
    status: ConversationOperationalStatus | null;
    closedAt: string | null;
    lastInboundAt: string | null;
    lastOutboundAt: string | null;
    isUnassigned: boolean;
  }
) {
  return {
    ...item,
    waId: payload.waId ?? item.waId,
    waIdCanonical: payload.waIdCanonical ?? item.waIdCanonical,
    mode: payload.mode,
    handoffStatus: payload.handoffStatus ?? item.handoffStatus ?? "none",
    assignedUserId: payload.assignedUserId,
    assignedTo: payload.assignedTo,
    assignedUserName: payload.assignedUserName,
    assignedAt: payload.assignedAt,
    departmentId: payload.departmentId,
    departmentName: payload.departmentName,
    queueId: payload.queueId,
    queueName: payload.queueName,
    status: payload.status,
    closedAt: payload.closedAt,
    lastInboundAt: payload.lastInboundAt,
    lastOutboundAt: payload.lastOutboundAt,
    isUnassigned: payload.isUnassigned,
  };
}

function getConversationOperationalStatus(item: Pick<InboxConversationItem, "status" | "mode" | "assignedUserId">) {
  if (item.status) return item.status;
  if (item.mode === "HUMAN") {
    return item.assignedUserId ? "IN_PROGRESS" : "WAITING";
  }
  return null;
}

function getConversationStatusLabel(status: ConversationOperationalStatus | null) {
  switch (status) {
    case "WAITING":
      return "Aguardando";
    case "IN_PROGRESS":
      return "Em atendimento";
    case "WAITING_USER":
      return "Aguardando cliente";
    case "CLOSED":
      return "Finalizada";
    default:
      return "Sem andamento";
  }
}

function getConversationModeLabel(
  item: Pick<InboxConversationItem, "mode" | "handoffStatus"> | null
) {
  if (!item) return "Sem modo";
  if (item.handoffStatus === "active" || item.handoffStatus === "pending") return "Modo humano";
  return item.mode === "HUMAN" ? "Modo humano" : "Modo automacao";
}

function getConversationStatusClass(status: ConversationOperationalStatus | null) {
  switch (status) {
    case "WAITING":
      return "bg-amber-500/20 text-amber-100";
    case "IN_PROGRESS":
      return "bg-sky-500/20 text-sky-100";
    case "WAITING_USER":
      return "bg-violet-500/20 text-violet-100";
    case "CLOSED":
      return "bg-white/10 text-white/75";
    default:
      return "bg-white/10 text-white/65";
  }
}

function formatRelativeTime(value?: string | null) {
  if (!value) return "-";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "-";
  const diffMs = timestamp - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);
  const formatter = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, "minute");
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, "hour");
  }
  const diffDays = Math.round(diffHours / 24);
  return formatter.format(diffDays, "day");
}

function canReplyToConversation(
  item: Pick<InboxConversationItem, "mode" | "assignedUserId" | "status"> | null,
  currentUserId: string
) {
  if (!item) return false;
  const status = getConversationOperationalStatus(item);
  return item.mode === "HUMAN" && item.assignedUserId === currentUserId && status !== "CLOSED";
}

function isConversationAssignedToAnotherUser(
  item: Pick<InboxConversationItem, "assignedUserId"> | null,
  currentUserId: string
) {
  return Boolean(item?.assignedUserId && item.assignedUserId !== currentUserId);
}

function isConversationAssignedToCurrentUser(
  item: Pick<InboxConversationItem, "assignedUserId"> | null,
  currentUserId: string
) {
  return Boolean(item?.assignedUserId && item.assignedUserId === currentUserId);
}

function isAppAdmin(session: AppSession | null) {
  return session?.user.role === "ADMIN";
}

function buildInboxErrorToast(error: string | null, errorDetails: string | null, leadError: string | null) {
  if (error && errorDetails && !error.includes(errorDetails)) {
    return `${error}\n${errorDetails}`;
  }
  return error ?? leadError;
}

export default function AppInboxPage() {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [conversations, setConversations] = useState<InboxConversationItem[]>([]);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [adminConnection, setAdminConnection] = useState<AdminConnection | null>(null);
  const [adminClientKey, setAdminClientKey] = useState<string | null>(null);
  const [departments, setDepartments] = useState<AdminDepartmentItem[]>([]);
  const [selectedConversationKey, setSelectedConversationKey] = useState<string | null>(null);
  const [selectedConversationWaId, setSelectedConversationWaId] = useState<string | null>(null);
  const [messages, setMessages] = useState<InboxMessageItem[]>([]);
  const [messagesConversationKey, setMessagesConversationKey] = useState<string | null>(null);
  const [leadNotes, setLeadNotes] = useState<LeadNoteItem[]>([]);
  const [statusDraft, setStatusDraft] = useState<LeadStatus | "">("");
  const [leadNameDraft, setLeadNameDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [conversationNextCursor, setConversationNextCursor] = useState<string | null>(null);
  const [loadingConversationsPage, setLoadingConversationsPage] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingLeadNotes, setLoadingLeadNotes] = useState(false);
  const [savingLeadStatus, setSavingLeadStatus] = useState(false);
  const [savingLeadName, setSavingLeadName] = useState(false);
  const [savingLeadNote, setSavingLeadNote] = useState(false);
  const [messageDraft, setMessageDraft] = useState("");
  const [selectedMediaFile, setSelectedMediaFile] = useState<File | null>(null);
  const [audioRecordingState, setAudioRecordingState] = useState<"idle" | "recording" | "stopping">(
    "idle"
  );
  const [sendingMessage, setSendingMessage] = useState(false);
  const [queuedMessageCount, setQueuedMessageCount] = useState(0);
  const [conversationAction, setConversationAction] = useState<string | null>(null);
  const [conversationFilter, setConversationFilter] = useState<ConversationFilter>("ALL");
  const [conversationSearch, setConversationSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<DepartmentFilter>("ALL");
  const [statusActionDraft, setStatusActionDraft] = useState<ConversationOperationalStatus | "">("");
  const [transferUserId, setTransferUserId] = useState("");
  const [transferDepartmentId, setTransferDepartmentId] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [pauseErrorToast, setPauseErrorToast] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [leadError, setLeadError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [unreadSeparatorIndex, setUnreadSeparatorIndex] = useState<number | null>(null);
  const [unreadAnchorMessageIdentity, setUnreadAnchorMessageIdentity] = useState<string | null>(null);
  const [readState, setReadState] = useState<InboxReadState>(EMPTY_READ_STATE);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const conversationListRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollToBottomRef = useRef(false);
  const pendingUnreadScrollTargetRef = useRef<PendingUnreadScrollTarget | null>(null);
  const pendingReadAfterHydrationRef = useRef<PendingReadAfterHydration | null>(null);
  const pendingUnreadAnchorConversationIdentityRef = useRef<string | null>(null);
  const pendingUnreadLastReadAtRef = useRef<string | null>(null);
  const pendingUnreadAnchorMessageIdRef = useRef<string | null>(null);
  const lastSelectedConversationKeyRef = useRef<string | null>(null);
  const lastMessageSignatureRef = useRef<string | null>(null);
  const lastInboundConversationSignatureRef = useRef<string | null>(null);
  const lastInboundConversationTimestampRef = useRef<number | null>(null);
  const humanFlowConversationKeysRef = useRef(new Set<string>());
  const hasInitializedConversationSoundRef = useRef(false);
  const suppressNextConversationRefreshNotificationRef = useRef(false);
  const loadedConversationPageCountRef = useRef(0);
  const notifiedInboundMessageKeysRef = useRef(new Set<string>());
  const primedTimelineNotificationKeysRef = useRef(new Set<string>());
  const outgoingQueueRef = useRef<PendingOutgoingMessage[]>([]);
  const processingOutgoingRef = useRef(false);
  const detailRequestSeqRef = useRef(0);
  const refreshConversationListRef = useRef<((activeSession: AppSession) => Promise<void>) | null>(null);
  const timelineCacheRef = useRef(new Map<string, InboxMessageItem[]>());

  const handleUnauthorized = useCallback(() => {
    clearAppSession();
    router.replace("/app/login");
  }, [router]);

  useEffect(() => {
    if (!error && !errorDetails && !success && !leadError) return;
    if (pauseErrorToast && (error || errorDetails || leadError)) return;
    const timer = window.setTimeout(() => {
      setError(null);
      setErrorDetails(null);
      setPauseErrorToast(false);
      setSuccess(null);
      setLeadError(null);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [error, errorDetails, leadError, pauseErrorToast, success]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(INBOX_SOUND_ENABLED_STORAGE_KEY);
    if (stored === "0") {
      setSoundEnabled(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(INBOX_SOUND_ENABLED_STORAGE_KEY, soundEnabled ? "1" : "0");
  }, [soundEnabled]);

  useEffect(
    () => () => {
      mediaRecorderRef.current?.stop();
      mediaRecorderRef.current = null;
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      audioChunksRef.current = [];
    },
    []
  );

  useEffect(() => {
    const stored = loadAppSession();
    if (!stored?.token) {
      router.replace("/app/login");
      return;
    }
    setSession(stored);
    saveAppSession(stored);
  }, [router]);

  useEffect(() => {
    if (!isAppAdmin(session)) {
      setAdminConnection(null);
      setAdminClientKey(null);
      return;
    }
    setAdminConnection(loadAdminConnection());
  }, [session]);

  useEffect(() => {
    if (!session || !isAppAdmin(session) || !adminConnection?.adminToken.trim()) {
      setAdminClientKey(null);
      setDepartments([]);
      return;
    }
    let cancelled = false;
    fetchAdminClients(adminConnection)
      .then((response) => {
        if (cancelled) return;
        const match = response.items.find((item) => item.id === session.user.clientId);
        setAdminClientKey(match?.clientKey ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setAdminClientKey(null);
      });
    return () => {
      cancelled = true;
    };
  }, [adminConnection, session]);

  useEffect(() => {
    if (!adminConnection || !adminClientKey || session?.user.role !== "ADMIN") {
      setDepartments([]);
      return;
    }
    let cancelled = false;
    fetchDepartments(adminConnection, adminClientKey)
      .then((response) => {
        if (cancelled) return;
        setDepartments(response.items);
      })
      .catch(() => {
        if (cancelled) return;
        setDepartments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [adminClientKey, adminConnection, session?.user.role]);

  const scrollTimelineToBottom = useCallback(() => {
    if (!timelineRef.current) return;
    timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    setShowJumpToLatest(false);
  }, []);

  const isTimelineNearBottom = useCallback(() => {
    const node = timelineRef.current;
    if (!node) return true;
    return node.scrollHeight - node.scrollTop - node.clientHeight <= 160;
  }, []);

  const scrollTimelineToUnreadAnchor = useCallback((onComplete?: () => void) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const node = timelineRef.current;
        const target = node?.querySelector<HTMLElement>("[data-unread-anchor='true']");
        if (!node || !target) return;
        node.scrollTop = Math.max(0, target.offsetTop - node.offsetTop - 24);
        setShowJumpToLatest(true);
        onComplete?.();
      });
    });
  }, []);

  const focusComposer = useCallback(() => {
    if (!composerRef.current) return;
    composerRef.current.focus();
    const caretPosition = composerRef.current.value.length;
    composerRef.current.setSelectionRange(caretPosition, caretPosition);
  }, []);

  const markConversationAsRead = useCallback((
    conversationKey: string,
    activityAt?: string | null,
    waId?: string | null
  ) => {
    if (!activityAt) return;
    setReadState((prev) => {
      const alreadyRead = prev.lastReadAtByConversationKey[conversationKey] === activityAt;
      const alreadyNotUnread = !prev.manuallyUnreadByConversationKey[conversationKey];
      if (alreadyRead && alreadyNotUnread) return prev;
      const nextUnread = { ...prev.manuallyUnreadByConversationKey };
      delete nextUnread[conversationKey];
      return {
        lastReadAtByConversationKey: {
          ...prev.lastReadAtByConversationKey,
          [conversationKey]: activityAt,
        },
        manuallyUnreadByConversationKey: nextUnread,
      };
    });
    if (session && waId) {
      void updateAppConversationReadState(session, waId, {
        unread: false,
        activityAt,
      }).catch(() => undefined);
    }
  }, [session]);

  const completeHydrationRead = useCallback((conversationKey: string) => {
    const pendingRead = pendingReadAfterHydrationRef.current;
    if (!pendingRead || pendingRead.conversationKey !== conversationKey) return;
    pendingReadAfterHydrationRef.current = null;
    pendingUnreadAnchorConversationIdentityRef.current = null;
    pendingUnreadLastReadAtRef.current = null;
    pendingUnreadAnchorMessageIdRef.current = null;
    markConversationAsRead(conversationKey, pendingRead.activityAt, pendingRead.waId);
  }, [markConversationAsRead]);

  const markConversationAsUnread = useCallback((conversationKey: string, waId?: string | null) => {
    setReadState((prev) => ({
      lastReadAtByConversationKey: prev.lastReadAtByConversationKey,
      manuallyUnreadByConversationKey: {
        ...prev.manuallyUnreadByConversationKey,
        [conversationKey]: true,
      },
    }));
    if (session && waId) {
      void updateAppConversationReadState(session, waId, {
        unread: true,
      }).catch(() => undefined);
    }
  }, [session]);

  const applyRealtimeStatusUpdated = useCallback((
    event: Extract<AppRealtimeEvent, { type: "message.status.updated" }>
  ) => {
    if (!session || event.clientId !== session.user.clientId) return;
    const conversationKey = event.waIdCanonical ?? event.waId ?? null;

    setMessages((prev) => {
      const nextMessages = applyStatusUpdateToMessages(prev, event);
      if (nextMessages !== prev && selectedConversationWaId) {
        timelineCacheRef.current.set(selectedConversationWaId, nextMessages);
      }
      return nextMessages;
    });

    for (const [cacheKey, cacheMessages] of timelineCacheRef.current.entries()) {
      if (conversationKey && cacheKey !== conversationKey && cacheKey !== event.waId) {
        continue;
      }
      const nextMessages = applyStatusUpdateToMessages(cacheMessages, event);
      if (nextMessages !== cacheMessages) {
        timelineCacheRef.current.set(cacheKey, nextMessages);
      }
    }

    setConversations((prev) =>
      prev.map((item) => {
        const itemKey = getConversationIdentity(item);
        if (
          conversationKey &&
          itemKey !== conversationKey &&
          item.waId !== event.waId &&
          item.waIdCanonical !== event.waIdCanonical
        ) {
          return item;
        }
        if (!item.lastMessage) return item;
        const lastMessage = item.lastMessage;
        const matchesLastMessage =
          (event.metaMessageId && lastMessage.messageId === event.metaMessageId) ||
          (event.messageId && lastMessage.messageId === event.messageId);
        if (!matchesLastMessage || !shouldApplyStatusUpdate(lastMessage.status, event.status)) {
          return item;
        }
        return {
          ...item,
          lastMessage: {
            ...lastMessage,
            status: event.status,
          },
        };
      })
    );
  }, [selectedConversationWaId, session]);

  const applyRealtimeEvent = useCallback((event: AppRealtimeEvent) => {
    if (event.type === "message.status.updated") {
      applyRealtimeStatusUpdated(event);
      return;
    }
    if (!session || event.clientId !== session.user.clientId) return;
    if (event.type === "conversation.handoff.updated") {
      const conversationKey = event.waIdCanonical ?? event.waId;
      let matchedConversation = false;
      setConversations((prev) => {
        const nextItems = prev.map((item) => {
          const itemKey = getConversationIdentity(item);
          if (
            itemKey !== conversationKey &&
            item.waId !== event.waId &&
            item.waIdCanonical !== event.waIdCanonical
          ) {
            return item;
          }
          matchedConversation = true;
          return {
            ...item,
            waIdCanonical: item.waIdCanonical ?? event.waIdCanonical ?? null,
            mode: event.mode,
            handoffStatus: event.handoffStatus,
            status:
              item.status === "CLOSED"
                ? item.status
                : item.status ?? "WAITING",
          };
        });
        if (!matchedConversation) {
          void refreshConversationListRef.current?.(session);
        }
        return dedupeConversationsByIdentity(nextItems);
      });
      if (selectedConversationKey !== conversationKey && selectedConversationWaId !== event.waId) {
        markConversationAsUnread(conversationKey, event.waId);
      }
      return;
    }
    if (event.type !== "message.created") return;
    const conversationKey = event.waIdCanonical ?? event.waId;
    const message = event.message;

    if (message.direction === "INBOUND") {
      countUnseenInboundMessages(
        conversationKey,
        [message],
        notifiedInboundMessageKeysRef.current
      );
    }

    let matchedConversation = false;
    setConversations((prev) => {
      const nextItems = prev.map((item) => {
          const itemKey = getConversationIdentity(item);
          if (
            itemKey !== conversationKey &&
            item.waId !== event.waId &&
            item.waIdCanonical !== event.waIdCanonical
          ) {
            return item;
          }
          matchedConversation = true;
          return {
            ...item,
            waIdCanonical: item.waIdCanonical ?? event.waIdCanonical ?? null,
            lastMessage: {
              direction: message.direction,
              type: message.type,
              status: message.status,
              messageId: message.messageId,
              bodyText: message.bodyText,
              templateName: message.templateName,
              createdAt: message.createdAt,
            },
            lastInboundAt: message.direction === "INBOUND" ? message.createdAt : item.lastInboundAt,
          };
        });
      if (!matchedConversation) {
        void refreshConversationListRef.current?.(session);
      }
      return dedupeConversationsByIdentity(nextItems);
    });

    if (selectedConversationKey === conversationKey || selectedConversationWaId === event.waId) {
      const shouldStickToBottom = isTimelineNearBottom();
      setMessages((prev) => {
        const nextMessages = mergeMessagesByIdentity(prev, [message]);
        timelineCacheRef.current.set(selectedConversationWaId ?? event.waId, nextMessages);
        return nextMessages;
      });
      setMessagesConversationKey(conversationKey);
      shouldScrollToBottomRef.current = shouldStickToBottom;
      return;
    }

    markConversationAsUnread(conversationKey, event.waId);
  }, [
    applyRealtimeStatusUpdated,
    markConversationAsUnread,
    isTimelineNearBottom,
    selectedConversationKey,
    selectedConversationWaId,
    session,
  ]);

  useEffect(() => {
    return addAppRealtimeListener(applyRealtimeEvent);
  }, [applyRealtimeEvent]);

  const buildConversationNotificationRequest = useCallback((
    item: InboxConversationItem,
    isHandoffTransition = false
  ) => {
    if (!shouldPlayInboundNotificationForConversation(item)) return null;
    const wasAccepted = handleRealtimeNotificationCandidate({
      source: "polling",
      kind: isHandoffTransition ? "handoff" : "message",
      conversationIdentity: getConversationIdentity(item),
      messageId: item.lastMessage?.messageId ?? null,
      createdAt: item.lastInboundAt ?? item.lastMessage?.createdAt ?? null,
      bodyText: item.lastMessage?.bodyText ?? null,
      direction: "INBOUND",
      mode: item.mode,
      handoffStatus: item.handoffStatus ?? "none",
    });
    return wasAccepted;
  }, []);

  const isAdminUser = useMemo(() => isAppAdmin(session), [session]);

  const buildConversationFetchOptions = useCallback((cursor?: string | null) => {
    const search = conversationSearch.trim();
    const status =
      conversationFilter === "WAITING" ||
      conversationFilter === "IN_PROGRESS" ||
      conversationFilter === "WAITING_USER" ||
      conversationFilter === "CLOSED"
        ? conversationFilter
        : null;
    return {
      limit: CONVERSATION_PAGE_SIZE,
      cursor,
      status,
      departmentId: isAdminUser && departmentFilter !== "ALL" ? departmentFilter : null,
      assignedUserId: conversationFilter === "MINE" ? session?.user.id ?? null : null,
      unassigned: conversationFilter === "UNASSIGNED",
      search: search || null,
    };
  }, [conversationFilter, conversationSearch, departmentFilter, isAdminUser, session?.user.id]);

  const conversationQueryKey = useMemo(
    () => JSON.stringify(buildConversationFetchOptions(null)),
    [buildConversationFetchOptions]
  );

  const refreshConversationList = useCallback(async (activeSession: AppSession) => {
    const response = await fetchAppConversations(activeSession, buildConversationFetchOptions(null));
    if (response.readState) {
      setReadState((current) => mergeReadStatePreservingLocal(current, response.readState!));
    }
    const pageItems = response.conversations ?? response.items;
    if (loadedConversationPageCountRef.current <= 1) {
      setConversationNextCursor(response.nextCursor ?? null);
      loadedConversationPageCountRef.current = 1;
    }
    const sortedItems = dedupeConversationsByIdentity(pageItems);
    const latestInboundSignature = getLatestInboundConversationSignature(sortedItems);
    const latestInboundTimestamp = getLatestInboundConversationTimestamp(sortedItems);
    const humanFlowConversationKeys = getHumanFlowConversationKeys(sortedItems);
    const suppressRefreshNotifications = suppressNextConversationRefreshNotificationRef.current;
    if (suppressRefreshNotifications) {
      hasInitializedConversationSoundRef.current = true;
    } else if (hasInitializedConversationSoundRef.current) {
      let notifiedHandoffTransition = false;
      for (const item of sortedItems) {
        const conversationKey = getConversationIdentity(item);
        if (
          humanFlowConversationKeys.has(conversationKey) &&
          !humanFlowConversationKeysRef.current.has(conversationKey)
        ) {
          if (buildConversationNotificationRequest(item, true)) {
            notifiedHandoffTransition = true;
          }
        }
      }

      if (
        !notifiedHandoffTransition &&
        latestInboundSignature &&
        latestInboundSignature !== lastInboundConversationSignatureRef.current &&
        latestInboundTimestamp !== null &&
        (lastInboundConversationTimestampRef.current === null ||
          latestInboundTimestamp > lastInboundConversationTimestampRef.current)
      ) {
        const latestInboundItem = sortedItems.find(
          (item) =>
            shouldPlayInboundNotificationForConversation(item) &&
            item.lastInboundAt &&
            Date.parse(item.lastInboundAt) === latestInboundTimestamp
        );
        const latestInboundConversationKey = latestInboundItem
          ? getConversationIdentity(latestInboundItem)
          : null;
        if (
          latestInboundItem &&
          latestInboundConversationKey !== selectedConversationKey
        ) {
          buildConversationNotificationRequest(latestInboundItem);
        }
      }
    } else {
      hasInitializedConversationSoundRef.current = true;
    }
    lastInboundConversationSignatureRef.current = latestInboundSignature;
    lastInboundConversationTimestampRef.current = latestInboundTimestamp;
    humanFlowConversationKeysRef.current = humanFlowConversationKeys;
    suppressNextConversationRefreshNotificationRef.current = false;
    const previousListScrollTop = conversationListRef.current?.scrollTop ?? null;
    setConversations((current) => mergeConversationsPreservingStableOrder(current, sortedItems));
    if (previousListScrollTop !== null) {
      window.requestAnimationFrame(() => {
        if (conversationListRef.current) {
          conversationListRef.current.scrollTop = previousListScrollTop;
        }
      });
    }
    if (!selectedConversationKey) {
      return;
    }
    const selectedItem = sortedItems.find(
      (item) => getConversationIdentity(item) === selectedConversationKey
    );
    if (!selectedItem) {
      return;
    }

    if (document.visibilityState !== "visible") return;
    const waitingForUnreadAnchor =
      pendingUnreadScrollTargetRef.current?.conversationKey === selectedConversationKey;
    const activeConversation = sortedItems.find(
      (item) => getConversationIdentity(item) === selectedConversationKey
    );
    if (activeConversation && !loadingMessages && !waitingForUnreadAnchor) {
      markConversationAsRead(
        getConversationIdentity(activeConversation),
        getConversationActivityAt(activeConversation),
        activeConversation.waId
      );
    }
  }, [
    buildConversationFetchOptions,
    buildConversationNotificationRequest,
    loadingMessages,
    markConversationAsRead,
    selectedConversationKey,
  ]);

  const loadMoreConversations = useCallback(async () => {
    if (!session || !conversationNextCursor || loadingConversationsPage) return;
    setLoadingConversationsPage(true);
    setError(null);
    try {
      const response = await fetchAppConversations(
        session,
        buildConversationFetchOptions(conversationNextCursor)
      );
      if (response.readState) {
        setReadState((current) => mergeReadStatePreservingLocal(current, response.readState!));
      }
      setConversationNextCursor(response.nextCursor ?? null);
      loadedConversationPageCountRef.current += 1;
      const pageItems = dedupeConversationsByIdentity(response.conversations ?? response.items);
      setConversations((current) => dedupeConversationsByIdentity([...current, ...pageItems]));
    } catch (err) {
      if ((err as { status?: number }).status === 401) {
        handleUnauthorized();
        return;
      }
      setError((err as { message?: string }).message || "Falha ao carregar mais conversas.");
    } finally {
      setLoadingConversationsPage(false);
    }
  }, [
    buildConversationFetchOptions,
    conversationNextCursor,
    handleUnauthorized,
    loadingConversationsPage,
    session,
  ]);

  useEffect(() => {
    refreshConversationListRef.current = refreshConversationList;
    return () => {
      if (refreshConversationListRef.current === refreshConversationList) {
        refreshConversationListRef.current = null;
      }
    };
  }, [refreshConversationList]);

  const refreshSelectedTimeline = useCallback(async (
    activeSession: AppSession,
    waId: string,
    mode: "replace" | "append" = "replace"
  ) => {
    const requestSeq = ++detailRequestSeqRef.current;
    const latestKnownAt =
      mode === "append" && selectedConversationWaId === waId && messages.length > 0
        ? messages[messages.length - 1]?.createdAt ?? null
        : null;
    const shouldStickToBottom = mode === "append" && isTimelineNearBottom();
    const response = await fetchAppConversation(activeSession, waId, {
      order: mode === "append" ? "asc" : "desc",
      limit: mode === "append" ? 80 : 300,
      after: latestKnownAt,
    });
    if (requestSeq !== detailRequestSeqRef.current) return;
    const responseConversationKey = response.waIdCanonical ?? response.waId ?? waId;
    if (
      selectedConversationKey &&
      responseConversationKey !== selectedConversationKey &&
      response.waId !== selectedConversationWaId
    ) {
      return;
    }
    if (mode === "append") {
      if (
        latestKnownAt &&
        primedTimelineNotificationKeysRef.current.has(responseConversationKey)
      ) {
        countUnseenInboundMessages(
          responseConversationKey,
          response.items,
          notifiedInboundMessageKeysRef.current
        );
      } else {
        rememberInboundMessages(
          responseConversationKey,
          response.items,
          notifiedInboundMessageKeysRef.current
        );
      }
      primedTimelineNotificationKeysRef.current.add(responseConversationKey);
    } else {
      rememberInboundMessages(
        responseConversationKey,
        response.items,
        notifiedInboundMessageKeysRef.current
      );
      primedTimelineNotificationKeysRef.current.add(responseConversationKey);
    }
    const responseItems = mode === "append" ? response.items : sortMessagesAscending(response.items);
    setMessages((prev) => {
      const nextMessages = mode === "append" ? mergeMessagesByIdentity(prev, responseItems) : responseItems;
      timelineCacheRef.current.set(waId, nextMessages);
      return nextMessages;
    });
    if (shouldStickToBottom) {
      shouldScrollToBottomRef.current = true;
    }
    setMessagesConversationKey(responseConversationKey);
    setConversations((prev) =>
      updateConversationInPlace(prev, responseConversationKey, (item) =>
        applyConversationOperationalPayload(item, response)
      )
    );
    const latestActivityAt =
      (responseItems.length > 0
        ? responseItems[responseItems.length - 1]?.createdAt
        : latestKnownAt) ?? null;
    if (document.visibilityState === "visible") {
      markConversationAsRead(responseConversationKey, latestActivityAt, response.waId ?? waId);
    }
  }, [isTimelineNearBottom, markConversationAsRead, messages, selectedConversationKey, selectedConversationWaId]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    fetchAppUsers(session)
      .then((response) => {
        if (cancelled) return;
        setUsers(response.items);
      })
      .catch((err: { status?: number; message?: string }) => {
        if (cancelled) return;
        if (err.status === 401) {
          handleUnauthorized();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [handleUnauthorized, session]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setLoadingConversations(true);
    setConversationNextCursor(null);
    loadedConversationPageCountRef.current = 0;
    suppressNextConversationRefreshNotificationRef.current = true;
    setConversations([]);
    setError(null);

    const loadConversations = refreshConversationListRef.current ?? refreshConversationList;
    loadConversations(session)
      .catch((err: { status?: number; message?: string }) => {
        if (cancelled) return;
        if (err.status === 401) {
          handleUnauthorized();
          return;
        }
        suppressNextConversationRefreshNotificationRef.current = false;
        setError(err.message || "Falha ao carregar conversas.");
      })
      .finally(() => {
        if (!cancelled) setLoadingConversations(false);
      });

    return () => {
      cancelled = true;
    };
  }, [conversationQueryKey, handleUnauthorized, session]);

  useEffect(() => {
    if (!session || !selectedConversationWaId) {
      setLoadingMessages(false);
      return;
    }
    let cancelled = false;
    const requestSeq = ++detailRequestSeqRef.current;
    const shouldRefreshUnreadWindow =
      pendingUnreadScrollTargetRef.current?.conversationKey === selectedConversationKey;
    const cachedMessages = timelineCacheRef.current.get(selectedConversationWaId);
    const shouldStickToBottomAfterHydration = !shouldRefreshUnreadWindow && isTimelineNearBottom();
    setLoadingMessages(true);
    setError(null);
    setMessages(cachedMessages ?? []);
    setMessagesConversationKey(cachedMessages ? selectedConversationKey : null);

    fetchAppConversation(session, selectedConversationWaId, {
      order: "desc",
      limit: 500,
      after: null,
    })
      .then((response) => {
        if (cancelled || requestSeq !== detailRequestSeqRef.current) return;
        const responseConversationKey = response.waIdCanonical ?? response.waId ?? selectedConversationWaId;
        if (responseConversationKey !== selectedConversationKey && response.waId !== selectedConversationWaId) {
          return;
        }
        const visibleConversationKey = selectedConversationKey ?? responseConversationKey;
        rememberInboundMessages(
          responseConversationKey,
          response.items,
          notifiedInboundMessageKeysRef.current
        );
        primedTimelineNotificationKeysRef.current.add(responseConversationKey);
        const responseItems = sortMessagesAscending(response.items);
        setMessages((prev) => {
          const nextMessages =
            cachedMessages?.length && shouldRefreshUnreadWindow
              ? mergeMessagesByIdentity(prev, responseItems)
              : responseItems;
          timelineCacheRef.current.set(selectedConversationWaId, nextMessages);
          return nextMessages;
        });
        if (shouldStickToBottomAfterHydration) {
          shouldScrollToBottomRef.current = true;
        }
        setMessagesConversationKey(visibleConversationKey);
        setConversations((prev) =>
          updateConversationInPlace(prev, responseConversationKey, (item) =>
            applyConversationOperationalPayload(item, response)
          )
        );
      })
      .catch((err: { status?: number; message?: string }) => {
        if (cancelled || requestSeq !== detailRequestSeqRef.current) return;
        if (err.status === 401) {
          handleUnauthorized();
          return;
        }
        setError(err.message || "Falha ao carregar timeline.");
      })
      .finally(() => {
        if (!cancelled) setLoadingMessages(false);
      });

    return () => {
      cancelled = true;
    };
  }, [handleUnauthorized, isTimelineNearBottom, selectedConversationKey, selectedConversationWaId, session]);

  useEffect(() => {
    const selectedChanged = lastSelectedConversationKeyRef.current !== selectedConversationKey;
    if (selectedChanged) {
      lastSelectedConversationKeyRef.current = selectedConversationKey;
      lastMessageSignatureRef.current = null;
      if (pendingUnreadAnchorConversationIdentityRef.current !== selectedConversationKey) {
        setUnreadSeparatorIndex(null);
        setUnreadAnchorMessageIdentity(null);
      }
    }

    lastMessageSignatureRef.current = getLatestMessageSignature(messages);

    if (!selectedConversationKey) return;
    if (messagesConversationKey !== selectedConversationKey) return;
    const frame = window.requestAnimationFrame(() => {
      const unreadTarget = pendingUnreadScrollTargetRef.current;
      if (unreadTarget?.conversationKey === selectedConversationKey) {
        const lastReadAtBeforeOpen =
          pendingUnreadLastReadAtRef.current ?? unreadTarget.lastReadAt;
        const unreadIndex = findFirstUnreadMessageIndex(messages, lastReadAtBeforeOpen);
        const unreadMessage = unreadIndex >= 0 ? messages[unreadIndex] : null;
        if (unreadMessage) {
          const unreadMessageIdentity = getMessageIdentity(unreadMessage);
          pendingUnreadAnchorMessageIdRef.current = unreadMessageIdentity;
          setUnreadSeparatorIndex(unreadIndex);
          setUnreadAnchorMessageIdentity(unreadMessageIdentity);
          pendingUnreadScrollTargetRef.current = null;
          shouldScrollToBottomRef.current = false;
          scrollTimelineToUnreadAnchor(() => completeHydrationRead(selectedConversationKey));
          return;
        }
        if (loadingMessages) return;
        pendingUnreadScrollTargetRef.current = null;
        pendingUnreadAnchorConversationIdentityRef.current = null;
        pendingUnreadLastReadAtRef.current = null;
        pendingUnreadAnchorMessageIdRef.current = null;
        setUnreadSeparatorIndex(null);
        setUnreadAnchorMessageIdentity(null);
        shouldScrollToBottomRef.current = true;
      }

      if (
        shouldScrollToBottomRef.current &&
        !pendingUnreadAnchorMessageIdRef.current &&
        !pendingUnreadAnchorConversationIdentityRef.current
      ) {
        scrollTimelineToBottom();
        shouldScrollToBottomRef.current = false;
        completeHydrationRead(selectedConversationKey);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    loadingMessages,
    messages,
    messagesConversationKey,
    completeHydrationRead,
    scrollTimelineToBottom,
    scrollTimelineToUnreadAnchor,
    selectedConversationKey,
  ]);

  useEffect(() => {
    const node = timelineRef.current;
    if (!node) return;

    const updateJumpState = () => {
      const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
      setShowJumpToLatest(distanceFromBottom > 160);
    };

    updateJumpState();
    node.addEventListener("scroll", updateJumpState, { passive: true });
    return () => node.removeEventListener("scroll", updateJumpState);
  }, [messages, selectedConversationKey]);

  useEffect(() => {
    if (!session) return;
    let polling = false;
    const interval = window.setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        await refreshConversationList(session);
        if (
          selectedConversationWaId &&
          !loadingMessages &&
          messagesConversationKey === selectedConversationKey
        ) {
          await refreshSelectedTimeline(session, selectedConversationWaId, "append");
        }
      } catch (err) {
        if ((err as { status?: number }).status === 401) {
          handleUnauthorized();
        }
      } finally {
        polling = false;
      }
    }, 2000);

    return () => window.clearInterval(interval);
  }, [
    handleUnauthorized,
    loadingMessages,
    messagesConversationKey,
    refreshConversationList,
    refreshSelectedTimeline,
    selectedConversationKey,
    selectedConversationWaId,
    session,
  ]);

  const selectedConversation = useMemo(
    () =>
      conversations.find((item) => getConversationIdentity(item) === selectedConversationKey) ?? null,
    [conversations, selectedConversationKey]
  );

  useEffect(() => {
    setActiveInboxConversation(selectedConversationWaId, selectedConversation?.waIdCanonical ?? null);
    return () => setActiveInboxConversation(null);
  }, [selectedConversation?.waIdCanonical, selectedConversationWaId]);

  const departmentOptions = useMemo<DepartmentOption[]>(() => {
    if (departments.length > 0) {
      return departments.map((department) => ({
        id: department.id,
        name: department.name,
      }));
    }
    const items = new Map<string, string>();
    conversations.forEach((item) => {
      if (!item.departmentId) return;
      items.set(item.departmentId, item.departmentName || item.departmentId);
    });
    return Array.from(items.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [conversations, departments]);

  const filteredConversations = useMemo(() => {
    return conversations.filter((item) => {
      const searchTerm = conversationSearch.trim().toLowerCase();
      if (searchTerm) {
        const haystack = [
          item.leadName,
          item.leadPhone,
          item.waId,
          item.lastMessage?.bodyText,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(searchTerm)) {
          return false;
        }
      }
      if (isAdminUser && departmentFilter !== "ALL") {
        if ((item.departmentId ?? null) !== departmentFilter) {
          return false;
        }
      }
      const status = getConversationOperationalStatus(item);
      switch (conversationFilter) {
        case "WAITING":
        case "IN_PROGRESS":
        case "WAITING_USER":
        case "CLOSED":
          return status === conversationFilter;
        case "MINE":
          return item.assignedUserId === session?.user.id;
        case "UNASSIGNED":
          return !item.assignedUserId;
        default:
          return true;
      }
    });
  }, [conversationFilter, conversationSearch, conversations, departmentFilter, isAdminUser, session?.user.id]);

  const canReply = useMemo(
    () => (session ? canReplyToConversation(selectedConversation, session.user.id) : false),
    [selectedConversation, session]
  );
  const isHydratingSelectedTimeline =
    Boolean(selectedConversationWaId) &&
    loadingMessages &&
    messagesConversationKey !== selectedConversationKey;
  const isRefreshingSelectedTimeline =
    Boolean(selectedConversationWaId) &&
    loadingMessages &&
    messages.length > 0 &&
    messagesConversationKey === selectedConversationKey;

  const isSelectedConversationLocked = useMemo(
    () => (session ? isConversationAssignedToAnotherUser(selectedConversation, session.user.id) : false),
    [selectedConversation, session]
  );

  const isSelectedConversationOwnedByCurrentUser = useMemo(
    () =>
      (session
        ? isConversationAssignedToCurrentUser(selectedConversation, session.user.id)
        : false),
    [selectedConversation, session]
  );

  const canManageSelectedConversation = useMemo(
    () => Boolean(selectedConversationWaId) && isSelectedConversationOwnedByCurrentUser,
    [isSelectedConversationOwnedByCurrentUser, selectedConversationWaId]
  );

  const canTransferSelectedConversation = useMemo(
    () =>
      Boolean(selectedConversationWaId) &&
      (isAdminUser || isSelectedConversationOwnedByCurrentUser),
    [isAdminUser, isSelectedConversationOwnedByCurrentUser, selectedConversationWaId]
  );

  const canTransferDepartment = useMemo(
    () =>
      Boolean(
        isAdminUser &&
          selectedConversationWaId &&
          adminClientKey &&
          adminConnection?.baseUrl.trim() &&
          adminConnection.adminToken.trim()
      ),
    [adminClientKey, adminConnection, isAdminUser, selectedConversationWaId]
  );

  useEffect(() => {
    if (!selectedConversation) {
      setStatusActionDraft("");
      setTransferUserId("");
      setTransferDepartmentId("");
      return;
    }
    const currentStatus = getConversationOperationalStatus(selectedConversation);
    setStatusActionDraft(
      currentStatus && ["IN_PROGRESS", "WAITING_USER", "CLOSED"].includes(currentStatus)
        ? currentStatus
        : ""
    );
    setTransferUserId(selectedConversation.assignedUserId ?? "");
    setTransferDepartmentId(selectedConversation.departmentId ?? "");
  }, [selectedConversationKey]);

  useEffect(() => {
    if (!selectedConversationWaId || !canReply || sendingMessage || conversationAction) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      focusComposer();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    focusComposer,
    canReply,
    selectedConversationKey,
    selectedConversationWaId,
    sendingMessage,
    conversationAction,
  ]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible" || !selectedConversation) return;
      markConversationAsRead(
        getConversationIdentity(selectedConversation),
        getConversationActivityAt(selectedConversation),
        selectedConversation.waId
      );
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [markConversationAsRead, selectedConversation]);

  const selectedLead = useMemo(() => {
    if (!selectedConversation?.leadId) return null;
    return {
      id: selectedConversation.leadId,
      name: selectedConversation.leadName,
      phone: selectedConversation.leadPhone,
      city: selectedConversation.leadCity,
      service: selectedConversation.leadService,
      status: selectedConversation.leadStatus as LeadStatus | null,
    };
  }, [selectedConversation]);

  useEffect(() => {
    setStatusDraft((selectedLead?.status as LeadStatus | null) ?? "");
  }, [selectedLead?.id, selectedLead?.status]);

  useEffect(() => {
    setLeadNameDraft(selectedLead?.name ?? "");
  }, [selectedLead?.id, selectedLead?.name]);

  useEffect(() => {
    if (!session || !selectedLead?.id) {
      setLeadNotes([]);
      setLeadError(null);
      return;
    }
    let cancelled = false;
    setLoadingLeadNotes(true);
    setLeadError(null);
    fetchAppLeadNotes(session, selectedLead.id)
      .then((response) => {
        if (cancelled) return;
        setLeadNotes(response.items);
      })
      .catch((err: { status?: number; message?: string }) => {
        if (cancelled) return;
        if (err.status === 401) {
          handleUnauthorized();
          return;
        }
        setLeadError(err.message || "Falha ao carregar notas do lead.");
      })
      .finally(() => {
        if (!cancelled) setLoadingLeadNotes(false);
      });
    return () => {
      cancelled = true;
    };
  }, [handleUnauthorized, selectedLead?.id, session]);

  const handleSaveLeadStatus = async () => {
    if (!session || !selectedLead?.id || !statusDraft) return;
    if (!isSelectedConversationOwnedByCurrentUser) {
      setLeadError("Assuma a conversa para editar os dados do CRM.");
      return;
    }
    setSavingLeadStatus(true);
    setLeadError(null);
    try {
      const response = await updateAppLeadStatus(session, selectedLead.id, statusDraft);
      setConversations((prev) =>
        prev.map((item) =>
          item.leadId === response.lead.id ? { ...item, leadStatus: response.lead.status } : item
        )
      );
    } catch (err) {
      const typed = err as { status?: number; message?: string };
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setLeadError(typed.message || "Falha ao atualizar status do lead.");
    } finally {
      setSavingLeadStatus(false);
    }
  };

  const handleAddLeadNote = async () => {
    if (!session || !selectedLead?.id) return;
    if (!isSelectedConversationOwnedByCurrentUser) {
      setLeadError("Assuma a conversa para editar os dados do CRM.");
      return;
    }
    const body = noteDraft.trim();
    if (!body) return;
    setSavingLeadNote(true);
    setLeadError(null);
    try {
      const response = await createAppLeadNote(session, selectedLead.id, body);
      setLeadNotes((prev) => [response.note, ...prev]);
      setNoteDraft("");
    } catch (err) {
      const typed = err as { status?: number; message?: string };
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setLeadError(typed.message || "Falha ao registrar nota.");
    } finally {
      setSavingLeadNote(false);
    }
  };

  const handleSaveLeadName = async () => {
    if (!session || !selectedLead?.id) return;
    if (!isSelectedConversationOwnedByCurrentUser) {
      setLeadError("Assuma a conversa para editar os dados do CRM.");
      return;
    }
    setSavingLeadName(true);
    setLeadError(null);
    try {
      const response = await updateAppLead(session, selectedLead.id, { name: leadNameDraft.trim() || null });
      setConversations((prev) =>
        prev.map((item) =>
          item.leadId === response.lead.id ? { ...item, leadName: response.lead.name } : item
        )
      );
    } catch (err) {
      const typed = err as { status?: number; message?: string };
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setLeadError(typed.message || "Falha ao salvar nome do contato.");
    } finally {
      setSavingLeadName(false);
    }
  };

  const processOutgoingQueue = useCallback(async () => {
    if (!session || processingOutgoingRef.current) return;
    processingOutgoingRef.current = true;
    setSendingMessage(true);
    try {
      while (outgoingQueueRef.current.length > 0) {
        const next = outgoingQueueRef.current.shift();
        setQueuedMessageCount(outgoingQueueRef.current.length);
        if (!next) continue;
        try {
          const response = await sendAppConversationMessage(session, next.waId, next.text);
          shouldScrollToBottomRef.current = true;
          if (selectedConversationWaId === next.waId) {
            const outboundMessage: InboxMessageItem = {
              direction: "OUTBOUND",
              type: "TEXT",
              status: response.message.status,
              intent: null,
              bodyText: next.text,
              media: null,
              templateName: null,
              templateLang: null,
              requestId: null,
              messageId: response.message.messageId,
              metaMessageId: response.message.metaMessageId,
              errorBody: null,
              createdAt: response.message.createdAt,
            };
            setMessages((prev) => {
              const nextMessages = mergeMessagesByIdentity(prev, [outboundMessage]);
              timelineCacheRef.current.set(next.waId, nextMessages);
              return nextMessages;
            });
            setMessagesConversationKey(next.conversationKey);
          }
          setConversations((prev) =>
            dedupeConversationsByIdentity(
              prev.map((item) =>
                getConversationIdentity(item) === next.conversationKey
                  ? {
                      ...applyConversationOperationalPayload(item, response),
                      lastMessage: {
                        direction: "OUTBOUND",
                        type: "TEXT",
                        status: response.message.status,
                        messageId: response.message.messageId,
                        bodyText: next.text,
                        templateName: null,
                        createdAt: response.message.createdAt,
                      },
                      updatedAt: response.message.createdAt,
                    }
                  : item
              )
            )
          );
          markConversationAsRead(
            response.waIdCanonical ?? next.conversationKey,
            response.message.createdAt,
            next.waId
          );
        } catch (err) {
          const typed = err as { status?: number; message?: string; details?: string };
          if (typed.status === 401) {
            handleUnauthorized();
            return;
          }
          if (selectedConversationWaId === next.waId) {
            setMessageDraft((current) => (current.trim() ? `${current}\n${next.text}` : next.text));
          }
          setError(typed.message || "Falha ao enviar mensagem.");
          setErrorDetails(typed.details || null);
          break;
        }
      }
    } finally {
      processingOutgoingRef.current = false;
      setQueuedMessageCount(outgoingQueueRef.current.length);
      setSendingMessage(false);
      focusComposer();
    }
  }, [handleUnauthorized, selectedConversationWaId, session]);

  const handleSendMessage = async () => {
    if (!session || !selectedConversationWaId || !selectedConversation) return;
    if (!canReply) {
      setError("Assuma a conversa para responder manualmente.");
      setErrorDetails(null);
      return;
    }
    const text = messageDraft.trim();
    if (!text) return;
    const queuedMessage: PendingOutgoingMessage = {
      waId: selectedConversationWaId,
      conversationKey: getConversationIdentity(selectedConversation),
      text,
    };
    setMessageDraft("");
    setError(null);
    setErrorDetails(null);
    outgoingQueueRef.current.push(queuedMessage);
    setQueuedMessageCount(outgoingQueueRef.current.length);
    void processOutgoingQueue();
    focusComposer();
  };

  const sendMediaFile = useCallback(
    async (file: File, caption?: string) => {
      if (!session || !selectedConversationWaId || !selectedConversation) return;
      if (!canReply) {
        setError("Assuma a conversa para responder manualmente.");
        setErrorDetails(null);
        return;
      }

      setSendingMessage(true);
      setError(null);
      setErrorDetails(null);
      try {
        const response = await sendAppConversationMedia(
          session,
          selectedConversationWaId,
          file,
          caption?.trim() || undefined
        );
        setSelectedMediaFile(null);
        setMessageDraft("");
        if (mediaInputRef.current) {
          mediaInputRef.current.value = "";
        }
        shouldScrollToBottomRef.current = true;
        const outboundMessage: InboxMessageItem = {
          direction: "OUTBOUND",
          type: response.message.type,
          status: response.message.status,
          intent: null,
          bodyText: response.message.bodyText,
          media: response.message.media
            ? {
                ...response.message.media,
                fileName: response.message.media.fileName ?? undefined,
                caption: response.message.media.caption ?? undefined,
              }
            : null,
          templateName: null,
          templateLang: null,
          requestId: null,
          messageId: response.message.messageId,
          metaMessageId: response.message.metaMessageId,
          errorBody: null,
          createdAt: response.message.createdAt,
        };
        setMessages((prev) => {
          const nextMessages = mergeMessagesByIdentity(prev, [outboundMessage]);
          timelineCacheRef.current.set(selectedConversationWaId, nextMessages);
          return nextMessages;
        });
        setMessagesConversationKey(getConversationIdentity(selectedConversation));
        setConversations((prev) =>
          dedupeConversationsByIdentity(
            prev.map((item) =>
              getConversationIdentity(item) === getConversationIdentity(selectedConversation)
                ? {
                    ...applyConversationOperationalPayload(item, response),
                    lastMessage: {
                      direction: "OUTBOUND",
                      type: response.message.type,
                      status: response.message.status,
                      messageId: response.message.messageId,
                      bodyText: response.message.bodyText,
                      templateName: null,
                      createdAt: response.message.createdAt,
                    },
                    updatedAt: response.message.createdAt,
                  }
                : item
            )
          )
        );
        markConversationAsRead(
          response.waIdCanonical ?? getConversationIdentity(selectedConversation),
          response.message.createdAt,
          selectedConversation.waId
        );
      } catch (err) {
        const typed = err as { status?: number; message?: string; details?: string };
        if (typed.status === 401) {
          handleUnauthorized();
          return;
        }
        setError(typed.message || "Falha ao enviar arquivo.");
        setErrorDetails(typed.details || null);
      } finally {
        setSendingMessage(false);
        focusComposer();
      }
    },
    [
      canReply,
      focusComposer,
      handleUnauthorized,
      selectedConversation,
      selectedConversationWaId,
      session,
    ]
  );

  const handleSendMedia = async () => {
    if (!selectedMediaFile) return;
    await sendMediaFile(selectedMediaFile, messageDraft);
  };

  const handlePrimarySend = async () => {
    if (selectedMediaFile) {
      await handleSendMedia();
      return;
    }
    await handleSendMessage();
  };

  const handleToggleAudioRecording = async () => {
    if (!selectedConversationWaId) return;
    if (!canReply) {
      setError("Assuma a conversa para responder manualmente.");
      setErrorDetails(null);
      return;
    }

    if (audioRecordingState === "recording") {
      setAudioRecordingState("stopping");
      mediaRecorderRef.current?.stop();
      return;
    }

    if (audioRecordingState !== "idle" || sendingMessage || selectedMediaFile) return;
    if (typeof window === "undefined" || !window.navigator.mediaDevices?.getUserMedia) {
      setError("Gravacao de audio nao suportada neste navegador.");
      setErrorDetails(null);
      return;
    }

    try {
      setError(null);
      setErrorDetails(null);
      const mimeType = getSupportedRecordingMimeType();
      if (!mimeType) {
        setError("Este navegador nao grava audio em formato compativel com o WhatsApp.");
        setErrorDetails("Use upload de arquivo de audio ou tente outro navegador.");
        return;
      }
      const stream = await window.navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener("stop", () => {
        const nextMimeType = normalizeRecordedAudioMimeType(recorder.mimeType || mimeType);
        const extension = getRecordingFileExtension(nextMimeType);
        const blob = new Blob(audioChunksRef.current, { type: nextMimeType });
        audioChunksRef.current = [];
        mediaRecorderRef.current = null;
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        setAudioRecordingState("idle");
        if (!blob.size) {
          setError("Nao foi possivel capturar o audio.");
          setErrorDetails(null);
          return;
        }
        const file = new File([blob], `audio-${Date.now()}.${extension}`, { type: nextMimeType });
        void sendMediaFile(file);
      });

      recorder.start();
      setAudioRecordingState("recording");
    } catch (err) {
      const typed = err as { message?: string };
      setAudioRecordingState("idle");
      mediaRecorderRef.current = null;
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      setError("Nao foi possivel iniciar a gravacao de audio.");
      setErrorDetails(typed.message ?? null);
    }
  };

  const handleComposerKeyDown = async (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if ((!messageDraft.trim() && !selectedMediaFile) || !selectedConversationWaId) return;
    await handlePrimarySend();
  };

  const handleClaimConversation = async () => {
    if (!session || !selectedConversationWaId) return;
    setConversationAction("claim");
    setError(null);
    try {
      const response = await claimAppConversation(
        session,
        selectedConversationWaId,
        session.user.id
      );
      await refreshConversationList(session);
      await refreshSelectedTimeline(session, response.waId ?? selectedConversationWaId);
    } catch (err) {
      const typed = err as { status?: number; message?: string };
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(typed.message || "Falha ao assumir conversa.");
    } finally {
      setConversationAction(null);
    }
  };

  const handleReleaseConversation = async () => {
    if (!session || !selectedConversationWaId) return;
    setConversationAction("release");
    setError(null);
    try {
      const response = await releaseAppConversation(session, selectedConversationWaId);
      await refreshConversationList(session);
      await refreshSelectedTimeline(session, response.waId ?? selectedConversationWaId);
    } catch (err) {
      const typed = err as { status?: number; message?: string };
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(typed.message || "Falha ao liberar conversa.");
    } finally {
      setConversationAction(null);
    }
  };

  const handleTransferConversation = async () => {
    if (!session || !selectedConversationWaId || !transferUserId) return;
    setConversationAction("transfer");
    setError(null);
    try {
      const response = await transferAppConversation(session, selectedConversationWaId, transferUserId);
      await refreshConversationList(session);
      await refreshSelectedTimeline(session, response.waId ?? selectedConversationWaId);
    } catch (err) {
      const typed = err as { status?: number; message?: string };
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(typed.message || "Falha ao transferir conversa.");
    } finally {
      setConversationAction(null);
    }
  };

  const handleTransferDepartment = async () => {
    if (
      !session ||
      !selectedConversationWaId ||
      !transferDepartmentId ||
      !adminConnection ||
      !adminClientKey
    ) {
      return;
    }
    setConversationAction("transfer-department");
    setError(null);
    setSuccess(null);
    try {
      const response = await transferConversationDepartment(
        adminConnection,
        adminClientKey,
        selectedConversationWaId,
        transferDepartmentId
      );
      await refreshConversationList(session);
      await refreshSelectedTimeline(session, response.waId ?? selectedConversationWaId);
      const targetDepartmentName =
        departmentOptions.find((item) => item.id === transferDepartmentId)?.name ??
        response.departmentName ??
        "setor selecionado";
      setSuccess(`Conversa transferida para o setor ${targetDepartmentName}.`);
    } catch (err) {
      const typed = err as { status?: number; message?: string };
      setError(typed.message || "Falha ao transferir conversa de setor.");
    } finally {
      setConversationAction(null);
    }
  };

  const handleUpdateConversationStatus = async (nextStatus: ConversationOperationalStatus) => {
    if (!session || !selectedConversationWaId) return;
    setConversationAction("status");
    setError(null);
    try {
      const response = await updateAppConversationStatus(
        session,
        selectedConversationWaId,
        nextStatus
      );
      await refreshConversationList(session);
      await refreshSelectedTimeline(session, response.waId ?? selectedConversationWaId);
    } catch (err) {
      const typed = err as { status?: number; message?: string };
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setStatusActionDraft(
        selectedConversation ? getConversationOperationalStatus(selectedConversation) ?? "" : ""
      );
      setError(typed.message || "Falha ao atualizar status da conversa.");
    } finally {
      setConversationAction(null);
    }
  };

  if (!session) {
    return <main className="min-h-screen bg-re7-navy" />;
  }

  return (
    <AppShell
      session={session}
      title="Inbox"
      subtitle="Atendimentos do seu WhatsApp em um so lugar."
      fullScreen
    >
      <FeedbackToast message={success} />
      <FeedbackToast
        message={buildInboxErrorToast(error, errorDetails, leadError)}
        variant="error"
        onMouseEnter={() => setPauseErrorToast(true)}
        onMouseLeave={() => setPauseErrorToast(false)}
        onFocus={() => setPauseErrorToast(true)}
        onBlur={() => setPauseErrorToast(false)}
      />

      <section className="grid h-full min-h-0 grid-cols-[300px_minmax(0,1fr)_280px] overflow-hidden xl:grid-cols-[320px_minmax(0,1fr)_300px] 2xl:grid-cols-[340px_minmax(0,1fr)_320px]">
        <aside className="flex min-h-0 flex-col border-r border-white/10 bg-[#0c1930]">
          <div className="border-b border-white/10 px-4 py-3">
            <p className="mb-1 text-[11px] text-white/45">{session.user.name || session.user.email}</p>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-white">Conversas</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    requestBrowserNotificationPermission();
                    setSoundEnabled((current) => !current);
                  }}
                  title={soundEnabled ? "Silenciar notificações" : "Ativar notificações"}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm transition ${
                    soundEnabled
                      ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/20"
                      : "border-white/15 bg-white/5 text-white/65 hover:bg-white/10"
                  }`}
                >
                  {soundEnabled ? "🔔" : "🔕"}
                </button>
                <button
                  type="button"
                  onClick={() => session && refreshConversationList(session)}
                  className="rounded-lg border border-white/15 px-2.5 py-1 text-xs text-white/75 transition hover:bg-white/10"
                >
                  Atualizar
                </button>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <input
                type="search"
                value={conversationSearch}
                onChange={(event) => setConversationSearch(event.target.value)}
                placeholder="Buscar conversa"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-re7-sky/40"
              />
              <div className="flex flex-wrap gap-1.5">
                {CONVERSATION_FILTERS.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setConversationFilter(filter.value)}
                    className={`rounded-full px-2.5 py-1 text-[11px] transition ${
                      conversationFilter === filter.value
                        ? "bg-re7-sky/30 text-white"
                        : "bg-white/5 text-white/65 hover:bg-white/10"
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              {isAdminUser ? (
                <select
                  value={departmentFilter}
                  onChange={(event) => setDepartmentFilter(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none [&>option]:bg-re7-navy [&>option]:text-white"
                >
                  <option value="ALL">Todos os setores</option>
                  {departmentOptions.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          </div>
          <div ref={conversationListRef} className="min-h-0 flex-1 overflow-y-auto overflow-anchor-none">
            {loadingConversations ? (
              <p className="px-4 py-4 text-sm text-white/70">Carregando conversas...</p>
            ) : null}
            {!loadingConversations && filteredConversations.length === 0 ? (
              <p className="px-4 py-4 text-sm text-white/70">Nenhuma conversa encontrada.</p>
            ) : null}
            {filteredConversations.map((item) => {
              const conversationIdentity = getConversationIdentity(item);
              const isActive = conversationIdentity === selectedConversationKey;
              const unread = !isActive && isConversationUnread(item, readState);
              const status = getConversationOperationalStatus(item);
              const label = getConversationLabel(item);
              const phoneLine = item.waId && item.waId !== label ? item.waId : null;
              return (
                <button
                  key={conversationIdentity}
                  type="button"
                  onClick={() => {
                    const shouldOpenAtUnread = isConversationUnread(item, readState);
                    const activityAt = getConversationActivityAt(item);
                    pendingUnreadScrollTargetRef.current = shouldOpenAtUnread
                      ? {
                          conversationKey: conversationIdentity,
                          lastReadAt: readState.lastReadAtByConversationKey[conversationIdentity] ?? null,
                        }
                      : null;
                    pendingUnreadAnchorConversationIdentityRef.current = shouldOpenAtUnread
                      ? conversationIdentity
                      : null;
                    pendingUnreadLastReadAtRef.current = shouldOpenAtUnread
                      ? readState.lastReadAtByConversationKey[conversationIdentity] ?? null
                      : null;
                    pendingUnreadAnchorMessageIdRef.current = null;
                    pendingReadAfterHydrationRef.current = {
                      conversationKey: conversationIdentity,
                      activityAt,
                      waId: item.waId,
                    };
                    shouldScrollToBottomRef.current = !shouldOpenAtUnread;
                    setUnreadSeparatorIndex(null);
                    setUnreadAnchorMessageIdentity(null);
                    setActiveConversationIdentity(conversationIdentity);
                    setSelectedConversationKey(conversationIdentity);
                    setSelectedConversationWaId(item.waId);
                    setShowMoreActions(false);
                    detailRequestSeqRef.current += 1;
                  }}
                  className={`min-h-[76px] w-full border-b px-4 py-3.5 text-left transition ${
                    isActive
                      ? "border-l-4 border-l-re7-sky border-b-white/10 bg-[#17365f] shadow-[inset_0_0_0_1px_rgba(125,181,255,0.18)]"
                      : "border-l-4 border-l-transparent border-b-white/10 hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`truncate text-sm font-semibold ${isActive || unread ? "text-white" : "text-white/90"}`}>
                        {label}
                      </p>
                      {phoneLine ? (
                        <p className={`mt-0.5 text-xs ${isActive ? "text-white/75" : "text-white/55"}`}>
                          {phoneLine}
                        </p>
                      ) : null}
                    </div>
                    <span className={`shrink-0 text-[11px] ${isActive ? "text-white/70" : "text-white/45"}`}>
                      {formatDateTime(item.updatedAt)}
                    </span>
                  </div>
                  <div className={`mt-2 flex items-center gap-2 text-[11px] ${isActive ? "text-white/78" : "text-white/58"}`}>
                    <span className={`rounded-full px-2 py-0.5 ${getConversationStatusClass(status)}`}>
                      {getConversationStatusLabel(status)}
                    </span>
                    <span className="truncate">{item.departmentName || "Sem setor"}</span>
                    {unread ? <span className="inline-flex h-2.5 w-2.5 rounded-full bg-[#20b15a]" /> : null}
                  </div>
                  <p className={`mt-2 line-clamp-2 text-sm leading-5 ${isActive ? "text-white/88" : "text-white/68"}`}>
                    {item.lastMessage?.bodyText || "Sem mensagem recente."}
                  </p>
                </button>
              );
            })}
            {conversationNextCursor ? (
              <div className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => void loadMoreConversations()}
                  disabled={loadingConversationsPage}
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loadingConversationsPage ? "Carregando..." : "Carregar mais conversas"}
                </button>
              </div>
            ) : null}
          </div>
        </aside>

        <div className="relative flex min-h-0 flex-col overflow-hidden bg-[#eadfcd]">
          <header className="flex min-h-16 items-center justify-between border-b border-black/8 px-4 py-3">
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-slate-900">
                {selectedConversation
                  ? selectedConversation.leadName || selectedConversation.leadPhone || selectedConversation.waId
                  : "Conversa"}
              </h2>
              {selectedConversation ? (
                <p className="mt-0.5 truncate text-sm text-slate-600">
                  {getConversationModeLabel(selectedConversation)}
                  {" • "}
                  {getConversationStatusLabel(getConversationOperationalStatus(selectedConversation))}
                  {selectedConversation.assignedUserName
                    ? ` • ${selectedConversation.assignedUserName}`
                    : selectedConversation.assignedTo
                      ? ` • ${selectedConversation.assignedTo}`
                      : ""}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {isAdminUser ? (
                <button
                  type="button"
                  disabled={!selectedConversation}
                  onClick={() => {
                    if (!selectedConversation) return;
                    router.push(
                      `/app/settings/privacy?conversationId=${encodeURIComponent(
                        selectedConversation.waIdCanonical ?? selectedConversation.waId
                      )}`
                    );
                  }}
                  className="rounded-xl border border-[#d4c7b5] bg-white/55 px-3 py-1.5 text-sm text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Privacidade
                </button>
              ) : null}
              {selectedConversation?.assignedUserId === session.user.id ? (
                <button
                  type="button"
                  disabled={!selectedConversationWaId || Boolean(conversationAction)}
                  onClick={handleReleaseConversation}
                  className="rounded-xl border border-[#d4c7b5] bg-white/70 px-3 py-1.5 text-sm text-slate-800 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {conversationAction === "release" ? "Atualizando..." : "Liberar"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={
                    !selectedConversationWaId ||
                    Boolean(conversationAction) ||
                    isSelectedConversationLocked
                  }
                  onClick={handleClaimConversation}
                  className="rounded-xl border border-[#d4c7b5] bg-white/70 px-3 py-1.5 text-sm text-slate-800 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {conversationAction === "claim" ? "Atualizando..." : "Assumir"}
                </button>
              )}
              <button
                type="button"
                disabled={!selectedConversation}
                onClick={() => {
                  if (!selectedConversation) return;
                  markConversationAsUnread(
                    getConversationIdentity(selectedConversation),
                    selectedConversation.waId
                  );
                  setSelectedConversationKey(null);
                  setSelectedConversationWaId(null);
                  setActiveConversationIdentity(null);
                  setMessages([]);
                  setMessagesConversationKey(null);
                  pendingUnreadScrollTargetRef.current = null;
                  pendingReadAfterHydrationRef.current = null;
                  pendingUnreadAnchorConversationIdentityRef.current = null;
                  pendingUnreadLastReadAtRef.current = null;
                  pendingUnreadAnchorMessageIdRef.current = null;
                  setUnreadSeparatorIndex(null);
                  setUnreadAnchorMessageIdentity(null);
                }}
                className="rounded-xl border border-[#d4c7b5] bg-white/55 px-3 py-1.5 text-sm text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Não lida
              </button>
              <button
                type="button"
                disabled={!selectedConversation}
                onClick={() => setShowMoreActions((current) => !current)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#d4c7b5] bg-white/55 text-base text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                ⋯
              </button>
            </div>
          </header>

          <div className="border-b border-black/8 bg-[#efe6d7] px-3 py-2">
            <div className="grid grid-cols-[168px_minmax(0,1fr)_minmax(0,1fr)] items-end gap-2">
              <div className="rounded-2xl border border-[#dccfbe] bg-white/55 px-2 py-2">
                <select
                  value={statusActionDraft}
                  onChange={async (event) => {
                    const nextStatus = event.target.value as ConversationOperationalStatus | "";
                    setStatusActionDraft(nextStatus);
                    if (!nextStatus) return;
                    await handleUpdateConversationStatus(nextStatus);
                  }}
                  disabled={!canManageSelectedConversation || Boolean(conversationAction)}
                  className="w-full rounded-xl border border-[#e1d4c2] bg-white px-2.5 py-1.5 text-[13px] text-slate-900 shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="" disabled>
                    Status
                  </option>
                  {CONVERSATION_FILTERS.filter((item) =>
                    ["IN_PROGRESS", "WAITING_USER", "CLOSED"].includes(item.value)
                  ).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-0 rounded-2xl border border-[#dccfbe] bg-white/55 px-2 py-2">
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <select
                    value={transferUserId}
                    onChange={(event) => setTransferUserId(event.target.value)}
                    disabled={!canTransferSelectedConversation || users.length === 0 || Boolean(conversationAction)}
                    className="min-w-0 flex-1 rounded-xl border border-[#e1d4c2] bg-white px-2.5 py-1.5 text-[13px] text-slate-900 shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">Atendente</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!canTransferSelectedConversation || !transferUserId || Boolean(conversationAction)}
                    onClick={handleTransferConversation}
                    className="shrink-0 whitespace-nowrap rounded-xl border border-[#e1d4c2] bg-white px-2.5 py-1.5 text-[13px] text-slate-800 shadow-sm hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {conversationAction === "transfer" ? "Transferindo..." : "Transferir"}
                  </button>
                </div>
              </div>
              <div className="min-w-0 rounded-2xl border border-[#dccfbe] bg-white/55 px-2 py-2">
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <select
                    value={transferDepartmentId}
                    onChange={(event) => setTransferDepartmentId(event.target.value)}
                    disabled={
                      !canTransferDepartment ||
                      departmentOptions.length === 0 ||
                      Boolean(conversationAction)
                    }
                    className="min-w-0 flex-1 rounded-xl border border-[#e1d4c2] bg-white px-2.5 py-1.5 text-[13px] text-slate-900 shadow-sm disabled:cursor-not-allowed disabled:opacity-50 [&>option]:bg-white [&>option]:text-slate-900"
                  >
                    <option value="">
                      {selectedConversation?.departmentName || "Setor"}
                    </option>
                    {departmentOptions.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={
                      !canTransferDepartment ||
                      !transferDepartmentId ||
                      transferDepartmentId === (selectedConversation?.departmentId ?? "") ||
                      Boolean(conversationAction)
                    }
                    onClick={handleTransferDepartment}
                    className="shrink-0 whitespace-nowrap rounded-xl border border-[#e1d4c2] bg-white px-2.5 py-1.5 text-[13px] text-slate-800 shadow-sm hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {conversationAction === "transfer-department" ? "Movendo..." : "Mover"}
                  </button>
                </div>
              </div>
            </div>
            {showMoreActions ? (
              <p className="mt-2 text-xs text-slate-600">
                {selectedConversation?.assignedAt
                  ? `Conversa em andamento desde ${formatDateTime(selectedConversation.assignedAt)}.`
                  : "Ajuste status, atendente e setor conforme o andamento do atendimento."}
              </p>
            ) : null}
          </div>

          <div ref={timelineRef} className="wa-chat-canvas min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {!selectedConversationWaId ? (
              <p className="text-sm text-slate-700/80">Selecione uma conversa para ver a timeline.</p>
            ) : null}
            {selectedConversationWaId && isHydratingSelectedTimeline ? (
              <p className="text-sm text-slate-700/80">Carregando mensagens...</p>
            ) : null}
            {selectedConversationWaId && isRefreshingSelectedTimeline ? (
              <p className="text-sm text-slate-700/80">Atualizando mensagens...</p>
            ) : null}
            {selectedConversationWaId && !loadingMessages && messages.length === 0 ? (
              <p className="text-sm text-slate-700/80">Sem mensagens para esta conversa.</p>
            ) : null}
            <div className="space-y-3">
              {messages.map((item, index) => {
                const messageIdentity = getMessageIdentity(item);
                const statusTicks = renderMessageStatusTicks(item);
                const shouldAutoLoadMedia = index >= Math.max(messages.length - 8, 0);
                const isUnreadAnchor =
                  unreadAnchorMessageIdentity === messageIdentity || unreadSeparatorIndex === index;
                return (
                  <Fragment key={messageIdentity}>
                    {isUnreadAnchor ? (
                      <div
                        data-unread-anchor="true"
                        className="flex items-center gap-3 py-1"
                        aria-label="Mensagens nao lidas"
                      >
                        <span className="h-px flex-1 bg-emerald-500/35" />
                        <span className="rounded-full border border-emerald-500/35 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                          Mensagens nao lidas
                        </span>
                        <span className="h-px flex-1 bg-emerald-500/35" />
                      </div>
                    ) : null}
                    <div
                      data-message-index={index}
                      className={`flex ${item.direction === "INBOUND" ? "justify-start" : "justify-end"}`}
                    >
                      <article
                        className={`wa-bubble ${
                          item.direction === "INBOUND" ? "wa-bubble-inbound" : "wa-bubble-outbound"
                        } ${item.media?.kind === "audio" ? "min-w-[19rem]" : ""}`}
                      >
                        {item.bodyText ? (
                          <p className="wa-bubble-text text-sm leading-relaxed">
                            {item.bodyText}
                          </p>
                        ) : item.media ? null : (
                          <p className="text-sm italic text-slate-700">{getMessageContentLabel(item)}</p>
                        )}
                        {item.media ? (
                          <MediaBubble
                            session={session}
                            waId={selectedConversationWaId}
                            item={item}
                            autoLoad={shouldAutoLoadMedia}
                          />
                        ) : null}
                        {item.templateName ? (
                          <p className="wa-bubble-meta mt-1 text-[11px]">template: {item.templateName}</p>
                        ) : null}
                        <div className="mt-2 flex items-center justify-end gap-1 text-[11px] text-slate-600">
                          <span>{formatDateTime(item.createdAt)}</span>
                          {statusTicks}
                        </div>
                      </article>
                    </div>
                  </Fragment>
                );
              })}
            </div>
          </div>
          {selectedConversationKey && showJumpToLatest ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-24 flex justify-center px-4">
              <button
                type="button"
                onClick={scrollTimelineToBottom}
                className="pointer-events-auto rounded-full border border-[#d4c7b5] bg-white/92 px-4 py-2 text-sm font-medium text-slate-800 shadow-md transition hover:bg-white"
              >
                Ir para a mais recente
              </button>
            </div>
          ) : null}

          <div className="sticky bottom-0 border-t border-black/8 bg-[#efe6d7] px-4 py-3">
            {selectedMediaFile ? (
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-full bg-white/70 px-3 py-1 text-sm text-slate-700">
                  Arquivo: {selectedMediaFile.name}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMediaFile(null);
                    if (mediaInputRef.current) {
                      mediaInputRef.current.value = "";
                    }
                  }}
                  className="text-sm text-slate-600 hover:text-slate-900"
                >
                  ×
                </button>
              </div>
            ) : null}
            {audioRecordingState === "recording" ? (
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[#b45309]">
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-[#dc2626]" />
                <span>Gravando áudio... clique no botão vermelho para enviar.</span>
              </div>
            ) : null}
            <div className="relative flex items-center gap-2">
              {showEmojiPicker ? (
                <div className="absolute bottom-full left-12 z-20 mb-2 flex flex-wrap gap-1.5 rounded-2xl border border-[#d4c7b5] bg-white/95 p-2 shadow-[0_12px_28px_rgba(15,23,42,0.18)]">
                  {QUICK_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        setMessageDraft((current) => `${current}${emoji}`);
                        setShowEmojiPicker(false);
                        focusComposer();
                      }}
                      className="rounded-full px-2 py-1 text-base leading-none transition hover:bg-[#efe6d7]"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              ) : null}
              <input
                ref={mediaInputRef}
                type="file"
                className="hidden"
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] ?? null;
                  setSelectedMediaFile(nextFile);
                }}
                disabled={!selectedConversationWaId || !canReply || isHydratingSelectedTimeline}
              />
              <button
                type="button"
                disabled={!selectedConversationWaId || !canReply || isHydratingSelectedTimeline}
                onClick={() => mediaInputRef.current?.click()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#d4c7b5] bg-white text-lg text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                +
              </button>
              <button
                type="button"
                disabled={!selectedConversationWaId || !canReply || isHydratingSelectedTimeline}
                onClick={() => setShowEmojiPicker((current) => !current)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#d4c7b5] bg-white text-lg text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                😊
              </button>
              <button
                type="button"
                disabled={
                  !selectedConversationWaId ||
                  !canReply ||
                  isHydratingSelectedTimeline ||
                  sendingMessage ||
                  Boolean(selectedMediaFile) ||
                  audioRecordingState === "stopping"
                }
                onClick={() => void handleToggleAudioRecording()}
                title={
                  audioRecordingState === "recording"
                    ? "Clique novamente para parar e enviar o áudio"
                    : "Gravar áudio"
                }
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border text-lg transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  audioRecordingState === "recording"
                    ? "border-red-300 bg-red-600 text-white shadow-[0_0_0_3px_rgba(220,38,38,0.18)] hover:bg-red-500"
                    : "border-[#d4c7b5] bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {audioRecordingState === "recording" ? "⏺" : "🎤"}
              </button>
              <label className="min-w-0 flex-1">
                <textarea
                  ref={composerRef}
                  className="h-20 min-h-20 w-full resize-none rounded-2xl border border-[#d4c7b5] bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-[#7cbf69]"
                  value={messageDraft}
                  onChange={(event) => setMessageDraft(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  placeholder={
                    canReply
                      ? isHydratingSelectedTimeline
                        ? "Carregando mensagens..."
                        : "Digite uma mensagem"
                      : "Assuma a conversa para responder"
                  }
                  disabled={!selectedConversationWaId || !canReply || isHydratingSelectedTimeline}
                />
              </label>
              <button
                type="button"
                disabled={
                  !selectedConversationWaId ||
                  (!messageDraft.trim() && !selectedMediaFile) ||
                  !canReply ||
                  isHydratingSelectedTimeline ||
                  sendingMessage
                }
                onClick={handlePrimarySend}
                className="h-10 shrink-0 rounded-2xl bg-[#20b15a] px-3.5 text-sm font-semibold text-white shadow-sm hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Enviar
              </button>
            </div>
          </div>
        </div>

        <aside className="flex min-h-0 flex-col border-l border-white/10 bg-[#0c1930]">
          <div className="border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">Cliente</h2>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {!selectedLead ? (
              <p className="px-4 py-4 text-sm text-white/70">
                Esta conversa ainda nao entrou no fluxo de cadastro do contato.
              </p>
            ) : (
              <>
                <section className="border-b border-white/10 px-4 py-4">
                  <h3 className="text-sm font-semibold text-white">Contato</h3>
                  <div className="mt-3 space-y-2 text-sm text-white/85">
                    <label className="grid gap-1">
                      <span className="text-white/55">Nome</span>
                      <div className="flex gap-2">
                        <input
                          className="min-w-0 flex-1 rounded-xl border border-white/15 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                          value={leadNameDraft}
                          onChange={(event) => setLeadNameDraft(event.target.value)}
                          placeholder="Como este contato deve aparecer"
                          disabled={!isSelectedConversationOwnedByCurrentUser || savingLeadName}
                        />
                        <button
                          type="button"
                          disabled={savingLeadName || !isSelectedConversationOwnedByCurrentUser}
                          onClick={handleSaveLeadName}
                          className="rounded-xl border border-white/15 px-3 py-2 text-sm text-white/90 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {savingLeadName ? "Salvando..." : "Salvar"}
                        </button>
                      </div>
                    </label>
                    <p><span className="text-white/55">Telefone:</span> {selectedLead.phone || selectedConversation?.waId || "-"}</p>
                    <p><span className="text-white/55">Cidade:</span> {selectedLead.city || "-"}</p>
                    <p><span className="text-white/55">Serviço:</span> {selectedLead.service || "-"}</p>
                  </div>
                </section>

                <section className="border-b border-white/10 px-4 py-4">
                  <h3 className="text-sm font-semibold text-white">Andamento</h3>
                  <div className="mt-3 space-y-3">
                    <select
                      className="w-full rounded-xl border border-white/15 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                      value={statusDraft}
                      onChange={(event) => setStatusDraft(event.target.value as LeadStatus)}
                      disabled={!isSelectedConversationOwnedByCurrentUser || savingLeadStatus}
                    >
                      <option value="" disabled>
                        Selecione
                      </option>
                      {LEAD_STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {getLeadStatusLabel(status)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!statusDraft || savingLeadStatus || !isSelectedConversationOwnedByCurrentUser}
                      onClick={handleSaveLeadStatus}
                      className="rounded-xl bg-re7-orange px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingLeadStatus ? "Salvando..." : "Salvar"}
                    </button>
                  </div>
                </section>

                <section className="border-b border-white/10 px-4 py-4">
                  <h3 className="text-sm font-semibold text-white">Nota interna</h3>
                  <div className="mt-3 space-y-3">
                    <textarea
                      className="min-h-24 w-full rounded-xl border border-white/15 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                      value={noteDraft}
                      onChange={(event) => setNoteDraft(event.target.value)}
                      placeholder="Registre um detalhe importante do atendimento..."
                      disabled={!isSelectedConversationOwnedByCurrentUser || savingLeadNote}
                    />
                    <button
                      type="button"
                      disabled={!noteDraft.trim() || savingLeadNote || !isSelectedConversationOwnedByCurrentUser}
                      onClick={handleAddLeadNote}
                      className="rounded-xl border border-white/15 px-3 py-2 text-sm text-white/90 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingLeadNote ? "Salvando..." : "Salvar nota"}
                    </button>
                  </div>
                </section>

                <section className="px-4 py-4">
                  <h3 className="text-sm font-semibold text-white">Histórico de notas</h3>
                  {loadingLeadNotes ? (
                    <p className="mt-3 text-sm text-white/70">Carregando notas...</p>
                  ) : null}
                  {!loadingLeadNotes && leadNotes.length === 0 ? (
                    <p className="mt-3 text-sm text-white/70">Nenhuma nota registrada.</p>
                  ) : null}
                  <div className="mt-3 space-y-2">
                    {leadNotes.map((note) => (
                      <article key={note.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <p className="text-sm text-white">{note.body}</p>
                        <p className="mt-1 text-[11px] text-white/55">{formatDateTime(note.createdAt)}</p>
                      </article>
                    ))}
                  </div>
                </section>
              </>
            )}

            {leadError ? (
              <p className="mx-4 mb-4 rounded-xl border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100">
                {leadError}
              </p>
            ) : null}
          </div>
        </aside>
      </section>
    </AppShell>
  );
}
