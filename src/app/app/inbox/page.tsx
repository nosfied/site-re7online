"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import AppShell from "@/components/app/AppShell";
import { FeedbackToast } from "@/components/ui/FeedbackToast";
import {
  AppSession,
  claimAppConversation,
  clearAppSession,
  createAppLeadNote,
  fetchAppConversation,
  fetchAppConversations,
  fetchAppLeadNotes,
  fetchAppUsers,
  updateAppLead,
  loadAppSession,
  releaseAppConversation,
  saveAppSession,
  sendAppConversationMessage,
  transferAppConversation,
  updateAppConversationStatus,
  updateAppLeadStatus,
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

function getConversationLabel(item: InboxConversationItem) {
  return item.leadName || item.leadPhone || "Sem nome";
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

function getConversationIdentity(item: Pick<InboxConversationItem, "waId" | "waIdCanonical">) {
  return item.waIdCanonical ?? item.waId;
}

type InboxReadState = {
  lastReadAtByConversationKey: Record<string, string>;
  manuallyUnreadByConversationKey: Record<string, boolean>;
};

const EMPTY_READ_STATE: InboxReadState = {
  lastReadAtByConversationKey: {},
  manuallyUnreadByConversationKey: {},
};

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

function loadReadState(storageKey: string): InboxReadState {
  if (typeof window === "undefined") return EMPTY_READ_STATE;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return EMPTY_READ_STATE;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const lastReadAtByConversationKey =
      parsed && typeof parsed === "object"
        ? parsed.lastReadAtByConversationKey ?? parsed.lastReadAtByWaId ?? parsed.lastOpenedAtByWaId ?? {}
        : {};
    const manuallyUnreadByConversationKey =
      parsed && typeof parsed === "object" ? parsed.manuallyUnreadByConversationKey ?? {} : {};
    const normalizedReadState =
      lastReadAtByConversationKey && typeof lastReadAtByConversationKey === "object"
        ? Object.fromEntries(
            Object.entries(lastReadAtByConversationKey).filter(
              (entry): entry is [string, string] => typeof entry[1] === "string"
            )
          )
        : {};
    const normalizedUnreadOverrides =
      manuallyUnreadByConversationKey && typeof manuallyUnreadByConversationKey === "object"
        ? Object.fromEntries(
            Object.entries(manuallyUnreadByConversationKey).filter(
              (entry): entry is [string, boolean] => typeof entry[1] === "boolean"
            )
          )
        : {};
    return {
      lastReadAtByConversationKey: normalizedReadState,
      manuallyUnreadByConversationKey: normalizedUnreadOverrides,
    };
  } catch {
    return EMPTY_READ_STATE;
  }
}

function loadReadStateWithFallback(storageKey: string, legacyStorageKey?: string | null) {
  const current = loadReadState(storageKey);
  if (Object.keys(current.lastReadAtByConversationKey).length > 0) {
    return current;
  }
  if (!legacyStorageKey || typeof window === "undefined") {
    return current;
  }
  return loadReadState(legacyStorageKey);
}

function saveReadState(storageKey: string, state: InboxReadState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(state));
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
    };
  }
  if (normalized === "DELIVERED") {
    return {
      label: "✓✓",
      className: "text-slate-500",
      ariaLabel: "entregue",
    };
  }
  if (normalized === "SENT") {
    return {
      label: "✓",
      className: "text-slate-500",
      ariaLabel: "enviada",
    };
  }
  if (normalized === "FAILED") {
    return {
      label: "!",
      className: "text-red-600",
      ariaLabel: "falhou",
    };
  }
  return null;
}

function renderMessageStatusTicks(item: InboxMessageItem) {
  const ticks = getMessageStatusTicks(item);
  if (!ticks) return null;
  if (ticks.label === "!") {
    return (
      <span aria-label={ticks.ariaLabel} className={`font-semibold ${ticks.className}`}>
        !
      </span>
    );
  }

  const glyphs = ticks.label.split("");
  return (
    <span aria-label={ticks.ariaLabel} className={`inline-flex items-center ${ticks.className}`}>
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

function applyConversationOperationalPayload(
  item: InboxConversationItem,
  payload: {
    waId?: string | null;
    waIdCanonical?: string | null;
    mode: "BOT" | "HUMAN";
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
      return "Sem status";
  }
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
  const [leadNotes, setLeadNotes] = useState<LeadNoteItem[]>([]);
  const [statusDraft, setStatusDraft] = useState<LeadStatus | "">("");
  const [leadNameDraft, setLeadNameDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingLeadNotes, setLoadingLeadNotes] = useState(false);
  const [savingLeadStatus, setSavingLeadStatus] = useState(false);
  const [savingLeadName, setSavingLeadName] = useState(false);
  const [savingLeadNote, setSavingLeadNote] = useState(false);
  const [messageDraft, setMessageDraft] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [queuedMessageCount, setQueuedMessageCount] = useState(0);
  const [conversationAction, setConversationAction] = useState<string | null>(null);
  const [conversationFilter, setConversationFilter] = useState<ConversationFilter>("ALL");
  const [departmentFilter, setDepartmentFilter] = useState<DepartmentFilter>("ALL");
  const [statusActionDraft, setStatusActionDraft] = useState<ConversationOperationalStatus | "">("");
  const [transferUserId, setTransferUserId] = useState("");
  const [transferDepartmentId, setTransferDepartmentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [leadError, setLeadError] = useState<string | null>(null);
  const [readState, setReadState] = useState<InboxReadState>(EMPTY_READ_STATE);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollToBottomRef = useRef(false);
  const lastSelectedConversationKeyRef = useRef<string | null>(null);
  const lastMessageSignatureRef = useRef<string | null>(null);
  const outgoingQueueRef = useRef<PendingOutgoingMessage[]>([]);
  const processingOutgoingRef = useRef(false);
  const unreadStorageKey = useMemo(
    () => (session ? `wa_app_inbox_read_state_v2:${session.user.clientId}` : null),
    [session]
  );
  const legacyUnreadStorageKey = useMemo(
    () => (session ? `wa_app_inbox_read_state_v1:${session.user.clientId}` : null),
    [session]
  );

  const handleUnauthorized = useCallback(() => {
    clearAppSession();
    router.replace("/app/login");
  }, [router]);

  useEffect(() => {
    if (!error && !errorDetails && !success && !leadError) return;
    const timer = window.setTimeout(() => {
      setError(null);
      setErrorDetails(null);
      setSuccess(null);
      setLeadError(null);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [error, errorDetails, leadError, success]);

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

  useEffect(() => {
    if (!unreadStorageKey) return;
    setReadState(loadReadStateWithFallback(unreadStorageKey, legacyUnreadStorageKey));
  }, [legacyUnreadStorageKey, unreadStorageKey]);

  useEffect(() => {
    if (!unreadStorageKey) return;
    saveReadState(unreadStorageKey, readState);
  }, [readState, unreadStorageKey]);

  useEffect(() => {
    if (!unreadStorageKey) return;
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== unreadStorageKey && event.key !== legacyUnreadStorageKey) return;
      setReadState(loadReadStateWithFallback(unreadStorageKey, legacyUnreadStorageKey));
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [legacyUnreadStorageKey, unreadStorageKey]);

  const scrollTimelineToBottom = useCallback(() => {
    if (!timelineRef.current) return;
    timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
  }, []);

  const focusComposer = useCallback(() => {
    if (!composerRef.current) return;
    composerRef.current.focus();
    const caretPosition = composerRef.current.value.length;
    composerRef.current.setSelectionRange(caretPosition, caretPosition);
  }, []);

  const markConversationAsRead = useCallback((conversationKey: string, activityAt?: string | null) => {
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
  }, []);

  const markConversationAsUnread = useCallback((conversationKey: string) => {
    setReadState((prev) => ({
      lastReadAtByConversationKey: prev.lastReadAtByConversationKey,
      manuallyUnreadByConversationKey: {
        ...prev.manuallyUnreadByConversationKey,
        [conversationKey]: true,
      },
    }));
  }, []);

  const refreshConversationList = useCallback(async (activeSession: AppSession) => {
    const response = await fetchAppConversations(activeSession, { limit: 100 });
    const sortedItems = sortConversationsByRecent(response.items);
    setConversations(sortedItems);
    if (response.items.length === 0) {
      setSelectedConversationKey(null);
      setSelectedConversationWaId(null);
      setMessages([]);
      return;
    }
    if (!selectedConversationKey) {
      return;
    }
    const selectedItem = sortedItems.find(
      (item) => getConversationIdentity(item) === selectedConversationKey
    );
    if (!selectedItem) {
      setSelectedConversationKey(null);
      setSelectedConversationWaId(null);
      setMessages([]);
      return;
    }
    setSelectedConversationKey(getConversationIdentity(selectedItem));
    setSelectedConversationWaId(selectedItem.waId);

    if (document.visibilityState !== "visible") return;
    const activeConversation = sortedItems.find(
      (item) => getConversationIdentity(item) === selectedConversationKey
    );
    if (activeConversation) {
      markConversationAsRead(
        getConversationIdentity(activeConversation),
        getConversationActivityAt(activeConversation)
      );
    }
  }, [markConversationAsRead, selectedConversationKey]);

  const refreshSelectedTimeline = useCallback(async (activeSession: AppSession, waId: string) => {
    const response = await fetchAppConversation(activeSession, waId, { order: "asc", limit: 300 });
    setMessages(response.items);
    const responseConversationKey = response.waIdCanonical ?? response.waId ?? waId;
    setSelectedConversationWaId(response.waId ?? waId);
    setSelectedConversationKey((prev) => prev ?? responseConversationKey);
    setConversations((prev) =>
      sortConversationsByRecent(
        prev.map((item) =>
          getConversationIdentity(item) === responseConversationKey
            ? applyConversationOperationalPayload(item, response)
            : item
        )
      )
    );
    const latestActivityAt =
      response.items.length > 0 ? response.items[response.items.length - 1]?.createdAt : null;
    if (document.visibilityState === "visible") {
      markConversationAsRead(responseConversationKey, latestActivityAt);
    }
  }, [markConversationAsRead]);

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
    setError(null);

    refreshConversationList(session)
      .catch((err: { status?: number; message?: string }) => {
        if (cancelled) return;
        if (err.status === 401) {
          handleUnauthorized();
          return;
        }
        setError(err.message || "Falha ao carregar conversas.");
      })
      .finally(() => {
        if (!cancelled) setLoadingConversations(false);
      });

    return () => {
      cancelled = true;
    };
  }, [handleUnauthorized, refreshConversationList, session]);

  useEffect(() => {
    if (!session || !selectedConversationWaId) return;
    let cancelled = false;
    setLoadingMessages(true);
    setError(null);

    fetchAppConversation(session, selectedConversationWaId, { order: "asc", limit: 300 })
      .then((response) => {
        if (cancelled) return;
        setMessages(response.items);
        const responseConversationKey = response.waIdCanonical ?? response.waId ?? selectedConversationWaId;
        setSelectedConversationWaId(response.waId ?? selectedConversationWaId);
        setSelectedConversationKey(responseConversationKey);
        setConversations((prev) =>
          sortConversationsByRecent(
            prev.map((item) =>
              getConversationIdentity(item) === responseConversationKey
                ? applyConversationOperationalPayload(item, response)
                : item
            )
          )
        );
        const latestActivityAt =
          response.items.length > 0 ? response.items[response.items.length - 1]?.createdAt : null;
        if (latestActivityAt) {
          markConversationAsRead(responseConversationKey, latestActivityAt);
        }
      })
      .catch((err: { status?: number; message?: string }) => {
        if (cancelled) return;
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
  }, [handleUnauthorized, markConversationAsRead, selectedConversationWaId, session]);

  useEffect(() => {
    const selectedChanged = lastSelectedConversationKeyRef.current !== selectedConversationKey;
    if (selectedChanged) {
      lastSelectedConversationKeyRef.current = selectedConversationKey;
      lastMessageSignatureRef.current = null;
      shouldScrollToBottomRef.current = Boolean(selectedConversationKey);
    }

    const latestSignature = getLatestMessageSignature(messages);
    if (!selectedChanged && latestSignature && latestSignature !== lastMessageSignatureRef.current) {
      shouldScrollToBottomRef.current = true;
    }
    lastMessageSignatureRef.current = latestSignature;

    if (!selectedConversationKey || !shouldScrollToBottomRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      scrollTimelineToBottom();
      shouldScrollToBottomRef.current = false;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, scrollTimelineToBottom, selectedConversationKey]);

  useEffect(() => {
    if (!session) return;
    let polling = false;
    const interval = window.setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        await refreshConversationList(session);
        if (selectedConversationWaId) {
          await refreshSelectedTimeline(session, selectedConversationWaId);
        }
      } catch (err) {
        if ((err as { status?: number }).status === 401) {
          handleUnauthorized();
        }
      } finally {
        polling = false;
      }
    }, 10000);

    return () => window.clearInterval(interval);
  }, [
    handleUnauthorized,
    refreshConversationList,
    refreshSelectedTimeline,
    selectedConversationWaId,
    session,
  ]);

  const selectedConversation = useMemo(
    () =>
      conversations.find((item) => getConversationIdentity(item) === selectedConversationKey) ?? null,
    [conversations, selectedConversationKey]
  );

  const isAdminUser = useMemo(() => isAppAdmin(session), [session]);

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
  }, [conversationFilter, conversations, departmentFilter, isAdminUser, session?.user.id]);

  const canReply = useMemo(
    () => (session ? canReplyToConversation(selectedConversation, session.user.id) : false),
    [selectedConversation, session]
  );

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
    () => Boolean(selectedConversationWaId) && isSelectedConversationOwnedByCurrentUser,
    [isSelectedConversationOwnedByCurrentUser, selectedConversationWaId]
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
  }, [selectedConversation]);

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
        getConversationActivityAt(selectedConversation)
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
            await refreshSelectedTimeline(session, response.waId ?? next.waId);
          }
          setConversations((prev) =>
            sortConversationsByRecent(
              prev.map((item) =>
                getConversationIdentity(item) === next.conversationKey
                  ? {
                      ...applyConversationOperationalPayload(item, response),
                      lastMessage: {
                        direction: "OUTBOUND",
                        type: "TEXT",
                        status: response.message.status,
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
            response.message.createdAt
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
  }, [handleUnauthorized, refreshSelectedTimeline, selectedConversationWaId, session]);

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

  const handleComposerKeyDown = async (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (!messageDraft.trim() || !selectedConversationWaId) return;
    await handleSendMessage();
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
    <AppShell session={session} title="Inbox" subtitle="Conversas do seu cliente, sem selecao manual de tenant.">
      <FeedbackToast message={success} />
      <FeedbackToast message={buildInboxErrorToast(error, errorDetails, leadError)} variant="error" />

      <section className="grid gap-4 xl:h-[calc(100vh-12rem)] xl:grid-cols-[300px_minmax(0,1fr)_340px]">
        <aside className="flex min-h-0 flex-col rounded-xl border border-white/10 bg-white/5">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold">Conversas</h2>
            <button
              type="button"
              onClick={() => session && refreshConversationList(session)}
              className="rounded-md border border-white/20 px-3 py-1 text-xs text-white/80 hover:bg-white/10"
            >
              Atualizar
            </button>
          </div>
          <div className="border-b border-white/10 px-4 py-3">
            <div className="flex flex-wrap gap-2">
              {CONVERSATION_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setConversationFilter(filter.value)}
                  className={`rounded-full px-3 py-1 text-xs transition ${
                    conversationFilter === filter.value
                      ? "bg-re7-sky/30 text-white"
                      : "bg-white/5 text-white/70 hover:bg-white/10"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            {isAdminUser ? (
              <div className="mt-3">
                <label className="grid gap-1 text-xs text-white/70">
                  <span>Filtrar por setor</span>
                  <select
                    value={departmentFilter}
                    onChange={(event) => setDepartmentFilter(event.target.value)}
                    className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none [&>option]:bg-re7-navy [&>option]:text-white"
                  >
                    <option value="ALL">Todos os setores</option>
                    {departmentOptions.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loadingConversations ? (
              <p className="px-4 py-3 text-sm text-white/70">Carregando conversas...</p>
            ) : null}
            {!loadingConversations && filteredConversations.length === 0 ? (
              <p className="px-4 py-3 text-sm text-white/70">Nenhuma conversa encontrada.</p>
            ) : null}
            {filteredConversations.map((item) => {
              const conversationIdentity = getConversationIdentity(item);
              const isActive = conversationIdentity === selectedConversationKey;
              const unread = !isActive && isConversationUnread(item, readState);
              const status = getConversationOperationalStatus(item);
              return (
                <button
                  key={conversationIdentity}
                  type="button"
                  onClick={() => {
                    shouldScrollToBottomRef.current = true;
                    setSelectedConversationKey(conversationIdentity);
                    setSelectedConversationWaId(item.waId);
                    markConversationAsRead(conversationIdentity, getConversationActivityAt(item));
                  }}
                  className={`w-full border-b border-white/10 px-4 py-3 text-left transition ${
                    isActive ? "bg-re7-sky/20" : "hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className={`text-sm font-medium ${unread ? "text-white" : ""}`}>
                      {getConversationLabel(item)}
                    </p>
                    {unread ? (
                      <span
                        aria-label="mensagem nao lida"
                        className="mt-1 inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-[#20b15a]"
                      />
                    ) : null}
                  </div>
                  <p className="mt-1 font-mono text-xs text-white/80">{item.waId}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/70">
                    <span className={`rounded-full px-2 py-0.5 ${getConversationStatusClass(status)}`}>
                      {getConversationStatusLabel(status)}
                    </span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-white/80">
                      setor: {item.departmentName || "Sem setor"}
                    </span>
                    <span>{item.assignedUserName || (item.assignedUserId ? item.assignedTo : "nao atribuida")}</span>
                    <span>{formatRelativeTime(getConversationActivityAt(item))}</span>
                  </div>
                  <p className="mt-1 text-xs text-white/60">
                    {item.queueName || "Fila Geral"} • {item.leadStatus || "sem status"} •{" "}
                    {formatDateTime(item.updatedAt)}
                  </p>
                  {item.lastMessage?.bodyText ? (
                    <p className={`mt-2 line-clamp-2 text-xs ${unread ? "text-white/85" : "text-white/60"}`}>
                      {item.lastMessage.bodyText}
                    </p>
                  ) : null}
                </button>
              );
            })}
          </div>
        </aside>

        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-[#eadfcd] shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
          <div className="border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Timeline{" "}
              {selectedConversation
                ? `• ${selectedConversation.leadName || selectedConversation.leadPhone || selectedConversation.waId}`
                : ""}
            </h2>
            {selectedConversation ? (
              <p className="mt-1 text-xs text-slate-700">
                modo: {selectedConversation.mode} • status:{" "}
                {getConversationStatusLabel(getConversationOperationalStatus(selectedConversation))}
                {selectedConversation.assignedUserName
                  ? ` • atendente: ${selectedConversation.assignedUserName}`
                  : selectedConversation.assignedTo
                    ? ` • atendente: ${selectedConversation.assignedTo}`
                    : ""}
                {selectedConversation.assignedAt
                  ? ` • desde ${formatDateTime(selectedConversation.assignedAt)}`
                  : ""}
                {` • setor: ${selectedConversation.departmentName || "Sem setor"}`}
                {selectedConversation.queueName ? ` • fila: ${selectedConversation.queueName}` : ""}
              </p>
            ) : null}
          </div>
          <div ref={timelineRef} className="wa-chat-canvas min-h-0 flex-1 overflow-y-auto p-4">
            {!selectedConversationWaId ? (
              <p className="text-sm text-slate-700/80">Selecione uma conversa para ver a timeline.</p>
            ) : null}
            {selectedConversationWaId && loadingMessages ? (
              <p className="text-sm text-slate-700/80">Carregando mensagens...</p>
            ) : null}
            {selectedConversationWaId && !loadingMessages && messages.length === 0 ? (
              <p className="text-sm text-slate-700/80">Sem mensagens para esta conversa.</p>
            ) : null}
            <div className="space-y-3">
              {messages.map((item, index) => {
                const statusTicks = renderMessageStatusTicks(item);
                return (
                  <div
                    key={`${item.createdAt}-${item.direction}-${item.messageId ?? "noid"}-${index}`}
                    className={`flex ${item.direction === "INBOUND" ? "justify-start" : "justify-end"}`}
                  >
                    <article
                      className={`wa-bubble ${
                        item.direction === "INBOUND" ? "wa-bubble-inbound" : "wa-bubble-outbound"
                      }`}
                    >
                    {item.bodyText ? (
                      <p className="text-sm leading-relaxed">{item.bodyText}</p>
                    ) : (
                      <p className="text-sm italic text-slate-700">{getMessageContentLabel(item)}</p>
                    )}
                    {item.templateName ? (
                      <p className="wa-bubble-meta mt-1 text-[11px]">template: {item.templateName}</p>
                    ) : null}
                    <div className="mt-2 flex items-center justify-end gap-1 text-[11px] text-slate-600">
                      <span>{formatDateTime(item.createdAt)}</span>
                      {statusTicks}
                    </div>
                    </article>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="wa-composer-shell border-t border-black/5 p-4 text-slate-900">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={statusActionDraft}
                  onChange={async (event) => {
                    const nextStatus = event.target.value as ConversationOperationalStatus | "";
                    setStatusActionDraft(nextStatus);
                    if (!nextStatus) return;
                    await handleUpdateConversationStatus(nextStatus);
                  }}
                  disabled={!canManageSelectedConversation || Boolean(conversationAction)}
                  className="rounded-xl border border-[#d4c7b5] bg-white/90 px-3 py-2 text-sm text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="" disabled>
                    Alterar status
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
              {selectedConversation ? (
                <button
                  type="button"
                  onClick={() => {
                    markConversationAsUnread(getConversationIdentity(selectedConversation));
                    setSelectedConversationKey(null);
                    setSelectedConversationWaId(null);
                    setMessages([]);
                  }}
                  className="rounded-xl border border-[#d4c7b5] bg-white/75 px-3 py-2 text-sm text-slate-900 hover:bg-white"
                >
                  Marcar como nao lida
                </button>
              ) : null}
              {selectedConversation?.assignedUserId === session.user.id ? (
                <button
                  type="button"
                  disabled={!selectedConversationWaId || Boolean(conversationAction)}
                  onClick={handleReleaseConversation}
                  className="rounded-xl border border-[#d4c7b5] bg-white/75 px-3 py-2 text-sm text-slate-900 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {conversationAction === "release" ? "Atualizando..." : "Liberar para fila"}
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
                  className="rounded-xl border border-[#d4c7b5] bg-white/75 px-3 py-2 text-sm text-slate-900 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {conversationAction === "claim" ? "Atualizando..." : "Assumir conversa"}
                </button>
              )}
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <select
                value={transferUserId}
                onChange={(event) => setTransferUserId(event.target.value)}
                disabled={!canTransferSelectedConversation || users.length === 0 || Boolean(conversationAction)}
                className="rounded-xl border border-[#d4c7b5] bg-white/90 px-3 py-2 text-sm text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Selecionar atendente</option>
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
                className="rounded-xl border border-[#d4c7b5] bg-white/75 px-3 py-2 text-sm text-slate-900 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {conversationAction === "transfer" ? "Transferindo..." : "Transferir"}
              </button>
            </div>
            {isAdminUser ? (
              <div className="mb-3 rounded-2xl border border-[#d4c7b5] bg-white/50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={transferDepartmentId}
                    onChange={(event) => setTransferDepartmentId(event.target.value)}
                    disabled={
                      !canTransferDepartment ||
                      departmentOptions.length === 0 ||
                      Boolean(conversationAction)
                    }
                    className="rounded-xl border border-[#d4c7b5] bg-white/90 px-3 py-2 text-sm text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 [&>option]:bg-white [&>option]:text-slate-900"
                  >
                    <option value="">Selecionar setor</option>
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
                    className="rounded-xl border border-[#d4c7b5] bg-white/75 px-3 py-2 text-sm text-slate-900 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {conversationAction === "transfer-department"
                      ? "Transferindo setor..."
                      : "Transferir para outro setor"}
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-700">
                  {canTransferDepartment
                    ? "A transferencia de setor limpa atribuicao e devolve a conversa para waiting."
                    : "Conecte o console admin neste navegador para transferir a conversa entre setores."}
                </p>
              </div>
            ) : null}
            <div className="mb-3 flex flex-wrap gap-2">
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    setMessageDraft((current) => `${current}${emoji}`);
                    focusComposer();
                  }}
                  disabled={!selectedConversationWaId || !canReply}
                  className="rounded-full border border-[#d4c7b5] bg-white/80 px-3 py-1 text-lg leading-none hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {emoji}
                </button>
              ))}
            </div>
            <label className="grid gap-2 text-sm">
              <textarea
                ref={composerRef}
                className="min-h-24 rounded-[1.1rem] border border-[#d4c7b5] bg-white/92 px-4 py-3 text-slate-900 outline-none focus:border-[#7cbf69]"
                value={messageDraft}
                onChange={(event) => setMessageDraft(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder={
                  canReply
                    ? "Digite a mensagem..."
                    : "Assuma a conversa para responder manualmente..."
                }
                disabled={!selectedConversationWaId || !canReply}
              />
            </label>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-600">
                {sendingMessage || queuedMessageCount > 0
                  ? `${queuedMessageCount > 0 ? `${queuedMessageCount} ` : ""}mensagem(ns) em envio. O campo continua livre para digitar.`
                  : "Envio em sequencia. O rascunho atual nao trava enquanto outra mensagem sobe."}
              </p>
              <button
                type="button"
                disabled={
                  !selectedConversationWaId ||
                  !messageDraft.trim() ||
                  !canReply
                }
                onClick={handleSendMessage}
                className="rounded-xl bg-[#20b15a] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sendingMessage ? "Adicionar a fila" : "Enviar mensagem"}
              </button>
            </div>
          </div>
        </div>

        <aside className="flex min-h-0 flex-col rounded-xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold">Lead</h2>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {!selectedLead ? (
              <p className="text-sm text-white/70">
                Ha conversa persistida, mas esta conversa ainda nao entrou no fluxo de captura de lead.
              </p>
            ) : (
              <>
                <div className="space-y-1 text-sm">
                  <label className="grid gap-1 text-sm">
                    <span className="text-white/70">Nome / apelido</span>
                    <div className="flex gap-2">
                      <input
                        className="min-w-0 flex-1 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                        value={leadNameDraft}
                        onChange={(event) => setLeadNameDraft(event.target.value)}
                        placeholder="Como este contato deve aparecer no inbox"
                        disabled={!isSelectedConversationOwnedByCurrentUser || savingLeadName}
                      />
                      <button
                        type="button"
                        disabled={savingLeadName || !isSelectedConversationOwnedByCurrentUser}
                        onClick={handleSaveLeadName}
                        className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/90 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {savingLeadName ? "Salvando..." : "Salvar"}
                      </button>
                    </div>
                  </label>
                  <p>
                    <span className="text-white/70">Phone:</span> {selectedLead.phone || selectedConversation?.waId || "-"}
                  </p>
                  <p>
                    <span className="text-white/70">Cidade:</span> {selectedLead.city || "-"}
                  </p>
                  <p>
                    <span className="text-white/70">Servico:</span> {selectedLead.service || "-"}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="grid gap-1 text-sm">
                    <span className="text-white/70">Status</span>
                    <select
                      className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2"
                      value={statusDraft}
                      onChange={(event) => setStatusDraft(event.target.value as LeadStatus)}
                      disabled={!isSelectedConversationOwnedByCurrentUser || savingLeadStatus}
                    >
                      <option value="" disabled>
                        Selecione
                      </option>
                      {LEAD_STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={!statusDraft || savingLeadStatus || !isSelectedConversationOwnedByCurrentUser}
                    onClick={handleSaveLeadStatus}
                    className="rounded-md bg-re7-orange px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingLeadStatus ? "Salvando..." : "Salvar status"}
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="grid gap-1 text-sm">
                    <span className="text-white/70">Nota interna</span>
                    <textarea
                      className="min-h-20 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                      value={noteDraft}
                      onChange={(event) => setNoteDraft(event.target.value)}
                      placeholder="Registrar observacao de atendimento..."
                      disabled={!isSelectedConversationOwnedByCurrentUser || savingLeadNote}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={!noteDraft.trim() || savingLeadNote || !isSelectedConversationOwnedByCurrentUser}
                    onClick={handleAddLeadNote}
                    className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/90 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingLeadNote ? "Salvando..." : "Salvar nota"}
                  </button>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold">Notas</p>
                  {loadingLeadNotes ? (
                    <p className="text-xs text-white/70">Carregando notas...</p>
                  ) : null}
                  {!loadingLeadNotes && leadNotes.length === 0 ? (
                    <p className="text-xs text-white/70">Sem notas para este lead.</p>
                  ) : null}
                  <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                    {leadNotes.map((note) => (
                      <article key={note.id} className="rounded-md border border-white/15 bg-white/5 p-2">
                        <p className="text-xs text-white">{note.body}</p>
                        <p className="mt-1 text-[11px] text-white/60">{formatDateTime(note.createdAt)}</p>
                      </article>
                    ))}
                  </div>
                </div>
              </>
            )}

            {leadError ? (
              <p className="rounded-md border border-red-400/30 bg-red-900/30 p-2 text-xs text-red-100">
                {leadError}
              </p>
            ) : null}
          </div>
        </aside>
      </section>
    </AppShell>
  );
}
