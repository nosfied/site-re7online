"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { FeedbackToast, usePausableFeedbackAutoDismiss } from "@/components/ui/FeedbackToast";
import {
  AppAgentSignatureSettings,
  AppApiError,
  AppSession,
  clearAppSession,
  fetchAppAgentSignatureSettings,
  loadAppSession,
  saveAppSession,
  updateAppAgentSignatureSettings,
} from "@/lib/appClientApi";
import { getAppErrorUxMessage } from "@/lib/appUxLabels";

function canAccessInboxSettings(role: string) {
  const normalized = role.trim().toUpperCase();
  return normalized === "SUPERVISOR" || normalized === "ADMIN";
}

function canManageInboxSettings(role: string) {
  const normalized = role.trim().toUpperCase();
  return normalized === "SUPERVISOR" || normalized === "ADMIN";
}

function getDefaultSettings(): AppAgentSignatureSettings {
  return {
    enabled: false,
    mode: "user_name",
    format: "bold_line",
  };
}

function normalizeSettingsError(error: AppApiError, fallback: string) {
  if (error.status === 401) return "Sessão expirada. Faça login novamente.";
  if (error.status === 403) return "Sem permissão para alterar configurações de atendimento.";
  return getAppErrorUxMessage({ ...error, fallback });
}

function SettingsBadge({ label, tone = "default" }: { label: string; tone?: "default" | "success" | "warning" }) {
  const className =
    tone === "success"
      ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-100"
      : tone === "warning"
        ? "border-amber-300/30 bg-amber-500/15 text-amber-100"
        : "border-white/15 bg-white/5 text-white/75";
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${className}`}>
      {label}
    </span>
  );
}

export default function AppSettingsInboxPage() {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [settings, setSettings] = useState<AppAgentSignatureSettings>(getDefaultSettings);
  const [canUpdate, setCanUpdate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleUnauthorized = useCallback(() => {
    clearAppSession();
    router.replace("/app/login");
  }, [router]);

  const applyResponse = useCallback((response: Awaited<ReturnType<typeof fetchAppAgentSignatureSettings>>) => {
    setSettings(response.settings);
    setCanUpdate(response.permissions.canUpdate);
  }, []);

  const loadSettings = useCallback(
    async (activeSession: AppSession) => {
      const response = await fetchAppAgentSignatureSettings(activeSession);
      applyResponse(response);
    },
    [applyResponse]
  );

  useEffect(() => {
    const stored = loadAppSession();
    if (!stored?.token) {
      router.replace("/app/login");
      return;
    }
    if (!canAccessInboxSettings(stored.user.role)) {
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
    loadSettings(session)
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
        setError(normalizeSettingsError(typed, "Não foi possível carregar as configurações de atendimento."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [handleUnauthorized, loadSettings, router, session]);

  const toastHandlers = usePausableFeedbackAutoDismiss(Boolean(error || success), () => {
    setError(null);
    setSuccess(null);
  });

  const readOnly = useMemo(() => !session || !canManageInboxSettings(session.user.role) || !canUpdate, [canUpdate, session]);

  const handleSave = async () => {
    if (!session || readOnly) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await updateAppAgentSignatureSettings(session, {
        enabled: settings.enabled,
        mode: "user_name",
        format: "bold_line",
      });
      applyResponse(response);
      setSuccess("Configuração de assinatura do atendente salva.");
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(normalizeSettingsError(typed, "Não foi possível salvar as configurações de atendimento."));
    } finally {
      setSaving(false);
    }
  };

  if (!session) {
    return (
      <main className="min-h-screen bg-re7-navy px-4 py-8 text-white md:px-8">
        <div className="mx-auto max-w-7xl rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm text-white/70">Carregando...</p>
        </div>
      </main>
    );
  }

  return (
    <AppShell
      session={session}
      title="Atendimento"
      subtitle="Configure como as mensagens humanas da caixa de entrada aparecem para o cliente."
    >
      <FeedbackToast message={success} {...toastHandlers} />
      <FeedbackToast message={error} variant="error" {...toastHandlers} />

      <section className="rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-re7-sky">Assinatura do atendente</p>
            <h2 className="mt-1 text-lg font-semibold text-white">Nome visível ao cliente</h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-white/65">
              Opcional por organização. Quando ativa, adiciona o nome profissional do atendente no início de mensagens
              humanas de texto e mensagens prontas enviadas pela caixa de entrada.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <SettingsBadge label={settings.enabled ? "Ativa" : "Desativada"} tone={settings.enabled ? "success" : "default"} />
            {readOnly ? <SettingsBadge label="Somente leitura" tone="warning" /> : null}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
        {loading ? (
          <p className="text-sm text-white/70">Carregando configuração...</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
            <div className="space-y-4">
              <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-re7-navy/50 px-3 py-3">
                <span>
                  <span className="block text-sm font-semibold text-white">Mostrar nome do atendente ao cliente</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-white/60">
                    Vale para mensagens humanas de texto e mensagens prontas. Modelos Meta, bot, automações e
                    campanhas não recebem assinatura nesta etapa.
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setSettings((current) => ({ ...current, enabled: !current.enabled }))}
                  disabled={readOnly || saving}
                  aria-pressed={settings.enabled}
                  aria-label={settings.enabled ? "Desativar assinatura do atendente" : "Ativar assinatura do atendente"}
                  className={`relative inline-flex h-7 w-14 shrink-0 items-center rounded-full border transition ${
                    settings.enabled
                      ? "border-emerald-400/40 bg-emerald-500/25"
                      : "border-white/20 bg-white/10"
                  } ${readOnly || saving ? "cursor-not-allowed opacity-50" : ""}`}
                >
                  <span
                    className={`inline-flex h-5 w-5 transform items-center justify-center rounded-full bg-white text-[9px] font-bold text-re7-navy transition ${
                      settings.enabled ? "translate-x-8" : "translate-x-1"
                    }`}
                  >
                    {settings.enabled ? "Sim" : "Não"}
                  </span>
                </button>
              </label>

              <div className="rounded-lg border border-white/10 bg-re7-navy/40 p-3 text-sm leading-relaxed text-white/68">
                <p className="font-semibold text-white">Escopo</p>
                <p className="mt-1">
                  A assinatura usa somente o nome cadastrado do atendente que enviou a mensagem. Não usa email,
                  cargo, telefone, organização técnica ou responsável atual da conversa.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                <button
                  type="button"
                  onClick={() => session && void loadSettings(session)}
                  disabled={saving}
                  className="rounded-md border border-white/15 px-3 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Atualizar
                </button>
                {readOnly ? (
                  <p className="text-xs text-white/55">Somente supervisores e administradores podem salvar alterações.</p>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={saving}
                    className="rounded-md bg-re7-orange px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? "Salvando..." : "Salvar configuração"}
                  </button>
                )}
              </div>
            </div>

            <aside className="space-y-3 rounded-lg border border-white/10 bg-re7-navy/45 p-3">
              <div>
                <h3 className="text-sm font-semibold text-white">Como o cliente verá</h3>
                <div className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-50 px-3 py-2 text-sm leading-relaxed text-slate-900">
                  <p className="font-semibold">*Maria*</p>
                  <p>Olá, como posso ajudar?</p>
                </div>
              </div>
              <div className="rounded-lg border border-amber-300/25 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-100">
                Nome de atendente é dado pessoal. Ative somente quando isso estiver alinhado com a política
                operacional da organização.
              </div>
            </aside>
          </div>
        )}
      </section>
    </AppShell>
  );
}
