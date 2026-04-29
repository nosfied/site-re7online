"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { FeedbackToast } from "@/components/ui/FeedbackToast";
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

  useEffect(() => {
    if (!error && !success) return;
    const timer = window.setTimeout(() => {
      setError(null);
      setSuccess(null);
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [error, success]);

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

  const handleDelete = async () => {
    if (!session) return;
    const target = conversationId.trim();
    if (!target) {
      setError("Informe o waId ou ID da conversa.");
      return;
    }
    const confirmed = window.confirm(
      "Essa ação remove a conversa da operação. Os dados pessoais poderão ser anonimizados para fins de LGPD."
    );
    if (!confirmed) return;
    setDeleting(true);
    setError(null);
    setSuccess(null);
    try {
      await deleteAppConversationData(session, target);
      setConversationId("");
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
      setSuccess("Dados da conversa anonimizados com sucesso.");
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
      <FeedbackToast message={error} variant="error" />
      <FeedbackToast message={success} variant="success" />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 p-4">
            <h2 className="text-lg font-semibold">Dados de conversa</h2>
            <p className="mt-1 text-sm text-white/65">
              Informe o waId ou ID interno da conversa para remover da operacao ou anonimizar dados.
            </p>
          </div>
          <div className="space-y-4 p-4">
            <label className="block text-sm font-medium text-white/75" htmlFor="conversation-id">
              waId ou ID da conversa
            </label>
            <input
              id="conversation-id"
              value={conversationId}
              onChange={(event) => setConversationId(event.target.value)}
              placeholder="Ex: 5584999999999"
              className="w-full rounded-xl border border-white/10 bg-[#071225] px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-re7-sky/40"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleAnonymize}
                disabled={loading || anonymizing || deleting}
                className="rounded-lg border border-amber-300/30 bg-amber-500/15 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {anonymizing ? "Anonimizando..." : "Anonimizar dados"}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={loading || deleting || anonymizing}
                className="rounded-lg border border-red-400/35 bg-red-900/25 px-4 py-2 text-sm font-semibold text-red-100 transition hover:bg-red-900/35 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting ? "Excluindo..." : "Excluir dados"}
              </button>
            </div>
            <p className="text-xs leading-relaxed text-white/50">
              Excluir dados remove a conversa da operacao e preserva auditoria tecnica minima.
              Use anonimizar dados quando precisar mascarar identificadores e conteudos pessoais.
            </p>
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 p-4">
            <h2 className="text-lg font-semibold">Retencao</h2>
            <p className="mt-1 text-sm text-white/65">Padrao do tenant: 90 dias.</p>
          </div>
          <form className="space-y-4 p-4" onSubmit={handleSaveRetention}>
            <label className="block text-sm font-medium text-white/75" htmlFor="retention-days">
              Dias de retencao
            </label>
            <input
              id="retention-days"
              type="number"
              min={1}
              max={3650}
              value={retentionDays}
              onChange={(event) => setRetentionDays(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[#071225] px-3 py-2 text-sm text-white outline-none focus:border-re7-sky/40"
            />
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
                onClick={handleExecuteRetention}
                disabled={loading || executingRetention}
                className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {executingRetention ? "Executando..." : "Executar agora"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
