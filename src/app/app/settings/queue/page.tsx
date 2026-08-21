"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { FeedbackToast, usePausableFeedbackAutoDismiss } from "@/components/ui/FeedbackToast";
import {
  AppApiError,
  AppQueueAssignmentPolicy,
  AppSession,
  clearAppSession,
  fetchAppQueueAssignmentSettings,
  loadAppSession,
  saveAppSession,
  updateAppQueueAssignmentSettings,
} from "@/lib/appClientApi";
import {
  getAppErrorUxMessage,
  getQueueAssignmentModeUxLabel,
  getQueueAssignmentScopeUxLabel,
} from "@/lib/appUxLabels";

function canAccessQueueSettings(role: string) {
  const normalized = role.trim().toUpperCase();
  return normalized === "SUPERVISOR" || normalized === "ADMIN";
}

function canManageQueueSettings(role: string) {
  const normalized = role.trim().toUpperCase();
  return normalized === "ADMIN";
}

function getDefaultPolicy(): AppQueueAssignmentPolicy {
  return {
    enabled: false,
    mode: "manual",
    scope: "department",
    maxActivePerAgent: null,
    includeSupervisors: true,
    requireOnline: false,
    notifyAssignedOnly: false,
  };
}

function normalizeQueueSettingsError(error: AppApiError, fallback: string) {
  if (error.status === 401) return "Sessão expirada. Faça login novamente.";
  if (error.status === 403) return "Sem permissão para alterar a distribuição de atendimentos.";
  if (error.errorCode === "invalid_assignment_mode") return "Selecione um modo automático válido.";
  if (error.errorCode === "invalid_assignment_scope") return "Selecione um escopo válido.";
  if (error.errorCode === "invalid_max_active") return "O limite por atendente deve ser um inteiro positivo.";
  return getAppErrorUxMessage({ ...error, fallback });
}

function PolicyBadge({ label, tone = "default" }: { label: string; tone?: "default" | "success" | "warning" }) {
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

export default function AppSettingsQueuePage() {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [policy, setPolicy] = useState<AppQueueAssignmentPolicy>(getDefaultPolicy);
  const [maxActiveDraft, setMaxActiveDraft] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [canUpdate, setCanUpdate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleUnauthorized = useCallback(() => {
    clearAppSession();
    router.replace("/app/login");
  }, [router]);

  const applyResponse = useCallback((response: Awaited<ReturnType<typeof fetchAppQueueAssignmentSettings>>) => {
    setPolicy(response.policy);
    setMaxActiveDraft(response.policy.maxActivePerAgent === null ? "" : String(response.policy.maxActivePerAgent));
    setWarnings(response.warnings);
    setCanUpdate(response.permissions.canUpdate);
  }, []);

  const loadSettings = useCallback(
    async (activeSession: AppSession) => {
      const response = await fetchAppQueueAssignmentSettings(activeSession);
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
    if (!canAccessQueueSettings(stored.user.role)) {
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
        setError(normalizeQueueSettingsError(typed, "Não foi possível carregar a configuração de distribuição."));
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

  const readOnly = useMemo(() => !session || !canManageQueueSettings(session.user.role) || !canUpdate, [canUpdate, session]);
  const effectiveModeLabel = policy.enabled
    ? getQueueAssignmentModeUxLabel(policy.mode)
    : "Manual";

  const updatePolicy = (patch: Partial<AppQueueAssignmentPolicy>) => {
    setPolicy((current) => {
      const next = { ...current, ...patch };
      if (patch.enabled === false) {
        next.mode = "manual";
      }
      if (patch.enabled === true && next.mode === "manual") {
        next.mode = "round_robin";
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!session || readOnly) return;
    const trimmedLimit = maxActiveDraft.trim();
    let maxActivePerAgent: number | null = null;
    if (trimmedLimit) {
      const parsed = Number(trimmedLimit);
      if (!Number.isInteger(parsed) || parsed < 1) {
        setError("O limite por atendente deve ser um inteiro positivo.");
        return;
      }
      maxActivePerAgent = parsed;
    }
    const payload: AppQueueAssignmentPolicy = {
      ...policy,
      mode: policy.enabled ? policy.mode : "manual",
      maxActivePerAgent,
    };
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await updateAppQueueAssignmentSettings(session, payload);
      applyResponse(response);
      setSuccess("Configuração de distribuição de atendimentos salva.");
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(normalizeQueueSettingsError(typed, "Não foi possível salvar a configuração de distribuição."));
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
      title="Distribuição de atendimentos"
      subtitle="Configure como novas conversas podem ser distribuídas sem alterar assumir atendimento, transferência ou fechamento."
    >
      <FeedbackToast message={success} {...toastHandlers} />
      <FeedbackToast message={error} variant="error" {...toastHandlers} />

      <section className="rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-re7-sky">Preferência operacional</p>
            <h2 className="mt-1 text-lg font-semibold text-white">Fila da organização</h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-white/65">
              Esta configuração é por organização e não afeta outros clientes. Com a política desativada, o atendimento
              permanece manual e os operadores continuam usando assumir, liberar e transferir conversa.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <PolicyBadge label={effectiveModeLabel} tone={policy.enabled ? "success" : "default"} />
            <PolicyBadge label={getQueueAssignmentScopeUxLabel(policy.scope)} />
            {readOnly ? <PolicyBadge label="Somente leitura" tone="warning" /> : null}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
        {loading ? (
          <p className="text-sm text-white/70">Carregando configuração...</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
            <div className="space-y-4">
              <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-re7-navy/50 px-3 py-3">
                <span>
                  <span className="block text-sm font-semibold text-white">Distribuição automática</span>
                  <span className="mt-0.5 block text-xs text-white/60">
                    Quando ativa, novas conversas elegíveis podem ser atribuídas a atendentes da mesma organização.
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => updatePolicy({ enabled: !policy.enabled })}
                  disabled={readOnly || saving}
                  aria-pressed={policy.enabled}
                  aria-label={policy.enabled ? "Desativar distribuição automática" : "Ativar distribuição automática"}
                  className={`relative inline-flex h-7 w-14 shrink-0 items-center rounded-full border transition ${
                    policy.enabled
                      ? "border-emerald-400/40 bg-emerald-500/25"
                      : "border-white/20 bg-white/10"
                  } ${readOnly || saving ? "cursor-not-allowed opacity-50" : ""}`}
                >
                  <span
                    className={`inline-flex h-5 w-5 transform items-center justify-center rounded-full bg-white text-[9px] font-bold text-re7-navy transition ${
                      policy.enabled ? "translate-x-8" : "translate-x-1"
                    }`}
                  >
                    {policy.enabled ? "Sim" : "Não"}
                  </span>
                </button>
              </label>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm text-white/75">
                  <span>Modo</span>
                  <select
                    value={policy.enabled ? policy.mode : "manual"}
                    onChange={(event) =>
                      updatePolicy({ mode: event.target.value as AppQueueAssignmentPolicy["mode"] })
                    }
                    disabled={readOnly || saving || !policy.enabled}
                    className="rounded-md border border-white/15 bg-re7-navy px-2.5 py-2 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-60 [&>option]:bg-re7-navy"
                  >
                    <option value="manual">Manual</option>
                    <option value="round_robin">Distribuição alternada</option>
                    <option value="least_active">Menor carga</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1.5 text-sm text-white/75">
                  <span>Escopo</span>
                  <select
                    value={policy.scope}
                    onChange={(event) =>
                      updatePolicy({ scope: event.target.value as AppQueueAssignmentPolicy["scope"] })
                    }
                    disabled={readOnly || saving || !policy.enabled}
                    className="rounded-md border border-white/15 bg-re7-navy px-2.5 py-2 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-60 [&>option]:bg-re7-navy"
                  >
                    <option value="department">Respeitar setor</option>
                    <option value="tenant">Organização inteira</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1.5 text-sm text-white/75">
                  <span>Máximo ativo por atendente</span>
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={maxActiveDraft}
                    onChange={(event) => setMaxActiveDraft(event.target.value)}
                    placeholder="Sem limite"
                    disabled={readOnly || saving || !policy.enabled}
                    className="rounded-md border border-white/15 bg-re7-navy px-2.5 py-2 text-sm text-white outline-none placeholder:text-white/35 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>

                <div className="rounded-lg border border-white/10 bg-re7-navy/40 p-3 text-xs leading-relaxed text-white/60">
                  O limite considera conversas em atendimento ou aguardando com responsável atribuído no mesmo
                  escopo configurado.
                </div>
              </div>

              <div className="grid gap-2">
                {[
                  {
                    key: "includeSupervisors",
                    label: "Incluir supervisores elegíveis",
                    help: "Supervisores ativos da organização podem receber conversas quando estiverem no escopo.",
                  },
                  {
                    key: "requireOnline",
                    label: "Exigir atendente online",
                    help: "Sem confirmação confiável de presença online, esta opção mantém a distribuição automática sem atendentes elegíveis.",
                  },
                  {
                    key: "notifyAssignedOnly",
                    label: "Notificar apenas o responsável",
                    help: "Preferência operacional para notificações futuras; não altera a visibilidade da caixa de entrada nesta etapa.",
                  },
                ].map((item) => (
                  <label
                    key={item.key}
                    className="flex items-start gap-3 rounded-lg border border-white/10 bg-re7-navy/35 px-3 py-2.5"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(policy[item.key as keyof AppQueueAssignmentPolicy])}
                      onChange={(event) =>
                        updatePolicy({ [item.key]: event.target.checked } as Partial<AppQueueAssignmentPolicy>)
                      }
                      disabled={readOnly || saving || !policy.enabled}
                      className="mt-0.5 h-4 w-4 rounded border-white/30 bg-re7-navy text-re7-sky disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-white">{item.label}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-white/58">{item.help}</span>
                    </span>
                  </label>
                ))}
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
                  <p className="text-xs text-white/55">Somente administradores podem alterar a configuração das filas.</p>
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
                <h3 className="text-sm font-semibold text-white">Comportamento atual</h3>
                <p className="mt-1 text-xs leading-relaxed text-white/62">
                  Conversa continua sendo a unidade principal. A configuração usa os estados atuais de fila,
                  responsável, setor, assumir atendimento e transferência.
                </p>
              </div>
              <div className="grid gap-2 text-xs text-white/65">
                <div className="rounded-md border border-white/10 bg-white/5 p-2">
                  <span className="font-semibold text-white">Modo efetivo:</span> {effectiveModeLabel}
                </div>
                <div className="rounded-md border border-white/10 bg-white/5 p-2">
                  <span className="font-semibold text-white">Escopo:</span>{" "}
                  {policy.scope === "department" ? "setor da conversa" : "organização inteira"}
                </div>
                <div className="rounded-md border border-white/10 bg-white/5 p-2">
                  <span className="font-semibold text-white">Limite:</span>{" "}
                  {policy.maxActivePerAgent === null ? "sem limite configurado" : `${policy.maxActivePerAgent} por atendente`}
                </div>
              </div>
              {warnings.length > 0 ? (
                <div className="rounded-lg border border-amber-300/25 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-100">
                  {warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              ) : null}
            </aside>
          </div>
        )}
      </section>
    </AppShell>
  );
}
