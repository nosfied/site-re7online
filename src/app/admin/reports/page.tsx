"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAdminConsole } from "@/components/admin/AdminConsoleProvider";
import { FeedbackToast, usePausableFeedbackAutoDismiss } from "@/components/ui/FeedbackToast";
import { isSelectableDepartment } from "@/lib/departments";
import {
  AdminClientItem,
  AdminDepartmentItem,
  AdminUserItem,
  ConversationReportRange,
  ConversationReportResponse,
  exportConversationReportCsv,
  fetchAdminClients,
  fetchConversationReport,
  fetchDepartments,
  fetchUsers,
} from "@/lib/whatsappAdminApi";

const REPORT_RANGES: ConversationReportRange[] = ["1d", "7d", "30d", "month"];

const REPORT_RANGE_LABELS: Record<ConversationReportRange, string> = {
  "1d": "Ultimas 24 horas",
  "7d": "Ultimos 7 dias",
  "30d": "Ultimos 30 dias",
  month: "Mes fechado anterior",
  custom: "Periodo exato",
};

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

export default function AdminReportsPage() {
  const { connection } = useAdminConsole();
  const searchParams = useSearchParams();
  const clientKeyParam = searchParams.get("clientKey")?.trim() ?? "";
  const tenantIdParam = searchParams.get("tenantId")?.trim() ?? "";
  const [clients, setClients] = useState<AdminClientItem[]>([]);
  const [departments, setDepartments] = useState<AdminDepartmentItem[]>([]);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [clientKey, setClientKey] = useState(clientKeyParam);
  const [range, setRange] = useState<ConversationReportRange>("7d");
  const [userId, setUserId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [report, setReport] = useState<ConversationReportResponse | null>(null);
  const selectableDepartments = useMemo(
    () => departments.filter(isSelectableDepartment),
    [departments]
  );

  const toastHandlers = usePausableFeedbackAutoDismiss(Boolean(error || success), () => {
      setError(null);
      setSuccess(null);
    });

  useEffect(() => {
    if (!connection.baseUrl || !connection.adminToken) return;
    let cancelled = false;
    fetchAdminClients(connection)
      .then((response) => {
        if (cancelled) return;
        setClients(response.items);
        setClientKey((current) => current || clientKeyParam || response.items[0]?.clientKey || "");
      })
      .catch((err: { message?: string }) => {
        if (cancelled) return;
        setError(err.message || "Falha ao carregar tenants.");
      });
    return () => {
      cancelled = true;
    };
  }, [clientKeyParam, connection]);

  useEffect(() => {
    if (!connection.baseUrl || !connection.adminToken || !clientKey) return;
    let cancelled = false;
    Promise.all([
      fetchUsers(connection, clientKey),
      fetchDepartments(connection, clientKey, { includeInactive: true }),
    ])
      .then(([usersResponse, departmentsResponse]) => {
        if (cancelled) return;
        setUsers(usersResponse.items);
        setDepartments(departmentsResponse.items);
        setUserId((current) =>
          current && usersResponse.items.some((item) => item.id === current) ? current : ""
        );
        setDepartmentId((current) =>
          current && departmentsResponse.items.some((item) => item.id === current) ? current : ""
        );
      })
      .catch((err: { message?: string }) => {
        if (cancelled) return;
        setUsers([]);
        setDepartments([]);
        setError(err.message || "Falha ao carregar usuarios do tenant.");
      });
    return () => {
      cancelled = true;
    };
  }, [clientKey, connection]);

  useEffect(() => {
    if (!connection.baseUrl || !connection.adminToken || !clientKey) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchConversationReport(connection, {
      clientKey,
      range,
      userId: userId || null,
      departmentId: departmentId || null,
    })
      .then((response) => {
        if (cancelled) return;
        setReport(response);
      })
      .catch((err: { message?: string }) => {
        if (cancelled) return;
        setError(err.message || "Falha ao carregar relatorio.");
        setReport(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientKey, connection, range, userId, departmentId]);

  const userNameById = useMemo(
    () => new Map(users.map((item) => [item.id, item.name])),
    [users]
  );

  const handleExport = async () => {
    if (!clientKey) return;
    setExporting(true);
    setError(null);
    setSuccess(null);
    try {
      const csv = await exportConversationReportCsv(connection, {
        clientKey,
        range,
        userId: userId || null,
        departmentId: departmentId || null,
      });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `conversation-report-${clientKey}-${range}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setSuccess("CSV exportado com sucesso.");
    } catch (err) {
      const typed = err as { message?: string };
      setError(typed.message || "Falha ao exportar CSV.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="px-4 py-8 text-white md:px-8">
      <FeedbackToast message={success} {...toastHandlers} />
      <FeedbackToast message={error} variant="error" {...toastHandlers} />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Relatorios</h1>
            <p className="text-sm text-white/70">SLA e tempos medios baseados em ConversationMetrics.</p>
            {tenantIdParam || clientKeyParam ? (
              <p className="mt-1 text-xs text-white/50">
                Tenant filtrado: {tenantIdParam || clientKeyParam}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleExport}
              disabled={!clientKey || exporting}
              className="rounded-md border border-re7-sky/30 bg-re7-sky/10 px-3 py-2 text-sm text-white hover:bg-re7-sky/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {exporting ? "Exportando..." : "Exportar CSV"}
            </button>
            <Link
              href="/admin/tenants"
              className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
            >
              Voltar
            </Link>
          </div>
        </header>

        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="grid gap-3 md:grid-cols-4">
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Tenant</span>
              <select
                className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                value={clientKey}
                onChange={(event) => setClientKey(event.target.value)}
              >
                <option value="">Selecione...</option>
                {clients.map((item) => (
                  <option key={item.clientKey} value={item.clientKey}>
                    {item.name} ({item.clientKey})
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Periodo</span>
              <select
                className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                value={range}
                onChange={(event) => setRange(event.target.value as ConversationReportRange)}
              >
                {REPORT_RANGES.map((item) => (
                  <option key={item} value={item}>
                    {REPORT_RANGE_LABELS[item]}
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
                className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                value={departmentId}
                onChange={(event) => setDepartmentId(event.target.value)}
              >
                <option value="">Todos</option>
                {selectableDepartments.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {loading ? <p className="text-sm text-white/70">Carregando relatorio...</p> : null}
        <section className="grid gap-4 md:grid-cols-4">
          <article className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wide text-white/50">Conversas</p>
            <p className="mt-2 text-2xl font-semibold">{report?.totalConversations ?? "-"}</p>
          </article>
          <article className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wide text-white/50">1a resposta media</p>
            <p className="mt-2 text-2xl font-semibold">{formatSeconds(report?.avgFirstResponseTimeSec ?? null)}</p>
          </article>
          <article className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wide text-white/50">Resolucao media</p>
            <p className="mt-2 text-2xl font-semibold">{formatSeconds(report?.avgResolutionTimeSec ?? null)}</p>
          </article>
          <article className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wide text-white/50">Breaches SLA</p>
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
                  <th className="px-3 py-2">Department ID</th>
                  <th className="px-3 py-2">Nome</th>
                  <th className="px-3 py-2">Conversas</th>
                  <th className="px-3 py-2">Tempo medio de resposta</th>
                </tr>
              </thead>
              <tbody>
                {report.byDepartment.map((item) => (
                  <tr
                    key={item.departmentId ?? "__none__"}
                    className="border-t border-white/10"
                  >
                    <td className="px-3 py-2 font-mono text-xs">{item.departmentId ?? "-"}</td>
                    <td className="px-3 py-2">{item.departmentName ?? "-"}</td>
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
                  <th className="px-3 py-2">User ID</th>
                  <th className="px-3 py-2">Nome</th>
                  <th className="px-3 py-2">Conversas</th>
                  <th className="px-3 py-2">Tempo medio de resposta</th>
                </tr>
              </thead>
              <tbody>
                {report.byAgent.map((item) => (
                  <tr key={item.userId} className="border-t border-white/10">
                    <td className="px-3 py-2 font-mono text-xs">{item.userId}</td>
                    <td className="px-3 py-2">{userNameById.get(item.userId) ?? "-"}</td>
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
      </div>
    </div>
  );
}
