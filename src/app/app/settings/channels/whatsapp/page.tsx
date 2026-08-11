"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
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
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [qrExpired, setQrExpired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [autoRefreshing, setAutoRefreshing] = useState(false);
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
    const observedState = nextStatus.lifecycle.observedState;
    if (observedState === "CONNECTED" || observedState === "DISCONNECTED" || observedState === "ERROR") {
      setQr(null);
      setQrImage(null);
      setQrExpired(false);
    }
  }, []);

  const loadStatus = useCallback(async (activeSession: AppSession) => {
    const response = await fetchAppWhatsAppWebSessionStatus(activeSession);
    applyStatus(response.status, response.permissions.canUpdate);
    return response.status;
  }, [applyStatus]);

  const loadQr = useCallback(async (activeSession: AppSession) => {
    const response = await fetchAppWhatsAppWebSessionQr(activeSession);
    setQr(response.qr);
    setQrExpired(response.expired);
    return response;
  }, []);

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

  useEffect(() => {
    let cancelled = false;
    if (!qr) {
      setQrImage(null);
      return;
    }
    QRCode.toDataURL(qr, {
      errorCorrectionLevel: "M",
      margin: 2,
      scale: 7,
      color: {
        dark: "#06152b",
        light: "#ffffff",
      },
    })
      .then((dataUrl) => {
        if (!cancelled) setQrImage(dataUrl);
      })
      .catch(() => {
        if (!cancelled) {
          setQrImage(null);
          setError("Código recebido, mas não foi possível gerar a imagem para leitura.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [qr]);

  const readOnly = useMemo(() => !session || !canUpdateChannels(session.user.role) || !canUpdate, [canUpdate, session]);

  const lifecycle = status?.lifecycle;
  const currentState = lifecycle?.observedState ?? "DISCONNECTED";
  const isConfigured = Boolean(status?.configured);
  const isConnected = currentState === "CONNECTED";
  const isDisconnected = currentState === "DISCONNECTED";
  const isConnecting = currentState === "CONNECTING" || currentState === "QR_REQUIRED" || currentState === "RECONNECTING";
  const isBusy = Boolean(working);
  const canPrepare = !readOnly && !isBusy && !isConnected && !isConnecting;
  const canConnect = !readOnly && !isBusy && isConfigured && !isConnected && !isConnecting;
  const canDisconnect = !readOnly && !isBusy && isConfigured && !isDisconnected;
  const canReset = !readOnly && !isBusy && isConfigured;
  const shouldAutoPoll = Boolean(session && isConfigured && (isConnecting || currentState === "CONNECTED" || currentState === "ERROR"));

  const statusHint = useMemo(() => {
    if (!status?.configured) return "Prepare o canal para iniciar a conexão.";
    if (currentState === "CONNECTED") return "Conexão ativa. O código foi removido e a sessão está salva.";
    if (currentState === "CONNECTING" || currentState === "RECONNECTING") {
      return "Conectando ao WhatsApp Business. Se um código for necessário, ele aparecerá aqui automaticamente.";
    }
    if (currentState === "QR_REQUIRED") return "Leia o código abaixo em Dispositivos conectados no WhatsApp Business.";
    if (currentState === "ERROR") return "Houve erro na conexão. Redefina a sessão ou tente conectar novamente.";
    return "Conexão parada. Clique em Conectar para iniciar.";
  }, [currentState, status?.configured]);

  useEffect(() => {
    if (!session || !shouldAutoPoll) return;
    let cancelled = false;
    let running = false;
    const tick = async () => {
      if (running || cancelled) return;
      running = true;
      setAutoRefreshing(true);
      try {
        const nextStatus = await loadStatus(session);
        const observedState = nextStatus.lifecycle.observedState;
        if (observedState === "CONNECTING" || observedState === "QR_REQUIRED" || observedState === "RECONNECTING") {
          await loadQr(session);
        }
      } catch (err) {
        const typed = err as AppApiError;
        if (typed.status === 401) {
          handleUnauthorized();
          return;
        }
      } finally {
        running = false;
        if (!cancelled) setAutoRefreshing(false);
      }
    };
    void tick();
    const interval = window.setInterval(() => void tick(), currentState === "QR_REQUIRED" ? 2500 : 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [currentState, handleUnauthorized, loadQr, loadStatus, session, shouldAutoPoll]);

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
      if (action === "connect") setSuccess("Conexão solicitada. O código aparecerá automaticamente quando estiver disponível.");
      if (action === "disconnect") setSuccess("Conexão interrompida sem apagar a sessão salva.");
      if (action === "reset") {
        setQr(null);
        setQrImage(null);
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

  if (!session) {
    return <main className="min-h-screen bg-re7-navy" />;
  }

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
                    disabled={!canPrepare}
                    className="rounded-md bg-re7-orange px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {working === "prepare" ? "Preparando..." : "Preparar canal"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void runAction("connect", connectAppWhatsAppWebSession)}
                    disabled={!canConnect}
                    className="rounded-md border border-emerald-300/35 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {working === "connect" ? "Solicitando..." : "Conectar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void runAction("disconnect", disconnectAppWhatsAppWebSession)}
                    disabled={!canDisconnect}
                    className="rounded-md border border-white/20 px-4 py-2 text-sm font-semibold text-white/85 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Desconectar
                  </button>
                  <button
                    type="button"
                    onClick={() => void runAction("reset", resetAppWhatsAppWebSession)}
                    disabled={!canReset}
                    className="rounded-md border border-red-300/30 px-4 py-2 text-sm font-semibold text-red-100 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Redefinir sessão
                  </button>
                  <button
                    type="button"
                    onClick={() => session && void loadStatus(session)}
                    disabled={Boolean(working) || autoRefreshing}
                    className="rounded-md border border-white/15 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {autoRefreshing ? "Atualizando..." : "Atualizar"}
                  </button>
                </div>
              </>
            )}
          </div>

          <aside className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Código de conexão</h2>
              <p className="mt-1 text-sm leading-relaxed text-white/65">
                {statusHint}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-re7-navy/60 p-3">
              {qr ? (
                <div className="space-y-3">
                  <div className="flex min-h-72 items-center justify-center rounded-md border border-white/15 bg-white p-4">
                    {qrImage ? (
                      <img
                        src={qrImage}
                        alt="Código QR efêmero para conectar WhatsApp Business"
                        className="h-auto w-full max-w-72"
                      />
                    ) : (
                      <p className="text-center text-sm text-re7-navy/70">Gerando imagem do código...</p>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed text-white/60">
                    Código efêmero. Ele desaparece automaticamente ao conectar ou expirar.
                  </p>
                </div>
              ) : (
                <div className="flex min-h-40 items-center justify-center rounded-md border border-dashed border-white/15 bg-re7-navy/70 p-4 text-center text-sm text-white/60">
                  {qrExpired ? "Código expirado. Clique em Conectar para gerar um novo código." : statusHint}
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
