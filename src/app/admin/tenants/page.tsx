"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAdminConsole } from "@/components/admin/AdminConsoleProvider";
import {
  fetchTenantsSummary,
  formatDateTime,
  formatPct,
  SummaryRange,
  TenantSummaryItem,
} from "@/lib/whatsappAdminApi";

const ranges: SummaryRange[] = ["1h", "24h", "7d", "30d"];

function getTenantActivityStatus(lastMessageAt: string | null) {
  if (!lastMessageAt) {
    return {
      label: "inativo",
      className: "bg-white/10 text-white/70",
    };
  }

  const diff = Date.now() - new Date(lastMessageAt).getTime();
  if (diff < 1000 * 60 * 60) {
    return {
      label: "ativo",
      className: "bg-emerald-500/20 text-emerald-200",
    };
  }
  if (diff < 1000 * 60 * 60 * 24) {
    return {
      label: "recente",
      className: "bg-amber-500/20 text-amber-200",
    };
  }
  return {
    label: "inativo",
    className: "bg-white/10 text-white/70",
  };
}

export default function TenantsSummaryPage() {
  const { connection } = useAdminConsole();
  const [range, setRange] = useState<SummaryRange>("24h");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<TenantSummaryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedClientKey, setCopiedClientKey] = useState<string | null>(null);

  useEffect(() => {
    if (!connection.baseUrl || !connection.adminToken) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchTenantsSummary(connection, range)
      .then((result) => {
        if (!cancelled) setItems(result);
      })
      .catch((err: { status?: number; message?: string }) => {
        if (cancelled) return;
        if (err.status === 403) {
          setError("Sem permissao para acessar summary.");
          return;
        }
        setError(err.message || "Falha ao carregar tenants.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [connection, range]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const haystack = `${item.name} ${item.tenantId} ${item.clientKey}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [items, search]);

  return (
    <div className="px-4 py-8 text-white md:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Tenants</h1>
            <p className="text-sm text-white/70">Hub operacional do console interno.</p>
          </div>
          <Link
            href="/"
            className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
          >
            Voltar ao site
          </Link>
        </header>

        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Range</span>
              <select
                className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2"
                value={range}
                onChange={(event) => setRange(event.target.value as SummaryRange)}
              >
                {ranges.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>

            <label className="md:col-span-2 grid gap-1 text-sm">
              <span className="text-white/70">Search (name, tenantId, clientKey)</span>
              <input
                className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="re7online"
              />
            </label>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wide text-white/50">Tenants visiveis</p>
            <p className="mt-2 text-2xl font-semibold">{filtered.length}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wide text-white/50">Com warning</p>
            <p className="mt-2 text-2xl font-semibold">
              {filtered.filter((item) => item.quota.warning).length}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wide text-white/50">Sem atividade</p>
            <p className="mt-2 text-2xl font-semibold">
              {filtered.filter((item) => !item.lastMessageAt).length}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wide text-white/50">Range atual</p>
            <p className="mt-2 text-2xl font-semibold">{range}</p>
          </div>
        </section>

        {loading ? <p className="text-sm text-white/70">Carregando...</p> : null}
        {error ? (
          <p className="rounded-md border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100">
            {error}
          </p>
        ) : null}

        <section className="overflow-x-auto rounded-xl border border-white/10 bg-white/5">
          <table className="w-full min-w-[1320px] text-sm">
            <thead className="bg-white/10 text-left">
              <tr>
                <th className="px-3 py-2">Tenant</th>
                <th className="px-3 py-2">tenantId</th>
                <th className="px-3 py-2">clientKey</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Quota</th>
                <th className="px-3 py-2">Pct</th>
                <th className="px-3 py-2">Warning</th>
                <th className="px-3 py-2">Period</th>
                <th className="px-3 py-2">Last message</th>
                <th className="px-3 py-2">Inbound</th>
                <th className="px-3 py-2">Outbound text</th>
                <th className="px-3 py-2">Outbound tpl</th>
                <th className="px-3 py-2">Outbound failed</th>
                <th className="px-3 py-2">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.tenantId} className="border-t border-white/10">
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{item.name}</span>
                      <span className="text-xs text-white/50">Operacao do tenant</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{item.tenantId}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">{item.clientKey}</span>
                      <button
                        type="button"
                        onClick={async () => {
                          await navigator.clipboard.writeText(item.clientKey);
                          setCopiedClientKey(item.clientKey);
                          window.setTimeout(() => {
                            setCopiedClientKey((current) =>
                              current === item.clientKey ? null : current
                            );
                          }, 1500);
                        }}
                        className="rounded-md border border-white/20 px-2 py-1 text-[11px] hover:bg-white/10"
                      >
                        {copiedClientKey === item.clientKey ? "copiado" : "copiar"}
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {(() => {
                      const status = getTenantActivityStatus(item.lastMessageAt);
                      return (
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${status.className}`}>
                          {status.label}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        item.quota.warning
                          ? "bg-amber-500/20 text-amber-200"
                          : "bg-emerald-500/20 text-emerald-200"
                      }`}
                    >
                      {item.quota.warning ? "warning" : "ok"}
                    </span>
                  </td>
                  <td className="px-3 py-2">{item.quota.used} / {item.quota.limit ?? "-"}</td>
                  <td className="px-3 py-2">{formatPct(item.quota.pct)}</td>
                  <td className="px-3 py-2">{item.quota.period}</td>
                  <td className="px-3 py-2">{formatDateTime(item.lastMessageAt)}</td>
                  <td className="px-3 py-2">{item.counts.inbound.received}</td>
                  <td className="px-3 py-2">{item.counts.outbound.sent_text}</td>
                  <td className="px-3 py-2">{item.counts.outbound.sent_template}</td>
                  <td className="px-3 py-2">{item.counts.outbound.failed}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/tenants/${encodeURIComponent(item.tenantId)}`}
                        className="rounded-md border border-white/20 px-2 py-1 text-xs hover:bg-white/10"
                      >
                        Abrir
                      </Link>
                      <Link
                        href={`/admin/tenants/${encodeURIComponent(item.tenantId)}/onboarding`}
                        className="rounded-md border border-white/20 px-2 py-1 text-xs hover:bg-white/10"
                      >
                        Onboarding
                      </Link>
                      <Link
                        href={`/admin/tenants/${encodeURIComponent(item.tenantId)}/campaigns`}
                        className="rounded-md border border-white/20 px-2 py-1 text-xs hover:bg-white/10"
                      >
                        Campanhas
                      </Link>
                      <Link
                        href={`/admin/templates/manage?tenantId=${encodeURIComponent(item.tenantId)}&clientKey=${encodeURIComponent(item.clientKey)}`}
                        className="rounded-md border border-white/20 px-2 py-1 text-xs hover:bg-white/10"
                      >
                        Templates
                      </Link>
                      <Link
                        href={`/admin/tenants/${encodeURIComponent(item.tenantId)}/users?clientKey=${encodeURIComponent(item.clientKey)}`}
                        className="rounded-md border border-white/20 px-2 py-1 text-xs hover:bg-white/10"
                      >
                        Usuarios
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && !loading ? (
                <tr>
                  <td className="px-3 py-4 text-center text-white/70" colSpan={14}>
                    Nenhum tenant encontrado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
