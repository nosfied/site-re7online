"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
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

function sortTemplates(items: AppTemplateItem[]) {
  return [...items].sort((left, right) => {
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
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
      setTemplates(sortTemplates(templatesResponse.items));
      setRequests(requestsResponse.items);
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
    if (templates.some((item) => normalizeTemplateName(item.name) === normalizeTemplateName(name))) {
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
      if (payload?.request || payload?.submission?.templateId) {
        await loadData(session);
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
        setTemplates((current) =>
          sortTemplates(
            current.map((item) =>
              item.id === response.template.id
                ? {
                    ...item,
                    status: response.template.status,
                    rejectionReason: response.template.rejectionReason,
                    updatedAt: response.template.updatedAt,
                  }
                : item
            )
          )
        );
        setHighlightedTemplateId(response.template.id);
        setSuccess("Status atualizado com sucesso.");
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
    [handleUnauthorized, session]
  );

  if (!session) return null;

  return (
    <AppShell
      session={session}
      title="Templates"
      subtitle="Catalogo aprovado e solicitacoes de novos templates do cliente."
    >
      {loading ? <p className="text-sm text-white/70">Carregando...</p> : null}
      {error ? (
        <p className="rounded-xl border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr_0.9fr]">
        <section className="rounded-xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold">Catalogo de templates</h2>
          </div>
          {templates.length === 0 ? (
            <p className="p-4 text-sm text-white/70">Nenhum template encontrado.</p>
          ) : (
            <div className="max-h-[34rem] overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/10 text-left">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2">Atualizado</th>
                    <th className="px-3 py-2">Motivo</th>
                    <th className="px-3 py-2">Acao</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((item) => (
                    <tr
                      key={item.id}
                      className={`border-t border-white/10 ${highlightedTemplateId === item.id ? "bg-emerald-500/10" : ""}`}
                    >
                      <td className="px-3 py-2">{item.name}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getStatusClasses(item.status)}`}
                        >
                          {getStatusLabel(item.status)}
                        </span>
                      </td>
                      <td className="px-3 py-2">{item.category}</td>
                      <td className="px-3 py-2">{formatDateTime(item.updatedAt)}</td>
                      <td className="px-3 py-2">{getTemplateReason(item)}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => handleSyncTemplate(item.id)}
                          disabled={
                            syncingTemplateId === item.id || item.status.toLowerCase() === "approved"
                          }
                          className="rounded-lg border border-white/15 px-3 py-1 text-xs font-semibold text-white/90 transition hover:border-re7-sky/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {item.status.toLowerCase() === "approved"
                            ? "Aprovado"
                            : syncingTemplateId === item.id
                              ? "Atualizando..."
                              : "Atualizar status"}
                        </button>
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
            <h2 className="text-sm font-semibold">Solicitacoes</h2>
          </div>
          {requests.length === 0 ? (
            <p className="p-4 text-sm text-white/70">Nenhuma solicitacao cadastrada.</p>
          ) : (
            <div className="max-h-[34rem] overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/10 text-left">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Notes</th>
                    <th className="px-3 py-2">Criado em</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((item) => (
                    <tr key={item.id} className="border-t border-white/10">
                      <td className="px-3 py-2">{item.name}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getStatusClasses(item.status)}`}
                        >
                          {getStatusLabel(item.status)}
                        </span>
                      </td>
                      <td className="px-3 py-2">{item.notes || "-"}</td>
                      <td className="px-3 py-2">{formatDateTime(item.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold">Solicitar template</h2>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
            <label className="flex flex-col gap-2 text-sm text-white/80">
              <span>Name</span>
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                className="rounded-lg border border-white/15 bg-re7-navy px-3 py-2 text-white outline-none ring-0 transition focus:border-re7-sky/50"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-white/80">
              <span>Category</span>
              <select
                value={form.category}
                onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                className="rounded-lg border border-white/15 bg-re7-navy px-3 py-2 text-white outline-none ring-0 transition focus:border-re7-sky/50"
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm text-white/80">
              <span>Content</span>
              <textarea
                value={form.content}
                onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
                rows={6}
                className="rounded-lg border border-white/15 bg-re7-navy px-3 py-2 text-white outline-none ring-0 transition focus:border-re7-sky/50"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-white/80">
              <span>Variables (JSON opcional)</span>
              <textarea
                value={form.variables}
                onChange={(event) => setForm((current) => ({ ...current, variables: event.target.value }))}
                rows={4}
                placeholder='{"items":["nome","cidade"]}'
                className="rounded-lg border border-white/15 bg-re7-navy px-3 py-2 text-white outline-none ring-0 transition focus:border-re7-sky/50"
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
              <span>Enviar automaticamente para aprovacao (Meta)</span>
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
