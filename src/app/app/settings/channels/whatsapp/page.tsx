"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { FeedbackToast, usePausableFeedbackAutoDismiss } from "@/components/ui/FeedbackToast";
import {
  AppApiError,
  AppSession,
  AppWhatsAppWebSessionStatus,
  clearAppSession,
  connectAppWhatsAppWebSession,
  disconnectAppWhatsAppWebSession,
  fetchAppWhatsAppWebSessionQr,
  fetchAppWhatsAppWebSessionStatus,
  loadAppSession,
  prepareAppWhatsAppWebSession,
  resetAppWhatsAppWebSession,
  saveAppSession,
} from "@/lib/appClientApi";
import { getAppErrorUxMessage } from "@/lib/appUxLabels";

function canViewChannels(role: string) {
  const normalized = role.trim().toUpperCase();
  return normalized === "ADMIN" || normalized === "SUPERVISOR";
}

function canUpdateChannels(role: string) {
  return role.trim().toUpperCase() === "ADMIN";
}

function stateLabel(state: AppWhatsAppWebSessionStatus["lifecycle"]["observedState"]) {
  switch (state) {
    case "CONNECTED":
      return "Conectado";
    case "CONNECTING":
      return "Conectando";
    case "QR_REQUIRED":
      return "Aguardando leitura do código";
    case "RECONNECTING":
      return "Reconectando";
    case "ERROR":
      return "Erro";
    default:
      return "Desconectado";
  }
}

function stateTone(state: AppWhatsAppWebSessionStatus["lifecycle"]["observedState"]) {
  if (state === "CONNECTED") return "success";
  if (state === "ERROR") return "danger";
  if (state === "CONNECTING" || state === "QR_REQUIRED" || state === "RECONNECTING") return "warning";
  return "neutral";
}

function Pill({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "success" | "warning" | "danger" }) {
  const classes =
    tone === "success"
      ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-100"
      : tone === "warning"
        ? "border-amber-300/30 bg-amber-500/15 text-amber-100"
        : tone === "danger"
          ? "border-red-400/30 bg-red-500/15 text-red-100"
          : "border-white/15 bg-white/5 text-white/75";
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${classes}`}>{label}</span>;
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-lg border border-white/10 bg-re7-navy/45 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/45">{label}</p>
      <p className="mt-2 break-all text-sm text-white/85">{value || "-"}</p>
    </div>
  );
}

function normalizeError(error: AppApiError, fallback: string) {
  if (error.status === 401) return "Sessão expirada. Faça login novamente.";
  if (error.status === 403 && error.errorCode === "web_session_feature_disabled") {
    return "Sessão Web ainda não está habilitada para esta organização.";
  }
  if (error.status === 403) return "Sem permissão para alterar este canal.";
  if (error.status === 404) return "Prepare o canal antes de solicitar conexão.";
  return getAppErrorUxMessage({ ...error, fallback });
}

export default function AppWhatsAppChannelSettingsPage() {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [status, setStatus] = useState<AppWhatsAppWebSessionStatus | null>(null);
  const [canUpdate, setCanUpdate] = useState(false);
  const [displayName, setDisplayName] = useState("WhatsApp Business");
  const [qr, setQr] = useState<string | null>(null);
  const [qrExpired, setQrExpired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
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

  const applyStatus = useCallback((nextStatus: AppWhatsAppWebSessionStatus, nextCanUpdate: boolean) => {
    setStatus(nextStatus);
    setCanUpdate(nextCanUpdate);
    setDisplayName(nextStatus.account?.displayName || "WhatsApp Business");
  }, []);

  const loadStatus = useCallback(async (activeSession: AppSession) => {
    const response = await fetchAppWhatsAppWebSessionStatus(activeSession);
    applyStatus(response.status, response.permissions.canUpdate);
  }, [applyStatus]);

  useEffect(() => {
    const stored = loadAppSession();
    if (!stored?.token) {
      router.replace("/app/login");
      return;
    }
    if (!canViewChannels(stored.user.role)) {
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
    loadStatus(session)
      .catch((err) => {
        if (cancelled) return;
        const typed = err as AppApiError;
        if (typed.status === 401) {
          handleUnauthorized();
          return;
        }
        setError(normalizeError(typed, "Não foi possível carregar o canal WhatsApp."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [handleUnauthorized, loadStatus, session]);

  const readOnly = useMemo(() => !session || !canUpdateChannels(session.user.role) || !canUpdate, [canUpdate, session]);

  const runAction = async (
    action: string,
    fn: (activeSession: AppSession) => Promise<{ status: AppWhatsAppWebSessionStatus }>
  ) => {
    if (!session || readOnly) return;
    setWorking(action);
    setError(null);
    setSuccess(null);
    try {
      const response = await fn(session);
      applyStatus(response.status, true);
      if (action === "prepare") setSuccess("Canal WhatsApp Business preparado.");
      if (action === "connect") setSuccess("Conexão solicitada. Aguarde o código aparecer.");
      if (action === "disconnect") setSuccess("Conexão interrompida sem apagar a sessão salva.");
      if (action === "reset") {
        setQr(null);
        setQrExpired(false);
        setSuccess("Sessão redefinida. Uma nova conexão exigirá novo código.");
      }
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(normalizeError(typed, "Não foi possível concluir a ação."));
    } finally {
      setWorking(null);
    }
  };

  const handleQr = async () => {
    if (!session) return;
    setWorking("qr");
    setError(null);
    setSuccess(null);
    try {
      const response = await fetchAppWhatsAppWebSessionQr(session);
      setQr(response.qr);
      setQrExpired(response.expired);
      if (response.qr) {
        setSuccess("Código efêmero carregado.");
      } else if (response.expired) {
        setError("Código expirado. Gere um novo código.");
      } else {
        setError("O código ainda não está disponível. Verifique se o worker está em execução.");
      }
      await loadStatus(session);
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(normalizeError(typed, "Não foi possível consultar o código."));
    } finally {
      setWorking(null);
    }
  };

  if (!session) {
    return <main className="min-h-screen bg-re7-navy" />;
  }

  const lifecycle = status?.lifecycle;
  const currentState = lifecycle?.observedState ?? "DISCONNECTED";

  return (
    <AppShell
      session={session}
      title="Canais"
      subtitle="Administre conexões de atendimento da organização."
    >
      <FeedbackToast message={success} variant="success" {...toastHandlers} />
      <FeedbackToast message={error} variant="error" {...toastHandlers} />

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 md:px-6">
        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-re7-orange">WhatsApp</p>
              <h1 className="mt-2 text-2xl font-semibold text-white">WhatsApp Business por sessão</h1>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/70">
                Use esta tela somente para conexão controlada com número de laboratório autorizado. O envio, recebimento,
                campanhas e modelos continuam fora deste canal nesta etapa.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Pill label={stateLabel(currentState)} tone={stateTone(currentState)} />
              <Pill label={status?.featureEnabled ? "Feature habilitada" : "Feature desligada"} tone={status?.featureEnabled ? "success" : "warning"} />
              <Pill label={status?.authState.configured ? "Sessão salva" : "Sem sessão salva"} />
              {readOnly ? <Pill label="Somente leitura" tone="warning" /> : null}
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
            {loading ? (
              <p className="text-sm text-white/70">Carregando canal...</p>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-1.5 text-sm text-white/75">
                    <span>Nome da conexão</span>
                    <input
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      disabled={readOnly || Boolean(working)}
                      className="rounded-md border border-white/15 bg-re7-navy px-2.5 py-2 text-sm text-white outline-none placeholder:text-white/35 disabled:cursor-not-allowed disabled:opacity-60"
                      placeholder="WhatsApp Business"
                    />
                  </label>
                  <Detail label="Tipo de conexão" value="WhatsApp Business" />
                  <Detail label="Identidade local" value={status?.account?.channelAccountId ?? "Não preparada"} />
                  <Detail label="Estado técnico" value={currentState} />
                  <Detail label="Última conexão" value={lifecycle?.lastConnectedAt} />
                  <Detail label="Última desconexão" value={lifecycle?.lastDisconnectedAt} />
                  <Detail label="Último erro" value={lifecycle?.lastErrorCode} />
                  <Detail label="Reconexões" value={String(lifecycle?.reconnectCount ?? 0)} />
                </div>

                <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
                  <button
                    type="button"
                    onClick={() => void runAction("prepare", (activeSession) => prepareAppWhatsAppWebSession(activeSession, { displayName }))}
                    disabled={readOnly || Boolean(working)}
                    className="rounded-md bg-re7-orange px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {working === "prepare" ? "Preparando..." : "Preparar canal"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void runAction("connect", connectAppWhatsAppWebSession)}
                    disabled={readOnly || Boolean(working) || !status?.configured}
                    className="rounded-md border border-emerald-300/35 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {working === "connect" ? "Solicitando..." : "Conectar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleQr()}
                    disabled={Boolean(working) || !status?.configured}
                    className="rounded-md border border-white/20 px-4 py-2 text-sm font-semibold text-white/90 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {working === "qr" ? "Consultando..." : "Ver código"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void runAction("disconnect", disconnectAppWhatsAppWebSession)}
                    disabled={readOnly || Boolean(working) || !status?.configured}
                    className="rounded-md border border-white/20 px-4 py-2 text-sm font-semibold text-white/85 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Desconectar
                  </button>
                  <button
                    type="button"
                    onClick={() => void runAction("reset", resetAppWhatsAppWebSession)}
                    disabled={readOnly || Boolean(working) || !status?.configured}
                    className="rounded-md border border-red-300/30 px-4 py-2 text-sm font-semibold text-red-100 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Redefinir sessão
                  </button>
                  <button
                    type="button"
                    onClick={() => session && void loadStatus(session)}
                    disabled={Boolean(working)}
                    className="rounded-md border border-white/15 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Atualizar
                  </button>
                </div>
              </>
            )}
          </div>

          <aside className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Código de conexão</h2>
              <p className="mt-1 text-sm leading-relaxed text-white/65">
                O código é temporário, não é salvo no banco e deve ser visto apenas por usuário autorizado.
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-re7-navy/60 p-3">
              {qr ? (
                <textarea
                  readOnly
                  value={qr}
                  aria-label="Código efêmero de conexão WhatsApp"
                  className="h-40 w-full resize-none rounded-md border border-white/15 bg-re7-navy p-3 font-mono text-xs text-white outline-none"
                />
              ) : (
                <div className="flex min-h-40 items-center justify-center rounded-md border border-dashed border-white/15 bg-re7-navy/70 p-4 text-center text-sm text-white/60">
                  {qrExpired ? "Código expirado. Gere um novo código." : "Solicite a conexão e consulte o código quando o worker estiver ativo."}
                </div>
              )}
            </div>
            <div className="rounded-lg border border-amber-300/25 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-100">
              Primeira conexão deve usar número controlado da RE7ONLINE ou laboratório autorizado. Não use cliente real nesta etapa.
            </div>
          </aside>
        </section>
      </div>
    </AppShell>
  );
}
