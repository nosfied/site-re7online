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

function formatBrazilPhone(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return value ?? "-";
  if (digits.startsWith("55") && digits.length === 13) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.startsWith("55") && digits.length === 12) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  return digits.startsWith("55") ? `+${digits}` : digits;
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

function webSessionErrorLabel(errorCode: string | null | undefined) {
  switch (errorCode) {
    case "web_session_identity_conflict":
      return "Este número já está conectado a outra organização. A tentativa foi bloqueada por segurança.";
    case "web_session_identity_mismatch":
      return "O número conectado não corresponde ao número autorizado para esta organização.";
    case "web_session_number_not_authorized":
      return "Nenhum número foi autorizado pela plataforma para esta organização.";
    case "web_session_identity_lock_unavailable":
      return "Já existe uma verificação de identidade em andamento. Aguarde alguns instantes e tente novamente.";
    case "connection_open_timeout":
      return "A conexão demorou mais que o esperado. Tente conectar novamente.";
    case "qr_required":
      return "Código expirado. Clique em Conectar para gerar um novo código.";
    case "terminal_manual":
      return "Conexão encerrada manualmente.";
    default:
      return errorCode || null;
  }
}

function authStateLabel(status: AppWhatsAppWebSessionStatus | null) {
  if (status?.authState.approvedConfigured || status?.authState.configured) return "Sessão aprovada salva";
  if (status?.authState.stagingConfigured) return "Pareamento em andamento salvo";
  return "Sem sessão salva";
}

function authStateTone(status: AppWhatsAppWebSessionStatus | null) {
  if (status?.authState.approvedConfigured || status?.authState.configured) return "success";
  if (status?.authState.stagingConfigured) return "warning";
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
  if (error.errorCode === "web_session_meta_identity_mismatch") {
    return "O número autorizado para sessão Web não corresponde ao número Meta Cloud deste tenant.";
  }
  if (error.errorCode === "hybrid_identity_conflict") {
    return "Os números configurados para Meta Cloud e sessão Web são diferentes.";
  }
  if (error.errorCode === "web_session_transport_unavailable") {
    return "A sessão Web precisa estar conectada antes de ser definida como transporte principal.";
  }
  if (error.errorCode === "meta_transport_unavailable") {
    return "Configure um número Meta Cloud válido antes de usar Meta como transporte principal.";
  }
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
  const [now, setNow] = useState(() => Date.now());
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
  const desiredState = lifecycle?.desiredState ?? "DISCONNECTED";
  const observedState = lifecycle?.observedState ?? "DISCONNECTED";
  const currentState = desiredState === "DISCONNECTED" ? "DISCONNECTED" : observedState;
  const isConfigured = Boolean(status?.configured);
  const isConnected = currentState === "CONNECTED";
  const isDisconnected = currentState === "DISCONNECTED";
  const isQrRequired = currentState === "QR_REQUIRED";
  const isConnecting = currentState === "CONNECTING" || currentState === "RECONNECTING";
  const isPendingConnection = isConnecting || isQrRequired;
  const connectedNumberDisplay =
    currentState === "CONNECTED" && status?.account?.channelAccountId
      ? formatBrazilPhone(status.account.channelAccountId)
      : "Nenhum número conectado";
  const isBusy = Boolean(working);
  const hasAuthorizedNumber = Boolean(status?.authorization.authorizedNumberCanonical);
  const canPrepare = !readOnly && !isBusy && !isConnected && !isPendingConnection;
  const canConnect = !readOnly && !isBusy && isConfigured && hasAuthorizedNumber && !isConnected && !isConnecting;
  const canDisconnect = !readOnly && !isBusy && isConfigured && !isDisconnected;
  const canReset = !readOnly && !isBusy && isConfigured;
  const shouldAutoPoll = Boolean(session && isConfigured && (isPendingConnection || currentState === "CONNECTED" || currentState === "ERROR"));
  const stateChangedAt = useMemo(() => {
    const raw = status?.account?.lastUpdatedAt;
    const parsed = raw ? Date.parse(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : now;
  }, [now, status?.account?.lastUpdatedAt]);
  const stateElapsedSeconds = Math.max(0, Math.floor((now - stateChangedAt) / 1000));

  useEffect(() => {
    if (!isPendingConnection) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [isPendingConnection]);

  const statusHint = useMemo(() => {
    if (!status?.configured) return "Prepare o canal para iniciar a conexão.";
    if (!hasAuthorizedNumber) return "Nenhum número foi autorizado pela plataforma para este tenant.";
    if (currentState === "CONNECTED") return "Conexão ativa. O código foi removido e a sessão está salva.";
    if (currentState === "CONNECTING" || currentState === "RECONNECTING") {
      return "Conectando ao WhatsApp Business. Se um código for necessário, ele aparecerá aqui automaticamente.";
    }
    if (currentState === "QR_REQUIRED") return "Leia o código abaixo em Dispositivos conectados no WhatsApp Business.";
    if (currentState === "ERROR") return "Houve erro na conexão. Redefina a sessão ou tente conectar novamente.";
    return "Conexão parada. Clique em Conectar para iniciar.";
  }, [currentState, hasAuthorizedNumber, status?.configured]);

  const progressSteps = useMemo(() => {
    const base = [
      { key: "CONNECTING", label: "Abrindo conexão" },
      { key: "QR_REQUIRED", label: "Código disponível" },
      { key: "CONNECTED", label: "Conectado" },
    ];
    if (currentState === "RECONNECTING") {
      return [
        { key: "RECONNECTING", label: "Reabrindo sessão" },
        { key: "CONNECTED", label: "Conectado" },
      ];
    }
    return base;
  }, [currentState]);

  const progressIndex = useMemo(() => {
    if (currentState === "CONNECTED") return progressSteps.length - 1;
    const index = progressSteps.findIndex((step) => step.key === currentState);
    return index >= 0 ? index : 0;
  }, [currentState, progressSteps]);

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
              <Pill label={authStateLabel(status)} tone={authStateTone(status)} />
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
                  <Detail label="Número autorizado" value={status?.authorization.authorizedNumberCanonical ? formatBrazilPhone(status.authorization.authorizedNumberCanonical) : "Não autorizado"} />
                  <Detail label="Status da autorização" value={status?.authorization.status ?? "RELEASED"} />
                  <Detail label="Número conectado" value={connectedNumberDisplay} />
                  <Detail label="Transporte principal" value={status?.primaryTransport === "web_session" ? "WhatsApp Business por sessão" : status?.primaryTransport === "meta" ? "Meta Cloud" : "Padrão da conversa"} />
                  <Detail label="Número detectado" value={status?.account?.channelAccountId ? formatBrazilPhone(status.account.channelAccountId) : "Não preparado"} />
                  <Detail label="Estado técnico" value={currentState} />
                  <Detail label="Última conexão" value={lifecycle?.lastConnectedAt} />
                  <Detail label="Última desconexão" value={lifecycle?.lastDisconnectedAt} />
                  <Detail label="Último erro" value={webSessionErrorLabel(lifecycle?.lastErrorCode)} />
                  <Detail label="Reconexões" value={String(lifecycle?.reconnectCount ?? 0)} />
                </div>

                <div className="rounded-lg border border-white/10 bg-re7-navy/35 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Transporte principal para texto no Inbox</p>
                      <p className="mt-1 text-xs text-white/60">
                        Definido pela administração da plataforma. Campanhas e modelos continuam pelo caminho Meta.
                      </p>
                    </div>
                    {status?.hybridIdentity?.conflict ? <Pill label="Identidades divergentes" tone="danger" /> : null}
                  </div>
                  <p className="mt-3 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/65">
                    Número autorizado e transporte de saída são governados no console interno.
                  </p>
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
            {isConnecting || isConnected ? (
              <div className="rounded-lg border border-white/10 bg-re7-navy/50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/65">
                  <span>{isConnected ? "Conexão concluída" : `Aguardando há ${stateElapsedSeconds}s`}</span>
                  {autoRefreshing ? <span>Verificando estado...</span> : null}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {progressSteps.map((step, index) => {
                    const done = index < progressIndex || currentState === "CONNECTED";
                    const active = index === progressIndex && currentState !== "CONNECTED";
                    return (
                      <div
                        key={step.key}
                        className={`rounded-md border px-3 py-2 text-xs font-semibold ${
                          done
                            ? "border-emerald-300/30 bg-emerald-500/15 text-emerald-100"
                            : active
                              ? "border-amber-300/30 bg-amber-500/15 text-amber-100"
                              : "border-white/10 bg-white/5 text-white/50"
                        }`}
                      >
                        {step.label}
                      </div>
                    );
                  })}
                </div>
                {isConnecting && stateElapsedSeconds > 45 ? (
                  <p className="mt-3 text-xs leading-relaxed text-amber-100">
                    Esta etapa está demorando mais que o esperado. A tela continuará verificando; se virar erro, tente conectar novamente.
                  </p>
                ) : null}
              </div>
            ) : null}
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
