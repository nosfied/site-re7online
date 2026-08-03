"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { buildReplayFormFromCampaign, getFriendlyCampaignError } from "@/lib/campaignDrafts";
import {
  AppCampaignAudiencePreviewResponse,
  AppTemplateItem,
  AppSession,
  cancelAppCampaign,
  clearAppSession,
  createAppCampaign,
  createAppCampaignDraft,
  discardAppCampaignDraft,
  exportAppCampaignConsumptionCsv,
  fetchAppCampaignAudiencePreview,
  getAppCampaign,
  listAppCampaigns,
  listAppTemplates,
  loadAppSession,
  saveAppSession,
  sendAppCampaignDraft,
} from "@/lib/appClientApi";
import { CampaignItem, formatDateTime, normalizeWaIdList } from "@/lib/whatsappAdminApi";

type CampaignFormState = {
  name: string;
  templateId: string;
  templateName: string;
  templateVariables: string[];
  templateParamsInput: string;
  templateVariableMappings: TemplateVariableMappingFormState[];
  recipientsInput: string;
};

type TemplateVariableSource = "" | "contact.displayName" | "lead.companyName" | "lead.city" | "fixed";

type TemplateVariableMappingFormState = {
  position: string;
  source: TemplateVariableSource;
  value: string;
  fallback: string;
};

type CampaignStatusFilter =
  | "all"
  | "draft"
  | "sending"
  | "completed"
  | "blocked"
  | "cancelled"
  | "failed";

type CampaignCenterTab = "create" | "drafts" | "sent" | "blocked" | "all";

type CampaignToastTone = "success" | "warning" | "error" | "info";

type CampaignToast = {
  tone: CampaignToastTone;
  title: string;
  message: string;
};

type AudiencePreviewFilters = {
  q: string;
  status: string;
  channel: string;
  hasConversation: "all" | "true" | "false";
  optOut: "all" | "true" | "false";
};

const EMPTY_FORM: CampaignFormState = {
  name: "",
  templateId: "",
  templateName: "",
  templateVariables: [],
  templateParamsInput: "",
  templateVariableMappings: [],
  recipientsInput: "",
};

const EMPTY_AUDIENCE_FILTERS: AudiencePreviewFilters = {
  q: "",
  status: "",
  channel: "all",
  hasConversation: "all",
  optOut: "all",
};

const PAGE_SIZE = 5;
const STATUS_FILTER_OPTIONS: CampaignStatusFilter[] = [
  "all",
  "draft",
  "sending",
  "completed",
  "blocked",
  "cancelled",
  "failed",
];

const CAMPAIGN_CENTER_TABS: Array<{ id: CampaignCenterTab; label: string }> = [
  { id: "create", label: "Criar campanha" },
  { id: "drafts", label: "Rascunhos" },
  { id: "sent", label: "Enviadas" },
  { id: "blocked", label: "Bloqueadas/Falhas" },
  { id: "all", label: "Todas" },
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

function getTemplateVariablePositions(template: AppTemplateItem | null) {
  const contentPositions = Array.from(
    new Set(
      Array.from(String(template?.content ?? "").matchAll(/{{\s*([^}\s]+)\s*}}/g))
        .map((match) => match[1]?.trim() ?? "")
        .filter(Boolean)
    )
  );
  if (contentPositions.length > 0) {
    return contentPositions.sort((left, right) => {
      const leftNumber = Number(left);
      const rightNumber = Number(right);
      if (Number.isInteger(leftNumber) && Number.isInteger(rightNumber)) {
        return leftNumber - rightNumber;
      }
      return left.localeCompare(right);
    });
  }
  return getTemplateVariableLabels(template?.variables);
}

function syncTemplateVariableMappings(
  previous: TemplateVariableMappingFormState[],
  positions: string[]
): TemplateVariableMappingFormState[] {
  return positions.map((position) => {
    const existing = previous.find((item) => item.position === position);
    return {
      position,
      source: existing?.source ?? "",
      value: existing?.value ?? "",
      fallback: existing?.fallback ?? "",
    };
  });
}

function getVariableSourceLabel(source: TemplateVariableSource) {
  switch (source) {
    case "contact.displayName":
      return "Nome do contato";
    case "lead.companyName":
      return "Empresa";
    case "lead.city":
      return "Cidade";
    case "fixed":
      return "Valor fixo/manual";
    default:
      return "Selecione";
  }
}

function getIllustrativeVariableValue(mapping: TemplateVariableMappingFormState) {
  if (mapping.source === "fixed") return mapping.value.trim();
  if (mapping.fallback.trim()) return mapping.fallback.trim();
  switch (mapping.source) {
    case "contact.displayName":
      return "Maria";
    case "lead.companyName":
      return "Empresa Exemplo";
    case "lead.city":
      return "Natal";
    default:
      return "";
  }
}

function buildTemplatePreviewFromMappings(content: string, mappings: TemplateVariableMappingFormState[]) {
  return mappings.reduce((acc, mapping) => {
    const value = getIllustrativeVariableValue(mapping) || `{{${mapping.position}}}`;
    return acc.replace(new RegExp(`{{\\s*${mapping.position}\\s*}}`, "g"), value);
  }, content);
}

function buildTemplateVariableMappingsPayload(mappings: TemplateVariableMappingFormState[]) {
  return mappings.map((mapping) => ({
    position: mapping.position,
    source: mapping.source,
    ...(mapping.source === "fixed" ? { value: mapping.value.trim() } : {}),
    ...(mapping.fallback.trim() ? { fallback: mapping.fallback.trim() } : {}),
  }));
}

function getTemplateVariableMappingError(mappings: TemplateVariableMappingFormState[]) {
  const missingSource = mappings.some((mapping) => !mapping.source);
  if (missingSource) return "Mapeie todas as variáveis antes de criar o rascunho.";
  const missingFixed = mappings.some((mapping) => mapping.source === "fixed" && !mapping.value.trim());
  if (missingFixed) return "Informe o valor fixo das variáveis configuradas como valor manual.";
  return null;
}

function buildTemplatePreview(content: string, values: string[]) {
  return values.reduce(
    (acc, value, index) => acc.replaceAll(`{{${index + 1}}}`, value || `{{${index + 1}}}`),
    content
  );
}

function getStatusClasses(status: string) {
  switch (status) {
    case "draft":
      return "bg-sky-700 text-white";
    case "sending":
      return "bg-amber-500 text-slate-950";
    case "completed":
      return "bg-emerald-600 text-white";
    case "blocked":
      return "bg-orange-600 text-white";
    case "cancelled":
      return "bg-slate-600 text-white";
    case "failed":
      return "bg-red-600 text-white";
    default:
      return "bg-slate-500 text-white";
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case "draft":
      return "Rascunho em revisão";
    case "sending":
      return "Enviando...";
    case "completed":
      return "Concluida";
    case "blocked":
      return "Bloqueada por limite";
    case "cancelled":
      return "Descartada";
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
      return "bg-emerald-600 text-white";
    case "delivered":
      return "bg-sky-600 text-white";
    case "failed":
      return "bg-red-600 text-white";
    case "sent":
    default:
      return "bg-slate-500 text-white";
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
  if (campaign.status === "draft") {
    return {
      label: "Aguardando envio explícito",
      icon: "INFO",
      classes: "border-sky-300/25 bg-sky-900/20 text-sky-100",
    };
  }
  if (campaign.status === "cancelled") {
    return {
      label: "Rascunho descartado",
      icon: "INFO",
      classes: "border-slate-300/20 bg-slate-800/60 text-slate-100",
    };
  }
  if (campaign.status === "sending") {
    return {
      label: "Envio em andamento",
      icon: "INFO",
      classes: "border-amber-300/25 bg-amber-900/20 text-amber-100",
    };
  }
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

function formatCampaignRecipientReference(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 10) {
    return `${digits.slice(0, 4)}****${digits.slice(-4)}`;
  }
  if (value.length > 8) {
    return `${value.slice(0, 4)}****${value.slice(-4)}`;
  }
  return value || "-";
}

function getAudienceEligibilityClasses(eligible: boolean) {
  return eligible
    ? "border-emerald-400/30 bg-emerald-900/20 text-emerald-100"
    : "border-amber-400/30 bg-amber-900/20 text-amber-100";
}

function getToastClasses(tone: CampaignToastTone) {
  switch (tone) {
    case "success":
      return "border-emerald-400/30 bg-emerald-950/95 text-emerald-50";
    case "warning":
      return "border-amber-400/35 bg-amber-950/95 text-amber-50";
    case "error":
      return "border-red-400/35 bg-red-950/95 text-red-50";
    case "info":
    default:
      return "border-sky-400/30 bg-sky-950/95 text-sky-50";
  }
}

function getTabStatusFilter(tab: CampaignCenterTab): CampaignStatusFilter {
  switch (tab) {
    case "drafts":
      return "draft";
    case "sent":
      return "completed";
    case "blocked":
      return "blocked";
    case "all":
    case "create":
    default:
      return "all";
  }
}

export default function AppCampaignsPage() {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [templates, setTemplates] = useState<AppTemplateItem[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignItem | null>(null);
  const [form, setForm] = useState<CampaignFormState>(EMPTY_FORM);
  const [audienceFilters, setAudienceFilters] = useState<AudiencePreviewFilters>(EMPTY_AUDIENCE_FILTERS);
  const [audiencePreview, setAudiencePreview] = useState<AppCampaignAudiencePreviewResponse | null>(null);
  const [audiencePage, setAudiencePage] = useState(1);
  const [loadingAudiencePreview, setLoadingAudiencePreview] = useState(false);
  const [audiencePreviewError, setAudiencePreviewError] = useState<string | null>(null);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [sendingDraft, setSendingDraft] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [manualSendOpen, setManualSendOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<CampaignCenterTab>("create");
  const [statusFilter, setStatusFilter] = useState<CampaignStatusFilter>("all");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [refreshingList, setRefreshingList] = useState(false);
  const [refreshingDetail, setRefreshingDetail] = useState(false);
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [discardingDraft, setDiscardingDraft] = useState(false);
  const [exportingConsumption, setExportingConsumption] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [toast, setToast] = useState<CampaignToast | null>(null);

  const showToast = useCallback((tone: CampaignToastTone, title: string, message: string) => {
    setToast({ tone, title, message });
  }, []);

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
    const approvedTemplates = response.items.filter(
      (item) => item.status === "approved" && item.canUseInCampaign !== false && item.locallyDisabled !== true
    );
    setTemplates(approvedTemplates);
    return approvedTemplates;
  }, []);

  const refreshCampaignDetail = useCallback(
    async (activeSession: AppSession, campaignId: string, notify = false) => {
      setRefreshingDetail(true);
      setDetailError(null);
      try {
        const detail = await getAppCampaign(activeSession, campaignId);
        setSelectedCampaign(detail.campaign);
        setCampaigns((prev) => prev.map((item) => (item.id === detail.campaign.id ? detail.campaign : item)));
        if (notify) {
          showToast("success", "Detalhe atualizado", "Os dados da campanha foram recarregados.");
        }
        return detail.campaign;
      } catch (err) {
        const typed = err as { status?: number; message?: string };
        if (typed.status === 401) {
          handleUnauthorized();
          return null;
        }
        const message = typed.message || "Falha ao atualizar detalhe da campanha.";
        setDetailError(message);
        if (notify) {
          showToast("error", "Atualização não concluída", message);
        }
        return null;
      } finally {
        setRefreshingDetail(false);
      }
    },
    [handleUnauthorized, showToast]
  );

  const handleRefreshCampaigns = useCallback(async () => {
    if (!session) return;
    setRefreshingList(true);
    setError(null);
    try {
      const items = await refreshCampaigns(session, selectedCampaignId);
      const nextSelectedId =
        selectedCampaignId && items.some((item) => item.id === selectedCampaignId)
          ? selectedCampaignId
          : items[0]?.id ?? null;
      if (nextSelectedId) {
        await refreshCampaignDetail(session, nextSelectedId);
      } else {
        setSelectedCampaign(null);
      }
      showToast("success", "Campanhas atualizadas", "A lista e o detalhe selecionado foram recarregados.");
    } catch (err) {
      const typed = err as { status?: number; message?: string };
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      const message = typed.message || "Erro ao atualizar campanhas.";
      setError(message);
      showToast("error", "Atualização não concluída", message);
    } finally {
      setRefreshingList(false);
    }
  }, [handleUnauthorized, refreshCampaignDetail, refreshCampaigns, selectedCampaignId, session, showToast]);

  const selectedTemplate = useMemo(
    () =>
      templates.find((item) => item.id === form.templateId) ??
      templates.find((item) => item.name === form.templateName) ??
      null,
    [form.templateId, form.templateName, templates]
  );

  const selectedTemplateEffectiveCategory = String(
    selectedTemplate?.effectiveCategory ?? selectedTemplate?.category ?? ""
  ).toUpperCase();

  const templateVariableLabels = useMemo(
    () => getTemplateVariablePositions(selectedTemplate),
    [selectedTemplate]
  );

  const templatePreview = useMemo(() => {
    if (!selectedTemplate?.content || templateVariableLabels.length === 0) return null;
    return buildTemplatePreviewFromMappings(selectedTemplate.content, form.templateVariableMappings);
  }, [form.templateVariableMappings, selectedTemplate, templateVariableLabels.length]);

  const manualTemplatePreview = useMemo(() => {
    if (!selectedTemplate?.content || templateVariableLabels.length === 0) return null;
    return buildTemplatePreview(selectedTemplate.content, form.templateVariables);
  }, [form.templateVariables, selectedTemplate, templateVariableLabels.length]);

  const templateVariableMappingError = useMemo(
    () =>
      templateVariableLabels.length > 0
        ? getTemplateVariableMappingError(form.templateVariableMappings)
        : null,
    [form.templateVariableMappings, templateVariableLabels.length]
  );

  const audienceEligibleItems = useMemo(
    () => audiencePreview?.items.filter((item) => item.eligible) ?? [],
    [audiencePreview]
  );

  const campaignStats = useMemo(() => {
    return campaigns.reduce(
      (acc, campaign) => {
        acc.total += 1;
        if (campaign.status === "draft") acc.drafts += 1;
        if (campaign.status === "sending") acc.sending += 1;
        if (campaign.status === "completed") acc.sent += 1;
        if (campaign.status === "blocked") acc.blocked += 1;
        if (campaign.status === "failed") acc.failed += 1;
        return acc;
      },
      { total: 0, drafts: 0, sending: 0, sent: 0, blocked: 0, failed: 0 }
    );
  }, [campaigns]);

  const defaultDraftName = useMemo(() => {
    const formatter = new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    return `Campanha CRM - ${formatter.format(new Date())}`;
  }, []);

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
        getTemplateVariablePositions(matchedTemplate).length
      ),
      templateVariableMappings: syncTemplateVariableMappings(
        prev.templateVariableMappings,
        getTemplateVariablePositions(matchedTemplate)
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
        const matchesStatus =
          activeTab === "blocked"
            ? campaign.status === "blocked" || campaign.status === "failed"
            : statusFilter === "all" || campaign.status === statusFilter;
        const matchesSearch = !query || campaignName.includes(query);
        return matchesStatus && matchesSearch;
      })
      .sort((a, b) => {
        const aSending = a.status === "sending" ? 1 : 0;
        const bSending = b.status === "sending" ? 1 : 0;
        if (aSending !== bSending) return bSending - aSending;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [activeTab, campaigns, search, statusFilter]);

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

  useEffect(() => {
    if (!detailModalOpen) return undefined;
    const previousBodyOverflow = document.body.style.overflow;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousDocumentOverflow;
    };
  }, [detailModalOpen]);

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
      const message = "Informe o nome da campanha.";
      setFormError(`Erro ao criar campanha: ${message}`);
      showToast("error", "Envio imediato incompleto", message);
      return;
    }
    if (!templateId && !templateName) {
      const message = "Selecione um template aprovado antes de continuar.";
      setFormError(`Erro ao criar campanha: ${message}`);
      showToast("error", "Envio imediato incompleto", message);
      return;
    }
    if (recipients.length === 0) {
      const message = "Informe ao menos um número do contato válido.";
      setFormError(`Erro ao criar campanha: ${message}`);
      showToast("error", "Envio imediato incompleto", message);
      return;
    }
    if (templateVariableLabels.length > 0 && templateParams.some((value) => !value)) {
      const message = "Informe todas as variáveis obrigatórias do modelo.";
      setFormError(`Erro ao criar campanha: ${message}`);
      showToast("error", "Envio imediato incompleto", message);
      return;
    }
    const confirmed = window.confirm(
      "Esta ação usa o envio imediato manual e pode enviar templates para os números informados. O fluxo recomendado é criar um rascunho pela audiência CRM. Deseja continuar?"
    );
    if (!confirmed) return;

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
      showToast(
        "success",
        "Envio imediato processado",
        "Confira o status na campanha e no Inbox, quando houver conversa associada."
      );
    } catch (err) {
      const typed = err as { status?: number; message?: string };
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      const message = typed.message || "Erro ao criar campanha. Verifique template e destinatários.";
      setFormError(message);
      showToast("error", "Envio imediato não processado", message);
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
      showToast("success", "Campanha cancelada", "O envio em andamento foi cancelado quando possível.");
    } catch (err) {
      const typed = err as { status?: number; message?: string };
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      const message = typed.message || "Erro ao cancelar campanha.";
      setDetailError(message);
      showToast("error", "Cancelamento não concluído", message);
    } finally {
      setCancelling(false);
    }
  };

  const handleDiscardDraft = async () => {
    if (!session || !selectedCampaign || selectedCampaign.status !== "draft") return;
    const confirmed = window.confirm(
      "Este rascunho será removido da fila de revisão. Nenhuma mensagem será enviada."
    );
    if (!confirmed) return;
    setDiscardingDraft(true);
    setDetailError(null);
    try {
      const response = await discardAppCampaignDraft(session, selectedCampaign.id);
      setSelectedCampaign(response.campaign);
      await refreshCampaigns(session, response.campaign.id);
      setActiveTab("all");
      setStatusFilter("all");
      setDetailModalOpen(false);
      showToast("success", "Rascunho descartado", "Nenhuma mensagem foi enviada.");
    } catch (err) {
      const typed = err as { status?: number; message?: string };
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      const message = typed.message || "Não foi possível descartar o rascunho.";
      setDetailError(message);
      showToast("error", "Rascunho não descartado", message);
    } finally {
      setDiscardingDraft(false);
    }
  };

  const handleExportCampaignConsumption = async () => {
    if (!session || !selectedCampaign) return;
    setExportingConsumption(true);
    setDetailError(null);
    try {
      const csv = await exportAppCampaignConsumptionCsv(session, selectedCampaign.id);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `campaign-consumption-${selectedCampaign.id}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast("success", "CSV gerado", "O relatório de consumo foi baixado.");
    } catch (err) {
      const typed = err as { status?: number; message?: string };
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      const message = typed.message || "Erro ao exportar consumo da campanha.";
      setDetailError(message);
      showToast("error", "CSV não gerado", message);
    } finally {
      setExportingConsumption(false);
    }
  };

  const loadAudiencePreview = useCallback(
    async (nextPage = audiencePage) => {
      if (!session) return;
      setLoadingAudiencePreview(true);
      setAudiencePreviewError(null);
      try {
        const response = await fetchAppCampaignAudiencePreview(session, {
          q: audienceFilters.q,
          status: audienceFilters.status,
          channel: audienceFilters.channel === "all" ? null : audienceFilters.channel,
          hasConversation:
            audienceFilters.hasConversation === "all"
              ? null
              : audienceFilters.hasConversation === "true",
          optOut:
            audienceFilters.optOut === "all"
              ? null
              : audienceFilters.optOut === "true",
          page: nextPage,
          limit: 25,
        });
        setAudiencePreview(response);
        setAudiencePage(nextPage);
      } catch (err) {
        const typed = err as { status?: number; message?: string };
        if (typed.status === 401) {
          handleUnauthorized();
          return;
        }
        setAudiencePreviewError(typed.message || "Nao foi possivel gerar a previa de audiencia.");
      } finally {
        setLoadingAudiencePreview(false);
      }
    },
    [audienceFilters, audiencePage, handleUnauthorized, session]
  );

  const handleAudiencePreviewSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await loadAudiencePreview(1);
  };

  const handleClearAudienceFilters = () => {
    setAudienceFilters(EMPTY_AUDIENCE_FILTERS);
    setAudiencePage(1);
    setAudiencePreview(null);
    setAudiencePreviewError(null);
  };

  const handleCreateDraftFromAudience = async () => {
    if (!session || !audiencePreview) return;
    const selectedLeadIds = audienceEligibleItems.map((item) => item.leadId);
    const name = form.name.trim() || defaultDraftName;
    const templateId = form.templateId.trim();

    if (!templateId) {
      const message = "Selecione um template aprovado antes de criar o rascunho.";
      setAudiencePreviewError(message);
      showToast("error", "Rascunho incompleto", message);
      return;
    }
    if (templateVariableMappingError) {
      setAudiencePreviewError(templateVariableMappingError);
      showToast("error", "Rascunho incompleto", templateVariableMappingError);
      return;
    }
    if (selectedLeadIds.length === 0) {
      const message = "Não há contatos elegíveis nesta prévia para criar rascunho.";
      setAudiencePreviewError(message);
      showToast("warning", "Sem audiência elegível", message);
      return;
    }

    setCreatingDraft(true);
    setAudiencePreviewError(null);
    try {
      const created = await createAppCampaignDraft(session, {
        name,
        templateId,
        selectedLeadIds,
        ...(templateVariableLabels.length > 0
          ? { templateVariableMappings: buildTemplateVariableMappingsPayload(form.templateVariableMappings) }
          : {}),
      });
      await refreshCampaigns(session, created.campaign.id);
      const detail = await getAppCampaign(session, created.campaign.id);
      setSelectedCampaign(detail.campaign);
      setSelectedCampaignId(created.campaign.id);
      setDetailModalOpen(true);
      setForm(EMPTY_FORM);
      setFormError(null);
      setStatusFilter("draft");
      setActiveTab("drafts");
      setCurrentPage(1);
      showToast(
        "success",
        "Rascunho criado",
        `Revise antes de enviar. Nenhuma mensagem foi enviada. ${created.draft.summary.accepted} aceitos, ${created.draft.summary.blocked} bloqueados.`
      );
    } catch (err) {
      const typed = err as { status?: number; message?: string };
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      const message = typed.message || "Não foi possível criar o rascunho da campanha.";
      setAudiencePreviewError(message);
      showToast("error", "Rascunho não criado", message);
    } finally {
      setCreatingDraft(false);
    }
  };

  const handleSendDraftCampaign = async () => {
    if (!session || !selectedCampaign || selectedCampaign.status !== "draft") return;
    const confirmed = window.confirm(
      "Esta acao iniciara o envio de template aprovado para os contatos elegiveis deste rascunho. Contatos com envio ativo bloqueado, anonimizados, sem WhatsApp valido ou duplicados serao revalidados e ignorados antes do envio."
    );
    if (!confirmed) return;
    setSendingDraft(true);
    setDetailError(null);
    try {
      const response = await sendAppCampaignDraft(session, selectedCampaign.id);
      setSelectedCampaign(response.campaign);
      await refreshCampaigns(session, response.campaign.id);
      setActiveTab("all");
      setStatusFilter("sending");
      showToast("success", "Envio iniciado", `${response.send.summary.accepted} destinatários elegíveis foram aceitos para processamento.`);
    } catch (err) {
      const typed = err as { status?: number; message?: string };
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      const message = typed.message || "Não foi possível enviar o rascunho.";
      setDetailError(message);
      showToast("error", "Envio não iniciado", message);
    } finally {
      setSendingDraft(false);
    }
  };

  const handleReuseCampaign = (campaign: CampaignItem) => {
    const replayForm = buildReplayFormFromCampaign(campaign);
    const replayTemplateId = campaign.draftSeed?.templateId || campaign.templateId || "";
    const matchedTemplate =
      templates.find((item) => replayTemplateId && item.id === replayTemplateId) ??
      templates.find((item) => item.name === replayForm.templateName) ??
      null;
    const labels = getTemplateVariablePositions(matchedTemplate);
    const templateVariables = normalizeTemplateParams(replayForm.templateParamsInput);
    const seedMappings = campaign.draftSeed?.templateVariableMappings ?? [];
    const replayMappings: TemplateVariableMappingFormState[] =
      seedMappings.length > 0
        ? labels.map((position) => {
            const mapping = seedMappings.find((item) => item.position === position);
            const source = mapping?.source as TemplateVariableSource | undefined;
            const validSource: TemplateVariableSource =
              source === "contact.displayName" ||
              source === "lead.companyName" ||
              source === "lead.city" ||
              source === "fixed"
                ? source
                : "";
            return {
              position,
              source: validSource,
              value: mapping?.value ?? "",
              fallback: mapping?.fallback ?? "",
            };
          })
        : syncTemplateVariableMappings([], labels);
    setForm({
      templateVariables: syncTemplateVariables(templateVariables, labels.length),
      templateVariableMappings: replayMappings,
      ...replayForm,
      templateId: matchedTemplate?.id ?? "",
      templateName: matchedTemplate?.name ?? replayForm.templateName,
    });
    setFormError(null);
    setManualSendOpen(Boolean(replayForm.recipientsInput.trim()));
    if (replayForm.templateName && !matchedTemplate) {
      showToast(
        "warning",
        "Campanha carregada para reuso",
        "O template original não está disponível para campanha. Selecione um modelo ativo antes de criar novo rascunho ou usar envio imediato."
      );
      return;
    }
    if (campaign.draftSeed?.leadIds?.length && !replayForm.recipientsInput.trim()) {
      showToast(
        "warning",
        "Campanha carregada para reuso",
        "O template e as variáveis foram reaproveitados. Gere uma nova prévia de audiência CRM antes de criar outro rascunho."
      );
      return;
    }
    showToast(
      "info",
      "Campanha carregada para reuso",
      "Revise audiência, template e variáveis antes de criar um novo rascunho ou envio imediato."
    );
  };

  if (!session) {
    return <main className="min-h-screen bg-re7-navy" />;
  }

  return (
    <AppShell
      session={session}
      title="Campanhas"
      subtitle="Crie campanhas com templates aprovados pela Meta, usando contatos elegíveis do CRM."
    >
      <div className="fixed right-4 top-4 z-[90] grid w-[min(30rem,calc(100vw-2rem))] gap-2">
        {error ? (
          <div className="rounded-md border border-red-400/30 bg-red-950/95 p-3 text-sm text-red-50 shadow-2xl backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <p>{error}</p>
              <button
                type="button"
                onClick={() => setError(null)}
                className="rounded border border-white/15 px-2 py-0.5 text-xs text-white/75 hover:bg-white/10"
                aria-label="Fechar aviso de erro"
              >
                Fechar
              </button>
            </div>
          </div>
        ) : null}
        {toast ? (
          <div className={`rounded-md border p-3 text-sm shadow-2xl backdrop-blur ${getToastClasses(toast.tone)}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{toast.title}</p>
                <p className="mt-1 leading-5 opacity-85">{toast.message}</p>
              </div>
              <button
                type="button"
                onClick={() => setToast(null)}
                className="shrink-0 rounded border border-white/15 px-2 py-0.5 text-xs text-white/75 hover:bg-white/10"
                aria-label="Fechar aviso"
              >
                Fechar
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <section className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex flex-col gap-4">
          <div className="max-w-5xl">
            <h2 className="text-base font-semibold">Central de Campanhas</h2>
            <p className="mt-2 text-sm leading-6 text-white/70">
              Crie campanhas com templates aprovados pela Meta, usando contatos elegíveis do CRM.
              Antes do envio, a plataforma valida bloqueio de envio ativo, contatos anonimizados,
              WhatsApp válido, duplicidades e variáveis obrigatórias.
            </p>
          </div>
          <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
            {[
              "Escolha a audiência",
              "Valide elegíveis",
              "Escolha o template",
              "Mapeie variáveis",
              "Crie rascunho",
              "Revise e envie",
            ].map((label, index) => (
              <div key={label} className="rounded-md border border-white/10 bg-re7-navy/35 p-3">
                <p className="text-xs font-semibold text-re7-sky">0{index + 1}</p>
                <p className="mt-1 text-sm text-white/85">{label}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-md border border-white/10 bg-white/5 p-3">
              <p className="text-xs uppercase tracking-wide text-white/55">Rascunhos</p>
              <p className="mt-1 text-xl font-semibold">{campaignStats.drafts}</p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/5 p-3">
              <p className="text-xs uppercase tracking-wide text-white/55">Em envio</p>
              <p className="mt-1 text-xl font-semibold text-amber-100">{campaignStats.sending}</p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/5 p-3">
              <p className="text-xs uppercase tracking-wide text-white/55">Enviadas</p>
              <p className="mt-1 text-xl font-semibold text-emerald-100">{campaignStats.sent}</p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/5 p-3">
              <p className="text-xs uppercase tracking-wide text-white/55">Bloqueadas</p>
              <p className="mt-1 text-xl font-semibold text-orange-100">{campaignStats.blocked}</p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/5 p-3">
              <p className="text-xs uppercase tracking-wide text-white/55">Falhas</p>
              <p className="mt-1 text-xl font-semibold text-red-100">{campaignStats.failed}</p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/5 p-3">
              <p className="text-xs uppercase tracking-wide text-white/55">Total recente</p>
              <p className="mt-1 text-xl font-semibold">{campaignStats.total}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {CAMPAIGN_CENTER_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setStatusFilter(getTabStatusFilter(tab.id));
                  setCurrentPage(1);
                }}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                  activeTab === tab.id
                    ? "border-re7-sky bg-re7-sky/20 text-white"
                    : "border-white/15 bg-white/5 text-white/70 hover:bg-white/10"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className={`${activeTab === "create" ? "grid" : "hidden"} rounded-xl border border-white/10 bg-white/5`}>
        <div className="border-b border-white/10 px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-re7-sky">Bloco 1</p>
              <h2 className="mt-1 text-sm font-semibold">Audiência CRM</h2>
              <p className="mt-1 text-xs text-white/60">
                Escolha filtros, gere a prévia e valide quem está elegível antes de montar a campanha.
              </p>
            </div>
            <span className="rounded-full border border-sky-300/30 bg-sky-900/20 px-3 py-1 text-xs text-sky-100">
              Sem envio
            </span>
          </div>
        </div>
        <div className="grid gap-3 p-3">
          <p className="rounded-md border border-sky-300/25 bg-sky-900/20 p-3 text-sm text-sky-100">
            Esta previa nao envia mensagens e nao cria campanha. Ela apenas valida contatos do CRM para uso futuro em campanhas com template aprovado.
          </p>
          <form className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_160px_150px_150px_150px_auto]" onSubmit={handleAudiencePreviewSubmit}>
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Busca</span>
              <input
                className="w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                value={audienceFilters.q}
                onChange={(event) =>
                  setAudienceFilters((prev) => ({ ...prev, q: event.target.value }))
                }
                placeholder="Nome, empresa ou telefone mascarado"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Status CRM</span>
              <input
                className="w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                value={audienceFilters.status}
                onChange={(event) =>
                  setAudienceFilters((prev) => ({ ...prev, status: event.target.value }))
                }
                placeholder="Ex.: INATIVO"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Canal</span>
              <select
                className="w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white"
                value={audienceFilters.channel}
                onChange={(event) =>
                  setAudienceFilters((prev) => ({ ...prev, channel: event.target.value }))
                }
              >
                <option value="all">Todos</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="instagram">Instagram</option>
                <option value="messenger">Messenger</option>
                <option value="webchat">Webchat</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Envio ativo</span>
              <select
                className="w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white"
                value={audienceFilters.optOut}
                onChange={(event) =>
                  setAudienceFilters((prev) => ({ ...prev, optOut: event.target.value as AudiencePreviewFilters["optOut"] }))
                }
              >
                <option value="all">Todos</option>
                <option value="false">Liberado</option>
                <option value="true">Bloqueado</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Conversa</span>
              <select
                className="w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white"
                value={audienceFilters.hasConversation}
                onChange={(event) =>
                  setAudienceFilters((prev) => ({ ...prev, hasConversation: event.target.value as AudiencePreviewFilters["hasConversation"] }))
                }
              >
                <option value="all">Todos</option>
                <option value="true">Com conversa</option>
                <option value="false">Sem conversa</option>
              </select>
            </label>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                disabled={loadingAudiencePreview}
                className="rounded-md bg-re7-orange px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingAudiencePreview ? "Gerando..." : "Gerar previa"}
              </button>
              <button
                type="button"
                onClick={handleClearAudienceFilters}
                className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
              >
                Limpar
              </button>
            </div>
          </form>

          {audiencePreviewError ? (
            <p className="rounded-md border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100">
              {audiencePreviewError}
            </p>
          ) : null}

          {audiencePreview ? (
            <div className="grid gap-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-md border border-white/10 bg-white/5 p-3">
                  <p className="text-xs uppercase tracking-wide text-white/60">Total</p>
                  <p className="mt-1 text-xl font-semibold">{audiencePreview.summary.total}</p>
                </div>
                <div className="rounded-md border border-emerald-400/20 bg-emerald-900/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-emerald-100/70">Elegiveis</p>
                  <p className="mt-1 text-xl font-semibold text-emerald-100">{audiencePreview.summary.eligible}</p>
                </div>
                <div className="rounded-md border border-amber-400/20 bg-amber-900/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-amber-100/70">Bloqueados</p>
                  <p className="mt-1 text-xl font-semibold text-amber-100">{audiencePreview.summary.blocked}</p>
                </div>
              </div>
              {audiencePreview.summary.blockedByReason.length > 0 ? (
                <div className="flex flex-wrap gap-2 text-xs">
                  {audiencePreview.summary.blockedByReason.map((item) => (
                    <span
                      key={item.reason}
                      className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-white/75"
                    >
                      {item.label}: {item.count}
                    </span>
                  ))}
                </div>
              ) : null}
              {audiencePreview.summary.truncated ? (
                <p className="rounded-md border border-amber-400/30 bg-amber-900/20 p-3 text-sm text-amber-100">
                  A analise foi limitada aos primeiros {audiencePreview.summary.analyzed} contatos para proteger desempenho.
                </p>
              ) : null}
              <div className="grid gap-3 rounded-md border border-white/10 bg-white/5 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(220px,320px)_auto]">
                <div className="lg:col-span-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-re7-sky">Blocos 2 e 4</p>
                  <h3 className="mt-1 text-sm font-semibold">Template aprovado e rascunho</h3>
                  <p className="mt-1 text-xs text-white/60">
                    Escolha um modelo aprovado, revise as regras e crie um rascunho. Criar rascunho não envia mensagens.
                  </p>
                </div>
                <label className="grid gap-1 text-sm">
                  <span className="text-white/70">Nome do rascunho</span>
                  <input
                    className="w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder={defaultDraftName}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-white/70">Template aprovado</span>
                  <select
                    className="w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white"
                    value={form.templateId}
                    onChange={(event) => {
                      const template = templates.find((item) => item.id === event.target.value) ?? null;
                      const labels = getTemplateVariablePositions(template);
                      setForm((prev) => ({
                        ...prev,
                        templateId: event.target.value,
                        templateName: template?.name ?? "",
                        templateVariables: syncTemplateVariables(prev.templateVariables, labels.length),
                        templateVariableMappings: syncTemplateVariableMappings(prev.templateVariableMappings, labels),
                      }));
                    }}
                  >
                    <option value="">Selecione</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                  {selectedTemplate ? (
                    <span className="text-xs text-white/55">
                      Categoria efetiva: {selectedTemplateEffectiveCategory || selectedTemplate.category || "-"}
                    </span>
                  ) : null}
                </label>
                <div className="flex flex-col justify-end gap-2">
                  <p className="text-xs text-white/60">
                    {audienceEligibleItems.length} elegiveis serao incluidos; {audiencePreview.summary.blocked} bloqueados serao ignorados.
                  </p>
                  <button
                    type="button"
                    disabled={
                      creatingDraft ||
                      audienceEligibleItems.length === 0 ||
                      !form.templateId ||
                      templates.length === 0 ||
                      Boolean(templateVariableMappingError)
                    }
                    onClick={handleCreateDraftFromAudience}
                    className="rounded-md bg-re7-orange px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {creatingDraft ? "Criando..." : "Criar rascunho de campanha"}
                  </button>
                </div>
                {templates.length === 0 ? (
                  <div className="rounded-md border border-amber-300/25 bg-amber-900/20 p-3 text-xs text-amber-100 lg:col-span-3">
                    <p className="font-semibold">Não há modelos ativos disponíveis para campanha.</p>
                    <p className="mt-1 text-amber-100/80">
                      Verifique os modelos aprovados ou reative um modelo no Centro de Modelos.
                    </p>
                    <a
                      href="/app/templates"
                      className="mt-2 inline-flex rounded-md border border-amber-200/40 px-3 py-1.5 font-semibold hover:bg-amber-200/10"
                    >
                      Ir para Templates
                    </a>
                  </div>
                ) : null}
                {selectedTemplateEffectiveCategory === "MARKETING" ? (
                  <div className="rounded-md border border-amber-300/25 bg-amber-900/20 p-3 text-xs text-amber-100 lg:col-span-3">
                    Este template está classificado como MARKETING pela Meta. Revise política, consentimento e custos antes de enviar.
                  </div>
                ) : null}
                {templateVariableLabels.length > 0 ? (
                  <div className="grid gap-3 rounded-md border border-re7-sky/20 bg-re7-sky/10 p-3 lg:col-span-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-re7-sky">Bloco 3</p>
                      <p className="text-sm font-semibold text-sky-100">Variáveis do template</p>
                      <p className="mt-1 text-xs text-white/60">
                        Defina como cada variável será preenchida para cada contato antes de criar o rascunho.
                      </p>
                    </div>
                    <div className="grid gap-3">
                      {form.templateVariableMappings.map((mapping, index) => (
                        <div
                          key={mapping.position}
                          className="grid gap-2 rounded-md border border-white/10 bg-re7-navy/50 p-3 lg:grid-cols-[80px_minmax(180px,1fr)_minmax(160px,1fr)_minmax(160px,1fr)]"
                        >
                          <div>
                            <p className="text-xs uppercase text-white/45">Variável</p>
                            <p className="mt-1 font-mono text-sm font-semibold text-white">{`{{${mapping.position}}}`}</p>
                          </div>
                          <label className="grid gap-1 text-sm">
                            <span className="text-white/70">Origem do valor</span>
                            <select
                              value={mapping.source}
                              onChange={(event) =>
                                setForm((prev) => ({
                                  ...prev,
                                  templateVariableMappings: prev.templateVariableMappings.map((item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, source: event.target.value as TemplateVariableSource }
                                      : item
                                  ),
                                }))
                              }
                              className="w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                            >
                              <option value="">Selecione</option>
                              <option value="contact.displayName">Nome do contato</option>
                              <option value="lead.companyName">Empresa</option>
                              <option value="lead.city">Cidade</option>
                              <option value="fixed">Valor fixo/manual</option>
                            </select>
                          </label>
                          <label className="grid gap-1 text-sm">
                            <span className="text-white/70">Fallback</span>
                            <input
                              value={mapping.fallback}
                              onChange={(event) =>
                                setForm((prev) => ({
                                  ...prev,
                                  templateVariableMappings: prev.templateVariableMappings.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, fallback: event.target.value } : item
                                  ),
                                }))
                              }
                              placeholder="ex: cliente"
                              className="w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                            />
                          </label>
                          <label className="grid gap-1 text-sm">
                            <span className="text-white/70">Valor fixo</span>
                            <input
                              value={mapping.value}
                              disabled={mapping.source !== "fixed"}
                              onChange={(event) =>
                                setForm((prev) => ({
                                  ...prev,
                                  templateVariableMappings: prev.templateVariableMappings.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, value: event.target.value } : item
                                  ),
                                }))
                              }
                              placeholder={mapping.source === "fixed" ? "Valor enviado" : getVariableSourceLabel(mapping.source)}
                              className="w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky disabled:cursor-not-allowed disabled:opacity-50"
                            />
                          </label>
                        </div>
                      ))}
                    </div>
                    {templatePreview ? (
                      <div className="rounded-md border border-white/10 bg-re7-navy/50 p-3 text-sm text-white/80">
                        <p className="text-xs uppercase tracking-wide text-white/50">Prévia ilustrativa</p>
                        <p className="mt-2 whitespace-pre-wrap">{templatePreview}</p>
                        <p className="mt-2 text-xs text-white/50">
                          Prévia ilustrativa. O valor final será calculado para cada contato no momento do envio.
                        </p>
                      </div>
                    ) : null}
                    {templateVariableMappingError ? (
                      <p className="rounded-md border border-amber-300/25 bg-amber-900/20 p-3 text-xs text-amber-100">
                        {templateVariableMappingError}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <p className="text-xs text-white/55 lg:col-span-3">
                  O rascunho nao envia mensagens. O envio exige revisao e acao explicita do operador.
                </p>
              </div>
              <div className="overflow-x-auto rounded-md border border-white/10">
                <table className="w-full min-w-[860px] text-sm">
                  <thead className="bg-white/10 text-left">
                    <tr>
                      <th className="px-3 py-2">Contato</th>
                      <th className="px-3 py-2">Referencia</th>
                      <th className="px-3 py-2">Status CRM</th>
                      <th className="px-3 py-2">Canal</th>
                      <th className="px-3 py-2">Elegibilidade</th>
                      <th className="px-3 py-2">Ultima conversa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audiencePreview.items.length === 0 ? (
                      <tr>
                        <td className="px-3 py-4 text-white/70" colSpan={6}>
                          Nenhum contato encontrado para estes filtros.
                        </td>
                      </tr>
                    ) : null}
                    {audiencePreview.items.map((item) => (
                      <tr key={item.leadId} className="border-t border-white/10">
                        <td className="px-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-white">{item.displayName || "Contato"}</p>
                            <p className="truncate text-xs text-white/55">{item.companyName || item.city || "-"}</p>
                          </div>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-white/75">
                          {item.phoneDisplay || item.identifierDisplay}
                        </td>
                        <td className="px-3 py-2">
                          <span className="rounded-full border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/80">
                            {item.crmStatusLabel || item.crmStatus}
                          </span>
                        </td>
                        <td className="px-3 py-2">{item.channel || "whatsapp"}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${getAudienceEligibilityClasses(item.eligible)}`}>
                            {item.eligible ? "Elegivel para envio ativo" : "Bloqueado"}
                          </span>
                          {!item.eligible && item.blockedReasonLabel ? (
                            <p className="mt-1 text-xs text-white/60">{item.blockedReasonLabel}</p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          {item.lastProtocol ? (
                            <span className="font-mono text-xs text-white/75">{item.lastProtocol}</span>
                          ) : (
                            <span className="text-white/45">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <p className="text-white/70">
                  Pagina {audiencePreview.pagination.page} de {Math.max(audiencePreview.pagination.totalPages, 1)}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!audiencePreview.pagination.hasPreviousPage || loadingAudiencePreview}
                    onClick={() => void loadAudiencePreview(Math.max(audiencePage - 1, 1))}
                    className="rounded-md border border-white/20 px-3 py-1 text-xs text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    disabled={!audiencePreview.pagination.hasNextPage || loadingAudiencePreview}
                    onClick={() => void loadAudiencePreview(audiencePage + 1)}
                    className="rounded-md border border-white/20 px-3 py-1 text-xs text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Proxima
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          <details
            className="rounded-md border border-amber-300/20 bg-amber-950/10"
            open={manualSendOpen}
            onToggle={(event) => setManualSendOpen(event.currentTarget.open)}
          >
            <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-amber-100">
              Envio imediato manual (avançado)
            </summary>
            <div className="border-t border-white/10 p-3">
              <p className="mb-3 rounded-md border border-amber-300/25 bg-amber-900/20 p-3 text-xs text-amber-100">
                Use apenas para operação técnica ou compatibilidade. Esta ação pode enviar imediatamente após confirmação. O fluxo recomendado é criar rascunho a partir da audiência CRM.
              </p>
              <form className="grid gap-3 lg:grid-cols-2" onSubmit={handleSubmit}>
                <label className="grid min-w-0 gap-1 text-sm">
                  <span className="text-white/70">Nome</span>
                  <input
                    className="block w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  />
                </label>
                <label className="grid min-w-0 gap-1 text-sm">
                  <span className="text-white/70">Template</span>
                  <select
                    className="block w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                    value={form.templateId}
                    disabled={templates.length === 0}
                    onChange={(event) => {
                      const nextTemplateId = event.target.value;
                      const selectedTemplate = templates.find((item) => item.id === nextTemplateId) ?? null;
                      const labels = getTemplateVariablePositions(selectedTemplate);
                      setForm((prev) => ({
                        ...prev,
                        templateId: nextTemplateId,
                        templateName: selectedTemplate?.name ?? "",
                        templateVariables: syncTemplateVariables(prev.templateVariables, labels.length),
                        templateVariableMappings: syncTemplateVariableMappings(prev.templateVariableMappings, labels),
                      }));
                    }}
                  >
                    <option value="">
                      {templates.length === 0
                        ? "Nenhum modelo ativo disponivel"
                        : "Selecione um modelo aprovado e ativo"}
                    </option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} - {template.category}
                      </option>
                    ))}
                  </select>
                </label>
                {templateVariableLabels.length > 0 ? (
                  <div className="grid min-w-0 gap-2.5 lg:col-span-2">
                    <span className="text-sm text-white/70">Variáveis manuais do template</span>
                    <div className="grid gap-2 md:grid-cols-2">
                      {templateVariableLabels.map((label, index) => (
                        <label key={`${label}-${index}`} className="grid min-w-0 gap-1 text-sm">
                          <span className="text-white/70">{label}</span>
                          <input
                            className="block w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
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
                          />
                        </label>
                      ))}
                    </div>
                    {manualTemplatePreview ? (
                      <div className="rounded-md border border-white/10 bg-re7-navy/40 p-3 text-sm text-white/80">
                        <p className="mb-1 text-xs uppercase tracking-wide text-white/50">Preview manual</p>
                        <p>{manualTemplatePreview}</p>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <label className="grid min-w-0 gap-1 text-sm lg:col-span-2">
                    <span className="text-white/70">Parâmetros do modelo (um por linha)</span>
                    <textarea
                      className="block min-h-16 w-full min-w-0 max-w-full rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                      value={form.templateParamsInput}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, templateParamsInput: event.target.value }))
                      }
                    />
                  </label>
                )}
                <label className="grid min-w-0 gap-1 text-sm lg:col-span-2">
                  <span className="text-white/70">Número do contato</span>
                  <textarea
                    className="block min-h-20 w-full min-w-0 max-w-full rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                    value={form.recipientsInput}
                    onChange={(event) => setForm((prev) => ({ ...prev, recipientsInput: event.target.value }))}
                    placeholder={"5584999999999\n5584888888888"}
                  />
                  <span className="text-xs text-white/55">
                    Digite um número por linha, com código do país e DDD, somente números. Exemplo: 5584999999999.
                  </span>
                </label>
                {formError ? (
                  <p className="rounded-md border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100 lg:col-span-2">
                    {formError}
                  </p>
                ) : null}
                <div className="flex justify-end lg:col-span-2">
                  <button
                    type="submit"
                    disabled={creating}
                    className="rounded-md bg-re7-orange px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {creating ? "Iniciando envio..." : "Enviar agora"}
                  </button>
                </div>
              </form>
            </div>
          </details>
        </div>
      </section>

      <section className={`${activeTab === "create" ? "hidden" : "grid"} min-w-0 grid-cols-1 items-start gap-3`}>
        <div className="grid min-w-0 gap-3">
          <section className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-white/5">
            <div className="border-b border-white/10 px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold">Campanhas</h2>
                <button
                  type="button"
                  disabled={refreshingList}
                  onClick={() => void handleRefreshCampaigns()}
                  className="rounded-md border border-white/20 px-3 py-1 text-xs text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {refreshingList ? "Atualizando..." : "Atualizar"}
                </button>
              </div>
              <div className="mt-3 grid min-w-0 grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-[180px_minmax(0,1fr)]">
                <label className="grid gap-1 text-sm">
                  <span className="text-white/70">Status</span>
                  <select
                    className="w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white"
                    value={statusFilter}
                    onChange={(event) => {
                      setActiveTab("all");
                      setStatusFilter(event.target.value as CampaignStatusFilter);
                    }}
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
                    className="w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
              </div>
            </div>
            <div className="overflow-x-auto 2xl:max-h-[26rem] 2xl:overflow-y-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-white/10 text-left">
                <tr>
                  <th className="px-2 py-2">Ações</th>
                  <th className="px-2 py-2">Campanha</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2 text-center">Enviadas</th>
                  <th className="px-2 py-2 text-center">Total</th>
                  <th className="hidden px-2 py-2 lg:table-cell">Template</th>
                  <th className="hidden px-2 py-2 xl:table-cell">Criada em</th>
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
                      <td className="px-2 py-2 align-top">
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
	                            onClick={(event) => {
	                              event.stopPropagation();
	                              setSelectedCampaignId(campaign.id);
	                              setDetailModalOpen(true);
	                            }}
                            className="rounded-md border border-re7-sky/40 px-2 py-1 text-xs font-semibold text-sky-100 hover:bg-re7-sky/10"
                          >
                            Ver detalhes
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setActiveTab("create");
                              setSelectedCampaignId(campaign.id);
                              handleReuseCampaign(campaign);
                            }}
                            className="rounded-md border border-white/15 px-2 py-1 text-xs text-white/65 hover:bg-white/10"
                            title="Reaproveitar campanha"
                            aria-label={`Reaproveitar campanha ${campaign.name || campaign.id}`}
                          >
                            Reusar
                          </button>
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-white">{campaign.name || "(sem nome)"}</p>
                          <p className="mt-1 text-xs text-white/55">{formatRelativeTime(campaign.updatedAt)}</p>
                        </div>
                      </td>
                      <td className="px-2 py-2 align-top">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex w-fit rounded-full px-2 py-1 text-xs font-semibold ${getStatusClasses(campaign.status)}`}>
                            {getStatusLabel(campaign.status)}
                          </span>
                          <span className="text-xs text-white/60">{campaign.status}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-center">{campaign.sentCount}</td>
                      <td className="px-2 py-2 text-center">{campaign.totalRecipients}</td>
                      <td className="hidden px-2 py-2 lg:table-cell">{campaign.templateName || "(sem template)"}</td>
                      <td className="hidden px-2 py-2 xl:table-cell">
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
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-3 py-2 text-sm sm:px-4">
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

          {detailModalOpen ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
              role="dialog"
              aria-modal="true"
              aria-label="Detalhe da campanha"
              onClick={() => setDetailModalOpen(false)}
            >
              <section
                className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-white/15 bg-re7-navy text-white shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                  <div>
                    <h2 className="text-sm font-semibold">Detalhe da campanha</h2>
                    <p className="mt-1 text-xs text-white/55">
                      Revise rascunho, status, audiência e consumo sem sair da lista.
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={!session || !selectedCampaignId || refreshingDetail}
                      onClick={() => {
                        if (!session || !selectedCampaignId) return;
                        void refreshCampaignDetail(session, selectedCampaignId, true);
                      }}
                      className="rounded-md border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {refreshingDetail ? "Atualizando..." : "Atualizar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailModalOpen(false)}
                      className="rounded-md border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10"
                    >
                      Fechar
                    </button>
                  </div>
                </div>
                <div className="grid gap-3 overflow-y-auto p-3 text-sm sm:p-4">
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
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-md border border-white/10 bg-white/5 p-3">
                      <p className="text-xs uppercase tracking-wide text-white/60">Status</p>
                      <p className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getStatusClasses(selectedCampaign.status)}`}>
                        {getStatusLabel(selectedCampaign.status)}
                      </p>
                      <p className="mt-2 text-xs text-white/60">{getStatusLabel(selectedCampaign.status)}</p>
                    </div>
                    <div className="rounded-md border border-white/10 bg-white/5 p-3">
                      <p className="text-xs uppercase tracking-wide text-white/60">Enviadas</p>
                      <p className="mt-1 font-semibold">{selectedCampaign.sentCount}</p>
                    </div>
                    <div className="rounded-md border border-white/10 bg-white/5 p-3">
                      <p className="text-xs uppercase tracking-wide text-white/60">Bloqueados</p>
                      <p className="mt-1 font-semibold">{selectedCampaign.blockedCount}</p>
                    </div>
                    <div className="rounded-md border border-white/10 bg-white/5 p-3">
                      <p className="text-xs uppercase tracking-wide text-white/60">Pendentes</p>
                      <p className="mt-1 font-semibold">{selectedCampaign.progress.pendingCount}</p>
                    </div>
                  </div>

                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
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
                    Relatórios comerciais podem considerar critérios de entrega, leitura e categoria
                    do template conforme a regra contratual aplicável.
                  </div>

                  {selectedCampaign.status === "draft" ? (
                    <div className="grid gap-3 rounded-md border border-sky-300/25 bg-sky-900/20 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-sky-100">Rascunho em revisao</p>
                          <p className="mt-1 text-xs text-sky-100/75">
                            Este rascunho ainda nao enviou mensagens. Revise template e audiencia antes de iniciar.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={discardingDraft || sendingDraft}
                            onClick={handleDiscardDraft}
                            className="rounded-md border border-white/20 px-3 py-2 text-sm font-semibold text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {discardingDraft ? "Descartando..." : "Descartar rascunho"}
                          </button>
                          <button
                            type="button"
                            disabled={sendingDraft || discardingDraft}
                            onClick={handleSendDraftCampaign}
                            className="rounded-md bg-re7-orange px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {sendingDraft ? "Iniciando..." : "Enviar campanha"}
                          </button>
                        </div>
                      </div>
                      {selectedCampaign.draftReview ? (
                        <div className="grid gap-2 sm:grid-cols-4">
                          <div className="rounded-md border border-white/10 bg-white/5 p-2">
                            <p className="text-xs text-white/60">Solicitados</p>
                            <p className="font-semibold">{selectedCampaign.draftReview.summary.requested}</p>
                          </div>
                          <div className="rounded-md border border-white/10 bg-white/5 p-2">
                            <p className="text-xs text-white/60">Aceitos</p>
                            <p className="font-semibold text-emerald-100">{selectedCampaign.draftReview.summary.accepted}</p>
                          </div>
                          <div className="rounded-md border border-white/10 bg-white/5 p-2">
                            <p className="text-xs text-white/60">Bloqueados</p>
                            <p className="font-semibold text-amber-100">{selectedCampaign.draftReview.summary.blocked}</p>
                          </div>
                          <div className="rounded-md border border-white/10 bg-white/5 p-2">
                            <p className="text-xs text-white/60">Duplicados</p>
                            <p className="font-semibold">{selectedCampaign.draftReview.summary.duplicatesRemoved}</p>
                          </div>
                        </div>
                      ) : null}
                      {selectedCampaign.draftReview?.summary.blockedByReason.length ? (
                        <div className="flex flex-wrap gap-2 text-xs">
                          {selectedCampaign.draftReview.summary.blockedByReason.map((item) => (
                            <span key={item.reason} className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-white/75">
                              {item.label}: {item.count}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {selectedCampaign.draftSeed?.templateVariableMappings?.length ? (
                        <div className="rounded-md border border-white/10 bg-white/5 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
                            Mapeamento de variáveis
                          </p>
                          <div className="mt-2 grid gap-2 md:grid-cols-2">
                            {selectedCampaign.draftSeed.templateVariableMappings.map((mapping) => (
                              <div
                                key={mapping.position}
                                className="rounded-md border border-white/10 bg-re7-navy/40 px-3 py-2 text-xs text-white/75"
                              >
                                <p className="font-semibold text-white">{`{{${mapping.position}}}`}</p>
                                <p className="mt-1">
                                  Origem: {getVariableSourceLabel(mapping.source as TemplateVariableSource)}
                                </p>
                                {mapping.source === "fixed" && mapping.value ? (
                                  <p className="mt-1">Valor fixo: {mapping.value}</p>
                                ) : null}
                                {mapping.fallback ? (
                                  <p className="mt-1">Fallback: {mapping.fallback}</p>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {selectedCampaign.draftReview?.recipients?.length ? (
                        <div className="rounded-md border border-white/10 bg-white/5 p-3">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
                              Destinatários do rascunho
                            </p>
                            <span className="rounded-full border border-sky-300/25 bg-sky-900/20 px-2 py-1 text-xs text-sky-100">
                              Aguardando envio explícito
                            </span>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[620px] text-sm">
                              <thead className="bg-white/10 text-left">
                                <tr>
                                  <th className="px-3 py-2">Contato</th>
                                  <th className="px-3 py-2">Referência</th>
                                  <th className="px-3 py-2">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {selectedCampaign.draftReview.recipients.map((recipient, index) => (
                                  <tr key={`${recipient.identifierDisplay}-${index}`} className="border-t border-white/10">
                                    <td className="px-3 py-2">Contato {index + 1}</td>
                                    <td className="px-3 py-2 font-mono text-xs text-white/75">
                                      {recipient.phoneDisplay || recipient.identifierDisplay}
                                    </td>
                                    <td className="px-3 py-2">
                                      <span className="inline-flex rounded-full border border-sky-300/25 bg-sky-900/20 px-2 py-1 text-xs font-semibold text-sky-100">
                                        Incluído no rascunho
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-white/10 bg-white/5 p-3">
                    <div>
                      <p className="text-sm font-semibold">Relatorio de consumo</p>
                      <p className="mt-1 text-xs text-white/60">
                        Exporta CSV com status de entrega e criterio operacional de faturamento.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={exportingConsumption}
                      onClick={handleExportCampaignConsumption}
                      className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/85 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {exportingConsumption ? "Exportando..." : "Exportar CSV"}
                    </button>
                  </div>

                  <div className="rounded-md border border-white/10 bg-white/5 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
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
                    <p><span className="text-white/70">Total de destinatarios:</span> {selectedCampaign.totalRecipients}</p>
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
                              <th className="px-3 py-2">Referência</th>
                              <th className="px-3 py-2">Status</th>
                              <th className="px-3 py-2">Categoria</th>
                              <th className="px-3 py-2">Cobranca</th>
                              <th className="px-3 py-2">Faturavel</th>
                              <th className="px-3 py-2">Entrega</th>
                              <th className="px-3 py-2">Erro</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedCampaign.messagesMetaStatus.map((item, index) => (
                              <tr key={`${item.waId}-${item.conversationId ?? "conversation"}-${index}`} className="border-t border-white/10">
                                <td className="px-3 py-2 font-mono text-xs">{formatCampaignRecipientReference(item.waId)}</td>
                                <td className="px-3 py-2">
                                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getMetaStatusClasses(item.status)}`}>
                                    {getMetaStatusLabel(item.status)}
                                  </span>
                                </td>
                                <td className="px-3 py-2">{item.pricingCategory || "-"}</td>
                                <td className="px-3 py-2">{formatBillingValue(item.pricingBillable)}</td>
                                <td className="px-3 py-2">{item.billable ? "sim" : "nao"}</td>
                                <td className="px-3 py-2 text-xs text-white/70">
                                  {item.deliveredAt ? formatDateTime(item.deliveredAt) : "-"}
                                </td>
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
          ) : null}
        </div>
      </section>
    </AppShell>
  );
}
