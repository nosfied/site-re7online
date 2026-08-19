"use client";

import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type TouchEvent } from "react";
import AppShell from "@/components/app/AppShell";
import ThemeSelector from "@/components/ThemeSelector";
import { FeedbackToast } from "@/components/ui/FeedbackToast";
import { isSelectableDepartment } from "@/lib/departments";
import {
  getAppErrorUxMessage,
  getChannelFallbackContactLabel,
  getChannelUxLabel,
  getConversationStatusUxLabel,
} from "@/lib/appUxLabels";
import {
  addAppRealtimeListener,
  canUserReceiveTargetedNotification,
  handleRealtimeNotificationCandidate,
  requestAppNotificationAudioUnlock,
  setActiveConversationIdentity,
  setActiveInboxConversation,
  type AppRealtimeEvent,
} from "@/lib/appRealtime";
import {
  realtimeEventTargetsSelectedConversation,
  resolveRealtimeTimelineConversationKey,
} from "@/lib/inboxRealtimeTimeline";
import {
  AppInboxReadState,
  AppContactTimelineItem,
  AppSession,
  claimAppConversation,
  closeAppConversation,
  clearAppSession,
  createAppLeadNote,
  fetchAppConversation,
  fetchAppConversationTimeline,
  fetchAppConversations,
  fetchAppCrmStatuses,
  fetchAppDepartments,
  fetchAppMetaUsagePreview,
  fetchAppLeadNotes,
  fetchAppTenantSummary,
  formatAppWhatsappIdentityDisplay,
  listAppCannedReplies,
  listAppTemplates,
  sendAppConversationMedia,
  fetchAppUsers,
  logoutAppSession,
  updateAppLead,
  loadAppSession,
  releaseAppConversation,
  releaseAppConversationToGeneral,
  saveAppSession,
  fetchAppConversationMedia,
  sendAppConversationCannedReply,
  sendAppConversationMessage,
  sendAppConversationTemplate,
  transferAppConversation,
  transferAppConversationDepartment,
  updateAppConversationStatus,
  updateAppLeadStatus,
  updateAppConversationReadState,
  logAppInboxEvent,
  getAppPushStatus,
  subscribeAppPush,
  unsubscribeAppPush,
  type AppApiError,
  type AppCannedReplyItem,
  type AppMetaCostPreview,
  type AppTemplateItem,
  type CrmBusinessStatusConfig,
  type AppPushStatus,
} from "@/lib/appClientApi";
import {
  ConversationOperationalStatus,
  formatDateTime,
  InboxChannel,
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
} from "@/lib/whatsappAdminApi";

const FALLBACK_LEAD_STATUS_OPTIONS: CrmBusinessStatusConfig[] = [
  {
    id: "QUALIFIED",
    label: "Qualificado",
    isActive: true,
    campaignEligible: true,
  },
  {
    id: "OPEN",
    label: "Em aberto",
    isActive: true,
    campaignEligible: true,
  },
  {
    id: "FOLLOW_UP",
    label: "Follow-up",
    isActive: true,
    campaignEligible: true,
  },
  {
    id: "WON",
    label: "Fechado",
    isActive: true,
    campaignEligible: false,
  },
  {
    id: "LOST",
    label: "Não fechado",
    isActive: true,
    campaignEligible: true,
  },
  {
    id: "NO_RESPONSE",
    label: "Sem resposta",
    isActive: true,
    campaignEligible: true,
  },
  {
    id: "NURTURE",
    label: "Nutrir",
    isActive: true,
    campaignEligible: true,
  },
];

function isInboxLatencyDebugEnabled() {
  if (typeof window === "undefined") return false;
  return (
    window.localStorage.getItem("INBOX_LATENCY_DEBUG") === "1" ||
    window.localStorage.getItem("converta_inbox_latency_debug") === "1"
  );
}

function logInboxLatencyDebug(payload: Record<string, unknown>) {
  if (!isInboxLatencyDebugEnabled()) return;
  const event = typeof payload.event === "string" ? payload.event : "inbox_latency.outbound";
  console.debug(JSON.stringify({ ...payload, event }));
}

const INBOX_SOUND_ENABLED_STORAGE_KEY = "wa_app_inbox_sound_enabled_v1";
const INBOX_PUSH_DISABLED_STORAGE_KEY = "wa_app_inbox_push_disabled_v1";
const INBOX_UX_DEBUG_STORAGE_KEY = "converta_inbox_ux_debug";
const MEDIA_NOT_FOUND_TTL_MS = 5 * 60 * 1000;
const CONVERSATION_PAGE_SIZE = 30;
const SELECTED_TIMELINE_BACKGROUND_REFRESH_MS = 10000;
const MEDIA_UPLOAD_SOFT_LIMIT_BYTES = 9.2 * 1024 * 1024;
const IMAGE_UPLOAD_TARGET_BYTES = 7.5 * 1024 * 1024;
const mediaBlobCache = new Map<string, Blob>();
const mediaNotFoundCache = new Map<string, number>();

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }
  return outputArray;
}

function isIosLikeDevice() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent || "";
  const platform = window.navigator.platform || "";
  const touchPoints = window.navigator.maxTouchPoints || 0;
  return /iPad|iPhone|iPod/i.test(ua) || (platform === "MacIntel" && touchPoints > 1);
}

function getMobileViewportState() {
  if (typeof window === "undefined") {
    return {
      isMobile: false,
      isIos: false,
      keyboardOpen: false,
      visualViewportHeight: 0,
      visualViewportOffsetTop: 0,
      keyboardGap: 0,
    };
  }
  const visualViewport = window.visualViewport;
  const visualViewportHeight = visualViewport?.height ?? window.innerHeight;
  const visualViewportOffsetTop = visualViewport?.offsetTop ?? 0;
  const keyboardGap = Math.max(0, window.innerHeight - visualViewportHeight - visualViewportOffsetTop);
  return {
    isMobile: window.matchMedia("(max-width: 767px)").matches,
    isIos: isIosLikeDevice(),
    keyboardOpen: keyboardGap > 140,
    visualViewportHeight,
    visualViewportOffsetTop,
    keyboardGap,
  };
}

function getMobileAppViewportHeight(state = getMobileViewportState()) {
  if (!state.isMobile) return null;
  if (state.isIos) {
    if (!state.keyboardOpen) return "100dvh";
    const viewportHeight = Math.round(state.visualViewportHeight);
    return viewportHeight > 0 ? `${viewportHeight}px` : "100dvh";
  }
  const viewportHeight = Math.round(state.visualViewportHeight + state.visualViewportOffsetTop);
  return viewportHeight > 0 ? `${viewportHeight}px` : null;
}

function isStandalonePwa() {
  if (typeof window === "undefined") return false;
  const standaloneNavigator = window.navigator as Navigator & { standalone?: boolean };
  return (
    standaloneNavigator.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches
  );
}

function isAppForegroundFocused() {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible" && document.hasFocus();
}

function getMediaCacheKey(messageId: string | null, mediaKind?: string | null) {
  if (!messageId) return null;
  return `${messageId}:${mediaKind ?? "unknown"}`;
}

function getConversationLabel(item: InboxConversationItem) {
  if (item.leadName) return item.leadName;
  if (item.leadPhone) return item.leadPhone;
  return getChannelFallbackContactLabel(getConversationChannel(item));
}

function isPhoneLikeConversationIdentifier(value?: string | null) {
  const normalized = (value ?? "").trim();
  if (!normalized) return false;
  if (/^[a-z]+:/i.test(normalized)) return false;
  const digits = normalized.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 && /^[+\d\s().-]+$/.test(normalized);
}

function getConversationSecondaryIdentifier(item: InboxConversationItem, label: string) {
  const leadPhone = item.leadPhone?.trim();
  if (leadPhone && leadPhone !== label) return leadPhone;
  const channel = getConversationChannel(item);
  if (channel === "whatsapp" && isPhoneLikeConversationIdentifier(item.waId) && item.waId !== label) {
    return item.waId;
  }
  return null;
}

function formatUnknownLeadStatus(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getLeadStatusLabel(status?: string | null, options?: CrmBusinessStatusConfig[]) {
  const normalized = (status || "").trim().toUpperCase();
  const configured = options?.find((item) => item.id === normalized);
  if (configured?.label) return configured.label;
  switch ((status || "").trim().toUpperCase()) {
    case "NEW":
      return "Novo";
    case "QUALIFIED":
      return "Qualificado";
    case "OPEN":
      return "Em aberto";
    case "WON":
      return "Fechado";
    case "LOST":
      return "Não fechado";
    case "FOLLOW_UP":
      return "Follow-up";
    case "NO_RESPONSE":
      return "Sem resposta";
    case "NURTURE":
      return "Nutrir";
    case "WAITING_ATTENDANT":
      return "Aguardando atendimento";
    case "IN_ATTENDANCE":
      return "Em atendimento";
    case "CLOSED":
      return "Encerrado";
    default:
      return normalized ? formatUnknownLeadStatus(normalized) : "Sem andamento";
  }
}

function getFlowContextValue(
  item: Pick<InboxConversationItem, "flowContext"> | null,
  key: string
) {
  const value = item?.flowContext?.[key];
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function getLeadTemperature(item: Pick<InboxConversationItem, "flowContext"> | null) {
  const value = getFlowContextValue(item, "lead_temp")?.toLowerCase() ?? "";
  if (value === "quente" || value === "morno" || value === "frio") return value;
  return null;
}

function getLeadTemperatureScore(item: Pick<InboxConversationItem, "flowContext"> | null) {
  const temperature = getLeadTemperature(item);
  if (temperature === "quente") return 3;
  if (temperature === "morno") return 2;
  if (temperature === "frio") return 1;
  return 0;
}

function getLeadTemperatureLabel(item: Pick<InboxConversationItem, "flowContext"> | null) {
  const temperature = getLeadTemperature(item);
  if (temperature === "quente") return "Quente";
  if (temperature === "morno") return "Morno";
  if (temperature === "frio") return "Frio";
  return null;
}

function getLeadTemperatureClass(item: Pick<InboxConversationItem, "flowContext"> | null) {
  const temperature = getLeadTemperature(item);
  if (temperature === "quente") return "theme-lead-temp-hot";
  if (temperature === "morno") return "theme-lead-temp-warm";
  if (temperature === "frio") return "theme-lead-temp-cold";
  return "theme-lead-temp-cold";
}

function extractSuggestedReply(notes: LeadNoteItem[]) {
  const note = notes.find((item) => item.body.trim().startsWith("[Sugestão de resposta]"));
  if (!note) return null;
  const body = note.body.replace(/^\[Sugestão de resposta\]\s*/i, "").trim();
  return body || null;
}

function logInboxUxEvent(
  session: AppSession | null,
  event: "inbox.priority.rendered" | "inbox.sorted" | "inbox.suggestion.used",
  payload: Record<string, unknown>
) {
  if (typeof window !== "undefined" && window.localStorage.getItem(INBOX_UX_DEBUG_STORAGE_KEY) === "1") {
    console.info(JSON.stringify({ event, ...payload }));
  }
  if (!session) return;
  void logAppInboxEvent(session, event, payload).catch(() => {
    // UI logging must never affect inbox usage.
  });
}

function getTimelineDateGroup(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function getTimelineKindLabel(item: AppContactTimelineItem) {
  if (item.kind === "message") {
    return item.direction === "OUTBOUND" ? "Mensagem enviada" : "Mensagem recebida";
  }
  if (item.kind === "note") return "Nota";
  return "Evento";
}

function getTimelineKindClass(item: AppContactTimelineItem) {
  if (item.kind === "message") {
    return item.direction === "OUTBOUND"
      ? "border-emerald-500/25 bg-emerald-50 text-emerald-900"
      : "border-sky-500/25 bg-sky-50 text-sky-900";
  }
  if (item.kind === "note") return "border-amber-500/25 bg-amber-50 text-amber-900";
  return "border-slate-300 bg-slate-50 text-slate-700";
}

function getMessageContentLabel(item: InboxMessageItem) {
  switch (item.type?.toUpperCase()) {
    case "LOCATION":
      return "Localização";
    case "AUDIO":
      return "Áudio";
    case "IMAGE":
      return "Imagem";
    case "VIDEO":
      return "Vídeo";
    case "DOCUMENT":
      return "Documento";
    case "TEMPLATE":
      return "Modelo de mensagem";
    case "UNKNOWN":
      return "Mensagem não suportada pelo WhatsApp.";
    default:
      return "Mensagem";
  }
}

function getMessageReplyKind(item: InboxMessageItem): "inbound" | "outbound" | null {
  if (item.messageKind === "inbound" || item.messageKind === "outbound") return item.messageKind;
  return item.direction === "INBOUND" ? "inbound" : item.direction === "OUTBOUND" ? "outbound" : null;
}

function getMessageReplyId(item: InboxMessageItem) {
  return item.internalMessageId?.trim() || null;
}

function canMarkMessageAsReference(item: InboxMessageItem) {
  if (!getMessageReplyId(item)) return false;
  const kind = getMessageReplyKind(item);
  if (kind === "inbound") return Boolean(item.messageId?.trim());
  if (kind === "outbound") return Boolean(item.metaMessageId?.trim() || item.messageId?.trim());
  return false;
}

function getReplyPreviewText(item: InboxMessageItem) {
  const text = getMessageBodyTextForDisplay(item).replace(/\s+/g, " ").trim();
  if (text) return text.length > 120 ? `${text.slice(0, 117)}...` : text;
  return `[${getMessageContentLabel(item)}]`;
}

function sanitizeAgentSignatureDisplayName(value: string | null | undefined) {
  const collapsed = value?.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim() ?? "";
  if (!collapsed) return null;
  const sanitized = collapsed.replace(/[*_~`]+/g, "").trim();
  return sanitized || null;
}

function getMessageBodyTextForDisplay(item: InboxMessageItem) {
  const bodyText = item.bodyText ?? "";
  if (!item.agentSignatureApplied || item.agentSignatureFormat !== "bold_line") return bodyText;
  const displayName = sanitizeAgentSignatureDisplayName(item.actor?.displayName ?? null);
  if (!displayName) return bodyText;
  const prefix = `*${displayName}*\n`;
  return bodyText.startsWith(prefix) ? bodyText.slice(prefix.length) : bodyText;
}

function getTruncatedReferenceText(value: string | null | undefined, maxLength = 72) {
  const text = value?.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function buildOutgoingTextForReplyMode(text: string, _mode: InboxReplyMode) {
  return text.trim();
}

function buildReplyTarget(item: InboxMessageItem, mode: InboxReplyMode = "reply"): InboxReplyTarget | null {
  if (!canMarkMessageAsReference(item)) return null;
  const kind = getMessageReplyKind(item);
  const id = getMessageReplyId(item);
  if (!kind || !id) return null;
  return {
    kind,
    id,
    mode,
    preview: getReplyPreviewText(item),
    direction: item.direction,
    type: item.type,
    media: item.media
      ? {
          ...item.media,
          messageId: item.messageId ?? null,
        }
      : null,
    location: item.location ?? null,
  };
}

function enrichReplyPreviewFromTimeline(item: InboxMessageItem, timeline: InboxMessageItem[]) {
  const replyTo = item.replyTo;
  if (!replyTo?.id) return item;
  const hasRichPreview =
    Boolean(replyTo.previewBody?.trim()) ||
    Boolean(replyTo.previewMedia) ||
    Boolean(replyTo.previewLocation);
  if (hasRichPreview) return item;
  const original = timeline.find(
    (candidate) => candidate.internalMessageId === replyTo.id && getMessageReplyKind(candidate) === replyTo.kind
  );
  if (!original) return item;
  const enrichedReplyTo = {
    ...replyTo,
    previewType: replyTo.previewType ?? original.type,
    previewBody: getReplyPreviewText(original),
    previewDirection: original.direction,
    previewMedia: original.media
      ? {
          ...original.media,
          messageId: original.messageId ?? null,
        }
      : null,
    previewLocation: original.location ?? null,
  };
  return { ...item, replyTo: enrichedReplyTo };
}

function getTimelineReplyPreview(item: InboxMessageItem) {
  const preview = item.replyTo?.previewBody?.replace(/\s+/g, " ").trim();
  if (preview) return preview.length > 120 ? `${preview.slice(0, 117)}...` : preview;
  const previewType = item.replyTo?.previewType?.trim();
  return previewType ? `[${previewType}]` : "Mensagem anterior";
}

function getReferenceMediaFallbackLabel(kind: NonNullable<InboxMessageItem["media"]>["kind"]) {
  if (kind === "image") return "Imagem";
  if (kind === "video") return "Vídeo";
  if (kind === "audio") return "Áudio";
  return "Documento";
}

function getConversationPreviewText(item: InboxConversationItem) {
  if (!item.lastMessage) return "Sem mensagem recente.";
  if (item.lastMessage.bodyText?.trim()) return item.lastMessage.bodyText;
  const directionLabel = item.lastMessage.direction === "OUTBOUND" ? "enviado" : "recebido";
  const directionLabelFemale = item.lastMessage.direction === "OUTBOUND" ? "enviada" : "recebida";
  switch (item.lastMessage.type?.toUpperCase()) {
    case "LOCATION":
      return `Localização ${directionLabelFemale}`;
    case "AUDIO":
      return `Áudio ${directionLabel}`;
    case "IMAGE":
      return `Imagem ${directionLabelFemale}`;
    case "VIDEO":
      return `Vídeo ${directionLabel}`;
    case "DOCUMENT":
      return `Documento ${directionLabel}`;
    case "TEMPLATE":
      return "Modelo enviado";
    case "UNKNOWN":
      return "Mensagem não suportada.";
    default:
      return `Mensagem ${directionLabelFemale}`;
  }
}

function getChannelEmptyStateLabel(channel: ConversationChannelFilter) {
  if (channel === "messenger") return "Messenger";
  if (channel === "instagram") return "Instagram";
  if (channel === "whatsapp") return "WhatsApp";
  if (channel === "webchat") return "Chat do site";
  if (channel === "telegram") return "Telegram";
  if (channel === "support") return "Suporte";
  return "Todos os canais";
}

function isUnsupportedMessage(item: InboxMessageItem) {
  return item.type === "UNKNOWN" && !item.bodyText && !item.media;
}

function LocationBubble({ location }: { location: NonNullable<InboxMessageItem["location"]> }) {
  return (
    <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-slate-800">
      <p className="font-semibold">{location.name || "Localização compartilhada"}</p>
      {location.address ? <p className="mt-1 text-xs leading-relaxed text-slate-700">{location.address}</p> : null}
      <p className="mt-1 font-mono text-[11px] text-slate-600">
        {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
      </p>
      <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
        <a
          href={location.googleMapsUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-md bg-re7-sky px-2.5 py-1 text-white hover:brightness-110"
        >
          Google Maps
        </a>
        <a
          href={location.openStreetMapUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-sky-300 px-2.5 py-1 text-sky-800 hover:bg-sky-100"
        >
          OpenStreetMap
        </a>
      </div>
    </div>
  );
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
      setError("Mídia indisponível.");
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
        setError("Mídia indisponível.");
      } else {
        setError("Não foi possível carregar a mídia.");
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
      setError("Não foi possível baixar a mídia.");
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
              ? "Áudio enviado"
              : media.kind === "video"
                ? "Vídeo enviado"
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
          <p className="text-xs text-slate-600">Carregando áudio...</p>
        ) : media.hasDownload ? (
          <button
            type="button"
            onClick={() => void loadMedia()}
            className="rounded-lg border border-[#d4c7b5] bg-white/80 px-3 py-2 text-sm text-slate-900"
          >
            Carregar áudio
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
          <p className="text-xs text-slate-600">Carregando vídeo...</p>
        ) : media.hasDownload ? (
          <button
            type="button"
            onClick={() => void loadMedia()}
            className="rounded-lg border border-[#d4c7b5] bg-white/80 px-3 py-2 text-sm text-slate-900"
          >
            Carregar mídia
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

function MessageReferencePreview({
  session,
  waId,
  item,
}: {
  session: AppSession | null;
  waId: string | null;
  item: InboxMessageItem;
}) {
  const replyTo = item.replyTo;
  const media = replyTo?.previewMedia ?? null;
  const location = replyTo?.previewLocation ?? null;
  const imageMessageId = media?.kind === "image" ? media.messageId?.trim() || null : null;
  const imageCacheKey = getMediaCacheKey(imageMessageId, media?.kind);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (imageUrlRef.current) {
      URL.revokeObjectURL(imageUrlRef.current);
      imageUrlRef.current = null;
    }
    setImageUrl(null);
    setImageFailed(false);

    if (!session || !waId || !media?.hasDownload || media.kind !== "image" || !imageMessageId || !imageCacheKey) {
      return;
    }

    const cachedBlob = mediaBlobCache.get(imageCacheKey);
    if (cachedBlob) {
      const objectUrl = URL.createObjectURL(cachedBlob);
      imageUrlRef.current = objectUrl;
      setImageUrl(objectUrl);
      return;
    }
    const lastNotFoundAt = mediaNotFoundCache.get(imageCacheKey);
    if (lastNotFoundAt && Date.now() - lastNotFoundAt < MEDIA_NOT_FOUND_TTL_MS) {
      setImageFailed(true);
      return;
    }

    let cancelled = false;
    void fetchAppConversationMedia(session, waId, imageMessageId)
      .then((response) => {
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(response.blob);
        imageUrlRef.current = objectUrl;
        mediaBlobCache.set(imageCacheKey, response.blob);
        mediaNotFoundCache.delete(imageCacheKey);
        setImageUrl(objectUrl);
      })
      .catch((err) => {
        if (cancelled) return;
        if ((err as { status?: number }).status === 404) {
          mediaNotFoundCache.set(imageCacheKey, Date.now());
        }
        setImageFailed(true);
      });

    return () => {
      cancelled = true;
      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current);
        imageUrlRef.current = null;
      }
    };
  }, [imageCacheKey, imageMessageId, media?.hasDownload, media?.kind, session, waId]);

  useEffect(() => {
    return () => {
      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current);
        imageUrlRef.current = null;
      }
    };
  }, []);

  if (media) {
    const text =
      getTruncatedReferenceText(media.caption) ||
      getTruncatedReferenceText(media.fileName) ||
      getTruncatedReferenceText(replyTo?.previewBody) ||
      getReferenceMediaFallbackLabel(media.kind);

    if (media.kind === "image") {
      return (
        <div className="mt-1 flex min-w-0 items-center gap-2">
          {imageUrl && !imageFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt="Imagem referenciada"
              className="h-12 w-12 shrink-0 rounded-md border border-black/10 object-cover"
            />
          ) : (
            <span
              aria-label="Imagem referenciada"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-slate-100 text-[10px] font-bold text-slate-600"
            >
              IMG
            </span>
          )}
          {text && text !== "Imagem" ? <span className="line-clamp-2 min-w-0 break-words">{text}</span> : null}
        </div>
      );
    }

    const marker = media.kind === "video" ? "PLAY" : media.kind === "audio" ? "AUD" : "DOC";
    const ariaLabel =
      media.kind === "video"
        ? "Vídeo referenciado"
        : media.kind === "audio"
          ? "Áudio referenciado"
          : "Documento referenciado";
    return (
      <div className="mt-1 flex min-w-0 items-center gap-2">
        <span
          aria-label={ariaLabel}
          className="flex h-8 w-10 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-slate-100 text-[10px] font-bold text-slate-600"
        >
          {marker}
        </span>
        <span className="line-clamp-1 min-w-0 break-all">{text}</span>
      </div>
    );
  }

  if (location) {
    const text =
      getTruncatedReferenceText(location.name) ||
      getTruncatedReferenceText(location.address) ||
      "Localização compartilhada";
    return (
      <div className="mt-1 flex min-w-0 items-center gap-2">
        <span
          aria-label="Localização referenciada"
          className="flex h-8 w-10 shrink-0 items-center justify-center rounded-md border border-sky-300 bg-sky-50 text-[10px] font-bold text-sky-700"
        >
          PIN
        </span>
        <span className="line-clamp-1 min-w-0 break-words">{text}</span>
      </div>
    );
  }

  return <p className="mt-0.5 line-clamp-2 break-words">{getTimelineReplyPreview(item)}</p>;
}

function getConversationIdentity(item: Pick<InboxConversationItem, "waId" | "waIdCanonical">) {
  return item.waIdCanonical ?? item.waId;
}

function getConversationIdentityCandidates(item: Pick<InboxConversationItem, "waId" | "waIdCanonical">) {
  return Array.from(
    new Set([getConversationIdentity(item), item.waId, item.waIdCanonical ?? ""].filter(Boolean))
  );
}

function conversationIdentityMatches(
  left: Array<string | null | undefined>,
  right: Array<string | null | undefined>
) {
  const normalize = (value: string | null | undefined) => String(value ?? "").trim();
  const leftValues = new Set(left.map(normalize).filter(Boolean));
  return right.map(normalize).some((value) => Boolean(value) && leftValues.has(value));
}

function isConversationGoneError(error: unknown) {
  const typed = error as AppApiError;
  return (
    typed.status === 404 ||
    typed.status === 410 ||
    typed.errorCode === "conversation_not_found"
  );
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
  { value: "WAITING", label: "Aguardando atendimento" },
  { value: "AUTOMATION", label: "Automação" },
  { value: "IN_PROGRESS", label: "Em atendimento" },
  { value: "WAITING_USER", label: "Aguardando cliente" },
  { value: "CLOSED", label: "Encerradas" },
  { value: "MINE", label: "Minhas" },
  { value: "UNASSIGNED", label: "Sem responsável" },
] as const;

type ConversationFilter = (typeof CONVERSATION_FILTERS)[number]["value"];
const PRIMARY_CONVERSATION_FILTERS: ConversationFilter[] = ["ALL", "WAITING", "AUTOMATION"];
const MORE_CONVERSATION_FILTERS = CONVERSATION_FILTERS.filter(
  (item) => !PRIMARY_CONVERSATION_FILTERS.includes(item.value)
);
const CONVERSATION_FILTER_BY_VALUE = new Map(CONVERSATION_FILTERS.map((item) => [item.value, item]));
type DepartmentFilter = "ALL" | string;
type ConversationChannelFilter = "ALL" | InboxChannel;

const CONVERSATION_CHANNEL_FILTERS: Array<{ value: InboxChannel; label: string }> = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "messenger", label: "Messenger" },
  { value: "webchat", label: "Chat do site" },
  { value: "telegram", label: "Telegram" },
  { value: "support", label: "Suporte" },
];

const CONVERSATION_QUICK_FILTERS = [
  { value: "UNREAD", label: "Não lidas" },
  { value: "HUMAN", label: "Humano" },
  { value: "ASSIGNED", label: "Atribuídas" },
] as const;

type ConversationQuickFilter =
  | "ALL"
  | (typeof CONVERSATION_QUICK_FILTERS)[number]["value"];

type DepartmentOption = {
  id: string;
  name: string;
};

type PendingOutgoingMessage = {
  waId: string;
  conversationKey: string;
  text: string;
  replyTo: InboxReplyTarget | null;
};

type InboxReplyMode = "reply" | "rectify";

type InboxReplyTarget = {
  kind: "inbound" | "outbound";
  id: string;
  mode: InboxReplyMode;
  preview: string;
  direction: "INBOUND" | "OUTBOUND";
  type: string;
  media?: (NonNullable<InboxMessageItem["media"]> & { messageId?: string | null }) | null;
  location?: InboxMessageItem["location"];
};

type PendingUnreadScrollTarget = {
  conversationKey: string;
  lastReadAt: string | null;
  unreadCount: number;
};

type PendingReadAfterHydration = {
  conversationKey: string;
  conversationKeys: string[];
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
  const candidates = [
    item.lastMessage?.createdAt,
    item.lastInboundAt,
    item.lastOutboundAt,
    item.updatedAt,
  ].filter((value): value is string => Boolean(value));
  let latest: string | null = null;
  let latestTimestamp = Number.NEGATIVE_INFINITY;
  for (const value of candidates) {
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp) && timestamp > latestTimestamp) {
      latest = value;
      latestTimestamp = timestamp;
    }
  }
  return latest ?? item.updatedAt;
}

function getConversationActivityTimestamp(item: InboxConversationItem) {
  const activityAt = getConversationActivityAt(item);
  const timestamp = Date.parse(activityAt);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function sortConversationsByRecent(items: InboxConversationItem[], prioritizeLeads = false) {
  return [...items].sort((a, b) => {
    const aTs = getConversationActivityTimestamp(a);
    const bTs = getConversationActivityTimestamp(b);
    if (aTs === null && bTs === null) return 0;
    if (aTs === null) return 1;
    if (bTs === null) return -1;
    if (aTs !== bTs) return bTs - aTs;
    if (prioritizeLeads) {
      const priorityDiff = getLeadTemperatureScore(b) - getLeadTemperatureScore(a);
      if (priorityDiff !== 0) return priorityDiff;
    }
    return 0;
  });
}

function hasFlowContextValues(value: InboxConversationItem["flowContext"]) {
  if (!value) return false;
  return Object.values(value).some((item) => item !== null && item !== undefined && String(item).trim() !== "");
}

function mergeConversationStableFields(
  current: InboxConversationItem,
  incoming: InboxConversationItem
) {
  const shouldPreserveFlowContext = hasFlowContextValues(current.flowContext) && !hasFlowContextValues(incoming.flowContext);
  const shouldPreserveFlowTags = (current.flowTags?.length ?? 0) > 0 && (incoming.flowTags?.length ?? 0) === 0;
  if (!shouldPreserveFlowContext && !shouldPreserveFlowTags) return incoming;
  return {
    ...incoming,
    flowContext: shouldPreserveFlowContext ? current.flowContext : incoming.flowContext,
    flowTags: shouldPreserveFlowTags ? current.flowTags : incoming.flowTags,
  };
}

function dedupeConversationsByIdentity(items: InboxConversationItem[], prioritizeLeads = false) {
  const byIdentity = new Map<string, InboxConversationItem>();
  for (const item of sortConversationsByRecent(items, prioritizeLeads)) {
    const identity = getConversationIdentity(item);
    if (!byIdentity.has(identity)) {
      byIdentity.set(identity, item);
      continue;
    }

    const existing = byIdentity.get(identity)!;
    const existingTs = getConversationActivityTimestamp(existing) ?? Number.NEGATIVE_INFINITY;
    const nextTs = getConversationActivityTimestamp(item) ?? Number.NEGATIVE_INFINITY;
    if (nextTs > existingTs) {
      byIdentity.set(identity, mergeConversationStableFields(existing, item));
      continue;
    }

    if (!existing.waIdCanonical && item.waIdCanonical) {
      byIdentity.set(identity, {
        ...existing,
        waIdCanonical: item.waIdCanonical,
      });
    }
  }
  return sortConversationsByRecent(Array.from(byIdentity.values()), prioritizeLeads);
}

function mergeConversationsPreservingStableOrder(
  current: InboxConversationItem[],
  incoming: InboxConversationItem[],
  prioritizeLeads = false
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
    ...current.map((item) => {
      const incomingItem = incomingByIdentity.get(getConversationIdentity(item));
      return incomingItem ? mergeConversationStableFields(item, incomingItem) : item;
    }),
    ...incoming.filter((item) => !currentIndexByIdentity.has(getConversationIdentity(item))),
  ];

  // Keep unchanged conversations stable, but promote conversations with newer activity.
  // A support inbox must reflect the operational queue without requiring a page refresh.
  return sortConversationsByRecent(merged, prioritizeLeads);
}

function updateConversationInPlace(
  current: InboxConversationItem[],
  conversationKey: string,
  updater: (item: InboxConversationItem) => InboxConversationItem
) {
  return current.map((item) => (getConversationIdentity(item) === conversationKey ? updater(item) : item));
}

function isConversationUnread(item: InboxConversationItem, state: InboxReadState) {
  const identityCandidates = getConversationIdentityCandidates(item);
  if (identityCandidates.some((key) => state.manuallyUnreadByConversationKey[key])) return true;
  const activityAt = item.lastInboundAt;
  const lastReadAt = getLatestReadAtForConversation(item, state);
  if (activityAt === null) return false;
  if (!lastReadAt) return true;
  const activityAtTimestamp = Date.parse(activityAt);
  if (!Number.isFinite(activityAtTimestamp)) return false;
  const lastReadAtTimestamp = Date.parse(lastReadAt);
  if (!Number.isFinite(lastReadAtTimestamp)) return true;
  return activityAtTimestamp > lastReadAtTimestamp;
}

function isConversationUnreadForUser(
  item: InboxConversationItem,
  state: InboxReadState,
  user: AppSession["user"] | null | undefined
) {
  const identityCandidates = getConversationIdentityCandidates(item);
  if (identityCandidates.some((key) => state.manuallyUnreadByConversationKey[key])) return true;
  if (!user) return false;
  if (!canUserReceiveTargetedNotification(item, user)) return false;
  return isConversationUnread(item, state);
}

function getConversationUnreadBadgeCount(
  item: InboxConversationItem,
  state: InboxReadState,
  user: AppSession["user"] | null | undefined
) {
  if (!isConversationUnreadForUser(item, state, user)) return 0;
  const count = Number(item.unreadCount ?? 0);
  return Number.isFinite(count) && count > 0 ? count : 1;
}

function getLatestReadAtForConversation(
  item: Pick<InboxConversationItem, "waId" | "waIdCanonical">,
  state: InboxReadState
) {
  let latestReadAt: string | null = null;
  for (const key of getConversationIdentityCandidates(item)) {
    latestReadAt = getLatestReadAt(latestReadAt, state.lastReadAtByConversationKey[key]);
  }
  return latestReadAt;
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

function getFileExtension(fileName: string | null | undefined) {
  const normalized = String(fileName ?? "").trim().toLowerCase();
  const dotIndex = normalized.lastIndexOf(".");
  return dotIndex >= 0 ? normalized.slice(dotIndex + 1) : "";
}

function isHeicOrHeifImage(file: File) {
  const mimeType = file.type.toLowerCase();
  const extension = getFileExtension(file.name);
  return mimeType.includes("heic") || mimeType.includes("heif") || extension === "heic" || extension === "heif";
}

function isLikelyIosDevice() {
  if (typeof navigator === "undefined") return false;
  const platform = navigator.platform || "";
  const userAgent = navigator.userAgent || "";
  const isiPadOSDesktopMode = platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod/i.test(userAgent) || isiPadOSDesktopMode;
}

function isLikelyImageFile(file: File) {
  const mimeType = file.type.toLowerCase();
  if (mimeType.startsWith("image/")) return true;
  return ["heic", "heif", "jpg", "jpeg", "png", "webp", "gif"].includes(getFileExtension(file.name));
}

function shouldNormalizeImageForMeta(file: File) {
  const mimeType = file.type.toLowerCase();
  if (isHeicOrHeifImage(file)) return true;
  if (isLikelyIosDevice() && isLikelyImageFile(file)) return true;
  if (!mimeType.startsWith("image/")) return false;
  return mimeType !== "image/jpeg" && mimeType !== "image/jpg" && mimeType !== "image/png";
}

function canAttemptBrowserImageCompression(file: File) {
  const mimeType = file.type.toLowerCase();
  if (mimeType.startsWith("image/")) return true;
  return ["heic", "heif", "jpg", "jpeg", "png", "webp"].includes(getFileExtension(file.name));
}

async function loadImageForCompression(file: File) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("image_decode_failed"));
    });
    image.src = objectUrl;
    return await loaded;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function formatFileSizeMb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function prepareMediaFileForUpload(file: File) {
  const forceJpegNormalization = shouldNormalizeImageForMeta(file);
  if (file.size <= MEDIA_UPLOAD_SOFT_LIMIT_BYTES && !forceJpegNormalization) return file;
  if (!canAttemptBrowserImageCompression(file) || typeof document === "undefined") return file;

  let image: HTMLImageElement;
  try {
    image = await loadImageForCompression(file);
  } catch {
    if (isHeicOrHeifImage(file)) {
      throw Object.assign(new Error("Não foi possível converter esta foto do iPhone para envio."), {
        details: "Tente selecionar a foto novamente, salvar como JPEG ou enviar pelo app Fotos em modo Mais compatível.",
      });
    }
    throw Object.assign(new Error("Não foi possível preparar esta imagem para envio."), {
      details: "Tente outra imagem ou compacte o arquivo antes de enviar.",
    });
  }
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const baseName = file.name.replace(/\.[^.]+$/, "") || "imagem";
  const maxSides = forceJpegNormalization ? [2048, 1600, 1280] : [2048];
  const qualities = forceJpegNormalization ? [0.82, 0.72, 0.62, 0.52, 0.42] : [0.82, 0.72, 0.62];
  let smallestBlob: Blob | null = null;

  for (const maxSide of maxSides) {
    const ratio = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceWidth * ratio));
    canvas.height = Math.max(1, Math.round(sourceHeight * ratio));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    for (const quality of qualities) {
      const blob = await canvasToBlob(canvas, "image/jpeg", quality);
      if (!blob) continue;
      if (!smallestBlob || blob.size < smallestBlob.size) smallestBlob = blob;
      if (forceJpegNormalization && blob.size <= MEDIA_UPLOAD_SOFT_LIMIT_BYTES) {
        return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
      }
      if (blob.size < file.size && blob.size <= IMAGE_UPLOAD_TARGET_BYTES) {
        return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
      }
    }
  }

  if (smallestBlob && smallestBlob.size < file.size) {
    return new File([smallestBlob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  }

  return file;
}

function getInboundNotificationIdentity(waId: string | null, item: InboxMessageItem) {
  if (item.direction !== "INBOUND") return null;
  return `${waId ?? "unknown"}:${item.messageId ?? item.metaMessageId ?? item.createdAt}:${item.type}`;
}

function findFirstUnreadMessageIndex(items: InboxMessageItem[], lastReadAt: string | null, unreadCount = 0) {
  const lastReadTimestamp = Date.parse(lastReadAt ?? "");
  const hasReadTimestamp = Number.isFinite(lastReadTimestamp);
  if (!hasReadTimestamp && unreadCount > 0) {
    let remainingInbound = unreadCount;
    for (let index = items.length - 1; index >= 0; index -= 1) {
      if (items[index]?.direction !== "INBOUND") continue;
      remainingInbound -= 1;
      if (remainingInbound <= 0) return index;
    }
  }
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

function getLatestMessageTimestamp(items: InboxMessageItem[]) {
  let latest: number | null = null;
  for (const item of items) {
    const timestamp = Date.parse(item.createdAt);
    if (!Number.isFinite(timestamp)) continue;
    if (latest === null || timestamp > latest) latest = timestamp;
  }
  return latest;
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
	    protocol?: string | null;
	    cycleId?: string | null;
	    channel?: string | null;
    provider?: string | null;
    channelAccountId?: string | null;
    channelOutboundEnabled?: boolean;
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
    waitingFirstResponseSec?: number | null;
    activeDurationSec?: number | null;
    isUnassigned: boolean;
    flowContext?: Record<string, string | number | boolean | null>;
    flowTags?: string[];
    continuation?: InboxConversationItem["continuation"];
  }
) {
  const nextAssignedUserId = payload.assignedUserId;
  const nextStatus =
    nextAssignedUserId && payload.status === "WAITING" ? ("IN_PROGRESS" as const) : payload.status;
  return {
    ...item,
	    waId: payload.waId ?? item.waId,
	    waIdCanonical: payload.waIdCanonical ?? item.waIdCanonical,
	    protocol: payload.protocol ?? item.protocol ?? null,
	    cycleId: payload.cycleId ?? item.cycleId ?? null,
	    channel: payload.channel ?? item.channel,
    provider: payload.provider ?? item.provider,
    channelAccountId: payload.channelAccountId ?? item.channelAccountId,
    channelOutboundEnabled: payload.channelOutboundEnabled ?? item.channelOutboundEnabled,
    mode: payload.mode,
    handoffStatus: payload.handoffStatus ?? item.handoffStatus ?? "none",
    assignedUserId: nextAssignedUserId,
    assignedTo: payload.assignedTo,
    assignedUserName: payload.assignedUserName,
    assignedAt: payload.assignedAt,
    departmentId: payload.departmentId,
    departmentName: payload.departmentName,
    queueId: payload.queueId,
    queueName: payload.queueName,
    status: nextStatus,
    closedAt: payload.closedAt,
    lastInboundAt: payload.lastInboundAt,
    lastOutboundAt: payload.lastOutboundAt,
    waitingFirstResponseSec: payload.waitingFirstResponseSec ?? item.waitingFirstResponseSec ?? null,
    activeDurationSec: payload.activeDurationSec ?? item.activeDurationSec ?? null,
    isUnassigned: payload.isUnassigned,
    flowContext: payload.flowContext ?? item.flowContext,
    flowTags: payload.flowTags ?? item.flowTags,
    continuation: payload.continuation ?? item.continuation ?? null,
  };
}

function getConversationOperationalStatus(item: Pick<InboxConversationItem, "status" | "mode" | "assignedUserId">) {
  if (item.assignedUserId && item.status === "WAITING") return "IN_PROGRESS";
  if (item.status) return item.status;
  if (item.mode === "HUMAN") {
    return item.assignedUserId ? "IN_PROGRESS" : "WAITING";
  }
  return null;
}

function isAutomationQueueConversation(
  item: Pick<InboxConversationItem, "status" | "mode" | "handoffStatus" | "assignedUserId" | "assignedAt"> | null
) {
  if (!item) return false;
  const handoffStatus = item.handoffStatus ?? "none";
  return (
    item.mode === "BOT" &&
    (item.status === "WAITING" || item.status === "WAITING_USER" || item.status === null) &&
    handoffStatus === "none" &&
    !item.assignedUserId &&
    !item.assignedAt
  );
}

function getConversationStatusLabel(status: ConversationOperationalStatus | null) {
  switch (status) {
    case "WAITING":
      return getConversationStatusUxLabel(status);
    case "IN_PROGRESS":
      return getConversationStatusUxLabel(status);
    case "WAITING_USER":
      return getConversationStatusUxLabel(status);
    case "CLOSED":
      return getConversationStatusUxLabel(status);
    default:
      return getConversationStatusUxLabel(status);
  }
}

function getConversationStatusLabelForItem(
  item: Pick<InboxConversationItem, "status" | "mode" | "handoffStatus" | "assignedUserId" | "assignedAt">
) {
  if (isAutomationQueueConversation(item)) return "Automação";
  return getConversationStatusLabel(getConversationOperationalStatus(item));
}

function getConversationModeLabel(
  item: Pick<InboxConversationItem, "mode" | "handoffStatus"> | null
) {
  if (!item) return "Sem modo";
  if (item.handoffStatus === "active" || item.handoffStatus === "pending") return "Atendimento humano";
  return item.mode === "HUMAN" ? "Atendimento humano" : "Automação ativa";
}

function getConversationStatusClass(status: ConversationOperationalStatus | null) {
  switch (status) {
    case "WAITING":
      return "theme-conversation-status-waiting";
    case "IN_PROGRESS":
      return "theme-conversation-status-progress";
    case "WAITING_USER":
      return "theme-conversation-status-user";
    case "CLOSED":
      return "theme-conversation-status-closed";
    default:
      return "theme-conversation-status-closed";
  }
}

function getConversationStatusClassForItem(
  item: Pick<InboxConversationItem, "status" | "mode" | "handoffStatus" | "assignedUserId" | "assignedAt">
) {
  if (isAutomationQueueConversation(item)) return "theme-conversation-status-automation";
  return getConversationStatusClass(getConversationOperationalStatus(item));
}

function getConversationChannel(item: Pick<InboxConversationItem, "channel"> | null): InboxChannel {
  const channel = String(item?.channel ?? "").trim().toLowerCase();
  if (
    channel === "messenger" ||
    channel === "instagram" ||
    channel === "webchat" ||
    channel === "telegram" ||
    channel === "support"
  ) {
    return channel;
  }
  return "whatsapp";
}

function getConversationChannelLabel(item: Pick<InboxConversationItem, "channel"> | null) {
  return getChannelUxLabel(getConversationChannel(item));
}

function canSendInboxText(
  channel: InboxChannel,
  item: Pick<InboxConversationItem, "channelOutboundEnabled" | "provider"> | null
) {
  if (channel === "whatsapp" && item?.provider === "web_session") return item.channelOutboundEnabled === true;
  if (channel === "whatsapp") return true;
  if (channel === "support") return true;
  return item?.channelOutboundEnabled === true;
}

function canSendInboxMedia(channel: InboxChannel, item?: Pick<InboxConversationItem, "provider"> | null) {
  return channel === "whatsapp";
}

function canSendInboxTemplate(channel: InboxChannel, item?: Pick<InboxConversationItem, "provider"> | null) {
  if (channel === "whatsapp" && item?.provider === "web_session") return false;
  return channel === "whatsapp";
}

function getInboxTextOutboundDisabledMessage(
  channel: InboxChannel,
  item?: Pick<InboxConversationItem, "provider"> | null
) {
  if (channel === "whatsapp" && item?.provider === "web_session") {
    return "Este canal está temporariamente desconectado.";
  }
  switch (channel) {
    case "webchat":
      return "Envio pelo Chat do site ainda não está habilitado neste canal.";
    case "telegram":
      return "Envio por Telegram ainda não está habilitado neste canal.";
    case "instagram":
      return "Envio por Instagram ainda não está habilitado neste canal.";
    case "support":
      return "Envio interno de suporte indisponível neste atendimento.";
    case "messenger":
      return "Envio pelo Messenger ainda não está habilitado neste canal.";
    default:
      return "Envio indisponível neste canal.";
  }
}

function getInboxMediaOutboundDisabledMessage(channel: InboxChannel, item?: Pick<InboxConversationItem, "provider"> | null) {
  if (channel === "support") return "Envio de mídia ainda não está habilitado para suporte interno.";
  if (channel === "webchat") return "Envio de mídia ainda não está habilitado para Chat do site.";
  if (channel === "telegram") return "Envio de mídia ainda não está habilitado para Telegram.";
  if (channel === "instagram") return "Envio de mídia ainda não está habilitado para Instagram.";
  if (channel === "messenger") return "Envio de mídia ainda não está habilitado para Messenger.";
  return "Envio de mídia ainda não está habilitado para este canal.";
}

function getConversationChannelBadgeClass(item: Pick<InboxConversationItem, "channel"> | null) {
  switch (getConversationChannel(item)) {
    case "messenger":
      return "border-[#1877F2]/25 bg-white";
    case "instagram":
      return "border-pink-300/40 bg-white";
    case "webchat":
      return "border-sky-300/40 bg-white";
    case "telegram":
      return "border-[#229ED9]/25 bg-white";
    case "support":
      return "border-violet-300/40 bg-white";
    default:
      return "border-[#25D366]/25 bg-white";
  }
}

function ConversationChannelLogo({
  item,
  className = "h-4 w-4",
}: {
  item: Pick<InboxConversationItem, "channel"> | null;
  className?: string;
}) {
  switch (getConversationChannel(item)) {
    case "messenger":
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
          <circle cx="16" cy="16" r="16" fill="#1877F2" />
          <path
            fill="#fff"
            d="M17.5 25v-8h2.7l.4-3.1h-3.1v-2c0-.9.2-1.5 1.5-1.5h1.7V7.6c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.5-4 4.1v2.3h-2.7V17h2.7v8h3.2z"
          />
        </svg>
      );
    case "instagram":
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
          <defs>
            <linearGradient id="instagram-logo-gradient" x1="4" x2="28" y1="28" y2="4">
              <stop offset="0" stopColor="#FEDA75" />
              <stop offset="0.35" stopColor="#FA7E1E" />
              <stop offset="0.65" stopColor="#D62976" />
              <stop offset="1" stopColor="#4F5BD5" />
            </linearGradient>
          </defs>
          <rect width="32" height="32" rx="9" fill="url(#instagram-logo-gradient)" />
          <rect x="8.5" y="8.5" width="15" height="15" rx="4.5" fill="none" stroke="#fff" strokeWidth="2.2" />
          <circle cx="16" cy="16" r="3.8" fill="none" stroke="#fff" strokeWidth="2.2" />
          <circle cx="21.2" cy="10.8" r="1.2" fill="#fff" />
        </svg>
      );
    case "webchat":
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
          <circle cx="16" cy="16" r="16" fill="#0EA5E9" />
          <path
            fill="#fff"
            d="M8 11.5A4.5 4.5 0 0 1 12.5 7h7A4.5 4.5 0 0 1 24 11.5v4A4.5 4.5 0 0 1 19.5 20h-4.9l-4.1 3.2A.9.9 0 0 1 9 22.5V20h-.5A4.5 4.5 0 0 1 4 15.5v-4A4.5 4.5 0 0 1 8.5 7H10a6.5 6.5 0 0 0-2 4.5v4A6.5 6.5 0 0 0 14.5 22h4.3l.2-.2H12.7l-1.7 1.3V18H8.5A2.5 2.5 0 0 1 6 15.5v-4A2.5 2.5 0 0 1 8.5 9h11A2.5 2.5 0 0 1 22 11.5v4a2.5 2.5 0 0 1-2.5 2.5H14l-3 2.4V18H8.5A2.5 2.5 0 0 1 6 15.5v-4Z"
          />
          <circle cx="11.5" cy="13.5" r="1.2" fill="#0EA5E9" />
          <circle cx="16" cy="13.5" r="1.2" fill="#0EA5E9" />
          <circle cx="20.5" cy="13.5" r="1.2" fill="#0EA5E9" />
        </svg>
      );
    case "telegram":
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
          <circle cx="16" cy="16" r="16" fill="#229ED9" />
          <path
            fill="#fff"
            d="M24.7 9.1 21.9 22c-.2.9-.8 1.1-1.6.7l-4.4-3.2-2.1 2c-.2.2-.4.4-.9.4l.3-4.5 8.2-7.4c.4-.3-.1-.5-.5-.2l-10.1 6.4-4.4-1.4c-1-.3-1-.9.2-1.3l17.1-6.6c.8-.3 1.5.2 1.2 1.2z"
          />
        </svg>
      );
    case "support":
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
          <circle cx="16" cy="16" r="16" fill="#7C3AED" />
          <path
            fill="#fff"
            d="M10 9.5A3.5 3.5 0 0 1 13.5 6h5A3.5 3.5 0 0 1 22 9.5v3A3.5 3.5 0 0 1 18.5 16h-1.7l-3.4 2.6A.8.8 0 0 1 12.1 18v-2H10a3.5 3.5 0 0 1-3.5-3.5v-3A3.5 3.5 0 0 1 10 9.5Zm2.5 11A2.5 2.5 0 0 1 15 18h6a2.5 2.5 0 0 1 2.5 2.5v1A2.5 2.5 0 0 1 21 24h-1.8l-2.8 2.1a.7.7 0 0 1-1.1-.6V24H15a2.5 2.5 0 0 1-2.5-2.5v-1Z"
          />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
          <circle cx="16" cy="16" r="16" fill="#25D366" />
          <path
            fill="#fff"
            d="M23.2 18.9c-.4-.2-2.2-1.1-2.5-1.2-.3-.1-.6-.2-.8.2-.2.4-.9 1.2-1.1 1.4-.2.2-.4.3-.8.1-.4-.2-1.5-.5-2.8-1.7-1-1-1.7-2.1-1.9-2.5-.2-.4 0-.6.2-.8.2-.2.4-.4.6-.7.2-.2.2-.4.4-.6.1-.2.1-.5 0-.7-.1-.2-.8-1.9-1.1-2.6-.3-.7-.6-.6-.8-.6h-.7c-.2 0-.7.1-1 .5-.3.4-1.3 1.3-1.3 3.1s1.3 3.6 1.5 3.8c.2.2 2.6 4 6.3 5.6.9.4 1.6.6 2.1.8.9.3 1.7.3 2.3.2.7-.1 2.2-.9 2.5-1.8.3-.9.3-1.6.2-1.8-.2-.3-.5-.4-.8-.6z"
          />
          <path
            fill="#fff"
            d="M16 5.7A10.2 10.2 0 0 0 7.2 21l-1.1 4 4.1-1.1A10.2 10.2 0 1 0 16 5.7zm0 18.5c-1.8 0-3.5-.5-5-1.6l-.4-.2-2.4.6.7-2.3-.3-.4a8.2 8.2 0 1 1 7.4 3.9z"
          />
        </svg>
      );
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

function formatOperationalDuration(seconds?: number | null) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return null;
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}min` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

function getConversationOperationalDurationLabel(
  item: Pick<InboxConversationItem, "waitingFirstResponseSec" | "activeDurationSec" | "status" | "assignedUserId">
) {
  const waiting = formatOperationalDuration(item.waitingFirstResponseSec);
  if (waiting && !item.assignedUserId && item.status !== "CLOSED") return `1a resposta ${waiting}`;
  const active = formatOperationalDuration(item.activeDurationSec);
  if (active && item.status !== "CLOSED") return `Em atendimento ${active}`;
  return null;
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

function getConversationAssignmentLabel(
  item: Pick<InboxConversationItem, "assignedUserId" | "assignedUserName" | "assignedTo"> | null,
  currentUserId?: string | null
) {
  if (!item?.assignedUserId) return null;
  if (currentUserId && item.assignedUserId === currentUserId) return "Atribuída a você";
  if (item.assignedUserName) return `Atribuída a ${item.assignedUserName}`;
  return "Atribuída";
}

function getConversationAssignmentBadgeClass(isMine: boolean, isActive: boolean) {
  if (isMine) {
    return isActive
      ? "border-emerald-200/35 bg-emerald-400/25 text-emerald-50"
      : "border-emerald-300/25 bg-emerald-500/14 text-emerald-100";
  }
  return isActive
    ? "border-white/25 bg-white/16 text-white/85"
    : "border-white/15 bg-white/8 text-white/62";
}

function isAppAdmin(session: AppSession | null) {
  return session?.user.role === "ADMIN";
}

function isBusinessSession(session: AppSession | null) {
  return session?.profile !== "government";
}

function canSessionAccessConversationDepartment(
  session: AppSession | null,
  departmentId?: string | null
) {
  if (!session) return false;
  if (isAppAdmin(session)) return true;
  const role = String(session.user.role || "").trim().toUpperCase();
  if (role !== "AGENT" && role !== "SUPERVISOR") return true;
  const targetDepartmentId = departmentId ?? null;
  const userDepartmentIds = Array.isArray(session.user.departmentIds)
    ? session.user.departmentIds.map((value) => String(value ?? "").trim()).filter(Boolean)
    : [];
  if (userDepartmentIds.length > 0) return Boolean(targetDepartmentId && userDepartmentIds.includes(targetDepartmentId));
  if (!session.user.departmentId) return false;
  return session.user.departmentId === targetDepartmentId;
}

function getTemplateBodyPreview(content: string | null | undefined) {
  const raw = String(content ?? "").trim();
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as unknown;
    const components = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).components)
        ? ((parsed as Record<string, unknown>).components as unknown[])
        : null;
    const body = components?.find((component) => {
      if (!component || typeof component !== "object" || Array.isArray(component)) return false;
      return String((component as Record<string, unknown>).type ?? "").toLowerCase() === "body";
    });
    if (body && typeof body === "object" && !Array.isArray(body)) {
      const text = (body as Record<string, unknown>).text;
      if (typeof text === "string" && text.trim()) return text.trim();
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      for (const key of ["body", "bodyText", "text", "content"]) {
        const value = (parsed as Record<string, unknown>)[key];
        if (typeof value === "string" && value.trim()) return value.trim();
      }
    }
  } catch {
    // Plain text template content is valid in the local catalog.
  }
  return raw;
}

function renderTemplatePreview(content: string | null | undefined, variables: Record<string, string>) {
  const body = getTemplateBodyPreview(content);
  if (!body) return "Conteúdo do modelo indisponível.";
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (match, key: string) => {
    const value = variables[key]?.trim();
    return value || match;
  });
}

function getTemplateVariableKeys(template: AppTemplateItem | null) {
  return (template?.variablesDetected ?? [])
    .map((key) => String(key).trim())
    .filter((key) => /^\d+$/.test(key));
}

function formatMetaUsd(value: number | null) {
  if (value === null) return "Valor a confirmar";
  return `US$ ${value.toLocaleString("pt-BR", {
    minimumFractionDigits: value >= 1 ? 2 : 4,
    maximumFractionDigits: 4,
  })}`;
}

function InboxCostPreview({ preview }: { preview: AppMetaCostPreview | null }) {
  if (!preview) return null;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <div className="grid gap-2 sm:grid-cols-3">
        <span>Categoria: <strong className="uppercase">{preview.metaCategory}</strong></span>
        <span>Unitário: <strong>{formatMetaUsd(preview.unitCostUsd)}</strong></span>
        <span>Estimado: <strong>{formatMetaUsd(preview.estimatedCostUsd)}</strong></span>
      </div>
      <p className="mt-2">
        Estimativa sujeita à entrega, categoria, país e política vigente da Meta.
      </p>
    </div>
  );
}

function buildInboxErrorToast(error: string | null, errorDetails: string | null, leadError: string | null) {
  const friendlyError = error ? getAppErrorUxMessage({ message: error }) : null;
  const friendlyLeadError = leadError ? getAppErrorUxMessage({ message: leadError }) : null;
  if (error && errorDetails && !error.includes(errorDetails)) {
    return `${friendlyError}\n${errorDetails}`;
  }
  return friendlyError ?? friendlyLeadError;
}

export default function AppInboxPage() {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [conversations, setConversations] = useState<InboxConversationItem[]>([]);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [adminConnection, setAdminConnection] = useState<AdminConnection | null>(null);
  const [adminClientKey, setAdminClientKey] = useState<string | null>(null);
  const [tenantNameLabel, setTenantNameLabel] = useState<string | null>(null);
  const [tenantPhoneLabel, setTenantPhoneLabel] = useState<string | null>(null);
  const [departments, setDepartments] = useState<AdminDepartmentItem[]>([]);
  const [transferDepartments, setTransferDepartments] = useState<AdminDepartmentItem[]>([]);
  const [selectedConversationKey, setSelectedConversationKey] = useState<string | null>(null);
  const [selectedConversationWaId, setSelectedConversationWaId] = useState<string | null>(null);
  const [messages, setMessages] = useState<InboxMessageItem[]>([]);
  const [messagesConversationKey, setMessagesConversationKey] = useState<string | null>(null);
  const [leadNotes, setLeadNotes] = useState<LeadNoteItem[]>([]);
  const [crmStatusOptions, setCrmStatusOptions] = useState<CrmBusinessStatusConfig[]>([]);
  const [statusDraft, setStatusDraft] = useState<LeadStatus | "">("");
  const [leadNameDraft, setLeadNameDraft] = useState("");
  const [leadEmailDraft, setLeadEmailDraft] = useState("");
  const [leadCompanyDraft, setLeadCompanyDraft] = useState("");
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
  const [replyTarget, setReplyTarget] = useState<InboxReplyTarget | null>(null);
  const [openMessageActionsId, setOpenMessageActionsId] = useState<string | null>(null);
  const [selectedMediaFile, setSelectedMediaFile] = useState<File | null>(null);
  const [audioRecordingState, setAudioRecordingState] = useState<"idle" | "recording" | "stopping">(
    "idle"
  );
  const [sendingMessage, setSendingMessage] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templateItems, setTemplateItems] = useState<AppTemplateItem[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateVariables, setTemplateVariables] = useState<Record<string, string>>({});
  const [templateCostPreview, setTemplateCostPreview] = useState<AppMetaCostPreview | null>(null);
  const [sendingTemplate, setSendingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [cannedModalOpen, setCannedModalOpen] = useState(false);
  const [cannedRepliesLoading, setCannedRepliesLoading] = useState(false);
  const [cannedReplies, setCannedReplies] = useState<AppCannedReplyItem[]>([]);
  const [cannedReplySearch, setCannedReplySearch] = useState("");
  const [selectedCannedReplyId, setSelectedCannedReplyId] = useState("");
  const [sendingCannedReply, setSendingCannedReply] = useState(false);
  const [cannedReplyError, setCannedReplyError] = useState<string | null>(null);
  const [queuedMessageCount, setQueuedMessageCount] = useState(0);
  const [conversationAction, setConversationAction] = useState<string | null>(null);
  const [conversationFilter, setConversationFilter] = useState<ConversationFilter>("ALL");
  const [conversationChannelFilter, setConversationChannelFilter] =
    useState<ConversationChannelFilter>("ALL");
  const [conversationQuickFilter, setConversationQuickFilter] =
    useState<ConversationQuickFilter>("ALL");
  const [conversationSearch, setConversationSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<DepartmentFilter>("ALL");
  const [conversationFilterCounts, setConversationFilterCounts] = useState<Record<ConversationFilter, number>>({
    ALL: 0,
    WAITING: 0,
    AUTOMATION: 0,
    IN_PROGRESS: 0,
    WAITING_USER: 0,
    CLOSED: 0,
    MINE: 0,
    UNASSIGNED: 0,
  });
  const [statusActionDraft, setStatusActionDraft] = useState<ConversationOperationalStatus | "">("");
  const [transferUserId, setTransferUserId] = useState("");
  const [transferDepartmentId, setTransferDepartmentId] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [showMoreConversationFilters, setShowMoreConversationFilters] = useState(false);
  const [showMobileCrm, setShowMobileCrm] = useState(false);
  const [showContactTimeline, setShowContactTimeline] = useState(false);
  const [contactTimelineItems, setContactTimelineItems] = useState<AppContactTimelineItem[]>([]);
  const [contactTimelineCursor, setContactTimelineCursor] = useState<string | null>(null);
  const [loadingContactTimeline, setLoadingContactTimeline] = useState(false);
  const [contactTimelineError, setContactTimelineError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const isBusinessTenant = isBusinessSession(session);
  const [leadError, setLeadError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [soundPreferenceLoaded, setSoundPreferenceLoaded] = useState(false);
  const [pushStatus, setPushStatus] = useState<AppPushStatus | null>(null);
  const [pushUiStatus, setPushUiStatus] = useState<
    "checking" | "ready" | "enabled" | "denied" | "unsupported" | "needs_install" | "not_configured" | "error"
  >("checking");
  const [pushBusy, setPushBusy] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isIosViewport, setIsIosViewport] = useState(false);
  const [isMobileKeyboardOpen, setIsMobileKeyboardOpen] = useState(false);
  const pushAutoEnableAttemptedRef = useRef(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [unreadSeparatorIndex, setUnreadSeparatorIndex] = useState<number | null>(null);
  const [unreadAnchorMessageIdentity, setUnreadAnchorMessageIdentity] = useState<string | null>(null);
  const [highlightedReferenceId, setHighlightedReferenceId] = useState<string | null>(null);
  const [readState, setReadState] = useState<InboxReadState>(EMPTY_READ_STATE);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const conversationListRef = useRef<HTMLDivElement | null>(null);
  const conversationListLastScrollAtRef = useRef(0);
  const conversationListLastTouchOpenAtRef = useRef(0);
  const conversationListSuppressClickUntilRef = useRef(0);
  const conversationListTouchRef = useRef<{ x: number; y: number; scrollTop: number; moved: boolean } | null>(null);
  const shouldScrollToBottomRef = useRef(false);
  const pendingUnreadScrollTargetRef = useRef<PendingUnreadScrollTarget | null>(null);
  const pendingReadAfterHydrationRef = useRef<PendingReadAfterHydration | null>(null);
  const pendingUnreadAnchorConversationIdentityRef = useRef<string | null>(null);
  const pendingUnreadLastReadAtRef = useRef<string | null>(null);
  const pendingUnreadAnchorMessageIdRef = useRef<string | null>(null);
  const timelineOutOfSyncRetryKeyRef = useRef<string | null>(null);
  const conversationOpenStartedAtRef = useRef<{ key: string; startedAt: number } | null>(null);
  const conversationDetailLoadedAtRef = useRef<{ key: string; loadedAt: number; itemCount: number } | null>(null);
  const lastSelectedConversationKeyRef = useRef<string | null>(null);
  const lastMessageSignatureRef = useRef<string | null>(null);
  const lastInboundConversationSignatureRef = useRef<string | null>(null);
  const lastInboundConversationTimestampRef = useRef<number | null>(null);
  const humanFlowConversationKeysRef = useRef(new Set<string>());
  const hasInitializedConversationSoundRef = useRef(false);
  const suppressNextConversationRefreshNotificationRef = useRef(false);
  const loadedConversationPageCountRef = useRef(0);
  const conversationQueryKeyRef = useRef("");
  const notifiedInboundMessageKeysRef = useRef(new Set<string>());
  const primedTimelineNotificationKeysRef = useRef(new Set<string>());
  const outgoingQueueRef = useRef<PendingOutgoingMessage[]>([]);
  const processingOutgoingRef = useRef(false);
  const detailRequestSeqRef = useRef(0);
  const selectedTimelineLastRefreshAtRef = useRef(0);
  const selectedTimelineRequestedActivityAtRef = useRef<number | null>(null);
  const selectedConversationIdentityCandidatesRef = useRef<string[]>([]);
  const refreshConversationListRef = useRef<((activeSession: AppSession) => Promise<void>) | null>(null);
  const refreshSelectedTimelineRef = useRef<
    ((activeSession: AppSession, waId: string, mode?: "replace" | "append") => Promise<void>) | null
  >(null);
  const timelineCacheRef = useRef(new Map<string, InboxMessageItem[]>());
  const highlightedReferenceTimeoutRef = useRef<number | null>(null);
  const renderedPriorityLogKeysRef = useRef(new Set<string>());
  const sortedLogSignatureRef = useRef<string | null>(null);

  const handleUnauthorized = useCallback(() => {
    clearAppSession();
    router.replace("/app/login");
  }, [router]);

  const handleLogout = useCallback(() => {
    if (!session) return;
    void (async () => {
      try {
        const registration = await navigator.serviceWorker?.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        const endpoint = subscription?.endpoint ?? null;
        if (subscription) {
          await subscription.unsubscribe();
        }
        await logoutAppSession(session, endpoint).catch(() => null);
        await unsubscribeAppPush(session, endpoint).catch(() => null);
      } catch {
        // Logout must remain available even if service worker access fails.
      } finally {
        clearAppSession();
        router.replace("/app/login");
      }
    })();
  }, [router, session]);

  const clearSelectedConversation = useCallback(() => {
    detailRequestSeqRef.current += 1;
    selectedConversationIdentityCandidatesRef.current = [];
    timelineOutOfSyncRetryKeyRef.current = null;
    pendingUnreadScrollTargetRef.current = null;
    pendingReadAfterHydrationRef.current = null;
    pendingUnreadAnchorConversationIdentityRef.current = null;
    pendingUnreadLastReadAtRef.current = null;
    pendingUnreadAnchorMessageIdRef.current = null;
    setSelectedConversationKey(null);
    setSelectedConversationWaId(null);
    setActiveConversationIdentity(null);
    setMessages([]);
    setMessagesConversationKey(null);
    setLeadNotes([]);
    setLeadError(null);
    setMessageDraft("");
    setReplyTarget(null);
    setSelectedMediaFile(null);
    setShowEmojiPicker(false);
    setAudioRecordingState("idle");
    if (mediaInputRef.current) {
      mediaInputRef.current.value = "";
    }
    setLoadingMessages(false);
    setShowContactTimeline(false);
    setContactTimelineItems([]);
    setContactTimelineCursor(null);
    setContactTimelineError(null);
    setOpenMessageActionsId(null);
  }, []);

  const loadContactTimeline = useCallback(
    async (mode: "reset" | "append" = "reset") => {
      if (!session || !selectedConversationWaId) return;
      const cursor = mode === "append" ? contactTimelineCursor : null;
      setLoadingContactTimeline(true);
      setContactTimelineError(null);
      try {
        const response = await fetchAppConversationTimeline(session, selectedConversationWaId, {
          limit: 50,
          cursor,
        });
        setContactTimelineItems((current) =>
          mode === "append" ? [...current, ...response.items] : response.items
        );
        setContactTimelineCursor(response.nextCursor);
      } catch (err) {
        if ((err as { status?: number }).status === 401) {
          handleUnauthorized();
          return;
        }
        setContactTimelineError(
          getAppErrorUxMessage({ status: (err as { status?: number }).status, message: (err as Error).message, fallback: "Não foi possível carregar o histórico." })
        );
      } finally {
        setLoadingContactTimeline(false);
      }
    },
    [contactTimelineCursor, handleUnauthorized, selectedConversationWaId, session]
  );

  const handleOpenContactTimeline = useCallback(() => {
    if (!selectedConversationWaId) return;
    setShowContactTimeline(true);
    setContactTimelineItems([]);
    setContactTimelineCursor(null);
    setContactTimelineError(null);
    void loadContactTimeline("reset");
  }, [loadContactTimeline, selectedConversationWaId]);

  const handleCloseContactTimeline = useCallback(() => {
    setShowContactTimeline(false);
    setContactTimelineItems([]);
    setContactTimelineCursor(null);
    setContactTimelineError(null);
  }, []);

  const handleCloseTemplateModal = useCallback(() => {
    setTemplateModalOpen(false);
    setSelectedTemplateId("");
    setTemplateVariables({});
    setTemplateError(null);
  }, []);

  const handleCloseCannedModal = useCallback(() => {
    setCannedModalOpen(false);
    setCannedReplySearch("");
    setSelectedCannedReplyId("");
    setCannedReplyError(null);
  }, []);

  useEffect(() => {
    handleCloseContactTimeline();
    handleCloseTemplateModal();
    handleCloseCannedModal();
    setReplyTarget(null);
    setOpenMessageActionsId(null);
  }, [handleCloseCannedModal, handleCloseContactTimeline, handleCloseTemplateModal, selectedConversationWaId]);

  useEffect(() => {
    if (!openMessageActionsId) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-message-actions-root]")) return;
      setOpenMessageActionsId(null);
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpenMessageActionsId(null);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMessageActionsId]);

  const dismissInboxFeedback = useCallback(() => {
    setError(null);
    setErrorDetails(null);
    setSuccess(null);
    setLeadError(null);
  }, []);

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
    setSoundEnabled(stored === "1");
    setSoundPreferenceLoaded(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => {
      setIsMobileViewport(query.matches);
      setIsIosViewport(query.matches && isIosLikeDevice());
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => {
      const state = getMobileViewportState();
      const keyboardOpen = state.isMobile && state.keyboardOpen;
      setIsMobileKeyboardOpen(keyboardOpen);
      document.documentElement.dataset.mobileKeyboardOpen = keyboardOpen ? "true" : "false";
      const appViewportHeight = getMobileAppViewportHeight(state);
      if (appViewportHeight) {
        document.documentElement.style.setProperty("--app-viewport-height", appViewportHeight);
      }
      document.documentElement.style.setProperty(
        "--mobile-keyboard-gap",
        "0px"
      );
    };
    update();
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      document.documentElement.dataset.mobileKeyboardOpen = "false";
      document.documentElement.style.setProperty("--mobile-keyboard-gap", "0px");
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!soundPreferenceLoaded) return;
    window.localStorage.setItem(INBOX_SOUND_ENABLED_STORAGE_KEY, soundEnabled ? "1" : "0");
  }, [soundEnabled, soundPreferenceLoaded]);

  const refreshPushStatus = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!session) {
      setPushUiStatus("checking");
      setPushStatus(null);
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setPushUiStatus("unsupported");
      setPushStatus(null);
      return;
    }
    if (isIosLikeDevice() && !isStandalonePwa()) {
      setPushUiStatus("needs_install");
      setPushStatus(null);
      return;
    }
    try {
      const status = await getAppPushStatus(session);
      setPushStatus(status);
      if (!status.configured || !status.publicKey) {
        setPushUiStatus("not_configured");
        return;
      }
      if (Notification.permission === "denied") {
        setPushUiStatus("denied");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      await registration.update().catch(() => undefined);
      const subscription = await registration.pushManager.getSubscription();
      if (subscription && !status.subscribed && Notification.permission === "granted") {
        await subscribeAppPush(
          session,
          subscription.toJSON(),
          isIosLikeDevice() ? "iOS PWA" : "PWA"
        );
        setPushUiStatus("enabled");
        return;
      }
      setPushUiStatus(subscription && status.subscribed ? "enabled" : "ready");
    } catch {
      setPushUiStatus("error");
    }
  }, [session]);

  useEffect(() => {
    void refreshPushStatus();
  }, [refreshPushStatus]);

  const handleEnablePush = useCallback(async () => {
    if (!session || !pushStatus?.publicKey || pushBusy) return;
    setPushBusy(true);
    try {
      window.localStorage.removeItem(INBOX_PUSH_DISABLED_STORAGE_KEY);
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushUiStatus(permission === "denied" ? "denied" : "ready");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      await registration.update().catch(() => undefined);
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(pushStatus.publicKey),
        }));
      await subscribeAppPush(session, subscription.toJSON(), isIosLikeDevice() ? "iOS PWA" : "PWA");
      setPushUiStatus("enabled");
      void refreshPushStatus();
    } catch {
      setPushUiStatus("error");
    } finally {
      setPushBusy(false);
    }
  }, [pushBusy, pushStatus?.publicKey, refreshPushStatus, session]);

  const handleDisablePush = useCallback(async () => {
    if (!session || pushBusy) return;
    setPushBusy(true);
    try {
      window.localStorage.setItem(INBOX_PUSH_DISABLED_STORAGE_KEY, "1");
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      const endpoint = subscription?.endpoint ?? null;
      if (subscription) {
        await subscription.unsubscribe();
      }
      await unsubscribeAppPush(session, endpoint);
      setPushUiStatus("ready");
      void refreshPushStatus();
    } catch {
      setPushUiStatus("error");
    } finally {
      setPushBusy(false);
    }
  }, [pushBusy, refreshPushStatus, session]);

  useEffect(() => {
    if (!isMobileViewport) return;
    if (pushAutoEnableAttemptedRef.current) return;
    if (pushUiStatus !== "ready") return;
    if (!soundEnabled) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    pushAutoEnableAttemptedRef.current = true;
    window.localStorage.removeItem(INBOX_PUSH_DISABLED_STORAGE_KEY);
    void handleEnablePush();
  }, [handleEnablePush, isMobileViewport, pushUiStatus, soundEnabled]);

  const handleNotificationToggle = useCallback(() => {
    const nextSoundEnabled = !soundEnabled;
    setSoundEnabled(nextSoundEnabled);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(INBOX_SOUND_ENABLED_STORAGE_KEY, nextSoundEnabled ? "1" : "0");
    }
    if (nextSoundEnabled) {
      requestAppNotificationAudioUnlock();
    }

    if (nextSoundEnabled && pushUiStatus === "ready" && !pushBusy) {
      void handleEnablePush();
      return;
    }

    if (!nextSoundEnabled && pushUiStatus === "enabled" && !pushBusy) {
      void handleDisablePush();
    }
  }, [handleDisablePush, handleEnablePush, pushBusy, pushUiStatus, soundEnabled]);

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
    if (!session) return;
    let cancelled = false;
    fetchAppTenantSummary(session)
      .then((response) => {
        if (cancelled) return;
        const phone = formatAppWhatsappIdentityDisplay(response.tenant);
        setTenantNameLabel(response.tenant.name || null);
        setTenantPhoneLabel(phone);
      })
      .catch(() => {
        if (!cancelled) {
          setTenantNameLabel(null);
          setTenantPhoneLabel(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    fetchAppCrmStatuses(session)
      .then((response) => {
        if (cancelled) return;
        const activeStatuses = response.settings.crmBusinessStatuses.filter((item) => item.isActive);
        setCrmStatusOptions(activeStatuses.length > 0 ? activeStatuses : []);
      })
      .catch(() => {
        if (!cancelled) setCrmStatusOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

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
    if (!session) {
      setDepartments([]);
      setTransferDepartments([]);
      return;
    }
    let cancelled = false;
    Promise.all([
      fetchAppDepartments(session),
      fetchAppDepartments(session, { purpose: "transfer" }),
    ])
      .then((response) => {
        if (cancelled) return;
        const [naturalDepartments, transferDepartmentResponse] = response;
        setDepartments(naturalDepartments.items);
        setTransferDepartments(transferDepartmentResponse.items);
      })
      .catch(() => {
        if (cancelled) return;
        setTransferDepartments([]);
        if (adminConnection && adminClientKey && session.user.role === "ADMIN") {
          fetchDepartments(adminConnection, adminClientKey)
            .then((response) => {
              if (cancelled) return;
              setDepartments(response.items);
              setTransferDepartments(response.items);
            })
            .catch(() => {
              if (cancelled) return;
              setDepartments([]);
              setTransferDepartments([]);
            });
          return;
        }
        setDepartments([]);
        setTransferDepartments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [adminClientKey, adminConnection, session]);

  const scrollTimelineToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    if (!timelineRef.current) return;
    timelineRef.current.scrollTo({ top: timelineRef.current.scrollHeight, behavior });
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
        const mobileOffset =
          typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches ? 96 : 24;
        node.scrollTop = Math.max(0, target.offsetTop - node.offsetTop - mobileOffset);
        setShowJumpToLatest(true);
        onComplete?.();
      });
    });
  }, []);

  const handleReferenceNavigation = useCallback((messageId: string) => {
    const targetId = messageId.trim();
    if (!targetId) return;
    const node = timelineRef.current;
    const escapedTargetId =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(targetId)
        : targetId.replace(/["\\]/g, "\\$&");
    const target = node?.querySelector<HTMLElement>(`[data-internal-message-id="${escapedTargetId}"]`);
    if (!node || !target) {
      setError("Mensagem original não está carregada.");
      setErrorDetails(null);
      return;
    }
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedReferenceId(targetId);
    if (highlightedReferenceTimeoutRef.current) {
      window.clearTimeout(highlightedReferenceTimeoutRef.current);
    }
    highlightedReferenceTimeoutRef.current = window.setTimeout(() => {
      setHighlightedReferenceId((current) => (current === targetId ? null : current));
      highlightedReferenceTimeoutRef.current = null;
    }, 1800);
  }, []);

  useEffect(() => {
    return () => {
      if (highlightedReferenceTimeoutRef.current) {
        window.clearTimeout(highlightedReferenceTimeoutRef.current);
      }
    };
  }, []);

  const focusComposer = useCallback(() => {
    if (!composerRef.current) return;
    composerRef.current.focus();
    const caretPosition = composerRef.current.value.length;
    composerRef.current.setSelectionRange(caretPosition, caretPosition);
  }, []);

  const stabilizeMobileConversationViewport = useCallback(() => {
    if (typeof window === "undefined") return;
    const state = getMobileViewportState();
    if (!state.isMobile) return;
    const applyViewport = () => {
      const nextState = getMobileViewportState();
      if (!nextState.isMobile) return;
      const appViewportHeight = getMobileAppViewportHeight(nextState);
      if (appViewportHeight) {
        document.documentElement.style.setProperty("--app-viewport-height", appViewportHeight);
      }
      document.documentElement.style.setProperty(
        "--mobile-keyboard-gap",
        "0px"
      );
      document.documentElement.dataset.mobileKeyboardOpen = nextState.keyboardOpen ? "true" : "false";
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    };
    applyViewport();
    window.setTimeout(applyViewport, 80);
    window.setTimeout(applyViewport, 240);
  }, []);

  const handleComposerFocus = useCallback(() => {
    if (typeof window === "undefined") return;
    const shouldForceBottom = getMobileViewportState().isIos;
    const stabilize = () => {
      stabilizeMobileConversationViewport();
      composerRef.current?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
      if (shouldForceBottom) {
        scrollTimelineToBottom("auto");
      }
    };
    stabilize();
    window.setTimeout(stabilize, 80);
    window.setTimeout(stabilize, 240);
    window.setTimeout(stabilize, 420);
  }, [scrollTimelineToBottom, stabilizeMobileConversationViewport]);

  const handleJumpToLatest = useCallback(() => {
    stabilizeMobileConversationViewport();
    scrollTimelineToBottom("auto");
  }, [scrollTimelineToBottom, stabilizeMobileConversationViewport]);

  useEffect(() => {
    if (!selectedConversationKey) return;
    stabilizeMobileConversationViewport();
  }, [selectedConversationKey, stabilizeMobileConversationViewport]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    const handleViewportChange = () => stabilizeMobileConversationViewport();
    window.addEventListener("focus", handleViewportChange);
    window.addEventListener("pageshow", handleViewportChange);
    document.addEventListener("visibilitychange", handleViewportChange);
    window.visualViewport?.addEventListener("resize", handleViewportChange);
    return () => {
      window.removeEventListener("focus", handleViewportChange);
      window.removeEventListener("pageshow", handleViewportChange);
      document.removeEventListener("visibilitychange", handleViewportChange);
      window.visualViewport?.removeEventListener("resize", handleViewportChange);
    };
  }, [stabilizeMobileConversationViewport]);

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

  const markConversationIdentitiesAsRead = useCallback((
    conversationKeys: Array<string | null | undefined>,
    activityAt?: string | null,
    waId?: string | null
  ) => {
    if (!activityAt) return;
    const uniqueKeys = Array.from(
      new Set(
        conversationKeys
          .map((item) => String(item ?? "").trim())
          .filter(Boolean)
      )
    );
    if (uniqueKeys.length === 0) return;
    setReadState((prev) => {
      const nextUnread = { ...prev.manuallyUnreadByConversationKey };
      for (const key of uniqueKeys) {
        delete nextUnread[key];
      }
      return {
        lastReadAtByConversationKey: {
          ...prev.lastReadAtByConversationKey,
          ...Object.fromEntries(uniqueKeys.map((key) => [key, activityAt])),
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
    markConversationIdentitiesAsRead(pendingRead.conversationKeys, pendingRead.activityAt, pendingRead.waId);
  }, [markConversationIdentitiesAsRead]);

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

  const markConversationIdentitiesAsUnread = useCallback((conversationKeys: Array<string | null | undefined>, waId?: string | null) => {
    const uniqueKeys = Array.from(
      new Set(
        conversationKeys
          .map((item) => String(item ?? "").trim())
          .filter(Boolean)
      )
    );
    if (uniqueKeys.length === 0) return;
    setReadState((prev) => ({
      lastReadAtByConversationKey: prev.lastReadAtByConversationKey,
      manuallyUnreadByConversationKey: {
        ...prev.manuallyUnreadByConversationKey,
        ...Object.fromEntries(uniqueKeys.map((key) => [key, true])),
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
    const eventTargetsCurrentUser =
      event.type === "message.created" || event.type === "conversation.handoff.updated"
        ? canUserReceiveTargetedNotification(event, session.user)
        : false;
    if (event.type === "conversation.handoff.updated") {
      const conversationKey = event.waIdCanonical ?? event.waId;
      let matchedConversation = false;
      const matchedConversationKeys = new Set<string>([conversationKey, event.waId, event.waIdCanonical ?? ""]);
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
          matchedConversationKeys.add(itemKey);
          matchedConversationKeys.add(item.waId);
          if (item.waIdCanonical) matchedConversationKeys.add(item.waIdCanonical);
          const nextAssignedUserId =
            event.assignedUserId !== undefined ? event.assignedUserId : item.assignedUserId;
          return {
            ...item,
            waIdCanonical: item.waIdCanonical ?? event.waIdCanonical ?? null,
            protocol: event.protocol ?? item.protocol ?? null,
            cycleId: event.cycleId ?? item.cycleId ?? null,
            mode: event.mode ?? item.mode,
            handoffStatus: event.handoffStatus ?? item.handoffStatus,
            assignedUserId: nextAssignedUserId ?? null,
            assignedUserName:
              event.assignedUserName !== undefined ? event.assignedUserName : item.assignedUserName,
            assignedAt: event.assignedAt !== undefined ? event.assignedAt : item.assignedAt,
            departmentId: event.departmentId !== undefined ? event.departmentId : item.departmentId ?? null,
            departmentName:
              event.departmentName !== undefined ? event.departmentName : item.departmentName,
            queueId: event.queueId !== undefined ? event.queueId : item.queueId ?? null,
            queueName: event.queueName !== undefined ? event.queueName : item.queueName,
            status: event.status ?? item.status,
            closedAt: event.closedAt !== undefined ? event.closedAt : item.closedAt,
            lastMessage: event.notificationMessage
              ? {
                  direction: "INBOUND" as const,
                  type: event.notificationMessage.type,
                  status: "RECEIVED",
                  messageId: event.notificationMessage.messageId,
                  bodyText: event.notificationMessage.bodyText,
                  templateName: null,
                  createdAt: event.notificationMessage.createdAt,
                }
              : item.lastMessage,
            updatedAt: event.updatedAt,
          };
        });
        if (!matchedConversation) {
          void refreshConversationListRef.current?.(session);
        }
        return dedupeConversationsByIdentity(nextItems, isBusinessTenant);
      });
      if (
        eventTargetsCurrentUser &&
        selectedConversationKey !== conversationKey &&
        selectedConversationWaId !== event.waId
      ) {
        markConversationIdentitiesAsUnread(Array.from(matchedConversationKeys), event.waId);
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
    const matchedConversationKeys = new Set<string>([conversationKey, event.waId, event.waIdCanonical ?? ""]);
    const currentMatchedConversation = conversations.find((item) => {
      const itemKey = getConversationIdentity(item);
      return itemKey === conversationKey || item.waId === event.waId || item.waIdCanonical === event.waIdCanonical;
    });
    if (currentMatchedConversation) {
      const itemKey = getConversationIdentity(currentMatchedConversation);
      matchedConversationKeys.add(itemKey);
      matchedConversationKeys.add(currentMatchedConversation.waId);
      if (currentMatchedConversation.waIdCanonical) {
        matchedConversationKeys.add(currentMatchedConversation.waIdCanonical);
      }
    }
    const matchedSelectedConversation =
      currentMatchedConversation &&
      conversationIdentityMatches(getConversationIdentityCandidates(currentMatchedConversation), [
        selectedConversationKey,
        selectedConversationWaId,
      ]);
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
        matchedConversationKeys.add(itemKey);
        matchedConversationKeys.add(item.waId);
        if (item.waIdCanonical) matchedConversationKeys.add(item.waIdCanonical);
        const nextAssignedUserId =
          event.assignedUserId !== undefined ? event.assignedUserId : item.assignedUserId;
        return {
          ...item,
          waIdCanonical: item.waIdCanonical ?? event.waIdCanonical ?? null,
          protocol: event.protocol ?? message.protocol ?? item.protocol ?? null,
          cycleId: event.cycleId ?? message.cycleId ?? item.cycleId ?? null,
          mode: event.mode ?? item.mode,
          handoffStatus: event.handoffStatus ?? item.handoffStatus,
          assignedUserId: nextAssignedUserId,
          departmentId: event.departmentId ?? item.departmentId ?? null,
          status: nextAssignedUserId ? ("IN_PROGRESS" as const) : item.status,
          lastMessage: {
            protocol: message.protocol ?? null,
            cycleId: message.cycleId ?? null,
            direction: message.direction,
            type: message.type,
            status: message.status,
            messageId: message.messageId,
            bodyText: message.bodyText,
            templateName: message.templateName,
            createdAt: message.createdAt,
          },
          lastInboundAt: message.direction === "INBOUND" ? message.createdAt : item.lastInboundAt,
          lastOutboundAt: message.direction === "OUTBOUND" ? message.createdAt : item.lastOutboundAt,
          updatedAt: message.createdAt,
        };
        });
      if (!matchedConversation) {
        void refreshConversationListRef.current?.(session);
      }
      return dedupeConversationsByIdentity(nextItems, isBusinessTenant);
    });

    const targetsSelectedConversation =
      matchedSelectedConversation ||
      realtimeEventTargetsSelectedConversation({
        event,
        selectedConversationKey,
        selectedConversationWaId,
        selectedConversationIdentityCandidates: selectedConversationIdentityCandidatesRef.current,
      });

    if (targetsSelectedConversation) {
      const visibleConversationKey =
        selectedConversationKey ??
        resolveRealtimeTimelineConversationKey({
          event,
          selectedConversationKey,
          selectedConversationWaId,
          selectedConversationIdentityCandidates: selectedConversationIdentityCandidatesRef.current,
        }) ??
        conversationKey;
      const shouldStickToBottom = isTimelineNearBottom();
      setMessages((prev) => {
        const enrichedMessage = enrichReplyPreviewFromTimeline(message, prev);
        const nextMessages = mergeMessagesByIdentity(prev, [enrichedMessage]);
        timelineCacheRef.current.set(selectedConversationWaId ?? event.waId, nextMessages);
        if (visibleConversationKey) {
          timelineCacheRef.current.set(visibleConversationKey, nextMessages);
        }
        if (event.waIdCanonical) {
          timelineCacheRef.current.set(event.waIdCanonical, nextMessages);
        }
        for (const key of matchedConversationKeys) {
          if (key) timelineCacheRef.current.set(key, nextMessages);
        }
        return nextMessages;
      });
      setMessagesConversationKey(visibleConversationKey);
      shouldScrollToBottomRef.current = shouldStickToBottom;
      if (message.direction === "INBOUND" && !isAppForegroundFocused()) {
        markConversationIdentitiesAsUnread([conversationKey, event.waId, event.waIdCanonical], event.waId);
      }
      return;
    }

    if (eventTargetsCurrentUser) {
      markConversationAsUnread(conversationKey, event.waId);
    }
  }, [
    applyRealtimeStatusUpdated,
    markConversationIdentitiesAsUnread,
    markConversationAsUnread,
    isTimelineNearBottom,
    selectedConversationKey,
    selectedConversationWaId,
    session,
    isBusinessTenant,
    conversations,
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
      assignedUserId: item.assignedUserId ?? null,
      departmentId: item.departmentId ?? null,
      userId: session?.user.id ?? null,
      userDepartmentId: session?.user.departmentId ?? null,
      userDepartmentIds: session?.user.departmentIds ?? [],
      userDepartmentName: session?.user.departmentName ?? null,
      userRole: session?.user.role ?? null,
    });
    return wasAccepted;
  }, [session?.user.departmentId, session?.user.departmentIds, session?.user.role]);

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
      automation: conversationFilter === "AUTOMATION",
      search: search || null,
      channel: conversationChannelFilter === "ALL" ? null : conversationChannelFilter,
    };
  }, [
    conversationChannelFilter,
    conversationFilter,
    conversationSearch,
    departmentFilter,
    isAdminUser,
    session?.user.id,
  ]);

  const conversationQueryKey = useMemo(
    () => JSON.stringify(buildConversationFetchOptions(null)),
    [buildConversationFetchOptions]
  );
  conversationQueryKeyRef.current = conversationQueryKey;

  const refreshConversationList = useCallback(async (activeSession: AppSession) => {
    const requestQueryKey = conversationQueryKey;
    const response = await fetchAppConversations(activeSession, buildConversationFetchOptions(null));
    if (requestQueryKey !== conversationQueryKeyRef.current) {
      return;
    }
    if (response.readState) {
      setReadState((current) => mergeReadStatePreservingLocal(current, response.readState!));
    }
    if (response.filterCounts) {
      setConversationFilterCounts({
        ALL: Number(response.filterCounts.ALL ?? 0),
        WAITING: Number(response.filterCounts.WAITING ?? 0),
        AUTOMATION: Number(response.filterCounts.AUTOMATION ?? 0),
        IN_PROGRESS: Number(response.filterCounts.IN_PROGRESS ?? 0),
        WAITING_USER: Number(response.filterCounts.WAITING_USER ?? 0),
        CLOSED: Number(response.filterCounts.CLOSED ?? 0),
        MINE: Number(response.filterCounts.MINE ?? 0),
        UNASSIGNED: Number(response.filterCounts.UNASSIGNED ?? 0),
      });
    }
    const pageItems = response.conversations ?? response.items;
    if (!response.filterCounts && pageItems.length === 0) {
      setConversationFilterCounts({
        ALL: 0,
        WAITING: 0,
        AUTOMATION: 0,
        IN_PROGRESS: 0,
        WAITING_USER: 0,
        CLOSED: 0,
        MINE: 0,
        UNASSIGNED: 0,
      });
    }
    if (loadedConversationPageCountRef.current <= 1) {
      setConversationNextCursor(response.nextCursor ?? null);
      loadedConversationPageCountRef.current = 1;
    }
    const prioritizeLeads = isBusinessSession(activeSession);
    const sortedItems = dedupeConversationsByIdentity(pageItems, prioritizeLeads);
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
          if (
            canUserReceiveTargetedNotification(item, activeSession.user) &&
            conversationKey !== selectedConversationKey
          ) {
            markConversationIdentitiesAsUnread(getConversationIdentityCandidates(item), item.waId);
          }
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
        if (latestInboundItem && latestInboundConversationKey) {
          if (
            canUserReceiveTargetedNotification(latestInboundItem, activeSession.user) &&
            (latestInboundConversationKey !== selectedConversationKey || !isAppForegroundFocused())
          ) {
            markConversationIdentitiesAsUnread(
              getConversationIdentityCandidates(latestInboundItem),
              latestInboundItem.waId
            );
          }
          buildConversationNotificationRequest(latestInboundItem);
        }
      }
    } else {
      hasInitializedConversationSoundRef.current = true;
    }
    lastInboundConversationSignatureRef.current = latestInboundSignature;
    lastInboundConversationTimestampRef.current = latestInboundTimestamp;
    humanFlowConversationKeys.forEach((key) => {
      humanFlowConversationKeysRef.current.add(key);
    });
    suppressNextConversationRefreshNotificationRef.current = false;
    const previousListScrollTop = conversationListRef.current?.scrollTop ?? null;
    setConversations((current) =>
      mergeConversationsPreservingStableOrder(current, sortedItems, prioritizeLeads)
    );
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

	    if (!isAppForegroundFocused()) return;
	    const waitingForUnreadAnchor =
	      pendingUnreadScrollTargetRef.current?.conversationKey === selectedConversationKey;
	    const activeConversation = sortedItems.find(
	      (item) => getConversationIdentity(item) === selectedConversationKey
	    );
	    const latestTimelineMessageTimestamp = getLatestMessageTimestamp(messages);
	    const activeConversationTimestamp = activeConversation ? getConversationActivityTimestamp(activeConversation) : null;
	    if (
	      activeConversation &&
	      selectedConversationWaId &&
	      !loadingMessages &&
	      !waitingForUnreadAnchor &&
	      activeConversationTimestamp !== null &&
	      (latestTimelineMessageTimestamp === null || activeConversationTimestamp > latestTimelineMessageTimestamp) &&
	      selectedTimelineRequestedActivityAtRef.current !== activeConversationTimestamp
	    ) {
	      selectedTimelineRequestedActivityAtRef.current = activeConversationTimestamp;
	      void refreshSelectedTimelineRef.current?.(activeSession, selectedConversationWaId, "append").catch(
	        (err: { status?: number }) => {
	          if (err.status === 401) {
	            handleUnauthorized();
	            return;
	          }
	          if (isConversationGoneError(err)) {
	            clearSelectedConversation();
	          }
	        }
	      );
	    }
	    if (activeConversation && !loadingMessages && !waitingForUnreadAnchor) {
	      markConversationIdentitiesAsRead(
	        getConversationIdentityCandidates(activeConversation),
	        getConversationActivityAt(activeConversation),
	        activeConversation.waId
	      );
	    }
	  }, [
	    buildConversationFetchOptions,
	    buildConversationNotificationRequest,
	    clearSelectedConversation,
	    conversationQueryKey,
	    handleUnauthorized,
	    loadingMessages,
	    markConversationIdentitiesAsRead,
	    markConversationIdentitiesAsUnread,
	    messages,
	    selectedConversationKey,
	    selectedConversationWaId,
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
      const pageItems = dedupeConversationsByIdentity(
        response.conversations ?? response.items,
        isBusinessSession(session)
      );
      setConversations((current) =>
        dedupeConversationsByIdentity([...current, ...pageItems], isBusinessSession(session))
      );
    } catch (err) {
      if ((err as { status?: number }).status === 401) {
        handleUnauthorized();
        return;
      }
      setError(
        getAppErrorUxMessage({
          status: (err as { status?: number }).status,
          message: (err as { message?: string }).message,
          fallback: "Não foi possível carregar mais conversas.",
        })
      );
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
    selectedTimelineLastRefreshAtRef.current = Date.now();
    const response = await fetchAppConversation(activeSession, waId, {
      order: mode === "append" ? "asc" : "desc",
      limit: mode === "append" ? 80 : 300,
      after: latestKnownAt,
    });
    if (requestSeq !== detailRequestSeqRef.current) return;
    const responseConversationKey = response.waIdCanonical ?? response.waId ?? waId;
    const selectedIdentityCandidates =
      selectedConversationIdentityCandidatesRef.current.length > 0
        ? selectedConversationIdentityCandidatesRef.current
        : [selectedConversationKey, selectedConversationWaId, waId].filter(Boolean);
    if (
      selectedConversationKey &&
      !conversationIdentityMatches(selectedIdentityCandidates, [
        responseConversationKey,
        response.waId,
        response.waIdCanonical,
        waId,
      ])
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
      const nextMessages =
        mode === "append"
          ? mergeMessagesByIdentity(prev, responseItems)
          : mergeMessagesByIdentity(responseItems, prev);
      timelineCacheRef.current.set(waId, nextMessages);
      return nextMessages;
    });
    if (shouldStickToBottom) {
      shouldScrollToBottomRef.current = true;
    }
    setMessagesConversationKey(responseConversationKey);
    timelineOutOfSyncRetryKeyRef.current = null;
    setConversations((prev) =>
      updateConversationInPlace(prev, responseConversationKey, (item) =>
        applyConversationOperationalPayload(item, response)
      )
    );
    const latestActivityAt =
      (responseItems.length > 0
        ? responseItems[responseItems.length - 1]?.createdAt
        : latestKnownAt) ?? null;
    if (isAppForegroundFocused()) {
      markConversationIdentitiesAsRead(
        [responseConversationKey, response.waId, response.waIdCanonical, waId],
        latestActivityAt,
        response.waId ?? waId
      );
    }
	  }, [isTimelineNearBottom, markConversationIdentitiesAsRead, messages, selectedConversationKey, selectedConversationWaId]);

	  useEffect(() => {
	    refreshSelectedTimelineRef.current = refreshSelectedTimeline;
	    return () => {
	      if (refreshSelectedTimelineRef.current === refreshSelectedTimeline) {
	        refreshSelectedTimelineRef.current = null;
	      }
	    };
	  }, [refreshSelectedTimeline]);

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
        setError(getAppErrorUxMessage({ status: err.status, message: err.message, fallback: "Não foi possível carregar as conversas." }));
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
      selectedConversationIdentityCandidatesRef.current = [];
      return;
    }
    let cancelled = false;
    const requestSeq = ++detailRequestSeqRef.current;
    const selectedIdentityCandidates =
      selectedConversationIdentityCandidatesRef.current.length > 0
        ? selectedConversationIdentityCandidatesRef.current
        : [selectedConversationKey, selectedConversationWaId].filter(Boolean);
    const shouldRefreshUnreadWindow =
      pendingUnreadScrollTargetRef.current?.conversationKey === selectedConversationKey;
    const cachedMessages = timelineCacheRef.current.get(selectedConversationWaId);
    const shouldStickToBottomAfterHydration = !shouldRefreshUnreadWindow;
    const hasCachedMessages = Boolean(cachedMessages?.length);
    setLoadingMessages(!hasCachedMessages);
    setError(null);
    setMessages(cachedMessages ?? []);
    setMessagesConversationKey(cachedMessages ? selectedConversationKey : null);

    const requestStartedAt = performance.now();
    selectedTimelineLastRefreshAtRef.current = Date.now();
    fetchAppConversation(session, selectedConversationWaId, {
      order: "desc",
      limit: 500,
      after: null,
    })
      .then((response) => {
        if (cancelled || requestSeq !== detailRequestSeqRef.current) return;
        const responseConversationKey = response.waIdCanonical ?? response.waId ?? selectedConversationWaId;
        if (
          !conversationIdentityMatches(selectedIdentityCandidates, [
            responseConversationKey,
            response.waId,
            response.waIdCanonical,
            selectedConversationWaId,
          ])
        ) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("[inbox] timeline response ignored by identity mismatch", {
              expected: selectedIdentityCandidates,
              received: [responseConversationKey, response.waId, response.waIdCanonical],
              selectedConversationWaId,
            });
          }
          return;
        }
        const visibleConversationKey = selectedConversationKey ?? responseConversationKey;
        const openStarted = conversationOpenStartedAtRef.current;
        const apiMs = Math.round(performance.now() - requestStartedAt);
        const openToApiMs =
          openStarted?.key === visibleConversationKey
            ? Math.round(performance.now() - openStarted.startedAt)
            : null;
        logInboxLatencyDebug({
          event: "inbox_latency.conversation_detail_loaded",
          apiMs,
          openToApiMs,
          itemCount: response.items.length,
          usedCachedTimeline: Boolean(cachedMessages?.length),
          shouldRefreshUnreadWindow,
        });
        rememberInboundMessages(
          responseConversationKey,
          response.items,
          notifiedInboundMessageKeysRef.current
        );
        primedTimelineNotificationKeysRef.current.add(responseConversationKey);
        const responseItems = sortMessagesAscending(response.items);
        conversationDetailLoadedAtRef.current = {
          key: visibleConversationKey,
          loadedAt: performance.now(),
          itemCount: responseItems.length,
        };
        setMessages((prev) => {
          const nextMessages =
            cachedMessages?.length && shouldRefreshUnreadWindow
              ? mergeMessagesByIdentity(prev, responseItems)
              : mergeMessagesByIdentity(responseItems, prev);
          timelineCacheRef.current.set(selectedConversationWaId, nextMessages);
          return nextMessages;
        });
        timelineOutOfSyncRetryKeyRef.current = null;
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
        if (isConversationGoneError(err)) {
          clearSelectedConversation();
          setError(null);
          return;
        }
        setError(getAppErrorUxMessage({ status: err.status, message: err.message, fallback: "Não foi possível carregar o histórico da conversa." }));
      })
      .finally(() => {
        if (!cancelled) setLoadingMessages(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    clearSelectedConversation,
    handleUnauthorized,
    selectedConversationKey,
    selectedConversationWaId,
    session,
  ]);

  useEffect(() => {
    if (!session || !selectedConversationWaId || !selectedConversationKey) {
      timelineOutOfSyncRetryKeyRef.current = null;
      return;
    }
    if (messagesConversationKey === selectedConversationKey) {
      timelineOutOfSyncRetryKeyRef.current = null;
      return;
    }
    if (loadingMessages) return;
    const retryKey = `${selectedConversationKey}:${selectedConversationWaId}`;
    if (timelineOutOfSyncRetryKeyRef.current === retryKey) return;
    let cancelled = false;
    timelineOutOfSyncRetryKeyRef.current = retryKey;
    setLoadingMessages(true);
    refreshSelectedTimeline(session, selectedConversationWaId, "replace")
      .catch((err: { status?: number; message?: string }) => {
        if (cancelled || timelineOutOfSyncRetryKeyRef.current !== retryKey) return;
        if (err.status === 401) {
          handleUnauthorized();
          return;
        }
        if (isConversationGoneError(err)) {
          clearSelectedConversation();
          setError(null);
          return;
        }
        setError(getAppErrorUxMessage({ status: err.status, message: err.message, fallback: "Não foi possível carregar o histórico da conversa." }));
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingMessages(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    handleUnauthorized,
    clearSelectedConversation,
    loadingMessages,
    messagesConversationKey,
    refreshSelectedTimeline,
    selectedConversationKey,
    selectedConversationWaId,
    session,
  ]);

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
        const unreadIndex = findFirstUnreadMessageIndex(
          messages,
          lastReadAtBeforeOpen,
          unreadTarget.unreadCount
        );
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
    if (!selectedConversationKey || messagesConversationKey !== selectedConversationKey) return;
    const loaded = conversationDetailLoadedAtRef.current;
    if (!loaded || loaded.key !== selectedConversationKey) return;
    const frame = window.requestAnimationFrame(() => {
      const openStarted = conversationOpenStartedAtRef.current;
      logInboxLatencyDebug({
        event: "inbox_latency.conversation_detail_rendered",
        apiToRenderMs: Math.round(performance.now() - loaded.loadedAt),
        openToRenderMs:
          openStarted?.key === selectedConversationKey
            ? Math.round(performance.now() - openStarted.startedAt)
            : null,
        itemCount: loaded.itemCount,
      });
      if (conversationDetailLoadedAtRef.current === loaded) {
        conversationDetailLoadedAtRef.current = null;
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, messagesConversationKey, selectedConversationKey]);

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
        const now = Date.now();
        if (
          selectedConversationWaId &&
          !loadingMessages &&
          messagesConversationKey === selectedConversationKey &&
          now - selectedTimelineLastRefreshAtRef.current >= SELECTED_TIMELINE_BACKGROUND_REFRESH_MS
        ) {
          selectedTimelineLastRefreshAtRef.current = now;
          await refreshSelectedTimeline(session, selectedConversationWaId, "append");
        }
      } catch (err) {
        if ((err as { status?: number }).status === 401) {
          handleUnauthorized();
          return;
        }
        if (isConversationGoneError(err)) {
          clearSelectedConversation();
        }
      } finally {
        polling = false;
      }
    }, 2000);

    return () => window.clearInterval(interval);
  }, [
    handleUnauthorized,
    clearSelectedConversation,
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

  const openConversationItem = useCallback((item: InboxConversationItem, options?: { fromPush?: boolean }) => {
    const conversationIdentity = getConversationIdentity(item);
    const conversationIdentityCandidates = getConversationIdentityCandidates(item);
    const unreadCount = getConversationUnreadBadgeCount(item, readState, session?.user);
    const shouldOpenAtUnread = unreadCount > 0;
    const activityAt = getConversationActivityAt(item);
    const latestReadAt = getLatestReadAtForConversation(item, readState);
    const cachedMessages = timelineCacheRef.current.get(item.waId);
    const hasCachedTimeline = Boolean(cachedMessages?.length);
    pendingUnreadScrollTargetRef.current = shouldOpenAtUnread
      ? {
          conversationKey: conversationIdentity,
          lastReadAt: latestReadAt,
          unreadCount,
        }
      : null;
    pendingUnreadAnchorConversationIdentityRef.current = shouldOpenAtUnread
      ? conversationIdentity
      : null;
    pendingUnreadLastReadAtRef.current = shouldOpenAtUnread ? latestReadAt : null;
    pendingUnreadAnchorMessageIdRef.current = null;
    pendingReadAfterHydrationRef.current = {
      conversationKey: conversationIdentity,
      conversationKeys: conversationIdentityCandidates,
      activityAt,
      waId: item.waId,
    };
    conversationOpenStartedAtRef.current = {
      key: conversationIdentity,
      startedAt: performance.now(),
    };
    logInboxLatencyDebug({
      event: "inbox_latency.conversation_open_start",
      unreadCount,
      fromPush: options?.fromPush === true,
      hasCachedTimeline,
    });
    shouldScrollToBottomRef.current = !shouldOpenAtUnread;
    selectedConversationIdentityCandidatesRef.current = conversationIdentityCandidates;
    setUnreadSeparatorIndex(null);
    setUnreadAnchorMessageIdentity(null);
    setActiveConversationIdentity(conversationIdentity);
    setLoadingMessages(!hasCachedTimeline);
    setMessages(cachedMessages ?? []);
    setMessagesConversationKey(hasCachedTimeline ? conversationIdentity : null);
    setSelectedConversationKey(conversationIdentity);
    setSelectedConversationWaId(item.waId);
    setShowMoreActions(false);
    detailRequestSeqRef.current += 1;
    stabilizeMobileConversationViewport();
  }, [readState, session?.user, stabilizeMobileConversationViewport]);

  const handleConversationTouchStart = useCallback((event: TouchEvent<HTMLElement>) => {
    const touch = event.touches.item(0);
    conversationListTouchRef.current = touch
      ? {
          x: touch.clientX,
          y: touch.clientY,
          scrollTop: conversationListRef.current?.scrollTop ?? 0,
          moved: false,
        }
      : null;
  }, []);

  const handleConversationTouchMove = useCallback((event: TouchEvent<HTMLElement>) => {
    const start = conversationListTouchRef.current;
    const touch = event.touches.item(0);
    if (!start || !touch) return;
    const deltaX = Math.abs(touch.clientX - start.x);
    const deltaY = Math.abs(touch.clientY - start.y);
    const scrollDelta = Math.abs((conversationListRef.current?.scrollTop ?? start.scrollTop) - start.scrollTop);
    if (deltaX > 10 || deltaY > 10 || scrollDelta > 6) {
      start.moved = true;
      conversationListSuppressClickUntilRef.current = Date.now() + 320;
    }
  }, []);

  const shouldSuppressConversationOpen = useCallback(() => {
    return (
      Date.now() < conversationListSuppressClickUntilRef.current ||
      Date.now() - conversationListLastScrollAtRef.current < 220
    );
  }, []);

  useEffect(() => {
    if (!loadingConversations && selectedConversationKey && !selectedConversation) {
      clearSelectedConversation();
    }
  }, [
    clearSelectedConversation,
    loadingConversations,
    selectedConversation,
    selectedConversationKey,
  ]);

  useEffect(() => {
    setActiveInboxConversation(selectedConversationWaId, selectedConversation?.waIdCanonical ?? null);
    return () => setActiveInboxConversation(null);
  }, [selectedConversation?.waIdCanonical, selectedConversationWaId]);

  const departmentOptions = useMemo<DepartmentOption[]>(() => {
    if (departments.length > 0) {
      return departments
        .filter(isSelectableDepartment)
        .map((department) => ({
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

  const transferDepartmentOptions = useMemo<DepartmentOption[]>(() => {
    const source = transferDepartments.length > 0 ? transferDepartments : departments;
    if (source.length > 0) {
      return source
        .filter(isSelectableDepartment)
        .map((department) => ({
          id: department.id,
          name: department.name,
        }));
    }
    return departmentOptions;
  }, [departmentOptions, departments, transferDepartments]);

  const loggedUserDepartmentName = useMemo(() => {
    const sessionDepartmentName = session?.user.departmentName?.trim();
    if (sessionDepartmentName) return sessionDepartmentName;
    const currentUser =
      users.find((user) => user.id === session?.user.id) ??
      users.find((user) => user.email === session?.user.email) ??
      null;
    const currentUserDepartmentName = currentUser?.departmentName?.trim();
    if (currentUserDepartmentName) return currentUserDepartmentName;
    const sessionDepartmentId = session?.user.departmentId ?? currentUser?.departmentId ?? null;
    if (!sessionDepartmentId) return null;
    return (
      departments.find((department) => department.id === sessionDepartmentId)?.name ??
      departmentOptions.find((department) => department.id === sessionDepartmentId)?.name ??
      null
    );
  }, [
    departmentOptions,
    departments,
    session?.user.departmentId,
    session?.user.departmentName,
    session?.user.id,
    users,
  ]);
  const loggedUserDepartmentLabel = loggedUserDepartmentName ?? "Sem setor definido";

  const filteredConversations = useMemo(() => {
    return conversations.filter((item) => {
      const searchTerm = conversationSearch.trim().toLowerCase();
      if (searchTerm) {
        const haystack = [
          item.protocol,
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
      if (conversationChannelFilter !== "ALL" && getConversationChannel(item) !== conversationChannelFilter) {
        return false;
      }
      const status = getConversationOperationalStatus(item);
      switch (conversationQuickFilter) {
        case "UNREAD":
          if (!isConversationUnreadForUser(item, readState, session?.user)) return false;
          break;
        case "HUMAN":
          if (item.mode !== "HUMAN") return false;
          break;
        case "ASSIGNED":
          if (!item.assignedUserId) return false;
          break;
        default:
          break;
      }
      switch (conversationFilter) {
        case "AUTOMATION":
          return isAutomationQueueConversation(item);
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
  }, [
    conversationChannelFilter,
    conversationFilter,
    conversationQuickFilter,
    conversationSearch,
    conversations,
    departmentFilter,
    isAdminUser,
    readState,
    session?.user.id,
    session?.user,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const pushConversation = new URLSearchParams(window.location.search).get("conversation")?.trim();
    if (!pushConversation) return;
    const target = conversations.find((item) =>
      conversationIdentityMatches(getConversationIdentityCandidates(item), [pushConversation])
    );
    if (!target) return;
    openConversationItem(target, { fromPush: true });
    stabilizeMobileConversationViewport();
    window.history.replaceState(null, "", "/app/inbox");
  }, [conversations, openConversationItem, stabilizeMobileConversationViewport]);

  useEffect(() => {
    if (!isBusinessTenant) return;
    const signature = filteredConversations
      .slice(0, 20)
      .map((item) => `${getConversationIdentity(item)}:${getLeadTemperature(item) ?? "none"}`)
      .join("|");
    if (signature && sortedLogSignatureRef.current !== signature) {
      sortedLogSignatureRef.current = signature;
      logInboxUxEvent(session, "inbox.sorted", {
        count: filteredConversations.length,
        topPriority: getLeadTemperature(filteredConversations[0] ?? null),
      });
    }
  }, [filteredConversations, isBusinessTenant, session]);
  const selectedMoreConversationFilter = useMemo(
    () => MORE_CONVERSATION_FILTERS.find((item) => item.value === conversationFilter) ?? null,
    [conversationFilter]
  );
  const hasMoreConversationFilter =
    Boolean(selectedMoreConversationFilter) ||
    conversationQuickFilter !== "ALL";
  const applyConversationFilter = useCallback((filter: ConversationFilter) => {
    setConversationFilter(filter);
    if (filter === "ALL") {
      setConversationChannelFilter("ALL");
      setConversationQuickFilter("ALL");
    }
    setShowMoreConversationFilters(false);
  }, []);

  const canReply = useMemo(
    () => (session ? canReplyToConversation(selectedConversation, session.user.id) : false),
    [selectedConversation, session]
  );
  const selectedConversationChannel = getConversationChannel(selectedConversation);
  const selectedConversationSupportsOutbound = canSendInboxText(
    selectedConversationChannel,
    selectedConversation
  );
  const selectedConversationSupportsMediaOutbound = canSendInboxMedia(
    selectedConversationChannel,
    selectedConversation
  );
  const selectedConversationSupportsTemplateOutbound = canSendInboxTemplate(
    selectedConversationChannel,
    selectedConversation
  );
  const selectedConversationOutboundDisabledMessage =
    getInboxTextOutboundDisabledMessage(selectedConversationChannel, selectedConversation);
  const selectedConversationMediaOutboundDisabledMessage =
    getInboxMediaOutboundDisabledMessage(selectedConversationChannel, selectedConversation);
  const composerEnabled = canReply && selectedConversationSupportsOutbound;
  const templateComposerEnabled = canReply && selectedConversationSupportsTemplateOutbound;
  const usableInboxTemplates = useMemo(
    () =>
      templateItems.filter(
        (template) =>
          template.status === "approved" &&
          template.canUseInInbox === true &&
          template.locallyDisabled !== true &&
          !template.blockedReason
      ),
    [templateItems]
  );
  const selectedTemplate = useMemo(
    () => usableInboxTemplates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, usableInboxTemplates]
  );
  const selectedTemplateVariableKeys = useMemo(() => getTemplateVariableKeys(selectedTemplate), [selectedTemplate]);
  useEffect(() => {
    if (!session || !templateModalOpen || !selectedTemplate) {
      setTemplateCostPreview(null);
      return;
    }
    let cancelled = false;
    fetchAppMetaUsagePreview(session, {
      source: "inbox_template",
      messageKind: "template",
      templateId: selectedTemplate.id,
      recipientCount: 1,
      eligibleCount: 1,
      blockedCount: 0,
      windowOpenAtSend: "unknown",
      country: "BR",
    })
      .then((response) => {
        if (!cancelled) setTemplateCostPreview(response.preview);
      })
      .catch(() => {
        if (!cancelled) setTemplateCostPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTemplate, session, templateModalOpen]);
  const filteredCannedReplies = useMemo(() => {
    const query = cannedReplySearch.trim().toLowerCase();
    return cannedReplies.filter((reply) => {
      if (!reply.active) return false;
      if (!query) return true;
      return [reply.title, reply.body, reply.category ?? ""].some((value) =>
        value.toLowerCase().includes(query)
      );
    });
  }, [cannedReplies, cannedReplySearch]);
  const selectedCannedReply = useMemo(
    () => filteredCannedReplies.find((reply) => reply.id === selectedCannedReplyId) ?? null,
    [filteredCannedReplies, selectedCannedReplyId]
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
  const isTimelineOutOfSync =
    Boolean(selectedConversationWaId) &&
    Boolean(selectedConversationKey) &&
    !loadingMessages &&
    messagesConversationKey !== selectedConversationKey;

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
      Boolean(selectedConversationWaId && (isAdminUser || isSelectedConversationOwnedByCurrentUser)),
    [isAdminUser, isSelectedConversationOwnedByCurrentUser, selectedConversationWaId]
  );

  useEffect(() => {
    if (!selectedConversation) {
      setStatusActionDraft("");
      setTransferUserId("");
      setTransferDepartmentId("");
      setShowMobileCrm(false);
      return;
    }
    const currentStatus = getConversationOperationalStatus(selectedConversation);
    setStatusActionDraft(
      currentStatus && ["WAITING", "IN_PROGRESS", "WAITING_USER", "CLOSED"].includes(currentStatus)
        ? currentStatus
        : ""
    );
    setTransferUserId(selectedConversation.assignedUserId ?? "");
    setTransferDepartmentId(selectedConversation.departmentId ?? "");
  }, [
    selectedConversation?.assignedUserId,
    selectedConversation?.departmentId,
    selectedConversation?.handoffStatus,
    selectedConversation?.mode,
    selectedConversation?.queueId,
    selectedConversation?.status,
    selectedConversationKey,
  ]);

  useEffect(() => {
    if (!selectedConversationWaId || !composerEnabled || sendingMessage || conversationAction) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      focusComposer();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    focusComposer,
    composerEnabled,
    selectedConversationKey,
    selectedConversationWaId,
    sendingMessage,
    conversationAction,
  ]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!isAppForegroundFocused() || !selectedConversation) return;
      markConversationIdentitiesAsRead(
        getConversationIdentityCandidates(selectedConversation),
        getConversationActivityAt(selectedConversation),
        selectedConversation.waId
      );
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [markConversationIdentitiesAsRead, selectedConversation]);

  const selectedLead = useMemo(() => {
    if (!selectedConversation?.leadId) return null;
    return {
      id: selectedConversation.leadId,
      name: selectedConversation.leadName,
      phone: selectedConversation.leadPhone,
      email: selectedConversation.leadEmail,
      company: selectedConversation.leadCompany,
      status: selectedConversation.leadStatus as LeadStatus | null,
    };
  }, [selectedConversation]);
  const leadStatusOptions = useMemo(() => {
    const baseOptions = crmStatusOptions.length > 0 ? crmStatusOptions : FALLBACK_LEAD_STATUS_OPTIONS;
    const activeOptions = baseOptions.filter((item) => item.isActive);
    const selectedStatus = selectedLead?.status?.trim().toUpperCase();
    if (!selectedStatus || activeOptions.some((item) => item.id === selectedStatus)) {
      return activeOptions;
    }
    return [
      {
        id: selectedStatus,
        label: getLeadStatusLabel(selectedStatus, activeOptions),
        isActive: true,
        campaignEligible: false,
      },
      ...activeOptions,
    ];
  }, [crmStatusOptions, selectedLead?.status]);
  const selectedSuggestedReply = useMemo(() => extractSuggestedReply(leadNotes), [leadNotes]);

  useEffect(() => {
    if (!isBusinessTenant) return;
    if (!selectedConversation) return;
    const temperature = getLeadTemperature(selectedConversation);
    if (!temperature) return;
    const key = `${getConversationIdentity(selectedConversation)}:${temperature}`;
    if (renderedPriorityLogKeysRef.current.has(key)) return;
    renderedPriorityLogKeysRef.current.add(key);
    logInboxUxEvent(session, "inbox.priority.rendered", {
      conversationKey: getConversationIdentity(selectedConversation),
      leadTemp: temperature,
    });
  }, [isBusinessTenant, selectedConversation, session]);

  useEffect(() => {
    setStatusDraft((selectedLead?.status as LeadStatus | null) ?? "");
  }, [selectedLead?.id, selectedLead?.status]);

  useEffect(() => {
    setLeadNameDraft(selectedLead?.name ?? "");
  }, [selectedLead?.id, selectedLead?.name]);

  useEffect(() => {
    setLeadEmailDraft(selectedLead?.email ?? "");
  }, [selectedLead?.email, selectedLead?.id]);

  useEffect(() => {
    setLeadCompanyDraft(selectedLead?.company ?? "");
  }, [selectedLead?.company, selectedLead?.id]);

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
        setLeadError(getAppErrorUxMessage({ status: err.status, message: err.message, fallback: "Não foi possível carregar as notas do contato." }));
      })
      .finally(() => {
        if (!cancelled) setLoadingLeadNotes(false);
      });
    return () => {
      cancelled = true;
    };
  }, [handleUnauthorized, selectedLead?.id, session]);

  const handleSaveLeadStatus = async (nextStatus = statusDraft) => {
    if (!session || !selectedLead?.id || !nextStatus) return;
    if (!isSelectedConversationOwnedByCurrentUser) {
      setLeadError("Assuma a conversa para editar os dados do CRM.");
      return;
    }
    setSavingLeadStatus(true);
    setLeadError(null);
    try {
      const response = await updateAppLeadStatus(session, selectedLead.id, nextStatus);
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
      setLeadError(getAppErrorUxMessage({ status: typed.status, message: typed.message, fallback: "Não foi possível atualizar o andamento do contato." }));
    } finally {
      setSavingLeadStatus(false);
    }
  };

  const handleLeadStatusChange = async (nextStatus: LeadStatus) => {
    setStatusDraft(nextStatus);
    if (!nextStatus || nextStatus === selectedLead?.status) return;
    await handleSaveLeadStatus(nextStatus);
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
      setLeadError(getAppErrorUxMessage({ status: typed.status, message: typed.message, fallback: "Não foi possível registrar a nota." }));
    } finally {
      setSavingLeadNote(false);
    }
  };

  const handleUseSuggestedReply = () => {
    if (!selectedSuggestedReply) return;
    setMessageDraft((current) =>
      current.trim() ? `${current.trimEnd()}\n${selectedSuggestedReply}` : selectedSuggestedReply
    );
    logInboxUxEvent(session, "inbox.suggestion.used", {
      conversationKey: selectedConversation ? getConversationIdentity(selectedConversation) : null,
      leadId: selectedLead?.id ?? null,
    });
    focusComposer();
  };

  const handleSaveLeadDetails = async () => {
    if (!session || !selectedLead?.id) return;
    if (!isSelectedConversationOwnedByCurrentUser) {
      setLeadError("Assuma a conversa para editar os dados do CRM.");
      return;
    }
    const nextName = leadNameDraft.trim();
    const nextEmail = leadEmailDraft.trim();
    const nextCompany = leadCompanyDraft.trim();
    if (
      nextName === (selectedLead.name ?? "") &&
      nextEmail === (selectedLead.email ?? "") &&
      nextCompany === (selectedLead.company ?? "")
    ) {
      return;
    }
    setSavingLeadName(true);
    setLeadError(null);
    try {
      const response = await updateAppLead(session, selectedLead.id, {
        name: nextName || null,
        email: nextEmail || null,
        company: nextCompany || null,
      });
      setConversations((prev) =>
        prev.map((item) =>
          item.leadId === response.lead.id
            ? {
                ...item,
                leadName: response.lead.name,
                leadEmail: response.lead.email,
                leadCompany: response.lead.company,
              }
            : item
        )
      );
    } catch (err) {
      const typed = err as { status?: number; message?: string };
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setLeadError(getAppErrorUxMessage({ status: typed.status, message: typed.message, fallback: "Não foi possível salvar os dados do contato." }));
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
          const latencyStartedAt = performance.now();
          const requestStartedAt = performance.now();
          const response = await sendAppConversationMessage(
            session,
            next.waId,
            next.text,
            next.replyTo ? { kind: next.replyTo.kind, id: next.replyTo.id, mode: next.replyTo.mode } : null
          );
          const requestMs = performance.now() - requestStartedAt;
          const uiStartedAt = performance.now();
          shouldScrollToBottomRef.current = true;
          if (selectedConversationWaId === next.waId) {
            const outboundMessage: InboxMessageItem = {
              direction: "OUTBOUND",
              type: "TEXT",
              status: response.message.status,
              intent: null,
              bodyText: response.message.bodyText ?? next.text,
              agentSignatureApplied: response.message.agentSignatureApplied ?? false,
              agentSignatureFormat: response.message.agentSignatureFormat ?? null,
              media: null,
              templateName: null,
              templateLang: null,
              requestId: null,
              messageId: response.message.messageId,
              internalMessageId: response.message.internalMessageId ?? null,
              metaMessageId: response.message.metaMessageId,
              actor: response.message.actor ?? {
                source: "human_inbox",
                userId: session.user.id,
                displayName: session.user.name || session.user.email || null,
              },
              replyTo: next.replyTo
                ? {
                    kind: next.replyTo.kind,
                    id: next.replyTo.id,
                    previewType: next.replyTo.type,
                    mode: next.replyTo.mode,
                    previewBody: next.replyTo.preview,
                    previewDirection: next.replyTo.direction,
                    previewMedia: next.replyTo.media ?? null,
                    previewLocation: next.replyTo.location ?? null,
                  }
                : response.message.replyTo ?? null,
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
                        bodyText: response.message.bodyText ?? next.text,
                        templateName: null,
                        createdAt: response.message.createdAt,
                      },
                      lastOutboundAt: response.message.createdAt,
                      updatedAt: response.message.createdAt,
                    }
                  : item
              ),
              isBusinessTenant
            )
          );
          markConversationIdentitiesAsRead(
            [response.waIdCanonical, response.waId, next.conversationKey, next.waId],
            response.message.createdAt,
            next.waId
          );
          logInboxLatencyDebug({
            result: "sent",
            requestMs: Math.round(requestMs),
            uiMergeMs: Math.round(performance.now() - uiStartedAt),
            totalMs: Math.round(performance.now() - latencyStartedAt),
          });
          if (selectedConversationWaId === next.waId) {
            setReplyTarget(null);
          }
        } catch (err) {
          const typed = err as { status?: number; message?: string; details?: string };
          if (typed.status === 401) {
            handleUnauthorized();
            return;
          }
          if (selectedConversationWaId === next.waId) {
            setMessageDraft((current) => (current.trim() ? `${current}\n${next.text}` : next.text));
            setReplyTarget(next.replyTo);
          }
          setError(getAppErrorUxMessage({ status: typed.status, message: typed.message, fallback: "Não foi possível enviar a mensagem." }));
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
    if (!selectedConversationSupportsOutbound) {
      setError(selectedConversationOutboundDisabledMessage);
      setErrorDetails(null);
      return;
    }
    if (!canReply) {
      setError("Assuma a conversa para responder manualmente.");
      setErrorDetails(null);
      return;
    }
    const text = messageDraft.trim();
    if (!text) return;
    const outgoingText = buildOutgoingTextForReplyMode(text, replyTarget?.mode ?? "reply");
    if (!outgoingText) return;
    const queuedMessage: PendingOutgoingMessage = {
      waId: selectedConversationWaId,
      conversationKey: getConversationIdentity(selectedConversation),
      text: outgoingText,
      replyTo: replyTarget,
    };
    setMessageDraft("");
    setReplyTarget(null);
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
      if (!selectedConversationSupportsOutbound || !selectedConversationSupportsMediaOutbound) {
        setError(
          !selectedConversationSupportsOutbound
            ? selectedConversationOutboundDisabledMessage
            : selectedConversationMediaOutboundDisabledMessage
        );
        setErrorDetails(null);
        return;
      }
      if (!canReply) {
        setError("Assuma a conversa para responder manualmente.");
        setErrorDetails(null);
        return;
      }

      setSendingMessage(true);
      setError(null);
      setErrorDetails(null);
      try {
        const uploadFile = await prepareMediaFileForUpload(file);
        if (uploadFile.size > MEDIA_UPLOAD_SOFT_LIMIT_BYTES) {
          throw Object.assign(new Error("Arquivo muito grande para envio. Tente uma imagem menor ou compacte o documento."), {
            details: `Limite atual: 9 MB. Arquivo selecionado: ${formatFileSizeMb(file.size)}. Arquivo preparado: ${formatFileSizeMb(uploadFile.size)}.`,
          });
        }
        const response = await sendAppConversationMedia(
          session,
          selectedConversationWaId,
          uploadFile,
          caption?.trim() || undefined,
          replyTarget ? { kind: replyTarget.kind, id: replyTarget.id, mode: replyTarget.mode } : null
        );
        setSelectedMediaFile(null);
        setMessageDraft("");
        setReplyTarget(null);
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
          internalMessageId: response.message.internalMessageId ?? null,
          metaMessageId: response.message.metaMessageId,
          replyTo: replyTarget
            ? {
                kind: replyTarget.kind,
                id: replyTarget.id,
                previewType: replyTarget.type,
                mode: replyTarget.mode,
                previewBody: replyTarget.preview,
                previewDirection: replyTarget.direction,
                previewMedia: replyTarget.media ?? null,
                previewLocation: replyTarget.location ?? null,
              }
            : response.message.replyTo ?? null,
          actor: response.message.actor ?? {
            source: "human_inbox",
            userId: session.user.id,
            displayName: session.user.name || session.user.email || null,
          },
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
                    lastOutboundAt: response.message.createdAt,
                    updatedAt: response.message.createdAt,
                  }
                : item
            ),
            isBusinessTenant
          )
        );
        markConversationIdentitiesAsRead(
          [
            response.waIdCanonical,
            response.waId,
            ...getConversationIdentityCandidates(selectedConversation),
          ],
          response.message.createdAt,
          selectedConversation.waId
        );
      } catch (err) {
        const typed = err as { status?: number; message?: string; details?: string };
        if (typed.status === 401) {
          handleUnauthorized();
          return;
        }
        setError(getAppErrorUxMessage({ status: typed.status, message: typed.message, fallback: "Não foi possível enviar o arquivo." }));
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
      replyTarget,
      selectedConversation,
      selectedConversationMediaOutboundDisabledMessage,
      selectedConversationOutboundDisabledMessage,
      selectedConversationSupportsMediaOutbound,
      selectedConversationSupportsOutbound,
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

  const loadInboxTemplates = useCallback(async () => {
    if (!session) return;
    setTemplatesLoading(true);
    setTemplateError(null);
    try {
      const response = await listAppTemplates(session);
      setTemplateItems(response.items);
    } catch (err) {
      const typed = err as { status?: number; message?: string; details?: string };
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setTemplateError(getAppErrorUxMessage({ status: typed.status, message: typed.message, fallback: "Não foi possível carregar os modelos." }));
    } finally {
      setTemplatesLoading(false);
    }
  }, [handleUnauthorized, session]);

  const handleOpenTemplateModal = useCallback(() => {
    if (!selectedConversationWaId || !selectedConversation) return;
    if (!selectedConversationSupportsTemplateOutbound) {
      setError("Envio de modelo está disponível apenas para conversas do WhatsApp.");
      setErrorDetails(null);
      return;
    }
    if (!canReply) {
      setError("Assuma a conversa para enviar modelo.");
      setErrorDetails(null);
      return;
    }
    if (replyTarget) {
      setError("Ainda não é possível enviar modelo com mensagem marcada. Remova a marcação para enviar o modelo.");
      setErrorDetails(null);
      return;
    }
    setTemplateModalOpen(true);
    setTemplateError(null);
    if (templateItems.length === 0) {
      void loadInboxTemplates();
    }
  }, [
    canReply,
    loadInboxTemplates,
    replyTarget,
    selectedConversation,
    selectedConversationSupportsTemplateOutbound,
    selectedConversationWaId,
    templateItems.length,
  ]);

  const handleSendTemplate = async () => {
    if (!session || !selectedConversationWaId || !selectedConversation || !selectedTemplate) return;
    if (!templateComposerEnabled) {
      setTemplateError("Assuma uma conversa WhatsApp para enviar modelo.");
      return;
    }
    const missingKeys = selectedTemplateVariableKeys.filter((key) => !templateVariables[key]?.trim());
    if (missingKeys.length > 0) {
      setTemplateError("Preencha todas as variáveis obrigatórias.");
      return;
    }
    setSendingTemplate(true);
    setTemplateError(null);
    setError(null);
    setErrorDetails(null);
    try {
      const response = await sendAppConversationTemplate(session, selectedConversationWaId, {
        templateId: selectedTemplate.id,
        variables: templateVariables,
      });
      shouldScrollToBottomRef.current = true;
      const outboundMessage: InboxMessageItem = {
        direction: "OUTBOUND",
        type: response.message.type,
        status: response.message.status,
        intent: null,
        bodyText: response.message.bodyText,
        agentSignatureApplied: response.message.agentSignatureApplied ?? false,
        agentSignatureFormat: response.message.agentSignatureFormat ?? null,
        media: null,
        templateName: response.message.templateName,
        templateLang: response.message.templateLang,
        requestId: null,
        messageId: response.message.messageId,
        internalMessageId: response.message.internalMessageId ?? null,
        metaMessageId: response.message.metaMessageId,
        actor: response.message.actor ?? {
          source: "human_inbox",
          userId: session.user.id,
          displayName: session.user.name || session.user.email || null,
        },
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
                    agentSignatureApplied: response.message.agentSignatureApplied ?? false,
                    agentSignatureFormat: response.message.agentSignatureFormat ?? null,
                    templateName: response.message.templateName,
                    createdAt: response.message.createdAt,
                  },
                  lastOutboundAt: response.message.createdAt,
                  updatedAt: response.message.createdAt,
                }
              : item
          ),
          isBusinessTenant
        )
      );
      markConversationIdentitiesAsRead(
        [
          response.waIdCanonical,
          response.waId,
          ...getConversationIdentityCandidates(selectedConversation),
        ],
        response.message.createdAt,
        selectedConversation.waId
      );
      setSuccess("Modelo enviado.");
      handleCloseTemplateModal();
    } catch (err) {
      const typed = err as { status?: number; message?: string; details?: string };
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setTemplateError(getAppErrorUxMessage({ status: typed.status, message: typed.message, fallback: "Não foi possível enviar o modelo." }));
      setErrorDetails(typed.details || null);
    } finally {
      setSendingTemplate(false);
      focusComposer();
    }
  };

  const loadCannedReplies = useCallback(async () => {
    if (!session) return;
    setCannedRepliesLoading(true);
    setCannedReplyError(null);
    try {
      const response = await listAppCannedReplies(session);
      setCannedReplies(response.items.filter((reply) => reply.active));
    } catch (err) {
      const typed = err as { status?: number; message?: string };
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setCannedReplyError(getAppErrorUxMessage({ status: typed.status, message: typed.message, fallback: "Não foi possível carregar as mensagens prontas." }));
    } finally {
      setCannedRepliesLoading(false);
    }
  }, [handleUnauthorized, session]);

  const handleOpenCannedModal = useCallback(() => {
    if (!selectedConversationWaId || !selectedConversation) return;
    if (!selectedConversationSupportsTemplateOutbound) {
      setError("Mensagens prontas estão disponíveis apenas para conversas WhatsApp nesta etapa.");
      setErrorDetails(null);
      return;
    }
    if (!canReply) {
      setError("Assuma a conversa para usar mensagem pronta.");
      setErrorDetails(null);
      return;
    }
    setCannedModalOpen(true);
    setCannedReplyError(null);
    if (cannedReplies.length === 0) {
      void loadCannedReplies();
    }
  }, [
    canReply,
    cannedReplies.length,
    loadCannedReplies,
    selectedConversation,
    selectedConversationSupportsTemplateOutbound,
    selectedConversationWaId,
  ]);

  const handleInsertCannedReply = useCallback(
    (reply: AppCannedReplyItem) => {
      setMessageDraft(reply.body);
      setSuccess("Mensagem pronta inserida. Revise antes de enviar.");
      handleCloseCannedModal();
      focusComposer();
    },
    [focusComposer, handleCloseCannedModal]
  );

  const handleSendCannedReply = async () => {
    if (!session || !selectedConversationWaId || !selectedConversation || !selectedCannedReply) return;
    if (!templateComposerEnabled) {
      setCannedReplyError("Assuma uma conversa WhatsApp para enviar mensagem pronta.");
      return;
    }
    setSendingCannedReply(true);
    setCannedReplyError(null);
    setError(null);
    setErrorDetails(null);
    try {
      const response = await sendAppConversationCannedReply(
        session,
        selectedConversationWaId,
        selectedCannedReply.id,
        replyTarget ? { kind: replyTarget.kind, id: replyTarget.id, mode: replyTarget.mode } : null
      );
      shouldScrollToBottomRef.current = true;
      const outboundMessage: InboxMessageItem = {
        direction: "OUTBOUND",
        type: response.message.type,
        status: response.message.status,
        intent: null,
        bodyText: response.message.bodyText,
        agentSignatureApplied: response.message.agentSignatureApplied ?? false,
        agentSignatureFormat: response.message.agentSignatureFormat ?? null,
        media: null,
        templateName: null,
        templateLang: null,
        requestId: null,
        messageId: response.message.messageId,
        internalMessageId: response.message.internalMessageId ?? null,
        metaMessageId: response.message.metaMessageId,
        actor: response.message.actor ?? {
          source: "human_inbox",
          userId: session.user.id,
          displayName: session.user.name || session.user.email || null,
        },
        replyTo: replyTarget
          ? {
              kind: replyTarget.kind,
              id: replyTarget.id,
              previewType: replyTarget.type,
              mode: replyTarget.mode,
              previewBody: replyTarget.preview,
              previewDirection: replyTarget.direction,
              previewMedia: replyTarget.media ?? null,
              previewLocation: replyTarget.location ?? null,
            }
          : response.message.replyTo ?? null,
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
                  lastOutboundAt: response.message.createdAt,
                  updatedAt: response.message.createdAt,
                }
              : item
          ),
          isBusinessTenant
        )
      );
      markConversationIdentitiesAsRead(
        [
          response.waIdCanonical,
          response.waId,
          ...getConversationIdentityCandidates(selectedConversation),
        ],
        response.message.createdAt,
        selectedConversation.waId
      );
      setSuccess("Mensagem pronta enviada.");
      setReplyTarget(null);
      handleCloseCannedModal();
    } catch (err) {
      const typed = err as { status?: number; message?: string; details?: string; payload?: unknown };
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      const payload = typed.payload as { error?: { code?: string; message?: string } } | null | undefined;
      const code = payload?.error?.code;
      setCannedReplyError(
        code === "window_closed"
          ? "A janela de atendimento está fechada. Use um modelo aprovado."
          : getAppErrorUxMessage({ status: typed.status, message: typed.message, fallback: "Não foi possível enviar a mensagem pronta." })
      );
      setErrorDetails(typed.details || null);
    } finally {
      setSendingCannedReply(false);
      focusComposer();
    }
  };

  const handleToggleAudioRecording = async () => {
    if (!selectedConversationWaId) return;
    if (!selectedConversationSupportsOutbound || !selectedConversationSupportsMediaOutbound) {
      setError(
        !selectedConversationSupportsOutbound
          ? selectedConversationOutboundDisabledMessage
          : selectedConversationMediaOutboundDisabledMessage
      );
      setErrorDetails(null);
      return;
    }
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
      setError("Gravação de áudio não suportada neste navegador.");
      setErrorDetails(null);
      return;
    }

    try {
      setError(null);
      setErrorDetails(null);
      const mimeType = getSupportedRecordingMimeType();
      if (!mimeType) {
        setError("Este navegador não grava áudio em formato compatível com o WhatsApp.");
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
          setError("Não foi possível capturar o áudio.");
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
      setError("Não foi possível iniciar a gravação de áudio.");
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
      setError(getAppErrorUxMessage({ status: typed.status, message: typed.message, fallback: "Não foi possível assumir a conversa." }));
    } finally {
      setConversationAction(null);
    }
  };

  const handleReleaseConversation = async () => {
    if (!session || !selectedConversationWaId) return;
    const confirmed = window.confirm(
      "Liberar para automação remove esta conversa da operação humana.\n\nEla não poderá ser acessada ou visualizada na caixa de entrada, a menos que o número volte a entrar em contato.\n\nDeseja continuar?"
    );
    if (!confirmed) return;
    setConversationAction("release");
    setError(null);
    setSuccess(null);
    try {
      await releaseAppConversation(session, selectedConversationWaId);
      const releasedKey = selectedConversationKey;
      detailRequestSeqRef.current += 1;
      setConversations((prev) =>
        releasedKey ? prev.filter((item) => getConversationIdentity(item) !== releasedKey) : prev
      );
      clearSelectedConversation();
      setSuccess("Conversa liberada para automação.");
      void refreshConversationList(session).catch((err) => {
        if ((err as { status?: number }).status === 401) handleUnauthorized();
      });
    } catch (err) {
      const typed = err as { status?: number; message?: string };
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(getAppErrorUxMessage({ status: typed.status, message: typed.message, fallback: "Não foi possível liberar a conversa." }));
    } finally {
      setConversationAction(null);
    }
  };

  const handleReleaseConversationToGeneral = async () => {
    if (!session || !selectedConversationWaId) return;
    setConversationAction("release-general");
    setError(null);
    setSuccess(null);
    try {
      const response = await releaseAppConversationToGeneral(session, selectedConversationWaId);
      const responseIdentity = response.waIdCanonical ?? response.waId ?? selectedConversationWaId;
      const stillInUserScope = canSessionAccessConversationDepartment(session, response.departmentId);

      if (!stillInUserScope) {
        detailRequestSeqRef.current += 1;
        setConversations((prev) =>
          prev.filter((item) => getConversationIdentity(item) !== responseIdentity)
        );
        clearSelectedConversation();
        setSuccess("Conversa devolvida para a fila atual.");
        void refreshConversationList(session).catch((err) => {
          if ((err as { status?: number }).status === 401) handleUnauthorized();
        });
        return;
      }

      setSuccess("Conversa devolvida para a fila atual.");
      await refreshConversationList(session);
      await refreshSelectedTimeline(session, response.waId ?? selectedConversationWaId);
    } catch (err) {
      const typed = err as { status?: number; message?: string };
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(getAppErrorUxMessage({ status: typed.status, message: typed.message, fallback: "Não foi possível devolver a conversa para a fila atual." }));
    } finally {
      setConversationAction(null);
    }
  };

  const handleCloseConversationToGeneral = async () => {
    if (!session || !selectedConversationWaId) return;
    const confirmed = window.confirm(
      "Encerrar este atendimento?\n\nAo confirmar, o protocolo será encerrado e a pesquisa de satisfação será enviada ao cliente."
    );
    if (!confirmed) return;
    setConversationAction("close-general");
    setError(null);
    setSuccess(null);
    try {
      const response = await closeAppConversation(session, selectedConversationWaId);
      const responseIdentity = response.waIdCanonical ?? response.waId ?? selectedConversationWaId;
      const stillInUserScope = canSessionAccessConversationDepartment(session, response.departmentId);

      setConversations((prev) => {
        const nextItems = prev
          .map((item) => {
            if (
              getConversationIdentity(item) !== responseIdentity &&
              item.waId !== selectedConversationWaId &&
              item.waIdCanonical !== response.waIdCanonical
            ) {
              return item;
            }
            return {
              ...item,
              waId: response.waId ?? item.waId,
              waIdCanonical: response.waIdCanonical ?? item.waIdCanonical ?? null,
              mode: response.mode,
              handoffStatus: response.handoffStatus ?? item.handoffStatus ?? "none",
              assignedUserId: response.assignedUserId,
              assignedTo: response.assignedTo,
              assignedUserName: response.assignedUserName,
              assignedAt: response.assignedAt,
              departmentId: response.departmentId,
              departmentName: response.departmentName,
              queueId: response.queueId,
              queueName: response.queueName,
              status: response.status,
              closedAt: response.closedAt,
              lastInboundAt: response.lastInboundAt,
              lastOutboundAt: response.lastOutboundAt,
              isUnassigned: response.isUnassigned,
            };
          })
          .filter((item) => stillInUserScope || getConversationIdentity(item) !== responseIdentity);
        return dedupeConversationsByIdentity(nextItems, isBusinessTenant);
      });

      if (!stillInUserScope) {
        detailRequestSeqRef.current += 1;
        clearSelectedConversation();
        setSuccess("Atendimento encerrado.");
        void refreshConversationList(session).catch((err) => {
          if ((err as { status?: number }).status === 401) handleUnauthorized();
        });
        return;
      }

      setSuccess("Atendimento encerrado.");
      await refreshConversationList(session);
      await refreshSelectedTimeline(session, response.waId ?? selectedConversationWaId);
    } catch (err) {
      const typed = err as { status?: number; message?: string };
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(getAppErrorUxMessage({ status: typed.status, message: typed.message, fallback: "Não foi possível finalizar o atendimento." }));
    } finally {
      setConversationAction(null);
    }
  };

  const handleTransferConversation = async () => {
    if (!session || !selectedConversationWaId || !transferUserId) return;
    setConversationAction("transfer");
    setError(null);
    setSuccess(null);
    try {
      const response = await transferAppConversation(session, selectedConversationWaId, transferUserId);
      const responseIdentity = response.waIdCanonical ?? response.waId ?? selectedConversationWaId;
      const stillInUserScope = canSessionAccessConversationDepartment(session, response.departmentId);

      setConversations((prev) => {
        const nextItems = prev
          .map((item) => {
            if (
              getConversationIdentity(item) !== responseIdentity &&
              item.waId !== selectedConversationWaId &&
              item.waIdCanonical !== response.waIdCanonical
            ) {
              return item;
            }
            return {
              ...item,
              waId: response.waId ?? item.waId,
              waIdCanonical: response.waIdCanonical ?? item.waIdCanonical ?? null,
              mode: response.mode,
              handoffStatus: response.handoffStatus ?? item.handoffStatus ?? "none",
              assignedUserId: response.assignedUserId,
              assignedTo: response.assignedTo,
              assignedUserName: response.assignedUserName,
              assignedAt: response.assignedAt,
              departmentId: response.departmentId,
              departmentName: response.departmentName,
              queueId: response.queueId,
              queueName: response.queueName,
              status: response.status,
              closedAt: response.closedAt,
              lastInboundAt: response.lastInboundAt,
              lastOutboundAt: response.lastOutboundAt,
              isUnassigned: response.isUnassigned,
            };
          })
          .filter((item) => stillInUserScope || getConversationIdentity(item) !== responseIdentity);
        return dedupeConversationsByIdentity(nextItems, isBusinessTenant);
      });

      if (!stillInUserScope) {
        detailRequestSeqRef.current += 1;
        clearSelectedConversation();
        setSuccess("Conversa transferida para outro setor.");
        void refreshConversationList(session).catch((err) => {
          if ((err as { status?: number }).status === 401) handleUnauthorized();
        });
        return;
      }

      setSuccess("Conversa transferida.");
      await refreshConversationList(session);
      await refreshSelectedTimeline(session, response.waId ?? selectedConversationWaId);
    } catch (err) {
      const typed = err as { status?: number; message?: string };
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(getAppErrorUxMessage({ status: typed.status, message: typed.message, fallback: "Não foi possível transferir a conversa." }));
    } finally {
      setConversationAction(null);
    }
  };

  const handleTransferDepartment = async () => {
    if (
      !session ||
      !selectedConversationWaId ||
      !transferDepartmentId
    ) {
      return;
    }
    setConversationAction("transfer-department");
    setError(null);
    setSuccess(null);
    try {
      const response = await transferAppConversationDepartment(
        session,
        selectedConversationWaId,
        transferDepartmentId
      );
      await refreshConversationList(session);
      await refreshSelectedTimeline(session, response.waId ?? selectedConversationWaId);
      const targetDepartmentName =
        transferDepartmentOptions.find((item) => item.id === transferDepartmentId)?.name ??
        departmentOptions.find((item) => item.id === transferDepartmentId)?.name ??
        response.departmentName ??
        "setor selecionado";
      setSuccess(`Conversa transferida para o setor ${targetDepartmentName}.`);
    } catch (err) {
      const typed = err as { status?: number; message?: string };
      setError(getAppErrorUxMessage({ status: typed.status, message: typed.message, fallback: "Não foi possível transferir a conversa de setor." }));
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
      setError(getAppErrorUxMessage({ status: typed.status, message: typed.message, fallback: "Não foi possível atualizar a situação do atendimento." }));
    } finally {
      setConversationAction(null);
    }
  };

  const contactTimelineGroups = contactTimelineItems.reduce<Array<{ date: string; items: AppContactTimelineItem[] }>>(
    (groups, item) => {
      const date = getTimelineDateGroup(item.createdAt);
      const current = groups[groups.length - 1];
      if (current?.date === date) {
        current.items.push(item);
      } else {
        groups.push({ date, items: [item] });
      }
      return groups;
    },
    []
  );

  if (!session) {
    return <main className="min-h-screen bg-re7-navy" />;
  }

  const notificationToggleActive = soundEnabled;
  const notificationToggleTitle = notificationToggleActive
    ? isMobileViewport
      ? pushUiStatus === "enabled"
        ? "Desativar som local"
        : "Desativar som"
      : "Desativar som"
    : isMobileViewport
      ? pushUiStatus === "denied"
        ? "Notificações bloqueadas no navegador"
        : "Ativar notificações e som"
      : "Ativar som";

  return (
    <AppShell
      session={session}
      title="Caixa de entrada"
      subtitle="Atendimentos do WhatsApp, Messenger, Instagram, Chat do site e Suporte em uma só fila."
      fullScreen
    >
      <FeedbackToast
        message={success}
        onClick={dismissInboxFeedback}
      />
      <FeedbackToast
        message={buildInboxErrorToast(error, errorDetails, leadError)}
        variant="error"
        onClick={dismissInboxFeedback}
      />
      {templateModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-3 py-6">
          <section className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-950 shadow-2xl">
            <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-base font-semibold">Enviar modelo aprovado</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Use um modelo aprovado para continuar o atendimento pelo WhatsApp.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseTemplateModal}
                disabled={sendingTemplate}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Fechar
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.85fr)]">
                <section className="space-y-3">
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                    A cobrança depende da categoria, país, entrega e política vigente da Meta.
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-900">Modelos disponíveis</h3>
                      <button
                        type="button"
                        onClick={() => void loadInboxTemplates()}
                        disabled={templatesLoading || sendingTemplate}
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {templatesLoading ? "Atualizando..." : "Atualizar"}
                      </button>
                    </div>
                    {templatesLoading ? (
                      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                        Carregando modelos aprovados...
                      </p>
                    ) : null}
                    {!templatesLoading && usableInboxTemplates.length === 0 ? (
                      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                        Nenhum modelo aprovado e ativo disponível para envio por aqui.
                      </p>
                    ) : null}
                    <div className="space-y-2">
                      {usableInboxTemplates.map((template) => {
                        const selected = template.id === selectedTemplateId;
                        return (
                          <button
                            key={template.id}
                            type="button"
                            onClick={() => {
                              setSelectedTemplateId(template.id);
                              setTemplateVariables({});
                              setTemplateError(null);
                            }}
                            disabled={sendingTemplate}
                            className={`w-full rounded-lg border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                              selected
                                ? "border-[#20b15a] bg-emerald-50 shadow-[0_0_0_2px_rgba(32,177,90,0.16)]"
                                : "border-slate-200 bg-white hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-slate-950">{template.displayName || template.name}</span>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase text-slate-600">
                                {template.category}
                              </span>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                {template.language}
                              </span>
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600">
                              {getTemplateBodyPreview(template.content)}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  {!selectedTemplate ? (
                    <div className="flex min-h-64 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-4 text-center text-sm text-slate-500">
                      Selecione um modelo aprovado para revisar a mensagem e preencher variáveis.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-950">{selectedTemplate.displayName || selectedTemplate.name}</h3>
                        <p className="mt-1 text-xs text-slate-500">
                          Modelo aprovado para envio ativo pelo WhatsApp.
                        </p>
                      </div>
                      <InboxCostPreview preview={templateCostPreview} />
                      {selectedTemplateVariableKeys.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase text-slate-500">Variáveis</p>
                          {selectedTemplateVariableKeys.map((key) => (
                            <label key={key} className="grid gap-1 text-sm">
                              <span className="text-xs font-medium text-slate-600">{`{{${key}}}`}</span>
                              <input
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#20b15a]"
                                value={templateVariables[key] ?? ""}
                                onChange={(event) =>
                                  setTemplateVariables((current) => ({
                                    ...current,
                                    [key]: event.target.value,
                                  }))
                                }
                                disabled={sendingTemplate}
                                placeholder="Valor a enviar"
                              />
                            </label>
                          ))}
                        </div>
                      ) : (
                        <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                          Este modelo não possui variáveis obrigatórias.
                        </p>
                      )}
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Prévia</p>
                        <div className="rounded-2xl border border-emerald-200 bg-[#e6ffdc] px-4 py-3 text-sm leading-relaxed text-slate-900 shadow-sm">
                          <p className="whitespace-pre-wrap break-words">
                            {renderTemplatePreview(selectedTemplate.content, templateVariables)}
                          </p>
                        </div>
                      </div>
                      {templateError ? (
                        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                          {templateError}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={handleCloseTemplateModal}
                          disabled={sendingTemplate}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleSendTemplate()}
                          disabled={sendingTemplate || !selectedTemplate}
                          className="rounded-lg bg-[#20b15a] px-3 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {sendingTemplate ? "Enviando..." : "Enviar modelo"}
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              </div>
            </div>
          </section>
        </div>
      ) : null}
      {cannedModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-3 py-6">
          <section className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-950 shadow-2xl">
            <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-base font-semibold">Mensagens prontas</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Textos prontos da sua organização para agilizar respostas no canal configurado.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseCannedModal}
                disabled={sendingCannedReply}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Fechar
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
                <section className="space-y-3">
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                    Mensagem pronta é enviada como texto comum. A cobrança depende da entrega e da política vigente da Meta.
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      value={cannedReplySearch}
                      onChange={(event) => setCannedReplySearch(event.target.value)}
                      placeholder="Buscar por título, categoria ou texto"
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#20b15a]"
                    />
                    <button
                      type="button"
                      onClick={() => void loadCannedReplies()}
                      disabled={cannedRepliesLoading || sendingCannedReply}
                      className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {cannedRepliesLoading ? "Atualizando..." : "Atualizar"}
                    </button>
                  </div>
                  {cannedRepliesLoading ? (
                    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                      Carregando mensagens prontas...
                    </p>
                  ) : null}
                  {!cannedRepliesLoading && filteredCannedReplies.length === 0 ? (
                    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                      Nenhuma mensagem pronta ativa encontrada.
                    </p>
                  ) : null}
                  <div className="space-y-2">
                    {filteredCannedReplies.map((reply) => {
                      const selected = reply.id === selectedCannedReplyId;
                      return (
                        <button
                          key={reply.id}
                          type="button"
                          onClick={() => {
                            setSelectedCannedReplyId(reply.id);
                            setCannedReplyError(null);
                          }}
                          disabled={sendingCannedReply}
                          className={`w-full rounded-lg border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                            selected
                              ? "border-[#20b15a] bg-emerald-50 shadow-[0_0_0_2px_rgba(32,177,90,0.16)]"
                              : "border-slate-200 bg-white hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-slate-950">{reply.title}</span>
                            {reply.category ? (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                {reply.category}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">
                            {reply.body}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  {!selectedCannedReply ? (
                    <div className="flex min-h-64 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-4 text-center text-sm text-slate-500">
                      Selecione uma mensagem pronta para revisar antes de usar.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-950">{selectedCannedReply.title}</h3>
                        <p className="mt-1 text-xs text-slate-500">
                          Mensagem interna. Em Meta Cloud, texto livre segue a janela de atendimento; em Web Session, segue o canal conectado.
                        </p>
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Prévia</p>
                        <div className="rounded-2xl border border-emerald-200 bg-[#e6ffdc] px-4 py-3 text-sm leading-relaxed text-slate-900 shadow-sm">
                          <p className="whitespace-pre-wrap break-words">{selectedCannedReply.body}</p>
                        </div>
                      </div>
                      {cannedReplyError ? (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                          <p>{cannedReplyError}</p>
                          {cannedReplyError.includes("janela de atendimento") ? (
                            <button
                              type="button"
                              onClick={() => {
                                handleCloseCannedModal();
                                handleOpenTemplateModal();
                              }}
                              className="mt-2 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                            >
                              Enviar modelo aprovado
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleInsertCannedReply(selectedCannedReply)}
                          disabled={sendingCannedReply}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Inserir no campo
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleSendCannedReply()}
                          disabled={sendingCannedReply || !selectedCannedReply}
                          className="rounded-lg bg-[#20b15a] px-3 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {sendingCannedReply ? "Enviando..." : "Enviar mensagem pronta"}
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              </div>
            </div>
          </section>
        </div>
      ) : null}
      {showContactTimeline ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6">
          <section className="flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-slate-950">Histórico do contato</h2>
                <p className="mt-1 truncate text-sm text-slate-500">
                  {selectedConversation ? getConversationLabel(selectedConversation) : "Contato"}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseContactTimeline}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Fechar
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {loadingContactTimeline && contactTimelineItems.length === 0 ? (
                <p className="text-sm text-slate-500">Carregando histórico...</p>
              ) : null}
              {contactTimelineError ? (
                <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {contactTimelineError}
                </p>
              ) : null}
              {!loadingContactTimeline && !contactTimelineError && contactTimelineItems.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
                  <p className="text-sm font-medium text-slate-800">Nenhum histórico encontrado.</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Mensagens, eventos e notas deste contato aparecerão aqui.
                  </p>
                </div>
              ) : null}
              <div className="space-y-5">
                {contactTimelineGroups.map((group) => (
                  <section key={group.date}>
                    <div className="sticky top-0 z-10 mb-3 bg-white/95 py-1">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                        {group.date}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {group.items.map((item) => (
                        <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getTimelineKindClass(item)}`}>
                                {getTimelineKindLabel(item)}
                              </span>
                              <h3 className="mt-2 text-sm font-semibold text-slate-900">{item.title}</h3>
                            </div>
                            <span className="shrink-0 text-xs text-slate-500">{formatDateTime(item.createdAt)}</span>
                          </div>
                          {item.body ? (
                            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">
                              {item.body}
                            </p>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
            <footer className="border-t border-slate-200 px-5 py-3">
              {contactTimelineCursor ? (
                <button
                  type="button"
                  disabled={loadingContactTimeline}
                  onClick={() => void loadContactTimeline("append")}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loadingContactTimeline ? "Carregando..." : "Carregar mais"}
                </button>
              ) : loadingContactTimeline && contactTimelineItems.length === 0 ? (
                <p className="text-center text-xs text-slate-400">Carregando histórico...</p>
              ) : (
                <p className="text-center text-xs text-slate-400">Fim do histórico carregado.</p>
              )}
            </footer>
          </section>
        </div>
      ) : null}

      <section className="grid h-full min-h-0 w-full max-w-full grid-cols-1 overflow-hidden md:grid-cols-[340px_minmax(0,1fr)_230px] min-[1367px]:grid-cols-[360px_minmax(0,1fr)_250px] min-[1441px]:grid-cols-[380px_minmax(0,1fr)_300px] 2xl:grid-cols-[390px_minmax(0,1fr)_320px]">
        <aside className={`min-h-0 min-w-0 max-w-full flex-col border-r border-white/10 bg-[#0c1930] max-md:border-r-0 md:flex ${selectedConversationKey ? "max-md:hidden" : "flex"}`}>
          <div className="border-b border-white/10 bg-[#10213d] px-4 py-3 shadow-[inset_0_-1px_0_rgba(255,255,255,0.04)] max-[1440px]:px-3 max-[1440px]:py-2.5 max-[1280px]:px-2.5 max-[1280px]:py-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p
                  className="truncate text-[11px] text-white/55"
                  title={`${session.user.name || session.user.email} - ${loggedUserDepartmentLabel}`}
                >
                  <span>{session.user.name || session.user.email}</span>
                  <span className="text-white/35"> • </span>
                  <span className="font-medium text-white/70">{loggedUserDepartmentLabel}</span>
                </p>
                {tenantNameLabel || tenantPhoneLabel ? (
                  <p
                    className="mt-0.5 truncate text-[11px] font-normal text-white/55"
                    title={[tenantNameLabel, tenantPhoneLabel].filter(Boolean).join(" • ")}
                  >
                    {[tenantNameLabel, tenantPhoneLabel].filter(Boolean).join(" • ")}
                  </p>
                ) : null}
              </div>
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={handleNotificationToggle}
                  title={notificationToggleTitle}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm transition ${
                    notificationToggleActive
                      ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/20"
                      : "border-white/15 bg-white/5 text-white/65 hover:bg-white/10"
                  }`}
                >
                  {notificationToggleActive ? "🔔" : "🔕"}
                </button>
                <ThemeSelector
                  variant="icon"
                  className="hidden h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-sm text-white/75 transition hover:bg-white/10 max-md:flex"
                />
                <button
                  type="button"
                  onClick={handleLogout}
                  className="hidden h-8 items-center justify-center rounded-lg border border-orange-500 bg-orange-500 px-2 text-[11px] font-semibold text-white shadow-sm transition hover:bg-orange-600 max-md:flex"
                >
                  Sair
                </button>
              </div>
            </div>
            <div className="mt-3 space-y-2 max-[1440px]:mt-2 max-[1440px]:space-y-1.5">
              {isAdminUser ? (
                <select
                  value={departmentFilter}
                  onChange={(event) => setDepartmentFilter(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none max-[1440px]:rounded-lg max-[1440px]:px-2.5 max-[1440px]:py-1.5 max-[1440px]:text-xs [&>option]:bg-re7-navy [&>option]:text-white"
                >
                  <option value="ALL">Todos os setores</option>
                  {departmentOptions.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              ) : null}
              <input
                type="search"
                value={conversationSearch}
                onChange={(event) => setConversationSearch(event.target.value)}
                placeholder="Buscar conversa"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-re7-sky/40 max-[1440px]:rounded-lg max-[1440px]:px-2.5 max-[1440px]:py-1.5 max-[1440px]:text-xs"
              />
              <div className="relative space-y-1.5">
                <div className="flex max-w-full flex-wrap items-center gap-1.5 pb-0.5 max-[1440px]:gap-1">
                  {PRIMARY_CONVERSATION_FILTERS.map((filterValue) => {
                    const filter = CONVERSATION_FILTER_BY_VALUE.get(filterValue);
                    if (!filter) return null;
                    return (
                      <button
                        key={filter.value}
                        type="button"
                        onClick={() => applyConversationFilter(filter.value)}
                        className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold leading-none transition max-[1440px]:px-2 max-[1440px]:text-[10px] ${
                          conversationFilter === filter.value
                            ? "bg-re7-sky/30 text-white"
                            : "bg-white/5 text-white/65 hover:bg-white/10"
                        }`}
                      >
                        <span>{filter.label}</span>
                        <span
                          className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] leading-none ${
                            conversationFilter === filter.value
                              ? "bg-white/20 text-white"
                              : "bg-white/10 text-white/55"
                          }`}
                        >
                          {conversationFilterCounts[filter.value]}
                        </span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setShowMoreConversationFilters((current) => !current)}
                    className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-bold leading-none transition max-[1440px]:px-2 max-[1440px]:text-[10px] ${
                      hasMoreConversationFilter
                        ? "border-re7-sky/60 bg-re7-sky/30 text-white"
                        : "border-white/20 bg-white/10 text-white/80 hover:bg-white/15 hover:text-white"
                    }`}
                  >
                    <span>Mais</span>
                    {selectedMoreConversationFilter ? (
                      <span className="ml-1 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] leading-none text-white">
                        {conversationFilterCounts[selectedMoreConversationFilter.value]}
                      </span>
                    ) : hasMoreConversationFilter ? (
                      <span className="ml-1 h-1.5 w-1.5 rounded-full bg-re7-sky" />
                    ) : (
                      <span className="ml-1 text-[10px] text-white/45">▾</span>
                    )}
                  </button>
                </div>
                <div className="grid max-w-full grid-cols-3 gap-1.5 pb-0.5 max-[1440px]:gap-1">
                  {CONVERSATION_CHANNEL_FILTERS.map((filter) => {
                    const selected = conversationChannelFilter === filter.value;
                    const compactLabel = filter.value === "messenger" ? "Facebook" : filter.label;
                    return (
                      <button
                        key={filter.value}
                        type="button"
                        onClick={() =>
                          setConversationChannelFilter((current) =>
                            current === filter.value ? "ALL" : filter.value
                          )
                        }
                        title={selected ? `Remover filtro ${filter.label}` : `Filtrar ${filter.label}`}
                        aria-label={selected ? `Remover filtro ${filter.label}` : `Filtrar ${filter.label}`}
                        aria-pressed={selected}
                        className={`flex h-7 min-w-0 items-center justify-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold leading-none transition max-[1440px]:h-6 max-[1440px]:gap-1 max-[1440px]:px-1.5 max-[1440px]:text-[9px] ${
                          selected
                            ? "border-re7-sky/70 bg-re7-sky/35 text-white shadow-[0_0_0_1px_rgba(56,189,248,0.28)]"
                            : "border-white/20 bg-white/10 text-white/78 hover:border-white/35 hover:bg-white/15 hover:text-white"
                        }`}
                      >
                        <ConversationChannelLogo item={{ channel: filter.value }} className="h-5 w-5 shrink-0 max-[1440px]:h-4 max-[1440px]:w-4" />
                        <span className="min-w-0 truncate">{compactLabel}</span>
                      </button>
                    );
                  })}
                </div>
                {showMoreConversationFilters ? (
                  <div className="absolute left-0 top-7 z-30 mt-1 w-64 rounded-xl border border-white/10 bg-[#101f3a] p-1.5 shadow-[0_16px_32px_rgba(0,0,0,0.28)] max-[1440px]:w-56">
                    {MORE_CONVERSATION_FILTERS.map((filter) => (
                      <button
                        key={filter.value}
                        type="button"
                        onClick={() => applyConversationFilter(filter.value)}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-bold transition max-[1440px]:px-2 max-[1440px]:py-1.5 max-[1440px]:text-[11px] ${
                          conversationFilter === filter.value
                            ? "bg-re7-sky/25 text-white"
                            : "text-white/70 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <span className="whitespace-nowrap">{filter.label}</span>
                        <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] leading-none text-white/65">
                          {conversationFilterCounts[filter.value]}
                        </span>
                      </button>
                    ))}
                    <div className="my-1 border-t border-white/10" />
                    <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white/45">Atalhos</p>
                    {CONVERSATION_QUICK_FILTERS.map((filter) => {
                      const selected = conversationQuickFilter === filter.value;
                      return (
                        <button
                          key={filter.value}
                          type="button"
                          onClick={() =>
                            {
                              setConversationQuickFilter((current) =>
                                current === filter.value ? "ALL" : filter.value
                              );
                              setShowMoreConversationFilters(false);
                            }
                          }
                          aria-pressed={selected}
                          className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-bold transition max-[1440px]:px-2 max-[1440px]:py-1.5 max-[1440px]:text-[11px] ${
                            selected
                              ? "bg-emerald-400/18 text-white"
                              : "text-white/70 hover:bg-white/10 hover:text-white"
                          }`}
                        >
                          <span className="whitespace-nowrap">{filter.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <div
            ref={conversationListRef}
            className="min-h-0 flex-1 select-none overflow-y-auto overflow-anchor-none touch-pan-y [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] [-webkit-user-select:none]"
            onScroll={() => {
              conversationListLastScrollAtRef.current = Date.now();
              conversationListSuppressClickUntilRef.current = Date.now() + 900;
            }}
          >
            {loadingConversations ? (
              <div className="space-y-2 px-3 py-4">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="animate-pulse rounded-xl border border-white/8 bg-white/5 p-3">
                    <div className="h-3 w-2/3 rounded bg-white/12" />
                    <div className="mt-3 h-2.5 w-1/2 rounded bg-white/8" />
                    <div className="mt-3 h-2.5 w-full rounded bg-white/8" />
                  </div>
                ))}
              </div>
            ) : null}
            {!loadingConversations && filteredConversations.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/12 bg-white/8">
                  {conversationChannelFilter === "ALL" ? (
                    <span className="text-lg text-white/70">☰</span>
                  ) : (
                    <ConversationChannelLogo item={{ channel: conversationChannelFilter }} className="h-7 w-7" />
                  )}
                </div>
                <p className="mt-3 text-sm font-semibold text-white">Nenhuma conversa encontrada</p>
                <p className="mt-1 text-xs leading-relaxed text-white/55">
                  {conversationSearch.trim()
                    ? "Ajuste a busca ou limpe os filtros para ampliar a fila."
                    : `Sem conversas em ${getChannelEmptyStateLabel(conversationChannelFilter)} com os filtros atuais.`}
                </p>
              </div>
            ) : null}
            {filteredConversations.map((item, index) => {
              const conversationIdentity = getConversationIdentity(item);
              const isActive = conversationIdentity === selectedConversationKey;
              const isVisuallyActive = isActive && !isIosViewport;
              const unread = !isActive && isConversationUnreadForUser(item, readState, session?.user);
              const unreadCount = getConversationUnreadBadgeCount(item, readState, session?.user);
              const status = getConversationOperationalStatus(item);
              const label = getConversationLabel(item);
              const phoneLine = getConversationSecondaryIdentifier(item, label);
              const leadTemperatureLabel = getLeadTemperatureLabel(item);
              const operationalDurationLabel = getConversationOperationalDurationLabel(item);
              const assignmentLabel = getConversationAssignmentLabel(item, session?.user.id);
              const assignedToCurrentUser = isConversationAssignedToCurrentUser(item, session?.user.id ?? "");
              return (
                <div
                  key={conversationIdentity}
                  role="button"
                  tabIndex={isIosViewport ? -1 : 0}
                  onTouchStart={handleConversationTouchStart}
                  onTouchMove={handleConversationTouchMove}
                  onTouchEnd={(event) => {
                    const start = conversationListTouchRef.current;
                    conversationListTouchRef.current = null;
                    if (!start || start.moved || shouldSuppressConversationOpen()) {
                      conversationListSuppressClickUntilRef.current = Date.now() + 320;
                      return;
                    }
                    event.preventDefault();
                    conversationListLastTouchOpenAtRef.current = Date.now();
                    event.currentTarget.blur();
                    openConversationItem(item);
                  }}
                  onClick={(event) => {
                    if (Date.now() - conversationListLastTouchOpenAtRef.current < 700) {
                      event.preventDefault();
                      return;
                    }
                    if (shouldSuppressConversationOpen()) {
                      event.preventDefault();
                      return;
                    }
                    if (isIosViewport) {
                      event.currentTarget.blur();
                    }
                    openConversationItem(item);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    openConversationItem(item);
                  }}
                  onTouchCancel={() => {
                    conversationListTouchRef.current = null;
                    conversationListSuppressClickUntilRef.current = Date.now() + 900;
                  }}
                  className={`ios-conversation-row min-h-[76px] w-full cursor-pointer select-none border-b px-4 py-3.5 text-left transition touch-pan-y outline-none [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] [-webkit-user-select:none] focus-visible:ring-2 focus-visible:ring-re7-sky/70 max-[1440px]:min-h-[68px] max-[1440px]:px-3 max-[1440px]:py-2.5 max-[1280px]:px-2.5 ${
                    isVisuallyActive
                      ? "theme-conversation-row-active border-l-4 border-l-re7-sky border-b-white/10"
                      : `border-l-4 border-l-transparent border-b-white/10 ${
                          index % 2 === 0
                            ? "theme-conversation-row-even"
                            : "theme-conversation-row-odd"
                        }`
                  }`}
                >
                  <div className="flex min-w-0 items-start justify-between gap-2 overflow-hidden">
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span
                          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border p-0.5 max-[1440px]:h-5 max-[1440px]:w-5 ${getConversationChannelBadgeClass(item)}`}
                          title={getConversationChannelLabel(item)}
                          aria-label={getConversationChannelLabel(item)}
                        >
                          <ConversationChannelLogo item={item} className="h-full w-full" />
                        </span>
                        <p className={`min-w-0 truncate text-sm font-semibold ${isVisuallyActive || unread ? "text-white" : "text-white/90"}`}>
                          {label}
                        </p>
                        {isBusinessTenant && leadTemperatureLabel ? (
                          <span className={`max-w-20 shrink-0 truncate rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${getLeadTemperatureClass(item)}`}>
                            {leadTemperatureLabel}
                          </span>
                        ) : null}
                      </div>
                      {phoneLine ? (
                        <p className={`mt-0.5 truncate text-xs ${isVisuallyActive ? "text-white/75" : "text-white/55"}`}>
                          {phoneLine}
                        </p>
                      ) : null}
                    </div>
                    <span className={`max-w-24 shrink-0 truncate whitespace-nowrap text-right text-[11px] max-[1440px]:max-w-20 max-[1440px]:text-[10px] ${isVisuallyActive ? "text-white/70" : "text-white/45"}`}>
                      {formatDateTime(item.updatedAt)}
                    </span>
                  </div>
                  <div className={`mt-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-[11px] max-[1440px]:mt-1.5 max-[1440px]:gap-1.5 max-[1440px]:text-[10px] ${isVisuallyActive ? "text-white/78" : "text-white/58"}`}>
                    <div className="flex min-w-0 items-center gap-2 overflow-hidden max-[1440px]:gap-1.5">
                      <span
                        className={`max-w-24 shrink-0 truncate whitespace-nowrap rounded-full px-2 py-0.5 max-[1440px]:max-w-20 max-[1440px]:px-1.5 ${getConversationStatusClassForItem(item)}`}
                        title={getConversationStatusLabelForItem(item)}
                      >
                        {getConversationStatusLabelForItem(item)}
                      </span>
                      <span className="min-w-0 truncate" title={item.departmentName || "Sem setor"}>
                        {item.departmentName || "Sem setor"}
                      </span>
                      {assignmentLabel ? (
                        <span
                          className={`max-w-28 shrink truncate rounded-full border px-2 py-0.5 text-[10px] font-semibold max-[1440px]:max-w-20 ${getConversationAssignmentBadgeClass(
                            assignedToCurrentUser,
                            isVisuallyActive
                          )}`}
                          title={assignmentLabel}
                        >
                          {assignmentLabel}
                        </span>
                      ) : null}
                      {operationalDurationLabel ? (
                        <span
                          className="max-w-24 shrink-0 truncate whitespace-nowrap text-[10px] uppercase tracking-[0.08em] text-white/42 max-[1440px]:max-w-16"
                          title={operationalDurationLabel}
                        >
                          {operationalDurationLabel}
                        </span>
                      ) : null}
                    </div>
                    {unread ? (
                      <span
                        className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#20b15a] px-1 text-[10px] font-bold leading-none text-white shadow-[0_0_0_2px_rgba(32,177,90,0.2)]"
                        aria-label={`${unreadCount} mensagem não lida`}
                      >
                        {unreadCount}
                      </span>
                    ) : null}
                  </div>
                  <p className={`mt-2 line-clamp-2 text-sm leading-5 max-[1440px]:mt-1.5 max-[1440px]:text-xs max-[1440px]:leading-4 ${isVisuallyActive ? "text-white/88" : "text-white/68"}`}>
                    {getConversationPreviewText(item)}
                  </p>
                </div>
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

        <div className={`relative min-h-0 min-w-0 max-w-full flex-col overflow-hidden bg-[#eadfcd] ${selectedConversationKey ? "flex" : "max-md:hidden md:flex"}`}>
          <header className={`min-h-16 shrink-0 items-center justify-between gap-3 border-b border-black/8 px-4 py-3 max-[1440px]:min-h-14 max-[1440px]:px-3 max-[1440px]:py-2 max-[1280px]:gap-2 max-md:sticky max-md:top-0 max-md:z-30 max-md:min-h-14 max-md:bg-[#efe6d7]/95 max-md:backdrop-blur [@media(max-height:760px)]:min-h-12 [@media(max-height:760px)]:py-1.5 ${isMobileKeyboardOpen ? "hidden md:flex" : "flex"}`}>
            <button
              type="button"
              onClick={clearSelectedConversation}
              className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#d4c7b5] bg-white/70 text-lg text-slate-800 shadow-sm max-md:flex"
              aria-label="Voltar para a lista de conversas"
              title="Voltar"
            >
              ←
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="truncate text-base font-semibold text-slate-900 max-[1440px]:text-sm">
                  {selectedConversation
                    ? getConversationLabel(selectedConversation)
                    : "Atendimento"}
                </h2>
                {selectedConversation ? (
                  <span
                    className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border p-0.5 max-[1440px]:h-6 max-[1440px]:w-6 max-md:h-6 max-md:w-6 ${getConversationChannelBadgeClass(selectedConversation)}`}
                    title={getConversationChannelLabel(selectedConversation)}
                    aria-label={getConversationChannelLabel(selectedConversation)}
                  >
                    <ConversationChannelLogo item={selectedConversation} className="h-full w-full" />
                  </span>
                ) : null}
                {isBusinessTenant && selectedConversation && getLeadTemperatureLabel(selectedConversation) ? (
                  <span className={`shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold max-[1440px]:px-1.5 max-[1440px]:text-[10px] max-md:hidden ${getLeadTemperatureClass(selectedConversation)}`}>
                    {getLeadTemperatureLabel(selectedConversation)}
                  </span>
                ) : null}
              </div>
              {selectedConversation ? (
                <p className="mt-0.5 truncate text-sm text-slate-600 max-[1440px]:text-xs">
                  {getConversationModeLabel(selectedConversation)}
                  {" • "}
                  {getConversationStatusLabelForItem(selectedConversation)}
	                  {getConversationAssignmentLabel(selectedConversation, session.user.id)
	                    ? ` • ${getConversationAssignmentLabel(selectedConversation, session.user.id)}`
	                    : ""}
	                  {selectedConversation.protocol ? ` • Protocolo ${selectedConversation.protocol}` : ""}
	                  {getConversationOperationalDurationLabel(selectedConversation)
	                    ? ` • ${getConversationOperationalDurationLabel(selectedConversation)}`
	                    : ""}
	                </p>
	              ) : null}
              {selectedConversation?.continuation ? (
                <div className="mt-2 inline-flex max-w-full items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 shadow-sm">
                  <span className="shrink-0" aria-hidden="true">↳</span>
                  <span className="min-w-0 truncate">
                    Continuação do protocolo {selectedConversation.continuation.protocol}
                    {selectedConversation.continuation.linkedAt
                      ? ` • vinculada em ${formatDateTime(selectedConversation.continuation.linkedAt)}`
                      : ""}
                  </span>
                </div>
              ) : null}
            </div>
            <div className="relative hidden shrink-0 items-center gap-1.5 max-md:flex">
              <button
                type="button"
                title="Abrir CRM"
                aria-label="Abrir CRM da conversa"
                disabled={!selectedConversation}
                onClick={() => setShowMobileCrm(true)}
                className="h-10 rounded-xl border border-[#d4c7b5] bg-white/75 px-3 text-xs font-semibold text-slate-800 shadow-sm hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                CRM
              </button>
              <button
                type="button"
                title="Ações da conversa"
                aria-label="Abrir ações da conversa"
                disabled={!selectedConversation}
                onClick={() => setShowMoreActions((current) => !current)}
                className="h-10 rounded-xl border border-[#d4c7b5] bg-white/75 px-3 text-xs font-semibold text-slate-800 shadow-sm hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Ações
              </button>
              {showMoreActions && selectedConversation ? (
                <div className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-[#d4c7b5] bg-white text-sm text-slate-800 shadow-2xl">
                  {selectedConversation.assignedUserId === session.user.id ? (
                    <>
                      <button
                        type="button"
                        className="block w-full px-4 py-3 text-left font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!selectedConversationWaId || Boolean(conversationAction)}
                        onClick={() => {
                          setShowMoreActions(false);
                          void handleReleaseConversation();
                        }}
                      >
                        {conversationAction === "release" ? "Liberando..." : "Liberar para automação"}
                      </button>
                      <button
                        type="button"
                        className="block w-full px-4 py-3 text-left font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!selectedConversationWaId || Boolean(conversationAction)}
                        onClick={() => {
                          setShowMoreActions(false);
                          void handleReleaseConversationToGeneral();
                        }}
                      >
                        {conversationAction === "release-general"
                          ? "Liberando..."
                          : "Devolver para fila atual"}
                      </button>
                      <button
                        type="button"
                        className="block w-full px-4 py-3 text-left font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!selectedConversationWaId || Boolean(conversationAction)}
                        onClick={() => {
                          setShowMoreActions(false);
                          void handleCloseConversationToGeneral();
                        }}
                      >
                        {conversationAction === "close-general"
                          ? "Finalizando..."
                          : "Encerrar atendimento"}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="block w-full px-4 py-3 text-left font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={
                        !selectedConversationWaId ||
                        Boolean(conversationAction) ||
                        isSelectedConversationLocked
                      }
                      onClick={() => {
                        setShowMoreActions(false);
                        void handleClaimConversation();
                      }}
                    >
                      {conversationAction === "claim" ? "Assumindo..." : "Assumir conversa"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="block w-full px-4 py-3 text-left font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!selectedConversation}
                    onClick={() => {
                      markConversationIdentitiesAsUnread(
                        getConversationIdentityCandidates(selectedConversation),
                        selectedConversation.waId
                      );
                      clearSelectedConversation();
                      setUnreadSeparatorIndex(null);
                      setUnreadAnchorMessageIdentity(null);
                      setShowMoreActions(false);
                    }}
                  >
                    Marcar como não lida
                  </button>
                </div>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2 max-[1440px]:gap-1.5 max-md:hidden">
              {isAdminUser ? (
                <button
                  type="button"
                  title="Privacidade"
                  aria-label="Abrir privacidade da conversa"
                  disabled={!selectedConversation}
                  onClick={() => {
                    if (!selectedConversation) return;
                    router.push(
                      `/app/settings/privacy?conversationId=${encodeURIComponent(
                        selectedConversation.waIdCanonical ?? selectedConversation.waId
                      )}`
                    );
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#d4c7b5] bg-white/55 text-base text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 max-[1366px]:h-8 max-[1366px]:w-8 max-md:h-10 max-md:w-10"
                >
                  🔒
                </button>
              ) : null}
              {selectedConversation?.assignedUserId === session.user.id ? (
                <>
                  <button
                    type="button"
                    title="Liberar pra Automação"
                    aria-label="Liberar conversa para automação"
                    disabled={!selectedConversationWaId || Boolean(conversationAction)}
                    onClick={handleReleaseConversation}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#d4c7b5] bg-white/70 text-base text-slate-800 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 max-[1366px]:h-8 max-[1366px]:w-8 max-md:h-10 max-md:w-10"
                  >
                    {conversationAction === "release" ? "…" : "🤖"}
                  </button>
                  <button
                    type="button"
                    title="Devolver para fila atual"
                    aria-label="Devolver conversa para fila atual"
                    disabled={!selectedConversationWaId || Boolean(conversationAction)}
                    onClick={handleReleaseConversationToGeneral}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-50 text-base text-emerald-900 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 max-[1366px]:h-8 max-[1366px]:w-8 max-md:h-10 max-md:w-10"
                  >
                    {conversationAction === "release-general" ? "…" : "🎧"}
                  </button>
                  <button
                    type="button"
                    title="Encerrar atendimento"
                    aria-label="Encerrar atendimento"
                    disabled={!selectedConversationWaId || Boolean(conversationAction)}
                    onClick={handleCloseConversationToGeneral}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-50 text-base text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 max-[1366px]:h-8 max-[1366px]:w-8 max-md:h-10 max-md:w-10"
                  >
                    {conversationAction === "close-general" ? "…" : "🏁"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  title="Assumir conversa"
                  aria-label="Assumir conversa"
                  disabled={
                    !selectedConversationWaId ||
                    Boolean(conversationAction) ||
                    isSelectedConversationLocked
                  }
                  onClick={handleClaimConversation}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#d4c7b5] bg-white/70 text-base text-slate-800 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 max-[1366px]:h-8 max-[1366px]:w-8 max-md:h-10 max-md:w-10"
                >
                  {conversationAction === "claim" ? "…" : "✓"}
                </button>
              )}
              <button
                type="button"
                title="Marcar como não lida"
                aria-label="Marcar conversa como não lida"
                disabled={!selectedConversation}
                onClick={() => {
                  if (!selectedConversation) return;
                  markConversationIdentitiesAsUnread(
                    getConversationIdentityCandidates(selectedConversation),
                    selectedConversation.waId
                  );
                  clearSelectedConversation();
                  setUnreadSeparatorIndex(null);
                  setUnreadAnchorMessageIdentity(null);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#d4c7b5] bg-white/55 text-base text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 max-[1366px]:h-8 max-[1366px]:w-8 max-md:h-10 max-md:w-10"
              >
                ✉
              </button>
              <button
                type="button"
                title="Mais ações"
                aria-label="Mostrar mais ações"
                disabled={!selectedConversation}
                onClick={() => setShowMoreActions((current) => !current)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#d4c7b5] bg-white/55 text-base text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 max-[1366px]:h-8 max-[1366px]:w-8 max-md:h-10 max-md:w-10"
              >
                ⋯
              </button>
            </div>
          </header>

          <div className={`border-b border-black/8 bg-[#efe6d7] px-3 py-2 max-[1366px]:px-2 max-[1366px]:py-1.5 max-md:px-2 max-md:py-2 [@media(max-height:760px)]:py-1 ${isMobileKeyboardOpen ? "hidden md:block" : "block"}`}>
            <div className="grid grid-cols-[168px_minmax(0,1fr)_minmax(0,1fr)] items-end gap-2 max-[1366px]:grid-cols-[140px_minmax(0,1fr)_minmax(0,1fr)] max-[1366px]:gap-1.5 max-md:grid-cols-1">
              <div className="rounded-2xl border border-[#dccfbe] bg-white/55 px-2 py-2 max-[1366px]:rounded-xl max-[1366px]:px-1.5 max-[1366px]:py-1.5 [@media(max-height:760px)]:py-1">
                <select
                  value={statusActionDraft}
                  onChange={async (event) => {
                    const nextStatus = event.target.value as ConversationOperationalStatus | "";
                    setStatusActionDraft(nextStatus);
                    if (!nextStatus) return;
                    await handleUpdateConversationStatus(nextStatus);
                  }}
                  disabled={!canManageSelectedConversation || Boolean(conversationAction)}
                  className="w-full rounded-xl border border-[#e1d4c2] bg-white px-2.5 py-1.5 text-[13px] text-slate-900 shadow-sm disabled:cursor-not-allowed disabled:opacity-50 max-[1366px]:px-2 max-[1366px]:py-1 max-[1366px]:text-xs [@media(max-height:760px)]:py-0.5"
                >
                  <option value="" disabled>
                    Situação
                  </option>
                  {CONVERSATION_FILTERS.filter((item) =>
                    ["WAITING", "IN_PROGRESS", "WAITING_USER", "CLOSED"].includes(item.value)
                  ).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-0 rounded-2xl border border-[#dccfbe] bg-white/55 px-2 py-2 max-[1366px]:rounded-xl max-[1366px]:px-1.5 max-[1366px]:py-1.5 [@media(max-height:760px)]:py-1">
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <select
                    value={transferUserId}
                    onChange={(event) => setTransferUserId(event.target.value)}
                    disabled={!canTransferSelectedConversation || users.length === 0 || Boolean(conversationAction)}
                    className="min-w-0 flex-1 rounded-xl border border-[#e1d4c2] bg-white px-2.5 py-1.5 text-[13px] text-slate-900 shadow-sm disabled:cursor-not-allowed disabled:opacity-50 max-[1366px]:px-2 max-[1366px]:py-1 max-[1366px]:text-xs [@media(max-height:760px)]:py-0.5"
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
                    className="shrink-0 whitespace-nowrap rounded-xl border border-[#e1d4c2] bg-white px-2.5 py-1.5 text-[13px] text-slate-800 shadow-sm hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 max-[1366px]:px-2 max-[1366px]:py-1 max-[1366px]:text-xs [@media(max-height:760px)]:py-0.5"
                  >
                    {conversationAction === "transfer" ? "Transferindo..." : "Transferir"}
                  </button>
                </div>
              </div>
              <div className="min-w-0 rounded-2xl border border-[#dccfbe] bg-white/55 px-2 py-2 max-[1366px]:rounded-xl max-[1366px]:px-1.5 max-[1366px]:py-1.5 [@media(max-height:760px)]:py-1">
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <select
                    value={transferDepartmentId}
                    onChange={(event) => setTransferDepartmentId(event.target.value)}
                    disabled={
                      !canTransferDepartment ||
                      transferDepartmentOptions.length === 0 ||
                      Boolean(conversationAction)
                    }
                    className="min-w-0 flex-1 rounded-xl border border-[#e1d4c2] bg-white px-2.5 py-1.5 text-[13px] text-slate-900 shadow-sm disabled:cursor-not-allowed disabled:opacity-50 max-[1366px]:px-2 max-[1366px]:py-1 max-[1366px]:text-xs [@media(max-height:760px)]:py-0.5 [&>option]:bg-white [&>option]:text-slate-900"
                  >
                    <option value="">
                      {selectedConversation?.departmentName || "Setor"}
                    </option>
                    {transferDepartmentOptions.map((department) => (
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
                    className="shrink-0 whitespace-nowrap rounded-xl border border-[#e1d4c2] bg-white px-2.5 py-1.5 text-[13px] text-slate-800 shadow-sm hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 max-[1366px]:px-2 max-[1366px]:py-1 max-[1366px]:text-xs [@media(max-height:760px)]:py-0.5"
                  >
                    {conversationAction === "transfer-department" ? "Movendo..." : "Mover"}
                  </button>
                </div>
              </div>
            </div>
            {showMoreActions ? (
              <p className="mt-2 text-xs text-slate-600 max-md:hidden">
                {selectedConversation?.assignedAt
                  ? `Atendimento em andamento desde ${formatDateTime(selectedConversation.assignedAt)}.`
                  : "Ajuste situação, atendente e setor conforme o andamento do atendimento."}
              </p>
            ) : null}
          </div>

          <div ref={timelineRef} className="wa-chat-canvas min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 scroll-pb-28 max-[1366px]:px-3 max-[1366px]:py-3 max-md:px-3 max-md:pb-3 max-md:pt-3 max-md:scroll-pb-3 [@media(max-height:760px)]:pt-2">
            {!selectedConversationWaId ? (
              <div className="flex h-full min-h-[260px] items-center justify-center">
                <div className="max-w-sm rounded-2xl border border-black/8 bg-white/50 px-6 py-5 text-center shadow-sm">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm">
                    ☰
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-900">
                    Selecione uma conversa
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    O histórico e as ações do atendimento aparecem aqui.
                  </p>
                </div>
              </div>
            ) : null}
            {selectedConversationWaId && isHydratingSelectedTimeline ? (
              <div className="space-y-3">
                {[0, 1, 2].map((item) => (
                  <div key={item} className={`flex ${item % 2 === 0 ? "justify-start" : "justify-end"}`}>
                    <div className="h-16 w-64 animate-pulse rounded-2xl bg-white/45 shadow-sm" />
                  </div>
                ))}
              </div>
            ) : null}
            {selectedConversationWaId && isRefreshingSelectedTimeline ? (
              <p className="text-sm text-slate-700/80">Atualizando mensagens...</p>
            ) : null}
            {isTimelineOutOfSync ? (
              <p className="text-sm text-slate-700/80">Preparando mensagens...</p>
            ) : null}
            {selectedConversationWaId &&
            !loadingMessages &&
            messages.length === 0 &&
            messagesConversationKey === selectedConversationKey ? (
              <p className="text-sm text-slate-700/80">Sem mensagens para esta conversa.</p>
            ) : null}
            <div className="space-y-3">
              {messages.map((item, index) => {
                const messageIdentity = getMessageIdentity(item);
                const statusTicks = renderMessageStatusTicks(item);
                const shouldAutoLoadMedia = index >= Math.max(messages.length - 8, 0);
                const replyOption = buildReplyTarget(item);
                const internalMessageId = getMessageReplyId(item);
                const isHighlightedReference =
                  Boolean(internalMessageId) && highlightedReferenceId === internalMessageId;
                const isUnreadAnchor = unreadAnchorMessageIdentity
                  ? unreadAnchorMessageIdentity === messageIdentity
                  : unreadSeparatorIndex === index;
                const senderLabel =
                  item.direction === "INBOUND"
                    ? selectedConversation
                      ? getConversationLabel(selectedConversation)
                      : null
                    : item.actor?.source === "human_inbox"
                      ? item.actor.displayName
                      : null;
                const messageActions =
                  replyOption && composerEnabled
                    ? [
                        {
                          id: "mark",
                          label: "Marcar mensagem",
                          onSelect: () => {
                            setReplyTarget(replyOption);
                            setOpenMessageActionsId(null);
                            focusComposer();
                          },
                        },
                      ]
                    : [];
                const hasMessageActions = messageActions.length > 0;
                const messageActionsOpen = openMessageActionsId === messageIdentity;
                return (
                  <Fragment key={messageIdentity}>
                    {isUnreadAnchor ? (
                      <div
                        data-unread-anchor="true"
                        className="flex items-center gap-3 py-1"
                        aria-label="Mensagens não lidas"
                      >
                        <span className="h-px flex-1 bg-emerald-500/35" />
                        <span className="rounded-full border border-emerald-500/35 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                          Mensagens não lidas
                        </span>
                        <span className="h-px flex-1 bg-emerald-500/35" />
                      </div>
                    ) : null}
                    <div
                      data-message-index={index}
                      data-internal-message-id={internalMessageId ?? undefined}
                      className={`flex ${item.direction === "INBOUND" ? "justify-start" : "justify-end"}`}
                    >
                      <article
                        className={`wa-bubble relative transition ${
                          item.direction === "INBOUND" ? "wa-bubble-inbound" : "wa-bubble-outbound"
                        } ${hasMessageActions ? "pr-9" : ""} ${item.media?.kind === "audio" ? "min-w-[19rem]" : ""} ${
                          isHighlightedReference ? "ring-2 ring-amber-400 ring-offset-2 ring-offset-[#efe6d7]" : ""
                        }`}
                      >
                        {hasMessageActions ? (
                          <div
                            className="absolute right-1.5 top-1.5 z-20"
                            data-message-actions-root="true"
                          >
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setOpenMessageActionsId((current) =>
                                  current === messageIdentity ? null : messageIdentity
                                );
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "ArrowDown") {
                                  event.preventDefault();
                                  setOpenMessageActionsId(messageIdentity);
                                }
                              }}
                              className={`message-actions-trigger inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300/60 bg-white/65 text-slate-600 shadow-sm transition hover:bg-white hover:text-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 ${
                                messageActionsOpen ? "opacity-100" : ""
                              }`}
                              title="Ações da mensagem"
                              aria-label="Ações da mensagem"
                              aria-haspopup="menu"
                              aria-expanded={messageActionsOpen}
                            >
                              <svg
                                aria-hidden="true"
                                viewBox="0 0 24 24"
                                className="h-3.5 w-3.5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="m6 9 6 6 6-6" />
                              </svg>
                            </button>
                            {messageActionsOpen ? (
                              <div
                                role="menu"
                                aria-label="Ações da mensagem"
                                className={`absolute top-7 z-50 min-w-44 rounded-lg border border-slate-200 bg-white p-1 text-sm text-slate-800 shadow-xl ${
                                  item.direction === "INBOUND" ? "left-0" : "right-0"
                                }`}
                              >
                                {messageActions.map((action) => (
                                  <button
                                    key={action.id}
                                    type="button"
                                    role="menuitem"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      action.onSelect();
                                    }}
                                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left font-medium transition hover:bg-slate-100 focus:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
                                  >
                                    <svg
                                      aria-hidden="true"
                                      viewBox="0 0 24 24"
                                      className="h-4 w-4 text-slate-500"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <path d="m9 14-5-5 5-5" />
                                      <path d="M4 9h10a6 6 0 0 1 6 6v1" />
                                    </svg>
                                    <span>{action.label}</span>
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        {item.replyTo ? (
                          <button
                            type="button"
                            onClick={() => handleReferenceNavigation(item.replyTo?.id ?? "")}
                            className="mb-2 block w-full rounded-lg border-l-4 border-emerald-500/60 bg-white/55 px-3 py-2 text-left text-xs text-slate-700 transition hover:bg-white/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
                            title="Ir para a mensagem marcada"
                          >
                            <p className="font-semibold text-slate-800">
                              Referencia
                            </p>
                            <MessageReferencePreview session={session} waId={selectedConversationWaId} item={item} />
                          </button>
                        ) : null}
                        {senderLabel ? (
                          <p className="mb-1 text-[11px] font-medium leading-none text-slate-500">
                            {senderLabel}
                          </p>
                        ) : null}
                        {getMessageBodyTextForDisplay(item) ? (
                          <p className="wa-bubble-text text-sm leading-relaxed">
                            {getMessageBodyTextForDisplay(item)}
                          </p>
                        ) : item.media || item.location ? null : isUnsupportedMessage(item) ? (
                          <div className="rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                            <p className="font-semibold">Mensagem não suportada</p>
                            <p className="mt-1 text-xs leading-relaxed">
                              O WhatsApp informou que este tipo de mensagem não está disponível para visualização.
                            </p>
                          </div>
                        ) : (
                          <p className="text-sm italic text-slate-700">{getMessageContentLabel(item)}</p>
                        )}
                        {item.location ? <LocationBubble location={item.location} /> : null}
                        {item.media ? (
                          <MediaBubble
                            session={session}
                            waId={selectedConversationWaId}
                            item={item}
                            autoLoad={shouldAutoLoadMedia}
                          />
                        ) : null}
                        {item.templateName ? (
                          <div className="wa-bubble-meta mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                            <span className="rounded-full border border-emerald-500/25 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-800">
                              Modelo
                            </span>
                            <span>Modelo: {item.templateName}</span>
                          </div>
                        ) : null}
	                        <div className="mt-2 flex items-center justify-end gap-1.5 text-[11px] text-slate-600">
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
            <div className={`pointer-events-none absolute inset-x-0 bottom-[calc(6.25rem+var(--safe-bottom-effective))] flex justify-center px-4 ${isMobileKeyboardOpen ? "max-md:bottom-[4.75rem]" : "max-md:bottom-[calc(7.5rem+var(--safe-bottom-effective))]"}`}>
              <button
                type="button"
                onClick={handleJumpToLatest}
              className="pointer-events-auto whitespace-nowrap rounded-full border border-[#d4c7b5] bg-white/92 px-4 py-2 text-sm font-medium text-slate-800 shadow-md transition hover:bg-white max-[1440px]:px-3 max-[1440px]:py-1.5 max-[1440px]:text-xs"
              >
                Ir para a mais recente
              </button>
            </div>
          ) : null}

          <div className={`ios-keyboard-composer sticky bottom-0 z-20 shrink-0 border-t border-black/8 bg-[#efe6d7] px-4 py-3 max-[1366px]:px-3 max-[1366px]:py-2 max-md:px-2.5 max-md:pt-2 [@media(max-height:760px)]:pt-1.5 ${isMobileKeyboardOpen ? "max-md:pb-2" : "max-md:pb-[calc(1.6rem+var(--safe-bottom-effective))]"}`}>
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
            {selectedConversation && !selectedConversationSupportsOutbound ? (
              <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-900">
                {selectedConversationOutboundDisabledMessage}
              </div>
            ) : null}
            {replyTarget ? (
              <div
                className="mb-2 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-950"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    Mensagem marcada
                  </p>
                  <p className="mt-0.5 line-clamp-2 break-words">{replyTarget.preview}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyTarget(null)}
                  className="shrink-0 rounded-full px-2 py-0.5 text-sm font-bold text-emerald-900 hover:bg-emerald-100"
                  aria-label="Remover mensagem marcada"
                  title="Remover mensagem marcada"
                >
                  ×
                </button>
              </div>
            ) : null}
            <div className="relative flex items-center gap-2 max-[1440px]:gap-1.5">
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
                disabled={
                  !selectedConversationWaId ||
                  !composerEnabled ||
                  !selectedConversationSupportsMediaOutbound ||
                  isHydratingSelectedTimeline
                }
              />
              <button
                type="button"
                disabled={
                  !selectedConversationWaId ||
                  !composerEnabled ||
                  !selectedConversationSupportsMediaOutbound ||
                  isHydratingSelectedTimeline
                }
                onClick={() => mediaInputRef.current?.click()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#d4c7b5] bg-white text-lg text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 max-[1366px]:h-9 max-[1366px]:w-9 max-[1366px]:rounded-xl max-md:h-11 max-md:w-11"
              >
                +
              </button>
              <button
                type="button"
                disabled={!selectedConversationWaId || !composerEnabled || isHydratingSelectedTimeline}
                onClick={() => setShowEmojiPicker((current) => !current)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#d4c7b5] bg-white text-lg text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 max-[1366px]:h-9 max-[1366px]:w-9 max-[1366px]:rounded-xl max-md:hidden"
              >
                😊
              </button>
              <button
                type="button"
                disabled={
                  !selectedConversationWaId ||
                  !templateComposerEnabled ||
                  isHydratingSelectedTimeline ||
                  sendingTemplate
                }
                onClick={handleOpenTemplateModal}
                title="Enviar modelo aprovado"
                aria-label="Enviar modelo aprovado"
                className="flex h-10 shrink-0 items-center justify-center rounded-2xl border border-[#d4c7b5] bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 max-[1366px]:h-9 max-[1366px]:rounded-xl max-[1366px]:px-2.5 max-[1366px]:text-xs max-md:h-11"
              >
                Modelo
              </button>
              <button
                type="button"
                disabled={
                  !selectedConversationWaId ||
                  !templateComposerEnabled ||
                  isHydratingSelectedTimeline ||
                  sendingCannedReply
                }
                onClick={handleOpenCannedModal}
                title="Usar mensagem pronta"
                aria-label="Usar mensagem pronta"
                className="flex h-10 shrink-0 items-center justify-center rounded-2xl border border-[#d4c7b5] bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 max-[1366px]:h-9 max-[1366px]:rounded-xl max-[1366px]:px-2.5 max-[1366px]:text-xs max-md:h-11"
              >
                Prontas
              </button>
              <button
                type="button"
                disabled={
                  !selectedConversationWaId ||
                  !composerEnabled ||
                  !selectedConversationSupportsMediaOutbound ||
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
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border text-lg transition disabled:cursor-not-allowed disabled:opacity-50 max-[1366px]:h-9 max-[1366px]:w-9 max-[1366px]:rounded-xl max-md:h-11 max-md:w-11 ${
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
                  className="h-20 min-h-20 w-full resize-none rounded-2xl border border-[#d4c7b5] bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-[#7cbf69] max-[1366px]:h-16 max-[1366px]:min-h-16 max-[1366px]:rounded-xl max-[1366px]:px-3 max-[1366px]:py-2 max-md:h-12 max-md:min-h-12 max-md:px-3 max-md:py-2 [@media(max-height:760px)]:h-14 [@media(max-height:760px)]:min-h-14"
                  value={messageDraft}
                  onChange={(event) => setMessageDraft(event.target.value)}
                  onFocus={handleComposerFocus}
                  onBlur={stabilizeMobileConversationViewport}
                  onKeyDown={handleComposerKeyDown}
                  autoCorrect="off"
                  autoCapitalize="sentences"
                  spellCheck={false}
                  placeholder={
                    selectedConversation && !selectedConversationSupportsOutbound
                      ? selectedConversationOutboundDisabledMessage
                      : canReply
                      ? isHydratingSelectedTimeline
                        ? "Carregando mensagens..."
                        : "Digite uma mensagem"
                      : "Assuma a conversa para responder"
                  }
                  disabled={!selectedConversationWaId || !composerEnabled}
                />
              </label>
              <button
                type="button"
                disabled={
                  !selectedConversationWaId ||
                  (!messageDraft.trim() && !selectedMediaFile) ||
                  (Boolean(selectedMediaFile) && !selectedConversationSupportsMediaOutbound) ||
                  !composerEnabled ||
                  isHydratingSelectedTimeline ||
                  sendingMessage
                }
                onClick={handlePrimarySend}
                className="h-10 shrink-0 whitespace-nowrap rounded-2xl bg-[#20b15a] px-3.5 text-sm font-semibold text-white shadow-sm hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 max-[1366px]:h-9 max-[1366px]:rounded-xl max-[1366px]:px-3 max-[1366px]:text-xs max-md:h-11 max-md:px-4"
              >
                Enviar
              </button>
            </div>
          </div>
        </div>

        <aside className={`${showMobileCrm ? "fixed inset-0 z-40 flex pt-[var(--safe-top)]" : "hidden"} min-h-0 flex-col border-l border-white/10 bg-[#0c1930] md:static md:z-auto md:flex md:pt-0`}>
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2 max-[1440px]:gap-2 max-[1440px]:px-2.5 max-[1440px]:py-1.5">
            <h2 className="text-sm font-semibold text-white">CRM</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                title="Ver histórico"
                aria-label="Ver histórico do contato"
                disabled={!selectedConversation}
                onClick={handleOpenContactTimeline}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-white/15 bg-white/8 px-2.5 py-1.5 text-xs font-medium text-white/85 hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-50 max-[1440px]:px-2 max-[1440px]:text-[11px]"
              >
                <span aria-hidden="true">◷</span>
                Histórico
              </button>
              <button
                type="button"
                className="hidden rounded-xl border border-white/15 bg-white/8 px-2.5 py-1.5 text-xs font-semibold text-white/85 hover:bg-white/12 max-md:inline-flex"
                onClick={() => setShowMobileCrm(false)}
              >
                Fechar
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {!selectedLead ? (
              <p className="px-4 py-4 text-sm text-white/70">
                Esta conversa ainda não tem cadastro de contato.
              </p>
            ) : (
              <>
                {selectedSuggestedReply ? (
                  <section className="relative z-30 flex justify-end border-b border-white/10 px-3 py-3">
                    <div className="group relative inline-flex justify-end">
                      <button
                        type="button"
                        onClick={handleUseSuggestedReply}
                        disabled={!canReply}
                        className="theme-suggestion-button rounded-xl border px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Usar sugestão de resposta
                      </button>
                      <div className="pointer-events-none absolute right-0 top-full z-[9999] mt-2 hidden w-72 rounded-xl border border-white/15 bg-[#101f3a] p-3 text-xs leading-relaxed text-white/90 shadow-2xl ring-1 ring-black/30 group-hover:block">
                        <p className="line-clamp-6 whitespace-pre-wrap">{selectedSuggestedReply}</p>
                      </div>
                    </div>
                  </section>
                ) : null}

                <section className="border-b border-white/10 px-3 py-3 max-[1440px]:px-2.5 max-[1440px]:py-2">
                  <div className="space-y-2 text-sm text-white/85">
                    <label className="grid">
                      <input
                        className="min-w-0 rounded-xl border border-white/15 bg-re7-navy/80 px-3 py-1.5 text-white outline-none focus:border-re7-sky disabled:cursor-not-allowed disabled:opacity-50 max-[1440px]:rounded-lg max-[1440px]:px-2.5 max-[1440px]:text-xs"
                        value={leadNameDraft}
                        onChange={(event) => setLeadNameDraft(event.target.value)}
                        onBlur={() => void handleSaveLeadDetails()}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            event.currentTarget.blur();
                          }
                        }}
                        placeholder="Nome"
                        disabled={!isSelectedConversationOwnedByCurrentUser || savingLeadName}
                      />
                    </label>
                    <label className="grid">
                      <input
                        className="min-w-0 rounded-xl border border-white/15 bg-re7-navy/80 px-3 py-1.5 text-white outline-none focus:border-re7-sky disabled:cursor-not-allowed disabled:opacity-50 max-[1440px]:rounded-lg max-[1440px]:px-2.5 max-[1440px]:text-xs"
                        value={leadEmailDraft}
                        onChange={(event) => setLeadEmailDraft(event.target.value)}
                        onBlur={() => void handleSaveLeadDetails()}
                        placeholder="email@empresa.com"
                        disabled={!isSelectedConversationOwnedByCurrentUser || savingLeadName}
                      />
                    </label>
                    <label className="grid">
                      <input
                        className="min-w-0 rounded-xl border border-white/15 bg-re7-navy/80 px-3 py-1.5 text-white outline-none focus:border-re7-sky disabled:cursor-not-allowed disabled:opacity-50 max-[1440px]:rounded-lg max-[1440px]:px-2.5 max-[1440px]:text-xs"
                        value={leadCompanyDraft}
                        onChange={(event) => setLeadCompanyDraft(event.target.value)}
                        onBlur={() => void handleSaveLeadDetails()}
                        placeholder="Empresa"
                        disabled={!isSelectedConversationOwnedByCurrentUser || savingLeadName}
                      />
                    </label>
                    {savingLeadName ? <p className="truncate text-xs text-white/60">Salvando...</p> : null}
                  </div>
                </section>

                <section className="border-b border-white/10 px-3 py-3 max-[1440px]:px-2.5 max-[1440px]:py-2">
                  <div className="space-y-2">
                    <select
                      className="w-full rounded-xl border border-white/15 bg-re7-navy/80 px-3 py-1.5 text-sm text-white outline-none focus:border-re7-sky disabled:cursor-not-allowed disabled:opacity-50 max-[1440px]:rounded-lg max-[1440px]:px-2.5 max-[1440px]:text-xs"
                      value={statusDraft}
                      onChange={(event) => void handleLeadStatusChange(event.target.value as LeadStatus)}
                      disabled={!isSelectedConversationOwnedByCurrentUser || savingLeadStatus}
                    >
                      <option value="" disabled>
                        Situação do negócio
                      </option>
                      {leadStatusOptions.map((status) => (
                        <option key={status.id} value={status.id}>
                          {status.label || getLeadStatusLabel(status.id, leadStatusOptions)}
                        </option>
                      ))}
                    </select>
                    {savingLeadStatus ? <p className="text-xs text-white/55">Salvando andamento...</p> : null}
                  </div>
                </section>

                <section className="border-b border-white/10 px-3 py-3 max-[1440px]:px-2.5 max-[1440px]:py-2">
                  <div className="space-y-2">
                    <textarea
                      className="min-h-20 w-full rounded-xl border border-white/15 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky max-[1440px]:min-h-16 max-[1440px]:rounded-lg max-[1440px]:px-2.5 max-[1440px]:py-1.5 max-[1440px]:text-xs"
                      value={noteDraft}
                      onChange={(event) => setNoteDraft(event.target.value)}
                      placeholder="Adicionar nota"
                      disabled={!isSelectedConversationOwnedByCurrentUser || savingLeadNote}
                    />
                    <button
                      type="button"
                      disabled={!noteDraft.trim() || savingLeadNote || !isSelectedConversationOwnedByCurrentUser}
                      onClick={handleAddLeadNote}
                      className="whitespace-nowrap rounded-xl bg-re7-orange px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 max-[1440px]:rounded-lg max-[1440px]:px-2.5 max-[1440px]:text-xs"
                    >
                      {savingLeadNote ? "Salvando..." : "Adicionar nota"}
                    </button>
                  </div>
                </section>

                <section className="px-3 py-3 max-[1440px]:px-2.5 max-[1440px]:py-2">
                  {loadingLeadNotes ? (
                    <p className="text-sm text-white/70">Carregando notas...</p>
                  ) : null}
                  {!loadingLeadNotes && leadNotes.length === 0 ? (
                    <p className="text-sm text-white/70">Nenhuma nota registrada.</p>
                  ) : null}
                  <div className="space-y-2">
                    {leadNotes.map((note) => (
                      <article key={note.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-white">{note.body}</p>
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
