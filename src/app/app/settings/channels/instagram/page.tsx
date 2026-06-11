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

function CapabilityPill({ value, label }: { value: "available" | "blocked" | "unknown"; label: string }) {
  return (
    <StatusPill
      label={`${label}: ${value === "available" ? "available" : value === "blocked" ? "blocked" : "unknown"}`}
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
        setError(typed.message || "Nao foi possivel carregar a conexao Instagram.");
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
      setSuccess("Instagram Business conectado. Valide a conexao para confirmar permissoes e capability.");
    }
    if (result === "error") {
      setError("A conexao Instagram nao foi concluida.");
    }
  }, [searchParams]);

  const handleConnect = useCallback(async () => {
    if (!session) return;
    setConnecting(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await startAppInstagramBusinessConnect(session);
      window.location.href = response.authUrl;
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(typed.message || "Nao foi possivel iniciar o login Instagram Business.");
      setConnecting(false);
    }
  }, [handleUnauthorized, session]);

  const handleValidate = useCallback(async () => {
    if (!session) return;
    setValidating(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await validateAppInstagramBusinessConnection(session);
      setValidation(response.validation);
      await loadStatus(session);
      if (response.validation.ok) {
        setSuccess("Instagram Business validado com sucesso.");
      } else {
        setError("A validacao encontrou pendencias. Veja os detalhes abaixo.");
      }
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(typed.message || "Nao foi possivel validar a conexao Instagram.");
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
      subtitle="Connect Instagram for review-ready messaging validation."
    >
      {error ? (
        <FeedbackToast
          message={error}
          variant="error"
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
                Meta Review Readiness
              </p>
              <h1 className="mt-2 text-2xl font-semibold text-white">Instagram Business Login</h1>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/70">
                Use this screen during App Review to show the reviewer how a business connects its
                Instagram account, grants permissions and validates the connection before receiving
                Direct messages in the Converta inbox.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleConnect}
                disabled={connecting || loading}
                className="rounded-md bg-re7-orange px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {connecting ? "Opening..." : "Connect Instagram Business"}
              </button>
              <button
                type="button"
                onClick={handleValidate}
                disabled={validating || loading}
                className="rounded-md border border-white/20 px-4 py-2 text-sm font-semibold text-white/90 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {validating ? "Validating..." : "Validate connection"}
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Connection</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusPill
                label={`token ${status?.tokenStatus ?? "loading"}`}
                tone={getTokenTone(status?.tokenStatus)}
              />
              <StatusPill
                label={status?.enabled ? "enabled" : "disabled"}
                tone={status?.enabled ? "success" : "warning"}
              />
              <StatusPill label="outbound disabled" tone="warning" />
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Account</p>
            <p className="mt-3 text-lg font-semibold text-white">{status?.username ? `@${status.username}` : "Not confirmed"}</p>
            <p className="mt-1 break-all font-mono text-xs text-white/55">{status?.channelAccountId || "-"}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Review scopes</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusPill label="instagram_business_basic" />
              <StatusPill label="instagram_business_manage_messages" />
              <StatusPill label="instagram_business_manage_comments" />
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          <DetailRow label="Redirect URI for Meta panel" value={redirectUri} />
          <DetailRow label="Webhook callback" value="https://converta.re7online.com/agent-api/meta/webhook" />
          <DetailRow label="Webhook actor alias" value={status?.externalAccountIds?.join(", ")} />
          <DetailRow label="Facebook Page ID" value={status?.facebookPageId} />
        </section>

        {validation ? (
          <section className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Validation result</h2>
                <p className="mt-1 text-sm text-white/60">Checked at {validation.checkedAt}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusPill label={validation.ok ? "ready" : "pending"} tone={validation.ok ? "success" : "warning"} />
                <CapabilityPill label="conversations" value={validation.capabilities.conversations} />
                <CapabilityPill label="messages" value={validation.capabilities.messages} />
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-re7-navy/50 p-3">
                <p className="text-sm font-semibold text-white">Granted scopes</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {validation.grantedScopes.length ? (
                    validation.grantedScopes.map((scope) => <StatusPill key={scope} label={scope} tone="success" />)
                  ) : (
                    <p className="text-sm text-white/55">No scopes returned.</p>
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-re7-navy/50 p-3">
                <p className="text-sm font-semibold text-white">Missing scopes</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {validation.missingScopes.length ? (
                    validation.missingScopes.map((scope) => <StatusPill key={scope} label={scope} tone="danger" />)
                  ) : (
                    <StatusPill label="none" tone="success" />
                  )}
                </div>
              </div>
            </div>

            {validation.errors.length ? (
              <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-500/10 p-3">
                <p className="text-sm font-semibold text-amber-100">Pending items</p>
                <ul className="mt-2 space-y-2 text-sm text-amber-50/85">
                  {validation.errors.map((item, index) => (
                    <li key={`${item.stage}-${index}`}>
                      <span className="font-semibold">{item.stage}:</span> {item.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="text-lg font-semibold text-white">Reviewer script</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-white/70">
            <li>Log in to Converta.</li>
            <li>Open Settings, Channels, Instagram Business.</li>
            <li>Click Connect Instagram Business.</li>
            <li>Grant Instagram permissions in Meta Business Login.</li>
            <li>Return to this page and validate the connection.</li>
            <li>Send a real Instagram Direct message to confirm webhook payload and inbox persistence.</li>
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
