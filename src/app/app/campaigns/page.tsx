"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { buildReplayFormFromCampaign, getFriendlyCampaignError } from "@/lib/campaignDrafts";
import {
  AppCampaignAudiencePreviewResponse,
  AppCampaignImportPreview,
  AppMetaCostPreview,
  AppSession,
  AppTemplateItem,
  CrmBusinessStatusConfig,
  cancelAppCampaign,
  clearAppSession,
  createAppCampaign,
  createAppCampaignDraft,
  createAppCampaignDraftFromCsv,
  discardAppCampaignDraft,
  exportAppCampaignConsumptionCsv,
  fetchAppCampaignAudiencePreview,
  fetchAppCrmStatuses,
  fetchAppMetaUsagePreview,
  getAppCampaign,
  listAppCampaigns,
  listAppTemplates,
  loadAppSession,
  pauseAppCampaign,
  previewAppCampaignCsv,
  resumeAppCampaign,
  scheduleAppCampaignDraft,
  saveAppSession,
  sendAppCampaignDraft,
  sendAppCampaignTest,
} from "@/lib/appClientApi";
import { getBooleanUxLabel, getCampaignStatusUxLabel, getMetaTemplateCategoryUxLabel } from "@/lib/appUxLabels";
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
  | "scheduled"
  | "sending"
  | "paused"
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
  "scheduled",
  "sending",
  "paused",
  "completed",
  "blocked",
  "cancelled",
  "failed",
];

const CAMPAIGN_CENTER_TABS: Array<{ id: CampaignCenterTab; label: string }> = [
  { id: "create", label: "Criar campanha" },
  { id: "drafts", label: "Rascunhos" },
  { id: "sent", label: "Enviadas" },
  { id: "blocked", label: "Bloqueadas e falhas" },
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

function formatUsd(value: number | null) {
  if (value === null) return "Valor a confirmar";
  return `US$ ${value.toLocaleString("pt-BR", {
    minimumFractionDigits: value >= 1 ? 2 : 4,
    maximumFractionDigits: 4,
  })}`;
}

function countManualRecipientsInput(input: string) {
  return Array.from(
    new Set(
      input
        .split(/[\n,;]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ).length;
}

function parseCsvHeadersForUi(input: string) {
  const firstLine = String(input ?? "").replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  if (!firstLine.trim()) return [];
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const headers: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < firstLine.length; index += 1) {
    const char = firstLine[index];
    const next = firstLine[index + 1];
    if (char === "\"") {
      if (quoted && next === "\"") {
        current += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && char === delimiter) {
      headers.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  headers.push(current.trim());
  return headers.filter(Boolean);
}

function CostPreviewCard({ preview, loading, emptyText }: {
  preview: AppMetaCostPreview | null;
  loading?: boolean;
  emptyText: string;
}) {
  const toneClass =
    preview?.warningLevel === "danger"
      ? "border-red-300/30 bg-red-950/20 text-red-100"
      : preview?.warningLevel === "warning"
        ? "border-amber-300/30 bg-amber-950/20 text-amber-100"
        : "border-re7-sky/25 bg-re7-sky/10 text-sky-100";
  if (loading) {
    return (
      <div className="rounded-md border border-white/10 bg-white/5 p-3 text-xs text-white/65">
        Calculando estimativa Meta...
      </div>
    );
  }
  if (!preview) {
    return (
      <div className="rounded-md border border-white/10 bg-white/5 p-3 text-xs text-white/65">
        {emptyText}
      </div>
    );
  }
  return (
    <div className={`rounded-md border p-3 text-xs ${toneClass}`}>
      <div className="grid gap-2 sm:grid-cols-3">
        <div>
          <p className="uppercase tracking-wide opacity-70">Categoria</p>
          <p className="mt-1 font-semibold">{getMetaTemplateCategoryUxLabel(preview.metaCategory)}</p>
        </div>
        <div>
          <p className="uppercase tracking-wide opacity-70">Unitário estimado</p>
          <p className="mt-1 font-semibold">{formatUsd(preview.unitCostUsd)}</p>
        </div>
        <div>
          <p className="uppercase tracking-wide opacity-70">Total estimado</p>
          <p className="mt-1 font-semibold">{formatUsd(preview.estimatedCostUsd)}</p>
        </div>
      </div>
      <p className="mt-2 opacity-80">
        {preview.eligibleCount} elegíveis entram na estimativa; {preview.blockedCount} bloqueados ficam fora.
      </p>
      {preview.usagePercentAfterSend !== null ? (
        <p className="mt-1 opacity-80">
          Uso mensal projetado: {preview.usagePercentAfterSend}% do limite configurado.
        </p>
      ) : null}
      <ul className="mt-2 list-disc space-y-1 pl-4 opacity-85">
        {preview.notes.slice(0, 3).map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  );
}

function getStatusClasses(status: string) {
  switch (status) {
    case "draft":
      return "bg-sky-700 text-white";
    case "scheduled":
      return "bg-indigo-600 text-white";
    case "sending":
      return "bg-amber-500 text-slate-950";
    case "paused":
      return "bg-violet-600 text-white";
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
  return getCampaignStatusUxLabel(status);
}

function formatRelativeTime(date: string) {
  const value = new Date(date).getTime();
  if (!Number.isFinite(value)) return formatDateTime(date);
  const diffSeconds = Math.max(Math.floor((Date.now() - value) / 1000), 0);
  if (diffSeconds < 60) return `há ${diffSeconds} segundo${diffSeconds === 1 ? "" : "s"}`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `há ${diffMinutes} minuto${diffMinutes === 1 ? "" : "s"}`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `há ${diffHours} hora${diffHours === 1 ? "" : "s"}`;
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
      label: `Entregue para ${totalRecipients}/${totalRecipients} destinatários`,
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
  return getBooleanUxLabel(value);
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
  const [crmStatuses, setCrmStatuses] = useState<CrmBusinessStatusConfig[]>([]);
  const [crmStatusesWarning, setCrmStatusesWarning] = useState<string | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignItem | null>(null);
  const [form, setForm] = useState<CampaignFormState>(EMPTY_FORM);
  const [audienceFilters, setAudienceFilters] = useState<AudiencePreviewFilters>(EMPTY_AUDIENCE_FILTERS);
  const [audiencePreview, setAudiencePreview] = useState<AppCampaignAudiencePreviewResponse | null>(null);
  const [audienceCostPreview, setAudienceCostPreview] = useState<AppMetaCostPreview | null>(null);
  const [manualCostPreview, setManualCostPreview] = useState<AppMetaCostPreview | null>(null);
  const [costPreviewLoading, setCostPreviewLoading] = useState(false);
  const [audiencePage, setAudiencePage] = useState(1);
  const [loadingAudiencePreview, setLoadingAudiencePreview] = useState(false);
  const [audiencePreviewError, setAudiencePreviewError] = useState<string | null>(null);
  const [csvText, setCsvText] = useState("");
  const [csvFileName, setCsvFileName] = useState("");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPhoneColumn, setCsvPhoneColumn] = useState("");
  const [csvNameColumn, setCsvNameColumn] = useState("");
  const [csvVariableColumns, setCsvVariableColumns] = useState<Record<string, string>>({});
  const [csvPreview, setCsvPreview] = useState<AppCampaignImportPreview | null>(null);
  const [csvPreviewError, setCsvPreviewError] = useState<string | null>(null);
  const [loadingCsvPreview, setLoadingCsvPreview] = useState(false);
  const [creatingCsvDraft, setCreatingCsvDraft] = useState(false);
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
  const [schedulingDraft, setSchedulingDraft] = useState(false);
  const [pausingCampaign, setPausingCampaign] = useState(false);
  const [resumingCampaign, setResumingCampaign] = useState(false);
  const [testingCampaign, setTestingCampaign] = useState(false);
  const [scheduleInput, setScheduleInput] = useState("");
  const [testRecipientInput, setTestRecipientInput] = useState("");
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

  useEffect(() => {
    setCsvVariableColumns((previous) =>
      Object.fromEntries(templateVariableLabels.map((label) => [label, previous[label] ?? ""]))
    );
    setCsvPreview(null);
    setCsvPreviewError(null);
  }, [templateVariableLabels]);

  const manualRecipientCount = useMemo(
    () => countManualRecipientsInput(form.recipientsInput),
    [form.recipientsInput]
  );

  useEffect(() => {
    if (!session || !form.templateId || !audiencePreview) {
      setAudienceCostPreview(null);
      return;
    }
    let cancelled = false;
    setCostPreviewLoading(true);
    fetchAppMetaUsagePreview(session, {
      source: "campaign",
      messageKind: "template",
      templateId: form.templateId,
      recipientCount: audiencePreview.summary.total,
      eligibleCount: audiencePreview.summary.eligible,
      blockedCount: audiencePreview.summary.blocked,
      windowOpenAtSend: "unknown",
      country: "BR",
    })
      .then((response) => {
        if (!cancelled) setAudienceCostPreview(response.preview);
      })
      .catch(() => {
        if (!cancelled) setAudienceCostPreview(null);
      })
      .finally(() => {
        if (!cancelled) setCostPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [audiencePreview, form.templateId, session]);

  useEffect(() => {
    if (!session || !form.templateId || manualRecipientCount === 0 || !manualSendOpen) {
      setManualCostPreview(null);
      return;
    }
    let cancelled = false;
    fetchAppMetaUsagePreview(session, {
      source: "manual_campaign_send",
      messageKind: "template",
      templateId: form.templateId,
      recipientCount: manualRecipientCount,
      eligibleCount: manualRecipientCount,
      blockedCount: 0,
      windowOpenAtSend: "unknown",
      country: "BR",
    })
      .then((response) => {
        if (!cancelled) setManualCostPreview(response.preview);
      })
      .catch(() => {
        if (!cancelled) setManualCostPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [form.templateId, manualRecipientCount, manualSendOpen, session]);

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

    Promise.all([
      refreshCampaigns(session),
      refreshTemplates(session),
      fetchAppCrmStatuses(session)
        .then((response) => {
          setCrmStatuses(response.settings.crmBusinessStatuses.filter((item) => item.isActive !== false));
          setCrmStatusesWarning(null);
        })
        .catch((err: { status?: number; message?: string }) => {
          if (err.status === 401) throw err;
          setCrmStatuses([]);
          setCrmStatusesWarning("Não foi possível carregar as situações do CRM. O filtro ficou em todos os status.");
        }),
    ])
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
    if (!selectedCampaign) {
      setScheduleInput("");
      setTestRecipientInput("");
      return;
    }
    if (selectedCampaign.scheduledAt) {
      const value = new Date(selectedCampaign.scheduledAt);
      if (Number.isFinite(value.getTime())) {
        setScheduleInput(value.toISOString().slice(0, 16));
      }
    }
  }, [selectedCampaign?.id, selectedCampaign?.scheduledAt]);

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
      const message = "Selecione um modelo aprovado antes de continuar.";
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
      "Esta ação usa o envio imediato manual e pode enviar modelos para os números informados. O fluxo recomendado é criar um rascunho pela audiência CRM. Deseja continuar?"
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
        "Confira a situação na campanha e na caixa de entrada, quando houver conversa associada."
      );
    } catch (err) {
      const typed = err as { status?: number; message?: string };
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      const message = typed.message || "Erro ao criar campanha. Verifique modelo e destinatários.";
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
        setAudiencePreviewError(typed.message || "Não foi possível gerar a prévia do público.");
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
      const message = "Selecione um modelo aprovado antes de criar o rascunho.";
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

  const handleCsvFileChange = async (file: File | null) => {
    setCsvPreview(null);
    setCsvPreviewError(null);
    if (!file) {
      setCsvText("");
      setCsvFileName("");
      setCsvHeaders([]);
      setCsvPhoneColumn("");
      setCsvNameColumn("");
      setCsvVariableColumns({});
      return;
    }
    const text = await file.text();
    const headers = parseCsvHeadersForUi(text);
    setCsvText(text);
    setCsvFileName(file.name);
    setCsvHeaders(headers);
    setCsvPhoneColumn((previous) => (previous && headers.includes(previous) ? previous : headers[0] ?? ""));
    setCsvNameColumn((previous) => (previous && headers.includes(previous) ? previous : ""));
    setCsvVariableColumns((previous) =>
      Object.fromEntries(templateVariableLabels.map((label) => [label, headers.includes(previous[label]) ? previous[label] : ""]))
    );
  };

  const buildCsvMappingPayload = () => ({
    phoneColumn: csvPhoneColumn || null,
    nameColumn: csvNameColumn || null,
    variableColumns: csvVariableColumns,
  });

  const handleCsvPreview = async () => {
    if (!session) return;
    const templateId = form.templateId.trim();
    if (!templateId) {
      const message = "Selecione um modelo aprovado antes de importar CSV.";
      setCsvPreviewError(message);
      showToast("error", "CSV incompleto", message);
      return;
    }
    if (!csvText.trim()) {
      const message = "Selecione um arquivo CSV antes de gerar a prévia.";
      setCsvPreviewError(message);
      showToast("error", "CSV incompleto", message);
      return;
    }
    if (!csvPhoneColumn) {
      const message = "Mapeie a coluna de telefone.";
      setCsvPreviewError(message);
      showToast("error", "CSV incompleto", message);
      return;
    }
    setLoadingCsvPreview(true);
    setCsvPreviewError(null);
    try {
      const preview = await previewAppCampaignCsv(session, {
        templateId,
        csvText,
        mapping: buildCsvMappingPayload(),
      });
      setCsvPreview(preview);
      showToast(
        "info",
        "Prévia CSV gerada",
        `${preview.summary.readyToImport} destinatários prontos; ${preview.summary.received - preview.summary.readyToImport} bloqueados ou ignorados.`
      );
    } catch (err) {
      const typed = err as { status?: number; message?: string };
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      const message = typed.message || "Não foi possível gerar a prévia do CSV.";
      setCsvPreviewError(message);
      showToast("error", "Prévia CSV não gerada", message);
    } finally {
      setLoadingCsvPreview(false);
    }
  };

  const handleCreateDraftFromCsv = async () => {
    if (!session) return;
    const name = form.name.trim() || defaultDraftName;
    const templateId = form.templateId.trim();
    if (!templateId) {
      const message = "Selecione um modelo aprovado antes de criar o rascunho.";
      setCsvPreviewError(message);
      showToast("error", "Rascunho CSV incompleto", message);
      return;
    }
    if (!csvText.trim() || !csvPhoneColumn) {
      const message = "Selecione o CSV e mapeie a coluna de telefone.";
      setCsvPreviewError(message);
      showToast("error", "Rascunho CSV incompleto", message);
      return;
    }
    if (csvPreview && csvPreview.summary.readyToImport === 0) {
      const message = "Não há destinatários elegíveis nesta prévia para criar rascunho.";
      setCsvPreviewError(message);
      showToast("warning", "Sem CSV elegível", message);
      return;
    }
    const confirmed = window.confirm("Criar rascunho com os destinatários elegíveis do CSV? Nenhuma mensagem será enviada.");
    if (!confirmed) return;

    setCreatingCsvDraft(true);
    setCsvPreviewError(null);
    try {
      const created = await createAppCampaignDraftFromCsv(session, {
        name,
        templateId,
        csvText,
        mapping: buildCsvMappingPayload(),
      });
      await refreshCampaigns(session, created.campaign.id);
      const detail = await getAppCampaign(session, created.campaign.id);
      setSelectedCampaign(detail.campaign);
      setSelectedCampaignId(created.campaign.id);
      setDetailModalOpen(true);
      setForm(EMPTY_FORM);
      setCsvText("");
      setCsvFileName("");
      setCsvHeaders([]);
      setCsvPhoneColumn("");
      setCsvNameColumn("");
      setCsvVariableColumns({});
      setCsvPreview(null);
      setFormError(null);
      setStatusFilter("draft");
      setActiveTab("drafts");
      setCurrentPage(1);
      showToast(
        "success",
        "Rascunho CSV criado",
        `Revise antes de enviar. Nenhuma mensagem foi enviada. ${created.draft.summary.readyToImport} destinatários elegíveis.`
      );
    } catch (err) {
      const typed = err as { status?: number; message?: string };
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      const message = typed.message || "Não foi possível criar o rascunho pelo CSV.";
      setCsvPreviewError(message);
      showToast("error", "Rascunho CSV não criado", message);
    } finally {
      setCreatingCsvDraft(false);
    }
  };

  const handleSendDraftCampaign = async () => {
    if (!session || !selectedCampaign || selectedCampaign.status !== "draft") return;
    const confirmed = window.confirm(
      "Esta ação iniciará o envio de modelo aprovado para os contatos elegíveis deste rascunho. Contatos com envio ativo bloqueado, anonimizados, sem WhatsApp válido ou duplicados serão revalidados e ignorados antes do envio."
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

  const handleScheduleDraftCampaign = async () => {
    if (!session || !selectedCampaign || selectedCampaign.status !== "draft") return;
    const scheduledAt = scheduleInput ? new Date(scheduleInput) : null;
    if (!scheduledAt || !Number.isFinite(scheduledAt.getTime())) {
      showToast("error", "Agendamento inválido", "Informe uma data e horário futuros.");
      return;
    }
    if (scheduledAt.getTime() <= Date.now()) {
      showToast("error", "Agendamento inválido", "A campanha deve ser agendada para um horário futuro.");
      return;
    }
    setSchedulingDraft(true);
    setDetailError(null);
    try {
      const response = await scheduleAppCampaignDraft(session, selectedCampaign.id, scheduledAt.toISOString());
      setSelectedCampaign(response.campaign);
      await refreshCampaigns(session, response.campaign.id);
      setStatusFilter("scheduled");
      showToast("success", "Campanha agendada", `Envio programado com ${response.schedule.summary.accepted} destinatários elegíveis.`);
    } catch (err) {
      const typed = err as { status?: number; message?: string };
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      const message = typed.message || "Não foi possível agendar a campanha.";
      setDetailError(message);
      showToast("error", "Agendamento não concluído", message);
    } finally {
      setSchedulingDraft(false);
    }
  };

  const handlePauseCampaign = async () => {
    if (!session || !selectedCampaign || selectedCampaign.status !== "sending") return;
    setPausingCampaign(true);
    setDetailError(null);
    try {
      const response = await pauseAppCampaign(session, selectedCampaign.id);
      setSelectedCampaign(response.campaign);
      await refreshCampaigns(session, response.campaign.id);
      showToast("success", "Campanha pausada", "Nenhum novo destinatário será iniciado enquanto estiver pausada.");
    } catch (err) {
      const typed = err as { status?: number; message?: string };
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      const message = typed.message || "Não foi possível pausar a campanha.";
      setDetailError(message);
      showToast("error", "Pausa não concluída", message);
    } finally {
      setPausingCampaign(false);
    }
  };

  const handleResumeCampaign = async () => {
    if (!session || !selectedCampaign || selectedCampaign.status !== "paused") return;
    setResumingCampaign(true);
    setDetailError(null);
    try {
      const response = await resumeAppCampaign(session, selectedCampaign.id);
      setSelectedCampaign(response.campaign);
      await refreshCampaigns(session, response.campaign.id);
      setStatusFilter("sending");
      showToast("success", "Campanha retomada", "O processamento dos destinatários pendentes foi retomado.");
    } catch (err) {
      const typed = err as { status?: number; message?: string };
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      const message = typed.message || "Não foi possível retomar a campanha.";
      setDetailError(message);
      showToast("error", "Retomada não concluída", message);
    } finally {
      setResumingCampaign(false);
    }
  };

  const handleTestSendCampaign = async () => {
    if (!session || !selectedCampaign || (selectedCampaign.status !== "draft" && selectedCampaign.status !== "scheduled")) return;
    const waId = normalizeWaIdList(testRecipientInput)[0] ?? "";
    if (!waId) {
      showToast("error", "Teste incompleto", "Informe um destinatário de teste autorizado.");
      return;
    }
    setTestingCampaign(true);
    setDetailError(null);
    try {
      await sendAppCampaignTest(session, selectedCampaign.id, waId);
      showToast("success", "Teste enviado", "Uma mensagem de teste foi enviada sem alterar os agregados da campanha.");
    } catch (err) {
      const typed = err as { status?: number; message?: string };
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      const message = typed.message || "Não foi possível enviar o teste.";
      setDetailError(message);
      showToast("error", "Teste não enviado", message);
    } finally {
      setTestingCampaign(false);
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
    const fixedVariableValues = labels.map((position, index) => {
      const mapping = campaign.draftSeed?.templateVariableMappings?.find((item) => item.position === position);
      if (mapping?.source === "fixed" && mapping.value) return mapping.value;
      if (mapping?.fallback) return mapping.fallback;
      return templateVariables[index] ?? "";
    });
    setForm({
      templateVariables: syncTemplateVariables(fixedVariableValues, labels.length),
      templateVariableMappings: syncTemplateVariableMappings([], labels),
      ...replayForm,
      templateId: matchedTemplate?.id ?? "",
      templateName: matchedTemplate?.name ?? replayForm.templateName,
      templateParamsInput: syncTemplateVariables(fixedVariableValues, labels.length).join("\n"),
    });
    setFormError(null);
    setAudienceFilters(EMPTY_AUDIENCE_FILTERS);
    setAudiencePreview(null);
    setAudiencePreviewError(null);
    setAudiencePage(1);
    setActiveTab("create");
    setManualSendOpen(true);
    if (replayForm.templateName && !matchedTemplate) {
      showToast(
        "warning",
        "Campanha carregada para reuso",
        "O modelo original não está disponível para campanha. Selecione um modelo ativo antes de criar novo rascunho ou usar envio imediato."
      );
      return;
    }
    showToast(
      "info",
      "Campanha carregada para reuso no envio imediato manual",
      "Revise números, modelo e variáveis antes de enviar."
    );
  };

  if (!session) {
    return <main className="min-h-screen bg-re7-navy" />;
  }

  return (
    <AppShell
      session={session}
      title="Campanhas"
      subtitle="Crie campanhas com modelos aprovados pela Meta, usando contatos elegíveis do CRM."
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
          <div
            role={toast.tone === "error" ? "alert" : "status"}
            onClick={() => setToast(null)}
            className={`cursor-pointer rounded-md border p-3 text-sm shadow-2xl backdrop-blur ${getToastClasses(toast.tone)}`}
          >
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
              Crie campanhas com modelos aprovados pela Meta, usando contatos elegíveis do CRM.
              Antes do envio, a plataforma valida bloqueio de envio ativo, contatos anonimizados,
              WhatsApp válido, duplicidades e variáveis obrigatórias.
            </p>
          </div>
          <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
            {[
              "Escolha a audiência",
              "Valide elegíveis",
              "Escolha o modelo",
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
            Esta prévia não envia mensagens e não cria campanha. Ela apenas valida contatos do CRM para uso futuro em campanhas com modelo aprovado.
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
              <span className="text-white/70">Situação no CRM</span>
              <select
                className="w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white"
                value={audienceFilters.status}
                onChange={(event) =>
                  setAudienceFilters((prev) => ({ ...prev, status: event.target.value }))
                }
              >
                <option value="">Todos os status</option>
                {crmStatuses.map((status) => (
                  <option key={status.id} value={status.id}>
                    {status.label}
                  </option>
                ))}
              </select>
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
          {crmStatusesWarning ? (
            <p className="rounded-md border border-amber-300/25 bg-amber-900/20 p-3 text-xs text-amber-100">
              {crmStatusesWarning}
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
                  <h3 className="mt-1 text-sm font-semibold">Modelo aprovado e rascunho</h3>
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
                  <span className="text-white/70">Modelo aprovado</span>
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
                      Categoria na Meta: {getMetaTemplateCategoryUxLabel(selectedTemplateEffectiveCategory || selectedTemplate.category)}
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
                      Ir para Modelos
                    </a>
                  </div>
                ) : null}
                {selectedTemplateEffectiveCategory === "MARKETING" ? (
                  <div className="rounded-md border border-amber-300/25 bg-amber-900/20 p-3 text-xs text-amber-100 lg:col-span-3">
                    Este modelo está classificado como Marketing pela Meta. Revise política, consentimento e custos antes de enviar.
                  </div>
                ) : null}
                <div className="lg:col-span-3">
                  <CostPreviewCard
                    preview={audienceCostPreview}
                    loading={costPreviewLoading}
                    emptyText={
                      form.templateId
                        ? "A estimativa será exibida após a prévia de audiência."
                        : "Selecione um modelo para estimar custo."
                    }
                  />
                </div>
                {templateVariableLabels.length > 0 ? (
                  <div className="grid gap-3 rounded-md border border-re7-sky/20 bg-re7-sky/10 p-3 lg:col-span-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-re7-sky">Bloco 3</p>
                      <p className="text-sm font-semibold text-sky-100">Variáveis do modelo</p>
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
                  O rascunho não envia mensagens. O envio exige revisão e ação explícita do operador.
                </p>
              </div>
              <div className="overflow-x-auto rounded-md border border-white/10">
                <table className="w-full min-w-[860px] text-sm">
                  <thead className="bg-white/10 text-left">
                    <tr>
                      <th className="px-3 py-2">Contato</th>
                      <th className="px-3 py-2">Referencia</th>
                      <th className="px-3 py-2">Situação no CRM</th>
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
          <div className="rounded-md border border-white/10 bg-white/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-re7-sky">Importação CSV</p>
                <h3 className="mt-1 text-sm font-semibold">Criar rascunho por arquivo</h3>
                <p className="mt-1 text-xs text-white/60">
                  O arquivo é validado antes da criação do rascunho. Nenhuma mensagem é enviada nesta etapa.
                </p>
              </div>
              <span className="rounded-full border border-sky-300/30 bg-sky-900/20 px-3 py-1 text-xs text-sky-100">
                Rascunho
              </span>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(180px,260px)_minmax(180px,260px)]">
              <label className="grid gap-1 text-sm">
                <span className="text-white/70">Arquivo CSV</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="w-full rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white file:mr-3 file:rounded file:border-0 file:bg-re7-orange file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
                  onChange={(event) => void handleCsvFileChange(event.target.files?.[0] ?? null)}
                />
                {csvFileName ? <span className="text-xs text-white/55">{csvFileName}</span> : null}
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-white/70">Coluna de telefone</span>
                <select
                  value={csvPhoneColumn}
                  disabled={csvHeaders.length === 0}
                  onChange={(event) => {
                    setCsvPhoneColumn(event.target.value);
                    setCsvPreview(null);
                  }}
                  className="w-full rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  <option value="">Selecione</option>
                  {csvHeaders.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-white/70">Coluna de nome</span>
                <select
                  value={csvNameColumn}
                  disabled={csvHeaders.length === 0}
                  onChange={(event) => {
                    setCsvNameColumn(event.target.value);
                    setCsvPreview(null);
                  }}
                  className="w-full rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  <option value="">Não mapear</option>
                  {csvHeaders.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </label>
              {templateVariableLabels.length > 0 ? (
                <div className="grid gap-2 lg:col-span-3 md:grid-cols-2 xl:grid-cols-3">
                  {templateVariableLabels.map((label) => (
                    <label key={label} className="grid gap-1 text-sm">
                      <span className="text-white/70">{`Variável {{${label}}}`}</span>
                      <select
                        value={csvVariableColumns[label] ?? ""}
                        disabled={csvHeaders.length === 0}
                        onChange={(event) => {
                          setCsvVariableColumns((prev) => ({ ...prev, [label]: event.target.value }));
                          setCsvPreview(null);
                        }}
                        className="w-full rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white disabled:opacity-50"
                      >
                        <option value="">Selecione</option>
                        {csvHeaders.map((header) => (
                          <option key={header} value={header}>
                            {header}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
            {csvPreviewError ? (
              <p className="mt-3 rounded-md border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100">
                {csvPreviewError}
              </p>
            ) : null}
            {csvPreview ? (
              <div className="mt-3 grid gap-3">
                <div className="grid gap-2 sm:grid-cols-4">
                  <div className="rounded-md border border-white/10 bg-re7-navy/45 p-3">
                    <p className="text-xs uppercase tracking-wide text-white/55">Linhas</p>
                    <p className="mt-1 text-lg font-semibold">{csvPreview.summary.received}</p>
                  </div>
                  <div className="rounded-md border border-emerald-400/20 bg-emerald-900/20 p-3">
                    <p className="text-xs uppercase tracking-wide text-emerald-100/70">Prontos</p>
                    <p className="mt-1 text-lg font-semibold text-emerald-100">{csvPreview.summary.readyToImport}</p>
                  </div>
                  <div className="rounded-md border border-amber-400/20 bg-amber-900/20 p-3">
                    <p className="text-xs uppercase tracking-wide text-amber-100/70">Duplicados</p>
                    <p className="mt-1 text-lg font-semibold text-amber-100">
                      {csvPreview.summary.duplicates + csvPreview.summary.existingDuplicates}
                    </p>
                  </div>
                  <div className="rounded-md border border-red-400/20 bg-red-900/20 p-3">
                    <p className="text-xs uppercase tracking-wide text-red-100/70">Bloqueados</p>
                    <p className="mt-1 text-lg font-semibold text-red-100">
                      {csvPreview.summary.invalid + csvPreview.summary.optOutBlocked + csvPreview.summary.missingRequiredVariables}
                    </p>
                  </div>
                </div>
                {csvPreview.summary.blockedByReason.length > 0 ? (
                  <div className="flex flex-wrap gap-2 text-xs">
                    {csvPreview.summary.blockedByReason.map((item) => (
                      <span key={item.reason} className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-white/75">
                        {item.label}: {item.count}
                      </span>
                    ))}
                  </div>
                ) : null}
                {csvPreview.recipients.length > 0 ? (
                  <div className="overflow-x-auto rounded-md border border-white/10">
                    <table className="w-full min-w-[520px] text-sm">
                      <thead className="bg-white/10 text-left">
                        <tr>
                          <th className="px-3 py-2">Linha</th>
                          <th className="px-3 py-2">Contato</th>
                          <th className="px-3 py-2">Referência</th>
                        </tr>
                      </thead>
                      <tbody>
                        {csvPreview.recipients.slice(0, 8).map((recipient) => (
                          <tr key={`${recipient.rowNumber}-${recipient.phoneDisplay}`} className="border-t border-white/10">
                            <td className="px-3 py-2 text-white/65">{recipient.rowNumber ?? "-"}</td>
                            <td className="px-3 py-2 font-medium">{recipient.identifierDisplay}</td>
                            <td className="px-3 py-2 font-mono text-xs text-white/70">{recipient.phoneDisplay}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={loadingCsvPreview || !csvText || !form.templateId}
                onClick={() => void handleCsvPreview()}
                className="rounded-md border border-white/20 px-3 py-2 text-sm font-semibold text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingCsvPreview ? "Validando..." : "Pré-visualizar CSV"}
              </button>
              <button
                type="button"
                disabled={creatingCsvDraft || !csvText || !form.templateId || (csvPreview ? csvPreview.summary.readyToImport === 0 : false)}
                onClick={() => void handleCreateDraftFromCsv()}
                className="rounded-md bg-re7-orange px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creatingCsvDraft ? "Criando..." : "Criar rascunho com CSV"}
              </button>
            </div>
          </div>
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
                  <span className="text-white/70">Modelo</span>
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
                        ? "Nenhum modelo ativo disponível"
                        : "Selecione um modelo aprovado e ativo"}
                    </option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} - {getMetaTemplateCategoryUxLabel(template.category)}
                      </option>
                    ))}
                  </select>
                </label>
                {templateVariableLabels.length > 0 ? (
                  <div className="grid min-w-0 gap-2.5 lg:col-span-2">
                    <div>
                      <span className="text-sm font-semibold text-white/80">Variáveis do envio imediato</span>
                      <p className="mt-1 text-xs text-white/55">
                        Como este envio usa números informados manualmente, use valores fixos para as variáveis
                        ou revise os valores antes de enviar.
                      </p>
                    </div>
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
                <div className="lg:col-span-2">
                  <CostPreviewCard
                    preview={manualCostPreview}
                    emptyText={
                      form.templateId
                        ? "Informe pelo menos um número para estimar o custo preliminar."
                        : "Selecione um modelo e informe números para estimar custo."
                    }
                  />
                </div>
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
                  <span className="text-white/70">Situação</span>
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
                  <th className="px-2 py-2">Situação</th>
                  <th className="px-2 py-2 text-center">Enviadas</th>
                  <th className="px-2 py-2 text-center">Total</th>
                  <th className="hidden px-2 py-2 lg:table-cell">Modelo</th>
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
                        ? "Você ainda não criou nenhuma campanha."
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
                          <span className="text-xs text-white/60">{formatRelativeTime(campaign.updatedAt)}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-center">{campaign.sentCount}</td>
                      <td className="px-2 py-2 text-center">{campaign.totalRecipients}</td>
                      <td className="hidden px-2 py-2 lg:table-cell">{campaign.templateName || "(sem modelo)"}</td>
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
                      Revise rascunho, situação, público e consumo sem sair da lista.
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
                      <p className="text-xs uppercase tracking-wide text-white/60">Situação</p>
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
                    A situação da campanha é baseada na confirmação da Meta.
                    Relatórios comerciais podem considerar critérios de entrega, leitura e categoria
                    do modelo conforme a regra contratual aplicável.
                  </div>

                  {selectedCampaign.status === "draft" ? (
                    <div className="grid gap-3 rounded-md border border-sky-300/25 bg-sky-900/20 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-sky-100">Rascunho em revisao</p>
                          <p className="mt-1 text-xs text-sky-100/75">
                            Este rascunho ainda não enviou mensagens. Revise modelo e público antes de iniciar.
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
                                  <th className="px-3 py-2">Situação</th>
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

                  {selectedCampaign.status === "draft" || selectedCampaign.status === "scheduled" ? (
                    <div className="grid gap-3 rounded-md border border-white/10 bg-white/5 p-3">
                      <div>
                        <p className="text-sm font-semibold">Teste e agendamento</p>
                        <p className="mt-1 text-xs text-white/60">
                          O teste envia uma única mensagem e não altera os agregados da campanha.
                        </p>
                      </div>
                      <div className="grid gap-3 lg:grid-cols-2">
                        <div className="grid gap-2">
                          <label className="text-xs font-semibold uppercase tracking-wide text-white/60" htmlFor="campaign-test-recipient">
                            Destinatário de teste
                          </label>
                          <div className="flex flex-wrap gap-2">
                            <input
                              id="campaign-test-recipient"
                              value={testRecipientInput}
                              onChange={(event) => setTestRecipientInput(event.target.value)}
                              placeholder="DDD + número"
                              className="min-w-[220px] flex-1 rounded-md border border-white/15 bg-re7-navy/50 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                            />
                            <button
                              type="button"
                              disabled={testingCampaign || !testRecipientInput.trim()}
                              onClick={handleTestSendCampaign}
                              className="rounded-md border border-white/20 px-3 py-2 text-sm font-semibold text-white/85 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {testingCampaign ? "Enviando..." : "Enviar teste"}
                            </button>
                          </div>
                        </div>
                        {selectedCampaign.status === "draft" ? (
                          <div className="grid gap-2">
                            <label className="text-xs font-semibold uppercase tracking-wide text-white/60" htmlFor="campaign-schedule-at">
                              Agendar envio
                            </label>
                            <div className="flex flex-wrap gap-2">
                              <input
                                id="campaign-schedule-at"
                                type="datetime-local"
                                value={scheduleInput}
                                onChange={(event) => setScheduleInput(event.target.value)}
                                className="min-w-[220px] flex-1 rounded-md border border-white/15 bg-re7-navy/50 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                              />
                              <button
                                type="button"
                                disabled={schedulingDraft || sendingDraft || discardingDraft || !scheduleInput}
                                onClick={handleScheduleDraftCampaign}
                                className="rounded-md bg-re7-orange px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {schedulingDraft ? "Agendando..." : "Agendar"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-md border border-indigo-300/25 bg-indigo-900/20 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-100/80">Envio agendado</p>
                            <p className="mt-1 text-sm text-white">
                              {selectedCampaign.scheduledAt ? formatDateTime(selectedCampaign.scheduledAt) : "Sem horário definido"}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {selectedCampaign.status === "sending" || selectedCampaign.status === "paused" || selectedCampaign.status === "scheduled" ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-white/10 bg-white/5 p-3">
                      <div>
                        <p className="text-sm font-semibold">Controle operacional</p>
                        <p className="mt-1 text-xs text-white/60">
                          Pausar impede novos destinatários; cancelar torna a campanha terminal.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedCampaign.status === "sending" ? (
                          <button
                            type="button"
                            disabled={pausingCampaign}
                            onClick={handlePauseCampaign}
                            className="rounded-md border border-white/20 px-3 py-2 text-sm font-semibold text-white/85 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {pausingCampaign ? "Pausando..." : "Pausar"}
                          </button>
                        ) : null}
                        {selectedCampaign.status === "paused" ? (
                          <button
                            type="button"
                            disabled={resumingCampaign}
                            onClick={handleResumeCampaign}
                            className="rounded-md bg-re7-orange px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {resumingCampaign ? "Retomando..." : "Retomar"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={cancelling}
                          onClick={handleCancelCampaign}
                          className="rounded-md border border-red-300/35 px-3 py-2 text-sm font-semibold text-red-100 hover:bg-red-900/30 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {cancelling ? "Cancelando..." : "Cancelar campanha"}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-white/10 bg-white/5 p-3">
                    <div>
                      <p className="text-sm font-semibold">Relatorio de consumo</p>
                      <p className="mt-1 text-xs text-white/60">
                        Exporta CSV com situação de entrega e critério operacional de faturamento.
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
                    <p><span className="text-white/70">Modelo:</span> {selectedCampaign.templateName || "(sem modelo)"}</p>
                    <p><span className="text-white/70">Total de destinatários:</span> {selectedCampaign.totalRecipients}</p>
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
                      <h3 className="text-sm font-semibold">Situação real por mensagem</h3>
                    </div>
                    {selectedCampaign.messagesMetaStatus?.length ? (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[780px] text-sm">
                          <thead className="bg-white/10 text-left">
                            <tr>
                              <th className="px-3 py-2">Referência</th>
                              <th className="px-3 py-2">Situação</th>
                              <th className="px-3 py-2">Categoria</th>
                              <th className="px-3 py-2">Cobrança</th>
                              <th className="px-3 py-2">Faturável</th>
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
                                <td className="px-3 py-2">{getMetaTemplateCategoryUxLabel(item.pricingCategory)}</td>
                                <td className="px-3 py-2">{formatBillingValue(item.pricingBillable)}</td>
                                <td className="px-3 py-2">{getBooleanUxLabel(item.billable)}</td>
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
                      <p className="px-4 py-3 text-sm text-white/70">Nenhuma situação detalhada da Meta disponível ainda para esta campanha.</p>
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
