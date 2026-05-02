"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { FeedbackToast, usePausableFeedbackAutoDismiss } from "@/components/ui/FeedbackToast";
import {
  AppApiError,
  AppDashboardOverview,
  AppSession,
  claimAppConversation,
  clearAppSession,
  fetchAppDashboardOverview,
  fetchAppDepartments,
  fetchAppUsers,
  loadAppSession,
  saveAppSession,
  updateAppConversationStatus,
} from "@/lib/appClientApi";
import { addAppRealtimeListener } from "@/lib/appRealtime";
import type {
  AdminDepartmentItem,
  AdminUserItem,
  ConversationOperationalStatus,
} from "@/lib/whatsappAdminApi";

const STATUS_OPTIONS: Array<{ value: "" | ConversationOperationalStatus; label: string }> = [
  { value: "", label: "Todos" },
  { value: "WAITING", label: "Aguardando" },
  { value: "IN_PROGRESS", label: "Em atendimento" },
  { value: "WAITING_USER", label: "Aguardando cliente" },
  { value: "CLOSED", label: "Finalizadas" },
];

function canAccessDashboard(role: string) {
  const normalized = role.trim().toUpperCase();
  return normalized === "SUPERVISOR" || normalized === "ADMIN";
}

function isAdminRole(role: string) {
  return role.trim().toUpperCase() === "ADMIN";
}

function formatSeconds(value: number | null) {
  if (value === null || value === undefined) return "-";
  if (value < 60) return `${value}s`;
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  if (minutes < 60) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatElapsed(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return "-";
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours ? `${days}d ${remainingHours}h` : `${days}d`;
}

function getStatusLabel(status: ConversationOperationalStatus) {
  switch (status) {
    case "WAITING":
      return "Aguardando";
    case "IN_PROGRESS":
      return "Em atendimento";
    case "WAITING_USER":
      return "Aguardando cliente";
    case "CLOSED":
      return "Finalizada";
  }
}

export default function AppDashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [departments, setDepartments] = useState<AdminDepartmentItem[]>([]);
  const [overview, setOverview] = useState<AppDashboardOverview | null>(null);
  const [departmentId, setDepartmentId] = useState("");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [status, setStatus] = useState<"" | ConversationOperationalStatus>("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleUnauthorized = useCallback(() => {
    clearAppSession();
    router.replace("/app/login");
  }, [router]);

  const refreshDashboard = useCallback(
    async (activeSession: AppSession, options?: { silent?: boolean }) => {
      if (!options?.silent) setLoading(true);
      if (options?.silent) setRefreshing(true);
      try {
        const response = await fetchAppDashboardOverview(activeSession, {
          departmentId: isAdminRole(activeSession.user.role) ? departmentId || null : null,
          assignedUserId: assignedUserId || null,
          status: status || null,
        });
        setOverview(response);
        setError(null);
      } catch (err) {
        const typed = err as AppApiError;
        if (typed.status === 401) {
          handleUnauthorized();
          return;
        }
        setError(typed.message || "Falha ao carregar dashboard.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [assignedUserId, departmentId, handleUnauthorized, status]
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

  const toastHandlers = usePausableFeedbackAutoDismiss(Boolean(error || success), () => {
    setError(null);
    setSuccess(null);
  });

  useEffect(() => {
    if (!session || !canAccessDashboard(session.user.role)) return;
    let cancelled = false;
    Promise.all([fetchAppUsers(session), fetchAppDepartments(session)])
      .then(([usersResponse, departmentsResponse]) => {
        if (cancelled) return;
        setUsers(usersResponse.items);
        setDepartments(departmentsResponse.items);
      })
      .catch((err) => {
        if (cancelled) return;
        const typed = err as AppApiError;
        if (typed.status === 401) {
          handleUnauthorized();
          return;
        }
        setError(typed.message || "Falha ao carregar filtros.");
      });
    return () => {
      cancelled = true;
    };
  }, [handleUnauthorized, session]);

  useEffect(() => {
    if (!session || !canAccessDashboard(session.user.role)) return;
    void refreshDashboard(session);
  }, [refreshDashboard, session]);

  useEffect(() => {
    if (!session || !canAccessDashboard(session.user.role)) return;
    const timer = window.setInterval(() => {
      void refreshDashboard(session, { silent: true });
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [refreshDashboard, session]);

  useEffect(() => {
    if (!session || !canAccessDashboard(session.user.role)) return;
    let refreshTimer: number | null = null;
    const unsubscribe = addAppRealtimeListener((event) => {
      if (event.clientId !== session.user.clientId) return;
      if (
        event.type !== "message.created" &&
        event.type !== "message.status.updated" &&
        event.type !== "conversation.handoff.updated"
      ) {
        return;
      }
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        void refreshDashboard(session, { silent: true });
      }, 500);
    });
    return () => {
      unsubscribe();
      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer);
      }
    };
  }, [refreshDashboard, session]);

  const userOptions = useMemo(
    () => users.filter((item) => item.isActive),
    [users]
  );

  const handleClaim = async (waId: string) => {
    if (!session) return;
    setActionKey(`claim:${waId}`);
    setError(null);
    setSuccess(null);
    try {
      await claimAppConversation(session, waId);
      setSuccess("Atendimento assumido.");
      await refreshDashboard(session, { silent: true });
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(typed.message || "Falha ao assumir atendimento.");
    } finally {
      setActionKey(null);
    }
  };

  const handleClose = async (waId: string) => {
    if (!session) return;
    setActionKey(`close:${waId}`);
    setError(null);
    setSuccess(null);
    try {
      await updateAppConversationStatus(session, waId, "CLOSED");
      setSuccess("Atendimento encerrado.");
      await refreshDashboard(session, { silent: true });
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(typed.message || "Falha ao encerrar atendimento.");
    } finally {
      setActionKey(null);
    }
  };

  if (!session) {
    return (
      <main className="min-h-screen bg-re7-navy px-4 py-8 text-white md:px-8">
        <div className="mx-auto max-w-7xl rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm text-white/70">Carregando...</p>
        </div>
      </main>
    );
  }

  if (!canAccessDashboard(session.user.role)) {
    return (
      <AppShell
        session={session}
        title="Dashboard"
        subtitle="Visao operacional e supervisao de atendimento."
      >
        <section className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/75">
          Este modulo esta disponivel apenas para supervisores e administradores.
        </section>
      </AppShell>
    );
  }

  const kpis = overview?.kpis;
  const openConversations =
    (kpis?.waiting ?? 0) + (kpis?.active ?? 0) + (kpis?.waitingUser ?? 0);

  return (
    <AppShell
      session={session}
      title="Dashboard"
      subtitle="Supervisao da fila operacional e indicadores quase em tempo real."
    >
      <FeedbackToast message={success} {...toastHandlers} />
      <FeedbackToast message={error} variant="error" {...toastHandlers} />

      <section className="rounded-xl border border-white/10 bg-white/5 p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="grid gap-1 text-sm">
            <span className="text-white/70">Setor</span>
            <select
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
              disabled={!isAdminRole(session.user.role)}
              className="w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">Todos</option>
              {departments.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-white/70">Atendente</span>
            <select
              value={assignedUserId}
              onChange={(event) => setAssignedUserId(event.target.value)}
              className="w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
            >
              <option value="">Todos</option>
              {userOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.role})
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-white/70">Status</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as "" | ConversationOperationalStatus)}
              className="w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
            >
              {STATUS_OPTIONS.map((item) => (
                <option key={item.value || "all"} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => session && refreshDashboard(session, { silent: true })}
              disabled={refreshing}
              className="w-full rounded-md border border-re7-sky/30 bg-re7-sky/10 px-3 py-2 text-sm text-white hover:bg-re7-sky/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshing ? "Atualizando..." : "Atualizar"}
            </button>
          </div>
        </div>
      </section>

      {loading ? <p className="text-sm text-white/70">Carregando dashboard...</p> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Atendimentos Ativos", openConversations],
          ["Fila", kpis?.waiting],
          ["Em Atendimento", kpis?.active],
          ["Aguardando Cliente", kpis?.waitingUser],
          ["Finalizados Hoje", kpis?.closedToday],
        ].map(([label, value]) => (
          <article key={label} className="rounded-xl border border-white/10 bg-white/5 p-3 sm:p-4">
            <p className="text-xs uppercase tracking-wide text-white/50">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value ?? "-"}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-white/10 bg-white/5 p-3 sm:p-4">
          <p className="text-xs uppercase tracking-wide text-white/50">Tempo medio 1a resposta</p>
          <p className="mt-2 text-2xl font-semibold">{formatSeconds(kpis?.avgFirstResponseTimeSec ?? null)}</p>
        </article>
        <article className="rounded-xl border border-white/10 bg-white/5 p-3 sm:p-4">
          <p className="text-xs uppercase tracking-wide text-white/50">Tempo medio resolucao</p>
          <p className="mt-2 text-2xl font-semibold">{formatSeconds(kpis?.avgResolutionTimeSec ?? null)}</p>
        </article>
        <article className="rounded-xl border border-white/10 bg-white/5 p-3 sm:p-4">
          <p className="text-xs uppercase tracking-wide text-white/50">Violacoes SLA</p>
          <p className="mt-2 text-2xl font-semibold">{kpis?.slaBreaches ?? "-"}</p>
        </article>
        <article className="rounded-xl border border-white/10 bg-white/5 p-3 sm:p-4">
          <p className="text-xs uppercase tracking-wide text-white/50">Total de conversas</p>
          <p className="mt-2 text-2xl font-semibold">{kpis?.totalConversations ?? "-"}</p>
        </article>
      </section>

      <section className="overflow-x-auto rounded-xl border border-white/10 bg-white/5">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Fila operacional</h2>
            <p className="mt-0.5 text-xs text-white/55">
              Conversas aguardando atendimento, ordenadas pelo maior tempo em fila.
            </p>
          </div>
          <span className="text-xs text-white/45">
            {overview?.generatedAt ? `Gerado em ${formatDateTime(overview.generatedAt)}` : ""}
          </span>
        </div>
        {overview?.queue.length ? (
          <table className="w-full min-w-[920px] text-sm">
            <thead className="bg-white/10 text-left">
              <tr>
                <th className="px-3 py-2">Contato</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Setor</th>
                <th className="px-3 py-2">Atendente</th>
                <th className="px-3 py-2">Ultima interacao</th>
                <th className="px-3 py-2">Tempo em fila</th>
                <th className="px-3 py-2 text-right">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {overview.queue.map((item) => (
                <tr key={item.id} className="border-t border-white/10">
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => router.push(`/app/inbox`)}
                      className="text-left text-white hover:text-re7-sky"
                    >
                      <span className="block font-medium">{item.displayName || item.waId}</span>
                      <span className="block text-xs text-white/45">{item.waId}</span>
                    </button>
                  </td>
                  <td className="px-3 py-2">{getStatusLabel(item.status)}</td>
                  <td className="px-3 py-2">{item.departmentName ?? "-"}</td>
                  <td className="px-3 py-2">{item.assignedUserName ?? "-"}</td>
                  <td className="px-3 py-2">{formatDateTime(item.lastInteractionAt)}</td>
                  <td className="px-3 py-2">{formatElapsed(item.waitingSince)}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleClaim(item.waId)}
                        disabled={Boolean(actionKey)}
                        className="rounded-md border border-emerald-300/30 bg-emerald-400/10 px-2.5 py-1.5 text-xs text-emerald-50 hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {actionKey === `claim:${item.waId}` ? "Assumindo..." : "Assumir"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleClose(item.waId)}
                        disabled={Boolean(actionKey)}
                        className="rounded-md border border-red-300/30 bg-red-400/10 px-2.5 py-1.5 text-xs text-red-50 hover:bg-red-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {actionKey === `close:${item.waId}` ? "Encerrando..." : "Encerrar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="p-4 text-sm text-white/70">Nenhuma conversa aguardando atendimento.</p>
        )}
      </section>
    </AppShell>
  );
}
