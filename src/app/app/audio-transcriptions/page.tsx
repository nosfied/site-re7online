"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { FeedbackToast, usePausableFeedbackAutoDismiss } from "@/components/ui/FeedbackToast";
import {
  AppApiError,
  AppAudioTranscription,
  AppAudioTranscriptionJob,
  AppSession,
  clearAppSession,
  fetchAppAudioTranscriptions,
  loadAppSession,
  saveAppSession,
} from "@/lib/appClientApi";
import { hasCapability } from "@/lib/appFeatures";
import { getAppErrorUxMessage, getChannelUxLabel } from "@/lib/appUxLabels";
import { formatDateTime } from "@/lib/whatsappAdminApi";

function canViewAudioTranscriptions(role: string) {
  const normalized = role.trim().toUpperCase();
  return normalized === "SUPERVISOR" || normalized === "ADMIN";
}

function StatusPill({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const tone =
    normalized === "completed" || normalized === "ready"
      ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-100"
      : normalized === "failed" || normalized === "cancelled"
        ? "border-rose-400/30 bg-rose-500/15 text-rose-100"
        : "border-amber-300/30 bg-amber-500/15 text-amber-100";
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}>{status}</span>;
}

function normalizeError(error: AppApiError) {
  if (error.status === 401) return "Sessão expirada. Faça login novamente.";
  if (error.status === 403 || error.errorCode === "feature_not_enabled") {
    return "Transcrição de áudio não está habilitada para esta organização.";
  }
  return getAppErrorUxMessage({ status: error.status, errorCode: error.errorCode, message: error.message, fallback: "Não foi possível carregar as transcrições." });
}

function getTranscriptionProviderLabel(provider: string | null | undefined) {
  return provider ? "Transcrição automática" : "Não definido";
}

export default function AudioTranscriptionsPage() {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [transcriptions, setTranscriptions] = useState<AppAudioTranscription[]>([]);
  const [jobs, setJobs] = useState<AppAudioTranscriptionJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const toastHandlers = usePausableFeedbackAutoDismiss(Boolean(error), () => setError(null));

  const stats = useMemo(() => {
    const completed = transcriptions.filter((item) => item.status === "completed" || item.status === "ready").length;
    const failed = jobs.filter((item) => item.status === "failed").length;
    return {
      transcriptions: transcriptions.length,
      jobs: jobs.length,
      completed,
      failed,
    };
  }, [jobs, transcriptions]);

  const handleUnauthorized = useCallback(() => {
    clearAppSession();
    router.replace("/app/login");
  }, [router]);

  const loadTranscriptions = useCallback(
    async (activeSession: AppSession) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetchAppAudioTranscriptions(activeSession);
        setTranscriptions(response.transcriptions);
        setJobs(response.jobs);
      } catch (err) {
        const typed = err as AppApiError;
        if (typed.status === 401) {
          handleUnauthorized();
          return;
        }
        if (typed.status === 403) {
          router.replace("/app/inbox");
          return;
        }
        setError(normalizeError(typed));
      } finally {
        setLoading(false);
      }
    },
    [handleUnauthorized, router]
  );

  useEffect(() => {
    const stored = loadAppSession();
    if (!stored) {
      router.replace("/app/login");
      return;
    }
    if (!canViewAudioTranscriptions(stored.user.role) || !hasCapability(stored, "audioTranscription")) {
      router.replace("/app/inbox");
      return;
    }
    saveAppSession(stored);
    setSession(stored);
    void loadTranscriptions(stored);
  }, [loadTranscriptions, router]);

  if (!session) return null;

  return (
    <AppShell
      session={session}
      title="Transcrições de áudio"
      subtitle="Base para consultar transcrições futuras. Nenhum áudio é processado nesta fase."
    >
      {error ? <FeedbackToast variant="error" message={error} {...toastHandlers} /> : null}

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Transcricoes" value={stats.transcriptions} />
        <Metric label="Jobs" value={stats.jobs} />
        <Metric label="Concluidas" value={stats.completed} />
        <Metric label="Falhas" value={stats.failed} />
      </section>

      <section className="mt-5 rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Transcricoes</h2>
            <p className="mt-1 text-sm theme-muted">Registros desta organização gerados por processamentos futuros.</p>
          </div>
          <button
            type="button"
            onClick={() => void loadTranscriptions(session)}
            className="rounded-md border border-white/15 px-3 py-2 text-sm hover:bg-white/10"
          >
            Atualizar
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="theme-muted">
              <tr className="border-b border-white/10">
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Canal</th>
                <th className="px-3 py-2 font-medium">Origem</th>
                <th className="px-3 py-2 font-medium">Idioma</th>
                <th className="px-3 py-2 font-medium">Transcript</th>
                <th className="px-3 py-2 font-medium">Criado em</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center theme-muted">
                    Carregando transcricoes...
                  </td>
                </tr>
              ) : transcriptions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center theme-muted">
                    Nenhuma transcricao registrada.
                  </td>
                </tr>
              ) : (
                transcriptions.map((item) => (
                  <tr key={item.id} className="border-b border-white/5 align-top">
                    <td className="px-3 py-3">
                      <StatusPill status={item.status} />
                    </td>
                    <td className="px-3 py-3">{getChannelUxLabel(item.channel)}</td>
                    <td className="px-3 py-3">{getTranscriptionProviderLabel(item.provider)}</td>
                    <td className="px-3 py-3">{item.language ?? "Não definido"}</td>
                    <td className="max-w-lg px-3 py-3">
                      <p className="line-clamp-3 text-sm">{item.transcript || "Transcript ainda indisponivel."}</p>
                      <p className="mt-1 text-xs theme-muted">Mensagem: {item.messageId}</p>
                    </td>
                    <td className="px-3 py-3">{formatDateTime(item.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-5 rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <h2 className="text-base font-semibold">Jobs</h2>
        <p className="mt-1 text-sm theme-muted">Fila estrutural para as fases shadow e runtime controlado.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="theme-muted">
              <tr className="border-b border-white/10">
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Origem</th>
                <th className="px-3 py-2 font-medium">Inicio</th>
                <th className="px-3 py-2 font-medium">Fim</th>
                <th className="px-3 py-2 font-medium">Erro</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center theme-muted">
                    Carregando jobs...
                  </td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center theme-muted">
                    Nenhum job registrado.
                  </td>
                </tr>
              ) : (
                jobs.map((item) => (
                  <tr key={item.id} className="border-b border-white/5 align-top">
                    <td className="px-3 py-3">
                      <StatusPill status={item.status} />
                    </td>
                    <td className="px-3 py-3">{getTranscriptionProviderLabel(item.provider)}</td>
                    <td className="px-3 py-3">{item.startedAt ? formatDateTime(item.startedAt) : "Não iniciado"}</td>
                    <td className="px-3 py-3">{item.finishedAt ? formatDateTime(item.finishedAt) : "Não finalizado"}</td>
                    <td className="max-w-md px-3 py-3">{item.error ?? "Sem erro registrado"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs uppercase tracking-wide theme-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
