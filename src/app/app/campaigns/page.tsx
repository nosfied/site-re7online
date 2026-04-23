"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { buildReplayFormFromCampaign, getFriendlyCampaignError } from "@/lib/campaignDrafts";
import {
  AppTemplateItem,
  AppSession,
  cancelAppCampaign,
  clearAppSession,
  createAppCampaign,
  getAppCampaign,
  listAppCampaigns,
  listAppTemplates,
  loadAppSession,
  saveAppSession,
} from "@/lib/appClientApi";
import { CampaignItem, formatDateTime, normalizeWaIdList } from "@/lib/whatsappAdminApi";

type CampaignFormState = {
  name: string;
  templateId: string;
  templateName: string;
  templateVariables: string[];
  templateParamsInput: string;
  recipientsInput: string;
};

type CampaignStatusFilter =
  | "all"
  | "draft"
  | "sending"
  | "completed"
  | "blocked"
  | "cancelled"
  | "failed";

const EMPTY_FORM: CampaignFormState = {
  name: "",
  templateId: "",
  templateName: "",
  templateVariables: [],
  templateParamsInput: "",
  recipientsInput: "",
};

const PAGE_SIZE = 10;
const STATUS_FILTER_OPTIONS: CampaignStatusFilter[] = [
  "all",
  "draft",
  "sending",
  "completed",
  "blocked",
  "cancelled",
  "failed",
];

function normalizeTemplateParams(input: string) {
  return input
    .split(/\n+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function getTemplateVariableLabels(variables: unknown): string[] {
  if (!Array.isArray(variables)) return [];
  return variables
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (!item || typeof item !== "object" || Array.isArray(item)) return "";
      const typed = item as Record<string, unknown>;
      const raw =
        typeof typed.label === "string"
          ? typed.label
          : typeof typed.key === "string"
            ? typed.key
            : typeof typed.name === "string"
              ? typed.name
              : "";
      return raw.trim();
    })
    .filter(Boolean);
}

function syncTemplateVariables(values: string[], total: number) {
  return Array.from({ length: total }, (_, index) => values[index] ?? "");
}

function buildTemplatePreview(content: string, values: string[]) {
  return values.reduce(
    (acc, value, index) => acc.replaceAll(`{{${index + 1}}}`, value || `{{${index + 1}}}`),
    content
  );
}

function getStatusClasses(status: string) {
  switch (status) {
    case "sending":
      return "bg-amber-500/20 text-amber-200";
    case "completed":
      return "bg-emerald-500/20 text-emerald-200";
    case "blocked":
      return "bg-orange-500/20 text-orange-200";
    case "cancelled":
      return "bg-slate-500/20 text-slate-200";
    case "failed":
      return "bg-red-500/20 text-red-200";
    default:
      return "bg-white/10 text-white/80";
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case "sending":
      return "Enviando...";
    case "completed":
      return "Concluida";
    case "blocked":
      return "Bloqueada por limite";
    case "cancelled":
      return "Cancelada";
    case "failed":
      return "Erro";
    default:
      return status || "Status desconhecido";
  }
}

function formatRelativeTime(date: string) {
  const value = new Date(date).getTime();
  if (!Number.isFinite(value)) return formatDateTime(date);
  const diffSeconds = Math.max(Math.floor((Date.now() - value) / 1000), 0);
  if (diffSeconds < 60) return `ha ${diffSeconds} segundo${diffSeconds === 1 ? "" : "s"}`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `ha ${diffMinutes} minuto${diffMinutes === 1 ? "" : "s"}`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `ha ${diffHours} hora${diffHours === 1 ? "" : "s"}`;
  return formatDateTime(date);
}

function getProgressPct(campaign: CampaignItem) {
  if (!campaign.totalRecipients || campaign.totalRecipients <= 0) return 0;
  const completed = campaign.sentCount + campaign.blockedCount;
  return Math.max(0, Math.min(Math.round((completed / campaign.totalRecipients) * 100), 100));
}

function getMetaStatusClasses(status: string) {
  switch (status) {
    case "read":
      return "bg-emerald-500/20 text-emerald-200";
    case "delivered":
      return "bg-sky-500/20 text-sky-200";
    case "failed":
      return "bg-red-500/20 text-red-200";
    case "sent":
    default:
      return "bg-slate-500/20 text-slate-200";
  }
}

function getMetaStatusLabel(status: string) {
  switch (status) {
    case "read":
      return "Lida";
    case "delivered":
      return "Entregue";
    case "failed":
      return "Falha";
    case "sent":
    default:
      return "Enviada";
  }
}

function getCampaignConfidence(campaign: CampaignItem) {
  const totalRecipients = campaign.totalRecipients || 0;
  const metaSummary = campaign.metaSummary;
  const deliveredOrRead = (metaSummary?.totalDelivered ?? 0) + (metaSummary?.totalRead ?? 0);
  const failed = metaSummary?.totalFailed ?? 0;

  if (totalRecipients > 0 && failed >= totalRecipients) {
    return {
      label: "Falha na campanha",
      icon: "X",
      classes: "border-red-400/30 bg-red-900/30 text-red-100",
    };
  }
  if (totalRecipients > 0 && deliveredOrRead >= totalRecipients) {
    return {
      label: `Entregue para ${totalRecipients}/${totalRecipients} destinatarios`,
      icon: "OK",
      classes: "border-emerald-400/30 bg-emerald-900/20 text-emerald-100",
    };
  }
  return {
    label: "Entrega parcial",
    icon: "!",
    classes: "border-amber-400/30 bg-amber-900/20 text-amber-100",
  };
}

function formatBillingValue(value: boolean | null) {
  if (value === null) return "-";
  return value ? "sim" : "nao";
}

export default function AppCampaignsPage() {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [templates, setTemplates] = useState<AppTemplateItem[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignItem | null>(null);
  const [form, setForm] = useState<CampaignFormState>(EMPTY_FORM);
  const [statusFilter, setStatusFilter] = useState<CampaignStatusFilter>("all");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const handleUnauthorized = useCallback(() => {
    clearAppSession();
    router.replace("/app/login");
  }, [router]);

  useEffect(() => {
    const stored = loadAppSession();
    if (!stored?.token) {
      router.replace("/app/login");
      return;
    }
    setSession(stored);
    saveAppSession(stored);
  }, [router]);

  const refreshCampaigns = useCallback(
    async (activeSession: AppSession, keepSelectedId?: string | null) => {
      const response = await listAppCampaigns(activeSession, { limit: 100 });
      setCampaigns(response.items);
      const nextSelectedId =
        keepSelectedId && response.items.some((item) => item.id === keepSelectedId)
          ? keepSelectedId
          : response.items[0]?.id ?? null;
      setSelectedCampaignId(nextSelectedId);
      return response.items;
    },
    []
  );

  const refreshTemplates = useCallback(async (activeSession: AppSession) => {
    const response = await listAppTemplates(activeSession);
    const approvedTemplates = response.items.filter((item) => item.status === "approved");
    setTemplates(approvedTemplates);
    return approvedTemplates;
  }, []);

  const selectedTemplate = useMemo(
    () =>
      templates.find((item) => item.id === form.templateId) ??
      templates.find((item) => item.name === form.templateName) ??
      null,
    [form.templateId, form.templateName, templates]
  );

  const templateVariableLabels = useMemo(
    () => getTemplateVariableLabels(selectedTemplate?.variables),
    [selectedTemplate]
  );

  const templatePreview = useMemo(() => {
    if (!selectedTemplate?.content || templateVariableLabels.length === 0) return null;
    return buildTemplatePreview(selectedTemplate.content, form.templateVariables);
  }, [form.templateVariables, selectedTemplate, templateVariableLabels.length]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setLoadingList(true);
    setError(null);

    Promise.all([refreshCampaigns(session), refreshTemplates(session)])
      .catch((err: { status?: number; message?: string }) => {
        if (cancelled) return;
        if (err.status === 401) {
          handleUnauthorized();
          return;
        }
        setError(err.message || "Erro ao carregar campanhas.");
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });

    return () => {
      cancelled = true;
    };
  }, [handleUnauthorized, refreshCampaigns, refreshTemplates, session]);

  useEffect(() => {
    if (!form.templateName || form.templateId) return;
    const matchedTemplate = templates.find((item) => item.name === form.templateName);
    if (!matchedTemplate) return;
    setForm((prev) => ({
      ...prev,
      templateId: matchedTemplate.id,
      templateName: matchedTemplate.name,
      templateVariables: syncTemplateVariables(
        prev.templateVariables.length > 0
          ? prev.templateVariables
          : normalizeTemplateParams(prev.templateParamsInput),
        getTemplateVariableLabels(matchedTemplate.variables).length
      ),
    }));
  }, [form.templateId, form.templateName, templates]);

  useEffect(() => {
    if (!session || !selectedCampaignId) {
      setSelectedCampaign(null);
      setDetailError(null);
      return;
    }

    let cancelled = false;
    setLoadingDetail(true);
    setDetailError(null);

    getAppCampaign(session, selectedCampaignId)
      .then((response) => {
        if (cancelled) return;
        setSelectedCampaign(response.campaign);
        setCampaigns((prev) => prev.map((item) => (item.id === response.campaign.id ? response.campaign : item)));
      })
      .catch((err: { status?: number; message?: string }) => {
        if (cancelled) return;
        if (err.status === 401) {
          handleUnauthorized();
          return;
        }
        setDetailError(err.message || "Falha ao carregar detalhe da campanha.");
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });

    return () => {
      cancelled = true;
    };
  }, [handleUnauthorized, selectedCampaignId, session]);

  const shouldPoll = useMemo(() => {
    if (selectedCampaignId) {
      return selectedCampaign?.status === "sending";
    }
    return campaigns.some((item) => item.status === "sending");
  }, [campaigns, selectedCampaign?.status, selectedCampaignId]);

  const filteredCampaigns = useMemo(() => {
    const query = search.trim().toLowerCase();
    return campaigns
      .filter((campaign) => {
        const campaignName = (campaign.name || "").toLowerCase();
        const matchesStatus = statusFilter === "all" || campaign.status === statusFilter;
        const matchesSearch = !query || campaignName.includes(query);
        return matchesStatus && matchesSearch;
      })
      .sort((a, b) => {
        const aSending = a.status === "sending" ? 1 : 0;
        const bSending = b.status === "sending" ? 1 : 0;
        if (aSending !== bSending) return bSending - aSending;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [campaigns, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredCampaigns.length / PAGE_SIZE));

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const paginatedCampaigns = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredCampaigns.slice(start, start + PAGE_SIZE);
  }, [currentPage, filteredCampaigns]);

  useEffect(() => {
    if (!session || !shouldPoll) return;
    const interval = window.setInterval(async () => {
      try {
        if (selectedCampaignId) {
          const detail = await getAppCampaign(session, selectedCampaignId);
          setSelectedCampaign(detail.campaign);
          setCampaigns((prev) => prev.map((item) => (item.id === detail.campaign.id ? detail.campaign : item)));
        } else {
          await refreshCampaigns(session, null);
        }
      } catch (err) {
        if ((err as { status?: number }).status === 401) {
          handleUnauthorized();
        }
      }
    }, 3000);

    return () => window.clearInterval(interval);
  }, [handleUnauthorized, refreshCampaigns, selectedCampaignId, session, shouldPoll]);

  useEffect(() => {
    if (!selectedCampaignId || !selectedCampaign) return;
    setCampaigns((prev) => prev.map((item) => (item.id === selectedCampaign.id ? selectedCampaign : item)));
  }, [selectedCampaign, selectedCampaignId]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!session) return;
    const name = form.name.trim();
    const templateId = form.templateId.trim();
    const templateName = form.templateName.trim();
    const recipients = normalizeWaIdList(form.recipientsInput);
    const templateParams =
      templateVariableLabels.length > 0
        ? form.templateVariables.map((value) => value.trim())
        : normalizeTemplateParams(form.templateParamsInput);

    if (!name) {
      setFormError("Erro ao criar campanha: informe o nome da campanha.");
      return;
    }
    if (!templateId && !templateName) {
      setFormError("Erro ao criar campanha: selecione um template.");
      return;
    }
    if (recipients.length === 0) {
      setFormError("Erro ao criar campanha: informe ao menos um destinatario valido.");
      return;
    }

    setCreating(true);
    setFormError(null);
    setError(null);
    setToast(null);
    try {
      const created = await createAppCampaign(session, {
        name,
        ...(templateId ? { templateId } : {}),
        templateName,
        recipients,
        ...(templateParams.length > 0 ? { templateParams } : {}),
      });
      await refreshCampaigns(session, created.campaign.campaignId);
      if (created.campaign.campaignId) {
        const detail = await getAppCampaign(session, created.campaign.campaignId);
        setSelectedCampaign(detail.campaign);
      }
      setSelectedCampaignId(created.campaign.campaignId);
      setCurrentPage(1);
      setForm(EMPTY_FORM);
      setToast("Campanha criada com sucesso.");
      window.setTimeout(() => setToast(null), 3000);
    } catch (err) {
      const typed = err as { status?: number; message?: string };
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setFormError(typed.message || "Erro ao criar campanha. Verifique template e destinatarios.");
    } finally {
      setCreating(false);
    }
  };

  const handleCancelCampaign = async () => {
    if (!session || !selectedCampaign) return;
    if (!window.confirm("Tem certeza que deseja cancelar esta campanha?")) return;
    setCancelling(true);
    setDetailError(null);
    try {
      const response = await cancelAppCampaign(session, selectedCampaign.id);
      setSelectedCampaign(response.campaign);
      await refreshCampaigns(session, response.campaign.id);
      setToast("Campanha cancelada.");
      window.setTimeout(() => setToast(null), 3000);
    } catch (err) {
      const typed = err as { status?: number; message?: string };
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setDetailError(typed.message || "Erro ao cancelar campanha.");
    } finally {
      setCancelling(false);
    }
  };

  const handleReuseCampaign = (campaign: CampaignItem) => {
    const replayForm = buildReplayFormFromCampaign(campaign);
    setForm({
      templateId: "",
      templateVariables: normalizeTemplateParams(replayForm.templateParamsInput),
      ...replayForm,
    });
    setFormError(null);
    setToast("Formulario preenchido com os dados da campanha selecionada.");
    window.setTimeout(() => setToast(null), 3000);
  };

  if (!session) {
    return <main className="min-h-screen bg-re7-navy" />;
  }

  return (
    <AppShell session={session} title="Campanhas" subtitle="Crie campanhas e acompanhe o envio das mensagens em tempo real.">
      {error ? (
        <p className="rounded-md border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100">
          {error}
        </p>
      ) : null}
      {toast ? (
        <p className="rounded-md border border-emerald-400/30 bg-emerald-900/30 p-3 text-sm text-emerald-100">
          {toast}
        </p>
      ) : null}

      <section className="grid gap-4 xl:h-[calc(100vh-12rem)] xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col rounded-xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold">Criar campanha</h2>
          </div>
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
            <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-4">
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Nome</span>
              <input
                className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="campanha-marco-01"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Template</span>
              <select
                className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                value={form.templateId}
                disabled={templates.length === 0}
                onChange={(event) => {
                  const nextTemplateId = event.target.value;
                  const selectedTemplate = templates.find((item) => item.id === nextTemplateId) ?? null;
                  setForm((prev) => ({
                    ...prev,
                    templateId: nextTemplateId,
                    templateName: selectedTemplate?.name ?? "",
                    templateVariables: syncTemplateVariables(
                      prev.templateVariables,
                      getTemplateVariableLabels(selectedTemplate?.variables).length
                    ),
                  }));
                }}
              >
                <option value="">
                  {templates.length === 0
                    ? "Nenhum template aprovado disponivel"
                    : "Selecione um template aprovado"}
                </option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} - {template.category}
                  </option>
                ))}
              </select>
              {form.templateName && !form.templateId ? (
                <span className="text-xs text-amber-200">
                  Template reaproveitado de campanha antiga. Selecione o equivalente aprovado para vincular.
                </span>
              ) : null}
            </label>
            {templateVariableLabels.length > 0 ? (
              <div className="grid gap-3">
                <span className="text-sm text-white/70">Variaveis do template</span>
                {templateVariableLabels.map((label, index) => (
                  <label key={`${label}-${index}`} className="grid gap-1 text-sm">
                    <span className="text-white/70">{label}</span>
                    <input
                      className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                      value={form.templateVariables[index] ?? ""}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          templateVariables: prev.templateVariables.map((value, valueIndex) =>
                            valueIndex === index ? event.target.value : value
                          ),
                          templateParamsInput: syncTemplateVariables(
                            prev.templateVariables.map((value, valueIndex) =>
                              valueIndex === index ? event.target.value : value
                            ),
                            templateVariableLabels.length
                          ).join("\n"),
                        }))
                      }
                      placeholder={`Informe ${label.toLowerCase()}`}
                    />
                  </label>
                ))}
                {templatePreview ? (
                  <div className="rounded-md border border-white/10 bg-re7-navy/40 p-3 text-sm text-white/80">
                    <p className="mb-1 text-xs uppercase tracking-wide text-white/50">Preview</p>
                    <p>{templatePreview}</p>
                  </div>
                ) : null}
              </div>
            ) : (
              <label className="grid gap-1 text-sm">
                <span className="text-white/70">Template params (um por linha)</span>
                <textarea
                  className="min-h-24 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                  value={form.templateParamsInput}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, templateParamsInput: event.target.value }))
                  }
                  placeholder={"Cliente teste\nCampanha marco\nHoje 15h"}
                />
              </label>
            )}
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Recipients (um waId por linha)</span>
              <textarea
                className="min-h-32 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                value={form.recipientsInput}
                onChange={(event) => setForm((prev) => ({ ...prev, recipientsInput: event.target.value }))}
                placeholder={"558499049614\n558494786787"}
              />
            </label>
            {formError ? (
              <p className="rounded-md border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100">
                {formError}
              </p>
            ) : null}
            </div>
            <div className="border-t border-white/10 bg-re7-navy/30 p-4">
            <button
              type="submit"
              disabled={creating}
              className="w-full rounded-md bg-re7-orange px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? "Criando campanha..." : "Criar campanha"}
            </button>
            </div>
          </form>
        </aside>

        <div className="grid min-h-0 gap-4 xl:grid-rows-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-white/5">
            <div className="border-b border-white/10 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold">Campanhas</h2>
                <button
                  type="button"
                  onClick={() => session && refreshCampaigns(session, selectedCampaignId)}
                  className="rounded-md border border-white/20 px-3 py-1 text-xs text-white/80 hover:bg-white/10"
                >
                  Atualizar
                </button>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-[220px_1fr]">
                <label className="grid gap-1 text-sm">
                  <span className="text-white/70">Status</span>
                  <select
                    className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white"
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as CampaignStatusFilter)}
                  >
                    {STATUS_FILTER_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-white/70">Buscar por nome</span>
                  <input
                    className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="campanha-ui-vps"
                  />
                </label>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-white/10 text-left">
                <tr>
                  <th className="px-3 py-2">Replay</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Sent</th>
                  <th className="px-3 py-2">Total</th>
                  <th className="px-3 py-2">Template</th>
                  <th className="px-3 py-2">Criada em</th>
                </tr>
              </thead>
              <tbody>
                {loadingList ? (
                  <tr>
                    <td className="px-3 py-4 text-white/70" colSpan={7}>
                      Carregando campanhas...
                    </td>
                  </tr>
                ) : null}
                {!loadingList && filteredCampaigns.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-white/70" colSpan={7}>
                      {campaigns.length === 0
                        ? "Voce ainda nao criou nenhuma campanha."
                        : "Nenhuma campanha corresponde ao filtro."}
                    </td>
                  </tr>
                ) : null}
                {paginatedCampaigns.map((campaign) => {
                  const isSelected = campaign.id === selectedCampaignId;
                  const isSending = campaign.status === "sending";
                  return (
                    <tr
                      key={campaign.id}
                      className={`cursor-pointer border-t border-white/10 ${
                        isSelected
                          ? "bg-re7-sky/10"
                          : isSending
                            ? "bg-amber-500/10 hover:bg-amber-500/15"
                            : "hover:bg-white/5"
                      }`}
                      onClick={() => setSelectedCampaignId(campaign.id)}
                    >
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedCampaignId(campaign.id);
                            handleReuseCampaign(campaign);
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/20 text-sm text-white/80 hover:bg-white/10"
                          title="Reaproveitar campanha"
                          aria-label={`Reaproveitar campanha ${campaign.name || campaign.id}`}
                        >
                          ↺
                        </button>
                      </td>
                      <td className="px-3 py-2">{campaign.name || "(sem nome)"}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex w-fit rounded-full px-2 py-1 text-xs font-semibold ${getStatusClasses(campaign.status)}`}>
                            {campaign.status}
                          </span>
                          <span className="text-xs text-white/60">{getStatusLabel(campaign.status)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">{campaign.sentCount}</td>
                      <td className="px-3 py-2">{campaign.totalRecipients}</td>
                      <td className="px-3 py-2">{campaign.templateName || "(sem template)"}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          <span>{formatDateTime(campaign.createdAt)}</span>
                          <span className="text-xs text-white/60">{formatRelativeTime(campaign.createdAt)}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-sm">
              <p className="text-white/70">Pagina {currentPage} de {totalPages}</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  className="rounded-md border border-white/20 px-3 py-1 text-xs text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  className="rounded-md border border-white/20 px-3 py-1 text-xs text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Proximo
                </button>
              </div>
            </div>
          </section>

          <section className="flex min-h-0 flex-col rounded-xl border border-white/10 bg-white/5">
            <div className="border-b border-white/10 px-4 py-3">
              <h2 className="text-sm font-semibold">Detalhe da campanha</h2>
            </div>
            <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-4 text-sm">
              {!selectedCampaignId ? (
                <p className="text-white/70">Selecione uma campanha para ver o detalhe.</p>
              ) : null}
              {selectedCampaignId && loadingDetail ? (
                <p className="text-white/70">Carregando detalhe...</p>
              ) : null}
              {detailError ? (
                <p className="rounded-md border border-red-400/30 bg-red-900/30 p-3 text-red-100">
                  {detailError}
                </p>
              ) : null}
              {selectedCampaign ? (
                <>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-md border border-white/10 bg-white/5 p-3">
                      <p className="text-xs uppercase tracking-wide text-white/60">Status</p>
                      <p className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getStatusClasses(selectedCampaign.status)}`}>
                        {selectedCampaign.status}
                      </p>
                      <p className="mt-2 text-xs text-white/60">{getStatusLabel(selectedCampaign.status)}</p>
                    </div>
                    <div className="rounded-md border border-white/10 bg-white/5 p-3">
                      <p className="text-xs uppercase tracking-wide text-white/60">Sent</p>
                      <p className="mt-1 font-semibold">{selectedCampaign.sentCount}</p>
                    </div>
                    <div className="rounded-md border border-white/10 bg-white/5 p-3">
                      <p className="text-xs uppercase tracking-wide text-white/60">Blocked</p>
                      <p className="mt-1 font-semibold">{selectedCampaign.blockedCount}</p>
                    </div>
                    <div className="rounded-md border border-white/10 bg-white/5 p-3">
                      <p className="text-xs uppercase tracking-wide text-white/60">Pending</p>
                      <p className="mt-1 font-semibold">{selectedCampaign.progress.pendingCount}</p>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-md border border-white/10 bg-white/5 p-3">
                      <p className="text-xs uppercase tracking-wide text-white/60">Enviadas</p>
                      <p className="mt-1 font-semibold text-slate-100">{selectedCampaign.metaSummary?.totalSent ?? 0}</p>
                    </div>
                    <div className="rounded-md border border-white/10 bg-white/5 p-3">
                      <p className="text-xs uppercase tracking-wide text-white/60">Entregues</p>
                      <p className="mt-1 font-semibold text-sky-200">{selectedCampaign.metaSummary?.totalDelivered ?? 0}</p>
                    </div>
                    <div className="rounded-md border border-white/10 bg-white/5 p-3">
                      <p className="text-xs uppercase tracking-wide text-white/60">Lidas</p>
                      <p className="mt-1 font-semibold text-emerald-200">{selectedCampaign.metaSummary?.totalRead ?? 0}</p>
                    </div>
                    <div className="rounded-md border border-white/10 bg-white/5 p-3">
                      <p className="text-xs uppercase tracking-wide text-white/60">Falhas</p>
                      <p className="mt-1 font-semibold text-red-200">{selectedCampaign.metaSummary?.totalFailed ?? 0}</p>
                    </div>
                  </div>

                  <div className={`rounded-md border p-3 text-sm ${getCampaignConfidence(selectedCampaign).classes}`}>
                    <p className="font-semibold">{getCampaignConfidence(selectedCampaign).icon} {getCampaignConfidence(selectedCampaign).label}</p>
                  </div>

                  <div className="rounded-md border border-white/10 bg-white/5 p-3 text-sm text-white/70">
                    Status da campanha e baseado na confirmacao da Meta (sent, delivered, read).
                  </div>

                  <div className="rounded-md border border-white/10 bg-white/5 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs uppercase tracking-wide text-white/60">Progresso</p>
                      <p className="text-sm font-semibold">{getProgressPct(selectedCampaign)}%</p>
                    </div>
                    <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-re7-sky transition-all duration-300" style={{ width: `${getProgressPct(selectedCampaign)}%` }} />
                    </div>
                  </div>

                  <div className="grid gap-2 md:grid-cols-2">
                    <p><span className="text-white/70">Nome:</span> {selectedCampaign.name || "(sem nome)"}</p>
                    <p><span className="text-white/70">Template:</span> {selectedCampaign.templateName || "(sem template)"}</p>
                    <p><span className="text-white/70">Total recipients:</span> {selectedCampaign.totalRecipients}</p>
                    <p>
                      <span className="text-white/70">Atualizada em:</span> {formatDateTime(selectedCampaign.updatedAt)}
                      <span className="ml-2 text-xs text-white/60">({formatRelativeTime(selectedCampaign.updatedAt)})</span>
                    </p>
                    <p>
                      <span className="text-white/70">Criada em:</span> {formatDateTime(selectedCampaign.createdAt)}
                      <span className="ml-2 text-xs text-white/60">({formatRelativeTime(selectedCampaign.createdAt)})</span>
                    </p>
                  </div>

                  <div className="rounded-md border border-white/10 bg-white/5">
                    <div className="border-b border-white/10 px-4 py-3">
                      <h3 className="text-sm font-semibold">Status real por mensagem</h3>
                    </div>
                    {selectedCampaign.messagesMetaStatus?.length ? (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[780px] text-sm">
                          <thead className="bg-white/10 text-left">
                            <tr>
                              <th className="px-3 py-2">Telefone</th>
                              <th className="px-3 py-2">Status</th>
                              <th className="px-3 py-2">Categoria</th>
                              <th className="px-3 py-2">Cobranca</th>
                              <th className="px-3 py-2">Erro</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedCampaign.messagesMetaStatus.map((item, index) => (
                              <tr key={`${item.waId}-${item.conversationId ?? "conversation"}-${index}`} className="border-t border-white/10">
                                <td className="px-3 py-2 font-mono text-xs">{item.waId}</td>
                                <td className="px-3 py-2">
                                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getMetaStatusClasses(item.status)}`}>
                                    {getMetaStatusLabel(item.status)}
                                  </span>
                                </td>
                                <td className="px-3 py-2">{item.pricingCategory || "-"}</td>
                                <td className="px-3 py-2">{formatBillingValue(item.pricingBillable)}</td>
                                <td className="px-3 py-2 text-white/70">
                                  {getFriendlyCampaignError(item.error)?.summary || "-"}
                                  {getFriendlyCampaignError(item.error)?.detail ? (
                                    <div className="mt-1 text-xs text-white/50">
                                      {getFriendlyCampaignError(item.error)?.detail}
                                    </div>
                                  ) : null}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="px-4 py-3 text-sm text-white/70">Nenhum status detalhado da Meta disponivel ainda para esta campanha.</p>
                    )}
                  </div>

                  {selectedCampaign.status === "sending" ? (
                    <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-end border-t border-white/10 bg-re7-navy px-4 py-3">
                      <button
                        type="button"
                        disabled={cancelling}
                        onClick={handleCancelCampaign}
                        className="rounded-md border border-red-400/40 px-3 py-2 text-sm text-red-100 hover:bg-red-900/30 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {cancelling ? "Cancelando..." : "Cancelar campanha"}
                      </button>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </section>
        </div>
      </section>
    </AppShell>
  );
}
