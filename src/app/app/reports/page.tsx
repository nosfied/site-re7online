"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { FeedbackToast } from "@/components/ui/FeedbackToast";
import {
  AppApiError,
  AppSession,
  clearAppSession,
  exportAppConversationReportCsv,
  fetchAppConversationReport,
  fetchAppDepartments,
  fetchAppUsers,
  loadAppSession,
  saveAppSession,
} from "@/lib/appClientApi";
import type {
  AdminDepartmentItem,
  AdminUserItem,
  ConversationReportRange,
  ConversationReportResponse,
} from "@/lib/whatsappAdminApi";

const REPORT_RANGES: ConversationReportRange[] = ["1d", "7d", "30d"];

function canAccessReports(role: string) {
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

export default function AppReportsPage() {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [departments, setDepartments] = useState<AdminDepartmentItem[]>([]);
  const [range, setRange] = useState<ConversationReportRange>("7d");
  const [userId, setUserId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [report, setReport] = useState<ConversationReportResponse | null>(null);

  const handleUnauthorized = useCallback(() => {
    clearAppSession();
    router.replace("/app/login");
  }, [router]);

  useEffect(() => {
    const stored = loadAppSession();
    if (!stored?.token) {
      router.replace("/app/login");
      return;
    }
    if (!canAccessReports(stored.user.role)) {
      router.replace("/app/inbox");
      return;
    }
    setSession(stored);
    saveAppSession(stored);
  }, [router]);

  useEffect(() => {
    if (!error && !success) return;
    const timer = window.setTimeout(() => {
      setError(null);
      setSuccess(null);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [error, success]);

  useEffect(() => {
    if (!session) return;
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
        setError(typed.message || "Falha ao carregar filtros do relatorio.");
      });
    return () => {
      cancelled = true;
    };
  }, [handleUnauthorized, session]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchAppConversationReport(session, {
      range,
      userId: userId || null,
      departmentId: isAdminRole(session.user.role) ? departmentId || null : null,
    })
      .then((response) => {
        if (cancelled) return;
        setReport(response);
        if (!isAdminRole(session.user.role)) {
          setDepartmentId(response.departmentId || "");
        }
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
        setError(typed.message || "Falha ao carregar relatorio.");
        setReport(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [departmentId, handleUnauthorized, range, router, session, userId]);

  const userNameById = useMemo(
    () => new Map(users.map((item) => [item.id, item.name])),
    [users]
  );

  const handleExport = async () => {
    if (!session) return;
    setExporting(true);
    setError(null);
    setSuccess(null);
    try {
      const csv = await exportAppConversationReportCsv(session, {
        range,
        userId: userId || null,
        departmentId: isAdminRole(session.user.role) ? departmentId || null : null,
      });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `conversation-report-app-${range}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setSuccess("CSV exportado com sucesso.");
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(typed.message || "Falha ao exportar CSV.");
    } finally {
      setExporting(false);
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

  const canFilterDepartment = isAdminRole(session.user.role);

  return (
    <AppShell
      session={session}
      title="Relatorios"
      subtitle="Acompanhe tempos de resposta e volume de atendimento do seu time."
    >
      <FeedbackToast message={success} />
      <FeedbackToast message={error} variant="error" />

      <section className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="grid gap-1 text-sm">
            <span className="text-white/70">Periodo</span>
            <select
              className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
              value={range}
              onChange={(event) => setRange(event.target.value as ConversationReportRange)}
            >
              {REPORT_RANGES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-white/70">Atendente</span>
            <select
              className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
            >
              <option value="">Todos</option>
              {users.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.role})
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-white/70">Setor</span>
            <select
              className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky disabled:cursor-not-allowed disabled:opacity-60"
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
              disabled={!canFilterDepartment}
            >
              <option value="">Todos</option>
              {departments.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {!item.isActive ? " (inativo)" : ""}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end">
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="w-full rounded-md border border-re7-sky/30 bg-re7-sky/10 px-3 py-2 text-sm text-white hover:bg-re7-sky/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {exporting ? "Exportando..." : "Exportar CSV"}
            </button>
          </div>
        </div>
      </section>

      {loading ? <p className="text-sm text-white/70">Carregando relatorios...</p> : null}

      <section className="grid gap-4 md:grid-cols-4">
        <article className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-wide text-white/50">Conversas</p>
          <p className="mt-2 text-2xl font-semibold">{report?.totalConversations ?? "-"}</p>
        </article>
        <article className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-wide text-white/50">Primeira resposta media</p>
          <p className="mt-2 text-2xl font-semibold">
            {formatSeconds(report?.avgFirstResponseTimeSec ?? null)}
          </p>
        </article>
        <article className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-wide text-white/50">Resolucao media</p>
          <p className="mt-2 text-2xl font-semibold">
            {formatSeconds(report?.avgResolutionTimeSec ?? null)}
          </p>
        </article>
        <article className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-wide text-white/50">Fora do SLA</p>
          <p className="mt-2 text-2xl font-semibold">{report?.slaBreaches ?? "-"}</p>
        </article>
      </section>

      <section className="overflow-x-auto rounded-xl border border-white/10 bg-white/5">
        <div className="border-b border-white/10 px-4 py-3">
          <h2 className="text-sm font-semibold">Por setor</h2>
        </div>
        {report?.byDepartment.length ? (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-white/10 text-left">
              <tr>
                <th className="px-3 py-2">Departamento</th>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Conversas</th>
                <th className="px-3 py-2">Tempo medio de resposta</th>
              </tr>
            </thead>
            <tbody>
              {report.byDepartment.map((item) => (
                <tr key={item.departmentId ?? "__none__"} className="border-t border-white/10">
                  <td className="px-3 py-2">{item.departmentName ?? "-"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{item.departmentId ?? "-"}</td>
                  <td className="px-3 py-2">{item.conversations}</td>
                  <td className="px-3 py-2">{formatSeconds(item.avgResponseTimeSec)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="p-4 text-sm text-white/70">Nenhum dado por setor no periodo selecionado.</p>
        )}
      </section>

      <section className="overflow-x-auto rounded-xl border border-white/10 bg-white/5">
        <div className="border-b border-white/10 px-4 py-3">
          <h2 className="text-sm font-semibold">Por atendente</h2>
        </div>
        {report?.byAgent.length ? (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-white/10 text-left">
              <tr>
                <th className="px-3 py-2">Atendente</th>
                <th className="px-3 py-2">User ID</th>
                <th className="px-3 py-2">Conversas</th>
                <th className="px-3 py-2">Tempo medio de resposta</th>
              </tr>
            </thead>
            <tbody>
              {report.byAgent.map((item) => (
                <tr key={item.userId} className="border-t border-white/10">
                  <td className="px-3 py-2">{userNameById.get(item.userId) ?? "-"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{item.userId}</td>
                  <td className="px-3 py-2">{item.conversations}</td>
                  <td className="px-3 py-2">{formatSeconds(item.avgResponseTimeSec)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="p-4 text-sm text-white/70">Nenhum dado por atendente no periodo selecionado.</p>
        )}
      </section>
    </AppShell>
  );
}
