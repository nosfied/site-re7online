"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AdminConfigPanel from "@/components/admin/AdminConfigPanel";
import {
  AdminConnection,
  fetchTenantsSummary,
  formatDateTime,
  formatPct,
  loadAdminConnection,
  saveAdminConnection,
  SummaryRange,
  testAdminConnection,
  TenantSummaryItem,
} from "@/lib/whatsappAdminApi";

const ranges: SummaryRange[] = ["1h", "24h", "7d", "30d"];

export default function TenantsSummaryPage() {
  const [connection, setConnection] = useState<AdminConnection>({
    baseUrl: "",
    adminToken: "",
    rememberToken: false,
  });
  const [range, setRange] = useState<SummaryRange>("24h");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<TenantSummaryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setConnection(loadAdminConnection());
  }, []);

  useEffect(() => {
    if (!connection.baseUrl && !connection.adminToken) return;
    saveAdminConnection(connection);
  }, [connection]);

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

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setError(null);
    try {
      await testAdminConnection(connection);
    } catch (err) {
      const typed = err as { message?: string };
      setError(typed.message || "Falha ao testar conexao.");
      return;
    } finally {
      setTestingConnection(false);
    }
  };

  return (
    <main className="min-h-screen bg-re7-navy px-4 py-8 text-white md:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Admin Tenants</h1>
            <p className="text-sm text-white/70">
              Summary multi-tenant via /admin/tenants/summary
            </p>
          </div>
          <Link
            href="/"
            className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
          >
            Voltar ao site
          </Link>
        </header>

        <AdminConfigPanel
          connection={connection}
          onChange={setConnection}
          onTestConnection={handleTestConnection}
          testingConnection={testingConnection}
        />

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

        {loading ? <p className="text-sm text-white/70">Carregando...</p> : null}
        {error ? (
          <p className="rounded-md border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100">
            {error}
          </p>
        ) : null}

        <section className="overflow-x-auto rounded-xl border border-white/10 bg-white/5">
          <table className="w-full min-w-[1200px] text-sm">
            <thead className="bg-white/10 text-left">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">tenantId</th>
                <th className="px-3 py-2">clientKey</th>
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
                  <td className="px-3 py-2">{item.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{item.tenantId}</td>
                  <td className="px-3 py-2 font-mono text-xs">{item.clientKey}</td>
                  <td className="px-3 py-2">{item.quota.used} / {item.quota.limit ?? "-"}</td>
                  <td className="px-3 py-2">{formatPct(item.quota.pct)}</td>
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
                  <td className="px-3 py-2">{item.quota.period}</td>
                  <td className="px-3 py-2">{formatDateTime(item.lastMessageAt)}</td>
                  <td className="px-3 py-2">{item.counts.inbound.received}</td>
                  <td className="px-3 py-2">{item.counts.outbound.sent_text}</td>
                  <td className="px-3 py-2">{item.counts.outbound.sent_template}</td>
                  <td className="px-3 py-2">{item.counts.outbound.failed}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/tenants/${encodeURIComponent(item.tenantId)}`}
                      className="rounded-md border border-white/20 px-2 py-1 text-xs hover:bg-white/10"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && !loading ? (
                <tr>
                  <td className="px-3 py-4 text-center text-white/70" colSpan={13}>
                    Nenhum tenant encontrado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
