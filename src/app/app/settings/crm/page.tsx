"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { FeedbackToast, usePausableFeedbackAutoDismiss } from "@/components/ui/FeedbackToast";
import {
  AppApiError,
  AppCrmCampaignRecipient,
  AppSession,
  clearAppSession,
  CrmBusinessStatusConfig,
  fetchAppCrmCampaignRecipients,
  fetchAppCrmSettings,
  loadAppSession,
  saveAppSession,
  updateAppCrmSettings,
} from "@/lib/appClientApi";
import { getAppErrorUxMessage } from "@/lib/appUxLabels";

const EMPTY_STATUS: CrmBusinessStatusConfig = {
  id: "",
  label: "",
  isActive: true,
  campaignEligible: false,
  description: "",
};

function canManageCrm(role: string) {
  const normalized = role.trim().toUpperCase();
  return normalized === "SUPERVISOR" || normalized === "ADMIN";
}

function normalizeStatusId(input: string) {
  return input
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function normalizeAppErrorMessage(error: AppApiError, fallback: string) {
  if (error.status === 403) return "Seu perfil não tem permissão para alterar definições do CRM.";
  if (error.status === 401) return "Sessão expirada. Faça login novamente.";
  return getAppErrorUxMessage({ status: error.status, errorCode: error.errorCode, message: error.message, fallback });
}

function formatCount(count: number | undefined) {
  return new Intl.NumberFormat("pt-BR").format(count ?? 0);
}

export default function AppCrmSettingsPage() {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [statuses, setStatuses] = useState<CrmBusinessStatusConfig[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [form, setForm] = useState<CrmBusinessStatusConfig>(EMPTY_STATUS);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [recipients, setRecipients] = useState<AppCrmCampaignRecipient[]>([]);
  const [statusSearch, setStatusSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive" | "campaign">("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preparing, setPreparing] = useState(false);
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

  const loadSettings = useCallback(async (activeSession: AppSession) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchAppCrmSettings(activeSession);
      setStatuses(response.settings.crmBusinessStatuses);
      setCounts(response.leadCountsByStatus ?? {});
      const campaignDefaults = response.settings.crmBusinessStatuses
        .filter((item) => item.isActive && item.campaignEligible)
        .map((item) => item.id);
      setSelectedStatuses(campaignDefaults);
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(normalizeAppErrorMessage(typed, "Não foi possível carregar definições do CRM."));
    } finally {
      setLoading(false);
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    const stored = loadAppSession();
    if (!stored) {
      router.replace("/app/login");
      return;
    }
    if (!canManageCrm(stored.user.role)) {
      router.replace("/app/inbox");
      return;
    }
    saveAppSession(stored);
    setSession(stored);
    void loadSettings(stored);
  }, [loadSettings, router]);

  const recipientNumbers = useMemo(
    () => recipients.map((item) => item.phone).join("\n"),
    [recipients]
  );

  const selectedCount = useMemo(
    () => selectedStatuses.reduce((total, status) => total + (counts[status] ?? 0), 0),
    [counts, selectedStatuses]
  );

  const activeCampaignStatuses = useMemo(
    () => statuses.filter((item) => item.isActive && item.campaignEligible),
    [statuses]
  );

  const filteredStatuses = useMemo(() => {
    const search = statusSearch.trim().toLowerCase();
    return statuses.filter((status) => {
      const matchesSearch =
        !search ||
        [status.id, status.label, status.description ?? ""].some((value) =>
          value.toLowerCase().includes(search)
        );
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && status.isActive) ||
        (statusFilter === "inactive" && !status.isActive) ||
        (statusFilter === "campaign" && status.campaignEligible);
      return matchesSearch && matchesStatus;
    });
  }, [statusFilter, statusSearch, statuses]);

  const resetForm = () => {
    setForm(EMPTY_STATUS);
  };

  const handleAddStatus = () => {
    const label = form.label.trim();
    const id = normalizeStatusId(form.id || label);
    if (!label || !id) {
      setError("Informe nome e chave da situacao.");
      return;
    }
    if (statuses.some((item) => item.id === id)) {
      setError("Ja existe uma situacao com essa chave.");
      return;
    }
    setStatuses((current) => [
      ...current,
      {
        id,
        label,
        isActive: form.isActive,
        campaignEligible: form.campaignEligible,
        ...(form.description?.trim() ? { description: form.description.trim() } : {}),
      },
    ]);
    resetForm();
    setSuccess("Situacao adicionada. Salve os ajustes para persistir.");
  };

  const patchStatus = (id: string, patch: Partial<CrmBusinessStatusConfig>) => {
    setStatuses((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const handleSave = async () => {
    if (!session) return;
    setSaving(true);
    setError(null);
    try {
      const payload = statuses.map((item) => ({
        id: normalizeStatusId(item.id || item.label),
        label: item.label.trim(),
        isActive: item.isActive,
        campaignEligible: item.campaignEligible,
        ...(item.description?.trim() ? { description: item.description.trim() } : {}),
      })).filter((item) => item.id && item.label);
      const response = await updateAppCrmSettings(session, { crmBusinessStatuses: payload });
      setStatuses(response.settings.crmBusinessStatuses);
      setSuccess("Definicoes do CRM salvas.");
      await loadSettings(session);
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(normalizeAppErrorMessage(typed, "Não foi possível salvar definições do CRM."));
    } finally {
      setSaving(false);
    }
  };

  const handlePrepareRecipients = async () => {
    if (!session) return;
    if (selectedStatuses.length === 0) {
      setError("Selecione ao menos uma situacao habilitada para campanhas.");
      return;
    }
    setPreparing(true);
    setError(null);
    try {
      const response = await fetchAppCrmCampaignRecipients(session, selectedStatuses, 2000);
      setRecipients(response.items);
      setSuccess(`${formatCount(response.count)} numero(s) preparado(s) para campanha.`);
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(normalizeAppErrorMessage(typed, "Não foi possível preparar os números."));
    } finally {
      setPreparing(false);
    }
  };

  const handleCopyRecipients = async () => {
    if (!recipientNumbers) return;
    await navigator.clipboard.writeText(recipientNumbers);
    setSuccess("Numeros copiados.");
  };

  if (!session) {
    return (
      <main className="theme-bg min-h-screen px-4 py-8 md:px-8">
        <div className="theme-surface mx-auto max-w-7xl rounded-xl border p-4">
          <p className="theme-muted text-sm">Carregando...</p>
        </div>
      </main>
    );
  }

  return (
    <AppShell
      session={session}
      title="CRM"
      subtitle="Defina situações do negócio e prepare contatos para novas campanhas."
    >
      <FeedbackToast message={success} variant="success" {...toastHandlers} />
      <FeedbackToast message={error} variant="error" {...toastHandlers} />

      <div className="crm-settings-theme grid gap-3 min-[1441px]:gap-4">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px] min-[1441px]:gap-4 min-[1441px]:xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="theme-surface rounded-xl border p-3 sm:p-4 min-[1441px]:rounded-2xl min-[1441px]:p-6">
          <div className="mb-3 flex flex-col gap-1.5 min-[1441px]:mb-5 min-[1441px]:gap-2">
            <span className="w-fit rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white/70 min-[1441px]:px-3 min-[1441px]:py-1 min-[1441px]:text-xs">
              Situação do negócio
            </span>
            <p className="theme-muted text-xs min-[1441px]:text-sm">
              Use estas situações para organizar contatos no CRM e selecionar bases para campanhas.
            </p>
          </div>

          <div className="grid min-w-0 gap-2 md:grid-cols-[minmax(0,1fr)_150px] min-[1441px]:gap-3 min-[1441px]:md:grid-cols-[minmax(0,1fr)_180px]">
            <label className="flex flex-col gap-1.5 text-xs text-white/75 min-[1441px]:gap-2 min-[1441px]:text-sm">
              <span>Nome da situação</span>
              <input
                value={form.label}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    label: event.target.value,
                    id: current.id || normalizeStatusId(event.target.value),
                  }))
                }
                placeholder="Ex: Reativar futuramente"
                className="theme-select w-full rounded-md px-2.5 py-1.5 text-xs outline-none min-[1441px]:px-3 min-[1441px]:py-2 min-[1441px]:text-sm"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs text-white/75 min-[1441px]:gap-2 min-[1441px]:text-sm">
              <span>Chave</span>
              <input
                value={form.id}
                onChange={(event) =>
                  setForm((current) => ({ ...current, id: normalizeStatusId(event.target.value) }))
                }
                placeholder="REATIVAR"
                className="theme-select w-full rounded-md px-2.5 py-1.5 text-xs font-mono outline-none min-[1441px]:px-3 min-[1441px]:py-2 min-[1441px]:text-sm"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs text-white/75 md:col-span-2 min-[1441px]:gap-2 min-[1441px]:text-sm">
              <span>Descrição operacional</span>
              <input
                value={form.description ?? ""}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
                placeholder="Quando usar esta situação no CRM."
                className="theme-select w-full rounded-md px-2.5 py-1.5 text-xs outline-none min-[1441px]:px-3 min-[1441px]:py-2 min-[1441px]:text-sm"
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 min-[1441px]:gap-3">
            <label className="inline-flex items-center gap-1.5 text-xs text-white/75 min-[1441px]:gap-2 min-[1441px]:text-sm">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) =>
                  setForm((current) => ({ ...current, isActive: event.target.checked }))
                }
              />
              Ativa
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs text-white/75 min-[1441px]:gap-2 min-[1441px]:text-sm">
              <input
                type="checkbox"
                checked={form.campaignEligible}
                onChange={(event) =>
                  setForm((current) => ({ ...current, campaignEligible: event.target.checked }))
                }
              />
              Pode entrar em campanha
            </label>
            <button
              type="button"
              onClick={handleAddStatus}
              className="rounded-md bg-re7-orange px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 min-[1441px]:px-4 min-[1441px]:py-2 min-[1441px]:text-sm"
            >
              Adicionar situação
            </button>
          </div>
        </section>

        <section className="theme-surface rounded-xl border p-3 sm:p-4 min-[1441px]:rounded-2xl min-[1441px]:p-6">
          <div className="mb-3 min-[1441px]:mb-4">
            <h2 className="text-base font-semibold min-[1441px]:text-lg">Preparar campanha</h2>
            <p className="theme-muted mt-0.5 text-xs min-[1441px]:mt-1 min-[1441px]:text-sm">
              Filtre contatos por situação e gere uma lista de números, um por linha.
            </p>
          </div>
          <div className="space-y-2">
            {activeCampaignStatuses.length === 0 ? (
              <p className="theme-muted rounded-xl border border-white/10 bg-white/5 p-2.5 text-xs min-[1441px]:p-3 min-[1441px]:text-sm">
                Nenhuma situação ativa está marcada para campanhas.
              </p>
            ) : (
              activeCampaignStatuses.map((status) => (
                <label
                  key={status.id}
                  className="theme-list-row theme-list-row-even flex items-center justify-between gap-2 rounded-xl border p-2.5 text-xs min-[1441px]:gap-3 min-[1441px]:p-3 min-[1441px]:text-sm"
                >
                  <span className="min-w-0">
                    <span className="block font-semibold">{status.label}</span>
                    <span className="theme-soft text-xs">{formatCount(counts[status.id])} contato(s)</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={selectedStatuses.includes(status.id)}
                    onChange={(event) =>
                      setSelectedStatuses((current) =>
                        event.target.checked
                          ? [...new Set([...current, status.id])]
                          : current.filter((item) => item !== status.id)
                      )
                    }
                  />
                </label>
              ))
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 min-[1441px]:mt-4">
            <p className="theme-muted text-xs min-[1441px]:text-sm">{formatCount(selectedCount)} contato(s) no filtro.</p>
            <button
              type="button"
              onClick={handlePrepareRecipients}
              disabled={preparing || selectedStatuses.length === 0}
              className="rounded-md bg-re7-sky px-3 py-1.5 text-xs font-semibold text-white hover:bg-re7-sky/90 disabled:cursor-not-allowed disabled:opacity-50 min-[1441px]:px-4 min-[1441px]:py-2 min-[1441px]:text-sm"
            >
              {preparing ? "Preparando..." : "Preparar numeros"}
            </button>
          </div>
          {recipients.length > 0 ? (
            <div className="mt-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">{formatCount(recipients.length)} numero(s)</p>
                <button
                  type="button"
                  onClick={handleCopyRecipients}
                  className="theme-nav-link rounded-md border px-3 py-1.5 text-xs font-semibold"
                >
                  Copiar lista
                </button>
              </div>
              <textarea
                readOnly
                value={recipientNumbers}
                className="theme-select min-h-48 w-full rounded-xl px-3 py-2 font-mono text-xs outline-none"
              />
            </div>
          ) : null}
        </section>
      </div>

      <section className="theme-surface mt-3 rounded-xl border p-3 sm:p-4 min-[1441px]:mt-4 min-[1441px]:rounded-2xl min-[1441px]:p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 min-[1441px]:mb-4 min-[1441px]:gap-3">
          <div>
            <h2 className="text-base font-semibold min-[1441px]:text-lg">Situacoes cadastradas</h2>
            <p className="theme-muted mt-0.5 text-xs min-[1441px]:mt-1 min-[1441px]:text-sm">
              Edite rotulos, habilite uso no CRM e marque o que pode virar base de campanha.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="rounded-md bg-re7-orange px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 min-[1441px]:px-4 min-[1441px]:py-2 min-[1441px]:text-sm"
          >
            {saving ? "Salvando..." : "Salvar ajustes"}
          </button>
        </div>

        <div className="settings-filter-panel mb-3 grid gap-2 rounded-xl border p-3 md:grid-cols-[minmax(0,1fr)_160px_auto] min-[1441px]:mb-4">
          <label className="grid gap-1 text-xs">
            <span className="theme-muted font-medium">Buscar</span>
            <input
              value={statusSearch}
              onChange={(event) => setStatusSearch(event.target.value)}
              placeholder="Nome, chave ou descrição"
              className="theme-select rounded-md px-3 py-2 text-sm outline-none"
            />
          </label>
          <label className="grid gap-1 text-xs">
            <span className="theme-muted font-medium">Filtro</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
              className="theme-select rounded-md px-3 py-2 text-sm outline-none"
            >
              <option value="all">Todas</option>
              <option value="active">Ativas</option>
              <option value="inactive">Inativas</option>
              <option value="campaign">Campanha</option>
            </select>
          </label>
          <div className="flex items-end justify-between gap-2 md:justify-end">
            <span className="theme-muted pb-2 text-xs">
              {filteredStatuses.length}/{statuses.length}
            </span>
            <button
              type="button"
              onClick={() => {
                setStatusSearch("");
                setStatusFilter("all");
              }}
              className="theme-nav-link rounded-md border px-3 py-2 text-xs font-semibold"
            >
              Limpar
            </button>
          </div>
        </div>

        {loading ? (
          <p className="theme-muted text-sm">Carregando situacoes...</p>
        ) : statuses.length === 0 ? (
          <p className="theme-muted text-sm">Nenhuma situacao cadastrada.</p>
        ) : filteredStatuses.length === 0 ? (
          <p className="theme-muted rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
            Nenhuma situação encontrada com os filtros atuais.
          </p>
        ) : (
          <div className="space-y-2 min-[1441px]:space-y-3">
            {filteredStatuses.map((status, index) => (
              <article
                key={status.id}
                className={`theme-list-row ${
                  index % 2 === 0 ? "theme-list-row-even" : "theme-list-row-odd"
                } rounded-xl border p-2.5 min-[1441px]:p-4`}
              >
                <div className="grid gap-2 lg:grid-cols-[130px_minmax(0,1fr)_minmax(0,1.2fr)_auto] lg:items-center min-[1441px]:gap-3 min-[1441px]:lg:grid-cols-[170px_minmax(0,1fr)_minmax(0,1.2fr)_auto]">
                  <div>
                    <p className="font-mono text-xs text-white/60">{status.id}</p>
                    <p className="theme-soft mt-1 text-xs">{formatCount(counts[status.id])} contato(s)</p>
                  </div>
                  <input
                    value={status.label}
                    onChange={(event) => patchStatus(status.id, { label: event.target.value })}
                    className="theme-select w-full rounded-md px-2.5 py-1.5 text-xs outline-none min-[1441px]:px-3 min-[1441px]:py-2 min-[1441px]:text-sm"
                  />
                  <input
                    value={status.description ?? ""}
                    onChange={(event) => patchStatus(status.id, { description: event.target.value })}
                    placeholder="Descricao"
                    className="theme-select w-full rounded-md px-2.5 py-1.5 text-xs outline-none min-[1441px]:px-3 min-[1441px]:py-2 min-[1441px]:text-sm"
                  />
                  <div className="flex flex-wrap items-center gap-2 text-xs min-[1441px]:gap-3 min-[1441px]:text-sm">
                    <label className="inline-flex items-center gap-1.5 text-white/75 min-[1441px]:gap-2">
                      <input
                        type="checkbox"
                        checked={status.isActive}
                        onChange={(event) => patchStatus(status.id, { isActive: event.target.checked })}
                      />
                      Ativa
                    </label>
                    <label className="inline-flex items-center gap-1.5 text-white/75 min-[1441px]:gap-2">
                      <input
                        type="checkbox"
                        checked={status.campaignEligible}
                        onChange={(event) =>
                          patchStatus(status.id, { campaignEligible: event.target.checked })
                        }
                      />
                      Campanha
                    </label>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      </div>
    </AppShell>
  );
}
