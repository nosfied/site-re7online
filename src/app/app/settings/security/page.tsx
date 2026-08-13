"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { FeedbackToast, usePausableFeedbackAutoDismiss } from "@/components/ui/FeedbackToast";
import {
  AppApiError,
  AppMfaProvisioning,
  AppMfaRecoveryCodeStatus,
  AppMfaRuntimeStatus,
  AppMfaStatus,
  AppSession,
  AppSupportAccessSettingsResponse,
  clearAppSession,
  fetchAppMfaRecoveryCodeStatus,
  fetchAppMfaRuntimeStatus,
  fetchAppMfaStatus,
  fetchAppSupportAccessSettings,
  grantAppSupportAccess,
  generateAppMfaRecoveryCodes,
  loadAppSession,
  revokeAppSupportAccess,
  saveAppSession,
  startAppMfaEnrollment,
  verifyAppMfaShadow,
} from "@/lib/appClientApi";
import { hasCapability } from "@/lib/appFeatures";
import { getAppErrorUxMessage } from "@/lib/appUxLabels";
import { formatDateTime } from "@/lib/whatsappAdminApi";

function canManageSecurity(role: string) {
  const normalized = role.trim().toUpperCase();
  return normalized === "SUPERVISOR" || normalized === "ADMIN";
}

function StatusPill({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
        enabled
          ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-100"
          : "border-white/15 bg-white/5 text-white/60"
      }`}
    >
      {label}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs uppercase tracking-[0.2em] theme-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function getMfaRuntimeReasonLabel(reason?: AppMfaRuntimeStatus["reason"] | null) {
  switch (reason) {
    case "mfa_disabled":
      return "Verificação desativada";
    case "mfa_not_required":
      return "Verificação não exigida";
    case "role_not_eligible":
      return "Perfil fora da regra";
    case "admin_required_enrolled":
      return "Administrador já configurado";
    case "admin_required_pending_enrollment":
      return "Administrador precisa configurar";
    default:
      return "Verificação não exigida";
  }
}

export default function SecuritySettingsPage() {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [status, setStatus] = useState<AppMfaStatus | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<AppMfaRuntimeStatus | null>(null);
  const [recoveryStatus, setRecoveryStatus] = useState<AppMfaRecoveryCodeStatus | null>(null);
  const [supportAccess, setSupportAccess] = useState<AppSupportAccessSettingsResponse | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [provisioning, setProvisioning] = useState<AppMfaProvisioning | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingSupportAccess, setSavingSupportAccess] = useState(false);
  const [supportDurationHours, setSupportDurationHours] = useState("4");
  const [supportReason, setSupportReason] = useState("");
  const [generatingRecovery, setGeneratingRecovery] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [shadowCode, setShadowCode] = useState("");
  const [shadowResult, setShadowResult] = useState<"valid" | "invalid" | null>(null);
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

  const loadStatus = useCallback(
    async (activeSession: AppSession) => {
      setLoading(true);
      setError(null);
      try {
        const hasMfaCapability = hasCapability(activeSession, "mfa");
        const [mfaResponse, runtimeResponse, recoveryResponse, supportResponse] = await Promise.all([
          hasMfaCapability ? fetchAppMfaStatus(activeSession) : Promise.resolve(null),
          hasMfaCapability ? fetchAppMfaRuntimeStatus(activeSession) : Promise.resolve(null),
          hasMfaCapability ? fetchAppMfaRecoveryCodeStatus(activeSession) : Promise.resolve(null),
          fetchAppSupportAccessSettings(activeSession),
        ]);
        setStatus(mfaResponse?.status ?? null);
        setRuntimeStatus(runtimeResponse?.status ?? null);
        setRecoveryStatus(recoveryResponse?.status ?? null);
        setSupportAccess(supportResponse);
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
        setError(getAppErrorUxMessage({ status: typed.status, message: typed.message, fallback: "Não foi possível carregar as configurações de segurança." }));
      } finally {
        setLoading(false);
      }
    },
    [handleUnauthorized, router]
  );

  useEffect(() => {
    const stored = loadAppSession();
    if (!stored?.token) {
      router.replace("/app/login");
      return;
    }
    if (!canManageSecurity(stored.user.role)) {
      router.replace("/app/inbox");
      return;
    }
    saveAppSession(stored);
    setSession(stored);
    void loadStatus(stored);
  }, [loadStatus, router]);

  const startEnrollment = async () => {
    if (!session) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    setProvisioning(null);
    try {
      const response = await startAppMfaEnrollment(session);
      setStatus(response.status);
      setProvisioning(response.provisioning);
      const [runtimeResponse, recoveryResponse] = await Promise.all([
        fetchAppMfaRuntimeStatus(session),
        fetchAppMfaRecoveryCodeStatus(session),
      ]);
      setRuntimeStatus(runtimeResponse.status);
      setRecoveryStatus(recoveryResponse.status);
      setSuccess("Configuração do aplicativo autenticador preparada.");
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(getAppErrorUxMessage({ status: typed.status, message: typed.message, fallback: "Não foi possível iniciar a verificação em duas etapas." }));
    } finally {
      setSaving(false);
    }
  };

  const generateRecoveryCodes = async () => {
    if (!session) return;
    setGeneratingRecovery(true);
    setError(null);
    setSuccess(null);
    setRecoveryCodes([]);
    try {
      const response = await generateAppMfaRecoveryCodes(session);
      setRecoveryStatus(response.status);
      setStatus((current) =>
        current
          ? {
              ...current,
              recoveryCodes: {
                configured: response.status.configured,
                total: response.status.total,
                unused: response.status.available,
              },
            }
          : current
      );
      setRecoveryCodes(response.recoveryCodes);
      setSuccess(response.regenerated ? "Códigos de recuperação regenerados." : "Códigos de recuperação gerados.");
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(getAppErrorUxMessage({ status: typed.status, message: typed.message, fallback: "Não foi possível gerar os códigos de recuperação." }));
    } finally {
      setGeneratingRecovery(false);
    }
  };

  const verifyShadowCode = async () => {
    if (!session) return;
    const code = shadowCode.replace(/\D/g, "").slice(0, 6);
    if (code.length !== 6) {
      setError("Informe um código de 6 dígitos do aplicativo autenticador.");
      return;
    }
    setVerifying(true);
    setError(null);
    setSuccess(null);
    setShadowResult(null);
    try {
      const response = await verifyAppMfaShadow(session, code);
      setShadowResult(response.status);
      setSuccess(response.valid ? "Código válido em modo teste." : "Código inválido em modo teste.");
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(getAppErrorUxMessage({ status: typed.status, message: typed.message, fallback: "Não foi possível validar o código em modo teste." }));
    } finally {
      setVerifying(false);
    }
  };

  const refreshSupportAccess = async (activeSession: AppSession) => {
    const response = await fetchAppSupportAccessSettings(activeSession);
    setSupportAccess(response);
    return response;
  };

  const authorizeSupportAccess = async () => {
    if (!session) return;
    setSavingSupportAccess(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await grantAppSupportAccess(session, {
        durationHours: Number(supportDurationHours),
        reason: supportReason,
      });
      setSupportAccess(response);
      setSuccess("Acesso de suporte autorizado temporariamente.");
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(getAppErrorUxMessage({ status: typed.status, message: typed.message, fallback: "Não foi possível autorizar o acesso de suporte." }));
    } finally {
      setSavingSupportAccess(false);
    }
  };

  const revokeSupportAccess = async () => {
    if (!session) return;
    setSavingSupportAccess(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await revokeAppSupportAccess(session);
      setSupportAccess(response);
      setSuccess("Acesso de suporte revogado.");
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      if (typed.status === 404) {
        await refreshSupportAccess(session).catch(() => null);
      }
      setError(getAppErrorUxMessage({ status: typed.status, message: typed.message, fallback: "Não foi possível revogar o acesso de suporte." }));
    } finally {
      setSavingSupportAccess(false);
    }
  };

  const metrics = useMemo(() => {
    return {
      feature: status?.featureEnabled ? "Ativa" : "Inativa",
      enrolled: status?.enrolled ? "Sim" : "Não",
      required: status?.required ? "Sim" : "Não",
      recovery: recoveryStatus?.available ?? status?.recoveryCodes.unused ?? 0,
    };
  }, [recoveryStatus, status]);

  if (!session) return null;
  const mfaCapabilityEnabled = hasCapability(session, "mfa");

  return (
    <AppShell
      session={session}
      title="Segurança"
      subtitle="Controle de acesso temporário para suporte da plataforma e configurações de segurança disponíveis para este tenant."
    >
      {error ? <FeedbackToast variant="error" message={error} {...toastHandlers} /> : null}
      {success ? <FeedbackToast variant="success" message={success} {...toastHandlers} /> : null}

      <section className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Acesso de suporte da plataforma</h2>
            <p className="mt-1 max-w-3xl text-sm theme-muted">
              Permita temporariamente que a equipe técnica da plataforma acesse este ambiente para diagnóstico e suporte.
              O acesso é registrado, tem prazo definido e pode ser revogado a qualquer momento.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <StatusPill
                enabled={Boolean(supportAccess?.grant?.active)}
                label={supportAccess?.grant?.active ? "Autorizado" : "Desativado"}
              />
              {supportAccess?.grant ? (
                <span className="inline-flex rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-semibold text-white/70">
                  Até {formatDateTime(supportAccess.grant.expiresAt)}
                </span>
              ) : null}
            </div>
            {supportAccess?.grant?.reason ? (
              <p className="theme-muted mt-3 text-sm">Motivo: {supportAccess.grant.reason}</p>
            ) : null}
            {supportAccess?.grant?.grantedBy ? (
              <p className="theme-muted mt-1 text-xs">
                Autorizado por {supportAccess.grant.grantedBy.name}
              </p>
            ) : null}
          </div>
          {supportAccess?.permissions.canManage ? (
            <div className="grid min-w-[min(100%,22rem)] gap-3 rounded-lg border border-white/10 bg-black/20 p-3">
              <label className="grid gap-1 text-sm">
                <span className="theme-muted">Permitir suporte por</span>
                <select
                  value={supportDurationHours}
                  onChange={(event) => setSupportDurationHours(event.target.value)}
                  disabled={savingSupportAccess}
                  className="theme-input h-10 rounded-md px-3 text-sm"
                >
                  <option value="1">1 hora</option>
                  <option value="4">4 horas</option>
                  <option value="8">8 horas</option>
                  <option value="24">24 horas</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="theme-muted">Motivo/observação</span>
                <textarea
                  value={supportReason}
                  onChange={(event) => setSupportReason(event.target.value)}
                  disabled={savingSupportAccess}
                  rows={3}
                  className="theme-input rounded-md px-3 py-2 text-sm"
                  placeholder="Ex.: diagnóstico de falha no Inbox"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={authorizeSupportAccess}
                  disabled={savingSupportAccess}
                  className="theme-button-primary h-10 rounded-md px-4 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingSupportAccess ? "Salvando..." : "Autorizar acesso"}
                </button>
                <button
                  type="button"
                  onClick={revokeSupportAccess}
                  disabled={savingSupportAccess || !supportAccess?.grant?.active}
                  className="theme-button-secondary h-10 rounded-md px-4 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Revogar acesso
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {mfaCapabilityEnabled ? (
        <>
      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Verificação" value={metrics.feature} />
        <Metric label="Configuração" value={metrics.enrolled} />
        <Metric label="Obrigatório" value={metrics.required} />
        <Metric label="Códigos disponíveis" value={metrics.recovery} />
      </section>

      <section className="mt-5 rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-base font-semibold">Verificação por aplicativo autenticador</h2>
            <p className="mt-1 max-w-2xl text-sm theme-muted">
              Esta tela prepara o segredo do aplicativo autenticador por usuário. A validação do código, os códigos de recuperação
              e a exigência no login entram nas próximas sprints.
            </p>
          </div>
          <button
            type="button"
            onClick={startEnrollment}
            disabled={saving || loading}
            className="theme-button-primary h-10 rounded-md px-4 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Preparando..." : "Iniciar configuração"}
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <StatusPill enabled={Boolean(status?.featureEnabled)} label={status?.featureEnabled ? "Recurso ativo" : "Recurso inativo"} />
          <StatusPill enabled={Boolean(status?.enabled)} label={status?.enabled ? "Fator ativo" : "Fator pendente"} />
          <StatusPill enabled={Boolean(status?.enforced)} label={status?.enforced ? "Exigência ativa" : "Sem exigência"} />
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-black/20 p-4">
            <h3 className="text-sm font-semibold">Situação do usuário</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="theme-muted">Configuração</dt>
                <dd>{status?.enrolledAt ? formatDateTime(status.enrolledAt) : "Pendente"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="theme-muted">Último uso</dt>
                <dd>{status?.lastUsedAt ? formatDateTime(status.lastUsedAt) : "Nunca"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="theme-muted">Códigos de recuperação</dt>
                <dd>
                  {recoveryStatus?.configured
                    ? `${recoveryStatus.available}/${recoveryStatus.total}`
                    : status?.recoveryCodes.configured
                      ? `${status.recoveryCodes.unused}/${status.recoveryCodes.total}`
                      : "Não configurado"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/20 p-4">
            <h3 className="text-sm font-semibold">Configuração do autenticador</h3>
            {provisioning ? (
              <div className="mt-3 space-y-3 text-sm">
                <div>
                  <p className="theme-muted">Conta</p>
                  <p className="mt-1 font-medium">{provisioning.accountName}</p>
                </div>
                <div>
                  <p className="theme-muted">Segredo exibido uma vez nesta fase</p>
                  <code className="mt-1 block break-all rounded-md border border-white/10 bg-black/30 p-2 text-xs">
                    {provisioning.secret}
                  </code>
                </div>
                <div>
                  <p className="theme-muted">Conteúdo do QR Code</p>
                  <code className="mt-1 block max-h-28 overflow-auto break-all rounded-md border border-white/10 bg-black/30 p-2 text-xs">
                    {provisioning.otpauthUrl}
                  </code>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm theme-muted">
                Nenhum conteúdo gerado nesta sessão. Inicie a configuração para gerar o segredo protegido no backend.
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="text-sm font-semibold">Códigos de recuperação</h3>
              <p className="mt-1 text-sm theme-muted">
                Gere códigos de recuperação protegidos para reduzir risco de bloqueio futuro. Eles ainda não são usados no login nesta sprint.
              </p>
            </div>
            <button
              type="button"
              onClick={generateRecoveryCodes}
              disabled={generatingRecovery}
              className="theme-button-secondary h-10 rounded-md px-4 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {generatingRecovery
                ? "Gerando..."
                : recoveryStatus?.configured
                  ? "Regenerar códigos"
                  : "Gerar códigos"}
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Metric label="Disponiveis" value={recoveryStatus?.available ?? 0} />
            <Metric label="Usados" value={recoveryStatus?.used ?? 0} />
            <Metric label="Total" value={recoveryStatus?.total ?? 0} />
          </div>

          {recoveryCodes.length > 0 ? (
            <div className="mt-4 rounded-md border border-amber-300/20 bg-amber-500/10 p-4">
              <p className="text-sm font-semibold text-amber-100">Exibidos uma unica vez</p>
              <p className="mt-1 text-sm text-amber-100/75">
                Armazene estes códigos agora. Depois desta tela, apenas a situação será exibida.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {recoveryCodes.map((code) => (
                  <code key={code} className="rounded-md border border-white/10 bg-black/30 p-2 text-sm">
                    {code}
                  </code>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-4">
          <h3 className="text-sm font-semibold">Verificação em modo de simulação</h3>
          <p className="mt-1 text-sm theme-muted">
            O login continua normal. Esta leitura apenas informa se a verificação em duas etapas seria exigida pela política atual.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs uppercase tracking-[0.2em] theme-muted">Modo</p>
              <p className="mt-1 text-sm font-semibold">Simulação</p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs uppercase tracking-[0.2em] theme-muted">Seria exigido</p>
              <p className="mt-1 text-sm font-semibold">{runtimeStatus?.wouldRequireMfa ? "Sim" : "Não"}</p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs uppercase tracking-[0.2em] theme-muted">Motivo</p>
              <p className="mt-1 break-words text-sm font-semibold">
                {getMfaRuntimeReasonLabel(runtimeStatus?.reason)}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-4">
          <h3 className="text-sm font-semibold">Verificação simulada</h3>
          <p className="mt-1 text-sm theme-muted">
            Testa o código do aplicativo autenticador sem alterar login, sessão ou obrigatoriedade.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              value={shadowCode}
              onChange={(event) => {
                setShadowCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                setShadowResult(null);
              }}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className="h-10 w-full rounded-md border border-white/10 bg-black/30 px-3 text-sm outline-none transition focus:border-emerald-300/50 sm:w-40"
            />
            <button
              type="button"
              onClick={verifyShadowCode}
              disabled={verifying || shadowCode.length !== 6}
              className="theme-button-secondary h-10 rounded-md px-4 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {verifying ? "Verificando..." : "Verificar em modo teste"}
            </button>
            {shadowResult ? (
              <StatusPill enabled={shadowResult === "valid"} label={shadowResult === "valid" ? "Código válido" : "Código inválido"} />
            ) : null}
          </div>
        </div>
      </section>
        </>
      ) : (
        <section className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <h2 className="text-base font-semibold">Verificação em duas etapas</h2>
          <p className="mt-1 text-sm theme-muted">
            Este tenant ainda não usa a verificação por aplicativo autenticador. O acesso de suporte pode ser autorizado acima
            sem ativar essa configuração.
          </p>
        </section>
      )}
    </AppShell>
  );
}
