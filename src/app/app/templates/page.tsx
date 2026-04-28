"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import {
  AppApiError,
  AppSession,
  AppTemplateItem,
  AppTemplateRequestItem,
  clearAppSession,
  createAppTemplateRequest,
  listAppTemplateRequests,
  listAppTemplates,
  loadAppSession,
  saveAppSession,
  syncAppTemplate,
} from "@/lib/appClientApi";
import { formatDateTime } from "@/lib/whatsappAdminApi";

type TemplateRequestFormState = {
  name: string;
  content: string;
  variables: string;
  category: string;
  autoSubmit: boolean;
};

const EMPTY_FORM: TemplateRequestFormState = {
  name: "",
  content: "",
  variables: "",
  category: "MARKETING",
  autoSubmit: true,
};

const CATEGORY_OPTIONS = ["MARKETING", "UTILITY", "AUTHENTICATION"] as const;

type CatalogItem = {
  id: string;
  templateId: string | null;
  name: string;
  category: string;
  submittedCategory: string | null;
  wasRecategorized: boolean;
  status: string;
  updatedAt: string;
  rejectionReason: string | null;
  syncable: boolean;
};

function getStatusClasses(status: string) {
  switch (status.toLowerCase()) {
    case "submitting":
      return "bg-amber-500/20 text-amber-200";
    case "approved":
      return "bg-emerald-500/20 text-emerald-200";
    case "failed":
    case "rejected":
      return "bg-red-500/20 text-red-200";
    case "pending":
    default:
      return "bg-amber-500/20 text-amber-200";
  }
}

function getStatusLabel(status: string) {
  switch (status.toLowerCase()) {
    case "submitting":
    case "pending":
      return "Em analise";
    case "approved":
      return "Aprovado";
    case "rejected":
      return "Rejeitado";
    case "failed":
      return "Falha";
    default:
      return status;
  }
}

function parseVariablesInput(input: string) {
  const value = input.trim();
  if (!value) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error("Variables deve ser um JSON valido.");
  }
}

function normalizeTemplateName(input: string) {
  return input.trim().toLowerCase();
}

function isTemplateRequestPendingLike(status: string) {
  const normalized = status.trim().toLowerCase();
  return normalized === "pending" || normalized === "submitting";
}

function isRetryableLocalTemplateFailure(item: Pick<AppTemplateItem, "status" | "rejectionReason">) {
  const normalizedStatus = item.status.trim().toLowerCase();
  const normalizedReason = String(item.rejectionReason || "").trim().toLowerCase();
  if (normalizedStatus !== "failed") return false;
  return (
    normalizedReason === "template_name_required" ||
    normalizedReason === "template_name_invalid" ||
    normalizedReason === "template_category_invalid" ||
    normalizedReason === "template_language_required" ||
    normalizedReason === "template_language_invalid" ||
    normalizedReason === "template_content_required" ||
    normalizedReason === "template_content_too_long" ||
    normalizedReason === "template_variables_invalid"
  );
}

function sortTemplates(items: AppTemplateItem[]) {
  return [...items].sort((left, right) => {
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

function sortRequests(items: AppTemplateRequestItem[]) {
  return [...items].sort((left, right) => {
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

function sortCatalogItems(items: CatalogItem[]) {
  return [...items].sort((left, right) => {
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

function buildCatalogItems(templates: AppTemplateItem[], requests: AppTemplateRequestItem[]) {
  const itemsByName = new Map<string, CatalogItem>();

  for (const request of sortRequests(requests)) {
    const key = normalizeTemplateName(request.name);
    if (!key || itemsByName.has(key)) continue;
    itemsByName.set(key, {
      id: `request:${request.id}`,
      templateId: null,
      name: request.name,
      category: request.category,
      submittedCategory: request.category,
      wasRecategorized: false,
      status: request.status,
      updatedAt: request.createdAt,
      rejectionReason: request.notes,
      syncable: false,
    });
  }

  for (const template of sortTemplates(templates)) {
    const key = normalizeTemplateName(template.name);
    if (!key) continue;
    itemsByName.set(key, {
      id: template.id,
      templateId: template.id,
      name: template.name,
      category: template.category,
      submittedCategory: template.submittedCategory,
      wasRecategorized: template.wasRecategorized,
      status: template.status,
      updatedAt: template.updatedAt,
      rejectionReason: template.rejectionReason,
      syncable: true,
    });
  }

  return sortCatalogItems(Array.from(itemsByName.values()));
}

function getTemplateReason(item: Pick<AppTemplateItem, "status" | "rejectionReason">) {
  if (item.rejectionReason) return item.rejectionReason;
  const normalizedStatus = item.status.toLowerCase();
  if (normalizedStatus === "submitting" || normalizedStatus === "pending") {
    return "Em analise pela Meta";
  }
  if (normalizedStatus === "failed") {
    return "Falha ao enviar para analise";
  }
  return "-";
}

function getTemplateRecategorizationLabel(
  item: Pick<CatalogItem, "category" | "submittedCategory" | "wasRecategorized">
) {
  if (!item.wasRecategorized || !item.submittedCategory || item.submittedCategory === item.category) {
    return null;
  }
  return {
    badge: "Recategorizado pela Meta",
    detail: `${item.submittedCategory} -> ${item.category}`,
  };
}

function getSubmissionMessage(submission?: {
  mode: "assisted" | "self_service";
  status: string | null;
}) {
  if (!submission) {
    return "Template solicitado com sucesso.";
  }
  if (submission.mode === "assisted") {
    return "Sua conta Meta ainda nao esta conectada. O template foi enviado para revisao interna.";
  }

  switch ((submission.status || "").toLowerCase()) {
    case "approved":
      return "Template aprovado e pronto para uso em campanhas.";
    case "rejected":
      return "Template rejeitado pela Meta.";
    case "failed":
      return "Nao foi possivel enviar o template para analise.";
    case "submitting":
    case "pending":
    case "pending_review":
    default:
      return "Seu template foi enviado para a Meta e esta em analise.";
  }
}

function isNetworkTimeoutLikeError(error: AppApiError) {
  return error.errorCode === "network_timeout" || error.errorCode === "network_error" || error.status === 0;
}

export default function AppTemplatesPage() {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [templates, setTemplates] = useState<AppTemplateItem[]>([]);
  const [requests, setRequests] = useState<AppTemplateRequestItem[]>([]);
  const [form, setForm] = useState<TemplateRequestFormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [syncingTemplateId, setSyncingTemplateId] = useState<string | null>(null);
  const [highlightedTemplateId, setHighlightedTemplateId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const catalogItems = useMemo(() => buildCatalogItems(templates, requests), [templates, requests]);

  const handleUnauthorized = useCallback(() => {
    clearAppSession();
    router.replace("/app/login");
  }, [router]);

  const loadData = useCallback(
    async (activeSession: AppSession) => {
      const [templatesResponse, requestsResponse] = await Promise.all([
        listAppTemplates(activeSession),
        listAppTemplateRequests(activeSession),
      ]);
      const nextTemplates = sortTemplates(templatesResponse.items);
      const nextRequests = requestsResponse.items;
      setTemplates(nextTemplates);
      setRequests(nextRequests);
      return {
        templates: nextTemplates,
        requests: nextRequests,
      };
    },
    []
  );

  useEffect(() => {
    const stored = loadAppSession();
    if (!stored?.token) {
      router.replace("/app/login");
      return;
    }
    setSession(stored);
    saveAppSession(stored);
  }, [router]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    loadData(session)
      .catch((err: { status?: number; message?: string }) => {
        if (cancelled) return;
        if (err.status === 401) {
          handleUnauthorized();
          return;
        }
        setError(err.message || "Erro ao carregar templates.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [handleUnauthorized, loadData, session]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) return;
    setFormError(null);
    setSuccess(null);

    const name = form.name.trim();
    const content = form.content.trim();
    const category = form.category.trim();
    if (!name || !content || !category) {
      setFormError("Preencha nome, conteudo e categoria.");
      return;
    }
    const normalizedName = normalizeTemplateName(name);
    const conflictingTemplate = templates.find(
      (item) => normalizeTemplateName(item.name) === normalizedName
    );
    const canReuseFailedTemplate = conflictingTemplate
      ? isRetryableLocalTemplateFailure(conflictingTemplate)
      : false;
    const hasPendingRequest = requests.some(
      (item) =>
        normalizeTemplateName(item.name) === normalizedName &&
        isTemplateRequestPendingLike(item.status)
    );
    if (hasPendingRequest && !canReuseFailedTemplate) {
      setFormError("Ja existe um template com esse nome em analise.");
      return;
    }
    if (conflictingTemplate && !canReuseFailedTemplate) {
      setFormError("Ja existe um template com esse nome.");
      return;
    }

    let variables: unknown;
    try {
      variables = parseVariablesInput(form.variables);
    } catch (parseError) {
      setFormError((parseError as Error).message);
      return;
    }

    setSubmitting(true);
    try {
      const response = await createAppTemplateRequest(session, {
        name,
        content,
        category,
        autoSubmit: form.autoSubmit,
        ...(variables !== undefined ? { variables } : {}),
      });
      await loadData(session);
      setForm(EMPTY_FORM);
      setSuccess(getSubmissionMessage(response.submission));
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      const payload = (typed.payload ?? null) as
        | {
            request?: AppTemplateRequestItem;
            submission?: { templateId?: string | null };
          }
        | null;
      let recoveredAfterReload = false;
      let reloadResult:
        | {
            templates: AppTemplateItem[];
            requests: AppTemplateRequestItem[];
          }
        | undefined;
      if (payload?.request || payload?.submission?.templateId || isNetworkTimeoutLikeError(typed)) {
        reloadResult = await loadData(session);
        if (isNetworkTimeoutLikeError(typed)) {
          const reloadedName = normalizeTemplateName(name);
          recoveredAfterReload =
            (reloadResult?.templates ?? []).some(
              (item) => normalizeTemplateName(item.name) === reloadedName
            ) ||
            (reloadResult?.requests ?? []).some(
              (item) => normalizeTemplateName(item.name) === reloadedName
            );
        }
      }
      if (recoveredAfterReload) {
        setForm(EMPTY_FORM);
        setSuccess("Template enviado para a Meta e em analise.");
        return;
      }
      if (isNetworkTimeoutLikeError(typed)) {
        setFormError(
          "O envio pode ter sido concluido. Atualizando a lista para verificar o status..."
        );
        return;
      }
      if (typed.errorCode === "template_already_pending") {
        setFormError("Ja existe um template com esse nome em analise.");
        return;
      }
      if (typed.errorCode === "template_name_exists") {
        setFormError("Ja existe um template com esse nome.");
        return;
      }
      setFormError(
        typed.message ||
          typed.details ||
          "Nao foi possivel processar o template. Tente novamente."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSyncTemplate = useCallback(
    async (templateId: string) => {
      if (!session) return;
      setError(null);
      setFormError(null);
      setSuccess(null);
      setSyncingTemplateId(templateId);
      try {
        const response = await syncAppTemplate(session, templateId);
        const previousTemplate = templates.find((item) => item.id === response.template.id) ?? null;
        const categoryChanged = Boolean(
          previousTemplate &&
            (previousTemplate.category !== response.template.category ||
              previousTemplate.wasRecategorized !== response.template.wasRecategorized)
        );
        setTemplates((current) =>
          sortTemplates(
            current.map((item) =>
              item.id === response.template.id
                ? {
                    ...item,
                    category: response.template.category,
                    submittedCategory: response.template.submittedCategory,
                    wasRecategorized: response.template.wasRecategorized,
                    status: response.template.status,
                    rejectionReason: response.template.rejectionReason,
                    updatedAt: response.template.updatedAt,
                  }
                : item
            )
          )
        );
        setHighlightedTemplateId(response.template.id);
        setSuccess(
          categoryChanged
            ? "Status atualizado. A Meta recategorizou este template."
            : response.template.status.toLowerCase() === "approved"
              ? "Template reconciliado com a Meta."
            : "Status atualizado com sucesso."
        );
        window.setTimeout(() => setHighlightedTemplateId((current) => (current === response.template.id ? null : current)), 2500);
      } catch (err) {
        const typed = err as AppApiError;
        if (typed.status === 401) {
          handleUnauthorized();
          return;
        }
        setError(typed.message || typed.details || "Erro ao atualizar status do template.");
      } finally {
        setSyncingTemplateId(null);
      }
    },
    [handleUnauthorized, session, templates]
  );

  if (!session) return null;

  return (
    <AppShell
      session={session}
      title="Templates"
      subtitle="Consulte os modelos aprovados e envie novos templates para analise."
    >
      {loading ? <p className="text-sm text-white/70">Carregando...</p> : null}
      {error ? (
        <p className="rounded-xl border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100">
          {error}
        </p>
      ) : null}

      <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <section className="min-w-0 rounded-xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 px-3 py-3 sm:px-4">
            <h2 className="text-sm font-semibold">Catalogo de templates</h2>
          </div>
          {catalogItems.length === 0 ? (
            <p className="p-4 text-sm text-white/70">Nenhum template encontrado.</p>
          ) : (
            <div className="max-h-[34rem] overflow-x-auto xl:overflow-y-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-white/10 text-left">
                  <tr>
                    <th className="px-3 py-2">Nome</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Categoria</th>
                    <th className="px-3 py-2">Atualizado</th>
                    <th className="px-3 py-2">Motivo</th>
                    <th className="px-3 py-2">Acao</th>
                  </tr>
                </thead>
                <tbody>
                  {catalogItems.map((item) => {
                    const recategorizationInfo = getTemplateRecategorizationLabel(item);
                    return (
                    <tr
                      key={item.id}
                      className={`border-t border-white/10 ${highlightedTemplateId === item.templateId ? "bg-emerald-500/10" : ""}`}
                    >
                      <td className="px-3 py-2">{item.name}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getStatusClasses(item.status)}`}
                        >
                          {getStatusLabel(item.status)}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          <span>{item.category}</span>
                          {recategorizationInfo ? (
                            <>
                              <span className="inline-flex w-fit rounded-full border border-amber-300/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-100">
                                {recategorizationInfo.badge}
                              </span>
                              <span className="text-xs text-amber-200">
                                {recategorizationInfo.detail}
                              </span>
                            </>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2">{formatDateTime(item.updatedAt)}</td>
                      <td className="px-3 py-2">{getTemplateReason(item)}</td>
                      <td className="px-3 py-2">
                        {item.syncable && item.templateId ? (
                          <button
                            type="button"
                            onClick={() => handleSyncTemplate(item.templateId as string)}
                            disabled={syncingTemplateId === item.templateId}
                            className="rounded-lg border border-white/15 px-3 py-1 text-xs font-semibold text-white/90 transition hover:border-re7-sky/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {syncingTemplateId === item.templateId
                                ? "Atualizando..."
                                : item.status.toLowerCase() === "approved"
                                  ? "Revalidar"
                                  : "Atualizar status"}
                          </button>
                        ) : (
                          <span className="text-xs text-white/50">Aguardando revisao</span>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="min-w-0 rounded-xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 px-3 py-3 sm:px-4">
            <h2 className="text-sm font-semibold">Solicitar template</h2>
          </div>
          <form onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-4 p-3 sm:p-4">
            <label className="flex flex-col gap-2 text-sm text-white/80">
              <span>Nome</span>
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                className="w-full min-w-0 rounded-lg border border-white/15 bg-re7-navy px-3 py-2 text-white outline-none ring-0 transition focus:border-re7-sky/50"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-white/80">
              <span>Categoria</span>
              <select
                value={form.category}
                onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                className="w-full min-w-0 rounded-lg border border-white/15 bg-re7-navy px-3 py-2 text-white outline-none ring-0 transition focus:border-re7-sky/50"
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm text-white/80">
              <span>Conteudo</span>
              <textarea
                value={form.content}
                onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
                rows={6}
                className="w-full min-w-0 rounded-lg border border-white/15 bg-re7-navy px-3 py-2 text-white outline-none ring-0 transition focus:border-re7-sky/50"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-white/80">
              <span>Variaveis (JSON opcional)</span>
              <textarea
                value={form.variables}
                onChange={(event) => setForm((current) => ({ ...current, variables: event.target.value }))}
                rows={4}
                placeholder='{"items":["nome","cidade"]}'
                className="w-full min-w-0 rounded-lg border border-white/15 bg-re7-navy px-3 py-2 text-white outline-none ring-0 transition focus:border-re7-sky/50"
              />
            </label>
            <label className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm text-white/80">
              <input
                type="checkbox"
                checked={form.autoSubmit}
                onChange={(event) =>
                  setForm((current) => ({ ...current, autoSubmit: event.target.checked }))
                }
                className="mt-1 h-4 w-4 rounded border-white/20 bg-re7-navy text-re7-orange"
              />
              <span>Enviar automaticamente para aprovacao na Meta</span>
            </label>

            {formError ? (
              <p className="rounded-lg border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100">
                {formError}
              </p>
            ) : null}

            {success ? (
              <p className="rounded-lg border border-emerald-400/30 bg-emerald-900/20 p-3 text-sm text-emerald-100">
                {success}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-re7-orange px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Enviando..." : "Solicitar template"}
            </button>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
