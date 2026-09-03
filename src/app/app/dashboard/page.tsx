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
import { getAppProfile, type AppProfile } from "@/lib/appFeatures";
import { getAppErrorUxMessage, getConversationStatusUxLabel } from "@/lib/appUxLabels";
import { formatUserDisplayName } from "@/lib/userDisplayName";
import type {
  AdminDepartmentItem,
  AdminUserItem,
  ConversationOperationalStatus,
} from "@/lib/whatsappAdminApi";

const STATUS_OPTIONS: Array<{ value: "" | ConversationOperationalStatus; label: string }> = [
  { value: "", label: "Todos" },
  { value: "WAITING", label: "Aguardando atendimento" },
  { value: "IN_PROGRESS", label: "Em atendimento" },
  { value: "WAITING_USER", label: "Aguardando resposta do cliente" },
  { value: "CLOSED", label: "Encerrados" },
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

function getElapsedMinutes(value: string | null, now: number) {
  if (!value) return "-";
  const date = new Date(value);
  const diffMs = now - date.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return "-";
  return Math.floor(diffMs / 60000);
}

function formatElapsed(value: string | null, now: number) {
  const minutes = getElapsedMinutes(value, now);
  if (minutes === "-") return "-";
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
  return getConversationStatusUxLabel(status);
}

function getStatusTone(status: ConversationOperationalStatus) {
  switch (status) {
    case "WAITING":
      return "border-amber-300/30 bg-amber-400/10 text-amber-100";
    case "IN_PROGRESS":
      return "border-emerald-300/30 bg-emerald-400/10 text-emerald-100";
    case "WAITING_USER":
      return "border-sky-300/30 bg-sky-400/10 text-sky-100";
    case "CLOSED":
      return "border-white/15 bg-white/10 text-white/65";
  }
}

function getQueueAgeTone(waitingSince: string | null, now: number) {
  const minutes = getElapsedMinutes(waitingSince, now);
  if (minutes === "-") return "border-white/15 bg-white/10 text-white/65";
  if (minutes > 120) return "border-red-300/35 bg-red-400/15 text-red-100";
  if (minutes >= 30) return "border-amber-300/35 bg-amber-400/15 text-amber-100";
  return "border-white/15 bg-white/10 text-white/75";
}

function getProfileLabels(profile: AppProfile) {
  if (profile === "government") {
    return {
      people: "Cidadãos",
      reports: "Indicadores",
      queue: "Demandas",
      dashboardSubtitle: "Acompanhe filas, responsáveis e indicadores atualizados quase em tempo real.",
    };
  }
  return {
    people: "Clientes",
    reports: "Relatórios",
    queue: "Fila operacional",
    dashboardSubtitle: "Acompanhe filas, responsáveis e indicadores atualizados quase em tempo real.",
  };
}

function StatusBadge({ status }: { status: ConversationOperationalStatus }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${getStatusTone(status)}`}>
      {getStatusLabel(status)}
    </span>
  );
}

function QueueAgeBadge({ waitingSince, now }: { waitingSince: string | null; now: number }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${getQueueAgeTone(waitingSince, now)}`}>
      {formatElapsed(waitingSince, now)}
    </span>
  );
}

function TeamPresenceBadge({ online }: { online: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${
        online
          ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
          : "border-white/15 bg-white/10 text-white/65"
      }`}
    >
      {online ? "Online" : "Offline"}
    </span>
  );
}

function DashboardSectionHeader({
  title,
  description,
  right,
}: {
  title: string;
  description?: string;
  right?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-white/55">{description}</p> : null}
      </div>
      {right ? <span className="shrink-0 text-xs text-white/45">{right}</span> : null}
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number | string | null | undefined;
  tone?: "neutral" | "ok" | "warning" | "critical";
}) {
  const toneClasses = {
    neutral: "border-white/10 bg-white/5 hover:bg-white/10",
    ok: "border-emerald-300/25 bg-emerald-400/10 hover:bg-emerald-400/15",
    warning: "border-amber-300/30 bg-amber-400/10 hover:bg-amber-400/15",
    critical: "border-red-300/30 bg-red-400/10 hover:bg-red-400/15",
  }[tone];

  return (
    <article className={`rounded-xl border p-3 transition-all sm:p-4 ${toneClasses}`}>
      <p className="text-xs uppercase tracking-wide text-white/50">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value ?? "-"}</p>
    </article>
  );
}

function DashboardSkeleton() {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Carregando painel">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="h-3 w-24 animate-pulse rounded bg-white/15" />
          <div className="mt-4 h-8 w-16 animate-pulse rounded bg-white/20" />
        </div>
      ))}
    </section>
  );
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
  const [now, setNow] = useState(() => Date.now());

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
        setError(getAppErrorUxMessage({ status: typed.status, message: typed.message, fallback: "Não foi possível carregar o painel." }));
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
        setError(getAppErrorUxMessage({ status: typed.status, message: typed.message, fallback: "Não foi possível carregar os filtros." }));
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
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

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
      setError(getAppErrorUxMessage({ status: typed.status, message: typed.message, fallback: "Não foi possível assumir o atendimento." }));
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
      setError(getAppErrorUxMessage({ status: typed.status, message: typed.message, fallback: "Não foi possível encerrar o atendimento." }));
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
        title="Painel"
        subtitle="Visão operacional dos atendimentos."
      >
        <section className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/75">
          Este módulo está disponível apenas para supervisores e administradores.
        </section>
      </AppShell>
    );
  }

  const kpis = overview?.kpis;
  const openConversations =
    (kpis?.waiting ?? 0) + (kpis?.active ?? 0) + (kpis?.waitingUser ?? 0);
  const profile = getAppProfile(session);
  const labels = getProfileLabels(profile);
  const showDashboardContent = Boolean(overview) || !loading;

  return (
    <AppShell
      session={session}
      title="Painel"
      subtitle={labels.dashboardSubtitle}
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
            <span className="text-white/70">Situação</span>
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

      {loading && !overview ? <DashboardSkeleton /> : null}

      {showDashboardContent ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard label="Atendimentos ativos" value={openConversations} tone={openConversations > 0 ? "ok" : "neutral"} />
            <KpiCard label={labels.queue} value={kpis?.waiting} tone={(kpis?.waiting ?? 0) > 0 ? "warning" : "neutral"} />
            <KpiCard label="Em atendimento" value={kpis?.active} tone={(kpis?.active ?? 0) > 0 ? "ok" : "neutral"} />
            <KpiCard label="Aguardando cliente" value={kpis?.waitingUser} tone={(kpis?.waitingUser ?? 0) > 0 ? "warning" : "neutral"} />
            <KpiCard label="Encerrados hoje" value={kpis?.closedToday} tone={(kpis?.closedToday ?? 0) > 0 ? "ok" : "neutral"} />
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={labels.reports}>
            <KpiCard label="Tempo médio da 1ª resposta" value={formatSeconds(kpis?.avgFirstResponseTimeSec ?? null)} />
            <KpiCard label="Tempo médio até encerrar" value={formatSeconds(kpis?.avgResolutionTimeSec ?? null)} />
            <KpiCard label="Prazos excedidos" value={kpis?.slaBreaches} tone={(kpis?.slaBreaches ?? 0) > 0 ? "critical" : "neutral"} />
            <KpiCard label={`Total de ${labels.people}`} value={kpis?.totalConversations} />
          </section>

          <section className="overflow-x-auto rounded-xl border border-white/10 bg-white/5">
            <DashboardSectionHeader
              title="Presença da equipe"
              description="Online indica que o atendente está disponível na plataforma com presença recente confirmada. Esse é o mesmo status considerado pela distribuição automática quando a opção 'Exigir atendente online' está ativa."
              right={overview?.teamPresence ? `${overview.teamPresence.summary.online} online · ${overview.teamPresence.summary.offline} offline · ${overview.teamPresence.summary.inService} em atendimento` : ""}
            />
            {overview?.teamPresence.items.length ? (
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-white/10 text-left">
                  <tr>
                    <th className="px-3 py-2">Atendente</th>
                    <th className="px-3 py-2">Setor</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Último sinal</th>
                    <th className="px-3 py-2 text-right">Atendimentos ativos</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.teamPresence.items.map((item) => (
                    <tr key={item.userId} className="border-t border-white/10 transition-colors hover:bg-white/5">
                      <td className="px-3 py-2">
                        <span className="block font-medium text-white">{item.name}</span>
                        <span className="block text-xs text-white/45">{item.role}</span>
                      </td>
                      <td className="px-3 py-2">
                        {item.departments.length
                          ? item.departments.map((department) => department.name ?? "Setor sem nome").join(", ")
                          : "-"}
                      </td>
                      <td className="px-3 py-2"><TeamPresenceBadge online={item.online} /></td>
                      <td className="px-3 py-2">
                        {item.heartbeatAgeSec === null
                          ? "-"
                          : item.heartbeatAgeSec < 60
                            ? `${item.heartbeatAgeSec}s`
                            : formatElapsed(item.lastHeartbeatAt, now)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{item.activeConversationCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="grid min-h-32 place-items-center p-6 text-center">
                <div>
                  <p className="text-sm font-medium text-white">Nenhum atendente operacional visível.</p>
                  <p className="mt-1 text-xs text-white/55">
                    Verifique o vínculo dos usuários aos setores operacionais.
                  </p>
                </div>
              </div>
            )}
          </section>

          <section className="overflow-x-auto rounded-xl border border-white/10 bg-white/5">
            <DashboardSectionHeader
              title={labels.queue}
              description="Conversas aguardando atendimento, ordenadas pelo maior tempo em fila."
              right={overview?.generatedAt ? `Gerado em ${formatDateTime(overview.generatedAt)}` : ""}
            />
            {overview?.queue.length ? (
              <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-white/10 text-left">
              <tr>
                <th className="px-3 py-2">Contato</th>
                <th className="px-3 py-2">Situação</th>
                <th className="px-3 py-2">Setor</th>
                <th className="px-3 py-2">Atendente</th>
                <th className="px-3 py-2">Última interação</th>
                <th className="px-3 py-2">Tempo em fila</th>
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {overview.queue.map((item) => (
                <tr key={item.id} className="border-t border-white/10 transition-colors hover:bg-white/5">
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
                  <td className="px-3 py-2"><StatusBadge status={item.status} /></td>
                  <td className="px-3 py-2">{item.departmentName ?? "-"}</td>
                  <td className="px-3 py-2">{formatUserDisplayName(item.assignedUserName, "-")}</td>
                  <td className="px-3 py-2">{formatDateTime(item.lastInteractionAt)}</td>
                  <td className="px-3 py-2"><QueueAgeBadge waitingSince={item.waitingSince} now={now} /></td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleClaim(item.waId)}
                        disabled={Boolean(actionKey)}
                        className="rounded-md bg-re7-sky px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm shadow-sky-950/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {actionKey === `claim:${item.waId}` ? "Assumindo..." : "Assumir"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleClose(item.waId)}
                        disabled={Boolean(actionKey)}
                        className="rounded-md border border-white/20 bg-white/5 px-2.5 py-1.5 text-xs text-white/75 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
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
              <div className="grid min-h-32 place-items-center p-6 text-center">
                <div>
                  <p className="text-sm font-medium text-white">Nenhuma conversa aguardando atendimento.</p>
                  <p className="mt-1 text-xs text-white/55">
                    Quando novas conversas entrarem na fila, elas aparecerão aqui.
                  </p>
                </div>
              </div>
            )}
          </section>
        </>
      ) : null}
    </AppShell>
  );
}
