"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminConsole } from "@/components/admin/AdminConsoleProvider";
import ScreenProcessingOverlay, { useScreenProcessingOperations } from "@/components/app/ScreenProcessingOverlay";
import {
  AdminTemplateCatalogItem,
  AdminTemplateRequestItem,
  approveAdminTemplateRequest,
  cancelAdminTemplateRequest,
  disableAdminTemplate,
  enableAdminTemplate,
  fetchAdminTemplateRequests,
  fetchAdminTemplateRequestMedia,
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
    case "cancelled":
      return "bg-slate-500/20 text-slate-200";
    case "pending":
    default:
      return "bg-amber-500/20 text-amber-200";
  }
}

function getStatusLabel(status: string) {
  switch (status.toLowerCase()) {
    case "requested":
    case "review_started":
    case "pending":
      return "Em análise pela Re7online";
    case "adjustment_requested":
      return "Ajustes solicitados";
    case "internal_approved":
      return "Aprovado internamente";
    case "submitted_to_meta":
      return "Submetido à Meta";
    case "approved_meta":
    case "approved":
      return "Aprovado pela Meta";
    case "rejected_meta":
    case "rejected":
      return "Rejeitado pela Meta";
    case "cancelled":
      return "Cancelada";
    case "failed":
      return "Falha";
    default:
      return status;
  }
}

function canAdminCancelTemplateRequest(status: string) {
  return ["pending", "requested", "review_started", "adjustment_requested", "internal_approved"].includes(
    status.toLowerCase()
  );
}

function isAdminTemplateRequestEditable(status: string) {
  return ["pending", "requested", "review_started", "adjustment_requested", "internal_approved"].includes(
    status.toLowerCase()
  );
}

function isAdminTemplateRequestSubmittable(status: string) {
  return status.toLowerCase() === "internal_approved";
}

function isAdminTemplateRequestSyncable(status: string) {
  return ["submitted_to_meta", "meta_pending", "approved_meta", "meta_approved", "rejected_meta", "meta_rejected"].includes(
    status.toLowerCase()
  );
}

function readProviderError(item: AdminTemplateRequestItem | null) {
  const providerError = item?.providerError;
  if (!providerError || typeof providerError !== "object" || Array.isArray(providerError)) return null;
  const raw = providerError as Record<string, unknown>;
  const read = (key: string) => {
    const value = raw[key];
    if (typeof value !== "string" && typeof value !== "number") return null;
    const normalized = String(value).trim();
    return normalized || null;
  };
  const details = {
    code: read("code"),
    subcode: read("subcode"),
    type: read("type"),
    userTitle: read("userTitle"),
    userMessage: read("userMessage"),
    details: read("details"),
    traceId: read("traceId"),
  };
  return Object.values(details).some(Boolean) ? details : null;
}

function buildTemplatePreviewWithExamples(
  content: string,
  variables: Array<{ key: string; example: string }>
) {
  let preview = content.trim();
  for (const variable of variables) {
    const example = variable.example.trim() || `[exemplo de {{${variable.key}}}]`;
    preview = preview.replace(new RegExp(`{{\\s*${variable.key}\\s*}}`, "g"), example);
  }
  return preview;
}

function TemplateWhatsappPreview({
  body,
  variableExamples,
  category,
  language,
  status,
  templateName,
  headerType = "NONE",
  mediaPreviewUrl = null,
}: {
  body: string;
  variableExamples: Array<{ key: string; example: string }>;
  category: string;
  language: string;
  status: string;
  templateName: string;
  headerType?: "NONE" | "IMAGE" | "VIDEO";
  mediaPreviewUrl?: string | null;
}) {
  const previewBody = buildTemplatePreviewWithExamples(body, variableExamples);
  return (
    <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase text-white/50">Prévia no WhatsApp</p>
        <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-white/70">
          <span className="rounded-full border border-white/15 bg-white/10 px-2 py-1">{category}</span>
          <span className="rounded-full border border-white/15 bg-white/10 px-2 py-1">{language}</span>
          <span className="rounded-full border border-white/15 bg-white/10 px-2 py-1">{getStatusLabel(status)}</span>
        </div>
      </div>
      <p className="mt-1 text-xs text-white/50">{templateName}</p>
      <div className="mt-3 rounded-xl border border-emerald-200/10 bg-[#0b2b24] p-4">
        <div className="ml-auto max-w-[88%] rounded-2xl rounded-tr-sm bg-[#dcf8c6] px-3 py-2 text-sm leading-relaxed text-slate-950 shadow">
          {headerType === "IMAGE" && mediaPreviewUrl ? (
            // Blob URLs are authenticated, ephemeral previews and cannot use Next image optimization.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaPreviewUrl} alt="Prévia autenticada da imagem do header" className="mb-2 max-h-52 w-full rounded-lg object-cover" />
          ) : null}
          {headerType === "VIDEO" && mediaPreviewUrl ? (
            <video src={mediaPreviewUrl} controls className="mb-2 max-h-52 w-full rounded-lg" aria-label="Prévia autenticada do vídeo do header" />
          ) : null}
          <p className="whitespace-pre-wrap">{previewBody || "Sem conteúdo textual."}</p>
        </div>
      </div>
      <p className="mt-2 text-xs text-white/50">
        A aparência final pode variar conforme o WhatsApp e componentes aprovados pela Meta.
      </p>
    </div>
  );
}

export default function ManageTemplatesAdminPage() {
  const { connection } = useAdminConsole();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const processing = useScreenProcessingOperations([
    { key: "admin-template-action", active: Boolean(actingId), title: "Atualizando modelo", message: "Processando submissão ou sincronização…" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [requests, setRequests] = useState<AdminTemplateRequestItem[]>([]);
  const [catalog, setCatalog] = useState<AdminTemplateCatalogItem[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [selectedMediaPreviewUrl, setSelectedMediaPreviewUrl] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftById, setDraftById] = useState<Record<string, {
    name: string;
    category: string;
    language: string;
    content: string;
    notes: string;
    variableDetails?: Array<{ key: string; description: string; example: string }>;
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
        variableDetails: draft.variableDetails ?? item.variableDetails ?? [],
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

  const handleCancel = async (item: AdminTemplateRequestItem) => {
    if (!window.confirm("Cancelar esta solicitação? O registro será mantido para auditoria.")) {
      return;
    }
    setActingId(item.id);
    setError(null);
    setFeedback(null);
    try {
      await cancelAdminTemplateRequest(connection, item.id);
      await loadData(connection);
      setFeedback("Solicitação cancelada.");
    } catch (err) {
      const typed = err as { message?: string };
      setError(typed.message || "Erro ao cancelar solicitação.");
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

  const handleToggleTemplateAvailability = async (item: AdminTemplateCatalogItem, disabled: boolean) => {
    if (disabled) {
      const confirmed = window.confirm(
        "Este modelo continuará aprovado na Meta, mas não ficará disponível para campanhas ou envios pela plataforma."
      );
      if (!confirmed) return;
    }
    setActingId(item.id);
    setError(null);
    setFeedback(null);
    try {
      if (disabled) {
        await disableAdminTemplate(connection, item.id);
      } else {
        await enableAdminTemplate(connection, item.id);
      }
      await loadData(connection);
      setFeedback(disabled ? "Template inativado localmente no Converta." : "Template reativado localmente no Converta.");
    } catch (err) {
      const typed = err as { message?: string };
      setError(typed.message || "Erro ao atualizar disponibilidade local do template.");
    } finally {
      setActingId(null);
    }
  };

  const startEditing = (item: AdminTemplateRequestItem) => {
    setSelectedRequestId(item.id);
    setEditingId(item.id);
    setDraftById((current) => ({
      ...current,
      [item.id]: {
        name: item.name,
        category: item.category,
        language: item.language || "pt_BR",
        content: item.content,
        notes: item.notes || "",
        variableDetails: item.variableDetails ?? [],
      },
    }));
  };

  const visibleRequests = clientKeyFilter
    ? requests.filter((item) => item.clientKey === clientKeyFilter)
    : requests;
  const visibleCatalog = clientKeyFilter
    ? catalog.filter((item) => item.clientKey === clientKeyFilter)
    : catalog;
  const selectedRequest = useMemo(
    () => visibleRequests.find((item) => item.id === selectedRequestId) ?? null,
    [selectedRequestId, visibleRequests]
  );
  const selectedProviderError = useMemo(() => readProviderError(selectedRequest), [selectedRequest]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setSelectedMediaPreviewUrl(null);
    if (!selectedRequest?.exampleMediaId || selectedRequest.headerType === "NONE") return;
    fetchAdminTemplateRequestMedia(connection, selectedRequest.id)
      .then(({ blob }) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSelectedMediaPreviewUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setSelectedMediaPreviewUrl(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [connection, selectedRequest?.exampleMediaId, selectedRequest?.headerType, selectedRequest?.id]);

  return (
    <>
      <ScreenProcessingOverlay active={Boolean(processing)} title={processing?.title ?? "Modelos"} message={processing?.message ?? "Processando…"} />
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
                            {(draftById[item.id]?.variableDetails ?? item.variableDetails ?? []).length > 0 ? (
                              <div className="grid gap-2 rounded-md border border-white/10 bg-white/5 p-2">
                                <p className="text-[11px] font-semibold uppercase text-white/45">Variáveis</p>
                                {(draftById[item.id]?.variableDetails ?? item.variableDetails ?? []).map((variable) => (
                                  <div key={variable.key} className="grid gap-2 md:grid-cols-[90px_minmax(0,1fr)_minmax(0,1fr)]">
                                    <span className="rounded-md border border-white/10 px-2 py-1 text-xs text-white/70">{`{{${variable.key}}}`}</span>
                                    <input
                                      value={variable.description}
                                      onChange={(event) =>
                                        setDraftById((current) => ({
                                          ...current,
                                          [item.id]: {
                                            ...(current[item.id] ?? {
                                              name: item.name,
                                              category: item.category,
                                              language: item.language || "pt_BR",
                                              content: item.content,
                                              notes: item.notes || "",
                                              variableDetails: item.variableDetails ?? [],
                                            }),
                                            variableDetails: (current[item.id]?.variableDetails ?? item.variableDetails ?? []).map((entry) =>
                                              entry.key === variable.key ? { ...entry, description: event.target.value } : entry
                                            ),
                                          },
                                        }))
                                      }
                                      placeholder="Descrição"
                                      className="rounded-md border border-white/15 bg-re7-navy px-2 py-1 text-white"
                                    />
                                    <input
                                      value={variable.example}
                                      onChange={(event) =>
                                        setDraftById((current) => ({
                                          ...current,
                                          [item.id]: {
                                            ...(current[item.id] ?? {
                                              name: item.name,
                                              category: item.category,
                                              language: item.language || "pt_BR",
                                              content: item.content,
                                              notes: item.notes || "",
                                              variableDetails: item.variableDetails ?? [],
                                            }),
                                            variableDetails: (current[item.id]?.variableDetails ?? item.variableDetails ?? []).map((entry) =>
                                              entry.key === variable.key ? { ...entry, example: event.target.value } : entry
                                            ),
                                          },
                                        }))
                                      }
                                      placeholder="Exemplo"
                                      className="rounded-md border border-white/15 bg-re7-navy px-2 py-1 text-white"
                                    />
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="max-w-md">
                            <button
                              type="button"
                              onClick={() => setSelectedRequestId(item.id)}
                              className="text-left font-medium text-white hover:text-re7-sky"
                            >
                              {item.name}
                            </button>
                            <p className="text-xs text-white/55">{item.category} · {item.language || "pt_BR"}</p>
                            <p className="mt-1 line-clamp-2 text-xs text-white/70">{item.content}</p>
                            {item.variableDetails?.length ? (
                              <p className="mt-1 text-[11px] text-white/45">
                                Variaveis: {item.variableDetails.map((variable) => `{{${variable.key}}}`).join(", ")}
                              </p>
                            ) : null}
                            {!isAdminTemplateRequestEditable(item.status) ? (
                              <p className="mt-2 rounded-md border border-sky-300/25 bg-sky-900/20 p-2 text-xs text-sky-100">
                                Este template já foi submetido à Meta ou encerrado. Para alterar conteúdo, crie uma nova solicitação.
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
                              disabled={actingId === item.id || !isAdminTemplateRequestEditable(item.status)}
                              className="rounded-md border border-white/20 bg-white/10 px-3 py-1 text-xs text-white disabled:opacity-60"
                            >
                              Revisar
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setSelectedRequestId(item.id)}
                            className="rounded-md border border-white/20 bg-white/10 px-3 py-1 text-xs text-white disabled:opacity-60"
                          >
                            Detalhes
                          </button>
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
                            disabled={actingId === item.id || !isAdminTemplateRequestSubmittable(item.status)}
                            className="rounded-md border border-re7-sky/30 bg-re7-sky/10 px-3 py-1 text-xs text-sky-100 disabled:opacity-60"
                          >
                            Enviar Meta
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSyncRequest(item.id)}
                            disabled={actingId === item.id || !isAdminTemplateRequestSyncable(item.status)}
                            className="rounded-md border border-white/20 bg-white/10 px-3 py-1 text-xs text-white disabled:opacity-60"
                          >
                            Sincronizar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCancel(item)}
                            disabled={actingId === item.id || !canAdminCancelTemplateRequest(item.status)}
                            className="rounded-md border border-red-300/30 bg-red-900/20 px-3 py-1 text-xs text-red-100 disabled:opacity-60"
                          >
                            Cancelar
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
            <h2 className="text-sm font-semibold">Painel de revisão</h2>
            <p className="mt-1 text-xs text-white/55">
              Selecione uma solicitação para ver prévia, status e ações permitidas pelo ciclo de vida.
            </p>
          </div>
          {selectedRequest ? (
            <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_380px]">
              <div className="grid gap-3">
                <div className="rounded-lg border border-white/10 bg-re7-navy/60 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-white">{selectedRequest.name}</p>
                      <p className="mt-1 text-xs text-white/50">
                        {selectedRequest.clientName || selectedRequest.clientId}
                      </p>
                    </div>
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getStatusClasses(selectedRequest.status)}`}>
                      {selectedRequest.statusLabel || selectedRequest.status}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-white/65 sm:grid-cols-3">
                    <p><span className="block text-white/40">Categoria</span>{selectedRequest.category}</p>
                    <p><span className="block text-white/40">Idioma</span>{selectedRequest.language || "pt_BR"}</p>
                    <p><span className="block text-white/40">Criado em</span>{formatDateTime(selectedRequest.createdAt)}</p>
                  </div>
                  {!isAdminTemplateRequestEditable(selectedRequest.status) ? (
                    <p className="mt-3 rounded-md border border-sky-300/25 bg-sky-900/20 p-2 text-xs text-sky-100">
                      Este template já foi submetido à Meta ou encerrado. O conteúdo fica somente leitura; use sincronização quando houver status Meta.
                    </p>
                  ) : null}
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <p className="text-xs font-semibold uppercase text-white/45">Conteúdo</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-white/75">{selectedRequest.content}</p>
                </div>
                {selectedRequest.variableDetails?.length ? (
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <p className="text-xs font-semibold uppercase text-white/45">Variáveis</p>
                    <div className="mt-2 grid gap-2">
                      {selectedRequest.variableDetails.map((variable) => (
                        <div key={variable.key} className="rounded-md border border-white/10 bg-re7-navy/60 p-2 text-xs text-white/70">
                          <span className="font-semibold text-white">{`{{${variable.key}}}`}</span>
                          <span className="ml-2">{variable.description || "Sem descrição"}</span>
                          <span className="ml-2 text-white/45">Exemplo: {variable.example || "-"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {selectedProviderError ? (
                  <div className="rounded-lg border border-red-300/25 bg-red-950/20 p-3 text-sm text-red-100">
                    <p className="text-xs font-semibold uppercase text-red-200/80">Diagnóstico Meta</p>
                    <div className="mt-2 grid gap-2 text-xs text-red-50/80 sm:grid-cols-2">
                      {selectedProviderError.code ? <p><span className="block text-red-200/55">Code</span>{selectedProviderError.code}</p> : null}
                      {selectedProviderError.subcode ? <p><span className="block text-red-200/55">Subcode</span>{selectedProviderError.subcode}</p> : null}
                      {selectedProviderError.type ? <p><span className="block text-red-200/55">Tipo</span>{selectedProviderError.type}</p> : null}
                      {selectedProviderError.traceId ? <p><span className="block text-red-200/55">Trace</span>{selectedProviderError.traceId}</p> : null}
                    </div>
                    {selectedProviderError.userTitle ? (
                      <p className="mt-2 text-xs font-semibold text-red-50">{selectedProviderError.userTitle}</p>
                    ) : null}
                    {selectedProviderError.userMessage || selectedProviderError.details ? (
                      <p className="mt-1 whitespace-pre-wrap text-xs text-red-50/80">
                        {selectedProviderError.userMessage || selectedProviderError.details}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <p className="text-xs font-semibold uppercase text-white/45">Ações do ciclo de vida</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => startEditing(selectedRequest)}
                      disabled={actingId === selectedRequest.id || !isAdminTemplateRequestEditable(selectedRequest.status)}
                      className="rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-white disabled:opacity-60"
                    >
                      Revisar/editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApprove(selectedRequest.id)}
                      disabled={actingId === selectedRequest.id || !["requested", "review_started", "pending"].includes(selectedRequest.status)}
                      className="rounded-md border border-emerald-400/30 bg-emerald-900/20 px-3 py-1.5 text-xs text-emerald-100 disabled:opacity-60"
                    >
                      Aprovar internamente
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSubmitToMeta(selectedRequest.id)}
                      disabled={actingId === selectedRequest.id || !isAdminTemplateRequestSubmittable(selectedRequest.status)}
                      className="rounded-md border border-re7-sky/30 bg-re7-sky/10 px-3 py-1.5 text-xs text-sky-100 disabled:opacity-60"
                    >
                      Submeter à Meta
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSyncRequest(selectedRequest.id)}
                      disabled={actingId === selectedRequest.id || !isAdminTemplateRequestSyncable(selectedRequest.status)}
                      className="rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-white disabled:opacity-60"
                    >
                      Sincronizar status
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCancel(selectedRequest)}
                      disabled={actingId === selectedRequest.id || !canAdminCancelTemplateRequest(selectedRequest.status)}
                      className="rounded-md border border-red-300/30 bg-red-900/20 px-3 py-1.5 text-xs text-red-100 disabled:opacity-60"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
              <TemplateWhatsappPreview
                body={selectedRequest.content}
                variableExamples={selectedRequest.variableDetails ?? []}
                category={selectedRequest.category}
                language={selectedRequest.language || "pt_BR"}
                status={selectedRequest.status}
                templateName={selectedRequest.name}
                headerType={selectedRequest.headerType ?? "NONE"}
                mediaPreviewUrl={selectedMediaPreviewUrl}
              />
            </div>
          ) : (
            <p className="p-4 text-sm text-white/70">Nenhuma solicitação selecionada.</p>
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
              <table className="w-full min-w-[920px] text-sm">
                <thead className="bg-white/10 text-left">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Cliente</th>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2">Language</th>
                    <th className="px-3 py-2">Disponibilidade</th>
                    <th className="px-3 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCatalog.map((item) => (
                    <tr key={item.id} className="border-t border-white/10">
                      <td className="px-3 py-2">{item.name}</td>
                      <td className="px-3 py-2">{item.clientName || item.clientId}</td>
                      <td className="px-3 py-2">{item.category}</td>
                      <td className="px-3 py-2">{item.language}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                            item.locallyDisabled
                              ? "bg-amber-500/20 text-amber-100"
                              : "bg-emerald-500/20 text-emerald-100"
                          }`}
                        >
                          {item.locallyDisabled ? "Inativo no Converta" : "Ativo no Converta"}
                        </span>
                        <p className="mt-1 text-xs text-white/45">Status Meta preservado: {item.status}</p>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => handleToggleTemplateAvailability(item, !item.locallyDisabled)}
                          disabled={actingId === item.id}
                          className="rounded-md border border-white/20 bg-white/10 px-3 py-1 text-xs text-white disabled:opacity-60"
                        >
                          {actingId === item.id
                            ? "Atualizando..."
                            : item.locallyDisabled
                              ? "Reativar"
                              : "Inativar"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
    </>
  );
}
