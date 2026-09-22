"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { buildReplayFormFromCampaign, getFriendlyCampaignError } from "@/lib/campaignDrafts";
import {
  AppCampaignAudiencePreviewResponse,
  AppCampaignImportReport,
  AppCampaignImportPreview,
  AppCampaignReturnDestination,
  AppCampaignReturnDestinationsResponse,
  AppSession,
  AppTemplateItem,
  CrmBusinessStatusConfig,
  cancelAppCampaign,
  clearAppSession,
  createAppCampaign,
  createAppCampaignDraft,
  createAppCampaignDraftFromCsv,
  discardAppCampaignDraft,
  fetchAppCampaignAudiencePreview,
  fetchAppCampaignReturnDestinations,
  fetchAppCrmStatuses,
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
import { getCampaignStatusUxLabel, getMetaTemplateCategoryUxLabel } from "@/lib/appUxLabels";
import { isCampaignComposerDirty } from "@/lib/campaignComposerLifecycle";
import { CampaignItem, formatDateTime, normalizeWaIdList } from "@/lib/whatsappAdminApi";

type CampaignFormState = {
  name: string;
  templateId: string;
  templateName: string;
  templateVariables: string[];
  templateParamsInput: string;
  templateVariableMappings: TemplateVariableMappingFormState[];
  recipientsInput: string;
  returnDestinationType: "human_department" | "automated_flow";
  returnDepartmentId: string;
  returnFlowId: string;
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

type CampaignCenterTab = "create" | "drafts" | "sending" | "scheduled" | "completed" | "blocked" | "all";
type CampaignCreationPanel = "audience" | "csv" | "manual";
type RecipientSelectionMode = "STATIC_RECIPIENTS" | "DYNAMIC_CRM_FILTER";
type CampaignResultStatusFilter = "all" | "delivered" | "sent" | "read" | "blocked" | "failed" | "pending";
type CampaignResultItem = NonNullable<CampaignItem["messagesMetaStatus"]>[number];
type CsvGenericFieldKey = `field${number}`;

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
  returnDestinationType: "human_department",
  returnDepartmentId: "",
  returnFlowId: "",
};

const EMPTY_AUDIENCE_FILTERS: AudiencePreviewFilters = {
  q: "",
  status: "",
  channel: "all",
  hasConversation: "all",
  optOut: "all",
};

const PAGE_SIZE = 5;
const CSV_GENERIC_FIELD_COUNT = 10;
const CSV_GENERIC_FIELDS = Array.from({ length: CSV_GENERIC_FIELD_COUNT }, (_, index) => ({
  index: index + 1,
  key: `field${index + 1}` as CsvGenericFieldKey,
  label: `Campo ${index + 1}`,
}));
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
  { id: "sending", label: "Enviando" },
  { id: "scheduled", label: "Agendadas" },
  { id: "completed", label: "Concluídas" },
  { id: "blocked", label: "Bloqueadas e falhas" },
  { id: "all", label: "Todas" },
];

function ActionIconButton({
  label,
  icon,
  onClick,
  disabled,
  variant = "neutral",
}: {
  label: string;
  icon: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "neutral" | "primary" | "destructive";
}) {
  const classes = {
    neutral: "border-[#d4c7b5] bg-white/70 text-slate-800 hover:bg-white",
    primary: "border-emerald-500/25 bg-emerald-50 text-emerald-900 hover:bg-emerald-100",
    destructive: "border-red-500/25 bg-red-50 text-red-900 hover:bg-red-100",
  }[variant];
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`flex h-9 w-9 items-center justify-center rounded-xl border text-base transition disabled:cursor-not-allowed disabled:opacity-50 max-[1366px]:h-8 max-[1366px]:w-8 max-md:h-10 max-md:w-10 ${classes}`}
    >
      <span aria-hidden="true">{icon}</span>
    </button>
  );
}

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

function CampaignMessagePreview({ content, detail }: { content: string | null; detail: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-re7-navy/50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Como a mensagem chegará</p>
      {content ? (
        <div className="mt-2 max-w-2xl rounded-md border border-emerald-300/15 bg-emerald-950/25 px-3 py-2.5 text-sm text-white/85 shadow-sm">
          <p className="whitespace-pre-wrap">{content}</p>
        </div>
      ) : (
        <p className="mt-2 text-sm text-white/55">Selecione um modelo aprovado para visualizar a mensagem.</p>
      )}
      <p className="mt-2 text-xs text-white/50">{detail}</p>
    </div>
  );
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

function getStatusClasses(status: string) {
  switch (status) {
    case "draft":
      return "campaign-status-draft";
    case "scheduled":
      return "campaign-status-scheduled";
    case "sending":
      return "campaign-status-sending";
    case "paused":
      return "campaign-status-paused";
    case "completed":
      return "campaign-status-completed";
    case "blocked":
      return "campaign-status-blocked";
    case "cancelled":
      return "campaign-status-cancelled";
    case "failed":
      return "campaign-status-failed";
    default:
      return "campaign-status-default";
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
    case "blocked":
    case "opt_out":
      return "bg-amber-600 text-white";
    case "skipped":
      return "bg-orange-600 text-white";
    case "pending":
      return "bg-indigo-600 text-white";
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
    case "blocked":
      return "Bloqueada";
    case "opt_out":
      return "Opt-out";
    case "skipped":
      return "Ignorada";
    case "pending":
      return "Pendente";
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
      classes: "campaign-panel-info",
    };
  }
  if (campaign.status === "cancelled") {
    return {
      label: "Rascunho descartado",
      icon: "INFO",
      classes: "campaign-panel-neutral",
    };
  }
  if (campaign.status === "sending") {
    return {
      label: "Envio em andamento",
      icon: "INFO",
      classes: "campaign-panel-warning",
    };
  }
  const totalRecipients = campaign.totalRecipients || 0;
  const metaSummary = campaign.metaSummary;
  const deliveredOrRead = (metaSummary?.totalDelivered ?? 0) + (metaSummary?.totalRead ?? 0);
  const sent = metaSummary?.totalSent ?? 0;
  const failed = metaSummary?.totalFailed ?? 0;
  const hasSuccessfulDeliverySignal = deliveredOrRead > 0 || sent > 0;

  if (totalRecipients > 0 && failed >= totalRecipients && !hasSuccessfulDeliverySignal) {
    return {
      label: "Falha na campanha",
      icon: "X",
      classes: "campaign-panel-danger",
    };
  }
  if (totalRecipients > 0 && deliveredOrRead >= totalRecipients) {
    return {
      label: `Entregue para ${totalRecipients}/${totalRecipients} destinatários`,
      icon: "OK",
      classes: "campaign-panel-success",
    };
  }
  return {
    label: "Entrega parcial",
    icon: "!",
    classes: "campaign-panel-warning",
  };
}

function formatCampaignRecipientReference(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits || value || "-";
}

function getAudienceEligibilityClasses(eligible: boolean) {
  return eligible
    ? "campaign-panel-success"
    : "campaign-panel-warning";
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
    case "completed":
      return "completed";
    case "sending":
      return "sending";
    case "scheduled":
      return "scheduled";
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
  const [requestedCampaignId, setRequestedCampaignId] = useState<string | null>(null);
  const [session, setSession] = useState<AppSession | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [templates, setTemplates] = useState<AppTemplateItem[]>([]);
  const [returnDestinations, setReturnDestinations] = useState<AppCampaignReturnDestinationsResponse | null>(null);
  const [crmStatuses, setCrmStatuses] = useState<CrmBusinessStatusConfig[]>([]);
  const [crmStatusesWarning, setCrmStatusesWarning] = useState<string | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignItem | null>(null);
  const [form, setForm] = useState<CampaignFormState>(EMPTY_FORM);
  const [audienceFilters, setAudienceFilters] = useState<AudiencePreviewFilters>(EMPTY_AUDIENCE_FILTERS);
  const [audiencePreview, setAudiencePreview] = useState<AppCampaignAudiencePreviewResponse | null>(null);
  const [audiencePage, setAudiencePage] = useState(1);
  const [loadingAudiencePreview, setLoadingAudiencePreview] = useState(false);
  const [audiencePreviewError, setAudiencePreviewError] = useState<string | null>(null);
  const [csvText, setCsvText] = useState("");
  const [csvFileName, setCsvFileName] = useState("");
  const [csvInputKey, setCsvInputKey] = useState(0);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPhoneColumn, setCsvPhoneColumn] = useState("");
  const [csvGenericFieldColumns, setCsvGenericFieldColumns] = useState<Record<CsvGenericFieldKey, string>>(
    () => Object.fromEntries(CSV_GENERIC_FIELDS.map((field) => [field.key, ""])) as Record<CsvGenericFieldKey, string>
  );
  const [csvVariableColumns, setCsvVariableColumns] = useState<Record<string, string>>({});
  const [csvPreview, setCsvPreview] = useState<AppCampaignImportPreview | null>(null);
  const [csvImportReport, setCsvImportReport] = useState<AppCampaignImportReport | null>(null);
  const [csvPreviewError, setCsvPreviewError] = useState<string | null>(null);
  const [loadingCsvPreview, setLoadingCsvPreview] = useState(false);
  const [creatingCsvDraft, setCreatingCsvDraft] = useState(false);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [audienceRecipientMode, setAudienceRecipientMode] = useState<RecipientSelectionMode>("STATIC_RECIPIENTS");
  const [sendingDraft, setSendingDraft] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [expandedCreationPanel, setExpandedCreationPanel] = useState<CampaignCreationPanel | null>(null);
  const [activeTab, setActiveTab] = useState<CampaignCenterTab>("create");
  const [statusFilter, setStatusFilter] = useState<CampaignStatusFilter>("all");
  const [search, setSearch] = useState("");
  const [resultStatusFilter, setResultStatusFilter] = useState<CampaignResultStatusFilter>("all");
  const [resultCrmStatusFilter, setResultCrmStatusFilter] = useState("all");
  const [resultSearch, setResultSearch] = useState("");
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
  const [testVariableValues, setTestVariableValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [toast, setToast] = useState<CampaignToast | null>(null);
  const audienceRequestGenerationRef = useRef(0);
  const csvRequestGenerationRef = useRef(0);
  const manualSendOpen = expandedCreationPanel === "manual";

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

  useEffect(() => {
    setRequestedCampaignId(new URLSearchParams(window.location.search).get("campaignId"));
  }, []);

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
    if (!selectedTemplate?.content) return null;
    return buildTemplatePreviewFromMappings(selectedTemplate.content, form.templateVariableMappings);
  }, [form.templateVariableMappings, selectedTemplate]);

  const manualTemplatePreview = useMemo(() => {
    if (!selectedTemplate?.content) return null;
    return buildTemplatePreview(selectedTemplate.content, form.templateVariables);
  }, [form.templateVariables, selectedTemplate]);

  const csvTemplatePreview = useMemo(() => {
    if (!selectedTemplate?.content) return null;
    const sampleVariables = csvPreview?.recipients[0]?.variables ?? {};
    return buildTemplatePreview(
      selectedTemplate.content,
      templateVariableLabels.map((position) => sampleVariables[position] ?? `{{${position}}}`)
    );
  }, [csvPreview, selectedTemplate, templateVariableLabels]);

  const templateVariableMappingError = useMemo(
    () =>
      templateVariableLabels.length > 0
        ? getTemplateVariableMappingError(form.templateVariableMappings)
        : null,
    [form.templateVariableMappings, templateVariableLabels.length]
  );
  const selectedCampaignTemplate = useMemo(
    () =>
      templates.find((item) => selectedCampaign?.templateId && item.id === selectedCampaign.templateId) ??
      templates.find((item) => item.name === selectedCampaign?.templateName) ??
      null,
    [selectedCampaign, templates]
  );
  const selectedCampaignTestVariableLabels = useMemo(
    () => getTemplateVariablePositions(selectedCampaignTemplate),
    [selectedCampaignTemplate]
  );
  const campaignTestVariablesIncomplete = selectedCampaignTestVariableLabels.some(
    (label) => !(testVariableValues[label] ?? "").trim()
  );

  useEffect(() => {
    setTestVariableValues((previous) =>
      Object.fromEntries(selectedCampaignTestVariableLabels.map((label) => [label, previous[label] ?? ""]))
    );
  }, [selectedCampaign?.id, selectedCampaignTestVariableLabels]);

  const audienceEligibleItems = useMemo(
    () => audiencePreview?.items.filter((item) => item.eligible) ?? [],
    [audiencePreview]
  );

  useEffect(() => {
    csvRequestGenerationRef.current += 1;
    setCsvVariableColumns((previous) =>
      Object.fromEntries(templateVariableLabels.map((label) => [label, previous[label] ?? ""]))
    );
    setCsvPreview(null);
    setCsvPreviewError(null);
  }, [templateVariableLabels]);

  const selectedReturnDepartment = useMemo(
    () => returnDestinations?.departments.find((item) => item.id === form.returnDepartmentId) ?? null,
    [form.returnDepartmentId, returnDestinations]
  );

  const selectedReturnFlow = useMemo(
    () => returnDestinations?.flows.find((item) => item.id === form.returnFlowId) ?? null,
    [form.returnFlowId, returnDestinations]
  );

  const buildReturnDestinationPayload = useCallback((): { ok: true; value: AppCampaignReturnDestination } | { ok: false; message: string } => {
    if (form.returnDestinationType === "automated_flow") {
      if (!form.returnFlowId) return { ok: false, message: "Selecione o fluxo automatizado que receberá as respostas." };
      return { ok: true, value: { type: "automated_flow", flowId: form.returnFlowId } };
    }
    if (!form.returnDepartmentId) return { ok: false, message: "Selecione o setor que receberá as respostas." };
    if (!selectedReturnDepartment) return { ok: false, message: "Selecione um setor válido para receber as respostas." };
    if (!selectedReturnDepartment.operationalReady) {
      return { ok: false, message: "Este setor ainda não está disponível para receber atendimentos." };
    }
    return {
      ok: true,
      value: {
        type: "human_department",
        departmentId: selectedReturnDepartment.id,
      },
    };
  }, [form.returnDepartmentId, form.returnDestinationType, form.returnFlowId, selectedReturnDepartment]);

  const returnDestinationEditor = (
    <div className="grid gap-3 rounded-md border border-white/10 bg-re7-navy/45 p-3 lg:col-span-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-re7-sky">Destino das respostas</p>
        <p className="mt-1 text-xs text-white/60">
          Escolha qual fluxo ou setor será iniciado quando a pessoa responder à campanha.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setForm((prev) => ({ ...prev, returnDestinationType: "human_department" }))}
          className={`rounded-md border px-3 py-2 text-sm font-semibold ${
            form.returnDestinationType === "human_department"
              ? "border-re7-sky bg-re7-sky/20 text-white"
              : "border-white/15 bg-white/5 text-white/75 hover:bg-white/10"
          }`}
        >
          Atendimento humano
        </button>
        <button
          type="button"
          onClick={() => setForm((prev) => ({ ...prev, returnDestinationType: "automated_flow" }))}
          className={`rounded-md border px-3 py-2 text-sm font-semibold ${
            form.returnDestinationType === "automated_flow"
              ? "border-re7-sky bg-re7-sky/20 text-white"
              : "border-white/15 bg-white/5 text-white/75 hover:bg-white/10"
          }`}
        >
          Fluxo automatizado
        </button>
      </div>
      {form.returnDestinationType === "human_department" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="text-white/70">Setor</span>
            <select
              className="w-full rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white"
              value={form.returnDepartmentId}
              onChange={(event) => {
                setForm((prev) => ({
                  ...prev,
                  returnDepartmentId: event.target.value,
                }));
              }}
            >
              <option value="">Selecionar setor</option>
              {(returnDestinations?.departments ?? []).map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
          {selectedReturnDepartment && !selectedReturnDepartment.operationalReady ? (
            <p className="rounded-md border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100 md:col-span-2">
              Este setor ainda não está disponível para receber atendimentos.
            </p>
          ) : null}
        </div>
      ) : (
        <label className="grid gap-1 text-sm">
          <span className="text-white/70">Fluxo</span>
          <select
            className="w-full rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white"
            value={form.returnFlowId}
            onChange={(event) => setForm((prev) => ({ ...prev, returnFlowId: event.target.value }))}
          >
            <option value="">Selecionar fluxo</option>
            {(returnDestinations?.flows ?? []).map((flow) => (
              <option key={flow.id} value={flow.id}>
                {flow.entryPoint ? `${flow.name} - Principal` : flow.name}
              </option>
            ))}
          </select>
          {selectedReturnFlow ? (
            <span className="text-xs text-white/55">
              {selectedReturnFlow.entryPoint
                ? "Principal — também utilizado como entrada padrão para novas conversas."
                : "Fluxo ativo disponível para esta campanha."}
            </span>
          ) : null}
        </label>
      )}
    </div>
  );

  const draftSetupEditor = (
    <div className="grid gap-3 rounded-md border border-sky-300/20 bg-sky-950/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-re7-sky">Configuração comum</p>
          <h3 className="mt-1 text-sm font-semibold">Modelo e destino</h3>
          <p className="mt-1 text-xs text-white/60">
            Esta configuração vale para audiência CRM, importação CSV e envio imediato manual.
          </p>
        </div>
        <span className="rounded-full border border-sky-300/25 bg-sky-900/20 px-3 py-1 text-xs text-sky-100">
          Compartilhada
        </span>
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(240px,360px)]">
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
              setCsvPreview(null);
              setCsvImportReport(null);
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
      </div>
      {templates.length === 0 ? (
        <div className="rounded-md border border-amber-300/25 bg-amber-900/20 p-3 text-xs text-amber-100">
          <p className="font-semibold">Não há modelos ativos disponíveis para campanha.</p>
          <p className="mt-1 text-amber-100/80">
            Verifique os modelos aprovados ou reative um modelo em Modelos Meta.
          </p>
          <a
            href="/app/templates?tab=meta-templates"
            className="mt-2 inline-flex rounded-md border border-amber-200/40 px-3 py-1.5 font-semibold hover:bg-amber-200/10"
          >
            Ir para Modelos Meta
          </a>
        </div>
      ) : null}
      {selectedTemplateEffectiveCategory === "MARKETING" ? (
        <div className="rounded-md border border-amber-300/25 bg-amber-900/20 p-3 text-xs text-amber-100">
          Este modelo está classificado como Marketing pela Meta. Revise política e consentimento antes de enviar.
        </div>
      ) : null}
      {returnDestinationEditor}
    </div>
  );

  const audienceVariablesEditor = templateVariableLabels.length > 0 ? (
    <div className="grid gap-3 rounded-md border border-emerald-300/20 bg-emerald-950/15 p-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-100/80">Variáveis para audiência CRM</p>
        <p className="mt-1 text-xs text-white/60">
          Usadas somente no caminho de filtros do CRM. Para CSV, mapeie as variáveis pelas colunas do arquivo.
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
              <span className="text-white/70">Origem</span>
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
      {templateVariableMappingError ? (
        <p className="rounded-md border border-amber-300/25 bg-amber-900/20 p-3 text-xs text-amber-100">
          {templateVariableMappingError}
        </p>
      ) : null}
    </div>
  ) : null;

  const audiencePreviewDisabledReason = !form.templateId
    ? "Selecione um modelo aprovado para gerar a prévia."
    : audienceRecipientMode === "DYNAMIC_CRM_FILTER" && !audienceFilters.status
      ? "Selecione uma Situação no CRM para estimar a campanha dinâmica."
      : templateVariableMappingError;

  const canGenerateAudiencePreview = Boolean(session && !audiencePreviewDisabledReason && !loadingAudiencePreview);
  const mappedCsvGenericFields = useMemo(
    () => CSV_GENERIC_FIELDS.filter((field) => Boolean(csvGenericFieldColumns[field.key])),
    [csvGenericFieldColumns]
  );
  const csvFieldColumnsByKey = useMemo(
    () => csvGenericFieldColumns,
    [csvGenericFieldColumns]
  );
  const csvVariableMappingIncomplete = useMemo(
    () =>
      templateVariableLabels.some((label) => {
        const source = csvVariableColumns[label];
        return !source || !csvFieldColumnsByKey[source as CsvGenericFieldKey];
      }),
    [csvFieldColumnsByKey, csvVariableColumns, templateVariableLabels]
  );

  const isComposerDirty = useMemo(() => {
    return isCampaignComposerDirty({
      form,
      audienceFilters,
      hasAudiencePreview: audiencePreview !== null,
      csv: {
        text: csvText,
        fileName: csvFileName,
        headers: csvHeaders,
        phoneColumn: csvPhoneColumn,
        genericFieldColumns: csvGenericFieldColumns,
        variableColumns: csvVariableColumns,
        hasPreview: csvPreview !== null,
        hasImportReport: csvImportReport !== null,
      },
    });
  }, [
    audienceFilters,
    audiencePreview,
    csvFileName,
    csvGenericFieldColumns,
    csvHeaders,
    csvImportReport,
    csvPhoneColumn,
    csvPreview,
    csvText,
    csvVariableColumns,
    form,
  ]);

  const composerBusy =
    loadingAudiencePreview || loadingCsvPreview || creatingDraft || creatingCsvDraft || creating;

  const resetCampaignComposer = useCallback(() => {
    audienceRequestGenerationRef.current += 1;
    csvRequestGenerationRef.current += 1;
    setForm(EMPTY_FORM);
    setAudienceFilters(EMPTY_AUDIENCE_FILTERS);
    setAudiencePreview(null);
    setAudiencePage(1);
    setLoadingAudiencePreview(false);
    setAudiencePreviewError(null);
    setCsvText("");
    setCsvFileName("");
    setCsvHeaders([]);
    setCsvPhoneColumn("");
    setCsvGenericFieldColumns(
      Object.fromEntries(CSV_GENERIC_FIELDS.map((field) => [field.key, ""])) as Record<CsvGenericFieldKey, string>
    );
    setCsvVariableColumns({});
    setCsvPreview(null);
    setCsvImportReport(null);
    setCsvPreviewError(null);
    setLoadingCsvPreview(false);
    setCsvInputKey((current) => current + 1);
    setExpandedCreationPanel(null);
    setFormError(null);
    setToast(null);
  }, []);

  const confirmComposerDiscard = useCallback(() => {
    if (!isComposerDirty) return true;
    return window.confirm(
      "Descartar campanha?\n\nAs informações desta campanha que ainda não foram salvas serão removidas."
    );
  }, [isComposerDirty]);

  const handleDiscardComposer = useCallback(() => {
    if (composerBusy || !confirmComposerDiscard()) return;
    resetCampaignComposer();
    showToast("info", "Campanha descartada", "As informações que ainda não haviam sido salvas foram removidas.");
  }, [composerBusy, confirmComposerDiscard, resetCampaignComposer, showToast]);

  const handleCampaignTabChange = useCallback(
    (tab: CampaignCenterTab) => {
      if (tab === activeTab) return;
      if (activeTab === "create" && composerBusy) {
        showToast("info", "Operação em andamento", "Aguarde a operação atual antes de sair da nova campanha.");
        return;
      }
      if (activeTab === "create" && !confirmComposerDiscard()) return;
      resetCampaignComposer();
      setActiveTab(tab);
      setStatusFilter(getTabStatusFilter(tab));
      setCurrentPage(1);
    },
    [activeTab, composerBusy, confirmComposerDiscard, resetCampaignComposer, showToast]
  );

  const campaignStats = useMemo(() => {
    return campaigns.reduce(
      (acc, campaign) => {
        acc.total += 1;
        if (campaign.status === "draft") acc.drafts += 1;
        if (campaign.status === "sending") acc.sending += 1;
        if (campaign.status === "scheduled") acc.scheduled += 1;
        if (campaign.status === "completed") acc.completed += 1;
        if (campaign.status === "blocked") acc.blocked += 1;
        if (campaign.status === "failed") acc.failed += 1;
        return acc;
      },
      { total: 0, drafts: 0, sending: 0, scheduled: 0, completed: 0, blocked: 0, failed: 0 }
    );
  }, [campaigns]);

  const getCampaignTabCount = useCallback(
    (tab: CampaignCenterTab) => {
      switch (tab) {
        case "drafts":
          return campaignStats.drafts;
        case "sending":
          return campaignStats.sending;
        case "scheduled":
          return campaignStats.scheduled;
        case "completed":
          return campaignStats.completed;
        case "blocked":
          return campaignStats.blocked + campaignStats.failed;
        case "all":
          return campaignStats.total;
        case "create":
        default:
          return null;
      }
    },
    [campaignStats]
  );

  const openCampaignDetail = useCallback((campaignId: string) => {
    setSelectedCampaignId(campaignId);
    setDetailModalOpen(true);
    setActiveTab((current) => (current === "create" ? "all" : current));
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
      refreshCampaigns(session, requestedCampaignId),
      refreshTemplates(session),
      fetchAppCampaignReturnDestinations(session).then((response) => {
        setReturnDestinations(response);
      }),
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
  }, [handleUnauthorized, refreshCampaigns, refreshTemplates, requestedCampaignId, session]);

  useEffect(() => {
    if (!requestedCampaignId) return;
    openCampaignDetail(requestedCampaignId);
  }, [openCampaignDetail, requestedCampaignId]);

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

  useEffect(() => {
    setResultStatusFilter("all");
    setResultCrmStatusFilter("all");
    setResultSearch("");
  }, [selectedCampaignId]);

  const shouldPoll = useMemo(() => {
    if (selectedCampaignId) {
      return selectedCampaign?.status === "sending";
    }
    return campaigns.some((item) => item.status === "sending");
  }, [campaigns, selectedCampaign?.status, selectedCampaignId]);

  const campaignResultItems = useMemo(
    () => selectedCampaign?.messagesMetaStatus ?? [],
    [selectedCampaign?.messagesMetaStatus]
  );

  const resultStatusOptions = useMemo(() => {
    const existing = new Set(campaignResultItems.map((item) => item.status));
    const options: Array<{ id: CampaignResultStatusFilter; label: string }> = [{ id: "all", label: "Todos" }];
    for (const option of [
      { id: "delivered" as const, label: "Entregues" },
      { id: "sent" as const, label: "Enviadas/aceitas" },
      { id: "read" as const, label: "Lidas" },
      { id: "blocked" as const, label: "Bloqueadas" },
      { id: "failed" as const, label: "Falhas" },
      { id: "pending" as const, label: "Pendentes" },
    ]) {
      if (
        existing.has(option.id) ||
        (option.id === "blocked" && (existing.has("blocked") || existing.has("opt_out") || existing.has("skipped")))
      ) {
        options.push(option);
      }
    }
    return options;
  }, [campaignResultItems]);

  const resultCrmStatusOptions = useMemo(() => {
    const existing = new Set(campaignResultItems.map((item) => item.crmStatus).filter(Boolean));
    return crmStatuses.filter((status) => existing.has(status.id));
  }, [campaignResultItems, crmStatuses]);

  const filteredCampaignResultItems = useMemo(() => {
    const query = resultSearch.trim().toLowerCase();
    return campaignResultItems.filter((item) => {
      if (resultStatusFilter !== "all") {
        if (resultStatusFilter === "blocked") {
          if (!["blocked", "opt_out", "skipped"].includes(item.status)) return false;
        } else if (item.status !== resultStatusFilter) {
          return false;
        }
      }
      if (resultCrmStatusFilter !== "all" && item.crmStatus !== resultCrmStatusFilter) return false;
      if (query) {
        const haystack = [
          item.contactName,
          item.phoneDisplay,
          item.waId,
          item.crmStatusLabel,
          item.crmStatus,
          item.error,
        ].join(" ").toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [campaignResultItems, resultCrmStatusFilter, resultSearch, resultStatusFilter]);

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
  }, [selectedCampaign]);

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

  useEffect(() => {
    if (!session || !detailModalOpen || !selectedCampaignId || selectedCampaign?.status !== "sending") return;
    const timer = window.setInterval(() => {
      void refreshCampaignDetail(session, selectedCampaignId);
      void refreshCampaigns(session, selectedCampaignId);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [detailModalOpen, refreshCampaignDetail, refreshCampaigns, selectedCampaign?.status, selectedCampaignId, session]);

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
    const returnDestination = buildReturnDestinationPayload();
    if (!returnDestination.ok) {
      setFormError(`Erro ao criar campanha: ${returnDestination.message}`);
      showToast("error", "Destino das respostas incompleto", returnDestination.message);
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
        returnDestination: returnDestination.value,
      });
      await refreshCampaigns(session, created.campaign.campaignId);
      if (created.campaign.campaignId) {
        const detail = await getAppCampaign(session, created.campaign.campaignId);
        setSelectedCampaign(detail.campaign);
      }
      setSelectedCampaignId(created.campaign.campaignId);
      setCurrentPage(1);
      resetCampaignComposer();
      setActiveTab("sending");
      setStatusFilter("sending");
      setDetailModalOpen(true);
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

  const loadAudiencePreview = useCallback(
    async (nextPage = audiencePage) => {
      if (!session) return;
      const requestGeneration = audienceRequestGenerationRef.current;
      setLoadingAudiencePreview(true);
      setAudiencePreviewError(null);
      try {
        const dynamicPreview = audienceRecipientMode === "DYNAMIC_CRM_FILTER";
        const response = await fetchAppCampaignAudiencePreview(session, {
          q: dynamicPreview ? "" : audienceFilters.q,
          status: audienceFilters.status,
          channel: dynamicPreview ? null : audienceFilters.channel === "all" ? null : audienceFilters.channel,
          hasConversation:
            dynamicPreview || audienceFilters.hasConversation === "all"
              ? null
              : audienceFilters.hasConversation === "true",
          optOut:
            dynamicPreview || audienceFilters.optOut === "all"
              ? null
              : audienceFilters.optOut === "true",
          page: nextPage,
          limit: 25,
        });
        if (requestGeneration !== audienceRequestGenerationRef.current) return;
        setAudiencePreview(response);
        setAudiencePage(nextPage);
      } catch (err) {
        if (requestGeneration !== audienceRequestGenerationRef.current) return;
        const typed = err as { status?: number; message?: string };
        if (typed.status === 401) {
          handleUnauthorized();
          return;
        }
        setAudiencePreviewError(typed.message || "Não foi possível gerar a prévia do público.");
      } finally {
        if (requestGeneration === audienceRequestGenerationRef.current) setLoadingAudiencePreview(false);
      }
    },
    [audienceFilters, audiencePage, audienceRecipientMode, handleUnauthorized, session]
  );

  const handleAudiencePreviewSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (audiencePreviewDisabledReason) {
      setAudiencePreviewError(null);
      showToast("warning", "Prévia incompleta", audiencePreviewDisabledReason);
      return;
    }
    await loadAudiencePreview(1);
  };

  const handleClearAudienceFilters = () => {
    audienceRequestGenerationRef.current += 1;
    setAudienceFilters(EMPTY_AUDIENCE_FILTERS);
    setAudiencePage(1);
    setAudiencePreview(null);
    setAudiencePreviewError(null);
    setLoadingAudiencePreview(false);
    setToast(null);
    setForm((prev) => ({
      ...prev,
      templateVariableMappings: syncTemplateVariableMappings(prev.templateVariableMappings, templateVariableLabels),
    }));
  };

  const copyTextToClipboard = async (text: string) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  };

  const handleCopyFilteredResults = async () => {
    if (!selectedCampaign) return;
    const header = "Nome\tTelefone\tSituação CRM\tResultado\tEntrega\tErro";
    const rows = filteredCampaignResultItems.map((item) =>
      [
        item.contactName || "",
        item.phoneDisplay || item.waId,
        item.crmStatusLabel || item.crmStatus || "",
        getMetaStatusLabel(item.status),
        item.deliveredAt ? formatDateTime(item.deliveredAt) : "",
        getFriendlyCampaignError(item.error)?.summary || item.error || "",
      ].join("\t")
    );
    try {
      await copyTextToClipboard([header, ...rows].join("\n"));
      showToast("success", "Filtrados copiados", `${rows.length} destinatário(s) copiados para a área de transferência.`);
    } catch {
      showToast("error", "Cópia não concluída", "Não foi possível acessar a área de transferência.");
    }
  };

  const handleReuseFilteredResults = () => {
    if (!selectedCampaign) return;
    const reusable = filteredCampaignResultItems.filter((item) => item.leadId);
    const excluded = filteredCampaignResultItems.length - reusable.length;
    if (reusable.length === 0) {
      showToast("warning", "Nenhum contato reutilizável", "Os filtrados não possuem contato canônico atual para pré-carregar.");
      return;
    }
    const uniqueByLeadId = new Map<string, CampaignResultItem>();
    for (const item of reusable) {
      if (item.leadId && !uniqueByLeadId.has(item.leadId)) {
        uniqueByLeadId.set(item.leadId, item);
      }
    }
    const items = Array.from(uniqueByLeadId.values()).map((item) => ({
      leadId: item.leadId as string,
      contactId: null,
      displayName: item.contactName ?? null,
      companyName: null,
      city: null,
      crmStatus: item.crmStatus ?? "",
      crmStatusLabel: item.crmStatusLabel ?? item.crmStatus ?? "",
      channel: "whatsapp",
      phoneDisplay: item.phoneDisplay ?? item.waId,
      identifierDisplay: item.contactName || item.phoneDisplay || item.waId,
      activeOptOut: false,
      isAnonymized: false,
      hasValidWhatsappIdentity: true,
      lastConversationIdentity: null,
      lastProtocol: null,
      importedSource: `Filtro da campanha ${selectedCampaign.name || selectedCampaign.id}`,
      updatedAt: selectedCampaign.updatedAt,
      eligible: true,
      blockedReason: null,
      blockedReasonLabel: null,
    }));
    const syntheticPreview: AppCampaignAudiencePreviewResponse = {
      ok: true,
      filters: {
        q: "",
        status: null,
        channel: "whatsapp",
        hasConversation: null,
        optOut: null,
        updatedFrom: null,
        updatedTo: null,
        onlyWhatsappEligible: true,
        excludeOptOut: null,
        crmStatus: null,
        city: null,
        importedSource: "campaign-result-filter",
      },
      summary: {
        total: filteredCampaignResultItems.length,
        analyzed: filteredCampaignResultItems.length,
        eligible: items.length,
        blocked: excluded,
        truncated: false,
        blockedByReason: excluded > 0
          ? [{ reason: "missing_contact", label: "Sem contato canônico atual", count: excluded }]
          : [],
      },
      items,
      pagination: {
        page: 1,
        limit: items.length,
        total: items.length,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
      generatedAt: new Date().toISOString(),
    };
    setAudiencePreview(syntheticPreview);
    setAudiencePreviewError(null);
    setAudiencePage(1);
    setForm((prev) => ({
      ...prev,
      name: prev.name || `Reuso - ${selectedCampaign.name || "campanha"}`,
      templateId: prev.templateId || selectedCampaign.templateId || "",
      templateName: prev.templateName || selectedCampaign.templateName || "",
      templateVariableMappings: syncTemplateVariableMappings(prev.templateVariableMappings, templateVariableLabels),
    }));
    setActiveTab("create");
    setExpandedCreationPanel("audience");
    setDetailModalOpen(false);
    showToast(
      excluded > 0 ? "warning" : "success",
      "Filtrados carregados no composer",
      `${items.length} contato(s) canônico(s) carregados. ${excluded > 0 ? `${excluded} sem contato atual foram excluídos explicitamente.` : "Nenhuma mensagem foi enviada."}`
    );
  };

  const resetCsvImportState = () => {
    csvRequestGenerationRef.current += 1;
    setCsvText("");
    setCsvFileName("");
    setCsvHeaders([]);
    setCsvPhoneColumn("");
    setCsvGenericFieldColumns(
      Object.fromEntries(CSV_GENERIC_FIELDS.map((field) => [field.key, ""])) as Record<CsvGenericFieldKey, string>
    );
    setCsvVariableColumns({});
    setCsvPreview(null);
    setCsvImportReport(null);
    setCsvPreviewError(null);
    setLoadingCsvPreview(false);
    setCsvInputKey((prev) => prev + 1);
    setToast(null);
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
    const returnDestination = buildReturnDestinationPayload();
    if (!returnDestination.ok) {
      setAudiencePreviewError(returnDestination.message);
      showToast("error", "Destino das respostas incompleto", returnDestination.message);
      return;
    }

    setCreatingDraft(true);
    setAudiencePreviewError(null);
    try {
      const created = await createAppCampaignDraft(session, {
        name,
        templateId,
        selectedLeadIds,
        returnDestination: returnDestination.value,
        ...(templateVariableLabels.length > 0
          ? { templateVariableMappings: buildTemplateVariableMappingsPayload(form.templateVariableMappings) }
          : {}),
      });
      await refreshCampaigns(session, created.campaign.id);
      const detail = await getAppCampaign(session, created.campaign.id);
      setSelectedCampaign(detail.campaign);
      setSelectedCampaignId(created.campaign.id);
      setDetailModalOpen(true);
      resetCampaignComposer();
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

  const handleCreateDynamicScheduledCampaign = async () => {
    if (!session) return;
    const name = form.name.trim() || defaultDraftName;
    const templateId = form.templateId.trim();
    const crmBusinessStatusId = audienceFilters.status.trim();
    const scheduledAt = scheduleInput ? new Date(scheduleInput) : null;
    if (!templateId) {
      const message = "Selecione um modelo aprovado antes de agendar.";
      setAudiencePreviewError(message);
      showToast("error", "Agendamento incompleto", message);
      return;
    }
    if (!crmBusinessStatusId) {
      const message = "Selecione uma Situação no CRM para o filtro dinâmico.";
      setAudiencePreviewError(message);
      showToast("error", "Filtro incompleto", message);
      return;
    }
    if (!scheduledAt || !Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
      const message = "Informe uma data e horário futuros para o agendamento dinâmico.";
      setAudiencePreviewError(message);
      showToast("error", "Agendamento inválido", message);
      return;
    }
    if (templateVariableMappingError) {
      setAudiencePreviewError(templateVariableMappingError);
      showToast("error", "Agendamento incompleto", templateVariableMappingError);
      return;
    }
    const returnDestination = buildReturnDestinationPayload();
    if (!returnDestination.ok) {
      setAudiencePreviewError(returnDestination.message);
      showToast("error", "Destino das respostas incompleto", returnDestination.message);
      return;
    }

    setCreatingDraft(true);
    setAudiencePreviewError(null);
    try {
      const created = await createAppCampaignDraft(session, {
        name,
        templateId,
        selectedLeadIds: [],
        returnDestination: returnDestination.value,
        selectionMode: "DYNAMIC_CRM_FILTER",
        dynamicFilter: { version: 1, crmBusinessStatusId },
        ...(templateVariableLabels.length > 0
          ? { templateVariableMappings: buildTemplateVariableMappingsPayload(form.templateVariableMappings) }
          : {}),
      });
      const scheduled = await scheduleAppCampaignDraft(session, created.campaign.id, scheduledAt.toISOString());
      await refreshCampaigns(session, scheduled.campaign.id);
      const detail = await getAppCampaign(session, scheduled.campaign.id);
      setSelectedCampaign(detail.campaign);
      setSelectedCampaignId(scheduled.campaign.id);
      setDetailModalOpen(true);
      setForm(EMPTY_FORM);
      setAudiencePreview(null);
      setAudienceFilters(EMPTY_AUDIENCE_FILTERS);
      setScheduleInput("");
      setActiveTab("scheduled");
      setStatusFilter("scheduled");
      setCurrentPage(1);
      showToast(
        "success",
        "Campanha dinâmica agendada",
        "Os destinatários finais serão definidos no momento do envio."
      );
    } catch (err) {
      const typed = err as { status?: number; message?: string };
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      const message = typed.message || "Não foi possível agendar a campanha dinâmica.";
      setAudiencePreviewError(message);
      showToast("error", "Agendamento não concluído", message);
    } finally {
      setCreatingDraft(false);
    }
  };

  const handleCsvFileChange = async (file: File | null) => {
    const requestGeneration = csvRequestGenerationRef.current;
    setCsvPreview(null);
    setCsvPreviewError(null);
    if (!file) {
      resetCsvImportState();
      return;
    }
    const text = await file.text();
    if (requestGeneration !== csvRequestGenerationRef.current) return;
    const headers = parseCsvHeadersForUi(text);
    setCsvText(text);
    setCsvFileName(file.name);
    setCsvHeaders(headers);
    setCsvPhoneColumn((previous) => (previous && headers.includes(previous) ? previous : headers[0] ?? ""));
    setCsvGenericFieldColumns((previous) =>
      Object.fromEntries(
        CSV_GENERIC_FIELDS.map((field) => [
          field.key,
          previous[field.key] && headers.includes(previous[field.key]) ? previous[field.key] : "",
        ])
      ) as Record<CsvGenericFieldKey, string>
    );
    setCsvVariableColumns((previous) =>
      Object.fromEntries(
        templateVariableLabels.map((label) => [
          label,
          CSV_GENERIC_FIELDS.some((field) => field.key === previous[label]) ? previous[label] : "",
        ])
      )
    );
    setCsvImportReport(null);
  };

  const buildCsvMappingPayload = () => ({
    contactColumn: csvPhoneColumn || null,
    field1Column: csvGenericFieldColumns.field1 || null,
    field2Column: csvGenericFieldColumns.field2 || null,
    field3Column: csvGenericFieldColumns.field3 || null,
    genericFieldColumns: Object.fromEntries(
      CSV_GENERIC_FIELDS.map((field) => [String(field.index), csvGenericFieldColumns[field.key] || null])
    ),
    variableColumns: csvVariableColumns,
  });

  const updateCsvGenericFieldColumn = (key: CsvGenericFieldKey, value: string) => {
    setCsvGenericFieldColumns((previous) => ({ ...previous, [key]: value }));
    setCsvVariableColumns((previous) =>
      Object.fromEntries(
        Object.entries(previous).map(([label, source]) => [label, source === key && !value ? "" : source])
      )
    );
    setCsvPreview(null);
    setCsvImportReport(null);
  };

  const handleDownloadCsvImportReport = () => {
    if (!csvImportReport?.csv) return;
    const blob = new Blob([csvImportReport.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `campaign-import-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyCsvImportReport = async () => {
    if (!csvImportReport?.csv) return;
    try {
      await copyTextToClipboard(csvImportReport.csv);
      showToast("success", "Relatório copiado", "O relatório da importação foi copiado.");
    } catch {
      showToast("error", "Cópia não concluída", "Não foi possível copiar o relatório.");
    }
  };

  const handleCopyCsvPreviewBlocks = async () => {
    if (!csvPreview || csvPreview.errors.length === 0) return;
    const header = "Linha\tContato\tResultado\tMotivo";
    const rows = csvPreview.errors.map((item) =>
      [
        item.rowNumber ?? "",
        item.phoneDisplay ?? "",
        "Bloqueado",
        item.label,
      ].join("\t")
    );
    try {
      await copyTextToClipboard([header, ...rows].join("\n"));
      showToast("success", "Erros copiados", `${rows.length} linha(s) copiadas para a área de transferência.`);
    } catch {
      showToast("error", "Cópia não concluída", "Não foi possível copiar os erros da prévia.");
    }
  };

  const handleCsvPreview = async () => {
    if (!session) return;
    const requestGeneration = csvRequestGenerationRef.current;
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
      const message = "Mapeie a coluna Contato.";
      setCsvPreviewError(message);
      showToast("error", "CSV incompleto", message);
      return;
    }
    if (csvVariableMappingIncomplete) {
      const message = "Vincule cada variável do modelo a um campo mapeado do CSV.";
      setCsvPreviewError(message);
      showToast("error", "CSV incompleto", message);
      return;
    }
    setLoadingCsvPreview(true);
    setCsvPreviewError(null);
    setCsvImportReport(null);
    try {
      const preview = await previewAppCampaignCsv(session, {
        templateId,
        csvText,
        mapping: buildCsvMappingPayload(),
      });
      if (requestGeneration !== csvRequestGenerationRef.current) return;
      setCsvPreview(preview);
      showToast(
        "info",
        "Prévia CSV gerada",
        `${preview.summary.readyToImport} destinatários prontos; ${preview.summary.received - preview.summary.readyToImport} bloqueados ou ignorados.`
      );
    } catch (err) {
      if (requestGeneration !== csvRequestGenerationRef.current) return;
      const typed = err as { status?: number; message?: string };
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      const message = typed.message || "Não foi possível gerar a prévia do CSV.";
      setCsvPreviewError(message);
      showToast("error", "Prévia CSV não gerada", message);
    } finally {
      if (requestGeneration === csvRequestGenerationRef.current) setLoadingCsvPreview(false);
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
      const message = "Selecione o CSV e mapeie a coluna Contato.";
      setCsvPreviewError(message);
      showToast("error", "Rascunho CSV incompleto", message);
      return;
    }
    if (csvVariableMappingIncomplete) {
      const message = "Vincule cada variável do modelo a um campo mapeado do CSV.";
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
    const returnDestination = buildReturnDestinationPayload();
    if (!returnDestination.ok) {
      setCsvPreviewError(returnDestination.message);
      showToast("error", "Destino das respostas incompleto", returnDestination.message);
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
        returnDestination: returnDestination.value,
      });
      await refreshCampaigns(session, created.campaign.id);
      const detail = await getAppCampaign(session, created.campaign.id);
      setSelectedCampaign(detail.campaign);
      setSelectedCampaignId(created.campaign.id);
      setDetailModalOpen(true);
      resetCampaignComposer();
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
      setActiveTab("sending");
      setStatusFilter("sending");
      setDetailModalOpen(true);
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
      setActiveTab("scheduled");
      setStatusFilter("scheduled");
      setDetailModalOpen(true);
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
      const variables = Object.fromEntries(
        selectedCampaignTestVariableLabels.map((label) => [label, testVariableValues[label] ?? ""])
      );
      await sendAppCampaignTest(session, selectedCampaign.id, waId, variables);
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
    resetCampaignComposer();
    setForm({
      ...EMPTY_FORM,
      templateVariables: syncTemplateVariables(fixedVariableValues, labels.length),
      templateVariableMappings: syncTemplateVariableMappings([], labels),
      ...replayForm,
      templateId: matchedTemplate?.id ?? "",
      templateName: matchedTemplate?.name ?? replayForm.templateName,
      templateParamsInput: syncTemplateVariables(fixedVariableValues, labels.length).join("\n"),
    });
    setActiveTab("create");
    setExpandedCreationPanel("manual");
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

      <div className="campaigns-theme grid gap-3">
      <section className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex flex-col gap-4">
          <div className="max-w-5xl">
            <h2 className="text-base font-semibold">Central de Campanhas</h2>
            <p className="mt-2 text-sm leading-6 text-white/70">
              Antes do envio, a plataforma valida bloqueio de envio ativo, contatos anonimizados,
              WhatsApp válido, duplicidades e variáveis obrigatórias.
            </p>
          </div>
          <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
            {[
              "Escolha o modelo e defina o destino",
              "Mapeie variáveis",
              "Importe CSV ou filtre CRM",
              "Valide elegíveis",
              "Crie rascunho",
              "Revise e envie",
            ].map((label, index) => (
              <div key={label} className="rounded-md border border-white/10 bg-re7-navy/35 p-3">
                <p className="text-xs font-semibold text-re7-sky">Etapa {index + 1}</p>
                <p className="mt-1 text-sm text-white/85">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <nav
        aria-label="Visualização de campanhas"
        className="flex flex-col gap-2 border-y border-white/10 bg-re7-navy/30 px-1 py-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-white/55">Visualização</p>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Conteúdo de campanhas">
          {CAMPAIGN_CENTER_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => handleCampaignTabChange(tab.id)}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium transition ${
                activeTab === tab.id
                  ? "border-re7-sky bg-re7-sky/20 text-white"
                  : "border-white/15 bg-white/5 text-white/70 hover:bg-white/10"
              }`}
            >
              <span>{tab.label}</span>
              {getCampaignTabCount(tab.id) !== null ? (
                <span className="ml-2 rounded-full border border-white/15 bg-white/10 px-1.5 py-0.5 text-[11px]">
                  {getCampaignTabCount(tab.id)}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </nav>

      <section className={`${activeTab === "create" ? "grid" : "hidden"} rounded-xl border border-white/10 bg-white/5`}>
        <div className="border-b border-white/10 px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-re7-sky">Nova campanha</p>
              <h2 className="mt-1 text-sm font-semibold">Criar rascunho</h2>
              <p className="mt-1 text-xs text-white/60">
                Configure o modelo uma vez e escolha entre importar CSV ou selecionar uma audiência do CRM.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-sky-300/30 bg-sky-900/20 px-3 py-1 text-xs text-sky-100">
                Sem envio
              </span>
              <button
                type="button"
                disabled={composerBusy || !isComposerDirty}
                onClick={handleDiscardComposer}
                className="rounded-md border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Descartar
              </button>
            </div>
          </div>
        </div>
        <div className="grid gap-3 p-3">
          {draftSetupEditor}
          <article className="overflow-hidden rounded-xl border border-emerald-300/20 bg-emerald-950/10">
            <div
              role="button"
              tabIndex={0}
              aria-expanded={expandedCreationPanel === "audience"}
              aria-controls="campaign-creation-panel-audience"
              onClick={() => setExpandedCreationPanel((current) => current === "audience" ? null : "audience")}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setExpandedCreationPanel((current) => current === "audience" ? null : "audience");
                }
              }}
              className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-white/10 bg-white/[0.075] px-3 py-3 text-left transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-300/60 md:px-4"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-100/80">Audiência CRM</p>
                <h3 className="mt-1 text-sm font-semibold">Selecionar por filtros</h3>
                <p className="mt-1 text-xs text-white/60">
                  Gere uma prévia dos contatos elegíveis do CRM e crie rascunho com essa audiência.
                </p>
              </div>
              <div className="expand-row-action-slot flex min-w-max shrink-0 items-center justify-end gap-3 justify-self-end whitespace-nowrap">
                <span className="hidden rounded-full border border-emerald-300/25 bg-emerald-900/20 px-3 py-1 text-xs text-emerald-100 sm:inline-flex">
                  Opcional
                </span>
                <button
                  type="button"
                  aria-expanded={expandedCreationPanel === "audience"}
                  aria-controls="campaign-creation-panel-audience"
                  aria-label={expandedCreationPanel === "audience" ? "Recolher linha" : "Expandir linha"}
                  title={expandedCreationPanel === "audience" ? "Recolher linha" : "Expandir linha"}
                  onClick={(event) => {
                    event.stopPropagation();
                    setExpandedCreationPanel((current) => current === "audience" ? null : "audience");
                  }}
                  className={`grid h-8 w-8 place-items-center rounded-full border text-base font-semibold leading-none transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-300/60 ${expandedCreationPanel === "audience" ? "rotate-90 border-emerald-300/50 bg-emerald-900/30 text-emerald-50" : "border-white/15 text-white/70"}`}
                >
                  ›
                </button>
              </div>
            </div>
          {expandedCreationPanel === "audience" ? (
          <div id="campaign-creation-panel-audience" className="bg-black/10 px-3 py-3 md:px-4">
          {audienceVariablesEditor}
          <div className={audienceVariablesEditor ? "mt-3" : ""}>
          <CampaignMessagePreview
            content={templatePreview}
            detail="Prévia ilustrativa. Os valores finais serão calculados para cada contato selecionado no CRM."
          />
          </div>
          <div className="mt-3 grid gap-3 rounded-md border border-emerald-300/20 bg-emerald-950/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Modo de destinatários</p>
                <p className="mt-1 text-xs text-white/60">
                  No modo dinâmico, a prévia é apenas uma estimativa; os destinatários finais serão definidos no horário agendado.
                </p>
              </div>
              <div className="inline-flex overflow-hidden rounded-md border border-white/15 text-sm">
                <button
                  type="button"
                  onClick={() => setAudienceRecipientMode("STATIC_RECIPIENTS")}
                  className={`px-3 py-2 font-semibold ${audienceRecipientMode === "STATIC_RECIPIENTS" ? "bg-re7-sky text-slate-950" : "bg-white/5 text-white/75 hover:bg-white/10"}`}
                >
                  Destinatários fixos
                </button>
                <button
                  type="button"
                  onClick={() => setAudienceRecipientMode("DYNAMIC_CRM_FILTER")}
                  className={`px-3 py-2 font-semibold ${audienceRecipientMode === "DYNAMIC_CRM_FILTER" ? "bg-re7-sky text-slate-950" : "bg-white/5 text-white/75 hover:bg-white/10"}`}
                >
                  Filtro dinâmico do CRM
                </button>
              </div>
            </div>
          </div>
          <form className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_160px_150px_150px_150px_auto]" onSubmit={handleAudiencePreviewSubmit}>
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Busca</span>
              <input
                className="w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                value={audienceFilters.q}
                disabled={audienceRecipientMode === "DYNAMIC_CRM_FILTER"}
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
                disabled={audienceRecipientMode === "DYNAMIC_CRM_FILTER"}
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
                disabled={audienceRecipientMode === "DYNAMIC_CRM_FILTER"}
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
                disabled={audienceRecipientMode === "DYNAMIC_CRM_FILTER"}
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
                disabled={!canGenerateAudiencePreview}
                title={audiencePreviewDisabledReason ?? undefined}
                className="rounded-md bg-re7-orange px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingAudiencePreview
                  ? "Gerando..."
                  : audienceRecipientMode === "DYNAMIC_CRM_FILTER"
                    ? "Gerar estimativa"
                    : "Gerar previa"}
              </button>
              <button
                type="button"
                onClick={handleClearAudienceFilters}
                disabled={
                  !audiencePreview &&
                  !audiencePreviewError &&
                  audienceFilters.q === EMPTY_AUDIENCE_FILTERS.q &&
                  audienceFilters.status === EMPTY_AUDIENCE_FILTERS.status &&
                  audienceFilters.channel === EMPTY_AUDIENCE_FILTERS.channel &&
                  audienceFilters.optOut === EMPTY_AUDIENCE_FILTERS.optOut &&
                  audienceFilters.hasConversation === EMPTY_AUDIENCE_FILTERS.hasConversation
                }
                className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancelar prévia
              </button>
            </div>
          </form>
          {!form.templateId && audiencePreviewDisabledReason ? (
            <p className="mt-2 rounded-md border border-amber-300/25 bg-amber-900/20 p-3 text-xs text-amber-100">
              {audiencePreviewDisabledReason}
            </p>
          ) : null}

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
              <div className="grid gap-3 rounded-md border border-white/10 bg-white/5 p-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div className="grid gap-2">
                  <p className="text-xs text-white/60">
                    {audienceRecipientMode === "DYNAMIC_CRM_FILTER"
                      ? `${audiencePreview.summary.total} correspondências neste momento. Os destinatários finais serão definidos no momento do envio.`
                      : `${audienceEligibleItems.length} elegiveis serao incluidos; ${audiencePreview.summary.blocked} bloqueados serao ignorados.`}
                  </p>
                  {audienceRecipientMode === "DYNAMIC_CRM_FILTER" ? (
                    <label className="grid max-w-xs gap-1 text-sm">
                      <span className="text-white/70">Data/hora</span>
                      <input
                        type="datetime-local"
                        value={scheduleInput}
                        onChange={(event) => setScheduleInput(event.target.value)}
                        className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                      />
                    </label>
                  ) : null}
                </div>
                <div className="flex flex-col justify-end gap-2 lg:col-start-2">
                  <button
                    type="button"
                    disabled={
                      creatingDraft ||
                      (audienceRecipientMode === "STATIC_RECIPIENTS" && audienceEligibleItems.length === 0) ||
                      (audienceRecipientMode === "DYNAMIC_CRM_FILTER" && (!audienceFilters.status || !scheduleInput)) ||
                      !form.templateId ||
                      templates.length === 0 ||
                      Boolean(templateVariableMappingError)
                    }
                    onClick={
                      audienceRecipientMode === "DYNAMIC_CRM_FILTER"
                        ? handleCreateDynamicScheduledCampaign
                        : handleCreateDraftFromAudience
                    }
                    className="rounded-md bg-re7-orange px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {creatingDraft
                      ? "Criando..."
                      : audienceRecipientMode === "DYNAMIC_CRM_FILTER"
                        ? "Agendar filtro dinâmico"
                        : "Criar rascunho com audiência"}
                  </button>
                </div>
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
          </div>
          ) : null}
          </article>
          <article className="overflow-hidden rounded-xl border border-sky-300/20 bg-sky-950/10">
            <div
              role="button"
              tabIndex={0}
              aria-expanded={expandedCreationPanel === "csv"}
              aria-controls="campaign-creation-panel-csv"
              onClick={() => setExpandedCreationPanel((current) => current === "csv" ? null : "csv")}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setExpandedCreationPanel((current) => current === "csv" ? null : "csv");
                }
              }}
              className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-white/10 bg-white/[0.075] px-3 py-3 text-left transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-re7-sky/70 md:px-4"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-re7-sky">Importação CSV</p>
                <h3 className="mt-1 text-sm font-semibold">Criar rascunho por arquivo</h3>
                <p className="mt-1 text-xs text-white/60">
                  O arquivo é validado antes da criação do rascunho. Nenhuma mensagem é enviada nesta etapa.
                </p>
              </div>
              <div className="expand-row-action-slot flex min-w-max shrink-0 items-center justify-end gap-3 justify-self-end whitespace-nowrap">
                <span className="hidden rounded-full border border-sky-300/30 bg-sky-900/20 px-3 py-1 text-xs text-sky-100 sm:inline-flex">
                  Rascunho
                </span>
                <button
                  type="button"
                  aria-expanded={expandedCreationPanel === "csv"}
                  aria-controls="campaign-creation-panel-csv"
                  aria-label={expandedCreationPanel === "csv" ? "Recolher linha" : "Expandir linha"}
                  title={expandedCreationPanel === "csv" ? "Recolher linha" : "Expandir linha"}
                  onClick={(event) => {
                    event.stopPropagation();
                    setExpandedCreationPanel((current) => current === "csv" ? null : "csv");
                  }}
                  className={`grid h-8 w-8 place-items-center rounded-full border text-base font-semibold leading-none transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-re7-sky/70 ${expandedCreationPanel === "csv" ? "rotate-90 border-re7-sky/50 bg-re7-sky/20 text-sky-50" : "border-white/15 text-white/70"}`}
                >
                  ›
                </button>
              </div>
            </div>
            {expandedCreationPanel === "csv" ? (
            <div id="campaign-creation-panel-csv" className="bg-black/10 px-3 py-3 md:px-4">
            <div className="mt-3 grid gap-4">
            <div className="rounded-md border border-white/10 bg-slate-950/35 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/60">1. Mapear colunas do CSV</p>
              <p className="mt-1 text-xs text-white/50">Associe as colunas do arquivo aos campos que poderão ser usados nesta campanha.</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <label className="grid gap-1 text-sm">
                <span className="text-white/70">Arquivo CSV</span>
                <input
                  key={csvInputKey}
                  type="file"
                  accept=".csv,text/csv"
                  className="w-full rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white file:mr-3 file:rounded file:border-0 file:bg-re7-orange file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
                  onChange={(event) => void handleCsvFileChange(event.target.files?.[0] ?? null)}
                />
                {csvFileName ? <span className="text-xs text-white/55">{csvFileName}</span> : null}
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-white/70">Contato</span>
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
              {CSV_GENERIC_FIELDS.map((field) => (
                <label key={field.key} className="grid gap-1 text-sm">
                  <span className="text-white/70">{field.label}</span>
                  <select
                    value={csvGenericFieldColumns[field.key]}
                    disabled={csvHeaders.length === 0}
                    onChange={(event) => updateCsvGenericFieldColumn(field.key, event.target.value)}
                    className="w-full rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white disabled:opacity-50"
                  >
                    <option value="">Não usar</option>
                    {csvHeaders.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              </div>
            </div>
              {templateVariableLabels.length > 0 ? (
                <div className="rounded-md border border-sky-300/15 bg-sky-950/15 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-sky-100/70">2. Preencher variáveis da mensagem</p>
                  <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {templateVariableLabels.map((label) => (
                    <label key={label} className="grid gap-1 text-sm">
                      <span className="text-white/70">{`Variável {{${label}}}`}</span>
                      <select
                        value={csvVariableColumns[label] ?? ""}
                        disabled={csvHeaders.length === 0}
                        onChange={(event) => {
                          setCsvVariableColumns((prev) => ({ ...prev, [label]: event.target.value }));
                          setCsvPreview(null);
                          setCsvImportReport(null);
                        }}
                        className="w-full rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white disabled:opacity-50"
                      >
                        <option value="">Selecione</option>
                        {mappedCsvGenericFields.map((field) => (
                          <option key={field.key} value={field.key}>
                            {field.label} · coluna "{csvGenericFieldColumns[field.key]}"
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="mt-3">
              <CampaignMessagePreview
                content={csvTemplatePreview}
                detail={
                  csvPreview?.recipients[0]
                    ? "Exemplo preenchido com os dados da primeira linha válida da pré-visualização."
                    : "As variáveis serão preenchidas pelas colunas mapeadas após a pré-visualização do arquivo."
                }
              />
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
                      {csvPreview.summary.invalid +
                        csvPreview.summary.optOutBlocked +
                        csvPreview.summary.missingRequiredVariables +
                        (csvPreview.summary.unresolvedCrmSituations ?? 0)}
                    </p>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-4">
                  <div className="rounded-md border border-white/10 bg-white/5 p-3">
                    <p className="text-xs uppercase tracking-wide text-white/55">Novos contatos</p>
                    <p className="mt-1 text-lg font-semibold">{csvPreview.summary.created ?? 0}</p>
                  </div>
                  <div className="rounded-md border border-white/10 bg-white/5 p-3">
                    <p className="text-xs uppercase tracking-wide text-white/55">Atualizações</p>
                    <p className="mt-1 text-lg font-semibold">{csvPreview.summary.updated ?? 0}</p>
                  </div>
                  <div className="rounded-md border border-white/10 bg-white/5 p-3">
                    <p className="text-xs uppercase tracking-wide text-white/55">Sem alteração</p>
                    <p className="mt-1 text-lg font-semibold">{csvPreview.summary.unchanged ?? 0}</p>
                  </div>
                  <div className="rounded-md border border-white/10 bg-white/5 p-3">
                    <p className="text-xs uppercase tracking-wide text-white/55">Consolidados</p>
                    <p className="mt-1 text-lg font-semibold">{csvPreview.summary.consolidated ?? 0}</p>
                  </div>
                </div>
                {csvPreview.summary.blockedByReason.length > 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-2 text-xs">
                      {csvPreview.summary.blockedByReason.map((item) => (
                        <span key={item.reason} className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-white/75">
                          {item.label}: {item.count}
                        </span>
                      ))}
                    </div>
                    {csvPreview.errors.length > 0 ? (
                      <button
                        type="button"
                        onClick={handleCopyCsvPreviewBlocks}
                        className="rounded-md border border-amber-300/30 px-3 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-900/25"
                      >
                        Copiar erros e bloqueios
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {csvPreview.recipients.length > 0 || csvPreview.errors.length > 0 ? (
                  <div className="overflow-x-auto rounded-md border border-white/10">
                    <table className="w-full min-w-[760px] text-sm">
                      <thead className="bg-white/10 text-left">
                        <tr>
                          <th className="px-3 py-2">Linha</th>
                          <th className="px-3 py-2">Contato</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2">Motivo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {csvPreview.recipients.slice(0, 8).map((recipient) => (
                          <tr key={`${recipient.rowNumber}-${recipient.phoneDisplay}`} className="border-t border-white/10">
                            <td className="px-3 py-2 text-white/65">{recipient.rowNumber ?? "-"}</td>
                            <td className="px-3 py-2 text-white/75">
                              <span className="font-mono text-xs">{recipient.phoneDisplay}</span>
                            </td>
                            <td className="px-3 py-2">
                              <span className="inline-flex rounded-full border border-emerald-300/25 bg-emerald-900/20 px-2 py-1 text-xs font-semibold text-emerald-100">
                                Pronto
                              </span>
                            </td>
                            <td className="px-3 py-2 text-white/75">
                              Variáveis preenchidas
                            </td>
                          </tr>
                        ))}
                        {csvPreview.errors.slice(0, Math.max(0, 8 - csvPreview.recipients.slice(0, 8).length)).map((item) => (
                          <tr key={`${item.rowNumber}-${item.reason}-${item.phoneDisplay ?? "sem-contato"}`} className="border-t border-white/10">
                            <td className="px-3 py-2 text-white/65">{item.rowNumber ?? "-"}</td>
                            <td className="px-3 py-2 font-mono text-xs text-white/70">{item.phoneDisplay ?? "-"}</td>
                            <td className="px-3 py-2">
                              <span className="inline-flex rounded-full border border-red-300/25 bg-red-900/20 px-2 py-1 text-xs font-semibold text-red-100">
                                Bloqueado
                              </span>
                            </td>
                            <td className="px-3 py-2 text-white/75">{item.label}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            ) : null}
            {csvImportReport ? (
              <div className="mt-3 grid gap-3 rounded-md border border-emerald-400/20 bg-emerald-950/10 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-100/70">Relatório da importação</p>
                    <p className="mt-1 text-sm text-white/75">
                      {csvImportReport.summary.created ?? 0} criados, {csvImportReport.summary.updated ?? 0} atualizados,{" "}
                      {csvImportReport.summary.unchanged ?? 0} sem alteração.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleCopyCsvImportReport}
                      className="rounded-md border border-emerald-300/30 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-900/30"
                    >
                      Copiar relatório
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadCsvImportReport}
                      className="rounded-md border border-emerald-300/30 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-900/30"
                    >
                      Baixar relatório CSV
                    </button>
                  </div>
                </div>
                {csvImportReport.rows.length > 0 ? (
                  <div className="overflow-x-auto rounded-md border border-white/10">
                    <table className="w-full min-w-[760px] text-sm">
                      <thead className="bg-white/10 text-left">
                        <tr>
                          <th className="px-3 py-2">Linha</th>
                          <th className="px-3 py-2">Referência</th>
                          <th className="px-3 py-2">Operação</th>
                          <th className="px-3 py-2">Campos</th>
                          <th className="px-3 py-2">Situação</th>
                          <th className="px-3 py-2">Resultado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {csvImportReport.rows.slice(0, 10).map((row, index) => (
                          <tr key={`${row.sourceRow ?? "row"}-${row.maskedIdentity}-${index}`} className="border-t border-white/10">
                            <td className="px-3 py-2 text-white/65">{row.sourceRow ?? "-"}</td>
                            <td className="px-3 py-2 font-mono text-xs text-white/70">{row.maskedIdentity}</td>
                            <td className="px-3 py-2 text-white/75">{row.operation}</td>
                            <td className="px-3 py-2 text-white/75">{row.fieldsChanged.join(", ") || "-"}</td>
                            <td className="px-3 py-2 text-white/75">
                              {row.newCrmSituationLabel ?? row.oldCrmSituationLabel ?? "-"}
                            </td>
                            <td className="px-3 py-2 text-white/75">{row.reason ?? "OK"}</td>
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
                disabled={!csvText && !csvPreview && !csvImportReport && !csvPreviewError}
                onClick={resetCsvImportState}
                className="rounded-md border border-white/20 px-3 py-2 text-sm font-semibold text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancelar importação
              </button>
              <button
                type="button"
                disabled={loadingCsvPreview || Boolean(csvPreview) || !csvText || !form.templateId || csvVariableMappingIncomplete}
                onClick={() => void handleCsvPreview()}
                className="rounded-md border border-white/20 px-3 py-2 text-sm font-semibold text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingCsvPreview ? "Validando..." : csvPreview ? "Prévia gerada" : "Pré-visualizar CSV"}
              </button>
              <button
                type="button"
                disabled={creatingCsvDraft || !csvText || !form.templateId || csvVariableMappingIncomplete || (csvPreview ? csvPreview.summary.readyToImport === 0 : false)}
                onClick={() => void handleCreateDraftFromCsv()}
                className="rounded-md bg-re7-orange px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creatingCsvDraft ? "Criando..." : "Criar rascunho com CSV"}
              </button>
            </div>
          </div>
          ) : null}
          </article>
          <article className="overflow-hidden rounded-xl border border-amber-300/20 bg-amber-950/10">
            <div
              role="button"
              tabIndex={0}
              aria-expanded={manualSendOpen}
              aria-controls="campaign-creation-panel-manual"
              onClick={() => setExpandedCreationPanel((current) => current === "manual" ? null : "manual")}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setExpandedCreationPanel((current) => current === "manual" ? null : "manual");
                }
              }}
              className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-white/10 bg-white/[0.075] px-3 py-3 text-left transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-amber-300/60 md:px-4"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-100/80">Envio manual</p>
                <h3 className="mt-1 text-sm font-semibold text-amber-100">Envio imediato manual (avançado)</h3>
                <p className="mt-1 text-xs text-white/60">
                  Uso técnico para informar destinatários e iniciar o envio imediatamente após confirmação.
                </p>
              </div>
              <div className="expand-row-action-slot flex min-w-max shrink-0 items-center justify-end justify-self-end whitespace-nowrap">
                <button
                  type="button"
                  aria-expanded={manualSendOpen}
                  aria-controls="campaign-creation-panel-manual"
                  aria-label={manualSendOpen ? "Recolher linha" : "Expandir linha"}
                  title={manualSendOpen ? "Recolher linha" : "Expandir linha"}
                  onClick={(event) => {
                    event.stopPropagation();
                    setExpandedCreationPanel((current) => current === "manual" ? null : "manual");
                  }}
                  className={`grid h-8 w-8 place-items-center rounded-full border text-base font-semibold leading-none transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-amber-300/60 ${manualSendOpen ? "rotate-90 border-amber-300/50 bg-amber-900/30 text-amber-50" : "border-white/15 text-white/70"}`}
                >
                  ›
                </button>
              </div>
            </div>
            {manualSendOpen ? (
            <div id="campaign-creation-panel-manual" className="bg-black/10 px-3 py-3 md:px-4">
              <p className="mb-3 rounded-md border border-amber-300/25 bg-amber-900/20 p-3 text-xs text-amber-100">
                Use apenas para operação técnica ou compatibilidade. Esta ação pode enviar imediatamente após confirmação.
                Nome, modelo e destino são reaproveitados da configuração comum acima.
              </p>
              <form className="grid gap-3 lg:grid-cols-2" onSubmit={handleSubmit}>
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
                <div className="lg:col-span-2">
                  <CampaignMessagePreview
                    content={manualTemplatePreview}
                    detail="Prévia com os valores informados para o envio imediato manual."
                  />
                </div>
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
            ) : null}
          </article>
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
                        {option === "all" ? "Todas" : getStatusLabel(option)}
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
                  <th className="px-2 py-2">Campanha</th>
                  <th className="px-2 py-2">Situação</th>
                  <th className="px-2 py-2 text-center">Processadas</th>
                  <th className="px-2 py-2 text-center">Total</th>
                  <th className="hidden px-2 py-2 lg:table-cell">Modelo</th>
                  <th className="hidden px-2 py-2 xl:table-cell">Criada em</th>
                  <th className="px-2 py-2 text-right">Ações</th>
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
                  const isDynamicCampaign =
                    campaign.selectionMode === "DYNAMIC_CRM_FILTER" ||
                    campaign.draftSeed?.selectionMode === "DYNAMIC_CRM_FILTER";
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
	                      onClick={() => {
	                        openCampaignDetail(campaign.id);
	                      }}
	                      onKeyDown={(event) => {
	                        if (event.key !== "Enter" && event.key !== " ") return;
	                        event.preventDefault();
	                        openCampaignDetail(campaign.id);
	                      }}
                      tabIndex={0}
                      role="button"
                      aria-label={`Ver detalhes da campanha ${campaign.name || campaign.id}`}
                    >
                      <td className="px-2 py-2">
                        <div className="min-w-0">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <p className="truncate font-medium text-white">{campaign.name || "(sem nome)"}</p>
                            {isDynamicCampaign ? (
                              <span className="rounded-full border border-emerald-300/30 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-100">
                                Dinâmica
                              </span>
                            ) : null}
                          </div>
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
                      <td className="px-2 py-2 align-top">
                        <div className="flex justify-end gap-1.5">
                          <ActionIconButton
                            label={`Ver detalhes da campanha ${campaign.name || campaign.id}`}
                            icon="i"
                            onClick={() => {
                              openCampaignDetail(campaign.id);
                            }}
                          />
                          <ActionIconButton
                            label={`Reaproveitar campanha ${campaign.name || campaign.id}`}
                            icon="↺"
                            onClick={() => {
                              setActiveTab("create");
                              setSelectedCampaignId(campaign.id);
                              handleReuseCampaign(campaign);
                            }}
                            variant="primary"
                          />
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
                      Acompanhe público, processamento e resultado sem interromper a execução.
                      </p>
                    </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <ActionIconButton
                      label={refreshingDetail ? "Atualizando detalhe" : "Atualizar detalhe"}
                      icon={refreshingDetail ? "…" : "↺"}
                      disabled={!session || !selectedCampaignId || refreshingDetail}
                      onClick={() => {
                        if (!session || !selectedCampaignId) return;
                        void refreshCampaignDetail(session, selectedCampaignId, true);
                      }}
                    />
                    <ActionIconButton
                      label="Fechar detalhe"
                      icon="×"
                      onClick={() => setDetailModalOpen(false)}
                    />
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
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-white/60">Situação</p>
                      <p className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getStatusClasses(selectedCampaign.status)}`}>
                        {getStatusLabel(selectedCampaign.status)}
                      </p>
                    </div>
                    <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-white/60">Total</p>
                      <p className="mt-1 font-semibold">{selectedCampaign.totalRecipients}</p>
                    </div>
                    <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-white/60">Processadas</p>
                      <p className="mt-1 font-semibold">{selectedCampaign.sentCount}</p>
                    </div>
                    <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-white/60">Aceitas pelo provedor</p>
                      <p className="mt-1 font-semibold text-slate-100">{selectedCampaign.metaSummary?.totalSent ?? 0}</p>
                    </div>
                    <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-white/60">Entregues</p>
                      <p className="mt-1 font-semibold text-sky-200">{selectedCampaign.metaSummary?.totalDelivered ?? 0}</p>
                    </div>
                    <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-white/60">Lidas</p>
                      <p className="mt-1 font-semibold text-emerald-200">{selectedCampaign.metaSummary?.totalRead ?? 0}</p>
                    </div>
                    <div className="rounded-md border border-white/10 bg-white/5 p-3">
                      <p className="text-xs uppercase tracking-wide text-white/60">Falhas técnicas</p>
                      <p className="mt-1 font-semibold text-red-200">{selectedCampaign.metaSummary?.totalFailed ?? 0}</p>
                    </div>
                    <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-white/60">Bloqueadas</p>
                      <p className="mt-1 font-semibold text-orange-100">{selectedCampaign.blockedCount}</p>
                    </div>
                    <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-white/60">Pendentes</p>
                      <p className="mt-1 font-semibold">{selectedCampaign.progress.pendingCount}</p>
                    </div>
                  </div>

                  <div className={`rounded-md border p-3 text-sm ${getCampaignConfidence(selectedCampaign).classes}`}>
                    <p className="font-semibold">{getCampaignConfidence(selectedCampaign).icon} {getCampaignConfidence(selectedCampaign).label}</p>
                  </div>

                  {selectedCampaign.draftSeed?.selectionMode === "DYNAMIC_CRM_FILTER" ? (
                    <div className="grid gap-3 rounded-md border border-emerald-300/25 bg-emerald-950/20 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-emerald-100">Filtro dinâmico do CRM</p>
                          <p className="mt-1 text-xs text-emerald-100/75">
                            Os destinatários são definidos no momento do envio e congelados após a criação do snapshot.
                          </p>
                        </div>
                        <span className="rounded-full border border-emerald-300/30 bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-100">
                          Dinâmica
                        </span>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <div className="rounded-md border border-white/10 bg-white/5 p-2">
                          <p className="text-xs text-white/60">Filtro</p>
                          <p className="font-semibold">
                            Situação no CRM = {
                              crmStatuses.find((item) => item.id === selectedCampaign.draftSeed?.dynamicFilter?.crmBusinessStatusId)?.label ??
                              selectedCampaign.draftSeed.dynamicFilter?.crmBusinessStatusId ??
                              "-"
                            }
                          </p>
                        </div>
                        <div className="rounded-md border border-white/10 bg-white/5 p-2">
                          <p className="text-xs text-white/60">Agendado para</p>
                          <p className="font-semibold">{selectedCampaign.scheduledAt ? formatDateTime(selectedCampaign.scheduledAt) : "Execução iniciada"}</p>
                        </div>
                        <div className="rounded-md border border-white/10 bg-white/5 p-2">
                          <p className="text-xs text-white/60">Snapshot</p>
                          <p className="font-semibold">
                            {selectedCampaign.status === "scheduled" || selectedCampaign.status === "draft" ? "Ainda não criado" : "Criado para esta execução"}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}

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
                              disabled={testingCampaign || !testRecipientInput.trim() || campaignTestVariablesIncomplete}
                              onClick={handleTestSendCampaign}
                              className="rounded-md border border-white/20 px-3 py-2 text-sm font-semibold text-white/85 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {testingCampaign ? "Enviando..." : "Enviar teste"}
                            </button>
                          </div>
                          {selectedCampaignTestVariableLabels.length > 0 ? (
                            <div className="grid gap-2 sm:grid-cols-2">
                              {selectedCampaignTestVariableLabels.map((label) => (
                                <label key={label} className="grid gap-1 text-sm">
                                  <span className="text-xs font-semibold uppercase tracking-wide text-white/55">{`Variável {{${label}}}`}</span>
                                  <input
                                    value={testVariableValues[label] ?? ""}
                                    onChange={(event) =>
                                      setTestVariableValues((previous) => ({
                                        ...previous,
                                        [label]: event.target.value,
                                      }))
                                    }
                                    placeholder="Valor usado apenas no teste"
                                    className="w-full rounded-md border border-white/15 bg-re7-navy/50 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                                  />
                                </label>
                              ))}
                            </div>
                          ) : null}
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
                    <div className="grid gap-3 border-b border-white/10 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold">Situação real por mensagem</h3>
                          <p className="mt-1 text-xs text-white/55">
                            {filteredCampaignResultItems.length} de {campaignResultItems.length} destinatário(s)
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <ActionIconButton
                            label="Copiar filtrados"
                            icon="#"
                            onClick={handleCopyFilteredResults}
                            disabled={filteredCampaignResultItems.length === 0}
                          />
                          <ActionIconButton
                            label="Nova campanha com filtrados"
                            icon="↺"
                            onClick={handleReuseFilteredResults}
                            disabled={filteredCampaignResultItems.length === 0}
                            variant="primary"
                          />
                        </div>
                      </div>
                      <div className="grid gap-2 md:grid-cols-[1fr_1fr_1.4fr]">
                        <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-white/60">
                          Resultado
                          <select
                            value={resultStatusFilter}
                            onChange={(event) => setResultStatusFilter(event.target.value as CampaignResultStatusFilter)}
                            className="rounded-md border border-white/15 bg-white/10 px-3 py-2 text-sm normal-case text-white outline-none focus:border-re7-sky"
                          >
                            {resultStatusOptions.map((option) => (
                              <option key={option.id} value={option.id}>{option.label}</option>
                            ))}
                          </select>
                        </label>
                        <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-white/60">
                          Situação CRM
                          <select
                            value={resultCrmStatusFilter}
                            onChange={(event) => setResultCrmStatusFilter(event.target.value)}
                            className="rounded-md border border-white/15 bg-white/10 px-3 py-2 text-sm normal-case text-white outline-none focus:border-re7-sky"
                          >
                            <option value="all">Todas</option>
                            {resultCrmStatusOptions.map((option) => (
                              <option key={option.id} value={option.id}>{option.label}</option>
                            ))}
                          </select>
                        </label>
                        <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-white/60">
                          Buscar
                          <input
                            value={resultSearch}
                            onChange={(event) => setResultSearch(event.target.value)}
                            placeholder="Nome ou telefone"
                            className="rounded-md border border-white/15 bg-white/10 px-3 py-2 text-sm normal-case text-white outline-none placeholder:text-white/35 focus:border-re7-sky"
                          />
                        </label>
                      </div>
                    </div>
                    {campaignResultItems.length ? (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[780px] text-sm">
                          <thead className="bg-white/10 text-left">
                            <tr>
                              <th className="px-3 py-2">Contato</th>
                              <th className="px-3 py-2">Telefone</th>
                              <th className="px-3 py-2">Situação CRM</th>
                              <th className="px-3 py-2">Situação</th>
                              <th className="px-3 py-2">Categoria</th>
                              <th className="px-3 py-2">Entrega</th>
                              <th className="px-3 py-2">Erro</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredCampaignResultItems.map((item, index) => (
                              <tr key={`${item.waId}-${item.conversationId ?? "conversation"}-${index}`} className="border-t border-white/10">
                                <td className="px-3 py-2">{item.contactName || "Contato sem nome"}</td>
                                <td className="px-3 py-2 font-mono text-xs">{item.phoneDisplay || formatCampaignRecipientReference(item.waId)}</td>
                                <td className="px-3 py-2">{item.crmStatusLabel || item.crmStatus || "-"}</td>
                                <td className="px-3 py-2">
                                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getMetaStatusClasses(item.status)}`}>
                                    {getMetaStatusLabel(item.status)}
                                  </span>
                                </td>
                                <td className="px-3 py-2">{getMetaTemplateCategoryUxLabel(item.pricingCategory)}</td>
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
                            {filteredCampaignResultItems.length === 0 ? (
                              <tr>
                                <td className="px-3 py-4 text-white/65" colSpan={7}>
                                  Nenhum destinatário corresponde aos filtros.
                                </td>
                              </tr>
                            ) : null}
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
      </div>
    </AppShell>
  );
}
