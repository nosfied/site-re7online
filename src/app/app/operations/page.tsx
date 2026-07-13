"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  if (type === "location") return "Localizacao";
  if (type === "image") return "Imagem";
  if (type === "audio") return "Audio";
  if (type === "video") return "Video";
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
  "border-white/16 bg-white/[0.115] shadow-[0_10px_28px_rgba(2,8,23,0.16)] hover:bg-white/[0.145]",
  "border-re7-sky/18 bg-slate-950/28 shadow-[0_10px_28px_rgba(2,8,23,0.2)] hover:bg-slate-950/36",
];

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
      className={`group w-full rounded-lg border p-3 text-left transition hover:border-re7-sky/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-re7-sky/70 ${tone}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-xs font-semibold text-re7-sky">{card.protocol}</span>
        <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/65">
          {getChannelLabel(card.channel)}
        </span>
      </div>
      <p className="mt-2 truncate text-sm font-semibold text-white">
        {card.contactName || "Contato nao identificado"}
      </p>
      {card.company ? <p className="mt-0.5 truncate text-xs text-white/55">{card.company}</p> : null}
      <p className="mt-3 line-clamp-2 min-h-9 text-xs leading-relaxed text-white/70">
        {getLastMessagePreview(card)}
      </p>
      <div className="mt-3 grid gap-1.5 text-[11px] text-white/55">
        <p className="truncate">
          <span className="text-white/40">Setor:</span> {card.departmentName || "-"}
        </p>
        <p className="truncate">
          <span className="text-white/40">Fila:</span> {card.queueName || "-"}
        </p>
        <p className="truncate">
          <span className="text-white/40">Responsavel:</span> {card.assignedUserName || "Sem responsavel"}
        </p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-white/65">
          1a resp. {formatDuration(card.waitingFirstResponseSec)}
        </span>
        <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-white/65">
          Atend. {formatDuration(card.activeDurationSec)}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {card.continuation ? (
          <span className="rounded-full border border-violet-300/25 bg-violet-400/10 px-2 py-0.5 text-[11px] font-semibold text-violet-100">
            Continuacao
          </span>
        ) : null}
        {card.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/60">
            {tag}
          </span>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-white/40">Atualizado {formatDateTime(card.updatedAt)}</p>
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
        setError(typed.message || "Nao foi possivel carregar o quadro operacional.");
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
        setError(typed.message || "Nao foi possivel aplicar filtros.");
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
        setError(typed.message || "Nao foi possivel carregar mais conversas.");
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
      title="Quadro Operacional"
      subtitle="Visao complementar do Inbox por status operacional, fila e SLA."
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
          <p className="theme-muted mt-3 text-xs">
            Filtro de fila sera conectado na proxima etapa, quando houver fonte segura de seletores de filas por tenant.
          </p>
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
