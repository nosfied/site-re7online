"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { FeedbackToast, usePausableFeedbackAutoDismiss } from "@/components/ui/FeedbackToast";
import {
  getConversationStatusUxLabel,
  getSessionAuditStatusUxLabel,
  getSessionEndReasonUxLabel,
  getUserRoleUxLabel,
  getAppErrorUxMessage,
} from "@/lib/appUxLabels";
import {
  AppApiError,
  AppCompletedServiceReport,
  AppSession,
  AppSessionAuditReport,
  AppSessionAuditStatus,
  AppSatisfactionReport,
  clearAppSession,
  exportAppCompletedServiceReportCsv,
  exportAppConversationReportCsv,
  exportAppSessionAuditReportCsv,
  exportAppSatisfactionReportCsv,
  fetchAppCompletedServiceReport,
  fetchAppConversationReport,
  fetchAppDepartments,
  fetchAppRetentionConfig,
  fetchAppSatisfactionReport,
  fetchAppSessionAuditReport,
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
import { formatUserDisplayName } from "@/lib/userDisplayName";

const REPORT_RANGES: ConversationReportRange[] = ["1d", "7d", "30d", "month"];

const RANGE_LABELS: Record<ConversationReportRange, string> = {
  "1d": "Últimas 24 horas",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  month: "Mês fechado anterior",
  custom: "Período exato",
};

const REPORT_CHANNELS = [
  { value: "", label: "Todos" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "messenger", label: "Facebook/Messenger" },
  { value: "instagram", label: "Instagram" },
] as const;

const AGENT_ACTIVITY_HISTORY_NOTE =
  "Mensagens por atendente usa a autoria registrada no momento do envio; mensagens históricas anteriores à captura de autoria podem não ser atribuíveis.";
const APP_SESSION_OPEN_LOOKBACK_MS = 12 * 60 * 60 * 1000;
const SESSION_STARTED_AT_FILTER_COPY =
  "Este relatório considera a data e hora de início da sessão. Uma sessão iniciada antes do período selecionado não será exibida, mesmo que continue aberta.";
const SESSION_AUDIT_DISCLAIMER_COPY =
  "Sessões refletem autenticação e atividade observada. Não representam controle de jornada.";

type ReportsTab = "overview" | "conversations" | "sla" | "agents" | "satisfaction" | "sessions" | "exports";

const REPORT_TABS: Array<{ id: ReportsTab; label: string; description: string }> = [
  { id: "overview", label: "Visão geral", description: "Resumo executivo do período" },
  { id: "conversations", label: "Conversas", description: "Volume, canais, setores e protocolos" },
  { id: "sla", label: "SLA de atendimento", description: "Tempos e pontos de atenção" },
  { id: "agents", label: "Atendentes", description: "Atividade humana e atribuição" },
  { id: "satisfaction", label: "Satisfação", description: "CSAT, distribuição e comentários" },
  { id: "sessions", label: "Acessos/Sessões", description: "Auditoria de autenticação" },
  { id: "exports", label: "Exportações", description: "CSV e impressão/PDF" },
];

const SATISFACTION_SCORE_LABELS = [
  { score: 5, label: "Muito Satisfeito", tone: "ok" },
  { score: 4, label: "Satisfeito", tone: "ok" },
  { score: 3, label: "Neutro", tone: "neutral" },
  { score: 2, label: "Insatisfeito", tone: "warn" },
  { score: 1, label: "Muito Insatisfeito", tone: "risk" },
] as const;

function canAccessReports(role: string) {
  const normalized = role.trim().toUpperCase();
  return normalized === "SUPERVISOR" || normalized === "ADMIN";
}

function isAdminRole(role: string) {
  return role.trim().toUpperCase() === "ADMIN";
}

function isSupervisorRole(role: string) {
  return role.trim().toUpperCase() === "SUPERVISOR";
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

function formatObservedDuration(value: number | null) {
  return value === null || value === undefined ? "Em aberto" : formatSeconds(value);
}

const SESSION_ROLE_FILTERS = [
  { value: "", label: "Todos" },
  { value: "ADMIN", label: "Administrador" },
  { value: "SUPERVISOR", label: "Supervisor" },
  { value: "AGENT", label: "Atendente" },
] as const;

const SESSION_STATUS_FILTERS: Array<{ value: "" | AppSessionAuditStatus; label: string }> = [
  { value: "", label: "Todas" },
  { value: "OPEN", label: "Abertas" },
  { value: "CLOSED", label: "Encerradas" },
  { value: "EXPIRED", label: "Expiradas" },
];

function toDateTimeLocalValue(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function dateTimeLocalToIso(value: string) {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function reportRangeToIsoBounds(range: ConversationReportRange) {
  const now = new Date();
  if (range === "month") {
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return {
      from: previousMonthStart.toISOString(),
      to: new Date(currentMonthStart.getTime() - 1).toISOString(),
    };
  }
  const days = range === "1d" ? 1 : range === "7d" ? 7 : 30;
  return {
    from: new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString(),
    to: now.toISOString(),
  };
}

function getReportPeriodIsoBounds(params: {
  periodMode: "preset" | "custom";
  range: ConversationReportRange;
  customFrom: string;
  customTo: string;
}) {
  if (params.periodMode === "custom") {
    return {
      from: dateTimeLocalToIso(params.customFrom),
      to: dateTimeLocalToIso(params.customTo),
    };
  }
  return reportRangeToIsoBounds(params.range);
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

function formatPercent(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value);
}

function formatScore(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  }).format(value);
}

function getSlaOperational(report: ConversationReportResponse | null) {
  return (
    report?.slaOperational ?? {
      waitingFirstResponse: 0,
      inProgress: 0,
      waitingUser: 0,
      closed: 0,
      avgFirstResponseTimeSec: report?.avgFirstResponseTimeSec ?? null,
      avgResolutionTimeSec: report?.avgResolutionTimeSec ?? null,
    }
  );
}

function getSessionStatusTone(status: AppSessionAuditStatus) {
  if (status === "OPEN") return "border-sky-300/25 bg-sky-500/10 text-sky-100";
  if (status === "EXPIRED") return "border-amber-300/25 bg-amber-500/10 text-amber-100";
  return "border-emerald-300/20 bg-emerald-500/10 text-emerald-100";
}

function getReportStatusTone(status?: string | null) {
  const normalized = String(status ?? "").trim().toUpperCase();
  if (normalized === "WAITING") return "border-amber-300/25 bg-amber-500/10 text-amber-100";
  if (normalized === "IN_PROGRESS") return "border-sky-300/25 bg-sky-500/10 text-sky-100";
  if (normalized === "WAITING_USER") return "border-teal-300/25 bg-teal-500/10 text-teal-100";
  if (normalized === "CLOSED") return "border-white/15 bg-white/10 text-white/70";
  return "border-white/15 bg-white/5 text-white/65";
}

function ReportBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "info" | "ok" | "warn" | "risk" }) {
  const toneClass =
    tone === "info"
      ? "border-sky-300/25 bg-sky-500/10 text-sky-100"
      : tone === "ok"
        ? "border-emerald-300/25 bg-emerald-500/10 text-emerald-100"
        : tone === "warn"
          ? "border-amber-300/25 bg-amber-500/10 text-amber-100"
          : tone === "risk"
            ? "border-rose-300/25 bg-rose-500/10 text-rose-100"
            : "border-white/15 bg-white/5 text-white/70";
  return (
    <span className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-medium ${toneClass}`}>
      {children}
    </span>
  );
}

function KpiCard({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  detail?: string;
  tone?: "neutral" | "info" | "ok" | "warn" | "risk";
}) {
  const toneClass =
    tone === "info"
      ? "border-sky-300/20 bg-sky-500/10"
      : tone === "ok"
        ? "border-emerald-300/20 bg-emerald-500/10"
        : tone === "warn"
          ? "border-amber-300/20 bg-amber-500/10"
          : tone === "risk"
            ? "border-rose-300/20 bg-rose-500/10"
            : "border-white/10 bg-white/5";
  return (
    <article className={`report-kpi-card min-w-0 rounded-lg border p-3 ${toneClass}`}>
      <p className="truncate text-xs font-medium uppercase tracking-wide text-white/55">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      {detail ? <p className="mt-1 text-xs leading-relaxed text-white/55">{detail}</p> : null}
    </article>
  );
}

function ReportSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="report-section rounded-xl border border-white/10 bg-white/5">
      <div className="report-section-header border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {description ? <p className="mt-1 max-w-3xl text-xs leading-relaxed text-white/55">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="report-empty-state p-4 text-sm text-white/65">{children}</p>;
}

function SatisfactionAggregateTable({
  titleColumn,
  rows,
  emptyMessage,
  fallbackName,
}: {
  titleColumn: string;
  rows: AppSatisfactionReport["summary"]["byAgent"];
  emptyMessage: string;
  fallbackName: string;
}) {
  return rows.length ? (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="bg-white/10 text-left">
          <tr>
            <th className="px-3 py-2">{titleColumn}</th>
            <th className="px-3 py-2 text-right">Pesquisas enviadas</th>
            <th className="px-3 py-2 text-right">Respostas</th>
            <th className="px-3 py-2 text-right">Taxa</th>
            <th className="px-3 py-2 text-right">Nota média</th>
            {SATISFACTION_SCORE_LABELS.map((item) => (
              <th key={item.score} className="px-3 py-2 text-right">
                {item.score} {item.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.id} className="border-t border-white/10">
              <td className="px-3 py-2">{item.name ?? fallbackName}</td>
              <td className="px-3 py-2 text-right tabular-nums">{item.sent}</td>
              <td className="px-3 py-2 text-right tabular-nums">{item.responded}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatPercent(item.responseRate)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatScore(item.averageScore)}</td>
              {SATISFACTION_SCORE_LABELS.map((scoreLabel) => (
                <td key={scoreLabel.score} className="px-3 py-2 text-right tabular-nums">
                  {item.distribution[String(scoreLabel.score)] ?? 0}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <EmptyState>{emptyMessage}</EmptyState>
  );
}

function CompletedServiceBucketTable({
  titleColumn,
  rows,
  emptyMessage,
}: {
  titleColumn: string;
  rows: AppCompletedServiceReport["byAgent"];
  emptyMessage: string;
}) {
  return rows.length ? (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-sm">
        <thead className="bg-white/10 text-left">
          <tr>
            <th className="px-3 py-2">{titleColumn}</th>
            <th className="px-3 py-2 text-right">Atendimentos concluídos</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.id ?? `none-${item.name}`} className="border-t border-white/10">
              <td className="px-3 py-2">{item.name}</td>
              <td className="px-3 py-2 text-right tabular-nums">{item.completedCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <EmptyState>{emptyMessage}</EmptyState>
  );
}

function completedServiceHistoryMessage(report: AppCompletedServiceReport | null) {
  if (!report) return null;
  if (!report.availableSince) return "Este indicador ainda não possui histórico disponível.";
  return `Dados disponíveis a partir de ${formatDateTime(report.availableSince)}.`;
}

function printEmptyRow(columns: number, message = "Não há dados para o período selecionado.") {
  return `<tr><td colspan="${columns}" class="empty">${escapeHtml(message)}</td></tr>`;
}

function printTableRows(rows: Array<Array<string | number | null | undefined>>, columns: number, emptyMessage?: string) {
  if (!rows.length) return printEmptyRow(columns, emptyMessage);
  return rows
    .map(
      (row) => `
        <tr>
          ${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}
        </tr>`
    )
    .join("");
}

function printMetricCards(cards: Array<{ label: string; value: string | number; tone?: "neutral" | "info" | "ok" | "warn" | "risk" }>) {
  return cards
    .map(
      (card) => `
        <div class="metric metric-${card.tone ?? "neutral"}">
          <span>${escapeHtml(card.label)}</span>
          <strong>${escapeHtml(card.value)}</strong>
        </div>`
    )
    .join("");
}

function averageObservedDuration(items: AppSessionAuditReport["items"]) {
  const durations = items
    .map((item) => item.durationObservedSec)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!durations.length) return null;
  return Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length);
}

function countSessionReason(items: AppSessionAuditReport["items"], reason: string) {
  return items.filter((item) => item.endReason === reason).length;
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
  const [exportingSessions, setExportingSessions] = useState(false);
  const [exportingSatisfaction, setExportingSatisfaction] = useState(false);
  const [exportingCompletedServices, setExportingCompletedServices] = useState<"by-agent" | "department-agent" | "detail" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [report, setReport] = useState<ConversationReportResponse | null>(null);
  const [satisfactionReport, setSatisfactionReport] = useState<AppSatisfactionReport | null>(null);
  const [satisfactionLoading, setSatisfactionLoading] = useState(false);
  const [satisfactionPage, setSatisfactionPage] = useState(1);
  const [sessionReport, setSessionReport] = useState<AppSessionAuditReport | null>(null);
  const [completedServiceReport, setCompletedServiceReport] = useState<AppCompletedServiceReport | null>(null);
  const [completedServiceLoading, setCompletedServiceLoading] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionFrom, setSessionFrom] = useState(() => toDateTimeLocalValue(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));
  const [sessionTo, setSessionTo] = useState(() => toDateTimeLocalValue(new Date()));
  const [sessionUserId, setSessionUserId] = useState("");
  const [sessionRole, setSessionRole] = useState("");
  const [sessionStatus, setSessionStatus] = useState<"" | AppSessionAuditStatus>("");
  const [sessionOpenNowMode, setSessionOpenNowMode] = useState(false);
  const [sessionPage, setSessionPage] = useState(1);
  const [retentionDays, setRetentionDays] = useState<number | null>(null);
  const [tenant, setTenant] = useState<AppTenantSummary | null>(null);
  const [activeTab, setActiveTab] = useState<ReportsTab>("overview");

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
    const rawTab = new URLSearchParams(window.location.search).get("tab");
    if (REPORT_TABS.some((item) => item.id === rawTab)) {
      setActiveTab(rawTab as ReportsTab);
    }
  }, []);

  const handleTabChange = useCallback((tab: ReportsTab) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState(null, "", `${url.pathname}?${url.searchParams.toString()}`);
  }, []);

  const toastHandlers = usePausableFeedbackAutoDismiss(Boolean(error || success), () => {
      setError(null);
      setSuccess(null);
    });

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    Promise.all([fetchAppUsers(session), fetchAppDepartments(session, { purpose: "reports" }), fetchAppTenantSummary(session)])
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
        setError(getAppErrorUxMessage({ ...typed, fallback: "Não foi possível carregar os filtros do relatório." }));
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
      setError("Informe um período exato válido.");
      return;
    }
    fetchAppConversationReport(session, {
      range: periodMode === "custom" ? "custom" : range,
      from: fromIso,
      to: toIso,
      dedupe,
      channel: channel || null,
      userId: userId || null,
      departmentId: isAdminRole(session.user.role) || isSupervisorRole(session.user.role) ? departmentId || null : null,
    })
      .then((response) => {
        if (cancelled) return;
        setReport(response);
        if (!isAdminRole(session.user.role) && !isSupervisorRole(session.user.role)) {
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
        setError(getAppErrorUxMessage({ ...typed, fallback: "Não foi possível carregar o relatório." }));
        setReport(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [channel, customFrom, customTo, dedupe, departmentId, handleUnauthorized, periodMode, range, router, session, userId]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const { from, to } = getReportPeriodIsoBounds({ periodMode, range, customFrom, customTo });
    if (!from || !to || Date.parse(from) > Date.parse(to)) {
      setSatisfactionReport(null);
      setError("Informe um período exato válido para satisfação.");
      return;
    }
    setSatisfactionLoading(true);
    fetchAppSatisfactionReport(session, {
      from,
      to,
      channel: channel || null,
      assignedUserId: userId || null,
      departmentId: isAdminRole(session.user.role) || isSupervisorRole(session.user.role) ? departmentId || null : null,
      page: satisfactionPage,
      limit: 25,
    })
      .then((response) => {
        if (!cancelled) setSatisfactionReport(response);
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
        setSatisfactionReport(null);
        setError(getAppErrorUxMessage({ ...typed, fallback: "Não foi possível carregar o relatório de satisfação." }));
      })
      .finally(() => {
        if (!cancelled) setSatisfactionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [channel, customFrom, customTo, departmentId, handleUnauthorized, periodMode, range, router, satisfactionPage, session, userId]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const { from, to } = getReportPeriodIsoBounds({ periodMode, range, customFrom, customTo });
    if (!from || !to || Date.parse(from) > Date.parse(to)) {
      setCompletedServiceReport(null);
      setError("Informe um período válido para atendimentos concluídos.");
      return;
    }
    setCompletedServiceLoading(true);
    fetchAppCompletedServiceReport(session, {
      from,
      to,
      assignedUserId: userId || null,
      departmentId: isAdminRole(session.user.role) || isSupervisorRole(session.user.role) ? departmentId || null : null,
    })
      .then((response) => {
        if (!cancelled) setCompletedServiceReport(response);
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
        setCompletedServiceReport(null);
        setError(getAppErrorUxMessage({ ...typed, fallback: "Não foi possível carregar atendimentos concluídos." }));
      })
      .finally(() => {
        if (!cancelled) setCompletedServiceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customFrom, customTo, departmentId, handleUnauthorized, periodMode, range, router, session, userId]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const fromIso = sessionOpenNowMode
      ? new Date(Date.now() - APP_SESSION_OPEN_LOOKBACK_MS).toISOString()
      : dateTimeLocalToIso(sessionFrom);
    const toIso = sessionOpenNowMode ? new Date().toISOString() : dateTimeLocalToIso(sessionTo);
    if (!fromIso || !toIso || Date.parse(fromIso) > Date.parse(toIso)) {
      setSessionReport(null);
      setError("Informe um período válido para Acessos/Sessões.");
      return;
    }
    setSessionsLoading(true);
    fetchAppSessionAuditReport(session, {
      from: fromIso,
      to: toIso,
      userId: sessionUserId || null,
      role: sessionRole || null,
      status: sessionOpenNowMode ? "OPEN" : sessionStatus || null,
      departmentId: isAdminRole(session.user.role) || isSupervisorRole(session.user.role) ? departmentId || null : null,
      page: sessionPage,
      limit: 25,
    })
      .then((response) => {
        if (!cancelled) setSessionReport(response);
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
        setSessionReport(null);
        setError(getAppErrorUxMessage({ ...typed, fallback: "Não foi possível carregar acessos/sessões." }));
      })
      .finally(() => {
        if (!cancelled) setSessionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [departmentId, handleUnauthorized, router, session, sessionFrom, sessionOpenNowMode, sessionPage, sessionRole, sessionStatus, sessionTo, sessionUserId]);

  useEffect(() => {
    setSessionPage(1);
  }, [sessionFrom, sessionOpenNowMode, sessionRole, sessionStatus, sessionTo, sessionUserId]);

  useEffect(() => {
    setSatisfactionPage(1);
  }, [channel, customFrom, customTo, departmentId, periodMode, range, userId]);

  const userNameById = useMemo(
    () => new Map(users.map((item) => [item.id, formatUserDisplayName(item.name, item.email)])),
    [users]
  );
  const visibleReportUsers = useMemo(() => {
    if (!session || isAdminRole(session.user.role)) return users;
    if (!isSupervisorRole(session.user.role)) return users;
    const allowedDepartmentIds = new Set((departmentId ? [departmentId] : departments.map((item) => item.id)).filter(Boolean));
    return users.filter((item) =>
      (item.departmentIds ?? []).some((currentDepartmentId) => allowedDepartmentIds.has(currentDepartmentId))
    );
  }, [departmentId, departments, session, users]);
  const sessionOpenCountInResult = useMemo(
    () => sessionReport?.items.filter((item) => item.status === "OPEN").length ?? 0,
    [sessionReport]
  );

  useEffect(() => {
    if (!session || isAdminRole(session.user.role)) return;
    const visibleUserIds = new Set(visibleReportUsers.map((item) => item.id));
    if (userId && !visibleUserIds.has(userId)) setUserId("");
    if (sessionUserId && !visibleUserIds.has(sessionUserId)) setSessionUserId("");
  }, [session, sessionUserId, userId, visibleReportUsers]);

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
        departmentId: isAdminRole(session.user.role) || isSupervisorRole(session.user.role) ? departmentId || null : null,
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
      setError(getAppErrorUxMessage({ ...typed, fallback: "Não foi possível exportar o CSV." }));
    } finally {
      setExporting(false);
    }
  };

  const handleExportSessions = async () => {
    if (!session) return;
    const fromIso = sessionOpenNowMode
      ? new Date(Date.now() - APP_SESSION_OPEN_LOOKBACK_MS).toISOString()
      : dateTimeLocalToIso(sessionFrom);
    const toIso = sessionOpenNowMode ? new Date().toISOString() : dateTimeLocalToIso(sessionTo);
    if (!fromIso || !toIso || Date.parse(fromIso) > Date.parse(toIso)) {
      setError("Informe um período válido para exportar Acessos/Sessões.");
      return;
    }
    setExportingSessions(true);
    setError(null);
    setSuccess(null);
    try {
      const csv = await exportAppSessionAuditReportCsv(session, {
        from: fromIso,
        to: toIso,
        userId: sessionUserId || null,
        role: sessionRole || null,
        status: sessionOpenNowMode ? "OPEN" : sessionStatus || null,
        departmentId: isAdminRole(session.user.role) || isSupervisorRole(session.user.role) ? departmentId || null : null,
      });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "session-audit.csv";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setSuccess("CSV de acessos/sessões exportado com sucesso.");
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(getAppErrorUxMessage({ ...typed, fallback: "Não foi possível exportar acessos/sessões." }));
    } finally {
      setExportingSessions(false);
    }
  };

  const handleExportSatisfaction = async () => {
    if (!session) return;
    const { from, to } = getReportPeriodIsoBounds({ periodMode, range, customFrom, customTo });
    if (!from || !to || Date.parse(from) > Date.parse(to)) {
      setError("Informe um período válido para exportar satisfação.");
      return;
    }
    setExportingSatisfaction(true);
    setError(null);
    setSuccess(null);
    try {
      const csv = await exportAppSatisfactionReportCsv(session, {
        from,
        to,
        channel: channel || null,
        assignedUserId: userId || null,
        departmentId: isAdminRole(session.user.role) || isSupervisorRole(session.user.role) ? departmentId || null : null,
      });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "satisfaction-report.csv";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setSuccess("CSV de satisfação exportado com sucesso.");
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(getAppErrorUxMessage({ ...typed, fallback: "Não foi possível exportar satisfação." }));
    } finally {
      setExportingSatisfaction(false);
    }
  };

  const handleExportCompletedServices = async (view: "by-agent" | "department-agent" | "detail") => {
    if (!session) return;
    const { from, to } = getReportPeriodIsoBounds({ periodMode, range, customFrom, customTo });
    if (!from || !to || Date.parse(from) > Date.parse(to)) {
      setError("Informe um período válido para exportar atendimentos concluídos.");
      return;
    }
    if (view === "detail" && completedServiceReport?.totalCompleted === 0) {
      const historyMessage = completedServiceHistoryMessage(completedServiceReport);
      setError(
        historyMessage
          ? `Não há atendimentos detalhados disponíveis para o período selecionado. ${historyMessage}`
          : "Não há atendimentos detalhados disponíveis para o período selecionado."
      );
      return;
    }
    setExportingCompletedServices(view);
    setError(null);
    setSuccess(null);
    try {
      const csv = await exportAppCompletedServiceReportCsv(session, {
        from,
        to,
        assignedUserId: userId || null,
        departmentId: isAdminRole(session.user.role) || isSupervisorRole(session.user.role) ? departmentId || null : null,
        view,
      });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download =
        view === "detail"
          ? "completed-services-detail.csv"
          : view === "department-agent"
            ? "completed-services-department-agent.csv"
            : "completed-services-by-agent.csv";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setSuccess("CSV de atendimentos concluídos exportado com sucesso.");
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(getAppErrorUxMessage({ ...typed, fallback: "Não foi possível exportar atendimentos concluídos." }));
    } finally {
      setExportingCompletedServices(null);
    }
  };

  const handleGeneratePdf = () => {
    if (!session || !report) {
      setError("Carregue um relatório antes de gerar o PDF.");
      return;
    }
    const tenantName = tenant?.name || "Organização autenticada";
    const departmentLabel = departmentId
      ? departments.find((item) => item.id === departmentId)?.name ?? departmentId
      : "Todos";
    const userLabel = userId ? userNameById.get(userId) ?? userId : "Todos";
    const channelLabel = REPORT_CHANNELS.find((item) => item.value === channel)?.label ?? "Todos";
    const periodLabel =
      periodMode === "custom"
        ? `${formatDateTime(report.periodFrom)} a ${formatDateTime(report.periodTo)}`
        : RANGE_LABELS[range];
    const slaOperational = getSlaOperational(report);
    const assignedConversationRows = report.assignedConversationsByAgent ?? report.byAgent;
    const filters = [
      ["Período", periodLabel],
      channel ? ["Canal", channelLabel] : null,
      departmentId ? ["Setor", departmentLabel] : null,
      userId ? ["Atendente", userLabel] : null,
      dedupe ? ["Duplicados", "Desconsiderados"] : null,
    ].filter((item): item is string[] => Boolean(item));
    const sessionFilters = [
      [
        sessionOpenNowMode ? "Modo" : "Período",
        sessionOpenNowMode
          ? "Sessões abertas agora"
          : `${formatDateTime(sessionReport?.periodFrom ?? dateTimeLocalToIso(sessionFrom))} a ${formatDateTime(sessionReport?.periodTo ?? dateTimeLocalToIso(sessionTo))}`,
      ],
      sessionUserId ? ["Usuário", userNameById.get(sessionUserId) ?? "Usuário filtrado"] : null,
      sessionRole ? ["Perfil", getUserRoleUxLabel(sessionRole)] : null,
      sessionOpenNowMode
        ? ["Situação", "Abertas"]
        : sessionStatus
          ? ["Situação", SESSION_STATUS_FILTERS.find((item) => item.value === sessionStatus)?.label ?? getSessionAuditStatusUxLabel(sessionStatus)]
          : null,
    ].filter((item): item is string[] => Boolean(item));
    const sessionItems = sessionReport?.items ?? [];
    const sessionOpenCount = sessionItems.filter((item) => item.status === "OPEN").length;
    const sessionClosedCount = sessionItems.filter((item) => item.status === "CLOSED").length;
    const sessionExpiredCount = sessionItems.filter((item) => item.status === "EXPIRED").length;
    const sessionRenewedCount = countSessionReason(sessionItems, "session_renewed");
    const sessionRevokedCount = sessionItems.filter((item) => item.endedAt && item.endReason !== "logout" && item.endReason !== "session_renewed").length;
    const sessionAverageDuration = averageObservedDuration(sessionItems);
    const includeSessionDetails = Boolean(sessionUserId && sessionItems.length);
    const htmlGeneratedAt = formatDateTime(new Date().toISOString());
    const filterRows = printTableRows(filters, 2);
    const sessionFilterRows = printTableRows(sessionFilters, 2);
    const byChannelRows = printTableRows(
      (report.byChannel ?? []).map((item) => [item.channelName, item.conversations]),
      2,
      "Não há dados por canal no período selecionado."
    );
    const byDepartmentRows = printTableRows(
      report.byDepartment.map((item) => [item.departmentName ?? "Sem setor / legado", item.conversations, formatSeconds(item.avgResponseTimeSec)]),
      3,
      "Não há dados por setor no período selecionado."
    );
    const statusRows = printTableRows(
      [
        ["Aguardando primeira resposta", slaOperational.waitingFirstResponse],
        ["Em atendimento", slaOperational.inProgress],
        ["Aguardando cliente", slaOperational.waitingUser],
        ["Fechadas", slaOperational.closed],
      ],
      2
    );
    const slaRows = printTableRows(
      [
        ["Tempo médio de primeira resposta", formatSeconds(slaOperational.avgFirstResponseTimeSec), "Fórmula atual do relatório"],
        ["Tempo médio de resolução", formatSeconds(slaOperational.avgResolutionTimeSec), "Fórmula atual do relatório"],
        ["Pontos fora do SLA de atendimento", report.slaBreaches, (report.slaBreaches ?? 0) > 0 ? "Atenção" : "Regular"],
      ],
      3
    );
    const agentActivityRows = printTableRows(
      (report.agentMessageActivity ?? []).map((item) => [
        formatUserDisplayName(item.userName, userNameById.get(item.userId) ?? "Atendente sem nome"),
        item.outboundMessages,
      ]),
      2,
      "Nenhuma mensagem humana atribuível no período selecionado."
    );
    const assignedRows = printTableRows(
      assignedConversationRows.map((item) => [
        userNameById.get(item.userId) ?? "Atendente sem nome",
        item.conversations,
        formatSeconds(item.avgResponseTimeSec),
      ]),
      3,
      "Nenhuma conversa atribuída por atendente no período selecionado."
    );
    const protocolRows = printTableRows(
      (report.conversations ?? []).slice(0, 12).map((item) => [
        item.protocol,
        item.channelName,
        item.departmentName ?? "-",
        getConversationStatusUxLabel(item.status as Parameters<typeof getConversationStatusUxLabel>[0]),
        formatDateTime(item.startedAt),
      ]),
      5,
      "Não há protocolos no período selecionado."
    );
    const sessionDetailRows = printTableRows(
      sessionItems.map((item) => [
        formatUserDisplayName(item.userName, item.userName),
        getUserRoleUxLabel(item.role),
        formatDateTime(item.loginAt),
        item.endedAt ? formatDateTime(item.endedAt) : "-",
        getSessionEndReasonUxLabel(item.endReason, item.endReasonLabel),
        formatObservedDuration(item.durationObservedSec),
        getSessionAuditStatusUxLabel(item.status),
      ]),
      7,
      "Não há sessões no período selecionado."
    );
    const executiveCards = printMetricCards([
      { label: "Conversas", value: report.totalConversations, tone: "info" },
      { label: "Fechadas", value: slaOperational.closed, tone: "neutral" },
      { label: "Em atendimento", value: slaOperational.inProgress, tone: "info" },
      { label: "Aguardando", value: slaOperational.waitingFirstResponse, tone: "warn" },
      { label: "Primeira resposta média", value: formatSeconds(report.avgFirstResponseTimeSec), tone: "ok" },
      { label: "Resolução média", value: formatSeconds(report.avgResolutionTimeSec), tone: "ok" },
      { label: "Pontos fora do SLA", value: report.slaBreaches, tone: report.slaBreaches > 0 ? "risk" : "ok" },
    ]);
    const sessionCards = printMetricCards([
      { label: "Total filtrado", value: sessionReport?.total ?? "-", tone: "info" },
      { label: "Abertas carregadas", value: sessionOpenCount, tone: "info" },
      { label: "Encerradas carregadas", value: sessionClosedCount, tone: "ok" },
      { label: "Expiradas carregadas", value: sessionExpiredCount, tone: "warn" },
      { label: "Renovadas carregadas", value: sessionRenewedCount, tone: "neutral" },
      { label: "Revogadas carregadas", value: sessionRevokedCount, tone: "neutral" },
      { label: "Duração observada média", value: formatSeconds(sessionAverageDuration), tone: "neutral" },
    ]);
    const html = `<!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>Relatório operacional - Converta</title>
          <style>
            @page { size: A4; margin: 16mm; }
            * { box-sizing: border-box; }
            html { background: #f8fafc; }
            body { margin: 0; font-family: Arial, sans-serif; color: #102033; background: #fff; line-height: 1.35; }
            .page { max-width: 1040px; margin: 0 auto; padding: 22px; }
            header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; border-bottom: 2px solid #0ea5e9; padding-bottom: 16px; }
            .brand { display: flex; align-items: center; gap: 14px; }
            .brand img { width: 150px; height: auto; }
            .eyebrow { margin: 0 0 4px; color: #64748b; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
            h1 { margin: 0; font-size: 24px; color: #0f172a; }
            .subtitle { margin: 6px 0 0; color: #475569; font-size: 12px; }
            .generated { text-align: right; color: #64748b; font-size: 11px; }
            .meta-grid { display: grid; grid-template-columns: 1.15fr .85fr; gap: 12px; margin: 18px 0; }
            .panel { border: 1px solid #dbe4ef; border-radius: 12px; background: #fff; padding: 12px; break-inside: avoid; page-break-inside: avoid; }
            .panel-muted { background: #f8fafc; }
            .label { color: #64748b; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; }
            .value { margin-top: 4px; font-size: 15px; font-weight: 700; color: #0f172a; }
            .filters { width: 100%; border-collapse: collapse; font-size: 11px; }
            .filters td { border-bottom: 1px solid #e2e8f0; padding: 5px 0; }
            .filters td:first-child { width: 34%; color: #64748b; font-weight: 700; }
            .section { margin-top: 18px; break-inside: avoid; page-break-inside: avoid; }
            .section-break { break-before: page; page-break-before: always; }
            .section-header { margin-bottom: 8px; }
            h2 { margin: 0; font-size: 16px; color: #0f172a; }
            .section-description { margin: 4px 0 0; color: #64748b; font-size: 11px; }
            .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 10px; }
            .metric { min-height: 66px; border: 1px solid #dbe4ef; border-left: 4px solid #94a3b8; border-radius: 10px; padding: 10px; background: #fff; break-inside: avoid; page-break-inside: avoid; }
            .metric span { display: block; color: #64748b; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
            .metric strong { display: block; margin-top: 7px; font-size: 18px; color: #0f172a; }
            .metric-info { border-left-color: #0ea5e9; }
            .metric-ok { border-left-color: #10b981; }
            .metric-warn { border-left-color: #f59e0b; }
            .metric-risk { border-left-color: #ef4444; }
            .two-col { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; break-inside: auto; page-break-inside: auto; }
            thead { display: table-header-group; }
            tr { break-inside: avoid; page-break-inside: avoid; }
            th { text-align: left; background: #eef6fc; color: #0f2742; border-bottom: 1px solid #bfd4e5; padding: 7px; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
            td { border-bottom: 1px solid #e2e8f0; padding: 7px; vertical-align: top; }
            .empty { color: #64748b; font-style: italic; }
            .note { margin-top: 8px; border-left: 3px solid #0ea5e9; background: #f8fafc; color: #475569; padding: 8px 10px; font-size: 10.5px; }
            .footer { margin-top: 22px; padding-top: 12px; border-top: 1px solid #dbe4ef; color: #64748b; font-size: 10px; break-inside: avoid; page-break-inside: avoid; }
            .print-actions { position: sticky; top: 0; z-index: 10; display: flex; justify-content: flex-end; margin: 0 0 16px; padding: 10px 0; background: rgba(255, 255, 255, .94); backdrop-filter: blur(8px); }
            .print-actions button { border: 0; border-radius: 8px; background: #0f2742; color: #fff; cursor: pointer; font-size: 13px; font-weight: 700; padding: 10px 14px; }
            .print-actions button:hover { background: #123a62; }
            @media print {
              html, body { background: #fff; }
              .page { max-width: none; padding: 0; }
              .print-actions { display: none; }
              .section { margin-top: 14px; }
              .metrics { grid-template-columns: repeat(4, 1fr); }
            }
            @media screen and (max-width: 760px) {
              .meta-grid, .two-col { grid-template-columns: 1fr; }
              .metrics { grid-template-columns: repeat(2, 1fr); }
            }
          </style>
        </head>
        <body>
          <main class="page">
            <div class="print-actions">
              <button type="button" onclick="window.print()">Imprimir / Salvar PDF</button>
            </div>
            <header>
              <div class="brand">
                <img src="${window.location.origin}/images/converta-logo-dark.png" alt="Converta" />
                <div>
                  <p class="eyebrow">Converta</p>
                  <h1>Relatório Operacional</h1>
                  <p class="subtitle">Resumo gerencial para acompanhamento interno de atendimento.</p>
                </div>
              </div>
              <div class="generated">Gerado em<br /><strong>${escapeHtml(htmlGeneratedAt)}</strong></div>
            </header>

            <section class="meta-grid">
              <div class="panel panel-muted">
                <div class="label">Organização</div>
                <div class="value">${escapeHtml(tenantName)}</div>
              </div>
              <div class="panel panel-muted">
                <div class="label">Filtros aplicados</div>
                <table class="filters"><tbody>${filterRows}</tbody></table>
              </div>
            </section>

            <section class="section">
              <div class="section-header">
                <h2>Resumo executivo</h2>
                <p class="section-description">KPIs principais do recorte selecionado, usando as metricas operacionais ja existentes.</p>
              </div>
              <div class="metrics">${executiveCards}</div>
            </section>

            <section class="section">
              <div class="section-header">
                <h2>Conversas</h2>
                <p class="section-description">Volume por situação do atendimento, canal e setor. O CSV permanece como fonte de detalhe completo.</p>
              </div>
              <div class="two-col">
                <div>
                  <table><thead><tr><th>Situação</th><th>Conversas</th></tr></thead><tbody>${statusRows}</tbody></table>
                </div>
                <div>
                  <table><thead><tr><th>Canal</th><th>Conversas</th></tr></thead><tbody>${byChannelRows}</tbody></table>
                </div>
              </div>
              <div class="section" style="margin-top: 12px;">
                <table><thead><tr><th>Setor</th><th>Conversas</th><th>Tempo medio de resposta</th></tr></thead><tbody>${byDepartmentRows}</tbody></table>
              </div>
              <div class="note">Protocolos abaixo são uma amostra curta para conferência visual. Use CSV para análise detalhada.</div>
              <table style="margin-top: 8px;"><thead><tr><th>Protocolo</th><th>Canal</th><th>Setor</th><th>Situação</th><th>Início</th></tr></thead><tbody>${protocolRows}</tbody></table>
            </section>

            <section class="section">
              <div class="section-header">
                <h2>SLA</h2>
                <p class="section-description">Indicadores de primeira resposta, resolução e pontos de atenção observados no período.</p>
              </div>
              <table><thead><tr><th>Indicador</th><th>Valor</th><th>Leitura</th></tr></thead><tbody>${slaRows}</tbody></table>
            </section>

            <section class="section section-break">
              <div class="section-header">
                <h2>Atendentes</h2>
                <p class="section-description">Atividade humana e distribuicao operacional sao leituras separadas.</p>
              </div>
              <h3 class="label">Mensagens enviadas por atendente</h3>
              <table><thead><tr><th>Atendente</th><th>Mensagens enviadas</th></tr></thead><tbody>${agentActivityRows}</tbody></table>
              <div class="note">Mensagens anteriores à captura de autoria podem não ser atribuíveis a um atendente.</div>
              <h3 class="label" style="margin-top: 14px;">Conversas atribuídas por atendente</h3>
              <table><thead><tr><th>Atendente</th><th>Conversas atribuídas</th><th>Tempo médio de resposta</th></tr></thead><tbody>${assignedRows}</tbody></table>
            </section>

            <section class="section">
              <div class="section-header">
                <h2>Acessos/Sessões</h2>
                <p class="section-description">Resumo da auditoria de autenticação no período filtrado para sessões.</p>
              </div>
              <div class="panel panel-muted">
                <div class="label">Filtros de sessões</div>
                <table class="filters"><tbody>${sessionFilterRows}</tbody></table>
              </div>
              <div class="metrics">${sessionCards}</div>
              <div class="note">Total filtrado vem do relatório de auditoria. A distribuição por situação usa as sessões carregadas na tela; use CSV para detalhe completo.</div>
              <div class="note">Registros de sessão representam autenticação e atividade observada na plataforma e não constituem controle de jornada.</div>
              ${includeSessionDetails ? `
                <div class="section">
                  <div class="section-header">
                    <h2>Detalhe de sessões filtradas</h2>
                    <p class="section-description">Incluído porque há filtro específico de usuário. Para extração completa, use CSV.</p>
                  </div>
                  <table><thead><tr><th>Usuário</th><th>Perfil</th><th>Entrada</th><th>Encerramento</th><th>Motivo</th><th>Duração observada</th><th>Situação</th></tr></thead><tbody>${sessionDetailRows}</tbody></table>
                </div>` : ""}
            </section>

            <footer class="footer">
              Converta - relatório operacional interno. Gerado para ${escapeHtml(tenantName)} em ${escapeHtml(htmlGeneratedAt)}. Documento estimativo e gerencial; CSVs permanecem como exportação detalhada.
            </footer>
          </main>
        </body>
      </html>`;
    const popup = window.open("", "_blank", "width=960,height=720");
    if (!popup) {
      setError("Não foi possível abrir a janela do PDF. Verifique o bloqueador de pop-ups.");
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

  const canFilterDepartment = isAdminRole(session.user.role) || isSupervisorRole(session.user.role);
  const slaOperational = getSlaOperational(report);
  const periodLabel =
    periodMode === "custom"
      ? `${formatDateTime(dateTimeLocalToIso(customFrom))} a ${formatDateTime(dateTimeLocalToIso(customTo))}`
      : RANGE_LABELS[range];
  const channelLabel = REPORT_CHANNELS.find((item) => item.value === channel)?.label ?? "Todos";
  const departmentLabel = departmentId ? departments.find((item) => item.id === departmentId)?.name ?? departmentId : "Todos";
  const userLabel = userId ? userNameById.get(userId) ?? userId : "Todos";
  const hasGlobalFilters = channel || userId || departmentId || dedupe || periodMode === "custom";
  const assignedConversations = report?.assignedConversationsByAgent ?? report?.byAgent ?? [];
  const completedServiceHistoryNote = completedServiceHistoryMessage(completedServiceReport);

  return (
    <AppShell
      session={session}
      title="Relatórios"
      subtitle="Acompanhe tempos de resposta e volume de atendimento do seu time."
    >
      <FeedbackToast message={success} {...toastHandlers} />
      <FeedbackToast message={error} variant="error" {...toastHandlers} />

      <div className="reports-theme grid gap-4">
        {retentionDays !== null && retentionDays < 30 ? (
          <section className="report-notice-panel rounded-lg border border-amber-300/30 bg-amber-500/10 p-3 text-sm text-amber-50">
            A retenção LGPD está configurada para {retentionDays} dia
            {retentionDays === 1 ? "" : "s"}. Relatórios e histórico operacional podem ficar reduzidos quando a retenção for executada.
          </section>
        ) : null}

      <section className="report-filter-panel rounded-xl border border-white/10 bg-white/5 p-3 sm:p-4">
        <div className="flex flex-col gap-3 border-b border-white/10 pb-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-white/45">Contexto global</p>
            <h2 className="mt-1 text-lg font-semibold text-white">{periodLabel}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <ReportBadge tone="info">Canal: {channelLabel}</ReportBadge>
              <ReportBadge tone="neutral">Setor: {departmentLabel}</ReportBadge>
              <ReportBadge tone="neutral">Atendente: {userLabel}</ReportBadge>
              {dedupe ? <ReportBadge tone="warn">Duplicados desconsiderados</ReportBadge> : null}
            </div>
          </div>
          {hasGlobalFilters ? (
            <button
              type="button"
              onClick={() => {
                setPeriodMode("preset");
                setRange("7d");
                setChannel("");
                setUserId("");
                setDepartmentId("");
                setDedupe(false);
              }}
              className="w-fit rounded-md border border-white/15 px-3 py-2 text-sm text-white/75 hover:bg-white/10 hover:text-white"
            >
              Limpar filtros
            </button>
          ) : null}
        </div>

        <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <label className="grid gap-1 text-sm">
            <span className="text-white/70">Tipo de período</span>
            <select
              className="w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
              value={periodMode}
              onChange={(event) => setPeriodMode(event.target.value as "preset" | "custom")}
            >
              <option value="preset">Período rápido</option>
              <option value="custom">Período exato</option>
            </select>
          </label>
          {periodMode === "preset" ? (
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Período rápido</span>
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
                <span className="text-white/70">Início exato</span>
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
              {visibleReportUsers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({getUserRoleUxLabel(item.role)})
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
        </div>
      </section>

      <nav
        aria-label="Seções de relatórios"
        role="tablist"
        className="report-tabs flex gap-2 overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-2"
      >
        {REPORT_TABS.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`reports-panel-${tab.id}`}
              id={`reports-tab-${tab.id}`}
              onClick={() => handleTabChange(tab.id)}
              className={`min-w-[11rem] rounded-lg border px-3 py-2 text-left transition focus:outline-none focus:ring-2 focus:ring-re7-sky/70 ${
                selected
                  ? "border-re7-sky/40 bg-re7-sky/15 text-white"
                  : "border-transparent text-white/65 hover:border-white/10 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="block text-sm font-semibold">{tab.label}</span>
              <span className="mt-0.5 block text-xs text-white/50">{tab.description}</span>
            </button>
          );
        })}
      </nav>

      {loading ? (
        <section className="report-section rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/65">
          Carregando relatórios sem limpar o contexto da página...
        </section>
      ) : null}

      <div
        role="tabpanel"
        id={`reports-panel-${activeTab}`}
        aria-labelledby={`reports-tab-${activeTab}`}
        className="grid gap-4"
      >
        {activeTab === "overview" ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Conversas" value={report?.totalConversations ?? "-"} tone="info" detail="Criadas no período e filtros atuais." />
              <KpiCard label="Em atendimento agora" value={slaOperational.inProgress} tone="info" detail="Conversas atualmente atribuídas conforme os filtros." />
              <KpiCard label="Aguardando agora" value={slaOperational.waitingFirstResponse} tone="warn" detail="Conversas atualmente sem primeira resposta." />
              <KpiCard label="Fechadas agora" value={slaOperational.closed} tone="neutral" detail="Conversas encerradas no estado atual." />
              <KpiCard
                label="Atendimentos concluídos"
                value={completedServiceReport?.totalCompleted ?? "-"}
                tone="ok"
                detail="Ciclos/protocolos encerrados no período."
              />
              <KpiCard label="Primeira resposta média" value={formatSeconds(report?.avgFirstResponseTimeSec ?? null)} tone="ok" />
              <KpiCard label="Resolução média" value={formatSeconds(report?.avgResolutionTimeSec ?? null)} tone="ok" />
              <KpiCard
                label="Pontos fora do SLA"
                value={report?.slaBreaches ?? "-"}
                tone={(report?.slaBreaches ?? 0) > 0 ? "risk" : "ok"}
                detail="Usa a fórmula atual do relatório."
              />
              <KpiCard label="Transferências humano" value={report?.humanTransferCount ?? "-"} tone="neutral" />
            </section>
            <section className="report-info-panel rounded-lg border border-sky-300/20 bg-sky-500/10 p-3 text-sm text-sky-50">
              A visão geral resume o período selecionado. As abas detalham conversas, SLA de atendimento, atendentes, sessões e exportações sem alterar as métricas originais.
            </section>
            <ReportSection
              title="Atendimentos concluídos por dia"
              description="Cada atendimento concluído corresponde a um ciclo/protocolo encerrado, contabilizado no momento do fechamento."
            >
              {completedServiceLoading ? <p className="px-4 pt-3 text-sm text-white/70">Carregando atendimentos concluídos...</p> : null}
              {completedServiceReport?.daily.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-sm">
                    <thead className="bg-white/10 text-left">
                      <tr>
                        <th className="px-3 py-2">Dia</th>
                        <th className="px-3 py-2 text-right">Atendimentos concluídos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {completedServiceReport.daily.map((item) => (
                        <tr key={item.date} className="border-t border-white/10">
                          <td className="px-3 py-2">{item.date.split("-").reverse().join("/")}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{item.completedCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState>{completedServiceHistoryNote ?? "Não há atendimentos concluídos no período selecionado."}</EmptyState>
              )}
              {completedServiceHistoryNote ? (
                <p className="border-t border-white/10 px-4 py-3 text-xs text-white/55">{completedServiceHistoryNote}</p>
              ) : null}
            </ReportSection>
          </>
        ) : null}

        {activeTab === "conversations" ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Volume" value={report?.totalConversations ?? "-"} tone="info" />
              <KpiCard label="Automatizadas" value={report?.automatedConversations ?? "-"} tone="neutral" />
              <KpiCard label="Canais" value={report?.byChannel?.length ?? 0} tone="neutral" />
              <KpiCard label="Setores" value={report?.byDepartment.length ?? 0} tone="neutral" />
            </section>
            <div className="grid gap-4 xl:grid-cols-2">
              <ReportSection title="Por canal" description="Distribuição de conversas por canal no período.">
                {report?.byChannel?.length ? (
                  <table className="w-full text-sm">
                    <thead className="bg-white/10 text-left">
                      <tr>
                        <th className="px-3 py-2">Canal</th>
                        <th className="px-3 py-2 text-right">Conversas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.byChannel.map((item) => (
                        <tr key={item.channel} className="border-t border-white/10">
                          <td className="px-3 py-2">{item.channelName}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{item.conversations}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <EmptyState>Não há dados por canal no período selecionado.</EmptyState>
                )}
              </ReportSection>
              <ReportSection title="Por setor" description="Distribuição operacional por setor.">
                {report?.byDepartment.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead className="bg-white/10 text-left">
                        <tr>
                          <th className="px-3 py-2">Setor</th>
                          <th className="px-3 py-2 text-right">Conversas</th>
                          <th className="px-3 py-2 text-right">Tempo médio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.byDepartment.map((item) => (
                          <tr key={item.departmentId ?? "__none__"} className="border-t border-white/10">
                            <td className="px-3 py-2">{item.departmentName ?? "Sem setor / legado"}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{item.conversations}</td>
                            <td className="px-3 py-2 text-right">{formatSeconds(item.avgResponseTimeSec)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState>Não há dados por setor no período selecionado.</EmptyState>
                )}
              </ReportSection>
              <ReportSection
                title="Atendimentos concluídos por setor"
                description="Usa o setor registrado no fechamento do ciclo/protocolo."
              >
                <CompletedServiceBucketTable
                  titleColumn="Setor"
                  rows={completedServiceReport?.byDepartment ?? []}
                  emptyMessage={completedServiceHistoryNote ?? "Não há atendimentos concluídos por setor no período selecionado."}
                />
              </ReportSection>
            </div>
            <ReportSection title="Protocolos" description="Amostra dos primeiros 100 protocolos do recorte atual.">
              {report?.conversations?.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="bg-white/10 text-left">
                      <tr>
                        <th className="px-3 py-2">Protocolo</th>
                        <th className="px-3 py-2">Canal</th>
                        <th className="px-3 py-2">Setor</th>
                        <th className="px-3 py-2">Situação</th>
                        <th className="px-3 py-2">Início</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.conversations.slice(0, 100).map((item) => (
                        <tr key={item.conversationId} className="border-t border-white/10">
                          <td className="px-3 py-2 font-mono text-xs">{item.protocol}</td>
                          <td className="px-3 py-2">{item.channelName}</td>
                          <td className="px-3 py-2">{item.departmentName ?? "-"}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex rounded-full border px-2 py-1 text-xs ${getReportStatusTone(item.status)}`}>
                              {getConversationStatusUxLabel(item.status as Parameters<typeof getConversationStatusUxLabel>[0])}
                            </span>
                          </td>
                          <td className="px-3 py-2">{formatDateTime(item.startedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState>Nenhum protocolo no período selecionado.</EmptyState>
              )}
            </ReportSection>
          </>
        ) : null}

        {activeTab === "sla" ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Aguardando primeira resposta agora" value={slaOperational.waitingFirstResponse} tone="warn" />
              <KpiCard label="Em atendimento agora" value={slaOperational.inProgress} tone="info" />
              <KpiCard label="Aguardando cliente agora" value={slaOperational.waitingUser} tone="neutral" />
              <KpiCard label="Fechados agora" value={slaOperational.closed} tone="neutral" />
              <KpiCard label="Média primeira resposta" value={formatSeconds(slaOperational.avgFirstResponseTimeSec)} tone="ok" />
              <KpiCard label="Média resolução" value={formatSeconds(slaOperational.avgResolutionTimeSec)} tone="ok" />
              <KpiCard
                label="Pontos fora do SLA"
                value={report?.slaBreaches ?? "-"}
                tone={(report?.slaBreaches ?? 0) > 0 ? "risk" : "ok"}
                detail="Mantém a fórmula existente."
              />
            </section>
            <section className="report-section rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/65">
              SLA por responsável não é inferido nesta tela. Sem registro confiável do responsável no evento de SLA, essa leitura permanece fora do escopo.
            </section>
          </>
        ) : null}

        {activeTab === "agents" ? (
          <>
            <ReportSection
              title="Atividade dos atendentes"
              description="Mensagens enviadas por atendente. Considera apenas mensagens humanas com autoria persistida no envio."
            >
              {report?.agentMessageActivity?.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead className="bg-white/10 text-left">
                      <tr>
                        <th className="px-3 py-2">Atendente</th>
                        <th className="px-3 py-2">Código interno</th>
                        <th className="px-3 py-2 text-right">Mensagens enviadas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.agentMessageActivity.map((item) => (
                        <tr key={item.userId} className="border-t border-white/10">
                          <td className="px-3 py-2">{formatUserDisplayName(item.userName, userNameById.get(item.userId) ?? "-")}</td>
                          <td className="px-3 py-2 font-mono text-xs">{item.userId}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{item.outboundMessages}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState>Nenhuma mensagem com autoria registrada neste período.</EmptyState>
              )}
            </ReportSection>
            <section className="report-info-panel rounded-lg border border-sky-300/20 bg-sky-500/10 p-3 text-sm text-sky-50">
              {AGENT_ACTIVITY_HISTORY_NOTE}
            </section>
            <ReportSection
              title="Conversas atribuídas por atendente"
              description="Reflete a distribuição operacional de conversas, não a quantidade de mensagens enviadas."
            >
              {assignedConversations.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="bg-white/10 text-left">
                      <tr>
                        <th className="px-3 py-2">Atendente</th>
                        <th className="px-3 py-2">Código interno</th>
                        <th className="px-3 py-2 text-right">Conversas atribuídas</th>
                        <th className="px-3 py-2 text-right">Tempo médio de resposta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignedConversations.map((item) => (
                        <tr key={item.userId} className="border-t border-white/10">
                          <td className="px-3 py-2">{userNameById.get(item.userId) ?? "-"}</td>
                          <td className="px-3 py-2 font-mono text-xs">{item.userId}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{item.conversations}</td>
                          <td className="px-3 py-2 text-right">{formatSeconds(item.avgResponseTimeSec)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState>Nenhuma atribuição registrada no período.</EmptyState>
              )}
            </ReportSection>
            <ReportSection
              title="Atendimentos concluídos por atendente"
              description="Cada atendimento concluído corresponde a um ciclo/protocolo encerrado, contabilizado no momento do fechamento."
            >
              <CompletedServiceBucketTable
                titleColumn="Atendente"
                rows={completedServiceReport?.byAgent ?? []}
                emptyMessage={completedServiceHistoryNote ?? "Nenhum atendimento concluído por atendente no período selecionado."}
              />
            </ReportSection>
            <ReportSection
              title="Atendimentos concluídos por setor e atendente"
              description="Usa setor e atendente registrados no snapshot de fechamento; mudanças posteriores da conversa não alteram esta leitura."
            >
              {completedServiceReport?.byDepartmentAgent.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="bg-white/10 text-left">
                      <tr>
                        <th className="px-3 py-2">Setor</th>
                        <th className="px-3 py-2">Atendente</th>
                        <th className="px-3 py-2 text-right">Atendimentos concluídos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {completedServiceReport.byDepartmentAgent.map((item) => (
                        <tr
                          key={`${item.departmentId ?? "__none_department__"}:${item.assignedUserId ?? "__none_agent__"}`}
                          className="border-t border-white/10"
                        >
                          <td className="px-3 py-2">{item.departmentName}</td>
                          <td className="px-3 py-2">{item.agentName}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{item.completedCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState>{completedServiceHistoryNote ?? "Nenhum atendimento concluído por setor e atendente no período selecionado."}</EmptyState>
              )}
            </ReportSection>
          </>
        ) : null}

        {activeTab === "satisfaction" ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Média CSAT" value={formatScore(satisfactionReport?.summary.averageScore ?? null)} tone="ok" />
              <KpiCard label="Pesquisas enviadas" value={satisfactionReport?.summary.sent ?? "-"} tone="info" />
              <KpiCard label="Respostas recebidas" value={satisfactionReport?.summary.responded ?? "-"} tone="neutral" />
              <KpiCard label="Taxa de resposta" value={formatPercent(satisfactionReport?.summary.responseRate ?? null)} tone="neutral" />
            </section>
            <div className="report-section flex flex-col gap-3 rounded-lg border border-white/10 bg-white/5 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">Satisfação</h2>
                <p className="mt-1 text-xs leading-relaxed text-white/55">
                  Usa o período, setor, atendente e canal selecionados nos filtros acima.
                </p>
              </div>
              <button
                type="button"
                onClick={handleExportSatisfaction}
                disabled={exportingSatisfaction}
                className="w-full rounded-md border border-re7-sky/30 bg-re7-sky/10 px-3 py-2 text-sm font-semibold text-white hover:bg-re7-sky/20 disabled:cursor-not-allowed disabled:opacity-60 md:w-auto"
              >
                {exportingSatisfaction ? "Exportando..." : "Exportar CSV"}
              </button>
            </div>
            <ReportSection title="Distribuição" description="Percentuais calculados sobre as respostas recebidas.">
              {satisfactionLoading ? <p className="px-4 pt-3 text-sm text-white/70">Carregando satisfação...</p> : null}
              {(satisfactionReport?.summary.responded ?? 0) > 0 ? (
                <div className="grid gap-2 p-4">
                  {SATISFACTION_SCORE_LABELS.map((item) => {
                    const count = satisfactionReport?.summary.distribution[String(item.score)] ?? 0;
                    const percentage = satisfactionReport?.summary.responded ? count / satisfactionReport.summary.responded : 0;
                    return (
                      <div
                        key={item.score}
                        className="grid gap-2 rounded-lg border border-white/10 bg-re7-navy/40 p-3 text-sm md:grid-cols-[minmax(0,1fr)_9rem_7rem]"
                      >
                        <div className="flex items-center gap-2">
                          <ReportBadge tone={item.tone}>{item.score}</ReportBadge>
                          <span>{item.label}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-white/10 md:self-center">
                          <div className="h-full rounded-full bg-re7-sky" style={{ width: `${Math.min(100, Math.max(0, percentage * 100))}%` }} />
                        </div>
                        <div className="text-left text-white/70 md:text-right">
                          <span className="font-semibold text-white">{count}</span> · {formatPercent(percentage)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState>Nenhuma resposta de satisfação no período selecionado.</EmptyState>
              )}
            </ReportSection>
            <ReportSection
              title="Satisfação por atendente"
              description="Usa o atendente registrado na pesquisa enviada; transferências posteriores não alteram a atribuição histórica."
            >
              <SatisfactionAggregateTable
                titleColumn="Atendente"
                rows={satisfactionReport?.summary.byAgent ?? []}
                emptyMessage="Nenhuma resposta atribuída a atendentes neste período."
                fallbackName="Atendente sem nome"
              />
            </ReportSection>
            <ReportSection
              title="Satisfação por setor"
              description="Usa o setor registrado na pesquisa enviada; mudanças posteriores da conversa não alteram a atribuição histórica."
            >
              <SatisfactionAggregateTable
                titleColumn="Setor"
                rows={satisfactionReport?.summary.byDepartment ?? []}
                emptyMessage="Nenhuma resposta atribuída a setores neste período."
                fallbackName="Setor sem nome"
              />
            </ReportSection>
            <ReportSection title="Respostas" description="Tabela analítica das avaliações recebidas.">
              <div className="overflow-x-auto">
                {satisfactionReport?.rows.length ? (
                  <table className="w-full min-w-[920px] text-sm">
                    <thead className="bg-white/10 text-left">
                      <tr>
                        <th className="px-3 py-2">Data</th>
                        <th className="px-3 py-2">Protocolo</th>
                        <th className="px-3 py-2">Setor</th>
                        <th className="px-3 py-2">Atendente</th>
                        <th className="px-3 py-2">Nota</th>
                        <th className="px-3 py-2">Comentário</th>
                      </tr>
                    </thead>
                    <tbody>
                      {satisfactionReport.rows.map((item) => (
                        <tr key={item.surveyId} className="border-t border-white/10">
                          <td className="px-3 py-2">{formatDateTime(item.answeredAt ?? item.sentAt)}</td>
                          <td className="px-3 py-2">{item.protocol ?? "-"}</td>
                          <td className="px-3 py-2">{item.departmentName ?? "Sem setor"}</td>
                          <td className="px-3 py-2">{item.assignedUserName ?? "Sem atendente"}</td>
                          <td className="px-3 py-2">
                            <span className="inline-flex rounded-full border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/80">
                              {item.score} - {item.scoreLabel}
                            </span>
                          </td>
                          <td className="max-w-[24rem] px-3 py-2 text-white/70">{item.comment || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <EmptyState>Nenhuma resposta de satisfação no período selecionado.</EmptyState>
                )}
              </div>
              {satisfactionReport ? (
                <div className="flex flex-col gap-2 border-t border-white/10 px-4 py-3 text-xs text-white/55 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    Total: {satisfactionReport.total} respostas. Página {satisfactionReport.page} de {satisfactionReport.totalPages}.
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-md border border-white/15 px-3 py-1.5 text-white disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={satisfactionPage <= 1}
                      onClick={() => setSatisfactionPage((current) => Math.max(1, current - 1))}
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-white/15 px-3 py-1.5 text-white disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={satisfactionPage >= satisfactionReport.totalPages}
                      onClick={() => setSatisfactionPage((current) => Math.min(satisfactionReport.totalPages, current + 1))}
                    >
                      Próxima
                    </button>
                  </div>
                </div>
              ) : null}
            </ReportSection>
          </>
        ) : null}

        {activeTab === "sessions" ? (
          <ReportSection
            title="Acessos/Sessões"
            description={SESSION_AUDIT_DISCLAIMER_COPY}
          >
            <div className="border-b border-white/10 px-4 py-3">
              <div className="rounded-lg border border-sky-300/25 bg-sky-500/10 p-3 text-sm text-sky-50">
                <p className="font-semibold">Auditoria histórica por início da sessão</p>
                <p className="mt-1 text-sky-50/80">{SESSION_STARTED_AT_FILTER_COPY}</p>
              </div>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5">
              <label className="grid gap-1 text-sm">
                <span className="text-white/70">Sessões iniciadas a partir de</span>
                <input
                  type="datetime-local"
                  className="w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                  value={sessionFrom}
                  onChange={(event) => setSessionFrom(event.target.value)}
                  disabled={sessionOpenNowMode}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-white/70">Sessões iniciadas até</span>
                <input
                  type="datetime-local"
                  className="w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                  value={sessionTo}
                  onChange={(event) => setSessionTo(event.target.value)}
                  disabled={sessionOpenNowMode}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-white/70">Usuário</span>
                <select
                  className="w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                  value={sessionUserId}
                  onChange={(event) => setSessionUserId(event.target.value)}
                >
                  <option value="">Todos</option>
                  {visibleReportUsers.map((item) => (
                    <option key={item.id} value={item.id}>
                  {item.name} ({getUserRoleUxLabel(item.role)})
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-white/70">Perfil</span>
                <select
                  className="w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                  value={sessionRole}
                  onChange={(event) => setSessionRole(event.target.value)}
                >
                  {SESSION_ROLE_FILTERS.map((item) => (
                    <option key={item.value || "all"} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-white/70">Situação</span>
                <select
                  className="w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                  value={sessionStatus}
                  onChange={(event) => setSessionStatus(event.target.value as "" | AppSessionAuditStatus)}
                  disabled={sessionOpenNowMode}
                >
                  {SESSION_STATUS_FILTERS.map((item) => (
                    <option key={item.value || "all"} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-col gap-3 px-4 pb-3 text-xs text-white/55 md:flex-row md:items-center md:justify-between">
              <div>
                <p>
                  {sessionOpenNowMode
                    ? "Modo operacional: mostra somente sessões abertas no intervalo técnico de validade atual. Não é indicador de presença online."
                    : "Período filtrado por sessões iniciadas no intervalo. Sessões vencidas aparecem como expiradas sem inferir saída por última atividade observada."}
                </p>
                {sessionReport ? (
                  <p className="mt-1">
                    Sessões no resultado: {sessionReport.total}. Abertas carregadas nesta página: {sessionOpenCountInResult}.
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setSessionOpenNowMode((current) => !current)}
                className={`rounded-md border px-3 py-2 text-sm font-semibold ${
                  sessionOpenNowMode
                    ? "border-emerald-300/40 bg-emerald-500/20 text-emerald-50 hover:bg-emerald-500/30"
                    : "border-white/15 text-white/80 hover:bg-white/10"
                }`}
              >
                {sessionOpenNowMode ? "Voltar ao filtro histórico" : "Ver sessões abertas agora"}
              </button>
            </div>
            {sessionsLoading ? <p className="px-4 pb-3 text-sm text-white/70">Carregando acessos/sessões...</p> : null}
            <div className="overflow-x-auto border-t border-white/10">
              {sessionReport?.items.length ? (
                <table className="w-full min-w-[980px] text-sm">
                  <thead className="bg-white/10 text-left">
                    <tr>
                      <th className="px-3 py-2">Usuário</th>
                      <th className="px-3 py-2">Perfil</th>
                      <th className="px-3 py-2">Entrada</th>
                      <th className="px-3 py-2">Encerramento</th>
                      <th className="px-3 py-2">Motivo</th>
                      <th className="px-3 py-2">Duração observada</th>
                      <th className="px-3 py-2">Ultima atividade observada</th>
                      <th className="px-3 py-2">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessionReport.items.map((item) => (
                      <tr key={item.id} className="border-t border-white/10">
                        <td className="px-3 py-2">{formatUserDisplayName(item.userName, item.userName)}</td>
                        <td className="px-3 py-2 text-white/70">{getUserRoleUxLabel(item.role)}</td>
                        <td className="px-3 py-2">{formatDateTime(item.loginAt)}</td>
                        <td className="px-3 py-2">{item.endedAt ? formatDateTime(item.endedAt) : "-"}</td>
                        <td className="px-3 py-2 text-white/70">{getSessionEndReasonUxLabel(item.endReason, item.endReasonLabel)}</td>
                        <td className="px-3 py-2">{formatObservedDuration(item.durationObservedSec)}</td>
                        <td className="px-3 py-2">{formatDateTime(item.lastSeenAt)}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex rounded-full border px-2 py-1 text-xs ${getSessionStatusTone(item.status)}`}
                            title={item.status === "OPEN" ? "Sessão atualmente aberta pelos registros observados; não representa presença online ou jornada." : undefined}
                          >
                            {getSessionAuditStatusUxLabel(item.status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState>Nenhuma sessão encontrada no período selecionado.</EmptyState>
              )}
            </div>
            {sessionReport ? (
              <div className="flex flex-col gap-2 border-t border-white/10 px-4 py-3 text-xs text-white/55 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  Total: {sessionReport.total} sessões observadas. Página {sessionReport.page} de {sessionReport.totalPages}.
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-white/15 px-3 py-1.5 text-white disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={sessionPage <= 1}
                    onClick={() => setSessionPage((current) => Math.max(1, current - 1))}
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-white/15 px-3 py-1.5 text-white disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={sessionPage >= sessionReport.totalPages}
                    onClick={() => setSessionPage((current) => Math.min(sessionReport.totalPages, current + 1))}
                  >
                    Próxima
                  </button>
                </div>
              </div>
            ) : null}
          </ReportSection>
        ) : null}

        {activeTab === "exports" ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <section className="report-export-card rounded-xl border border-white/10 bg-white/5 p-4">
              <h2 className="text-sm font-semibold">CSV de conversas</h2>
              <p className="mt-1 text-xs leading-relaxed text-white/55">
                Exporta o recorte operacional de conversas com os filtros globais atuais.
              </p>
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting}
                className="mt-4 w-full rounded-md border border-re7-sky/30 bg-re7-sky/10 px-3 py-2 text-sm text-white hover:bg-re7-sky/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {exporting ? "Exportando..." : "Exportar CSV de conversas"}
              </button>
            </section>
            <section className="report-export-card rounded-xl border border-white/10 bg-white/5 p-4">
              <h2 className="text-sm font-semibold">CSV de acessos/sessões</h2>
              <p className="mt-1 text-xs leading-relaxed text-white/55">
                Exporta auditoria de autenticação conforme filtros locais da aba Acessos/Sessões.
              </p>
              <button
                type="button"
                onClick={handleExportSessions}
                disabled={exportingSessions}
                className="mt-4 w-full rounded-md border border-re7-sky/30 bg-re7-sky/10 px-3 py-2 text-sm text-white hover:bg-re7-sky/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {exportingSessions ? "Exportando..." : "Exportar CSV de sessões"}
              </button>
            </section>
            <section className="report-export-card rounded-xl border border-white/10 bg-white/5 p-4">
              <h2 className="text-sm font-semibold">CSV de atendimentos concluídos</h2>
              <p className="mt-1 text-xs leading-relaxed text-white/55">
                Exporta ciclos/protocolos encerrados por atendente ou por setor e atendente.
              </p>
              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  onClick={() => handleExportCompletedServices("by-agent")}
                  disabled={Boolean(exportingCompletedServices)}
                  className="w-full rounded-md border border-re7-sky/30 bg-re7-sky/10 px-3 py-2 text-sm text-white hover:bg-re7-sky/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {exportingCompletedServices === "by-agent" ? "Exportando..." : "Exportar por atendente"}
                </button>
                <button
                  type="button"
                  onClick={() => handleExportCompletedServices("department-agent")}
                  disabled={Boolean(exportingCompletedServices)}
                  className="w-full rounded-md border border-re7-sky/30 bg-re7-sky/10 px-3 py-2 text-sm text-white hover:bg-re7-sky/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {exportingCompletedServices === "department-agent" ? "Exportando..." : "Exportar setor e atendente"}
                </button>
                <button
                  type="button"
                  onClick={() => handleExportCompletedServices("detail")}
                  disabled={Boolean(exportingCompletedServices)}
                  className="w-full rounded-md border border-re7-sky/30 bg-re7-sky/10 px-3 py-2 text-sm text-white hover:bg-re7-sky/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {exportingCompletedServices === "detail" ? "Exportando..." : "Exportar detalhado por atendimento"}
                </button>
              </div>
            </section>
            <section className="report-export-card rounded-xl border border-white/10 bg-white/5 p-4">
              <h2 className="text-sm font-semibold">Impressão/PDF</h2>
              <p className="mt-1 text-xs leading-relaxed text-white/55">
                Abre um relatório gerencial com resumo, conversas, SLA de atendimento, atendentes e acessos/sessões para imprimir ou salvar em PDF.
              </p>
              <button
                type="button"
                onClick={handleGeneratePdf}
                disabled={!report}
                className="mt-4 w-full rounded-md border border-emerald-300/30 bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Imprimir / Salvar PDF
              </button>
            </section>
          </div>
        ) : null}
      </div>
      </div>
    </AppShell>
  );
}
