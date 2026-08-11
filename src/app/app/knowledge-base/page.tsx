"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { FeedbackToast, usePausableFeedbackAutoDismiss } from "@/components/ui/FeedbackToast";
import {
  AppApiError,
  AppKnowledgeBaseArticle,
  AppKnowledgeBaseArticlePayload,
  AppKnowledgeBaseCollection,
  AppKnowledgeBaseStatus,
  AppSession,
  clearAppSession,
  createAppKnowledgeBaseArticle,
  createAppKnowledgeBaseCollection,
  fetchAppKnowledgeBase,
  loadAppSession,
  saveAppSession,
  transitionAppKnowledgeBaseArticle,
  updateAppKnowledgeBaseArticle,
} from "@/lib/appClientApi";
import { getAppErrorUxMessage } from "@/lib/appUxLabels";

type ArticleForm = {
  id: string | null;
  collectionId: string;
  key: string;
  title: string;
  summary: string;
  question: string;
  body: string;
  tags: string;
  intentKeys: string;
  sourceType: string;
  sourceNote: string;
  sourceUrl: string;
  visibility: string;
};

const EMPTY_FORM: ArticleForm = {
  id: null,
  collectionId: "",
  key: "",
  title: "",
  summary: "",
  question: "",
  body: "",
  tags: "",
  intentKeys: "",
  sourceType: "manual",
  sourceNote: "",
  sourceUrl: "",
  visibility: "internal",
};

function canManageKnowledgeBase(role: string) {
  const normalized = role.trim().toUpperCase();
  return normalized === "SUPERVISOR" || normalized === "ADMIN";
}

function splitList(input: string) {
  return input
    .split(/[,\n]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function statusLabel(status: AppKnowledgeBaseStatus) {
  if (status === "published") return "Publicado";
  if (status === "archived") return "Arquivado";
  return "Rascunho";
}

function toForm(article: AppKnowledgeBaseArticle): ArticleForm {
  return {
    id: article.id,
    collectionId: article.collectionId ?? "",
    key: article.key,
    title: article.title,
    summary: article.summary ?? "",
    question: article.question ?? "",
    body: article.body,
    tags: article.tags.join(", "),
    intentKeys: article.intentKeys.join(", "),
    sourceType: article.sourceType,
    sourceNote: article.sourceNote ?? "",
    sourceUrl: article.sourceUrl ?? "",
    visibility: article.visibility,
  };
}

function toPayload(form: ArticleForm): AppKnowledgeBaseArticlePayload {
  return {
    collectionId: form.collectionId || null,
    key: form.key || null,
    title: form.title,
    summary: form.summary || null,
    question: form.question || null,
    body: form.body,
    tags: splitList(form.tags),
    intentKeys: splitList(form.intentKeys),
    sourceType: form.sourceType,
    sourceNote: form.sourceNote || null,
    sourceUrl: form.sourceUrl || null,
    visibility: form.visibility,
  };
}

function normalizeAppErrorMessage(error: AppApiError, fallback: string) {
  if (error.status === 401) return "Sessão expirada. Faça login novamente.";
  if (error.status === 403) return "Seu perfil não tem permissão para gerenciar a base de conhecimento.";
  if (error.errorCode === "feature_not_enabled") return "A base de conhecimento não está habilitada para esta organização.";
  if (error.errorCode === "knowledge_article_key_conflict") return "Já existe um artigo com esta chave.";
  if (error.errorCode === "knowledge_collection_key_conflict") return "Já existe uma coleção com esta chave.";
  return getAppErrorUxMessage({ status: error.status, errorCode: error.errorCode, message: error.message, fallback });
}

export default function KnowledgeBasePage() {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [collections, setCollections] = useState<AppKnowledgeBaseCollection[]>([]);
  const [articles, setArticles] = useState<AppKnowledgeBaseArticle[]>([]);
  const [form, setForm] = useState<ArticleForm>(EMPTY_FORM);
  const [collectionForm, setCollectionForm] = useState({ name: "", key: "", description: "" });
  const [statusFilter, setStatusFilter] = useState<AppKnowledgeBaseStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const toastHandlers = usePausableFeedbackAutoDismiss(Boolean(error || success), () => {
    setError(null);
    setSuccess(null);
  });

  const handleUnauthorized = useCallback(() => {
    clearAppSession();
    router.replace("/app/login");
  }, [router]);

  const loadKnowledgeBase = useCallback(
    async (activeSession: AppSession, nextStatus = statusFilter, nextSearch = search) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetchAppKnowledgeBase(activeSession, {
          status: nextStatus,
          search: nextSearch,
        });
        setCollections(response.collections);
        setArticles(response.articles);
      } catch (err) {
        const typed = err as AppApiError;
        if (typed.status === 401) {
          handleUnauthorized();
          return;
        }
        setError(normalizeAppErrorMessage(typed, "Não foi possível carregar a base de conhecimento."));
      } finally {
        setLoading(false);
      }
    },
    [handleUnauthorized, search, statusFilter]
  );

  useEffect(() => {
    const stored = loadAppSession();
    if (!stored) {
      router.replace("/app/login");
      return;
    }
    if (!canManageKnowledgeBase(stored.user.role)) {
      router.replace("/app/inbox");
      return;
    }
    saveAppSession(stored);
    setSession(stored);
    void loadKnowledgeBase(stored);
  }, [loadKnowledgeBase, router]);

  const selectedArticle = useMemo(
    () => articles.find((article) => article.id === form.id) ?? null,
    [articles, form.id]
  );

  const publishedCount = useMemo(
    () => articles.filter((article) => article.status === "published").length,
    [articles]
  );

  const handleSearch = () => {
    if (!session) return;
    void loadKnowledgeBase(session, statusFilter, search);
  };

  const handleSaveCollection = async () => {
    if (!session || !collectionForm.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createAppKnowledgeBaseCollection(session, {
        name: collectionForm.name,
        key: collectionForm.key || null,
        description: collectionForm.description || null,
      });
      setCollectionForm({ name: "", key: "", description: "" });
      setSuccess("Colecao criada.");
      await loadKnowledgeBase(session);
    } catch (err) {
      setError(normalizeAppErrorMessage(err as AppApiError, "Não foi possível criar a coleção."));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveArticle = async () => {
    if (!session) return;
    setSaving(true);
    setError(null);
    try {
      const payload = toPayload(form);
      const response = form.id
        ? await updateAppKnowledgeBaseArticle(session, form.id, payload)
        : await createAppKnowledgeBaseArticle(session, payload);
      setForm(toForm(response.article));
      setSuccess(form.id ? "Artigo atualizado." : "Artigo criado.");
      await loadKnowledgeBase(session);
    } catch (err) {
      setError(normalizeAppErrorMessage(err as AppApiError, "Não foi possível salvar o artigo."));
    } finally {
      setSaving(false);
    }
  };

  const handleTransition = async (action: "publish" | "unpublish" | "archive") => {
    if (!session || !form.id) return;
    setSaving(true);
    setError(null);
    try {
      const response = await transitionAppKnowledgeBaseArticle(session, form.id, action);
      setForm(toForm(response.article));
      setSuccess(action === "publish" ? "Artigo publicado." : action === "archive" ? "Artigo arquivado." : "Artigo voltou para rascunho.");
      await loadKnowledgeBase(session);
    } catch (err) {
      setError(normalizeAppErrorMessage(err as AppApiError, "Não foi possível alterar a situação."));
    } finally {
      setSaving(false);
    }
  };

  if (!session) {
    return <main className="min-h-screen bg-slate-950" />;
  }

  return (
    <AppShell
      session={session}
      title="Base de conhecimento"
      subtitle="Artigos internos para organizar respostas, fontes e orientações por organização."
    >
      <div className="space-y-4">
        <FeedbackToast message={success} variant="success" {...toastHandlers} />
        <FeedbackToast message={error} variant="error" {...toastHandlers} />

        <section className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border theme-surface p-4">
            <p className="text-xs uppercase tracking-wide theme-muted">Artigos</p>
            <p className="mt-2 text-3xl font-semibold theme-text">{articles.length}</p>
          </div>
          <div className="rounded-lg border theme-surface p-4">
            <p className="text-xs uppercase tracking-wide theme-muted">Publicados</p>
            <p className="mt-2 text-3xl font-semibold theme-text">{publishedCount}</p>
          </div>
          <div className="rounded-lg border theme-surface p-4">
            <p className="text-xs uppercase tracking-wide theme-muted">Colecoes</p>
            <p className="mt-2 text-3xl font-semibold theme-text">{collections.length}</p>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(320px,420px)_1fr]">
          <div className="space-y-4">
            <div className="rounded-lg border theme-surface p-4">
              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  className="h-10 rounded-md border theme-select px-3 text-sm"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as AppKnowledgeBaseStatus | "all")}
                >
                  <option value="all">Todos</option>
                  <option value="draft">Rascunhos</option>
                  <option value="published">Publicados</option>
                  <option value="archived">Arquivados</option>
                </select>
                <input
                  className="h-10 min-w-0 flex-1 rounded-md border theme-select px-3 text-sm"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleSearch();
                  }}
                  placeholder="Buscar artigo"
                />
                <button className="h-10 rounded-md border px-4 text-sm theme-nav-link" onClick={handleSearch}>
                  Buscar
                </button>
              </div>
            </div>

            <div className="rounded-lg border theme-surface">
              <div className="flex items-center justify-between border-b theme-border px-4 py-3">
                <h2 className="text-sm font-semibold theme-text">Artigos</h2>
                <button
                  className="rounded-md border px-3 py-1.5 text-xs theme-nav-link"
                  onClick={() => setForm(EMPTY_FORM)}
                >
                  Novo
                </button>
              </div>
              <div className="max-h-[620px] overflow-y-auto">
                {loading ? (
                  <p className="p-4 text-sm theme-muted">Carregando...</p>
                ) : articles.length === 0 ? (
                  <p className="p-4 text-sm theme-muted">Nenhum artigo encontrado.</p>
                ) : (
                  articles.map((article) => (
                    <button
                      key={article.id}
                      className={`block w-full border-b theme-border px-4 py-3 text-left transition ${
                        form.id === article.id ? "theme-nav-link-active" : "hover:bg-black/5 dark:hover:bg-white/5"
                      }`}
                      onClick={() => setForm(toForm(article))}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-semibold theme-text">{article.title}</p>
                        <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] theme-muted">
                          {statusLabel(article.status)}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs theme-muted">{article.summary || article.question || article.key}</p>
                      {article.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {article.tags.slice(0, 4).map((tag) => (
                            <span key={tag} className="rounded-full border px-2 py-0.5 text-[11px] theme-muted">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border theme-surface p-4">
              <div className="grid gap-3 md:grid-cols-[1fr_160px]">
                <label className="space-y-1">
                  <span className="text-xs font-semibold theme-muted">Titulo</span>
                  <input
                    className="h-10 w-full rounded-md border theme-select px-3 text-sm"
                    value={form.title}
                    onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold theme-muted">Status</span>
                  <input
                    className="h-10 w-full rounded-md border theme-select px-3 text-sm"
                    value={selectedArticle ? statusLabel(selectedArticle.status) : "Novo"}
                    disabled
                  />
                </label>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <label className="space-y-1">
                  <span className="text-xs font-semibold theme-muted">Chave</span>
                  <input
                    className="h-10 w-full rounded-md border theme-select px-3 text-sm"
                    value={form.key}
                    onChange={(event) => setForm((current) => ({ ...current, key: event.target.value }))}
                    placeholder="gerada pelo titulo"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold theme-muted">Colecao</span>
                  <select
                    className="h-10 w-full rounded-md border theme-select px-3 text-sm"
                    value={form.collectionId}
                    onChange={(event) => setForm((current) => ({ ...current, collectionId: event.target.value }))}
                  >
                    <option value="">Sem colecao</option>
                    {collections.map((collection) => (
                      <option key={collection.id} value={collection.id}>
                        {collection.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold theme-muted">Visibilidade</span>
                  <select
                    className="h-10 w-full rounded-md border theme-select px-3 text-sm"
                    value={form.visibility}
                    onChange={(event) => setForm((current) => ({ ...current, visibility: event.target.value }))}
                  >
                    <option value="internal">Interna</option>
                    <option value="operator">Operador</option>
                    <option value="public">Publica</option>
                  </select>
                </label>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs font-semibold theme-muted">Pergunta gatilho</span>
                  <input
                    className="h-10 w-full rounded-md border theme-select px-3 text-sm"
                    value={form.question}
                    onChange={(event) => setForm((current) => ({ ...current, question: event.target.value }))}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold theme-muted">Resumo</span>
                  <input
                    className="h-10 w-full rounded-md border theme-select px-3 text-sm"
                    value={form.summary}
                    onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))}
                  />
                </label>
              </div>

              <label className="mt-3 block space-y-1">
                <span className="text-xs font-semibold theme-muted">Conteudo markdown simples</span>
                <textarea
                  className="min-h-[260px] w-full rounded-md border theme-select p-3 text-sm leading-6"
                  value={form.body}
                  onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
                  placeholder="Escreva a resposta aprovada, procedimento ou informacao reutilizavel."
                />
              </label>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs font-semibold theme-muted">Tags</span>
                  <input
                    className="h-10 w-full rounded-md border theme-select px-3 text-sm"
                    value={form.tags}
                    onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))}
                    placeholder="catalogo, endereco, prazo"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold theme-muted">Intencoes relacionadas</span>
                  <input
                    className="h-10 w-full rounded-md border theme-select px-3 text-sm"
                    value={form.intentKeys}
                    onChange={(event) => setForm((current) => ({ ...current, intentKeys: event.target.value }))}
                    placeholder="endereco, catalogo"
                  />
                </label>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <label className="space-y-1">
                  <span className="text-xs font-semibold theme-muted">Fonte</span>
                  <select
                    className="h-10 w-full rounded-md border theme-select px-3 text-sm"
                    value={form.sourceType}
                    onChange={(event) => setForm((current) => ({ ...current, sourceType: event.target.value }))}
                  >
                    <option value="manual">Manual</option>
                    <option value="document">Documento</option>
                    <option value="faq">FAQ</option>
                    <option value="flow">Fluxo</option>
                    <option value="intent">Intent</option>
                    <option value="crm">CRM</option>
                  </select>
                </label>
                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-semibold theme-muted">Referencia</span>
                  <input
                    className="h-10 w-full rounded-md border theme-select px-3 text-sm"
                    value={form.sourceNote}
                    onChange={(event) => setForm((current) => ({ ...current, sourceNote: event.target.value }))}
                  />
                </label>
              </div>

              <label className="mt-3 block space-y-1">
                <span className="text-xs font-semibold theme-muted">URL de origem</span>
                <input
                  className="h-10 w-full rounded-md border theme-select px-3 text-sm"
                  value={form.sourceUrl}
                  onChange={(event) => setForm((current) => ({ ...current, sourceUrl: event.target.value }))}
                />
              </label>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:opacity-50"
                  disabled={saving || !form.title.trim() || !form.body.trim()}
                  onClick={handleSaveArticle}
                >
                  {form.id ? "Salvar artigo" : "Criar artigo"}
                </button>
                {form.id && selectedArticle?.status !== "published" && (
                  <button
                    className="rounded-md border px-4 py-2 text-sm theme-nav-link disabled:opacity-50"
                    disabled={saving}
                    onClick={() => void handleTransition("publish")}
                  >
                    Publicar
                  </button>
                )}
                {form.id && selectedArticle?.status === "published" && (
                  <button
                    className="rounded-md border px-4 py-2 text-sm theme-nav-link disabled:opacity-50"
                    disabled={saving}
                    onClick={() => void handleTransition("unpublish")}
                  >
                    Despublicar
                  </button>
                )}
                {form.id && selectedArticle?.status !== "archived" && (
                  <button
                    className="rounded-md border px-4 py-2 text-sm theme-nav-link disabled:opacity-50"
                    disabled={saving}
                    onClick={() => void handleTransition("archive")}
                  >
                    Arquivar
                  </button>
                )}
              </div>
            </div>

            <div className="rounded-lg border theme-surface p-4">
              <h2 className="text-sm font-semibold theme-text">Nova colecao</h2>
              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_180px]">
                <input
                  className="h-10 rounded-md border theme-select px-3 text-sm"
                  value={collectionForm.name}
                  onChange={(event) => setCollectionForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Nome da colecao"
                />
                <input
                  className="h-10 rounded-md border theme-select px-3 text-sm"
                  value={collectionForm.key}
                  onChange={(event) => setCollectionForm((current) => ({ ...current, key: event.target.value }))}
                  placeholder="chave opcional"
                />
              </div>
              <input
                className="mt-3 h-10 w-full rounded-md border theme-select px-3 text-sm"
                value={collectionForm.description}
                onChange={(event) => setCollectionForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Descricao opcional"
              />
              <button
                className="mt-3 rounded-md border px-4 py-2 text-sm theme-nav-link disabled:opacity-50"
                disabled={saving || !collectionForm.name.trim()}
                onClick={() => void handleSaveCollection()}
              >
                Criar colecao
              </button>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
