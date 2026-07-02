"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { FeedbackToast, usePausableFeedbackAutoDismiss } from "@/components/ui/FeedbackToast";
import {
  AppApiError,
  AppSession,
  clearAppSession,
  exportAppConversationReportCsv,
  fetchAppConversationReport,
  fetchAppDepartments,
  fetchAppRetentionConfig,
  fetchAppTenantSummary,
  fetchAppUsers,
  loadAppSession,
  saveAppSession,
  type AppTenantSummary,
} from "@/lib/appClientApi";
import type {
  AdminDepartmentItem,
  AdminUserItem,
  ConversationReportRange,
  ConversationReportResponse,
} from "@/lib/whatsappAdminApi";

const REPORT_RANGES: ConversationReportRange[] = ["1d", "7d", "30d"];

const RANGE_LABELS: Record<ConversationReportRange, string> = {
  "1d": "Ultimas 24 horas",
  "7d": "Ultimos 7 dias",
  "30d": "Ultimos 30 dias",
  custom: "Periodo exato",
};

const REPORT_CHANNELS = [
  { value: "", label: "Todos" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "messenger", label: "Facebook/Messenger" },
  { value: "instagram", label: "Instagram" },
] as const;

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

function toDateTimeLocalValue(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function dateTimeLocalToIso(value: string) {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default function AppReportsPage() {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [departments, setDepartments] = useState<AdminDepartmentItem[]>([]);
  const [range, setRange] = useState<ConversationReportRange>("7d");
  const [periodMode, setPeriodMode] = useState<"preset" | "custom">("preset");
  const [customFrom, setCustomFrom] = useState(() => toDateTimeLocalValue(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));
  const [customTo, setCustomTo] = useState(() => toDateTimeLocalValue(new Date()));
  const [dedupe, setDedupe] = useState(false);
  const [channel, setChannel] = useState("");
  const [userId, setUserId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [report, setReport] = useState<ConversationReportResponse | null>(null);
  const [retentionDays, setRetentionDays] = useState<number | null>(null);
  const [tenant, setTenant] = useState<AppTenantSummary | null>(null);

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

  const toastHandlers = usePausableFeedbackAutoDismiss(Boolean(error || success), () => {
      setError(null);
      setSuccess(null);
    });

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    Promise.all([fetchAppUsers(session), fetchAppDepartments(session), fetchAppTenantSummary(session)])
      .then(([usersResponse, departmentsResponse, tenantResponse]) => {
        if (cancelled) return;
        setUsers(usersResponse.items);
        setDepartments(departmentsResponse.items);
        setTenant(tenantResponse.tenant);
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
    if (!session || !isAdminRole(session.user.role)) return;
    let cancelled = false;
    fetchAppRetentionConfig(session)
      .then((response) => {
        if (!cancelled) setRetentionDays(response.retentionDays);
      })
      .catch(() => {
        if (!cancelled) setRetentionDays(null);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const fromIso = periodMode === "custom" ? dateTimeLocalToIso(customFrom) : null;
    const toIso = periodMode === "custom" ? dateTimeLocalToIso(customTo) : null;
    if (periodMode === "custom" && (!fromIso || !toIso || Date.parse(fromIso) > Date.parse(toIso))) {
      setLoading(false);
      setReport(null);
      setError("Informe um periodo exato valido.");
      return;
    }
    fetchAppConversationReport(session, {
      range: periodMode === "custom" ? "custom" : range,
      from: fromIso,
      to: toIso,
      dedupe,
      channel: channel || null,
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
  }, [channel, customFrom, customTo, dedupe, departmentId, handleUnauthorized, periodMode, range, router, session, userId]);

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
      const fromIso = periodMode === "custom" ? dateTimeLocalToIso(customFrom) : null;
      const toIso = periodMode === "custom" ? dateTimeLocalToIso(customTo) : null;
      const csv = await exportAppConversationReportCsv(session, {
        range: periodMode === "custom" ? "custom" : range,
        from: fromIso,
        to: toIso,
        dedupe,
        channel: channel || null,
        userId: userId || null,
        departmentId: isAdminRole(session.user.role) ? departmentId || null : null,
      });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `conversation-report-app-${periodMode === "custom" ? "custom" : range}${dedupe ? "-dedupe" : ""}.csv`;
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

  const handleGeneratePdf = () => {
    if (!session || !report) {
      setError("Carregue um relatorio antes de gerar o PDF.");
      return;
    }
    const tenantName = tenant?.name || session.user.clientId;
    const departmentLabel = departmentId
      ? departments.find((item) => item.id === departmentId)?.name ?? departmentId
      : "Todos";
    const userLabel = userId ? userNameById.get(userId) ?? userId : "Todos";
    const channelLabel = REPORT_CHANNELS.find((item) => item.value === channel)?.label ?? "Todos";
    const periodLabel =
      periodMode === "custom"
        ? `${formatDateTime(report.periodFrom)} a ${formatDateTime(report.periodTo)}`
        : RANGE_LABELS[range];
    const byDepartmentRows = report.byDepartment.length
      ? report.byDepartment
          .map(
            (item) => `
              <tr>
                <td>${escapeHtml(item.departmentName ?? "-")}</td>
                <td>${escapeHtml(item.conversations)}</td>
                <td>${escapeHtml(formatSeconds(item.avgResponseTimeSec))}</td>
              </tr>`
          )
          .join("")
      : `<tr><td colspan="3">Nenhum dado por setor.</td></tr>`;
    const byAgentRows = report.byAgent.length
      ? report.byAgent
          .map(
            (item) => `
              <tr>
                <td>${escapeHtml(userNameById.get(item.userId) ?? item.userId)}</td>
                <td>${escapeHtml(item.conversations)}</td>
                <td>${escapeHtml(formatSeconds(item.avgResponseTimeSec))}</td>
              </tr>`
          )
          .join("")
      : `<tr><td colspan="3">Nenhum dado por atendente.</td></tr>`;
    const byChannelRows = report.byChannel?.length
      ? report.byChannel
          .map(
            (item) => `
              <tr>
                <td>${escapeHtml(item.channelName)}</td>
                <td>${escapeHtml(item.conversations)}</td>
              </tr>`
          )
          .join("")
      : `<tr><td colspan="2">Nenhum dado por canal.</td></tr>`;
    const protocolRows = report.conversations?.length
      ? report.conversations
          .slice(0, 100)
          .map(
            (item) => `
              <tr>
                <td>${escapeHtml(item.protocol)}</td>
                <td>${escapeHtml(item.channelName)}</td>
                <td>${escapeHtml(item.departmentName ?? "-")}</td>
                <td>${escapeHtml(item.status ?? "-")}</td>
                <td>${escapeHtml(formatDateTime(item.startedAt))}</td>
              </tr>`
          )
          .join("")
      : `<tr><td colspan="5">Nenhum protocolo no periodo selecionado.</td></tr>`;
    const html = `<!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>Relatorio de conversas - Converta</title>
          <style>
            @page { size: A4; margin: 16mm; }
            * { box-sizing: border-box; }
            body { margin: 0; font-family: Arial, sans-serif; color: #102033; background: #fff; }
            header { display: flex; align-items: center; justify-content: space-between; gap: 24px; border-bottom: 2px solid #0ea5e9; padding-bottom: 16px; }
            .brand { display: flex; align-items: center; gap: 14px; }
            .brand img { width: 150px; height: auto; }
            .eyebrow { margin: 0 0 4px; color: #64748b; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
            h1 { margin: 0; font-size: 22px; color: #0f172a; }
            .generated { text-align: right; color: #64748b; font-size: 11px; }
            .meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 20px; margin: 18px 0; padding: 12px; border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc; font-size: 12px; }
            .meta strong { color: #0f172a; }
	            .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 18px 0; }
            .card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; background: #fff; }
            .card span { display: block; color: #64748b; font-size: 10px; font-weight: 700; text-transform: uppercase; }
            .card strong { display: block; margin-top: 8px; font-size: 20px; color: #0f172a; }
            h2 { margin: 20px 0 8px; font-size: 15px; color: #0f172a; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th { text-align: left; background: #0f2742; color: #fff; padding: 8px; }
            td { border-bottom: 1px solid #e2e8f0; padding: 8px; }
            footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 10px; }
            .print-actions { position: sticky; top: 0; z-index: 10; display: flex; justify-content: flex-end; margin: 0 0 16px; padding: 10px 0; background: rgba(255, 255, 255, .94); backdrop-filter: blur(8px); }
            .print-actions button { border: 0; border-radius: 8px; background: #0f2742; color: #fff; cursor: pointer; font-size: 13px; font-weight: 700; padding: 10px 14px; }
            .print-actions button:hover { background: #123a62; }
            @media print {
              .print-actions { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="print-actions">
            <button type="button" onclick="window.print()">Imprimir ou salvar em PDF</button>
          </div>
          <header>
            <div class="brand">
              <img src="${window.location.origin}/images/converta-logo-dark.png" alt="Converta" />
              <div>
                <p class="eyebrow">Relatorio operacional</p>
                <h1>Conversas iniciadas por clientes/leads</h1>
              </div>
            </div>
            <div class="generated">Gerado em<br /><strong>${escapeHtml(formatDateTime(new Date().toISOString()))}</strong></div>
          </header>
          <section class="meta">
            <div><strong>Tenant:</strong> ${escapeHtml(tenantName)}</div>
            <div><strong>Telefone:</strong> ${escapeHtml(tenant?.phoneDisplay ?? "-")}</div>
            <div><strong>Periodo:</strong> ${escapeHtml(periodLabel)}</div>
            <div><strong>Duplicados:</strong> ${dedupe ? "desconsiderados" : "incluidos"}</div>
            <div><strong>Canal:</strong> ${escapeHtml(channelLabel)}</div>
            <div><strong>Setor:</strong> ${escapeHtml(departmentLabel)}</div>
            <div><strong>Atendente:</strong> ${escapeHtml(userLabel)}</div>
          </section>
          <section class="cards">
            <div class="card"><span>Conversas</span><strong>${escapeHtml(report.totalConversations)}</strong></div>
	            <div class="card"><span>Primeira resposta media</span><strong>${escapeHtml(formatSeconds(report.avgFirstResponseTimeSec))}</strong></div>
	            <div class="card"><span>Resolucao media</span><strong>${escapeHtml(formatSeconds(report.avgResolutionTimeSec))}</strong></div>
	            <div class="card"><span>Automatizados</span><strong>${escapeHtml(report.automatedConversations ?? 0)}</strong></div>
	            <div class="card"><span>Transferencias humano</span><strong>${escapeHtml(report.humanTransferCount ?? 0)}</strong></div>
	            <div class="card"><span>Fora do SLA</span><strong>${escapeHtml(report.slaBreaches)}</strong></div>
          </section>
          <h2>Protocolos de atendimento</h2>
          <table><thead><tr><th>Protocolo</th><th>Canal</th><th>Setor</th><th>Status</th><th>Inicio</th></tr></thead><tbody>${protocolRows}</tbody></table>
          <h2>Por canal</h2>
          <table><thead><tr><th>Canal</th><th>Conversas</th></tr></thead><tbody>${byChannelRows}</tbody></table>
          <h2>Por setor</h2>
          <table><thead><tr><th>Setor</th><th>Conversas</th><th>Tempo medio de resposta</th></tr></thead><tbody>${byDepartmentRows}</tbody></table>
          <h2>Por atendente</h2>
          <table><thead><tr><th>Atendente</th><th>Conversas</th><th>Tempo medio de resposta</th></tr></thead><tbody>${byAgentRows}</tbody></table>
          <footer>Converta - Central Inteligente de Atendimento e Vendas. Relatorio gerado para uso operacional interno.</footer>
        </body>
      </html>`;
    const popup = window.open("", "_blank", "width=960,height=720");
    if (!popup) {
      setError("Nao foi possivel abrir a janela do PDF. Verifique o bloqueador de pop-ups.");
      return;
    }
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    popup.focus();
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
      <FeedbackToast message={success} {...toastHandlers} />
      <FeedbackToast message={error} variant="error" {...toastHandlers} />

      {retentionDays !== null && retentionDays < 30 ? (
        <section className="rounded-xl border border-amber-300/30 bg-amber-500/10 p-3 text-sm text-amber-50 sm:p-4">
          A retencao LGPD esta configurada para {retentionDays} dia
          {retentionDays === 1 ? "" : "s"}. Relatorios e historico operacional podem ficar reduzidos
          quando a retencao for executada.
        </section>
      ) : null}

      <section className="rounded-xl border border-white/10 bg-white/5 p-3 sm:p-4">
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="grid gap-1 text-sm">
            <span className="text-white/70">Tipo de periodo</span>
            <select
              className="w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
              value={periodMode}
              onChange={(event) => setPeriodMode(event.target.value as "preset" | "custom")}
            >
              <option value="preset">Periodo rapido</option>
              <option value="custom">Periodo exato</option>
            </select>
          </label>

          {periodMode === "preset" ? (
          <label className="grid gap-1 text-sm">
            <span className="text-white/70">Periodo rapido</span>
            <select
              className="w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
              value={range}
              onChange={(event) => setRange(event.target.value as ConversationReportRange)}
            >
              {REPORT_RANGES.map((item) => (
                <option key={item} value={item}>
                  {RANGE_LABELS[item]}
                </option>
              ))}
            </select>
          </label>
          ) : (
            <>
              <label className="grid gap-1 text-sm">
                <span className="text-white/70">Inicio exato</span>
                <input
                  type="datetime-local"
                  className="w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                  value={customFrom}
                  onChange={(event) => setCustomFrom(event.target.value)}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-white/70">Fim exato</span>
                <input
                  type="datetime-local"
                  className="w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                  value={customTo}
                  onChange={(event) => setCustomTo(event.target.value)}
                />
              </label>
            </>
          )}

          <label className="grid gap-1 text-sm">
            <span className="text-white/70">Canal</span>
            <select
              className="w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
              value={channel}
              onChange={(event) => setChannel(event.target.value)}
            >
              {REPORT_CHANNELS.map((item) => (
                <option key={item.value || "all"} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-white/70">Atendente</span>
            <select
              className="w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
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
              className="w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky disabled:cursor-not-allowed disabled:opacity-60"
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
            <label className="flex min-h-10 w-full items-center gap-2 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-white/30 bg-re7-navy"
                checked={dedupe}
                onChange={(event) => setDedupe(event.target.checked)}
              />
              Desconsiderar duplicados
            </label>
          </div>

          <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-4">
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="min-w-0 flex-1 rounded-md border border-re7-sky/30 bg-re7-sky/10 px-3 py-2 text-sm text-white hover:bg-re7-sky/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {exporting ? "Exportando..." : "Exportar CSV"}
            </button>
            <button
              type="button"
              onClick={handleGeneratePdf}
              disabled={!report}
              className="min-w-0 flex-1 rounded-md border border-emerald-300/30 bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Gerar PDF
            </button>
          </div>
        </div>
      </section>

      {loading ? <p className="text-sm text-white/70">Carregando relatorios...</p> : null}

	      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
	        <article className="rounded-xl border border-white/10 bg-white/5 p-3 sm:p-4">
	          <p className="text-xs uppercase tracking-wide text-white/50">Conversas</p>
	          <p className="mt-2 text-2xl font-semibold">{report?.totalConversations ?? "-"}</p>
        </article>
        <article className="rounded-xl border border-white/10 bg-white/5 p-3 sm:p-4">
          <p className="text-xs uppercase tracking-wide text-white/50">Primeira resposta media</p>
          <p className="mt-2 text-2xl font-semibold">
            {formatSeconds(report?.avgFirstResponseTimeSec ?? null)}
          </p>
        </article>
	        <article className="rounded-xl border border-white/10 bg-white/5 p-3 sm:p-4">
	          <p className="text-xs uppercase tracking-wide text-white/50">Resolucao media</p>
	          <p className="mt-2 text-2xl font-semibold">
	            {formatSeconds(report?.avgResolutionTimeSec ?? null)}
	          </p>
	        </article>
	        <article className="rounded-xl border border-white/10 bg-white/5 p-3 sm:p-4">
	          <p className="text-xs uppercase tracking-wide text-white/50">Automatizados</p>
	          <p className="mt-2 text-2xl font-semibold">{report?.automatedConversations ?? "-"}</p>
	        </article>
	        <article className="rounded-xl border border-white/10 bg-white/5 p-3 sm:p-4">
	          <p className="text-xs uppercase tracking-wide text-white/50">Transferencias humano</p>
	          <p className="mt-2 text-2xl font-semibold">{report?.humanTransferCount ?? "-"}</p>
	        </article>
	        <article className="rounded-xl border border-white/10 bg-white/5 p-3 sm:p-4">
	          <p className="text-xs uppercase tracking-wide text-white/50">Fora do SLA</p>
	          <p className="mt-2 text-2xl font-semibold">{report?.slaBreaches ?? "-"}</p>
        </article>
      </section>

      <section className="overflow-x-auto rounded-xl border border-white/10 bg-white/5">
        <div className="border-b border-white/10 px-4 py-3">
          <h2 className="text-sm font-semibold">Protocolos</h2>
        </div>
        {report?.conversations?.length ? (
          <table className="w-full min-w-[780px] text-sm">
            <thead className="bg-white/10 text-left">
              <tr>
                <th className="px-3 py-2">Protocolo</th>
                <th className="px-3 py-2">Canal</th>
                <th className="px-3 py-2">Setor</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Inicio</th>
              </tr>
            </thead>
            <tbody>
              {report.conversations.slice(0, 100).map((item) => (
                <tr key={item.conversationId} className="border-t border-white/10">
                  <td className="px-3 py-2 font-mono text-xs">{item.protocol}</td>
                  <td className="px-3 py-2">{item.channelName}</td>
                  <td className="px-3 py-2">{item.departmentName ?? "-"}</td>
                  <td className="px-3 py-2">{item.status ?? "-"}</td>
                  <td className="px-3 py-2">{formatDateTime(item.startedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="p-4 text-sm text-white/70">Nenhum protocolo no periodo selecionado.</p>
        )}
      </section>

      <section className="overflow-x-auto rounded-xl border border-white/10 bg-white/5">
        <div className="border-b border-white/10 px-4 py-3">
          <h2 className="text-sm font-semibold">Por canal</h2>
        </div>
        {report?.byChannel?.length ? (
          <table className="w-full min-w-[420px] text-sm">
            <thead className="bg-white/10 text-left">
              <tr>
                <th className="px-3 py-2">Canal</th>
                <th className="px-3 py-2">Conversas</th>
              </tr>
            </thead>
            <tbody>
              {report.byChannel.map((item) => (
                <tr key={item.channel} className="border-t border-white/10">
                  <td className="px-3 py-2">{item.channelName}</td>
                  <td className="px-3 py-2">{item.conversations}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="p-4 text-sm text-white/70">Nenhum dado por canal no periodo selecionado.</p>
        )}
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
