"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { FeedbackToast, usePausableFeedbackAutoDismiss } from "@/components/ui/FeedbackToast";
import {
  AppApiError,
  AppOperationsBoardCard,
  AppOperationsBoardCursor,
  AppOperationsBoardResponse,
  AppSession,
  clearAppSession,
  fetchAppDepartments,
  fetchAppOperationsBoard,
  fetchAppUsers,
  loadAppSession,
  saveAppSession,
} from "@/lib/appClientApi";
import { hasCapability } from "@/lib/appFeatures";
import { getAppErrorUxMessage } from "@/lib/appUxLabels";
import { formatUserDisplayName } from "@/lib/userDisplayName";
import type {
  AdminDepartmentItem,
  AdminUserItem,
  ConversationOperationalStatus,
} from "@/lib/whatsappAdminApi";

const BOARD_STATUSES: ConversationOperationalStatus[] = [
  "WAITING",
  "IN_PROGRESS",
  "WAITING_USER",
  "CLOSED",
];

const STATUS_LABELS: Record<ConversationOperationalStatus, string> = {
  WAITING: "Aguardando atendimento",
  IN_PROGRESS: "Em atendimento",
  WAITING_USER: "Aguardando cliente",
  CLOSED: "Fechados",
};

const STATUS_DESCRIPTIONS: Record<ConversationOperationalStatus, string> = {
  WAITING: "Conversas aguardando primeiro atendimento humano.",
  IN_PROGRESS: "Conversas assumidas por atendente.",
  WAITING_USER: "Conversas aguardando retorno do cliente.",
  CLOSED: "Conversas fechadas dentro do periodo.",
};

const COLUMN_TONE: Record<ConversationOperationalStatus, string> = {
  WAITING: "border-amber-300/25 bg-amber-400/10",
  IN_PROGRESS: "border-emerald-300/25 bg-emerald-400/10",
  WAITING_USER: "border-sky-300/25 bg-sky-400/10",
  CLOSED: "border-white/12 bg-white/6",
};

const CARD_LIMIT = 20;

function canAccessOperations(role: string) {
  const normalized = role.trim().toUpperCase();
  return normalized === "SUPERVISOR" || normalized === "ADMIN";
}

function toDateTimeLocalValue(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function dateTimeLocalToIso(value: string) {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function getDefaultFromValue() {
  return toDateTimeLocalValue(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
}

function getDefaultToValue() {
  return toDateTimeLocalValue(new Date());
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDuration(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined) return "-";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours ? `${days}d ${remainingHours}h` : `${days}d`;
}

function getChannelLabel(channel: string | null) {
  switch ((channel ?? "").toLowerCase()) {
    case "whatsapp":
      return "WhatsApp";
    case "messenger":
      return "Messenger";
    case "instagram":
      return "Instagram";
    case "webchat":
      return "Webchat";
    case "telegram":
      return "Telegram";
    default:
      return channel || "Canal";
  }
}

function getLastMessagePreview(card: AppOperationsBoardCard) {
  const text = card.lastMessage?.bodyText?.trim();
  if (text) return text;
  const type = card.lastMessage?.type?.toLowerCase();
  if (type === "location") return "Localização";
  if (type === "image") return "Imagem";
  if (type === "audio") return "Áudio";
  if (type === "video") return "Vídeo";
  if (type === "document") return "Documento";
  return "Sem mensagem recente";
}

function buildInboxHref(card: AppOperationsBoardCard) {
  return `/app/inbox?conversation=${encodeURIComponent(card.conversationIdentity)}`;
}

function OperationsBoardSkeleton() {
  return (
    <div className="grid min-h-[520px] grid-cols-[repeat(4,minmax(280px,1fr))] gap-3 overflow-x-auto pb-2">
      {BOARD_STATUSES.map((status) => (
        <section key={status} className="min-w-[280px] rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="h-4 w-40 animate-pulse rounded bg-white/15" />
          <div className="mt-4 grid gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="h-3 w-24 animate-pulse rounded bg-white/20" />
                <div className="mt-3 h-4 w-44 animate-pulse rounded bg-white/15" />
                <div className="mt-3 h-3 w-32 animate-pulse rounded bg-white/10" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

const CARD_TONES = [
  "operations-board-card-tone-a border-white/16 bg-white/[0.115] shadow-[0_10px_28px_rgba(2,8,23,0.16)] hover:bg-white/[0.145]",
  "operations-board-card-tone-b border-re7-sky/18 bg-slate-950/28 shadow-[0_10px_28px_rgba(2,8,23,0.2)] hover:bg-slate-950/36",
];

function OperationsChannelLogo({ channel, className = "h-4 w-4" }: { channel: string | null; className?: string }) {
  const gradientId = useId();
  switch ((channel ?? "").toLowerCase()) {
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
            <linearGradient id={gradientId} x1="4" x2="28" y1="28" y2="4">
              <stop offset="0" stopColor="#FEDA75" />
              <stop offset="0.35" stopColor="#FA7E1E" />
              <stop offset="0.65" stopColor="#D62976" />
              <stop offset="1" stopColor="#4F5BD5" />
            </linearGradient>
          </defs>
          <rect width="32" height="32" rx="9" fill={`url(#${gradientId})`} />
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

function OperationsCard({
  card,
  index,
  onOpen,
}: {
  card: AppOperationsBoardCard;
  index: number;
  onOpen: (card: AppOperationsBoardCard) => void;
}) {
  const tone = CARD_TONES[index % CARD_TONES.length];
  return (
    <button
      type="button"
      onClick={() => onOpen(card)}
      className={`group w-full rounded-lg border px-2.5 py-2.5 text-left transition hover:border-re7-sky/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-re7-sky/70 ${tone}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
        <span className="min-w-0 truncate font-mono text-[11px] font-semibold text-re7-sky">{card.protocol}</span>
        <span className="operations-channel-chip inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/7 px-1.5 py-0.5 text-[10px] font-semibold text-white/70">
          <OperationsChannelLogo channel={card.channel} className="h-4 w-4 shrink-0" />
          {getChannelLabel(card.channel)}
        </span>
      </div>

      <div className="border-b border-white/10 py-2">
        <p className="truncate text-sm font-semibold leading-tight text-white">
          {card.contactName || "Contato não identificado"}
        </p>
        {card.company ? <p className="mt-0.5 truncate text-[11px] leading-tight text-white/55">{card.company}</p> : null}
        <p className="mt-1.5 line-clamp-1 text-[11px] leading-snug text-white/68">
          {getLastMessagePreview(card)}
        </p>
      </div>

      <div className="grid gap-1 border-b border-white/10 py-2 text-[10.5px] leading-tight text-white/58">
        <p className="truncate">
          <span className="text-white/38">Setor</span> · {card.departmentName || "-"}
        </p>
        <p className="truncate">
          <span className="text-white/38">Fila</span> · {card.queueName || "-"}
        </p>
        <p className="truncate">
          <span className="text-white/38">Resp.</span> · {formatUserDisplayName(card.assignedUserName, "Sem responsavel")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-1.5 border-b border-white/10 py-2 text-[10.5px]">
        <span className="rounded border border-white/10 bg-black/10 px-1.5 py-1 text-white/67">
          1a {formatDuration(card.waitingFirstResponseSec)}
        </span>
        <span className="rounded border border-white/10 bg-black/10 px-1.5 py-1 text-white/67">
          Atend. {formatDuration(card.activeDurationSec)}
        </span>
      </div>

      <div className="mt-2 flex min-h-5 flex-wrap gap-1">
        {card.continuation ? (
          <span className="rounded-full border border-violet-300/25 bg-violet-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-violet-100">
            Continuacao
          </span>
        ) : null}
        {card.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/60">
            {tag}
          </span>
        ))}
        {!card.continuation && card.tags.length === 0 ? (
          <span className="text-[10px] text-white/32">Sem tags</span>
        ) : null}
      </div>
      <p className="mt-1.5 text-[10px] leading-none text-white/40">Atualizado {formatDateTime(card.updatedAt)}</p>
    </button>
  );
}

function OperationsColumn({
  status,
  board,
  loadingMore,
  onLoadMore,
  onOpenCard,
}: {
  status: ConversationOperationalStatus;
  board: AppOperationsBoardResponse;
  loadingMore: ConversationOperationalStatus | null;
  onLoadMore: (status: ConversationOperationalStatus) => void;
  onOpenCard: (card: AppOperationsBoardCard) => void;
}) {
  const column = board.columns[status];
  return (
    <section className={`flex max-h-[calc(100dvh-270px)] min-h-[520px] min-w-[280px] flex-col rounded-lg border ${COLUMN_TONE[status]}`}>
      <div className="border-b border-white/10 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{STATUS_LABELS[status]}</h2>
            <p className="mt-0.5 text-xs text-white/55">{STATUS_DESCRIPTIONS[status]}</p>
          </div>
          <span className="shrink-0 rounded-full border border-white/10 bg-white/10 px-2 py-1 text-xs font-semibold">
            {column.count}
          </span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        {column.items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/15 px-3 py-8 text-center text-sm text-white/55">
            Nenhuma conversa nesta coluna.
          </div>
        ) : (
          <div className="grid gap-2.5">
            {column.items.map((card, index) => (
              <OperationsCard
                key={`${status}:${card.conversationId}`}
                card={card}
                index={index}
                onOpen={onOpenCard}
              />
            ))}
          </div>
        )}
      </div>
      {column.nextCursor ? (
        <div className="border-t border-white/10 p-2.5">
          <button
            type="button"
            onClick={() => onLoadMore(status)}
            disabled={loadingMore === status}
            className="theme-nav-link w-full rounded-md border px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingMore === status ? "Carregando..." : "Carregar mais"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

export default function AppOperationsPage() {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [departments, setDepartments] = useState<AdminDepartmentItem[]>([]);
  const [board, setBoard] = useState<AppOperationsBoardResponse | null>(null);
  const [from, setFrom] = useState(getDefaultFromValue);
  const [to, setTo] = useState(getDefaultToValue);
  const [departmentId, setDepartmentId] = useState("");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState<ConversationOperationalStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toastHandlers = usePausableFeedbackAutoDismiss(Boolean(error), () => {
    setError(null);
  });

  const handleUnauthorized = useCallback(() => {
    clearAppSession();
    router.replace("/app/login");
  }, [router]);

  const buildFilters = useCallback(
    (cursors?: Partial<Record<ConversationOperationalStatus, AppOperationsBoardCursor | null>>) => ({
      from: dateTimeLocalToIso(from),
      to: dateTimeLocalToIso(to),
      departmentId: departmentId || null,
      assignedUserId: assignedUserId || null,
      limit: CARD_LIMIT,
      cursors,
    }),
    [assignedUserId, departmentId, from, to]
  );

  const loadBoard = useCallback(
    async (activeSession: AppSession) => {
      const response = await fetchAppOperationsBoard(activeSession, buildFilters());
      setBoard(response);
    },
    [buildFilters]
  );

  useEffect(() => {
    const stored = loadAppSession();
    if (!stored?.token) {
      router.replace("/app/login");
      return;
    }
    if (!canAccessOperations(stored.user.role) || !hasCapability(stored, "operationsBoard")) {
      router.replace("/app/inbox");
      return;
    }
    setSession(stored);
    saveAppSession(stored);
  }, [router]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([fetchAppUsers(session), fetchAppDepartments(session), loadBoard(session)])
      .then(([usersResponse, departmentsResponse]) => {
        if (cancelled) return;
        setUsers(usersResponse.items);
        setDepartments(departmentsResponse.items.filter((item) => item.isActive));
      })
      .catch((err) => {
        if (cancelled) return;
        const typed = err as AppApiError;
        if (typed.status === 401) {
          handleUnauthorized();
          return;
        }
        if (typed.status === 403) {
          router.replace("/app/inbox");
          return;
        }
        setError(getAppErrorUxMessage({ status: typed.status, message: typed.message, fallback: "Não foi possível carregar o quadro operacional." }));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [handleUnauthorized, loadBoard, router, session]);

  const handleApplyFilters = useCallback(() => {
    if (!session) return;
    setLoading(true);
    setError(null);
    loadBoard(session)
      .catch((err) => {
        const typed = err as AppApiError;
        if (typed.status === 401) {
          handleUnauthorized();
          return;
        }
        setError(getAppErrorUxMessage({ status: typed.status, message: typed.message, fallback: "Não foi possível aplicar os filtros." }));
      })
      .finally(() => setLoading(false));
  }, [handleUnauthorized, loadBoard, session]);

  const handleLoadMore = useCallback(
    async (status: ConversationOperationalStatus) => {
      if (!session || !board?.columns[status].nextCursor) return;
      setLoadingMore(status);
      setError(null);
      try {
        const response = await fetchAppOperationsBoard(session, buildFilters({ [status]: board.columns[status].nextCursor }));
        setBoard((current) => {
          if (!current) return response;
          return {
            ...response,
            columns: {
              ...current.columns,
              [status]: {
                ...response.columns[status],
                items: [...current.columns[status].items, ...response.columns[status].items],
                count: current.columns[status].items.length + response.columns[status].items.length,
              },
            },
          };
        });
      } catch (err) {
        const typed = err as AppApiError;
        if (typed.status === 401) {
          handleUnauthorized();
          return;
        }
        setError(getAppErrorUxMessage({ status: typed.status, message: typed.message, fallback: "Não foi possível carregar mais conversas." }));
      } finally {
        setLoadingMore(null);
      }
    },
    [board, buildFilters, handleUnauthorized, session]
  );

  const handleOpenCard = useCallback(
    (card: AppOperationsBoardCard) => {
      router.push(buildInboxHref(card));
    },
    [router]
  );

  const activeUserOptions = useMemo(() => users.filter((item) => item.isActive !== false), [users]);

  if (!session) {
    return (
      <main className="theme-bg flex min-h-screen items-center justify-center">
        <p className="theme-muted text-sm">Carregando...</p>
      </main>
    );
  }

  return (
    <AppShell
      session={session}
      title="Central de Operações"
      hideTitleBar
    >
      <section className="grid gap-4">
        <div className="theme-surface-strong rounded-xl border p-3 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto] xl:items-end">
            <label className="grid gap-1.5 text-sm">
              <span className="theme-soft text-xs font-semibold uppercase tracking-[0.14em]">Inicio</span>
              <input
                type="datetime-local"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="theme-input h-10 rounded-md border px-3 text-sm"
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="theme-soft text-xs font-semibold uppercase tracking-[0.14em]">Fim</span>
              <input
                type="datetime-local"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className="theme-input h-10 rounded-md border px-3 text-sm"
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="theme-soft text-xs font-semibold uppercase tracking-[0.14em]">Departamento</span>
              <select
                value={departmentId}
                onChange={(event) => setDepartmentId(event.target.value)}
                className="theme-input h-10 rounded-md border px-3 text-sm"
              >
                <option value="">Todos</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="theme-soft text-xs font-semibold uppercase tracking-[0.14em]">Atendente</span>
              <select
                value={assignedUserId}
                onChange={(event) => setAssignedUserId(event.target.value)}
                className="theme-input h-10 rounded-md border px-3 text-sm"
              >
                <option value="">Todos</option>
                {activeUserOptions.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name || user.email}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={handleApplyFilters}
              disabled={loading}
              className="h-10 rounded-md bg-re7-sky px-4 text-sm font-semibold text-slate-950 shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Atualizando..." : "Aplicar"}
            </button>
          </div>
        </div>

        {loading && !board ? (
          <OperationsBoardSkeleton />
        ) : board ? (
          <div className="grid grid-cols-[repeat(4,minmax(280px,1fr))] gap-3 overflow-x-auto pb-2">
            {BOARD_STATUSES.map((status) => (
              <OperationsColumn
                key={status}
                status={status}
                board={board}
                loadingMore={loadingMore}
                onLoadMore={handleLoadMore}
                onOpenCard={handleOpenCard}
              />
            ))}
          </div>
        ) : (
          <div className="theme-surface rounded-xl border p-8 text-center text-sm theme-muted">
            Quadro operacional indisponivel.
          </div>
        )}
      </section>
      {error ? (
        <FeedbackToast variant="error" message={error} {...toastHandlers} />
      ) : null}
    </AppShell>
  );
}
