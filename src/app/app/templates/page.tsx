"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import {
  AppApiError,
  AppSession,
  AppTemplateItem,
  AppTemplateRequestItem,
  clearAppSession,
  createAppTemplateRequest,
  listAppTemplateRequests,
  listAppTemplates,
  loadAppSession,
  saveAppSession,
  syncAppTemplate,
  syncAppTemplates,
} from "@/lib/appClientApi";
import { formatDateTime } from "@/lib/whatsappAdminApi";

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

const CATEGORY_OPTIONS = ["MARKETING", "UTILITY", "AUTHENTICATION"] as const;

type CatalogItem = {
  id: string;
  templateId: string | null;
  name: string;
  displayName: string;
  category: string;
  submittedCategory: string | null;
  wasRecategorized: boolean;
  language: string;
  status: string;
  content: string;
  variables: unknown;
  variablesDetected: string[];
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

function getUsageLabel(item: Pick<CatalogItem, "canUseInCampaign" | "blockedReasonLabel">) {
  if (item.canUseInCampaign) return "Pode ser usado em campanhas";
  return `Nao pode ser usado${item.blockedReasonLabel ? `: ${item.blockedReasonLabel}` : ""}`;
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
      language: request.language || "pt_BR",
      status: request.status,
      content: request.content,
      variables: request.variables,
      variablesDetected: request.variableDetails?.map((item) => item.key) ?? getTemplateVariableLabels(request.variables),
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
      language: template.language,
      status: template.status,
      content: template.content,
      variables: template.variables,
      variablesDetected: template.variablesDetected ?? getTemplateVariableLabels(template.variables),
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
  const [form, setForm] = useState<TemplateRequestFormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncingTemplateId, setSyncingTemplateId] = useState<string | null>(null);
  const [highlightedTemplateId, setHighlightedTemplateId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [languageFilter, setLanguageFilter] = useState("all");
  const [campaignUseFilter, setCampaignUseFilter] = useState("all");
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
  const approvedTemplatesCount = useMemo(
    () => catalogItems.filter((item) => item.status.toLowerCase() === "approved").length,
    [catalogItems]
  );
  const pendingTemplatesCount = useMemo(
    () =>
      catalogItems.filter((item) => {
        const status = item.status.toLowerCase();
        return status === "pending" || status === "submitting" || status === "pending_review";
      }).length,
    [catalogItems]
  );
  const rejectedTemplatesCount = useMemo(
    () => catalogItems.filter((item) => ["rejected", "failed"].includes(item.status.toLowerCase())).length,
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
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
      if (languageFilter !== "all" && item.language !== languageFilter) return false;
      if (campaignUseFilter === "ready" && !item.canUseInCampaign) return false;
      if (campaignUseFilter === "blocked" && item.canUseInCampaign) return false;
      return true;
    });
  }, [campaignUseFilter, catalogItems, categoryFilter, languageFilter, search, statusFilter]);
  const selectedItem = useMemo(
    () =>
      filteredCatalogItems.find((item) => item.id === selectedItemId) ??
      filteredCatalogItems[0] ??
      null,
    [filteredCatalogItems, selectedItemId]
  );

  const handleUnauthorized = useCallback(() => {
    clearAppSession();
    router.replace("/app/login");
  }, [router]);

  const loadData = useCallback(
    async (activeSession: AppSession) => {
      const [templatesResponse, requestsResponse] = await Promise.all([
        listAppTemplates(activeSession),
        listAppTemplateRequests(activeSession),
      ]);
      const nextTemplates = sortTemplates(templatesResponse.items);
      const nextRequests = requestsResponse.items;
      setTemplates(nextTemplates);
      setRequests(nextRequests);
      return {
        templates: nextTemplates,
        requests: nextRequests,
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
      setSuccess(
        response.notification?.delivered === false
          ? "Solicitação enviada para análise da Re7online. A notificação interna será acompanhada pela equipe."
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

  if (!session) return null;

  return (
    <AppShell
      session={session}
      title="Templates"
      subtitle="Consulte os modelos aprovados e envie novos templates para analise."
    >
      {loading ? <p className="text-sm text-white/70">Carregando...</p> : null}
      {error ? (
        <p className="rounded-xl border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100">
          {error}
        </p>
      ) : null}

      <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <section className="min-w-0 rounded-xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 px-3 py-3 sm:px-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Catalogo operacional</h2>
                <p className="mt-1 text-xs text-white/60">
                  Templates aprovados sao necessarios para envio ativo fora da janela de 24h.
                </p>
              </div>
              <button
                type="button"
                onClick={handleSyncAllTemplates}
                disabled={syncingAll || catalogItems.length === 0}
                className="rounded-lg border border-sky-300/30 bg-sky-900/20 px-3 py-2 text-xs font-semibold text-sky-100 transition hover:border-sky-200/60 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {syncingAll ? "Sincronizando..." : "Sincronizar com Meta"}
              </button>
            </div>
          </div>

          <div className="grid gap-3 p-3 sm:p-4">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <p className="text-xs uppercase text-white/55">Total</p>
                <p className="mt-1 text-xl font-semibold">{catalogItems.length}</p>
              </div>
              <div className="rounded-lg border border-emerald-300/20 bg-emerald-900/20 p-3">
                <p className="text-xs uppercase text-emerald-100/70">Aprovados</p>
                <p className="mt-1 text-xl font-semibold text-emerald-100">{approvedTemplatesCount}</p>
              </div>
              <div className="rounded-lg border border-amber-300/20 bg-amber-900/20 p-3">
                <p className="text-xs uppercase text-amber-100/70">Em analise</p>
                <p className="mt-1 text-xl font-semibold text-amber-100">{pendingTemplatesCount}</p>
              </div>
              <div className="rounded-lg border border-sky-300/20 bg-sky-900/20 p-3">
                <p className="text-xs uppercase text-sky-100/70">Usaveis em campanhas</p>
                <p className="mt-1 text-xl font-semibold text-sky-100">{campaignReadyCount}</p>
              </div>
            </div>

            {campaignReadyCount === 0 ? (
              <div className="rounded-lg border border-amber-300/30 bg-amber-900/20 p-3 text-sm text-amber-100">
                <p className="font-semibold">Este tenant ainda nao possui template aprovado para envio ativo.</p>
                <p className="mt-1 text-amber-100/80">
                  Cadastre ou sincronize um template aprovado para criar campanhas e futuramente iniciar conversas fora da janela de 24h.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleSyncAllTemplates}
                    disabled={syncingAll || catalogItems.length === 0}
                    className="rounded-md border border-amber-200/40 px-3 py-1.5 text-xs font-semibold hover:bg-amber-200/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {syncingAll ? "Sincronizando..." : "Sincronizar com Meta"}
                  </button>
                  <a
                    href="#solicitar-template"
                    className="rounded-md border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/85 hover:bg-white/10"
                  >
                    Cadastrar solicitacao de template
                  </a>
                </div>
              </div>
            ) : null}

            <div className="grid gap-2 rounded-lg border border-white/10 bg-white/5 p-3 lg:grid-cols-[minmax(0,1fr)_150px_150px_130px_160px]">
              <label className="grid gap-1 text-xs text-white/70">
                Busca
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Nome, categoria ou conteudo"
                  className="rounded-md border border-white/15 bg-re7-navy px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
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
                    <option key={option} value={option}>
                      {getStatusLabel(option)}
                    </option>
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
                  <option value="ready">Usaveis</option>
                  <option value="blocked">Bloqueados</option>
                </select>
              </label>
            </div>

            <p className="text-xs text-white/55">
              Campanhas usam apenas templates aprovados. Mensagens livres continuam restritas a janela permitida do WhatsApp.
            </p>

            {catalogItems.length === 0 ? (
              <p className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/70">Nenhum template encontrado.</p>
            ) : filteredCatalogItems.length === 0 ? (
              <p className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/70">Nenhum template corresponde aos filtros.</p>
            ) : (
              <div className="max-h-[34rem] overflow-x-auto xl:overflow-y-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead className="bg-white/10 text-left">
                    <tr>
                      <th className="px-3 py-2">Nome</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Categoria</th>
                      <th className="px-3 py-2">Idioma</th>
                      <th className="px-3 py-2">Uso permitido</th>
                      <th className="px-3 py-2">Variaveis</th>
                      <th className="px-3 py-2">Ultima sync</th>
                      <th className="px-3 py-2">Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCatalogItems.map((item) => {
                      const recategorizationInfo = getTemplateRecategorizationLabel(item);
                      return (
                        <tr
                          key={item.id}
                          className={`border-t border-white/10 ${highlightedTemplateId === item.templateId ? "bg-emerald-500/10" : selectedItem?.id === item.id ? "bg-white/10" : ""}`}
                        >
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => setSelectedItemId(item.id)}
                              className="text-left font-semibold text-white hover:text-re7-sky"
                            >
                              {item.displayName}
                            </button>
                            <p className="text-xs text-white/50">{item.name}</p>
                          </td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getStatusClasses(item.status)}`}>
                              {getStatusLabel(item.status)}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col gap-1">
                              <span>{item.category}</span>
                              {recategorizationInfo ? (
                                <span className="text-xs text-amber-200">{recategorizationInfo.detail}</span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3 py-2">{item.language || "-"}</td>
                          <td className="px-3 py-2">
                            <span className={item.canUseInCampaign ? "text-emerald-100" : "text-amber-100"}>
                              {getUsageLabel(item)}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {item.variablesDetected.length > 0 ? item.variablesDetected.join(", ") : "-"}
                          </td>
                          <td className="px-3 py-2">
                            {item.lastSyncedAt ? formatDateTime(item.lastSyncedAt) : "Nao sincronizado"}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => setSelectedItemId(item.id)}
                                className="rounded-lg border border-white/15 px-3 py-1 text-xs font-semibold text-white/80 transition hover:bg-white/10"
                              >
                                Ver
                              </button>
                              {item.syncable && item.templateId ? (
                                <button
                                  type="button"
                                  onClick={() => handleSyncTemplate(item.templateId as string)}
                                  disabled={syncingTemplateId === item.templateId}
                                  className="rounded-lg border border-white/15 px-3 py-1 text-xs font-semibold text-white/90 transition hover:border-re7-sky/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {syncingTemplateId === item.templateId ? "Atualizando..." : "Atualizar status"}
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section className="min-w-0 rounded-xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 px-3 py-3 sm:px-4">
            <h2 className="text-sm font-semibold">Detalhe e solicitacao</h2>
          </div>
          {selectedItem ? (
            <div className="border-b border-white/10 p-3 sm:p-4">
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">{selectedItem.displayName}</h3>
                    <p className="mt-1 text-xs text-white/55">{selectedItem.category} · {selectedItem.language}</p>
                  </div>
                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getStatusClasses(selectedItem.status)}`}>
                    {getStatusLabel(selectedItem.status)}
                  </span>
                </div>
                <p className={`mt-3 rounded-md border px-3 py-2 text-xs ${selectedItem.canUseInCampaign ? "border-emerald-300/25 bg-emerald-900/20 text-emerald-100" : "border-amber-300/25 bg-amber-900/20 text-amber-100"}`}>
                  {getUsageLabel(selectedItem)}
                </p>
                <div className="mt-3 grid gap-2 text-xs text-white/70">
                  <p><span className="text-white/45">Provider/Meta:</span> {selectedItem.name}</p>
                  <p><span className="text-white/45">Atualizado:</span> {formatDateTime(selectedItem.updatedAt)}</p>
                  <p><span className="text-white/45">Ultima sincronizacao:</span> {selectedItem.lastSyncedAt ? formatDateTime(selectedItem.lastSyncedAt) : "Nao sincronizado"}</p>
                  {selectedItem.rejectionReason ? (
                    <p><span className="text-white/45">Motivo:</span> {selectedItem.rejectionReason}</p>
                  ) : null}
                  {selectedItem.templateRequest ? (
                    <p><span className="text-white/45">Solicitacao:</span> {getStatusLabel(selectedItem.templateRequest.status)} em {formatDateTime(selectedItem.templateRequest.createdAt)}</p>
                  ) : null}
                </div>
                <div className="mt-3 rounded-md border border-white/10 bg-re7-navy/70 p-3">
                  <p className="text-xs font-semibold uppercase text-white/50">Preview</p>
                  {selectedItem.componentsSummary.length > 0 ? (
                    selectedItem.componentsSummary.map((component) => (
                      <div key={`${selectedItem.id}-${component.type}`} className="mt-2">
                        <p className="text-[11px] font-semibold text-white/45">{component.type}</p>
                        <p className="whitespace-pre-wrap text-sm text-white/85">{component.text}</p>
                      </div>
                    ))
                  ) : (
                    <p className="mt-2 text-sm text-white/55">Sem componentes textuais registrados.</p>
                  )}
                </div>
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase text-white/50">Variaveis</p>
                  {selectedItem.variablesDetected.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedItem.variablesDetected.map((variable) => (
                        <span key={variable} className="rounded-full border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/80">
                          {`{{${variable}}}`}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-white/55">Nenhuma variavel detectada.</p>
                  )}
                  <p className="mt-2 text-xs text-white/55">
                    As variaveis deverao ser preenchidas na campanha antes do envio.
                  </p>
                </div>
              </div>
            </div>
          ) : null}
          <div id="solicitar-template" className="border-b border-white/10 px-3 py-3 sm:px-4">
            <h2 className="text-sm font-semibold">Solicitar novo template</h2>
            <p className="mt-1 text-xs text-white/60">
              A equipe Re7online revisará o conteúdo antes de enviar para aprovação da Meta.
            </p>
          </div>
          <form onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-4 p-3 sm:p-4">
            <label className="flex flex-col gap-2 text-sm text-white/80">
              <span>Nome</span>
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                className="w-full min-w-0 rounded-lg border border-white/15 bg-re7-navy px-3 py-2 text-white outline-none ring-0 transition focus:border-re7-sky/50"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-white/80">
              <span>Categoria</span>
              <select
                value={form.category}
                onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                className="w-full min-w-0 rounded-lg border border-white/15 bg-re7-navy px-3 py-2 text-white outline-none ring-0 transition focus:border-re7-sky/50"
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <span className="text-xs text-white/50">
                UTILITY é indicado para avisos transacionais e institucionais. Use MARKETING apenas para conteúdo promocional autorizado.
              </span>
            </label>
            <label className="flex flex-col gap-2 text-sm text-white/80">
              <span>Idioma</span>
              <input
                value={form.language}
                onChange={(event) => setForm((current) => ({ ...current, language: event.target.value }))}
                className="w-full min-w-0 rounded-lg border border-white/15 bg-re7-navy px-3 py-2 text-white outline-none ring-0 transition focus:border-re7-sky/50"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-white/80">
              <span>Conteudo</span>
              <textarea
                value={form.content}
                onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
                rows={6}
                className="w-full min-w-0 rounded-lg border border-white/15 bg-re7-navy px-3 py-2 text-white outline-none ring-0 transition focus:border-re7-sky/50"
              />
              <span className="text-xs text-white/50">
                Use variáveis sequenciais como {"{{1}}"} e {"{{2}}"} quando precisar personalizar o texto.
              </span>
            </label>
            {formWarnings.length > 0 ? (
              <div className="rounded-lg border border-amber-300/25 bg-amber-900/20 p-3 text-xs text-amber-100">
                {formWarnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            ) : null}
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <p className="text-sm font-semibold text-white/80">Variáveis detectadas</p>
              {form.variableDetails.length === 0 ? (
                <p className="mt-2 text-xs text-white/55">Nenhuma variável detectada no conteúdo.</p>
              ) : (
                <div className="mt-3 grid gap-3">
                  {form.variableDetails.map((variable) => (
                    <div key={variable.key} className="grid gap-2 rounded-md border border-white/10 bg-re7-navy/70 p-3">
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
                        placeholder="Descrição da variável"
                        className="w-full min-w-0 rounded-lg border border-white/15 bg-re7-navy px-3 py-2 text-sm text-white outline-none ring-0 transition focus:border-re7-sky/50"
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
                        placeholder="Exemplo enviado à Meta"
                        className="w-full min-w-0 rounded-lg border border-white/15 bg-re7-navy px-3 py-2 text-sm text-white outline-none ring-0 transition focus:border-re7-sky/50"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {formError ? (
              <p className="rounded-lg border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100">
                {formError}
              </p>
            ) : null}

            {success ? (
              <p className="rounded-lg border border-emerald-400/30 bg-emerald-900/20 p-3 text-sm text-emerald-100">
                {success}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-re7-orange px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Enviando..." : "Enviar solicitação para análise"}
            </button>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
