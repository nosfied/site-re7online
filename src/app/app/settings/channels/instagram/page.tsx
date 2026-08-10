"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { FeedbackToast, usePausableFeedbackAutoDismiss } from "@/components/ui/FeedbackToast";
import {
  AppApiError,
  AppInstagramBusinessValidation,
  AppSession,
  clearAppSession,
  fetchAppInstagramBusinessStatus,
  loadAppSession,
  saveAppSession,
  startAppInstagramBusinessConnect,
  validateAppInstagramBusinessConnection,
  type AppInstagramBusinessStatus,
} from "@/lib/appClientApi";
import { getAppErrorUxMessage, getConnectionStatusUxLabel } from "@/lib/appUxLabels";

function canManageChannels(role: string) {
  const normalized = role.trim().toUpperCase();
  return normalized === "ADMIN" || normalized === "SUPERVISOR";
}

function StatusPill({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "success" | "warning" | "danger" }) {
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

function getTokenTone(status?: string | null) {
  if (status === "configured") return "success" as const;
  if (status === "missing") return "warning" as const;
  return "danger" as const;
}

function CapabilityPill({
  value,
  label,
}: {
  value: "available" | "blocked" | "unknown" | "incompatible_token_or_review_blocked";
  label: string;
}) {
  const display =
    value === "incompatible_token_or_review_blocked"
      ? "bloqueado pela revisão"
      : value === "available"
        ? "disponível"
        : value === "blocked"
          ? "bloqueado"
          : "não confirmado";
  return (
    <StatusPill
      label={`${label}: ${display}`}
      tone={value === "available" ? "success" : value === "blocked" ? "danger" : "warning"}
    />
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-white/5 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/50">{label}</p>
      <p className="mt-2 break-all font-mono text-sm text-white/90">{value || "-"}</p>
    </div>
  );
}

function formatValidationPendingItem(item: { stage: string; message: string }) {
  if (item.stage === "conversations_capability") {
    return {
      label: "Permissão de conversas do Instagram Direct",
      message:
        "A identidade Instagram foi validada, mas a Meta ainda não liberou a permissão de conversas/mensagens para este app ou estado de revisão.",
    };
  }
  return {
    label: item.stage,
    message: item.message,
  };
}

function AppInstagramChannelSettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [session, setSession] = useState<AppSession | null>(null);
  const [status, setStatus] = useState<AppInstagramBusinessStatus | null>(null);
  const [validation, setValidation] = useState<AppInstagramBusinessValidation | null>(null);
  const [redirectUri, setRedirectUri] = useState("");
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const toastHandlers = usePausableFeedbackAutoDismiss(Boolean(error || success || warning), () => {
    setError(null);
    setSuccess(null);
    setWarning(null);
  });

  const handleUnauthorized = useCallback(() => {
    clearAppSession();
    router.replace("/app/login");
  }, [router]);

  const loadStatus = useCallback(
    async (activeSession: AppSession) => {
      const response = await fetchAppInstagramBusinessStatus(activeSession);
      setStatus(response.status);
      setRedirectUri(response.redirectUri);
    },
    []
  );

  useEffect(() => {
    const stored = loadAppSession();
    if (!stored?.token) {
      router.replace("/app/login");
      return;
    }
    if (!canManageChannels(stored.user.role)) {
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
        setError(getAppErrorUxMessage({ ...typed, fallback: "Não foi possível carregar a conexão do Instagram." }));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [handleUnauthorized, loadStatus, session]);

  useEffect(() => {
    const result = searchParams.get("instagramConnect");
    if (result === "success") {
      setSuccess("Instagram Business conectado. Valide a conexão para confirmar permissões e liberação de conversas.");
    }
    if (result === "error") {
      setError("A conexão do Instagram não foi concluída.");
    }
  }, [searchParams]);

  const handleConnect = useCallback(async () => {
    if (!session) return;
    setConnecting(true);
    setError(null);
    setSuccess(null);
    setWarning(null);
    try {
      const response = await startAppInstagramBusinessConnect(session);
      window.location.href = response.authUrl;
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(getAppErrorUxMessage({ ...typed, fallback: "Não foi possível iniciar a conexão do Instagram Business." }));
      setConnecting(false);
    }
  }, [handleUnauthorized, session]);

  const handleValidate = useCallback(async () => {
    if (!session) return;
    setValidating(true);
    setError(null);
    setSuccess(null);
    setWarning(null);
    try {
      const response = await validateAppInstagramBusinessConnection(session);
      setValidation(response.validation);
      await loadStatus(session);
      if (response.validation.ok) {
        setSuccess("Instagram Business validado com sucesso.");
      } else {
        setWarning("Instagram conectado, com pendências de liberação pela Meta. Veja os detalhes abaixo.");
      }
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(getAppErrorUxMessage({ ...typed, fallback: "Não foi possível validar a conexão do Instagram." }));
    } finally {
      setValidating(false);
    }
  }, [handleUnauthorized, loadStatus, session]);

  if (!session) {
    return <main className="min-h-screen bg-re7-navy" />;
  }

  return (
    <AppShell
      session={session}
      title="Instagram Business"
      subtitle="Conecte o Instagram e valide se as mensagens diretas estão prontas para uso."
    >
      {error ? (
        <FeedbackToast
          message={error}
          variant="error"
          {...toastHandlers}
        />
      ) : null}
      {warning ? (
        <FeedbackToast
          message={warning}
          variant="warning"
          {...toastHandlers}
        />
      ) : null}
      {success ? (
        <FeedbackToast
          message={success}
          variant="success"
          {...toastHandlers}
        />
      ) : null}

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 md:px-6">
        <section className="rounded-xl border border-white/10 bg-white/5 p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-re7-orange">
                Revisão Meta
              </p>
              <h1 className="mt-2 text-2xl font-semibold text-white">Conexão do Instagram Business</h1>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/70">
                Use esta tela para conectar a conta do Instagram, conceder permissões e validar a conexão antes de
                receber mensagens diretas na caixa de entrada do Converta.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleConnect}
                disabled={connecting || loading}
                className="rounded-md bg-re7-orange px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {connecting ? "Abrindo..." : "Conectar Instagram Business"}
              </button>
              <button
                type="button"
                onClick={handleValidate}
                disabled={validating || loading}
                className="rounded-md border border-white/20 px-4 py-2 text-sm font-semibold text-white/90 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {validating ? "Validando..." : "Validar conexão"}
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Conexão</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusPill
                label={`Acesso: ${getConnectionStatusUxLabel(status?.tokenStatus ?? "loading")}`}
                tone={getTokenTone(status?.tokenStatus)}
              />
              <StatusPill
                label={status?.enabled ? "Ativo" : "Inativo"}
                tone={status?.enabled ? "success" : "warning"}
              />
              <StatusPill label="Envio ativo indisponível" tone="warning" />
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Conta</p>
            <p className="mt-3 text-lg font-semibold text-white">{status?.username ? `@${status.username}` : "Não confirmada"}</p>
            <p className="mt-1 break-all font-mono text-xs text-white/55">{status?.channelAccountId || "-"}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Permissões para revisão</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusPill label="instagram_business_basic" />
              <StatusPill label="instagram_business_manage_messages" />
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          <DetailRow label="URL de retorno para o painel Meta" value={redirectUri} />
          <DetailRow label="Integração de recebimento (Webhook)" value="https://converta.re7online.com/agent-api/meta/webhook" />
          <DetailRow label="Identidade técnica do recebimento" value={status?.externalAccountIds?.join(", ")} />
          <DetailRow label="ID técnico da Página do Facebook" value={status?.facebookPageId} />
        </section>

        {validation ? (
          <section className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Resultado da validação</h2>
                <p className="mt-1 text-sm text-white/60">Verificado em {validation.checkedAt}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusPill label={validation.ok ? "Pronto" : "Pendente"} tone={validation.ok ? "success" : "warning"} />
                <CapabilityPill label="Conversas" value={validation.capabilities.conversations} />
                <CapabilityPill label="Mensagens" value={validation.capabilities.messages} />
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-re7-navy/50 p-3">
                <p className="text-sm font-semibold text-white">Acesso do Instagram Business</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <StatusPill
                    label={validation.tokenDiagnostics?.instagramBusinessToken.present ? "Presente" : "Pendente"}
                    tone={validation.tokenDiagnostics?.instagramBusinessToken.present ? "success" : "warning"}
                  />
                  <StatusPill
                    label={
                      validation.tokenDiagnostics?.instagramBusinessToken.identityValidated
                        ? "Identidade validada"
                        : "Identidade pendente"
                    }
                    tone={
                      validation.tokenDiagnostics?.instagramBusinessToken.identityValidated ? "success" : "warning"
                    }
                  />
                  <StatusPill
                    label={
                      validation.tokenDiagnostics?.instagramBusinessToken.scopesValidated
                        ? "Permissões retornadas"
                        : "Permissões pendentes"
                    }
                    tone={validation.tokenDiagnostics?.instagramBusinessToken.scopesValidated ? "success" : "warning"}
                  />
                </div>
                <p className="mt-2 text-xs text-white/55">
                  Diagnóstico técnico: origem {validation.tokenDiagnostics?.instagramBusinessToken.source ?? "nenhuma"} · tamanho{" "}
                  {validation.tokenDiagnostics?.instagramBusinessToken.tokenLength ?? 0} · prefix:{" "}
                  {validation.tokenDiagnostics?.instagramBusinessToken.tokenPrefix ?? "-"}
                </p>
              </div>

              <div className="rounded-lg border border-white/10 bg-re7-navy/50 p-3">
                <p className="text-sm font-semibold text-white">Validação do acesso da Página/Messenger</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <StatusPill
                    label={validation.tokenDiagnostics?.pageToken.present ? "Presente" : "Pendente"}
                    tone={validation.tokenDiagnostics?.pageToken.present ? "success" : "warning"}
                  />
                  <StatusPill
                    label={
                      validation.tokenDiagnostics?.pageToken.debugValidated
                        ? "Validação técnica OK"
                        : "Validação técnica não usada"
                    }
                    tone={validation.tokenDiagnostics?.pageToken.debugValidated ? "success" : "warning"}
                  />
                </div>
                <p className="mt-2 text-xs text-white/55">
                  O acesso da Página só é necessário para o caminho legado de validação Messenger/Página.
                </p>
              </div>

              <div className="rounded-lg border border-white/10 bg-re7-navy/50 p-3 md:col-span-2">
                <p className="text-sm font-semibold text-white">Liberação de conversas</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <CapabilityPill label="Conversas" value={validation.capabilities.conversations} />
                  <CapabilityPill label="Mensagens" value={validation.capabilities.messages} />
                </div>
                <p className="mt-2 text-xs text-white/55">
                  Se continuar bloqueado pela revisão com identidade validada, o acesso existe, mas a Meta ainda não
                  liberou conversas para este app ou estado de revisão.
                </p>
              </div>

              <div className="rounded-lg border border-white/10 bg-re7-navy/50 p-3">
                <p className="text-sm font-semibold text-white">Permissões concedidas</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {validation.grantedScopes.length ? (
                    validation.grantedScopes.map((scope) => <StatusPill key={scope} label={scope} tone="success" />)
                  ) : (
                    <p className="text-sm text-white/55">Nenhuma permissão retornada.</p>
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-re7-navy/50 p-3">
                <p className="text-sm font-semibold text-white">Permissões pendentes</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {validation.missingScopes.length ? (
                    validation.missingScopes.map((scope) => <StatusPill key={scope} label={scope} tone="danger" />)
                  ) : (
                    <StatusPill label="Nenhuma" tone="success" />
                  )}
                </div>
              </div>
            </div>

            {validation.errors.length ? (
              <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-500/10 p-3">
                <p className="text-sm font-semibold text-amber-100">Itens pendentes</p>
                <ul className="mt-2 space-y-2 text-sm text-amber-50/85">
                  {validation.errors.map((item, index) => {
                    const formatted = formatValidationPendingItem(item);
                    return (
                      <li key={`${item.stage}-${index}`}>
                        <span className="font-semibold">{formatted.label}:</span> {formatted.message}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="text-lg font-semibold text-white">Roteiro de validação</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-white/70">
            <li>Entre no Converta.</li>
            <li>Abra Configurações, Canais, Instagram Business.</li>
            <li>Clique em Conectar Instagram Business.</li>
            <li>Conceda as permissões no login da Meta.</li>
            <li>Volte para esta página e valide a conexão.</li>
            <li>Envie uma mensagem controlada pelo Instagram Direct para confirmar recebimento e persistência.</li>
          </ol>
        </section>
      </div>
    </AppShell>
  );
}

export default function AppInstagramChannelSettingsPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-re7-navy" />}>
      <AppInstagramChannelSettingsContent />
    </Suspense>
  );
}
