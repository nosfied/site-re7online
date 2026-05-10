"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { FeedbackToast, usePausableFeedbackAutoDismiss } from "@/components/ui/FeedbackToast";
import {
  anonymizeAppConversationData,
  AppApiError,
  AppSession,
  clearAppSession,
  deleteAppConversationData,
  executeAppRetention,
  fetchAppRetentionConfig,
  loadAppSession,
  saveAppSession,
  updateAppRetentionConfig,
} from "@/lib/appClientApi";

function isAdminRole(role: string) {
  return role.trim().toUpperCase() === "ADMIN";
}

function normalizePrivacyError(error: AppApiError, fallback: string) {
  if (error.status === 403) return "Apenas administradores podem executar acoes LGPD.";
  if (error.errorCode === "conversation_not_found" || error.status === 404) {
    return "Conversa nao encontrada neste tenant.";
  }
  if (error.errorCode === "bad_request") return error.message || fallback;
  return error.message || fallback;
}

export default function AppPrivacySettingsPage() {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingRetention, setSavingRetention] = useState(false);
  const [executingRetention, setExecutingRetention] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [anonymizing, setAnonymizing] = useState(false);
  const [retentionDays, setRetentionDays] = useState("90");
  const [conversationId, setConversationId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [anonymizeModalOpen, setAnonymizeModalOpen] = useState(false);
  const [anonymizeConfirmation, setAnonymizeConfirmation] = useState("");
  const [retentionModalOpen, setRetentionModalOpen] = useState(false);
  const [retentionConfirmation, setRetentionConfirmation] = useState("");

  const handleUnauthorized = useCallback(() => {
    clearAppSession();
    router.replace("/app/login");
  }, [router]);

  const loadRetention = useCallback(async (activeSession: AppSession) => {
    const response = await fetchAppRetentionConfig(activeSession);
    setRetentionDays(String(response.retentionDays));
  }, []);

  useEffect(() => {
    const stored = loadAppSession();
    if (!stored?.token) {
      router.replace("/app/login");
      return;
    }
    if (!isAdminRole(stored.user.role)) {
      router.replace("/app/inbox");
      return;
    }
    setSession(stored);
    saveAppSession(stored);
  }, [router]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryConversationId = params.get("conversationId")?.trim();
    if (queryConversationId) {
      setConversationId(queryConversationId);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadRetention(session)
      .catch((err) => {
        if (cancelled) return;
        const typed = err as AppApiError;
        if (typed.status === 401) {
          handleUnauthorized();
          return;
        }
        if (typed.status === 403) {
          router.replace("/app/inbox");
          return;
        }
        setError(normalizePrivacyError(typed, "Falha ao carregar configuracoes de privacidade."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [handleUnauthorized, loadRetention, router, session]);

  const toastHandlers = usePausableFeedbackAutoDismiss(Boolean(error || success), () => {
      setError(null);
      setSuccess(null);
    }, 3500);

  const handleSaveRetention = async (event: FormEvent) => {
    event.preventDefault();
    if (!session) return;
    const days = Number(retentionDays);
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      setError("Informe dias de retencao entre 1 e 3650.");
      return;
    }
    setSavingRetention(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await updateAppRetentionConfig(session, days);
      setRetentionDays(String(response.retentionDays));
      setSuccess("Retencao atualizada com sucesso.");
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(normalizePrivacyError(typed, "Falha ao salvar retencao."));
    } finally {
      setSavingRetention(false);
    }
  };

  const handleExecuteRetention = async () => {
    if (!session) return;
    setExecutingRetention(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await executeAppRetention(session);
      setRetentionModalOpen(false);
      setRetentionConfirmation("");
      setSuccess(`Retencao executada. Conversas removidas da operacao: ${response.deletedConversations}.`);
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(normalizePrivacyError(typed, "Falha ao executar retencao."));
    } finally {
      setExecutingRetention(false);
    }
  };

  const openDeleteModal = () => {
    const target = conversationId.trim();
    if (!target) {
      setError("Informe o waId ou ID da conversa.");
      return;
    }
    setDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!session) return;
    const target = conversationId.trim();
    if (!target) {
      setError("Informe o waId ou ID da conversa.");
      return;
    }
    setDeleting(true);
    setError(null);
    setSuccess(null);
    try {
      await deleteAppConversationData(session, target);
      setConversationId("");
      setDeleteModalOpen(false);
      setSuccess("Conversa removida da operacao com sucesso.");
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(normalizePrivacyError(typed, "Falha ao excluir conversa."));
    } finally {
      setDeleting(false);
    }
  };

  const openAnonymizeModal = () => {
    const target = conversationId.trim();
    if (!target) {
      setError("Informe o waId ou ID da conversa.");
      return;
    }
    setAnonymizeConfirmation("");
    setAnonymizeModalOpen(true);
  };

  const handleAnonymize = async () => {
    if (!session) return;
    const target = conversationId.trim();
    if (!target) {
      setError("Informe o waId ou ID da conversa.");
      return;
    }
    setAnonymizing(true);
    setError(null);
    setSuccess(null);
    try {
      await anonymizeAppConversationData(session, target);
      setConversationId("");
      setAnonymizeModalOpen(false);
      setAnonymizeConfirmation("");
      setSuccess("Dados anonimizados. A conversa saiu da operacao e nao sera restaurada.");
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(normalizePrivacyError(typed, "Falha ao anonimizar conversa."));
    } finally {
      setAnonymizing(false);
    }
  };

  if (!session) {
    return <main className="min-h-screen bg-re7-navy" />;
  }

  return (
    <AppShell
      session={session}
      title="Privacidade"
      subtitle="Ferramentas minimas de LGPD para operacao do tenant."
    >
      <FeedbackToast message={error} variant="error" {...toastHandlers} />
      <FeedbackToast message={success} variant="success" {...toastHandlers} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="theme-surface rounded-xl border">
          <div className="theme-border border-b p-4">
            <h2 className="text-lg font-semibold">Dados de conversa</h2>
            <p className="theme-muted mt-1 text-sm">
              Informe o waId ou ID interno da conversa para remover da operacao ou anonimizar dados.
            </p>
          </div>
          <div className="space-y-4 p-4">
            <label className="theme-muted block text-sm font-medium" htmlFor="conversation-id">
              waId ou ID da conversa
            </label>
            <input
              id="conversation-id"
              value={conversationId}
              onChange={(event) => setConversationId(event.target.value)}
              placeholder="Ex: 5584999999999"
              className="theme-select w-full rounded-xl px-3 py-2 text-sm outline-none focus:border-re7-sky/40"
            />
            <div className="theme-surface-strong rounded-xl border p-3">
              <p className="theme-soft text-xs font-semibold uppercase tracking-[0.14em]">
                Acoes reversiveis
              </p>
              <p className="theme-muted mt-1 text-sm">
                Exclusao remove a conversa apenas da operacao.
              </p>
              <button
                type="button"
                onClick={openDeleteModal}
                disabled={loading || deleting || anonymizing}
                className="theme-nav-link mt-3 rounded-lg border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting ? "Excluindo..." : "Excluir da operacao"}
              </button>
            </div>
            <div className="theme-soft-danger-panel rounded-xl border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em]">
                  Acoes irreversiveis
                </p>
                <span className="theme-soft-danger-badge rounded-full border px-2 py-0.5 text-[11px] font-semibold">
                  Irreversivel
                </span>
              </div>
              <p className="mt-1 text-sm opacity-80">
                Anonimizacao remove permanentemente os dados pessoais.
              </p>
              <button
                type="button"
                onClick={openAnonymizeModal}
                disabled={loading || anonymizing || deleting}
                className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {anonymizing ? "Anonimizando..." : "Anonimizar dados"}
              </button>
            </div>
            <p className="theme-soft text-xs leading-relaxed">
              Anonimizacao remove permanentemente os dados pessoais. Exclusao remove a conversa
              apenas da operacao.
            </p>
            <p className="theme-soft text-xs leading-relaxed">
              Apos anonimizacao, a conversa sai da operacao e nao sera restaurada. Se o contato
              voltar, um novo atendimento sera iniciado.
            </p>
          </div>
        </section>

        <section className="theme-surface rounded-xl border">
          <div className="theme-border border-b p-4">
            <h2 className="text-lg font-semibold">Retencao</h2>
            <p className="theme-muted mt-1 text-sm">Padrao do tenant: 90 dias.</p>
          </div>
          <form className="space-y-4 p-4" onSubmit={handleSaveRetention}>
            <label className="theme-muted block text-sm font-medium" htmlFor="retention-days">
              Dias de retencao
            </label>
            <input
              id="retention-days"
              type="number"
              min={1}
              max={3650}
              value={retentionDays}
              onChange={(event) => setRetentionDays(event.target.value)}
              className="theme-select w-full rounded-xl px-3 py-2 text-sm outline-none focus:border-re7-sky/40"
            />
            <p className="theme-soft-warning-panel rounded-xl border px-3 py-2 text-xs leading-relaxed">
              Valores baixos (ex: 1-7 dias) podem remover conversas ativas da operacao.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={loading || savingRetention}
                className="rounded-lg bg-re7-sky px-4 py-2 text-sm font-semibold text-white transition hover:bg-re7-sky/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingRetention ? "Salvando..." : "Salvar retencao"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRetentionConfirmation("");
                  setRetentionModalOpen(true);
                }}
                disabled={loading || executingRetention}
                className="theme-nav-link rounded-lg border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                {executingRetention ? "Executando..." : "Executar agora"}
              </button>
            </div>
          </form>
        </section>
      </div>
      {deleteModalOpen ? (
        <div className="theme-modal-backdrop fixed inset-0 z-[80] flex items-center justify-center px-4 backdrop-blur-sm">
          <div className="theme-surface-strong w-full max-w-md rounded-2xl border p-5 shadow-[0_24px_90px_rgba(0,0,0,0.22)]">
            <h2 className="text-lg font-semibold">Excluir conversa da operacao</h2>
            <p className="theme-muted mt-3 text-sm leading-relaxed">
              Essa acao remove a conversa da operacao, mas mantem dados tecnicos para auditoria.
            </p>
            <p className="theme-surface mt-3 rounded-xl border px-3 py-2 text-sm">
              {conversationId.trim()}
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                disabled={deleting}
                className="theme-nav-link rounded-lg border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting ? "Excluindo..." : "Excluir conversa"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {retentionModalOpen ? (
        <div className="theme-modal-backdrop fixed inset-0 z-[80] flex items-center justify-center px-4 backdrop-blur-sm">
          <div className="theme-surface-strong w-full max-w-lg rounded-2xl border border-amber-600 p-5 shadow-[0_24px_90px_rgba(0,0,0,0.22)]">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">Executar retencao</h2>
              <span className="theme-soft-warning-badge rounded-full border px-2 py-0.5 text-[11px] font-semibold">
                Acao em massa
              </span>
            </div>
            <p className="theme-muted mt-3 text-sm leading-relaxed">
              Essa acao pode remover multiplas conversas da operacao.
            </p>
            <p className="theme-soft-warning-panel mt-2 rounded-xl border px-3 py-2 text-sm leading-relaxed">
              Valores baixos (ex: 1-7 dias) podem remover conversas ativas.
            </p>
            <label className="theme-muted mt-4 block text-sm font-medium" htmlFor="retention-confirmation">
              Digite EXECUTAR RETENÇÃO para confirmar
            </label>
            <input
              id="retention-confirmation"
              value={retentionConfirmation}
              onChange={(event) => setRetentionConfirmation(event.target.value)}
              autoFocus
              className="theme-select mt-2 w-full rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-300/50"
            />
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setRetentionModalOpen(false)}
                disabled={executingRetention}
                className="theme-nav-link rounded-lg border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecuteRetention}
                disabled={executingRetention || retentionConfirmation !== "EXECUTAR RETENÇÃO"}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {executingRetention ? "Executando..." : "Confirmar retencao"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {anonymizeModalOpen ? (
        <div className="theme-modal-backdrop fixed inset-0 z-[80] flex items-center justify-center px-4 backdrop-blur-sm">
          <div className="theme-surface-strong w-full max-w-lg rounded-2xl border border-red-700 p-5 shadow-[0_24px_90px_rgba(0,0,0,0.22)]">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">Anonimizar dados</h2>
              <span className="theme-soft-danger-badge rounded-full border px-2 py-0.5 text-[11px] font-semibold">
                Irreversivel
              </span>
            </div>
            <p className="theme-muted mt-3 text-sm leading-relaxed">
              Essa acao remove permanentemente os dados pessoais desta conversa. Apos confirmar,
              nao sera possivel recuperar nome, telefone ou informacoes sensiveis.
            </p>
            <p className="theme-surface mt-3 rounded-xl border px-3 py-2 text-sm">
              {conversationId.trim()}
            </p>
            <label className="theme-muted mt-4 block text-sm font-medium" htmlFor="anonymize-confirmation">
              Digite ANONIMIZAR para confirmar
            </label>
            <input
              id="anonymize-confirmation"
              value={anonymizeConfirmation}
              onChange={(event) => setAnonymizeConfirmation(event.target.value)}
              autoFocus
              className="theme-select mt-2 w-full rounded-xl px-3 py-2 text-sm outline-none focus:border-red-300/50"
            />
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setAnonymizeModalOpen(false)}
                disabled={anonymizing}
                className="theme-nav-link rounded-lg border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAnonymize}
                disabled={anonymizing || anonymizeConfirmation !== "ANONIMIZAR"}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {anonymizing ? "Anonimizando..." : "Confirmar anonimizacao"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
