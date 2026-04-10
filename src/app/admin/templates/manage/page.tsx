"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAdminConsole } from "@/components/admin/AdminConsoleProvider";
import {
  AdminTemplateCatalogItem,
  AdminTemplateRequestItem,
  approveAdminTemplateRequest,
  fetchAdminTemplateRequests,
  fetchTemplatesObservability,
  formatDateTime,
  rejectAdminTemplateRequest,
} from "@/lib/whatsappAdminApi";

function getStatusClasses(status: string) {
  switch (status.toLowerCase()) {
    case "approved":
      return "bg-emerald-500/20 text-emerald-200";
    case "rejected":
    case "failed":
      return "bg-red-500/20 text-red-200";
    case "pending":
    default:
      return "bg-amber-500/20 text-amber-200";
  }
}

export default function ManageTemplatesAdminPage() {
  const { connection } = useAdminConsole();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [requests, setRequests] = useState<AdminTemplateRequestItem[]>([]);
  const [catalog, setCatalog] = useState<AdminTemplateCatalogItem[]>([]);
  const clientKeyFilter = searchParams.get("clientKey")?.trim() ?? "";
  const tenantIdFilter = searchParams.get("tenantId")?.trim() ?? "";

  const loadData = useCallback(async (activeConnection: typeof connection) => {
    const [requestsResponse, templatesResponse] = await Promise.all([
      fetchAdminTemplateRequests(activeConnection),
      fetchTemplatesObservability(activeConnection),
    ]);
    setRequests(requestsResponse.items);
    setCatalog(templatesResponse.catalog ?? []);
  }, []);

  useEffect(() => {
    if (!connection.baseUrl || !connection.adminToken) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    loadData(connection)
      .catch((err: { message?: string }) => {
        if (cancelled) return;
        setError(err.message || "Falha ao carregar gestao de templates.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [connection, loadData]);

  const handleApprove = async (requestId: string) => {
    if (!window.confirm("Deseja aprovar este template?")) {
      return;
    }
    setActingId(requestId);
    setError(null);
    setFeedback(null);
    try {
      await approveAdminTemplateRequest(connection, requestId);
      await loadData(connection);
      setFeedback("Template aprovado com sucesso.");
    } catch (err) {
      const typed = err as { message?: string };
      setError(typed.message || "Erro ao aprovar template.");
    } finally {
      setActingId(null);
    }
  };

  const handleReject = async (requestId: string) => {
    setActingId(requestId);
    setError(null);
    setFeedback(null);
    try {
      await rejectAdminTemplateRequest(connection, requestId);
      await loadData(connection);
      setFeedback("Template rejeitado com sucesso.");
    } catch (err) {
      const typed = err as { message?: string };
      setError(typed.message || "Erro ao rejeitar template.");
    } finally {
      setActingId(null);
    }
  };

  const visibleRequests = clientKeyFilter
    ? requests.filter((item) => item.clientKey === clientKeyFilter)
    : requests;
  const visibleCatalog = clientKeyFilter
    ? catalog.filter((item) => item.clientKey === clientKeyFilter)
    : catalog;

  return (
    <div className="px-4 py-8 text-white md:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Gestao de templates</h1>
            <p className="text-sm text-white/70">Aprovacao de requests e catalogo aprovado.</p>
            {clientKeyFilter ? (
              <p className="mt-1 text-xs text-white/50">
                Templates do tenant: {tenantIdFilter || clientKeyFilter}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/templates"
              className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
            >
              Observabilidade
            </Link>
            <Link
              href="/admin/tenants"
              className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
            >
              Voltar
            </Link>
          </div>
        </header>

        {loading ? <p className="text-sm text-white/70">Carregando...</p> : null}
        {error ? (
          <p className="rounded-md border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100">
            {error}
          </p>
        ) : null}
        {feedback ? (
          <p className="rounded-md border border-emerald-400/30 bg-emerald-900/20 p-3 text-sm text-emerald-100">
            {feedback}
          </p>
        ) : null}
        {clientKeyFilter ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-re7-sky/30 bg-re7-sky/10 px-3 py-1 text-xs text-white">
              Tenant filtrado
            </span>
            <Link
              href="/admin/templates/manage"
              className="rounded-md border border-white/20 px-3 py-1 text-xs text-white/80 hover:bg-white/10"
            >
              Limpar filtro
            </Link>
          </div>
        ) : null}

        <section className="rounded-xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold">Template requests</h2>
          </div>
          {visibleRequests.length === 0 ? (
            <p className="p-4 text-sm text-white/70">Nenhuma solicitacao encontrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-white/10 text-left">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Cliente</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Criado em</th>
                    <th className="px-3 py-2">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRequests.map((item) => (
                    <tr key={item.id} className="border-t border-white/10">
                      <td className="px-3 py-2">{item.name}</td>
                      <td className="px-3 py-2">{item.clientName || item.clientId}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getStatusClasses(item.status)}`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="px-3 py-2">{formatDateTime(item.createdAt)}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleApprove(item.id)}
                            disabled={actingId === item.id || item.status !== "pending"}
                            className="rounded-md border border-emerald-400/30 bg-emerald-900/20 px-3 py-1 text-xs text-emerald-100 disabled:opacity-60"
                          >
                            Aprovar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReject(item.id)}
                            disabled={actingId === item.id || item.status !== "pending"}
                            className="rounded-md border border-red-400/30 bg-red-900/20 px-3 py-1 text-xs text-red-100 disabled:opacity-60"
                          >
                            Rejeitar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold">Template catalog</h2>
          </div>
          {visibleCatalog.length === 0 ? (
            <p className="p-4 text-sm text-white/70">Nenhum template aprovado encontrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-sm">
                <thead className="bg-white/10 text-left">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Cliente</th>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2">Language</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCatalog.map((item) => (
                    <tr key={item.id} className="border-t border-white/10">
                      <td className="px-3 py-2">{item.name}</td>
                      <td className="px-3 py-2">{item.clientName || item.clientId}</td>
                      <td className="px-3 py-2">{item.category}</td>
                      <td className="px-3 py-2">{item.language}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
