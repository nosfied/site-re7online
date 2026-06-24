"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { FeedbackToast, usePausableFeedbackAutoDismiss } from "@/components/ui/FeedbackToast";
import {
  AppApiError,
  AppMfaProvisioning,
  AppMfaStatus,
  AppSession,
  clearAppSession,
  fetchAppMfaStatus,
  loadAppSession,
  saveAppSession,
  startAppMfaEnrollment,
  verifyAppMfaShadow,
} from "@/lib/appClientApi";
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

export default function SecuritySettingsPage() {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [status, setStatus] = useState<AppMfaStatus | null>(null);
  const [provisioning, setProvisioning] = useState<AppMfaProvisioning | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
        const response = await fetchAppMfaStatus(activeSession);
        setStatus(response.status);
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
        setError(typed.message || "Nao foi possivel carregar seguranca.");
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
    if (!canManageSecurity(stored.user.role) || !stored.features.mfa) {
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
      setSuccess("Enrollment TOTP preparado.");
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(typed.message || "Nao foi possivel iniciar enrollment MFA.");
    } finally {
      setSaving(false);
    }
  };

  const verifyShadowCode = async () => {
    if (!session) return;
    const code = shadowCode.replace(/\D/g, "").slice(0, 6);
    if (code.length !== 6) {
      setError("Informe um codigo TOTP de 6 digitos.");
      return;
    }
    setVerifying(true);
    setError(null);
    setSuccess(null);
    setShadowResult(null);
    try {
      const response = await verifyAppMfaShadow(session, code);
      setShadowResult(response.status);
      setSuccess(response.valid ? "Codigo valido em modo teste." : "Codigo invalido em modo teste.");
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(typed.message || "Nao foi possivel validar o codigo em modo teste.");
    } finally {
      setVerifying(false);
    }
  };

  const metrics = useMemo(() => {
    return {
      feature: status?.featureEnabled ? "Ativa" : "Inativa",
      enrolled: status?.enrolled ? "Sim" : "Nao",
      required: status?.required ? "Sim" : "Nao",
      recovery: status?.recoveryCodes.unused ?? 0,
    };
  }, [status]);

  if (!session) return null;

  return (
    <AppShell
      session={session}
      title="Seguranca"
      subtitle="Fundacao MFA/TOTP para usuarios internos. O login ainda nao exige MFA nesta fase."
    >
      {error ? <FeedbackToast variant="error" message={error} {...toastHandlers} /> : null}
      {success ? <FeedbackToast variant="success" message={success} {...toastHandlers} /> : null}

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="MFA" value={metrics.feature} />
        <Metric label="Enrollment" value={metrics.enrolled} />
        <Metric label="Obrigatorio" value={metrics.required} />
        <Metric label="Recovery disponiveis" value={metrics.recovery} />
      </section>

      <section className="mt-5 rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-base font-semibold">MFA por autenticador</h2>
            <p className="mt-1 max-w-2xl text-sm theme-muted">
              Esta tela prepara o segredo TOTP por usuario. A validacao do codigo, recovery codes e enforcement de login
              entram nas proximas sprints.
            </p>
          </div>
          <button
            type="button"
            onClick={startEnrollment}
            disabled={saving || loading}
            className="theme-button-primary h-10 rounded-md px-4 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Preparando..." : "Iniciar enrollment"}
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <StatusPill enabled={Boolean(status?.featureEnabled)} label={status?.featureEnabled ? "Feature ativa" : "Feature inativa"} />
          <StatusPill enabled={Boolean(status?.enabled)} label={status?.enabled ? "Fator ativo" : "Fator pendente"} />
          <StatusPill enabled={Boolean(status?.enforced)} label={status?.enforced ? "Enforcement ativo" : "Sem enforcement"} />
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-black/20 p-4">
            <h3 className="text-sm font-semibold">Status do usuario</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="theme-muted">Enrollment</dt>
                <dd>{status?.enrolledAt ? formatDateTime(status.enrolledAt) : "Pendente"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="theme-muted">Ultimo uso</dt>
                <dd>{status?.lastUsedAt ? formatDateTime(status.lastUsedAt) : "Nunca"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="theme-muted">Recovery codes</dt>
                <dd>{status?.recoveryCodes.configured ? `${status.recoveryCodes.unused}/${status.recoveryCodes.total}` : "Placeholder"}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/20 p-4">
            <h3 className="text-sm font-semibold">Provisioning TOTP</h3>
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
                  <p className="theme-muted">Payload QR</p>
                  <code className="mt-1 block max-h-28 overflow-auto break-all rounded-md border border-white/10 bg-black/30 p-2 text-xs">
                    {provisioning.otpauthUrl}
                  </code>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm theme-muted">
                Nenhum payload gerado nesta sessao. Inicie o enrollment para gerar o segredo criptografado no backend.
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-4">
          <h3 className="text-sm font-semibold">Verificacao shadow</h3>
          <p className="mt-1 text-sm theme-muted">
            Testa o codigo TOTP sem alterar login, sessao ou obrigatoriedade de MFA.
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
              <StatusPill enabled={shadowResult === "valid"} label={shadowResult === "valid" ? "Codigo valido" : "Codigo invalido"} />
            ) : null}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
