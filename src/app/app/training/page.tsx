"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { FeedbackToast } from "@/components/ui/FeedbackToast";
import {
  clearAppSession,
  fetchAppTrainingCatalog,
  fetchAppTrainingContent,
  loadAppSession,
  saveAppSession,
} from "@/lib/appClientApi";
import type {
  AppApiError,
  AppSession,
  AppTrainingCatalogItem,
  AppTrainingCatalogResponse,
} from "@/lib/appClientApi";

type ViewerState = {
  item: AppTrainingCatalogItem;
  objectUrl: string;
  contentType: string | null;
  fileName: string | null;
};

function getTrainingErrorMessage(error: AppApiError, fallback: string) {
  if (error.status === 401) return "Sessao expirada. Faca login novamente.";
  if (error.status === 403) return "Sem permissao para acessar treinamentos.";
  if (error.errorCode === "training_storage_unavailable") return "Os materiais de treinamento ainda nao estao disponiveis.";
  if (error.errorCode === "training_content_not_found") return "Material nao encontrado.";
  if (error.errorCode === "training_content_unavailable") return "Material indisponivel no momento.";
  return error.message || fallback;
}

function typeLabel(type: AppTrainingCatalogItem["type"]) {
  if (type === "video") return "Video";
  if (type === "pdf") return "PDF";
  return "Link";
}

function formatUpdatedAt(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date);
}

export default function TrainingPage() {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [catalog, setCatalog] = useState<AppTrainingCatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const [toast, setToast] = useState<{ message: string; variant?: "success" | "error" | "warning" } | null>(null);

  const handleUnauthorized = useCallback(() => {
    clearAppSession();
    router.replace("/app/login");
  }, [router]);

  const loadCatalog = useCallback(async (activeSession: AppSession) => {
    const response = await fetchAppTrainingCatalog(activeSession);
    setCatalog(response);
  }, []);

  useEffect(() => {
    const stored = loadAppSession();
    if (!stored?.token) {
      router.replace("/app/login");
      return;
    }
    saveAppSession(stored);
    setSession(stored);
    loadCatalog(stored)
      .catch((error: AppApiError) => {
        if (error.status === 401) {
          handleUnauthorized();
          return;
        }
        setToast({
          variant: "error",
          message: getTrainingErrorMessage(error, "Nao foi possivel carregar os treinamentos."),
        });
      })
      .finally(() => setLoading(false));
  }, [handleUnauthorized, loadCatalog, router]);

  useEffect(() => {
    return () => {
      if (viewer?.objectUrl) URL.revokeObjectURL(viewer.objectUrl);
    };
  }, [viewer?.objectUrl]);

  const totalItems = useMemo(
    () => catalog?.sections.reduce((total, section) => total + section.items.length, 0) ?? 0,
    [catalog]
  );

  const openContent = async (item: AppTrainingCatalogItem, download = false) => {
    if (!session || !item.contentId || openingId) return;
    setOpeningId(item.id);
    try {
      const response = await fetchAppTrainingContent(session, item.contentId, { download });
      if (download) {
        const objectUrl = URL.createObjectURL(response.blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = response.fileName || `${item.id}.${item.type === "pdf" ? "pdf" : "mp4"}`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(objectUrl);
        return;
      }
      const objectUrl = URL.createObjectURL(response.blob);
      setViewer((current) => {
        if (current?.objectUrl) URL.revokeObjectURL(current.objectUrl);
        return {
          item,
          objectUrl,
          contentType: response.contentType,
          fileName: response.fileName,
        };
      });
    } catch (error) {
      const typed = error as AppApiError;
      if (typed.status === 401) handleUnauthorized();
      else setToast({ variant: "error", message: getTrainingErrorMessage(typed, "Nao foi possivel abrir o material.") });
    } finally {
      setOpeningId(null);
    }
  };

  const closeViewer = () => {
    setViewer((current) => {
      if (current?.objectUrl) URL.revokeObjectURL(current.objectUrl);
      return null;
    });
  };

  if (!session) {
    return (
      <main className="theme-bg flex min-h-screen items-center justify-center p-6 text-white">
        Carregando...
      </main>
    );
  }

  return (
    <AppShell
      session={session}
      title="Treinamentos"
      subtitle="Materiais de apoio para operar o Converta com seguranca."
    >
      <FeedbackToast
        message={toast?.message ?? null}
        variant={toast?.variant}
        onClose={() => setToast(null)}
      />

      <div className="grid gap-4">
        <section className="theme-surface-strong rounded-lg border p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="theme-soft text-xs font-semibold uppercase leading-none tracking-[0.16em]">
                Centro de aprendizagem
              </p>
              <h2 className="mt-2 text-xl font-bold">Conteudos disponiveis</h2>
              <p className="theme-muted mt-1 max-w-3xl text-sm leading-6">
                Videos, guias e materiais oficiais publicados pela equipe da plataforma.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!session) return;
                setLoading(true);
                void loadCatalog(session)
                  .catch((error: AppApiError) =>
                    setToast({
                      variant: "error",
                      message: getTrainingErrorMessage(error, "Nao foi possivel atualizar os treinamentos."),
                    })
                  )
                  .finally(() => setLoading(false));
              }}
              disabled={loading}
              className="theme-nav-link shrink-0 rounded-md border px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Atualizando..." : "Atualizar"}
            </button>
          </div>

          {!catalog?.storageConfigured ? (
            <div className="mt-4 rounded-lg border border-amber-300/35 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
              Os materiais de treinamento estao sendo preparados para este ambiente.
            </div>
          ) : null}
        </section>

        {loading ? (
          <section className="theme-surface rounded-lg border p-6 text-sm">Carregando treinamentos...</section>
        ) : totalItems === 0 ? (
          <section className="theme-surface rounded-lg border p-6 text-sm">
            Nenhum treinamento disponivel no momento.
          </section>
        ) : (
          catalog?.sections.map((section) => (
            <section key={section.id} className="grid gap-3">
              <div>
                <h2 className="text-lg font-bold">{section.title}</h2>
                {section.description ? <p className="theme-muted mt-1 text-sm">{section.description}</p> : null}
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {section.items.map((item) => {
                  const updatedAt = formatUpdatedAt(item.updatedAt);
                  const disabled = item.type !== "link" && !item.available;
                  return (
                    <article key={item.id} className="theme-surface-strong flex min-h-56 flex-col rounded-lg border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <span className="rounded-full border border-re7-sky/30 bg-re7-sky/15 px-2.5 py-1 text-xs font-semibold text-re7-sky">
                          {typeLabel(item.type)}
                        </span>
                        {item.durationLabel ? <span className="theme-soft text-xs">{item.durationLabel}</span> : null}
                      </div>
                      <h3 className="mt-3 text-base font-bold leading-6">{item.title}</h3>
                      {item.description ? (
                        <p className="theme-muted mt-2 flex-1 text-sm leading-6">{item.description}</p>
                      ) : (
                        <div className="flex-1" />
                      )}
                      {item.tags?.length ? (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {item.tags.map((tag) => (
                            <span key={tag} className="theme-chip rounded-full border px-2 py-0.5 text-[11px]">
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {updatedAt ? <p className="theme-soft mt-3 text-xs">Atualizado em {updatedAt}</p> : null}
                      <div className="mt-4 flex flex-wrap gap-2">
                        {item.type === "link" && item.url ? (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-md bg-re7-orange px-3 py-2 text-sm font-semibold text-white hover:brightness-110"
                          >
                            Abrir
                          </a>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={disabled || openingId === item.id}
                              onClick={() => void openContent(item)}
                              className="rounded-md bg-re7-orange px-3 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {openingId === item.id ? "Abrindo..." : item.type === "video" ? "Assistir" : "Abrir material"}
                            </button>
                            {item.downloadable ? (
                              <button
                                type="button"
                                disabled={disabled || openingId === item.id}
                                onClick={() => void openContent(item, true)}
                                className="theme-nav-link rounded-md border px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Baixar
                              </button>
                            ) : null}
                          </>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>

      {viewer ? (
        <div
          className="theme-modal-backdrop fixed inset-0 z-[100] flex items-center justify-center px-4 py-6 backdrop-blur-sm"
          onClick={closeViewer}
        >
          <div
            className="theme-surface-strong grid max-h-[calc(100dvh-3rem)] w-full max-w-5xl overflow-hidden rounded-lg border shadow-[0_24px_90px_rgba(0,0,0,0.32)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-3">
              <div className="min-w-0">
                <p className="theme-soft text-xs font-semibold uppercase leading-none tracking-[0.16em]">
                  {typeLabel(viewer.item.type)}
                </p>
                <h2 className="mt-1 truncate text-lg font-bold">{viewer.item.title}</h2>
              </div>
              <button
                type="button"
                onClick={closeViewer}
                className="theme-nav-link shrink-0 rounded-md border px-3 py-1.5 text-sm font-semibold"
              >
                Fechar
              </button>
            </div>
            <div className="max-h-[calc(100dvh-9rem)] overflow-auto p-4">
              {viewer.item.type === "video" ? (
                <video
                  controls
                  preload="metadata"
                  src={viewer.objectUrl}
                  className="aspect-video w-full rounded-lg bg-black"
                />
              ) : (
                <iframe
                  title={viewer.item.title}
                  src={viewer.objectUrl}
                  className="h-[min(72dvh,820px)] w-full rounded-lg border border-white/10 bg-white"
                />
              )}
              {viewer.fileName ? <p className="theme-soft mt-3 text-xs">{viewer.fileName}</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
