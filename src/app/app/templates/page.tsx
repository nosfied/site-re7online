"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import {
  AppApiError,
  AppCannedReplyItem,
  AppSession,
  AppTemplateItem,
  AppTemplateRequestItem,
  cancelAppTemplateRequest,
  clearAppSession,
  createAppCannedReply,
  createAppTemplateRequest,
  disableAppCannedReply,
  disableAppTemplate,
  enableAppCannedReply,
  enableAppTemplate,
  listAppCannedReplies,
  listAppTemplateRequests,
  listAppTemplates,
  loadAppSession,
  saveAppSession,
  syncAppTemplate,
  syncAppTemplates,
  updateAppCannedReply,
} from "@/lib/appClientApi";
import { formatDateTime } from "@/lib/whatsappAdminApi";
import { FeedbackToast } from "@/components/ui/FeedbackToast";

type TemplateRequestFormState = {
  name: string;
  content: string;
  language: string;
  variableDetails: Array<{ key: string; description: string; example: string }>;
  category: string;
};

const EMPTY_FORM: TemplateRequestFormState = {
  name: "",
  content: "",
  language: "pt_BR",
  variableDetails: [],
  category: "UTILITY",
};

type CannedReplyFormState = {
  id: string | null;
  title: string;
  body: string;
  category: string;
};

const EMPTY_CANNED_FORM: CannedReplyFormState = {
  id: null,
  title: "",
  body: "",
  category: "",
};

const CATEGORY_OPTIONS = ["MARKETING", "UTILITY", "AUTHENTICATION"] as const;
const TEMPLATE_VIEW_TABS = [
  { id: "all", label: "Todos" },
  { id: "usable", label: "Utilizáveis" },
  { id: "inactive", label: "Inativos" },
  { id: "review", label: "Aguardando revisão" },
  { id: "meta", label: "Em análise na Meta" },
  { id: "closed", label: "Rejeitados/Cancelados" },
] as const;

type TemplateViewTab = (typeof TEMPLATE_VIEW_TABS)[number]["id"];

type CatalogItem = {
  id: string;
  templateId: string | null;
  name: string;
  displayName: string;
  category: string;
  submittedCategory: string | null;
  wasRecategorized: boolean;
  requestedCategory: string | null;
  metaCategory: string | null;
  effectiveCategory: string | null;
  categoryChanged: boolean;
  categoryChangeLabel: string | null;
  language: string;
  status: string;
  content: string;
  variables: unknown;
  variablesDetected: string[];
  locallyDisabled: boolean;
  localAvailabilityUpdatedAt: string | null;
  componentsSummary: Array<{ type: string; text: string }>;
  canUseInCampaign: boolean;
  canUseInInbox: boolean;
  blockedReason: string | null;
  blockedReasonLabel: string | null;
  lastSyncedAt: string | null;
  updatedAt: string;
  createdAt: string;
  rejectionReason: string | null;
  templateRequest: AppTemplateItem["templateRequest"] | null;
  syncable: boolean;
};

function getStatusClasses(status: string) {
  switch (status.toLowerCase()) {
    case "submitting":
      return "bg-amber-500 text-slate-950";
    case "approved":
      return "bg-emerald-600 text-white";
    case "failed":
    case "rejected":
      return "bg-red-600 text-white";
    case "cancelled":
      return "bg-slate-600 text-white";
    case "pending":
    default:
      return "bg-amber-500 text-slate-950";
  }
}

function getStatusLabel(status: string) {
  switch (status.toLowerCase()) {
    case "requested":
    case "review_started":
      return "Em análise pela Re7online";
    case "adjustment_requested":
      return "Ajustes solicitados";
    case "internal_approved":
      return "Aprovado internamente";
    case "submitted_to_meta":
      return "Submetido à Meta";
    case "approved_meta":
      return "Aprovado pela Meta";
    case "rejected_meta":
      return "Rejeitado pela Meta";
    case "submitting":
    case "pending":
      return "Em analise";
    case "approved":
      return "Aprovado";
    case "rejected":
      return "Rejeitado";
    case "failed":
      return "Falha";
    default:
      return status;
  }
}

function getTemplateLifecycleBucket(status: string) {
  const normalized = status.toLowerCase();
  if (["approved", "approved_meta", "meta_approved"].includes(normalized)) return "approved";
  if (["submitted_to_meta", "submitting", "pending", "meta_pending"].includes(normalized)) return "meta";
  if (["requested", "review_started", "adjustment_requested", "internal_approved"].includes(normalized)) {
    return "review";
  }
  if (["rejected", "rejected_meta", "meta_rejected", "failed", "cancelled"].includes(normalized)) return "closed";
  return "review";
}

function itemMatchesViewTab(item: CatalogItem, tab: TemplateViewTab) {
  if (tab === "all") return true;
  if (tab === "usable") return item.canUseInCampaign;
  if (tab === "inactive") return item.locallyDisabled;
  return getTemplateLifecycleBucket(item.status) === tab;
}

function getUsageLabel(item: Pick<CatalogItem, "canUseInCampaign" | "blockedReasonLabel">) {
  if (item.canUseInCampaign) return "Permitido";
  return item.blockedReasonLabel ? `Bloqueado: ${item.blockedReasonLabel}` : "Bloqueado";
}

function normalizeFilterValue(input: string) {
  return input.trim().toLowerCase();
}

function getTemplateVariableLabels(variables: unknown): string[] {
  if (Array.isArray(variables)) {
    return variables
      .map((value, index) => (typeof value === "string" && value.trim() ? value.trim() : String(index + 1)))
      .filter(Boolean);
  }
  if (variables && typeof variables === "object") {
    return Object.keys(variables as Record<string, unknown>).filter(Boolean);
  }
  if (typeof variables === "number" && Number.isInteger(variables) && variables > 0) {
    return Array.from({ length: variables }, (_, index) => String(index + 1));
  }
  return [];
}

function normalizeTemplateName(input: string) {
  return input.trim().toLowerCase();
}

function isTemplateRequestPendingLike(status: string) {
  const normalized = status.trim().toLowerCase();
  return [
    "pending",
    "submitting",
    "requested",
    "review_started",
    "adjustment_requested",
    "internal_approved",
    "submitted_to_meta",
  ].includes(normalized);
}

function extractNumberedVariables(content: string) {
  const keys = new Set<string>();
  for (const match of content.matchAll(/{{\s*(\d+)\s*}}/g)) {
    if (match[1]) keys.add(String(Number(match[1])));
  }
  return Array.from(keys).sort((left, right) => Number(left) - Number(right));
}

function hasVariableAtContentEdge(content: string) {
  const trimmed = content.trim();
  return /^{{\s*\d+\s*}}/.test(trimmed) || /{{\s*\d+\s*}}$/.test(trimmed);
}

function hasAdjacentVariables(content: string) {
  return /}}\s*{{/.test(content);
}

function looksPromotional(content: string) {
  return /\b(promo[cç][aã]o|desconto|oferta|imperd[ií]vel|compre|cupom|liquida[cç][aã]o|black\s*friday)\b/i.test(content);
}

function buildTemplatePreviewWithExamples(
  content: string,
  variables: Array<{ key: string; example: string }>
) {
  let preview = content.trim();
  for (const variable of variables) {
    const example = variable.example.trim() || `[exemplo de {{${variable.key}}}]`;
    preview = preview.replace(new RegExp(`{{\\s*${variable.key}\\s*}}`, "g"), example);
  }
  return preview;
}

function getCatalogItemVariableDetails(item: CatalogItem): Array<{ key: string; description: string; example: string }> {
  if (item.variables && typeof item.variables === "object" && !Array.isArray(item.variables)) {
    const raw = item.variables as Record<string, unknown>;
    const details = raw.variableDetails ?? raw.variables;
    if (Array.isArray(details)) {
      return details
        .map((detail) => {
          if (!detail || typeof detail !== "object") return null;
          const typed = detail as Record<string, unknown>;
          const key = String(typed.key ?? "").trim();
          if (!key) return null;
          return {
            key,
            description: String(typed.description ?? "").trim(),
            example: String(typed.example ?? "").trim(),
          };
        })
        .filter((detail): detail is { key: string; description: string; example: string } => Boolean(detail));
    }
  }
  return item.variablesDetected.map((key) => ({ key, description: "", example: "" }));
}

function canTenantCancelTemplateRequest(item: CatalogItem | null) {
  return Boolean(item?.id.startsWith("request:") && item.status === "requested" && item.templateRequest?.id);
}

function TemplateWhatsappPreview({
  body,
  variableExamples,
  category,
  language,
  status,
  templateName,
  emptyText = "Informe uma mensagem para visualizar a prévia.",
}: {
  body: string;
  variableExamples: Array<{ key: string; example: string }>;
  category: string;
  language: string;
  status: string;
  templateName: string;
  emptyText?: string;
}) {
  const previewBody = buildTemplatePreviewWithExamples(body, variableExamples);
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white/85">Prévia no WhatsApp</p>
          <p className="mt-1 text-xs text-white/50">{templateName || "template_sem_nome"}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
          <span className="rounded-full border border-white/15 bg-white/10 px-2 py-1 text-white/75">{category || "UTILITY"}</span>
          <span className="rounded-full border border-white/15 bg-white/10 px-2 py-1 text-white/75">{language || "pt_BR"}</span>
          <span className="rounded-full border border-white/15 bg-white/10 px-2 py-1 text-white/75">{getStatusLabel(status || "draft")}</span>
        </div>
      </div>
      <div className="mt-3 rounded-xl border border-emerald-200/10 bg-[#0b2b24] p-4">
        <div className="ml-auto max-w-[88%] rounded-2xl rounded-tr-sm bg-[#dcf8c6] px-3 py-2 text-sm leading-relaxed text-slate-950 shadow">
          {previewBody ? (
            <p className="whitespace-pre-wrap">{previewBody}</p>
          ) : (
            <p className="text-slate-600">{emptyText}</p>
          )}
        </div>
      </div>
      <p className="mt-2 text-xs text-white/50">
        A aparência final pode variar conforme o WhatsApp e componentes aprovados pela Meta.
      </p>
    </div>
  );
}

function isRetryableLocalTemplateFailure(item: Pick<AppTemplateItem, "status" | "rejectionReason">) {
  const normalizedStatus = item.status.trim().toLowerCase();
  const normalizedReason = String(item.rejectionReason || "").trim().toLowerCase();
  if (normalizedStatus !== "failed") return false;
  return (
    normalizedReason === "template_name_required" ||
    normalizedReason === "template_name_invalid" ||
    normalizedReason === "template_category_invalid" ||
    normalizedReason === "template_language_required" ||
    normalizedReason === "template_language_invalid" ||
    normalizedReason === "template_content_required" ||
    normalizedReason === "template_content_too_long" ||
    normalizedReason === "template_variables_invalid"
  );
}

function sortTemplates(items: AppTemplateItem[]) {
  return [...items].sort((left, right) => {
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

function sortRequests(items: AppTemplateRequestItem[]) {
  return [...items].sort((left, right) => {
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

function sortCatalogItems(items: CatalogItem[]) {
  return [...items].sort((left, right) => {
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

function buildCatalogItems(templates: AppTemplateItem[], requests: AppTemplateRequestItem[]) {
  const itemsByName = new Map<string, CatalogItem>();

  for (const request of sortRequests(requests)) {
    const key = normalizeTemplateName(request.name);
    if (!key || itemsByName.has(key)) continue;
    itemsByName.set(key, {
      id: `request:${request.id}`,
      templateId: null,
      name: request.name,
      displayName: request.name,
      category: request.category,
      submittedCategory: request.category,
      wasRecategorized: false,
      requestedCategory: request.category,
      metaCategory: null,
      effectiveCategory: request.category,
      categoryChanged: false,
      categoryChangeLabel: null,
      language: request.language || "pt_BR",
      status: request.status,
      content: request.content,
      variables: request.variables,
      variablesDetected: request.variableDetails?.map((item) => item.key) ?? getTemplateVariableLabels(request.variables),
      locallyDisabled: false,
      localAvailabilityUpdatedAt: null,
      componentsSummary: request.content ? [{ type: "BODY", text: request.content }] : [],
      canUseInCampaign: false,
      canUseInInbox: false,
      blockedReason: isTemplateRequestPendingLike(request.status) ? "pending_review" : "not_approved",
      blockedReasonLabel: isTemplateRequestPendingLike(request.status) ? "Em analise" : "Nao aprovado",
      lastSyncedAt: null,
      updatedAt: request.createdAt,
      createdAt: request.createdAt,
      rejectionReason: request.notes,
      templateRequest: {
        id: request.id,
        status: request.status,
        notes: request.notes,
        createdAt: request.createdAt,
      },
      syncable: false,
    });
  }

  for (const template of sortTemplates(templates)) {
    const key = normalizeTemplateName(template.name);
    if (!key) continue;
    itemsByName.set(key, {
      id: template.id,
      templateId: template.id,
      name: template.name,
      displayName: template.displayName || template.name,
      category: template.category,
      submittedCategory: template.submittedCategory,
      wasRecategorized: template.wasRecategorized,
      requestedCategory: template.requestedCategory ?? template.submittedCategory ?? template.category,
      metaCategory: template.metaCategory ?? template.category,
      effectiveCategory: template.effectiveCategory ?? template.category,
      categoryChanged: template.categoryChanged === true,
      categoryChangeLabel: template.categoryChangeLabel ?? null,
      language: template.language,
      status: template.status,
      content: template.content,
      variables: template.variables,
      variablesDetected: template.variablesDetected ?? getTemplateVariableLabels(template.variables),
      locallyDisabled: template.locallyDisabled === true,
      localAvailabilityUpdatedAt: template.localAvailabilityUpdatedAt ?? null,
      componentsSummary: template.componentsSummary ?? (template.content ? [{ type: "BODY", text: template.content }] : []),
      canUseInCampaign: template.canUseInCampaign === true,
      canUseInInbox: template.canUseInInbox === true,
      blockedReason: template.blockedReason ?? null,
      blockedReasonLabel: template.blockedReasonLabel ?? null,
      lastSyncedAt: template.lastSyncedAt ?? null,
      updatedAt: template.updatedAt,
      createdAt: template.createdAt,
      rejectionReason: template.rejectionReason,
      templateRequest: template.templateRequest ?? null,
      syncable: true,
    });
  }

  return sortCatalogItems(Array.from(itemsByName.values()));
}

function getTemplateReason(item: Pick<AppTemplateItem, "status" | "rejectionReason">) {
  if (item.rejectionReason) return item.rejectionReason;
  const normalizedStatus = item.status.toLowerCase();
  if (normalizedStatus === "submitting" || normalizedStatus === "pending") {
    return "Em analise pela Meta";
  }
  if (normalizedStatus === "failed") {
    return "Falha ao enviar para analise";
  }
  return "-";
}

function getTemplateRecategorizationLabel(
  item: Pick<CatalogItem, "category" | "submittedCategory" | "wasRecategorized">
) {
  if (!item.wasRecategorized || !item.submittedCategory || item.submittedCategory === item.category) {
    return null;
  }
  return {
    badge: "Recategorizado pela Meta",
    detail: `${item.submittedCategory} -> ${item.category}`,
  };
}

function isNetworkTimeoutLikeError(error: AppApiError) {
  return error.errorCode === "network_timeout" || error.errorCode === "network_error" || error.status === 0;
}

export default function AppTemplatesPage() {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [templates, setTemplates] = useState<AppTemplateItem[]>([]);
  const [requests, setRequests] = useState<AppTemplateRequestItem[]>([]);
  const [cannedReplies, setCannedReplies] = useState<AppCannedReplyItem[]>([]);
  const [canManageCannedReplies, setCanManageCannedReplies] = useState(false);
  const [cannedForm, setCannedForm] = useState<CannedReplyFormState>(EMPTY_CANNED_FORM);
  const [cannedSubmitting, setCannedSubmitting] = useState(false);
  const [cannedActionId, setCannedActionId] = useState<string | null>(null);
  const [cannedError, setCannedError] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateRequestFormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncingTemplateId, setSyncingTemplateId] = useState<string | null>(null);
  const [highlightedTemplateId, setHighlightedTemplateId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
  const [isRequestDrawerOpen, setIsRequestDrawerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [viewTab, setViewTab] = useState<TemplateViewTab>("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [languageFilter, setLanguageFilter] = useState("all");
  const [campaignUseFilter, setCampaignUseFilter] = useState("all");
  const [cannedSearch, setCannedSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const detectedFormVariables = useMemo(() => extractNumberedVariables(form.content), [form.content]);
  const formWarnings = useMemo(() => {
    const warnings: string[] = [];
    if (form.category === "MARKETING") {
      warnings.push("Templates de marketing exigem revisão mais criteriosa e consentimento adequado.");
    }
    if (form.category === "UTILITY" && looksPromotional(form.content)) {
      warnings.push("O conteúdo parece promocional. Revise se UTILITY é a categoria correta.");
    }
    return warnings;
  }, [form.category, form.content]);
  const catalogItems = useMemo(() => buildCatalogItems(templates, requests), [templates, requests]);
  const filteredCannedReplies = useMemo(() => {
    const query = cannedSearch.trim().toLowerCase();
    return cannedReplies.filter((reply) => {
      if (!query) return true;
      return [reply.title, reply.body, reply.category ?? "", reply.active ? "ativa" : "inativa"].some((value) =>
        value.toLowerCase().includes(query)
      );
    });
  }, [cannedReplies, cannedSearch]);
  const approvedTemplatesCount = useMemo(
    () => catalogItems.filter((item) => item.status.toLowerCase() === "approved").length,
    [catalogItems]
  );
  const pendingTemplatesCount = useMemo(
    () =>
      catalogItems.filter((item) => {
        const status = item.status.toLowerCase();
        return [
          "pending",
          "submitting",
          "pending_review",
          "requested",
          "review_started",
          "adjustment_requested",
          "internal_approved",
          "submitted_to_meta",
        ].includes(status);
      }).length,
    [catalogItems]
  );
  const reviewRequestsCount = useMemo(
    () => catalogItems.filter((item) => getTemplateLifecycleBucket(item.status) === "review").length,
    [catalogItems]
  );
  const rejectedTemplatesCount = useMemo(
    () => catalogItems.filter((item) => ["rejected", "rejected_meta", "meta_rejected", "failed"].includes(item.status.toLowerCase())).length,
    [catalogItems]
  );
  const cancelledTemplatesCount = useMemo(
    () => catalogItems.filter((item) => item.status.toLowerCase() === "cancelled").length,
    [catalogItems]
  );
  const campaignReadyCount = useMemo(
    () => catalogItems.filter((item) => item.canUseInCampaign).length,
    [catalogItems]
  );
  const statusOptions = useMemo(
    () => Array.from(new Set(catalogItems.map((item) => item.status).filter(Boolean))).sort(),
    [catalogItems]
  );
  const categoryOptions = useMemo(
    () => Array.from(new Set(catalogItems.map((item) => item.category).filter(Boolean))).sort(),
    [catalogItems]
  );
  const languageOptions = useMemo(
    () => Array.from(new Set(catalogItems.map((item) => item.language).filter(Boolean))).sort(),
    [catalogItems]
  );
  const filteredCatalogItems = useMemo(() => {
    const normalizedSearch = normalizeFilterValue(search);
    return catalogItems.filter((item) => {
      if (
        normalizedSearch &&
        ![
          item.name,
          item.displayName,
          item.category,
          item.language,
          item.status,
          item.content,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch)
      ) {
        return false;
      }
      if (!itemMatchesViewTab(item, viewTab)) return false;
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
      if (languageFilter !== "all" && item.language !== languageFilter) return false;
      if (campaignUseFilter === "ready" && !item.canUseInCampaign) return false;
      if (campaignUseFilter === "blocked" && item.canUseInCampaign) return false;
      return true;
    });
  }, [campaignUseFilter, catalogItems, categoryFilter, languageFilter, search, statusFilter, viewTab]);
  const selectedItem = useMemo(
    () => filteredCatalogItems.find((item) => item.id === selectedItemId) ?? null,
    [filteredCatalogItems, selectedItemId]
  );
  const selectedVariableDetails = useMemo(
    () => (selectedItem ? getCatalogItemVariableDetails(selectedItem) : []),
    [selectedItem]
  );

  useEffect(() => {
    if (!isDetailDrawerOpen && !isRequestDrawerOpen) return undefined;
    const previousBodyOverflow = document.body.style.overflow;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousDocumentOverflow;
    };
  }, [isDetailDrawerOpen, isRequestDrawerOpen]);

  const openDetails = useCallback((itemId: string) => {
    setSelectedItemId(itemId);
    setIsDetailDrawerOpen(true);
  }, []);

  const handleUnauthorized = useCallback(() => {
    clearAppSession();
    router.replace("/app/login");
  }, [router]);

  const loadData = useCallback(
    async (activeSession: AppSession) => {
      const [templatesResponse, requestsResponse, cannedResponse] = await Promise.all([
        listAppTemplates(activeSession),
        listAppTemplateRequests(activeSession),
        listAppCannedReplies(activeSession, { includeInactive: true }),
      ]);
      const nextTemplates = sortTemplates(templatesResponse.items);
      const nextRequests = requestsResponse.items;
      setTemplates(nextTemplates);
      setRequests(nextRequests);
      setCannedReplies(cannedResponse.items);
      setCanManageCannedReplies(cannedResponse.permissions.canManage);
      return {
        templates: nextTemplates,
        requests: nextRequests,
        cannedReplies: cannedResponse.items,
      };
    },
    []
  );

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
    if (!session) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    loadData(session)
      .catch((err: { status?: number; message?: string }) => {
        if (cancelled) return;
        if (err.status === 401) {
          handleUnauthorized();
          return;
        }
        setError(err.message || "Erro ao carregar templates.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [handleUnauthorized, loadData, session]);

  useEffect(() => {
    setForm((current) => {
      const nextDetails = detectedFormVariables.map((key) => {
        return (
          current.variableDetails.find((item) => item.key === key) ?? {
            key,
            description: "",
            example: "",
          }
        );
      });
      if (
        nextDetails.length === current.variableDetails.length &&
        nextDetails.every((item, index) => item.key === current.variableDetails[index]?.key)
      ) {
        return current;
      }
      return { ...current, variableDetails: nextDetails };
    });
  }, [detectedFormVariables]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) return;
    setFormError(null);
    setSuccess(null);

    const name = form.name.trim();
    const content = form.content.trim();
    const category = form.category.trim();
    const language = form.language.trim();
    if (!name || !content || !category || !language) {
      setFormError("Preencha nome, categoria, idioma e conteudo.");
      return;
    }
    if (hasVariableAtContentEdge(content)) {
      setFormError("Evite variavel no inicio ou no fim do conteudo.");
      return;
    }
    if (hasAdjacentVariables(content)) {
      setFormError("Evite variaveis adjacentes no conteudo.");
      return;
    }
    const normalizedName = normalizeTemplateName(name);
    const conflictingTemplate = templates.find(
      (item) => normalizeTemplateName(item.name) === normalizedName
    );
    const canReuseFailedTemplate = conflictingTemplate
      ? isRetryableLocalTemplateFailure(conflictingTemplate)
      : false;
    const hasPendingRequest = requests.some(
      (item) =>
        normalizeTemplateName(item.name) === normalizedName &&
        isTemplateRequestPendingLike(item.status)
    );
    if (hasPendingRequest && !canReuseFailedTemplate) {
      setFormError("Ja existe um template com esse nome em analise.");
      return;
    }
    if (conflictingTemplate && !canReuseFailedTemplate) {
      setFormError("Ja existe um template com esse nome.");
      return;
    }

    for (const variable of form.variableDetails) {
      if (!variable.description.trim() || !variable.example.trim()) {
        setFormError(`Informe descricao e exemplo para a variavel {{${variable.key}}}.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const response = await createAppTemplateRequest(session, {
        name,
        content,
        category,
        language,
        variableDetails: form.variableDetails,
      });
      await loadData(session);
      setForm(EMPTY_FORM);
      setIsRequestDrawerOpen(false);
      setSuccess(
        response.notification?.delivered === false
          ? "Solicitação criada, mas a notificação interna por e-mail não pôde ser enviada."
          : "Solicitação enviada para análise da Re7online. Você poderá acompanhar o status nesta tela."
      );
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      const payload = (typed.payload ?? null) as
        | {
            request?: AppTemplateRequestItem;
            submission?: { templateId?: string | null };
          }
        | null;
      let recoveredAfterReload = false;
      let reloadResult:
        | {
            templates: AppTemplateItem[];
            requests: AppTemplateRequestItem[];
          }
        | undefined;
      if (payload?.request || payload?.submission?.templateId || isNetworkTimeoutLikeError(typed)) {
        reloadResult = await loadData(session);
        if (isNetworkTimeoutLikeError(typed)) {
          const reloadedName = normalizeTemplateName(name);
          recoveredAfterReload =
            (reloadResult?.templates ?? []).some(
              (item) => normalizeTemplateName(item.name) === reloadedName
            ) ||
            (reloadResult?.requests ?? []).some(
              (item) => normalizeTemplateName(item.name) === reloadedName
            );
        }
      }
      if (recoveredAfterReload) {
        setForm(EMPTY_FORM);
        setIsRequestDrawerOpen(false);
        setSuccess("Solicitação enviada para análise da Re7online. Você poderá acompanhar o status nesta tela.");
        return;
      }
      if (isNetworkTimeoutLikeError(typed)) {
        setFormError(
          "O envio pode ter sido concluido. Atualizando a lista para verificar o status..."
        );
        return;
      }
      if (typed.errorCode === "template_already_pending") {
        setFormError("Ja existe um template com esse nome em analise.");
        return;
      }
      if (typed.errorCode === "template_name_exists") {
        setFormError("Ja existe um template com esse nome.");
        return;
      }
      setFormError(
        typed.message ||
          typed.details ||
          "Nao foi possivel processar o template. Tente novamente."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSyncTemplate = useCallback(
    async (templateId: string) => {
      if (!session) return;
      setError(null);
      setFormError(null);
      setSuccess(null);
      setSyncingTemplateId(templateId);
      try {
        const response = await syncAppTemplate(session, templateId);
        const previousTemplate = templates.find((item) => item.id === response.template.id) ?? null;
        const categoryChanged = Boolean(
          previousTemplate &&
            (previousTemplate.category !== response.template.category ||
              previousTemplate.wasRecategorized !== response.template.wasRecategorized)
        );
        setTemplates((current) =>
          sortTemplates(
            current.map((item) =>
              item.id === response.template.id
                ? {
                    ...item,
                    category: response.template.category,
                    submittedCategory: response.template.submittedCategory,
                    wasRecategorized: response.template.wasRecategorized,
                    status: response.template.status,
                    rejectionReason: response.template.rejectionReason,
                    updatedAt: response.template.updatedAt,
                  }
                : item
            )
          )
        );
        await loadData(session);
        setHighlightedTemplateId(response.template.id);
        setSuccess(
          categoryChanged
            ? "Status atualizado. A Meta recategorizou este template."
            : response.template.status.toLowerCase() === "approved"
              ? "Template reconciliado com a Meta."
            : "Status atualizado com sucesso."
        );
        window.setTimeout(() => setHighlightedTemplateId((current) => (current === response.template.id ? null : current)), 2500);
      } catch (err) {
        const typed = err as AppApiError;
        if (typed.status === 401) {
          handleUnauthorized();
          return;
        }
        setError(typed.message || typed.details || "Erro ao atualizar status do template.");
      } finally {
        setSyncingTemplateId(null);
      }
    },
    [handleUnauthorized, session, templates]
  );

  const handleCancelRequest = useCallback(
    async (item: CatalogItem) => {
      if (!session || !item.templateRequest?.id) return;
      if (!canTenantCancelTemplateRequest(item)) {
        setError("Esta solicitação já foi submetida à Meta e não pode ser cancelada por aqui.");
        return;
      }
      if (!window.confirm("Cancelar esta solicitação de template? O registro será mantido para auditoria.")) {
        return;
      }
      setError(null);
      setFormError(null);
      setSuccess(null);
      setSyncingTemplateId(item.id);
      try {
        const response = await cancelAppTemplateRequest(session, item.templateRequest.id);
        await loadData(session);
        setSelectedItemId(`request:${response.request.id}`);
        setSuccess("Solicitação cancelada. O registro foi mantido para auditoria.");
      } catch (err) {
        const typed = err as AppApiError;
        if (typed.status === 401) {
          handleUnauthorized();
          return;
        }
        setError(typed.message || typed.details || "Nao foi possivel cancelar a solicitacao.");
      } finally {
        setSyncingTemplateId(null);
      }
    },
    [handleUnauthorized, loadData, session]
  );

  const handleToggleLocalAvailability = useCallback(
    async (item: CatalogItem, disabled: boolean) => {
      if (!session || !item.templateId) return;
      if (disabled) {
        const confirmed = window.confirm(
          "Este modelo continuará aprovado na Meta, mas não ficará disponível para campanhas ou envios pela plataforma."
        );
        if (!confirmed) return;
      }
      setError(null);
      setFormError(null);
      setSuccess(null);
      setSyncingTemplateId(item.templateId);
      try {
        const response = disabled
          ? await disableAppTemplate(session, item.templateId)
          : await enableAppTemplate(session, item.templateId);
        await loadData(session);
        setSelectedItemId(response.template.id);
        setSuccess(disabled ? "Modelo inativado no Converta." : "Modelo reativado no Converta.");
      } catch (err) {
        const typed = err as AppApiError;
        if (typed.status === 401) {
          handleUnauthorized();
          return;
        }
        setError(typed.message || typed.details || "Nao foi possivel atualizar a disponibilidade local do modelo.");
      } finally {
        setSyncingTemplateId(null);
      }
    },
    [handleUnauthorized, loadData, session]
  );

  const handleSyncAllTemplates = useCallback(async () => {
    if (!session) return;
    setError(null);
    setFormError(null);
    setSuccess(null);
    setSyncingAll(true);
    try {
      const response = await syncAppTemplates(session);
      await loadData(session);
      setSuccess(
        `Sincronizacao concluida: ${response.summary.checked} verificados, ${response.summary.updated} atualizados, ${response.summary.approved} aprovados, ${response.summary.rejected} rejeitados.`
      );
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      if (typed.errorCode === "meta_config_missing") {
        setError("Configuracao Meta ausente para sincronizar templates neste tenant.");
        return;
      }
      setError(typed.message || typed.details || "Erro ao sincronizar templates com a Meta.");
    } finally {
      setSyncingAll(false);
    }
  }, [handleUnauthorized, loadData, session]);

  const handleEditCannedReply = useCallback((reply: AppCannedReplyItem) => {
    setCannedForm({
      id: reply.id,
      title: reply.title,
      body: reply.body,
      category: reply.category ?? "",
    });
    setCannedError(null);
  }, []);

  const handleCancelCannedEdit = useCallback(() => {
    setCannedForm(EMPTY_CANNED_FORM);
    setCannedError(null);
  }, []);

  const handleSubmitCannedReply = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!session || !canManageCannedReplies) return;
      const title = cannedForm.title.trim();
      const body = cannedForm.body.trim();
      const category = cannedForm.category.trim();
      if (!title || !body) {
        setCannedError("Preencha titulo e texto da mensagem pronta.");
        return;
      }
      setCannedSubmitting(true);
      setCannedError(null);
      setError(null);
      setSuccess(null);
      try {
        if (cannedForm.id) {
          await updateAppCannedReply(session, cannedForm.id, { title, body, category });
          setSuccess("Mensagem pronta atualizada.");
        } else {
          await createAppCannedReply(session, { title, body, category });
          setSuccess("Mensagem pronta criada.");
        }
        setCannedForm(EMPTY_CANNED_FORM);
        await loadData(session);
      } catch (err) {
        const typed = err as AppApiError;
        if (typed.status === 401) {
          handleUnauthorized();
          return;
        }
        setCannedError(typed.message || typed.details || "Nao foi possivel salvar a mensagem pronta.");
      } finally {
        setCannedSubmitting(false);
      }
    },
    [canManageCannedReplies, cannedForm, handleUnauthorized, loadData, session]
  );

  const handleToggleCannedReply = useCallback(
    async (reply: AppCannedReplyItem) => {
      if (!session || !canManageCannedReplies) return;
      setCannedActionId(reply.id);
      setCannedError(null);
      setError(null);
      setSuccess(null);
      try {
        if (reply.active) {
          await disableAppCannedReply(session, reply.id);
          setSuccess("Mensagem pronta inativada.");
        } else {
          await enableAppCannedReply(session, reply.id);
          setSuccess("Mensagem pronta reativada.");
        }
        await loadData(session);
      } catch (err) {
        const typed = err as AppApiError;
        if (typed.status === 401) {
          handleUnauthorized();
          return;
        }
        setCannedError(typed.message || typed.details || "Nao foi possivel alterar a mensagem pronta.");
      } finally {
        setCannedActionId(null);
      }
    },
    [canManageCannedReplies, handleUnauthorized, loadData, session]
  );

  if (!session) return null;

  return (
    <AppShell
      session={session}
      title="Modelos de mensagem"
      subtitle="Templates aprovados pela Meta para campanhas e retomadas fora da janela de 24h."
    >
      <FeedbackToast message={success} onClose={() => setSuccess(null)} />
      <FeedbackToast message={error} variant="error" onClose={() => setError(null)} />
      {loading ? <p className="text-sm text-white/70">Carregando...</p> : null}

      <div className="grid min-w-0 gap-4">
        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <h2 className="text-lg font-semibold text-white">Central de modelos</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/70">
                Modelos são mensagens aprovadas pela Meta para iniciar conversas fora da janela de atendimento do WhatsApp.
                Eles são usados em campanhas e em retomadas de atendimento quando a janela de 24h estiver fechada.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSyncAllTemplates}
                disabled={syncingAll || catalogItems.length === 0}
                className="rounded-lg border border-sky-300/30 bg-sky-900/20 px-3 py-2 text-xs font-semibold text-sky-100 transition hover:border-sky-200/60 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {syncingAll ? "Sincronizando..." : "Sincronizar com Meta"}
              </button>
              <button
                type="button"
                onClick={() => setIsRequestDrawerOpen(true)}
                className="rounded-lg bg-re7-orange px-3 py-2 text-xs font-semibold text-white transition hover:brightness-110"
              >
                Nova solicitação
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-5">
            {["Você solicita", "Re7online revisa", "Re7online envia à Meta", "Meta aprova ou rejeita", "Modelo disponível"].map((step, index) => (
              <div key={step} className="rounded-lg border border-white/10 bg-re7-navy/50 p-3">
                <p className="text-[11px] font-semibold uppercase text-re7-sky">Etapa {index + 1}</p>
                <p className="mt-1 text-sm font-semibold text-white/85">{step}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          {[
            { label: "Aprovados", value: approvedTemplatesCount, tone: "border-emerald-300/20 bg-emerald-900/20 text-emerald-100" },
            { label: "Em análise", value: pendingTemplatesCount, tone: "border-amber-300/20 bg-amber-900/20 text-amber-100" },
            { label: "Aguardando revisão", value: reviewRequestsCount, tone: "border-sky-300/20 bg-sky-900/20 text-sky-100" },
            { label: "Rejeitados", value: rejectedTemplatesCount, tone: "border-red-300/20 bg-red-900/20 text-red-100" },
            { label: "Cancelados", value: cancelledTemplatesCount, tone: "border-slate-300/20 bg-slate-800/60 text-slate-100" },
            { label: "Utilizáveis", value: campaignReadyCount, tone: "border-re7-sky/25 bg-re7-sky/10 text-sky-100" },
          ].map((card) => (
            <div key={card.label} className={`rounded-lg border p-3 ${card.tone}`}>
              <p className="text-[11px] font-semibold uppercase opacity-75">{card.label}</p>
              <p className="mt-1 text-2xl font-semibold">{card.value}</p>
            </div>
          ))}
        </section>

        <section className="rounded-xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 p-3 sm:p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-sm font-semibold">Mensagens prontas</h2>
                <p className="mt-1 max-w-3xl text-xs leading-relaxed text-white/60">
                  Textos internos para respostas rápidas dentro da janela de atendimento. Não são templates Meta e não reabrem conversa fora da janela de 24h.
                </p>
              </div>
              <label className="grid min-w-[min(100%,20rem)] gap-1 text-xs text-white/70">
                Buscar
                <input
                  value={cannedSearch}
                  onChange={(event) => setCannedSearch(event.target.value)}
                  placeholder="Título, categoria ou texto"
                  className="rounded-md border border-white/15 bg-re7-navy px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                />
              </label>
            </div>
            <p className="mt-3 rounded-lg border border-amber-300/20 bg-amber-900/15 px-3 py-2 text-xs text-amber-100">
              A cobrança depende da categoria, país, entrega e política vigente da Meta.
            </p>
          </div>

          <div className="grid gap-4 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.7fr)] sm:p-4">
            <div className="space-y-2">
              {filteredCannedReplies.length === 0 ? (
                <p className="rounded-lg border border-white/10 bg-re7-navy/50 p-3 text-sm text-white/65">
                  Nenhuma mensagem pronta encontrada.
                </p>
              ) : (
                filteredCannedReplies.map((reply) => (
                  <article
                    key={reply.id}
                    className={`rounded-lg border p-3 ${
                      reply.active
                        ? "border-white/10 bg-re7-navy/50"
                        : "border-slate-400/15 bg-slate-900/30 opacity-75"
                    }`}
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-white">{reply.title}</h3>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            reply.active ? "bg-emerald-400/10 text-emerald-100" : "bg-slate-400/10 text-slate-200"
                          }`}>
                            {reply.active ? "Ativa" : "Inativa"}
                          </span>
                          {reply.category ? (
                            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/65">
                              {reply.category}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/75">{reply.body}</p>
                        <p className="mt-2 text-[11px] text-white/45">Atualizada em {formatDateTime(reply.updatedAt)}</p>
                      </div>
                      {canManageCannedReplies ? (
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleEditCannedReply(reply)}
                            disabled={cannedSubmitting || cannedActionId === reply.id}
                            className="rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleToggleCannedReply(reply)}
                            disabled={cannedSubmitting || cannedActionId === reply.id}
                            className="rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {cannedActionId === reply.id
                              ? "Salvando..."
                              : reply.active
                                ? "Inativar"
                                : "Reativar"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </article>
                ))
              )}
            </div>

            <aside className="rounded-lg border border-white/10 bg-re7-navy/60 p-4">
              {canManageCannedReplies ? (
                <form onSubmit={handleSubmitCannedReply} className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      {cannedForm.id ? "Editar mensagem pronta" : "Nova mensagem pronta"}
                    </h3>
                    <p className="mt-1 text-xs text-white/55">
                      Operadores poderão usar apenas mensagens ativas no Inbox.
                    </p>
                  </div>
                  <label className="grid gap-1 text-xs text-white/70">
                    Título
                    <input
                      value={cannedForm.title}
                      onChange={(event) => setCannedForm((current) => ({ ...current, title: event.target.value }))}
                      maxLength={80}
                      className="rounded-md border border-white/15 bg-re7-navy px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-white/70">
                    Categoria interna
                    <input
                      value={cannedForm.category}
                      onChange={(event) => setCannedForm((current) => ({ ...current, category: event.target.value }))}
                      maxLength={48}
                      placeholder="ex: Saudação, Financeiro, Suporte"
                      className="rounded-md border border-white/15 bg-re7-navy px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-white/70">
                    Texto
                    <textarea
                      value={cannedForm.body}
                      onChange={(event) => setCannedForm((current) => ({ ...current, body: event.target.value }))}
                      rows={6}
                      maxLength={2000}
                      className="rounded-md border border-white/15 bg-re7-navy px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                    />
                  </label>
                  {cannedError ? (
                    <button
                      type="button"
                      onClick={() => setCannedError(null)}
                      className="flex w-full cursor-pointer items-start justify-between gap-3 rounded-lg border border-red-400/30 bg-red-900/30 p-3 text-left text-sm text-red-100 hover:bg-red-900/40"
                      aria-label="Fechar aviso"
                      title="Fechar aviso"
                    >
                      <span className="min-w-0">{cannedError}</span>
                      <span className="shrink-0 text-lg leading-none opacity-85" aria-hidden="true">
                        ×
                      </span>
                    </button>
                  ) : null}
                  <div className="flex flex-wrap justify-end gap-2">
                    {cannedForm.id ? (
                      <button
                        type="button"
                        onClick={handleCancelCannedEdit}
                        disabled={cannedSubmitting}
                        className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                    ) : null}
                    <button
                      type="submit"
                      disabled={cannedSubmitting}
                      className="rounded-lg bg-re7-orange px-3 py-2 text-xs font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {cannedSubmitting ? "Salvando..." : cannedForm.id ? "Salvar alterações" : "Criar mensagem pronta"}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/65">
                  Você pode consultar mensagens prontas ativas. A criação e manutenção ficam disponíveis para administradores e supervisores.
                </div>
              )}
            </aside>
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 p-3 sm:p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-sm font-semibold">Catálogo de modelos</h2>
                <p className="mt-1 text-xs text-white/60">
                  Veja o que pode ser usado em campanhas, o que está em revisão e o que depende da Meta.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {TEMPLATE_VIEW_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setViewTab(tab.id)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      viewTab === tab.id
                        ? "border-re7-sky/50 bg-re7-sky/20 text-sky-100"
                        : "border-white/15 bg-white/5 text-white/70 hover:bg-white/10"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(260px,1fr)_150px_150px_130px_160px]">
              <label className="grid gap-1 text-xs text-white/70">
                Busca
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Nome, categoria ou conteúdo"
                  className="max-w-xl rounded-md border border-white/15 bg-re7-navy px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                />
              </label>
              <label className="grid gap-1 text-xs text-white/70">
                Status
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="rounded-md border border-white/15 bg-re7-navy px-3 py-2 text-sm text-white"
                >
                  <option value="all">Todos</option>
                  {statusOptions.map((option) => (
                    <option key={option} value={option}>{getStatusLabel(option)}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-white/70">
                Categoria
                <select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                  className="rounded-md border border-white/15 bg-re7-navy px-3 py-2 text-sm text-white"
                >
                  <option value="all">Todas</option>
                  {categoryOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-white/70">
                Idioma
                <select
                  value={languageFilter}
                  onChange={(event) => setLanguageFilter(event.target.value)}
                  className="rounded-md border border-white/15 bg-re7-navy px-3 py-2 text-sm text-white"
                >
                  <option value="all">Todos</option>
                  {languageOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-white/70">
                Uso em campanha
                <select
                  value={campaignUseFilter}
                  onChange={(event) => setCampaignUseFilter(event.target.value)}
                  className="rounded-md border border-white/15 bg-re7-navy px-3 py-2 text-sm text-white"
                >
                  <option value="all">Todos</option>
                  <option value="ready">Utilizáveis</option>
                  <option value="blocked">Bloqueados</option>
                </select>
              </label>
            </div>
          </div>

          {campaignReadyCount === 0 ? (
            <div className="m-3 rounded-lg border border-amber-300/30 bg-amber-900/20 p-3 text-sm text-amber-100 sm:m-4">
              <p className="font-semibold">Este tenant ainda não possui modelo aprovado para envio ativo.</p>
              <p className="mt-1 text-amber-100/80">
                Crie uma solicitação ou sincronize modelos já aprovados para habilitar campanhas.
              </p>
            </div>
          ) : null}

          {catalogItems.length === 0 ? (
            <p className="p-4 text-sm text-white/70">Nenhum modelo encontrado.</p>
          ) : filteredCatalogItems.length === 0 ? (
            <p className="p-4 text-sm text-white/70">Nenhum modelo corresponde aos filtros.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[940px] text-sm">
                <thead className="bg-white/10 text-left text-xs uppercase text-white/55">
                  <tr>
                    <th className="px-3 py-2">Modelo</th>
                    <th className="px-3 py-2">Categoria</th>
                    <th className="px-3 py-2">Meta</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Campanha</th>
                    <th className="px-3 py-2">Atualização</th>
                    <th className="px-3 py-2">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCatalogItems.map((item) => (
                    <tr
                      key={item.id}
                      className={`border-t border-white/10 ${
                        highlightedTemplateId === item.templateId
                          ? "bg-emerald-500/10"
                          : selectedItem?.id === item.id
                            ? "bg-white/10"
                            : "hover:bg-white/[0.03]"
                      }`}
                    >
                      <td className="px-3 py-2">
                        <button type="button" onClick={() => openDetails(item.id)} className="text-left font-semibold text-white hover:text-re7-sky">
                          {item.displayName}
                        </button>
                        <p className="text-xs text-white/45">{item.name}</p>
                        {item.locallyDisabled ? (
                          <span className="mt-1 inline-flex rounded-full border border-amber-300/30 bg-amber-900/20 px-2 py-0.5 text-[11px] font-semibold text-amber-100">
                            Inativo no Converta
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <p className="text-white/85">{item.requestedCategory || item.submittedCategory || item.category}</p>
                        <p className="text-xs text-white/45">solicitada</p>
                      </td>
                      <td className="px-3 py-2">
                        <p className={item.categoryChanged ? "font-semibold text-amber-100" : "text-white/85"}>
                          {item.effectiveCategory || item.category}
                        </p>
                        {item.categoryChanged ? <p className="text-xs text-amber-200">recategorizado</p> : <p className="text-xs text-white/45">efetiva</p>}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getStatusClasses(item.status)}`}>
                          {getStatusLabel(item.status)}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={item.canUseInCampaign ? "text-emerald-100" : "text-amber-100"}>
                          {item.canUseInCampaign ? "Permitido" : "Bloqueado"}
                        </span>
                        {!item.canUseInCampaign && item.blockedReasonLabel ? (
                          <p className="text-xs text-white/45">{item.blockedReasonLabel}</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-white/70">{formatDateTime(item.updatedAt)}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openDetails(item.id)}
                            className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
                              selectedItem?.id === item.id
                                ? "border-re7-sky/40 bg-re7-sky/15 text-sky-100"
                                : "border-white/15 bg-white/5 text-white/80 hover:bg-white/10"
                            }`}
                          >
                            Ver detalhes
                          </button>
                          {item.syncable && item.templateId ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleToggleLocalAvailability(item, !item.locallyDisabled)}
                                disabled={syncingTemplateId === item.templateId}
                                className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {syncingTemplateId === item.templateId
                                  ? "Atualizando..."
                                  : item.locallyDisabled
                                    ? "Reativar"
                                    : "Inativar"}
                              </button>
                            <button
                              type="button"
                              onClick={() => handleSyncTemplate(item.templateId as string)}
                              disabled={syncingTemplateId === item.templateId}
                              className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {syncingTemplateId === item.templateId ? "Atualizando..." : "Atualizar"}
                            </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </div>

      {isDetailDrawerOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-6">
          <aside className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-white/10 bg-re7-navy text-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
              <div>
                <h2 className="text-lg font-semibold">Detalhes do modelo</h2>
                <p className="mt-1 text-xs text-white/55">Status, categoria, variáveis e prévia da mensagem.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsDetailDrawerOpen(false)}
                className="rounded-md border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10"
              >
                Fechar
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {selectedItem ? (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                  <div className="grid gap-3">
                    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h3 className="text-base font-semibold">{selectedItem.displayName}</h3>
                          <p className="mt-1 text-xs text-white/50">{selectedItem.name}</p>
                        </div>
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getStatusClasses(selectedItem.status)}`}>
                          {getStatusLabel(selectedItem.status)}
                        </span>
                      </div>
                      <p className={`mt-3 rounded-md border px-3 py-2 text-xs ${selectedItem.canUseInCampaign ? "border-emerald-300/25 bg-emerald-900/20 text-emerald-100" : "border-amber-300/25 bg-amber-900/20 text-amber-100"}`}>
                        {selectedItem.canUseInCampaign ? "Pode ser usado em campanhas." : "Ainda não pode ser usado em campanhas."}
                        {selectedItem.locallyDisabled ? " O status Meta foi preservado; o bloqueio é apenas local." : ""}
                      </p>
                    </div>
                    <div className="grid gap-2 rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/75 sm:grid-cols-2">
                      <p><span className="block text-xs uppercase text-white/40">Categoria solicitada</span>{selectedItem.requestedCategory || selectedItem.submittedCategory || selectedItem.category}</p>
                      <p><span className="block text-xs uppercase text-white/40">Categoria Meta/efetiva</span>{selectedItem.effectiveCategory || selectedItem.category}</p>
                      <p><span className="block text-xs uppercase text-white/40">Idioma</span>{selectedItem.language}</p>
                      <p><span className="block text-xs uppercase text-white/40">Atualizado</span>{formatDateTime(selectedItem.updatedAt)}</p>
                      <p><span className="block text-xs uppercase text-white/40">Última sincronização</span>{selectedItem.lastSyncedAt ? formatDateTime(selectedItem.lastSyncedAt) : "Não sincronizado"}</p>
                      <p><span className="block text-xs uppercase text-white/40">Origem</span>{selectedItem.id.startsWith("request:") ? "Solicitação interna" : "Catálogo Meta"}</p>
                    </div>
                    {selectedItem.categoryChanged || selectedItem.effectiveCategory === "MARKETING" || selectedItem.category === "MARKETING" ? (
                      <div className="rounded-lg border border-amber-300/25 bg-amber-900/20 p-3 text-sm text-amber-100">
                        {selectedItem.categoryChanged ? (
                          <p className="font-semibold">
                            {selectedItem.categoryChangeLabel ||
                              `A Meta classificou este template como ${selectedItem.effectiveCategory || selectedItem.category}, diferente da categoria solicitada ${selectedItem.requestedCategory || selectedItem.submittedCategory}.`}
                          </p>
                        ) : null}
                        {(selectedItem.effectiveCategory || selectedItem.category) === "MARKETING" ? (
                          <p className="mt-1">Templates de Marketing podem ter custo e regras diferentes. Use com cautela.</p>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                      <p className="text-xs font-semibold uppercase text-white/50">Variáveis e exemplos</p>
                      {selectedVariableDetails.length > 0 ? (
                        <div className="mt-2 grid gap-2">
                          {selectedVariableDetails.map((variable) => (
                            <div key={variable.key} className="rounded-md border border-white/10 bg-re7-navy/60 p-2 text-xs text-white/70">
                              <span className="font-semibold text-white">{`{{${variable.key}}}`}</span>
                              <span className="ml-2">{variable.description || "Sem descrição"}</span>
                              <span className="ml-2 text-white/45">Exemplo: {variable.example || "-"}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-white/55">Nenhuma variável detectada.</p>
                      )}
                    </div>
                    {selectedItem.id.startsWith("request:") ? (
                      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                        <p className="text-xs font-semibold uppercase text-white/50">Ações permitidas</p>
                        {canTenantCancelTemplateRequest(selectedItem) ? (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleCancelRequest(selectedItem)}
                              disabled={syncingTemplateId === selectedItem.id}
                              className="rounded-md border border-red-300/30 bg-red-900/20 px-3 py-2 text-xs font-semibold text-red-100 transition hover:border-red-200/60 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {syncingTemplateId === selectedItem.id ? "Cancelando..." : "Cancelar solicitação"}
                            </button>
                            <span className="text-xs text-white/50">O registro será mantido no histórico.</span>
                          </div>
                        ) : (
                          <p className="mt-2 text-sm text-white/60">
                            Este modelo já foi enviado à Meta ou encerrado. Para alterar o conteúdo, crie uma nova solicitação.
                          </p>
                        )}
                      </div>
                    ) : selectedItem.templateId ? (
                      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                        <p className="text-xs font-semibold uppercase text-white/50">Disponibilidade local</p>
                        <p className="mt-2 text-sm text-white/65">
                          {selectedItem.locallyDisabled
                            ? "Inativo no Converta. Continua no catálogo e preserva o status da Meta, mas não aparece em campanhas ou envios pela plataforma."
                            : "Ativo no Converta quando também estiver aprovado e com componentes válidos na Meta."}
                        </p>
                        <button
                          type="button"
                          onClick={() => handleToggleLocalAvailability(selectedItem, !selectedItem.locallyDisabled)}
                          disabled={syncingTemplateId === selectedItem.templateId}
                          className="mt-3 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {syncingTemplateId === selectedItem.templateId
                            ? "Atualizando..."
                            : selectedItem.locallyDisabled
                              ? "Reativar no Converta"
                              : "Inativar no Converta"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <TemplateWhatsappPreview
                    body={selectedItem.content}
                    variableExamples={selectedVariableDetails}
                    category={selectedItem.category}
                    language={selectedItem.language}
                    status={selectedItem.status}
                    templateName={selectedItem.displayName}
                    emptyText="Este template não possui corpo textual registrado."
                  />
                </div>
              ) : (
                <p className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                  Selecione um modelo para ver detalhes.
                </p>
              )}
            </div>
          </aside>
        </div>
      ) : null}

      {isRequestDrawerOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-6">
          <aside className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-white/10 bg-re7-navy text-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
              <div>
                <h2 className="text-lg font-semibold">Nova solicitação</h2>
                <p className="mt-1 text-xs text-white/55">
                  A Re7online revisará o conteúdo antes de enviar para aprovação da Meta.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsRequestDrawerOpen(false)}
                className="rounded-md border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10"
              >
                Fechar
              </button>
            </div>
            <form onSubmit={handleSubmit} className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="mx-auto grid max-w-4xl gap-4">
                <div className="grid gap-4">
                  <section className="rounded-lg border border-white/10 bg-white/5 p-4">
                    <p className="text-xs font-semibold uppercase text-re7-sky">1. Identificação</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-[minmax(220px,360px)_180px_140px]">
                      <label className="grid gap-1 text-sm text-white/80">
                        Nome técnico sugerido
                        <input
                          value={form.name}
                          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                          placeholder="ex: atendimento_retorno_v1"
                          className="rounded-lg border border-white/15 bg-re7-navy px-3 py-2 text-white outline-none focus:border-re7-sky/50"
                        />
                      </label>
                      <label className="grid gap-1 text-sm text-white/80">
                        Categoria
                        <select
                          value={form.category}
                          onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                          className="rounded-lg border border-white/15 bg-re7-navy px-3 py-2 text-white outline-none focus:border-re7-sky/50"
                        >
                          {CATEGORY_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1 text-sm text-white/80">
                        Idioma
                        <input
                          value={form.language}
                          onChange={(event) => setForm((current) => ({ ...current, language: event.target.value }))}
                          className="rounded-lg border border-white/15 bg-re7-navy px-3 py-2 text-white outline-none focus:border-re7-sky/50"
                        />
                      </label>
                    </div>
                    <p className="mt-2 text-xs text-white/50">
                      Utility: avisos e atendimento. Marketing: ofertas. Authentication: códigos de acesso.
                    </p>
                  </section>
                  <section className="rounded-lg border border-white/10 bg-white/5 p-4">
                    <p className="text-xs font-semibold uppercase text-re7-sky">2. Mensagem</p>
                    <label className="mt-3 grid max-w-3xl gap-1 text-sm text-white/80">
                      Conteúdo do modelo
                      <textarea
                        value={form.content}
                        onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
                        rows={5}
                        placeholder="Olá {{1}}, tudo bem? Estamos retornando sobre sua solicitação."
                        className="rounded-lg border border-white/15 bg-re7-navy px-3 py-2 text-white outline-none focus:border-re7-sky/50"
                      />
                    </label>
                    <p className="mt-2 text-xs text-white/50">
                      Use variáveis como {"{{1}}"} e {"{{2}}"} para informações que mudam por contato.
                    </p>
                    {formWarnings.length > 0 ? (
                      <div className="mt-3 rounded-lg border border-amber-300/25 bg-amber-900/20 p-3 text-xs text-amber-100">
                        {formWarnings.map((warning) => <p key={warning}>{warning}</p>)}
                      </div>
                    ) : null}
                  </section>
                  <section className="rounded-lg border border-white/10 bg-white/5 p-4">
                    <p className="text-xs font-semibold uppercase text-re7-sky">3. Variáveis</p>
                    {form.variableDetails.length === 0 ? (
                      <p className="mt-2 text-sm text-white/55">Nenhuma variável detectada no conteúdo.</p>
                    ) : (
                      <div className="mt-3 grid gap-3">
                        {form.variableDetails.map((variable) => (
                          <div key={variable.key} className="grid gap-2 rounded-md border border-white/10 bg-re7-navy/70 p-3 md:grid-cols-[80px_minmax(0,1fr)_minmax(0,1fr)]">
                            <p className="text-xs font-semibold text-white/70">{`{{${variable.key}}}`}</p>
                            <input
                              value={variable.description}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  variableDetails: current.variableDetails.map((item) =>
                                    item.key === variable.key ? { ...item, description: event.target.value } : item
                                  ),
                                }))
                              }
                              placeholder="Descrição"
                              className="rounded-lg border border-white/15 bg-re7-navy px-3 py-2 text-sm text-white outline-none focus:border-re7-sky/50"
                            />
                            <input
                              value={variable.example}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  variableDetails: current.variableDetails.map((item) =>
                                    item.key === variable.key ? { ...item, example: event.target.value } : item
                                  ),
                                }))
                              }
                              placeholder="Exemplo"
                              className="rounded-lg border border-white/15 bg-re7-navy px-3 py-2 text-sm text-white outline-none focus:border-re7-sky/50"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                  <section className="rounded-lg border border-white/10 bg-white/5 p-4">
                    <p className="text-xs font-semibold uppercase text-re7-sky">4. Prévia</p>
                    <div className="mt-3">
                      <TemplateWhatsappPreview
                        body={form.content}
                        variableExamples={form.variableDetails}
                        category={form.category}
                        language={form.language}
                        status="requested"
                        templateName={form.name || "nova_solicitacao"}
                        emptyText="A prévia aparecerá conforme você preencher a mensagem e os exemplos das variáveis."
                      />
                    </div>
                  </section>
                  <section className="rounded-lg border border-white/10 bg-white/5 p-4">
                    <p className="text-xs font-semibold uppercase text-re7-sky">5. Envio</p>
                    <p className="mt-2 text-sm text-white/65">
                      Solicitação enviada. Acompanhe o status nesta tela.
                    </p>
                    {formError ? (
                      <p className="mt-3 rounded-lg border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100">{formError}</p>
                    ) : null}
                    <button
                      type="submit"
                      disabled={submitting}
                      className="mt-3 rounded-lg bg-re7-orange px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {submitting ? "Enviando..." : "Enviar para análise da Re7online"}
                    </button>
                  </section>
                </div>
              </div>
            </form>
          </aside>
        </div>
      ) : null}
    </AppShell>
  );
}
