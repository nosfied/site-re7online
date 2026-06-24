"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminConsole } from "@/components/admin/AdminConsoleProvider";
import { buildOpsModuleRows, buildOpsSummary } from "@/lib/opsMetricsDashboard";
import { fetchOpsMetrics } from "@/lib/whatsappAdminApi";
import type { OpsMetricsSnapshot } from "@/lib/whatsappAdminApi";

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("pt-BR").format(Math.round(value));
}

function formatMs(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  if (value < 1000) return `${Math.round(value)}ms`;
  return `${(value / 1000).toFixed(2)}s`;
}

function formatBytes(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let amount = value;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return `${amount.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatUptime(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return "-";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function StatCard({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "default" | "ok" | "warn" | "error";
}) {
  const toneClass =
    tone === "ok"
      ? "border-emerald-400/25 bg-emerald-500/10"
      : tone === "warn"
        ? "border-amber-400/25 bg-amber-500/10"
        : tone === "error"
          ? "border-red-400/25 bg-red-500/10"
          : "border-white/10 bg-white/5";
  return (
    <article className={`rounded-lg border p-4 ${toneClass}`}>
      <p className="text-xs uppercase tracking-wide text-white/50">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      {detail ? <p className="mt-1 text-xs text-white/60">{detail}</p> : null}
    </article>
  );
}

export default function AdminOpsPage() {
  const { connection } = useAdminConsole();
  const [snapshot, setSnapshot] = useState<OpsMetricsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!connection.baseUrl || !connection.adminToken) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetchOpsMetrics(connection);
      setSnapshot(response);
    } catch (err) {
      setSnapshot(null);
      setError((err as Error).message || "Falha ao carregar metricas operacionais.");
    } finally {
      setLoading(false);
    }
  }, [connection]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => buildOpsSummary(snapshot), [snapshot]);
  const moduleRows = useMemo(() => buildOpsModuleRows(snapshot), [snapshot]);

  return (
    <div className="px-4 py-8 text-white md:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Operacao</h1>
            <p className="text-sm text-white/70">Snapshot interno de runtime metrics em memoria.</p>
            {snapshot?.generatedAt ? (
              <p className="mt-1 text-xs text-white/50">
                Gerado em {new Date(snapshot.generatedAt).toLocaleString("pt-BR")}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="rounded-md border border-re7-sky/30 bg-re7-sky/10 px-3 py-2 text-sm text-white hover:bg-re7-sky/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Atualizando..." : "Atualizar"}
            </button>
            <Link
              href="/admin/tenants"
              className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
            >
              Tenants
            </Link>
          </div>
        </header>

        {error ? (
          <div className="rounded-lg border border-red-400/30 bg-red-900/20 p-4 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          <StatCard
            label="Health"
            value={summary.dbStatus === 1 ? "OK" : summary.dbStatus === 0 ? "DB erro" : "Sem dado"}
            detail="DB status"
            tone={summary.dbStatus === 1 ? "ok" : summary.dbStatus === 0 ? "error" : "warn"}
          />
          <StatCard label="Uptime" value={formatUptime(summary.uptimeSeconds)} detail="Processo Node" />
          <StatCard label="Memoria RSS" value={formatBytes(summary.memoryRss)} detail="Snapshot do processo" />
          <StatCard label="CPU user" value={formatNumber(summary.cpuUser)} detail="microsegundos acumulados" />
          <StatCard label="DB p95" value={formatMs(summary.dbP95Ms)} detail="health dependency" />
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          <StatCard label="Requests" value={formatNumber(summary.totalRequests)} detail="request_count" />
          <StatCard
            label="Errors"
            value={formatNumber(summary.totalErrors)}
            detail="http.errors 4xx/5xx"
            tone={summary.totalErrors > 0 ? "warn" : "ok"}
          />
          <StatCard label="Avg request" value={formatMs(summary.requestAvgMs)} detail="request_duration" />
          <StatCard label="p95 request" value={formatMs(summary.requestP95Ms)} detail="request_duration" />
        </section>

        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Modulos</h2>
              <p className="text-sm text-white/60">Leitura agregada por baixa cardinalidade.</p>
            </div>
            <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/60">
              sem polling
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase text-white/50">
                <tr className="border-b border-white/10">
                  <th className="py-2 pr-3">Modulo</th>
                  <th className="py-2 pr-3">Requests</th>
                  <th className="py-2 pr-3">Errors</th>
                  <th className="py-2 pr-3">Avg</th>
                  <th className="py-2 pr-3">p95</th>
                </tr>
              </thead>
              <tbody>
                {moduleRows.map((item) => (
                  <tr key={item.module} className="border-b border-white/5">
                    <td className="py-3 pr-3 font-medium text-white">{item.module}</td>
                    <td className="py-3 pr-3 text-white/80">{formatNumber(item.requestCount)}</td>
                    <td className="py-3 pr-3 text-white/80">{formatNumber(item.errors)}</td>
                    <td className="py-3 pr-3 text-white/80">{formatMs(item.avgMs)}</td>
                    <td className="py-3 pr-3 text-white/80">{formatMs(item.p95Ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          <StatCard label="Counters" value={formatNumber(snapshot?.counters.length ?? 0)} detail="series em memoria" />
          <StatCard label="Gauges" value={formatNumber(snapshot?.gauges.length ?? 0)} detail="status atual" />
          <StatCard label="Timings" value={formatNumber(snapshot?.timings.length ?? 0)} detail="com avg e p95" />
        </section>
      </div>
    </div>
  );
}
