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
  syncAdminTemplateRequest,
  submitAdminTemplateRequestToMeta,
  updateAdminTemplateRequest,
} from "@/lib/whatsappAdminApi";

function getStatusClasses(status: string) {
  switch (status.toLowerCase()) {
    case "approved_meta":
    case "approved":
      return "bg-emerald-500/20 text-emerald-200";
    case "submitted_to_meta":
    case "internal_approved":
      return "bg-sky-500/20 text-sky-100";
    case "adjustment_requested":
      return "bg-orange-500/20 text-orange-100";
    case "rejected":
    case "rejected_meta":
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftById, setDraftById] = useState<Record<string, {
    name: string;
    category: string;
    language: string;
    content: string;
    notes: string;
  }>>({});
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
      setFeedback("Solicitacao aprovada internamente.");
    } catch (err) {
      const typed = err as { message?: string };
      setError(typed.message || "Erro ao aprovar template.");
    } finally {
      setActingId(null);
    }
  };

  const handleSave = async (item: AdminTemplateRequestItem) => {
    const draft = draftById[item.id];
    if (!draft) return;
    setActingId(item.id);
    setError(null);
    setFeedback(null);
    try {
      await updateAdminTemplateRequest(connection, item.id, {
        name: draft.name,
        category: draft.category,
        language: draft.language,
        content: draft.content,
        variableDetails: item.variableDetails ?? [],
        notes: draft.notes || null,
        status: "review_started",
      });
      await loadData(connection);
      setEditingId(null);
      setFeedback("Solicitacao atualizada para revisao interna.");
    } catch (err) {
      const typed = err as { message?: string };
      setError(typed.message || "Erro ao atualizar solicitacao.");
    } finally {
      setActingId(null);
    }
  };

  const handleSubmitToMeta = async (requestId: string) => {
    if (!window.confirm("Enviar este template para aprovacao da Meta usando a configuracao do tenant?")) {
      return;
    }
    setActingId(requestId);
    setError(null);
    setFeedback(null);
    try {
      await submitAdminTemplateRequestToMeta(connection, requestId);
      await loadData(connection);
      setFeedback("Template submetido para aprovacao da Meta.");
    } catch (err) {
      const typed = err as { message?: string };
      setError(typed.message || "Erro ao submeter template para a Meta.");
    } finally {
      setActingId(null);
    }
  };

  const handleSyncRequest = async (requestId: string) => {
    setActingId(requestId);
    setError(null);
    setFeedback(null);
    try {
      await syncAdminTemplateRequest(connection, requestId);
      await loadData(connection);
      setFeedback("Status sincronizado com a Meta.");
    } catch (err) {
      const typed = err as { message?: string };
      setError(typed.message || "Erro ao sincronizar template.");
    } finally {
      setActingId(null);
    }
  };

  const startEditing = (item: AdminTemplateRequestItem) => {
    setEditingId(item.id);
    setDraftById((current) => ({
      ...current,
      [item.id]: {
        name: item.name,
        category: item.category,
        language: item.language || "pt_BR",
        content: item.content,
        notes: item.notes || "",
      },
    }));
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
            <p className="mt-1 text-xs text-white/50">
              Ajustes necessários podem ser feitos internamente pela equipe Re7online antes da submissão à Meta.
            </p>
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
                    <th className="px-3 py-2">Solicitacao</th>
                    <th className="px-3 py-2">Cliente</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Criado em</th>
                    <th className="px-3 py-2">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRequests.map((item) => (
                    <tr key={item.id} className="border-t border-white/10">
                      <td className="px-3 py-2">
                        {editingId === item.id ? (
                          <div className="grid min-w-[360px] gap-2">
                            <input
                              value={draftById[item.id]?.name ?? item.name}
                              onChange={(event) =>
                                setDraftById((current) => ({
                                  ...current,
                                  [item.id]: { ...(current[item.id] ?? { category: item.category, language: item.language || "pt_BR", content: item.content, notes: item.notes || "" }), name: event.target.value },
                                }))
                              }
                              className="rounded-md border border-white/15 bg-re7-navy px-2 py-1 text-white"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                value={draftById[item.id]?.category ?? item.category}
                                onChange={(event) =>
                                  setDraftById((current) => ({
                                    ...current,
                                    [item.id]: { ...(current[item.id] ?? { name: item.name, language: item.language || "pt_BR", content: item.content, notes: item.notes || "" }), category: event.target.value },
                                  }))
                                }
                                className="rounded-md border border-white/15 bg-re7-navy px-2 py-1 text-white"
                              />
                              <input
                                value={draftById[item.id]?.language ?? item.language ?? "pt_BR"}
                                onChange={(event) =>
                                  setDraftById((current) => ({
                                    ...current,
                                    [item.id]: { ...(current[item.id] ?? { name: item.name, category: item.category, content: item.content, notes: item.notes || "" }), language: event.target.value },
                                  }))
                                }
                                className="rounded-md border border-white/15 bg-re7-navy px-2 py-1 text-white"
                              />
                            </div>
                            <textarea
                              value={draftById[item.id]?.content ?? item.content}
                              onChange={(event) =>
                                setDraftById((current) => ({
                                  ...current,
                                  [item.id]: { ...(current[item.id] ?? { name: item.name, category: item.category, language: item.language || "pt_BR", notes: item.notes || "" }), content: event.target.value },
                                }))
                              }
                              rows={3}
                              className="rounded-md border border-white/15 bg-re7-navy px-2 py-1 text-white"
                            />
                            <textarea
                              value={draftById[item.id]?.notes ?? item.notes ?? ""}
                              onChange={(event) =>
                                setDraftById((current) => ({
                                  ...current,
                                  [item.id]: { ...(current[item.id] ?? { name: item.name, category: item.category, language: item.language || "pt_BR", content: item.content }), notes: event.target.value },
                                }))
                              }
                              rows={2}
                              placeholder="Notas internas ou ajustes solicitados"
                              className="rounded-md border border-white/15 bg-re7-navy px-2 py-1 text-white"
                            />
                          </div>
                        ) : (
                          <div className="max-w-md">
                            <p className="font-medium text-white">{item.name}</p>
                            <p className="text-xs text-white/55">{item.category} · {item.language || "pt_BR"}</p>
                            <p className="mt-1 line-clamp-2 text-xs text-white/70">{item.content}</p>
                            {item.variableDetails?.length ? (
                              <p className="mt-1 text-[11px] text-white/45">
                                Variaveis: {item.variableDetails.map((variable) => `{{${variable.key}}}`).join(", ")}
                              </p>
                            ) : null}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">{item.clientName || item.clientId}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getStatusClasses(item.status)}`}
                        >
                          {item.statusLabel || item.status}
                        </span>
                      </td>
                      <td className="px-3 py-2">{formatDateTime(item.createdAt)}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          {editingId === item.id ? (
                            <button
                              type="button"
                              onClick={() => handleSave(item)}
                              disabled={actingId === item.id}
                              className="rounded-md border border-sky-400/30 bg-sky-900/20 px-3 py-1 text-xs text-sky-100 disabled:opacity-60"
                            >
                              Salvar
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEditing(item)}
                              disabled={actingId === item.id}
                              className="rounded-md border border-white/20 bg-white/10 px-3 py-1 text-xs text-white disabled:opacity-60"
                            >
                              Revisar
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleApprove(item.id)}
                            disabled={actingId === item.id || !["requested", "review_started", "pending"].includes(item.status)}
                            className="rounded-md border border-emerald-400/30 bg-emerald-900/20 px-3 py-1 text-xs text-emerald-100 disabled:opacity-60"
                          >
                            Aprovar interno
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSubmitToMeta(item.id)}
                            disabled={actingId === item.id || !["internal_approved", "submitted_to_meta"].includes(item.status)}
                            className="rounded-md border border-re7-sky/30 bg-re7-sky/10 px-3 py-1 text-xs text-sky-100 disabled:opacity-60"
                          >
                            Enviar Meta
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSyncRequest(item.id)}
                            disabled={actingId === item.id || !["submitted_to_meta", "approved_meta", "rejected_meta"].includes(item.status)}
                            className="rounded-md border border-white/20 bg-white/10 px-3 py-1 text-xs text-white disabled:opacity-60"
                          >
                            Sincronizar
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
