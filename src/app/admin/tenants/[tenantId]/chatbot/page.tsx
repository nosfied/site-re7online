"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminConsole } from "@/components/admin/AdminConsoleProvider";
import {
  AdminAutomationSettings,
  AdminChatbotFlowItem,
  createAdminChatbotFlow,
  fetchAdminChatbotFlows,
  fetchAdminChatbotSettings,
  fetchTenantById,
  formatDateTime,
  updateAdminChatbotFlow,
  updateAdminChatbotSettings,
} from "@/lib/whatsappAdminApi";

const DEFAULT_DEFINITION_TEXT = JSON.stringify(
  {
    start: "menu_principal",
    nodes: {
      menu_principal: {
        type: "menu",
        text: "Escolha uma opcao:",
        options: [
          { label: "Informacoes", next: "informacoes" },
          { label: "Falar com humano", next: "handoff" },
        ],
      },
      informacoes: {
        type: "text",
        text: "Certo. Vou seguir com voce por aqui.",
      },
      handoff: {
        type: "handoff",
        text: "Vou te transferir para um atendente humano.",
      },
    },
  },
  null,
  2
);

type FlowDraft = {
  name: string;
  definitionText: string;
  isActive: boolean;
  entryPoint: boolean;
};

type AiIntentCatalogDraft = NonNullable<AdminAutomationSettings["aiAssistantIntentCatalog"]>;
type HandoffNotificationRecipient = NonNullable<
  AdminAutomationSettings["handoffLeadNotificationRecipients"]
>[number];
type MediaHandoffPolicy = NonNullable<AdminAutomationSettings["mediaHandoffPolicy"]>;

const DEFAULT_MEDIA_HANDOFF_POLICY: MediaHandoffPolicy = {
  enabled: true,
  channels: ["whatsapp", "messenger", "instagram"],
  behavior: "notify_and_reply",
  customerNoticeText: "Recebemos sua mensagem. Vou encaminhar para uma pessoa da equipe verificar e te atender melhor.",
  attendantSummaryText: "Midia recebida: sim",
};

const MEDIA_HANDOFF_CHANNELS: Array<{ key: MediaHandoffPolicy["channels"][number]; label: string }> = [
  { key: "whatsapp", label: "WhatsApp" },
  { key: "messenger", label: "Facebook/Messenger" },
  { key: "instagram", label: "Instagram" },
];

const MEDIA_HANDOFF_BEHAVIOR_OPTIONS: Array<{
  value: MediaHandoffPolicy["behavior"];
  label: string;
}> = [
  { value: "notify_and_reply", label: "Notificar equipe e avisar cliente" },
  { value: "notify_only", label: "Somente notificar equipe" },
  { value: "reply_only", label: "Somente avisar cliente" },
  { value: "ignore", label: "Ignorar tratamento especial" },
];

function createHandoffNotificationRecipient(): HandoffNotificationRecipient {
  return {
    id: `recipient_${Date.now()}`,
    label: "",
    waId: "",
    isActive: true,
  };
}

function formatDefinitionText(definition: unknown) {
  return JSON.stringify(definition, null, 2);
}

function parseDefinitionText(definitionText: string) {
  const definition = JSON.parse(definitionText) as {
    start: string;
    nodes: Record<string, unknown>;
  };
  return {
    definition,
    formatted: formatDefinitionText(definition),
  };
}

function formatIntentCatalogText(catalog: AdminAutomationSettings["aiAssistantIntentCatalog"]) {
  return JSON.stringify(catalog ?? [], null, 2);
}

function parseIntentCatalogText(catalogText: string) {
  const parsed = JSON.parse(catalogText || "[]") as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("O catálogo precisa ser uma lista JSON.");
  }
  return parsed as AiIntentCatalogDraft;
}

function getJsonSyntaxError(definitionText: string) {
  try {
    JSON.parse(definitionText);
    return null;
  } catch (error) {
    return (error as Error).message || "JSON invalido.";
  }
}

function countOccurrences(text: string, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return 0;
  let total = 0;
  let cursor = 0;
  const normalizedText = text.toLowerCase();
  while (cursor < normalizedText.length) {
    const index = normalizedText.indexOf(normalizedQuery, cursor);
    if (index < 0) break;
    total += 1;
    cursor = index + normalizedQuery.length;
  }
  return total;
}

function joinTermList(terms: string[] | undefined) {
  return (terms ?? []).join("\n");
}

function splitTermList(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((term) => term.trim())
    .filter(Boolean);
}

const AI_CONFIG_LABELS: Record<string, string> = {
  aiBusinessContext: "Contexto de negócio",
  aiAssistantAllowedTopics: "Temas permitidos",
  aiAssistantSecondaryTopics: "Temas secundários",
  aiAssistantFallbackMessage: "Mensagem de fallback",
  aiAssistantHandoffPrompt: "Pergunta de encaminhamento",
  aiAssistantBlockedTerms: "Termos bloqueados adicionais",
  aiAssistantHandoffKeywords: "Sinais de encaminhamento",
  aiAssistantSystemPrompt: "Instrução adicional aprovada",
};

const AI_SEGMENT_PRESETS = {
  juridico: {
    label: "Jurídico",
    aiBusinessContext:
      "Atendimento inicial para escritório jurídico. Responder dúvidas gerais sobre serviços, explicar próximos passos em linguagem simples e encaminhar casos específicos para atendimento humano. Não dar parecer, não prometer resultado e não analisar documentos.",
    aiAssistantSystemPrompt:
      "Não afirme direito, chance de êxito ou estratégia sem análise individual. Explique conceitos gerais e encaminhe pedidos específicos para a equipe.",
    aiAssistantAllowedTopics: ["consulta", "processo", "contrato", "benefício", "revisão", "documentos", "prazo"],
    aiAssistantSecondaryTopics: ["família", "consumidor", "civil", "contrato", "indenização"],
    aiAssistantBlockedTerms: ["tenho direito", "meu caso", "quanto vou receber", "vou ganhar", "analise meu documento"],
    aiAssistantHandoffKeywords: ["advogado", "especialista", "análise específica", "falar com alguém"],
    aiAssistantFallbackMessage:
      "Posso ajudar com dúvidas gerais sobre os serviços jurídicos disponíveis. Se a sua dúvida exigir análise do caso, posso direcionar você para uma pessoa da equipe.",
    aiAssistantHandoffPrompt:
      "Esse caso pode precisar de uma análise mais específica. Posso encaminhar você para um especialista da equipe?",
  },
  governo: {
    label: "Governo",
    aiBusinessContext:
      "Atendimento institucional para orientar cidadãos sobre serviços públicos, etapas de atendimento, canais oficiais e próximos passos. Não tomar decisões administrativas nem solicitar dados sensíveis.",
    aiAssistantSystemPrompt:
      "Use linguagem institucional clara. Oriente de forma geral e encaminhe demandas específicas para atendimento humano.",
    aiAssistantAllowedTopics: ["serviço", "protocolo", "documentos", "prazo", "agendamento", "departamento"],
    aiAssistantSecondaryTopics: ["ouvidoria", "cadastro", "benefício", "licença", "fiscalização"],
    aiAssistantBlockedTerms: ["meu processo", "aprovar", "indeferir", "cpf", "documento pessoal"],
    aiAssistantHandoffKeywords: ["servidor", "atendente", "protocolo", "departamento", "falar com alguém"],
    aiAssistantFallbackMessage:
      "Posso ajudar com dúvidas gerais sobre os serviços disponíveis. Para uma demanda específica, posso direcionar você para uma pessoa da equipe.",
    aiAssistantHandoffPrompt:
      "Para te orientar melhor, posso direcionar seu atendimento para uma pessoa da equipe?",
  },
  varejo: {
    label: "Varejo",
    aiBusinessContext:
      "Atendimento comercial para orientar clientes sobre produtos, pedidos, trocas, entrega, disponibilidade e próximos passos. Não confirmar condições individuais sem verificação da equipe.",
    aiAssistantSystemPrompt:
      "Responda dúvidas gerais sobre atendimento comercial. Encaminhe negociação, reclamação ou caso específico para a equipe.",
    aiAssistantAllowedTopics: ["produto", "pedido", "entrega", "troca", "devolução", "pagamento", "garantia"],
    aiAssistantSecondaryTopics: ["orçamento", "consultoria", "assistência", "instalação"],
    aiAssistantBlockedTerms: ["desconto garantido", "meu pedido", "meu pagamento", "dados do cartão"],
    aiAssistantHandoffKeywords: ["vendedor", "suporte", "atendente", "reclamação", "troca"],
    aiAssistantFallbackMessage:
      "Posso ajudar com dúvidas gerais sobre produtos, pedidos e atendimento. Para verificar uma situação específica, posso direcionar você para uma pessoa da equipe.",
    aiAssistantHandoffPrompt:
      "Para te ajudar melhor, posso direcionar seu atendimento para uma pessoa da equipe?",
  },
  educacao: {
    label: "Educação",
    aiBusinessContext:
      "Atendimento educacional para orientar sobre cursos, matrícula, calendário, aulas, certificados e suporte acadêmico. Não confirmar situação individual sem validação da equipe.",
    aiAssistantSystemPrompt:
      "Explique informações gerais sobre cursos e atendimento educacional. Encaminhe matrícula, cobrança ou caso específico para a equipe.",
    aiAssistantAllowedTopics: ["curso", "matrícula", "aula", "certificado", "calendário", "mensalidade"],
    aiAssistantSecondaryTopics: ["bolsa", "transferência", "estágio", "documentação"],
    aiAssistantBlockedTerms: ["minha nota", "meu pagamento", "aprovação garantida", "dados pessoais"],
    aiAssistantHandoffKeywords: ["secretaria", "coordenação", "professor", "suporte", "atendente"],
    aiAssistantFallbackMessage:
      "Posso ajudar com dúvidas gerais sobre cursos, matrícula e atendimento. Para uma situação específica, posso direcionar você para uma pessoa da equipe.",
    aiAssistantHandoffPrompt:
      "Para te orientar melhor, posso direcionar seu atendimento para uma pessoa da equipe?",
  },
  seguros: {
    label: "Seguros",
    aiBusinessContext:
      "Atendimento para orientar sobre seguros, coberturas, cotação, sinistro, assistência e próximos passos. Não aprovar cobertura nem confirmar valores individuais.",
    aiAssistantSystemPrompt:
      "Explique conceitos gerais de seguros. Encaminhe cotação, sinistro e análise específica para a equipe.",
    aiAssistantAllowedTopics: ["seguro", "cobertura", "cotação", "sinistro", "apólice", "assistência"],
    aiAssistantSecondaryTopics: ["financiamento", "proteção", "vistoria", "indenização"],
    aiAssistantBlockedTerms: ["meu sinistro", "quanto vou receber", "cobertura garantida", "aprovar"],
    aiAssistantHandoffKeywords: ["corretor", "consultor", "sinistro", "cotação", "atendente"],
    aiAssistantFallbackMessage:
      "Posso ajudar com dúvidas gerais sobre seguros, coberturas e atendimento. Para analisar uma situação específica, posso direcionar você para uma pessoa da equipe.",
    aiAssistantHandoffPrompt:
      "Para te orientar melhor, posso direcionar seu atendimento para uma pessoa da equipe?",
  },
  generico: {
    label: "Genérico",
    aiBusinessContext:
      "Atendimento inicial para orientar clientes sobre serviços disponíveis, próximos passos e canais de atendimento. Não confirmar situações individuais sem validação da equipe.",
    aiAssistantSystemPrompt:
      "Responda dúvidas gerais com linguagem simples e encaminhe casos específicos para atendimento humano.",
    aiAssistantAllowedTopics: ["serviço", "atendimento", "pedido", "suporte", "prazo", "informações"],
    aiAssistantSecondaryTopics: ["orçamento", "consultoria", "cadastro", "contrato"],
    aiAssistantBlockedTerms: ["meu caso", "garantido", "valor exato", "dados pessoais"],
    aiAssistantHandoffKeywords: ["atendente", "suporte", "especialista", "falar com alguém"],
    aiAssistantFallbackMessage:
      "Posso ajudar com dúvidas gerais sobre os serviços disponíveis. Para uma situação específica, posso direcionar você para uma pessoa da equipe.",
    aiAssistantHandoffPrompt:
      "Para te orientar melhor, posso direcionar seu atendimento para uma pessoa da equipe?",
  },
} as const;

function getDraftAiStatus(settings: Partial<AdminAutomationSettings>) {
  const missing: string[] = [];
  const warnings: string[] = [];
  if (!settings.aiBusinessContext?.trim()) missing.push("aiBusinessContext");
  if (!settings.aiAssistantAllowedTopics?.some((term) => term.trim())) missing.push("aiAssistantAllowedTopics");
  if (!settings.aiAssistantFallbackMessage?.trim()) missing.push("aiAssistantFallbackMessage");
  if (!settings.aiAssistantHandoffPrompt?.trim()) missing.push("aiAssistantHandoffPrompt");
  if (!settings.aiAssistantBlockedTerms?.some((term) => term.trim())) warnings.push("aiAssistantBlockedTerms");
  if (!settings.aiAssistantHandoffKeywords?.some((term) => term.trim())) warnings.push("aiAssistantHandoffKeywords");
  if (!settings.aiAssistantSystemPrompt?.trim()) warnings.push("aiAssistantSystemPrompt");
  const requiredScore = 4 - missing.length;
  const recommendedScore = 3 - warnings.length;
  return {
    ready: missing.length === 0,
    missing,
    warnings,
    score: Math.max(0, Math.round(((requiredScore + recommendedScore * 0.5) / 5.5) * 100)),
  };
}

function selectJsonOccurrence(textareaId: string, text: string, query: string, backwards = false) {
  const textarea = document.getElementById(textareaId);
  if (!(textarea instanceof HTMLTextAreaElement)) return;
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return;
  const normalizedText = text.toLowerCase();
  const currentCursor = backwards ? textarea.selectionStart - 1 : textarea.selectionEnd;
  let index = backwards
    ? normalizedText.lastIndexOf(normalizedQuery, Math.max(currentCursor, 0))
    : normalizedText.indexOf(normalizedQuery, currentCursor);
  if (index < 0) {
    index = backwards
      ? normalizedText.lastIndexOf(normalizedQuery)
      : normalizedText.indexOf(normalizedQuery);
  }
  if (index < 0) return;
  textarea.focus();
  textarea.setSelectionRange(index, index + normalizedQuery.length);
  const linesBeforeMatch = textarea.value.slice(0, index).split("\n").length - 1;
  textarea.scrollTop = Math.max(0, linesBeforeMatch * 20 - textarea.clientHeight * 0.35);
}

function FlowBadge({
  label,
  tone = "default",
}: {
  label: string;
  tone?: "default" | "success" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-100"
      : tone === "warning"
        ? "border-amber-300/30 bg-amber-500/15 text-amber-100"
        : "border-white/15 bg-white/5 text-white/80";
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${toneClass}`}>
      {label}
    </span>
  );
}

function TogglePill({
  checked,
  disabled,
  onToggle,
}: {
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`inline-flex min-w-16 items-center justify-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition ${
        checked
          ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-100"
          : "border-white/15 bg-white/5 text-white/70"
      } disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {checked ? "On" : "Off"}
    </button>
  );
}

function normalizeAdminChatbotError(error: { message?: string; errorCode?: string }, fallback: string) {
  if (error.errorCode === "invalid_chatbot_definition") {
    return error.message || "JSON invalido para o flow.";
  }
  if (error.errorCode === "ai_context_missing") {
    return error.message || "IA automatica exige configuracao previa do tenant.";
  }
  if (error.errorCode === "intent_classifier_globally_disabled") {
    return error.message || "Classificacao por mensagem livre esta desativada no ambiente.";
  }
  return error.message || fallback;
}

export default function AdminTenantChatbotPage() {
  const params = useParams<{ tenantId: string }>();
  const searchParams = useSearchParams();
  const tenantId = useMemo(() => {
    const rawTenantId = params?.tenantId;
    if (Array.isArray(rawTenantId)) {
      return rawTenantId[0] ? decodeURIComponent(rawTenantId[0]) : "";
    }
    return rawTenantId ? decodeURIComponent(rawTenantId) : "";
  }, [params]);
  const clientKeyParam = searchParams.get("clientKey")?.trim() ?? "";
  const { connection } = useAdminConsole();
  const [clientKey, setClientKey] = useState(clientKeyParam);
  const [tenantName, setTenantName] = useState("");
  const [flows, setFlows] = useState<AdminChatbotFlowItem[]>([]);
  const [settings, setSettings] = useState<AdminAutomationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [newName, setNewName] = useState("Fluxo principal");
  const [newDefinition, setNewDefinition] = useState(DEFAULT_DEFINITION_TEXT);
  const [newSearch, setNewSearch] = useState("");
  const [newIsActive, setNewIsActive] = useState(false);
  const [newEntryPoint, setNewEntryPoint] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, FlowDraft>>({});
  const [draftSearches, setDraftSearches] = useState<Record<string, string>>({});
  const [intentCatalogText, setIntentCatalogText] = useState("[]");

  const tenantHref = `/admin/tenants/${encodeURIComponent(tenantId)}`;
  const backHref = clientKey ? `${tenantHref}?clientKey=${encodeURIComponent(clientKey)}` : tenantHref;

  const updateHandoffNotificationRecipient = (
    index: number,
    patch: Partial<HandoffNotificationRecipient>
  ) => {
    setSettings((current) => {
      if (!current) return current;
      const recipients = [...(current.handoffLeadNotificationRecipients ?? [])];
      recipients[index] = {
        ...recipients[index],
        ...patch,
      };
      return {
        ...current,
        handoffLeadNotificationRecipients: recipients,
      };
    });
  };

  const removeHandoffNotificationRecipient = (index: number) => {
    setSettings((current) => {
      if (!current) return current;
      return {
        ...current,
        handoffLeadNotificationRecipients: (current.handoffLeadNotificationRecipients ?? []).filter(
          (_, itemIndex) => itemIndex !== index
        ),
      };
    });
  };

  const updateMediaHandoffPolicy = (patch: Partial<MediaHandoffPolicy>) => {
    setSettings((current) =>
      current
        ? {
            ...current,
            mediaHandoffPolicy: {
              ...DEFAULT_MEDIA_HANDOFF_POLICY,
              ...(current.mediaHandoffPolicy ?? {}),
              ...patch,
            },
          }
        : current
    );
  };

  const toggleMediaHandoffChannel = (channel: MediaHandoffPolicy["channels"][number]) => {
    setSettings((current) => {
      if (!current) return current;
      const policy = {
        ...DEFAULT_MEDIA_HANDOFF_POLICY,
        ...(current.mediaHandoffPolicy ?? {}),
      };
      const currentChannels = new Set(policy.channels);
      if (currentChannels.has(channel)) {
        currentChannels.delete(channel);
      } else {
        currentChannels.add(channel);
      }
      return {
        ...current,
        mediaHandoffPolicy: {
          ...policy,
          channels: currentChannels.size ? Array.from(currentChannels) : [channel],
        },
      };
    });
  };

  const hydrateFlows = useCallback((items: AdminChatbotFlowItem[]) => {
    setFlows(items);
    setDrafts(
      Object.fromEntries(
        items.map((item) => [
          item.id,
          {
            name: item.name,
            definitionText: formatDefinitionText(item.definition),
            isActive: item.isActive,
            entryPoint: item.entryPoint,
          },
        ])
      )
    );
  }, []);

  const loadData = useCallback(
    async (activeClientKey: string) => {
      const [flowResponse, settingsResponse] = await Promise.all([
        fetchAdminChatbotFlows(connection, activeClientKey),
        fetchAdminChatbotSettings(connection, activeClientKey),
      ]);
      hydrateFlows(flowResponse.items);
      setSettings(settingsResponse.settings);
      setIntentCatalogText(formatIntentCatalogText(settingsResponse.settings.aiAssistantIntentCatalog));
    },
    [connection, hydrateFlows]
  );

  useEffect(() => {
    if (!tenantId || !connection.baseUrl || !connection.adminToken) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchTenantById(connection, tenantId)
      .then(async (response) => {
        if (cancelled) return;
        const resolvedClientKey = clientKeyParam || response.client?.clientKey || response.tenant.id;
        setTenantName(response.tenant.name ?? "");
        setClientKey(resolvedClientKey);
        await loadData(resolvedClientKey);
      })
      .catch((err: { message?: string }) => {
        if (cancelled) return;
        setError(err.message || "Falha ao carregar configuracao do chatbot.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientKeyParam, connection, loadData, tenantId]);

  useEffect(() => {
    if (!error && !success) return;
    const timer = window.setTimeout(() => {
      setError(null);
      setSuccess(null);
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [error, success]);

  const sortedFlows = useMemo(
    () =>
      [...flows].sort((a, b) => {
        if (a.entryPoint !== b.entryPoint) return a.entryPoint ? -1 : 1;
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
      }),
    [flows]
  );

  const automationDraft = settings ?? {
    disableAutoReply: false,
    disableChatbot: false,
    disableAiFallback: false,
    disableIntentClassifier: true,
    disableLegacyFlows: true,
    disableChatbotFlowEditing: false,
    aiAssistantEnabled: false,
    aiAssistantMaxReplies: 2,
    aiAssistantFallbackToHandoff: false,
    aiAssistantSystemPrompt: "",
    aiAssistantAllowedTopics: [],
    aiAssistantSecondaryTopics: [],
    aiAssistantBlockedTerms: [],
    aiAssistantHandoffKeywords: [],
    aiAssistantGreetingMessage: "",
    aiAssistantFallbackMessage: "",
    aiAssistantHandoffPrompt: "",
    aiAssistantIntentCatalog: [],
    aiBusinessContext: "",
    aiConfigured: false,
    chatbotLocked: false,
    flowEditingLocked: false,
    aiLocked: false,
    aiAssistantLocked: true,
    intentClassifierLocked: true,
    followUpEnabled: false,
    followUpDelayMinutes: 10,
    followUpMaxCount: 1,
    followUpUseTemplate: false,
    followUpTemplateName: "",
    followUpTemplateLang: "pt_BR",
    handoffLeadNotificationEnabled: false,
    handoffLeadNotificationRecipients: [],
    mediaHandoffPolicy: DEFAULT_MEDIA_HANDOFF_POLICY,
  };
  const mediaHandoffPolicy = {
    ...DEFAULT_MEDIA_HANDOFF_POLICY,
    ...(automationDraft.mediaHandoffPolicy ?? {}),
  };
  const aiConfigStatus = getDraftAiStatus(automationDraft);
  const aiBaseReady = !automationDraft.disableAiFallback && aiConfigStatus.ready;
  const aiControlledDisabled = Boolean(automationDraft.aiAssistantLocked) || !aiBaseReady;
  const aiConfigLabel = aiConfigStatus.ready
    ? aiConfigStatus.warnings.length
      ? "parcialmente configurado"
      : "configurado"
    : "incompleto";
  const newJsonError = useMemo(() => getJsonSyntaxError(newDefinition), [newDefinition]);
  const intentCatalogJsonError = useMemo(() => {
    try {
      parseIntentCatalogText(intentCatalogText);
      return null;
    } catch (error) {
      return (error as Error).message || "JSON invalido.";
    }
  }, [intentCatalogText]);
  const draftJsonErrors = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(drafts).map(([flowId, draft]) => [flowId, getJsonSyntaxError(draft.definitionText)])
      ),
    [drafts]
  );

  const handleSaveSettings = async () => {
    if (!clientKey || !settings) return;
    let parsedIntentCatalog: AiIntentCatalogDraft;
    try {
      parsedIntentCatalog = parseIntentCatalogText(intentCatalogText);
    } catch (err) {
      setError(`Catálogo de intenções inválido: ${(err as Error).message || "JSON invalido."}`);
      return;
    }
    if (automationDraft.aiAssistantEnabled && !aiConfigStatus.ready) {
      setError(
        `IA supervisionada ainda não está pronta: ${aiConfigStatus.missing
          .map((item) => AI_CONFIG_LABELS[item] ?? item)
          .join(", ")}.`
      );
      return;
    }
    const normalizedHandoffNotificationRecipients = (
      automationDraft.handoffLeadNotificationRecipients ?? []
    ).map((recipient) => ({
      ...recipient,
      waId: recipient.waId.replace(/\D/g, ""),
      label: recipient.label?.trim() || undefined,
    }));
    if (
      automationDraft.handoffLeadNotificationEnabled &&
      normalizedHandoffNotificationRecipients.filter(
        (recipient) => recipient.isActive && /^\d{8,20}$/.test(recipient.waId)
      ).length === 0
    ) {
      setError("Informe pelo menos um numero ativo para receber notificacoes internas de novos leads.");
      return;
    }
    setSavingSettings(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await updateAdminChatbotSettings(connection, clientKey, {
        ...automationDraft,
        aiAssistantIntentCatalog: parsedIntentCatalog,
        handoffLeadNotificationRecipients: normalizedHandoffNotificationRecipients,
      });
      setSettings(response.settings);
      setIntentCatalogText(formatIntentCatalogText(response.settings.aiAssistantIntentCatalog));
      setSuccess("Automacao atualizada com sucesso.");
    } catch (err) {
      setError(normalizeAdminChatbotError(err as { message?: string; errorCode?: string }, "Falha ao salvar automacao."));
    } finally {
      setSavingSettings(false);
    }
  };

  const applyAiPreset = (presetKey: keyof typeof AI_SEGMENT_PRESETS) => {
    const preset = AI_SEGMENT_PRESETS[presetKey];
    setSettings((current) =>
      current
        ? {
            ...current,
            aiBusinessContext: preset.aiBusinessContext,
            aiAssistantSystemPrompt: preset.aiAssistantSystemPrompt,
            aiAssistantAllowedTopics: [...preset.aiAssistantAllowedTopics],
            aiAssistantSecondaryTopics: [...(preset.aiAssistantSecondaryTopics ?? [])],
            aiAssistantBlockedTerms: [...preset.aiAssistantBlockedTerms],
            aiAssistantHandoffKeywords: [...preset.aiAssistantHandoffKeywords],
            aiAssistantFallbackMessage: preset.aiAssistantFallbackMessage,
            aiAssistantHandoffPrompt: preset.aiAssistantHandoffPrompt,
            aiAssistantPresetApplied: presetKey,
            aiAssistantEnabled: current.aiAssistantEnabled,
          }
        : current
    );
    setSuccess(`Preset ${preset.label} aplicado como sugestão. Revise e salve para confirmar.`);
  };

  const handleCreate = async () => {
    if (!clientKey) return;
    const trimmedName = newName.trim();
    if (!trimmedName) {
      setError("Informe o nome do flow.");
      return;
    }
    let parsedDefinition;
    try {
      parsedDefinition = parseDefinitionText(newDefinition);
    } catch {
      setError("JSON invalido no novo flow.");
      return;
    }
    setNewDefinition(parsedDefinition.formatted);
    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      await createAdminChatbotFlow(connection, clientKey, {
        name: trimmedName,
        isActive: newIsActive,
        entryPoint: newEntryPoint,
        definition: parsedDefinition.definition,
      });
      await loadData(clientKey);
      setSuccess("Flow criado com sucesso.");
    } catch (err) {
      setError(normalizeAdminChatbotError(err as { message?: string; errorCode?: string }, "Falha ao criar flow."));
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async (flow: AdminChatbotFlowItem) => {
    if (!clientKey) return;
    const draft = drafts[flow.id];
    if (!draft) return;
    const trimmedName = draft.name.trim();
    if (!trimmedName) {
      setError("Informe o nome do flow.");
      return;
    }
    let parsedDefinition;
    try {
      parsedDefinition = parseDefinitionText(draft.definitionText);
    } catch {
      setError("JSON invalido no flow selecionado.");
      return;
    }
    setDrafts((current) => ({
      ...current,
      [flow.id]: {
        ...draft,
        definitionText: parsedDefinition.formatted,
      },
    }));
    setSavingId(flow.id);
    setError(null);
    setSuccess(null);
    try {
      await updateAdminChatbotFlow(connection, clientKey, flow.id, {
        name: trimmedName,
        isActive: draft.isActive,
        entryPoint: draft.entryPoint,
        definition: parsedDefinition.definition,
      });
      await loadData(clientKey);
      setSuccess("Flow atualizado com sucesso.");
    } catch (err) {
      setError(normalizeAdminChatbotError(err as { message?: string; errorCode?: string }, "Falha ao atualizar flow."));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="px-4 pb-8 text-slate-900 dark:text-white md:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <header className="sticky top-0 z-30 -mx-4 border-b border-slate-200 bg-white/95 px-4 py-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-re7-navy/95 md:-mx-8 md:px-8">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold">Chatbot e automacao</h1>
                {settings ? (
                  <FlowBadge
                    label={`IA ${aiConfigLabel} · ${aiConfigStatus.score}%`}
                    tone={aiConfigStatus.ready ? "success" : "warning"}
                  />
                ) : null}
              </div>
              <p className="text-sm text-slate-600 dark:text-white/70">
                {tenantName || tenantId} {clientKey ? `(${clientKey})` : ""}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-white/50">
                Configuracoes internas refletidas no /app do cliente. Revise IA, follow-up e flows antes de salvar.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={backHref}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-white/20 dark:text-white/80 dark:hover:bg-white/10"
              >
                Voltar ao tenant
              </Link>
              <button
                type="button"
                onClick={handleSaveSettings}
                disabled={savingSettings || !settings || !clientKey}
                className="rounded-md bg-re7-orange px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingSettings ? "Salvando..." : "Salvar ajustes"}
              </button>
            </div>
          </div>
        </header>

        {loading ? <p className="text-sm text-white/70">Carregando...</p> : null}
        {error ? (
          <p className="rounded-md border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="rounded-md border border-emerald-400/30 bg-emerald-900/20 p-3 text-sm text-emerald-100">
            {success}
          </p>
        ) : null}

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Automacao do atendimento</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-white/65">
                Controle interno refletido no portal do cliente.
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-white/50">
                IA: {automationDraft.aiConfigured ? "contexto configurado" : "contexto ausente"}.
              </p>
            </div>
            <FlowBadge
              label={settings ? "Rascunho local até salvar" : "Carregando"}
              tone={settings ? "warning" : "default"}
            />
          </div>

          {settings ? (
            <div className="grid gap-3 md:grid-cols-2">
              {[
                {
                  key: "disableChatbot" as const,
                  title: "Fluxo configuravel",
                  help: "On libera os flows personalizados para este tenant.",
                },
                {
                  key: "disableChatbotFlowEditing" as const,
                  title: "Edicao de flows no /app",
                  help: "On permite que o ADMIN do tenant crie ou edite fluxos em /app/chatbot.",
                },
                {
                  key: "disableLegacyFlows" as const,
                  title: "Fluxos prontos",
                  help: "Camada interna da plataforma. Mantenha Off quando o tenant usa apenas flows configuraveis.",
                },
                {
                  key: "disableAiFallback" as const,
                  title: "Base de IA do tenant",
                  help: automationDraft.aiConfigured
                    ? "On permite recursos de IA neste tenant."
                    : "Configure o contexto de negocio abaixo antes de liberar a IA controlada.",
                },
                {
                  key: "disableIntentClassifier" as const,
                  title: "Classificacao de intencao",
                  help: automationDraft.intentClassifierLocked
                    ? "Indisponivel porque a flag global do ambiente esta desligada."
                    : "On direciona mensagens livres iniciais para o node mais adequado do flow.",
                },
              ].map((item) => (
                <div
                  key={item.key}
                  className="flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-re7-navy/40 p-3 text-sm"
                >
                  <span className="space-y-1">
                    <span className="block font-medium text-white">{item.title}</span>
                    <span className="block text-white/60">{item.help}</span>
                  </span>
                  <TogglePill
                    checked={!automationDraft[item.key]}
                    disabled={item.key === "disableIntentClassifier" && automationDraft.intentClassifierLocked}
                    onToggle={() =>
                      setSettings((current) =>
                        current
                          ? {
                              ...current,
                              [item.key]: !current[item.key],
                            }
                          : current
                      )
                    }
                  />
                </div>
            ))}
            <div className="rounded-lg border border-white/10 bg-re7-navy/40 p-3 text-sm md:col-span-2">
              <div className="mb-4 rounded-md border border-white/10 bg-re7-navy/50 p-3">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-white">Base da IA</h3>
                  <p className="mt-1 text-xs text-white/55">
                    Conteudo aprovado que define contexto, tom e limites. A IA controlada so pode ser liberada quando
                    o contexto de negocio estiver preenchido.
                  </p>
                </div>
                <div className="mb-3 rounded-md border border-white/10 bg-black/10 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wide text-white/50">
                        Status da IA
                      </span>
                      <p className="text-sm font-semibold text-white">
                        {aiConfigLabel} · {aiConfigStatus.score}%
                      </p>
                    </div>
                    <FlowBadge
                      label={aiConfigStatus.ready ? "Pronta para ativar" : "Configuração pendente"}
                      tone={aiConfigStatus.ready ? "success" : "warning"}
                    />
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full ${
                        aiConfigStatus.ready ? "bg-emerald-400" : "bg-amber-300"
                      }`}
                      style={{ width: `${Math.max(0, Math.min(100, aiConfigStatus.score))}%` }}
                    />
                  </div>
                  {aiConfigStatus.missing.length ? (
                    <div className="mt-3 rounded-md border border-amber-300/25 bg-amber-500/10 p-2 text-xs text-amber-100">
                      <span className="font-semibold">IA supervisionada ainda não está pronta:</span>
                      <ul className="mt-1 list-disc pl-4">
                        {aiConfigStatus.missing.map((item) => (
                          <li key={item}>Falta {AI_CONFIG_LABELS[item] ?? item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {aiConfigStatus.warnings.length ? (
                    <div className="mt-3 rounded-md border border-white/10 bg-white/5 p-2 text-xs text-white/60">
                      <span className="font-semibold text-white/80">Recomendado para melhorar governança:</span>
                      <ul className="mt-1 list-disc pl-4">
                        {aiConfigStatus.warnings.map((item) => (
                          <li key={item}>{AI_CONFIG_LABELS[item] ?? item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
                <div className="mb-3 rounded-md border border-white/10 bg-black/10 p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-white">Presets de segmento</span>
                    <span className="text-xs text-white/45">Preenche sugestões, não ativa automaticamente.</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(AI_SEGMENT_PRESETS).map(([key, preset]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => applyAiPreset(key as keyof typeof AI_SEGMENT_PRESETS)}
                        className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs text-white/75 hover:bg-white/10"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1 text-xs text-white/60">
                    Contexto de negocio da IA
                    <textarea
                      value={automationDraft.aiBusinessContext ?? ""}
                      onChange={(event) =>
                        setSettings((current) =>
                          current
                            ? {
                                ...current,
                                aiBusinessContext: event.target.value,
                              }
                            : current
                        )
                      }
                      placeholder="Descreva a empresa, servicos, tom de voz, publico e limites da IA para este tenant."
                      className="min-h-32 rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-white/60">
                    Instrução adicional aprovada
                    <textarea
                      value={automationDraft.aiAssistantSystemPrompt ?? ""}
                      onChange={(event) =>
                        setSettings((current) =>
                          current
                            ? {
                                ...current,
                                aiAssistantSystemPrompt: event.target.value,
                              }
                            : current
                        )
                      }
                      placeholder="Orientação complementar para a IA controlada"
                      className="min-h-32 rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky disabled:opacity-50"
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-md border border-white/10 bg-re7-navy/50 p-3">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-white">Controles da IA</h3>
                  <p className="mt-1 text-xs text-white/55">
                    Liberação operacional, limite por conversa e recomendação supervisionada de handoff.
                  </p>
                </div>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className="block font-medium text-white">IA controlada</span>
                    <span className="mt-1 block text-white/60">
                      Camada segura para dúvidas simples. Exige base de IA liberada e contexto preenchido.
                    </span>
                  </div>
                  <TogglePill
                    checked={automationDraft.aiAssistantEnabled === true}
                    disabled={aiControlledDisabled}
                    onToggle={() =>
                      setSettings((current) =>
                        current
                          ? {
                              ...current,
                              aiAssistantEnabled: !current.aiAssistantEnabled,
                            }
                          : current
                      )
                    }
                  />
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs text-white/60">
                    Maximo por conversa
                    <input
                      type="number"
                      min={0}
                      max={5}
                      value={automationDraft.aiAssistantMaxReplies ?? 2}
                      onChange={(event) =>
                        setSettings((current) =>
                          current
                            ? {
                                ...current,
                                aiAssistantMaxReplies: Math.max(0, Number(event.target.value) || 0),
                              }
                            : current
                        )
                      }
                      className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky disabled:opacity-50"
                    />
                  </label>
                  <div className="flex items-start justify-between gap-3 rounded-md border border-white/10 bg-re7-navy/70 px-3 py-2">
                    <span className="space-y-1 text-xs text-white/60">
                      <span className="block font-medium text-white/80">Fallback para handoff</span>
                      <span className="block">
                        Permite registrar recomendacao supervisionada quando a IA sugerir encaminhamento. Nesta fase nao
                        ativa humano automaticamente.
                      </span>
                    </span>
                    <TogglePill
                      checked={automationDraft.aiAssistantFallbackToHandoff === true}
                      onToggle={() =>
                        setSettings((current) =>
                          current
                            ? {
                                ...current,
                                aiAssistantFallbackToHandoff: !current.aiAssistantFallbackToHandoff,
                              }
                            : current
                        )
                      }
                    />
                  </div>
                </div>
              </div>

              <details className="mt-3 rounded-md border border-white/10 bg-re7-navy/50 px-3 py-2 text-xs text-white/60">
                <summary className="cursor-pointer text-re7-sky underline decoration-re7-sky/40 underline-offset-4">
                  Entender termos globais de segurança
                </summary>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="font-medium text-white/80">Aberturas aceitas</p>
                    <p className="mt-1 text-white/55">
                      A mensagem precisa começar com uma dessas expressões e conter um tema permitido.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(automationDraft.aiAssistantGlobalSafety?.questionStarters ?? []).map((term) => (
                        <span key={term} className="rounded-full bg-white/10 px-2 py-1 text-[11px] text-white/70">
                          {term}
                        </span>
                      ))}
                    </div>
                    <p className="mt-3 font-medium text-white/80">Temas globais aceitos</p>
                    <p className="mt-1 text-white/55">
                      Nenhum tema de negócio é global. O vocabulário do ramo deve ser configurado nos temas permitidos do tenant.
                    </p>
                    <p className="mt-3 font-medium text-white/80">Sinais globais de encaminhamento</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(automationDraft.aiAssistantGlobalSafety?.handoffTerms ?? []).map((term) => (
                        <span key={term} className="rounded-full bg-sky-500/15 px-2 py-1 text-[11px] text-sky-100">
                          {term}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="font-medium text-white/80">Bloqueios globais fixos</p>
                    <p className="mt-1 text-white/55">
                      Sempre bloqueia dados pessoais
                      {automationDraft.aiAssistantGlobalSafety?.maxInputChars
                        ? `, mensagens acima de ${automationDraft.aiAssistantGlobalSafety.maxInputChars} caracteres`
                        : ""}
                      e os termos abaixo.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(automationDraft.aiAssistantGlobalSafety?.blockedTerms ?? []).map((term) => (
                        <span key={term} className="rounded-full bg-red-500/15 px-2 py-1 text-[11px] text-red-100">
                          {term}
                        </span>
                      ))}
                    </div>
                    <p className="mt-3 text-white/55">
                      Os campos abaixo definem o domínio do tenant. As travas globais são apenas de segurança e não carregam temas de negócio.
                    </p>
                  </div>
                </div>
              </details>

              <div className="mt-3 rounded-md border border-white/10 bg-re7-navy/50 p-3">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-white">Regras por tenant</h3>
                  <p className="mt-1 text-xs text-white/55">
                    Ajustes de vocabulário que definem o domínio da IA para este tenant.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs text-white/60">
                    Temas permitidos para IA
                    <textarea
                      value={joinTermList(automationDraft.aiAssistantAllowedTopics)}
                      onChange={(event) =>
                        setSettings((current) =>
                          current
                            ? {
                                ...current,
                                aiAssistantAllowedTopics: splitTermList(event.target.value),
                              }
                            : current
                        )
                      }
                      placeholder={"Um termo por linha\nEx.: plano\npedido\nsegunda via"}
                      className="min-h-24 rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky disabled:opacity-50"
                    />
                    <span className="text-[11px] text-white/45">
                      Amplia o vocabulário aceito pelo filtro simples sem remover as travas globais.
                    </span>
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-white/60">
                    Temas secundários
                    <textarea
                      value={joinTermList(automationDraft.aiAssistantSecondaryTopics)}
                      onChange={(event) =>
                        setSettings((current) =>
                          current
                            ? {
                                ...current,
                                aiAssistantSecondaryTopics: splitTermList(event.target.value),
                              }
                            : current
                        )
                      }
                      placeholder={"Um termo por linha\nEx.: contrato\nfamília\nconsumidor"}
                      className="min-h-24 rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky disabled:opacity-50"
                    />
                    <span className="text-[11px] text-white/45">
                      Assuntos próximos ao negócio que não devem ser respondidos em profundidade; a IA oferece encaminhamento.
                    </span>
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-white/60">
                    Termos bloqueados adicionais
                    <textarea
                      value={joinTermList(automationDraft.aiAssistantBlockedTerms)}
                      onChange={(event) =>
                        setSettings((current) =>
                          current
                            ? {
                                ...current,
                                aiAssistantBlockedTerms: splitTermList(event.target.value),
                              }
                            : current
                        )
                      }
                      placeholder={"Um termo por linha\nEx.: orçamento fechado\ncontrato\ncancelamento"}
                      className="min-h-24 rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky disabled:opacity-50"
                    />
                    <span className="text-[11px] text-white/45">
                      Bloqueia termos específicos do tenant além das restrições padrão de segurança.
                    </span>
                  </label>
                </div>
                <div className="mt-3 rounded-md border border-white/10 bg-black/10 p-3">
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-semibold text-white">Catálogo de intenções da IA</h4>
                      <p className="mt-1 text-xs text-white/55">
                        Use para cadastrar respostas e classificações controladas por assunto. Cada item pode alimentar
                        CRM, badge, prioridade e pergunta de continuidade.
                      </p>
                    </div>
                    <FlowBadge
                      label={`${automationDraft.aiAssistantIntentCatalog?.length ?? 0} intenção(ões)`}
                      tone={intentCatalogJsonError ? "warning" : "default"}
                    />
                  </div>
                  <textarea
                    value={intentCatalogText}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setIntentCatalogText(nextValue);
                      try {
                        const parsedCatalog = parseIntentCatalogText(nextValue);
                        setSettings((current) =>
                          current
                            ? {
                                ...current,
                                aiAssistantIntentCatalog: parsedCatalog,
                              }
                            : current
                        );
                      } catch {
                        // Keep the draft visible; save will show the validation error.
                      }
                    }}
                    spellCheck={false}
                    className="min-h-56 w-full rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 font-mono text-xs text-white outline-none focus:border-re7-sky"
                    placeholder={`[
  {
    "key": "servico_principal",
    "title": "Serviço principal",
    "topics": ["termo do cliente", "sinônimo"],
    "response": "Resposta aprovada para esse assunto.",
    "nextQuestion": "Qual ponto você quer entender melhor?",
    "leadTemp": "morno",
    "priority": "media",
    "tags": ["service:principal"]
  }
]`}
                  />
                  {intentCatalogJsonError ? (
                    <p className="mt-2 rounded-md border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                      Catálogo inválido: {intentCatalogJsonError}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-emerald-200/80">
                      JSON válido. O catálogo será salvo junto com os demais ajustes.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-3 rounded-md border border-white/10 bg-re7-navy/50 p-3">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-white">Encaminhamento e mensagens</h3>
                  <p className="mt-1 text-xs text-white/55">
                    Textos usados quando a IA identifica pedido de atendimento humano ou mensagem vaga.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs text-white/60 md:col-span-2">
                    Mensagem de boas-vindas da IA
                    <textarea
                      value={automationDraft.aiAssistantGreetingMessage ?? ""}
                      onChange={(event) =>
                        setSettings((current) =>
                          current
                            ? {
                                ...current,
                                aiAssistantGreetingMessage: event.target.value,
                              }
                            : current
                        )
                      }
                      placeholder="Ex.: Olá! Seja bem-vindo(a). Me diga em poucas palavras como posso te ajudar."
                      className="min-h-20 rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky disabled:opacity-50"
                    />
                    <span className="text-[11px] text-white/45">
                      Usada em saudações reais como oi, opa, bom dia, boa tarde e boa noite.
                    </span>
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-white/60">
                    Sinais de encaminhamento humano
                    <textarea
                      value={joinTermList(automationDraft.aiAssistantHandoffKeywords)}
                      onChange={(event) =>
                        setSettings((current) =>
                          current
                            ? {
                                ...current,
                                aiAssistantHandoffKeywords: splitTermList(event.target.value),
                              }
                            : current
                        )
                      }
                      placeholder={"Um termo por linha\nEx.: especialista\nconsultor\nsuporte humano"}
                      className="min-h-24 rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky disabled:opacity-50"
                    />
                    <span className="text-[11px] text-white/45">
                      Acrescenta expressões do tenant que devem gerar pergunta de encaminhamento, sem ativar humano automaticamente.
                    </span>
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-white/60">
                    Pergunta de encaminhamento personalizada
                    <textarea
                      value={automationDraft.aiAssistantHandoffPrompt ?? ""}
                      onChange={(event) =>
                        setSettings((current) =>
                          current
                            ? {
                                ...current,
                                aiAssistantHandoffPrompt: event.target.value,
                              }
                            : current
                        )
                      }
                      placeholder="Ex.: Posso direcionar seu atendimento para um especialista da equipe?"
                      className="min-h-24 rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky disabled:opacity-50"
                    />
                  </label>
                </div>
              <label className="mt-3 flex flex-col gap-1 text-xs text-white/60">
                Mensagem para dúvida vaga ou fora do escopo simples
                <textarea
                  value={automationDraft.aiAssistantFallbackMessage ?? ""}
                  onChange={(event) =>
                    setSettings((current) =>
                      current
                        ? {
                            ...current,
                            aiAssistantFallbackMessage: event.target.value,
                          }
                        : current
                    )
                  }
                  placeholder='Ex.: Posso ajudar com dúvidas gerais. Para falar com a equipe, escreva "quero atendimento".'
                  className="min-h-20 w-full rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky disabled:opacity-50"
                />
              </label>
              </div>
            </div>
          </div>
        ) : null}

          {settings ? (
            <div className="mt-4 rounded-lg border border-white/10 bg-re7-navy/40 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">Notificacao interna de novo lead</h3>
                  <p className="mt-1 text-xs text-white/60">
                    Dispara um aviso privado para numeros da equipe quando o bot encaminhar um lead ao humano.
                    Com mais de um numero ativo, o envio usa revezamento automatico.
                  </p>
                </div>
                <TogglePill
                  checked={automationDraft.handoffLeadNotificationEnabled === true}
                  onToggle={() =>
                    setSettings((current) =>
                      current
                        ? {
                            ...current,
                            handoffLeadNotificationEnabled: !current.handoffLeadNotificationEnabled,
                          }
                        : current
                    )
                  }
                />
              </div>
              <div className="mt-3 space-y-2">
                {(automationDraft.handoffLeadNotificationRecipients ?? []).map((recipient, index) => (
                  <div key={recipient.id || index} className="grid gap-2 rounded-lg border border-white/10 bg-black/10 p-2 md:grid-cols-[1fr_1fr_auto_auto]">
                    <input
                      className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                      value={recipient.label ?? ""}
                      onChange={(event) => updateHandoffNotificationRecipient(index, { label: event.target.value })}
                      placeholder="Nome interno"
                    />
                    <input
                      className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                      value={recipient.waId}
                      onChange={(event) =>
                        updateHandoffNotificationRecipient(index, {
                          waId: event.target.value.replace(/\D/g, ""),
                        })
                      }
                      placeholder="558499999999"
                    />
                    <TogglePill
                      checked={recipient.isActive !== false}
                      onToggle={() =>
                        updateHandoffNotificationRecipient(index, {
                          isActive: recipient.isActive === false,
                        })
                      }
                    />
                    <button
                      type="button"
                      onClick={() => removeHandoffNotificationRecipient(index)}
                      className="rounded-md border border-white/15 px-3 py-2 text-xs font-semibold text-white/75 transition hover:bg-white/10"
                    >
                      Remover
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setSettings((current) =>
                      current
                        ? {
                            ...current,
                            handoffLeadNotificationRecipients: [
                              ...(current.handoffLeadNotificationRecipients ?? []),
                              createHandoffNotificationRecipient(),
                            ],
                          }
                        : current
                    )
                  }
                  className="rounded-md border border-white/15 px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10"
                >
                  Adicionar numero
                </button>
              </div>
            </div>
          ) : null}

          {settings ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-re7-navy/40">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-950 dark:text-white">Tratamento de midia no handoff</h3>
                  <p className="mt-1 max-w-3xl text-xs text-slate-600 dark:text-white/60">
                    Define, por tenant e canal, o que acontece quando uma mensagem com midia leva o atendimento para humano.
                    O texto nao cita o tipo de midia para evitar classificacao incorreta.
                  </p>
                </div>
                <TogglePill
                  checked={mediaHandoffPolicy.enabled === true}
                  onToggle={() => updateMediaHandoffPolicy({ enabled: !mediaHandoffPolicy.enabled })}
                />
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr]">
                <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-black/10">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-white/50">
                    Canais
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {MEDIA_HANDOFF_CHANNELS.map((channel) => {
                      const checked = mediaHandoffPolicy.channels.includes(channel.key);
                      return (
                        <button
                          key={channel.key}
                          type="button"
                          onClick={() => toggleMediaHandoffChannel(channel.key)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                            checked
                              ? "border-re7-orange bg-re7-orange text-white"
                              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10"
                          }`}
                        >
                          {channel.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-white/50">
                  Comportamento
                  <select
                    value={mediaHandoffPolicy.behavior}
                    onChange={(event) =>
                      updateMediaHandoffPolicy({
                        behavior: event.target.value as MediaHandoffPolicy["behavior"],
                      })
                    }
                    className="mt-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-slate-900 outline-none focus:border-re7-sky dark:border-white/20 dark:bg-re7-navy/80 dark:text-white"
                  >
                    {MEDIA_HANDOFF_BEHAVIOR_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-white/50">
                  Aviso ao cliente
                  <textarea
                    value={mediaHandoffPolicy.customerNoticeText}
                    onChange={(event) => updateMediaHandoffPolicy({ customerNoticeText: event.target.value })}
                    className="mt-1 min-h-20 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-re7-sky dark:border-white/20 dark:bg-re7-navy/80 dark:text-white"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-white/50">
                  Texto interno para equipe
                  <textarea
                    value={mediaHandoffPolicy.attendantSummaryText}
                    onChange={(event) => updateMediaHandoffPolicy({ attendantSummaryText: event.target.value })}
                    className="mt-1 min-h-20 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-re7-sky dark:border-white/20 dark:bg-re7-navy/80 dark:text-white"
                  />
                </label>
              </div>
            </div>
          ) : null}

          {settings ? (
            <div className="mt-4 rounded-lg border border-white/10 bg-re7-navy/40 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">Follow-up automatico</h3>
                  <p className="mt-1 text-xs text-white/60">
                    Reengaja contatos parados no fluxo. Fora da janela, envia somente template aprovado configurado aqui.
                  </p>
                </div>
                <TogglePill
                  checked={automationDraft.followUpEnabled === true}
                  onToggle={() =>
                    setSettings((current) =>
                      current
                        ? {
                            ...current,
                            followUpEnabled: !current.followUpEnabled,
                          }
                        : current
                    )
                  }
                />
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                <label className="space-y-1 text-xs text-white/65">
                  <span>Delay em minutos</span>
                  <input
                    type="number"
                    min={1}
                    className="w-full rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                    value={automationDraft.followUpDelayMinutes ?? 10}
                    onChange={(event) =>
                      setSettings((current) =>
                        current
                          ? {
                              ...current,
                              followUpDelayMinutes: Math.max(1, Number(event.target.value) || 1),
                            }
                          : current
                      )
                    }
                  />
                </label>
                <label className="space-y-1 text-xs text-white/65">
                  <span>Maximo por conversa</span>
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                    value={automationDraft.followUpMaxCount ?? 1}
                    onChange={(event) =>
                      setSettings((current) =>
                        current
                          ? {
                              ...current,
                              followUpMaxCount: Math.max(0, Math.floor(Number(event.target.value) || 0)),
                            }
                          : current
                      )
                    }
                  />
                </label>
                <label className="space-y-1 text-xs text-white/65">
                  <span>Template fora da janela</span>
                  <div className="flex min-h-10 items-center justify-between rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2">
                    <span className="text-sm text-white/80">Usar template</span>
                    <TogglePill
                      checked={automationDraft.followUpUseTemplate === true}
                      onToggle={() =>
                        setSettings((current) =>
                          current
                            ? {
                                ...current,
                                followUpUseTemplate: !current.followUpUseTemplate,
                              }
                            : current
                        )
                      }
                    />
                  </div>
                </label>
                <label className="space-y-1 text-xs text-white/65">
                  <span>Idioma</span>
                  <input
                    className="w-full rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                    value={automationDraft.followUpTemplateLang ?? "pt_BR"}
                    onChange={(event) =>
                      setSettings((current) =>
                        current
                          ? {
                              ...current,
                              followUpTemplateLang: event.target.value,
                            }
                          : current
                      )
                    }
                  />
                </label>
              </div>
              <label className="mt-3 block space-y-1 text-xs text-white/65">
                <span>Nome do template aprovado</span>
                <input
                  className="w-full rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                  value={automationDraft.followUpTemplateName ?? ""}
                  onChange={(event) =>
                    setSettings((current) =>
                      current
                        ? {
                            ...current,
                            followUpTemplateName: event.target.value,
                          }
                        : current
                    )
                  }
                />
              </label>
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="mb-4 space-y-2">
            <span className="w-fit rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/70">
              Novo flow
            </span>
            {automationDraft.flowEditingLocked ? (
              <p className="rounded-md border border-re7-sky/30 bg-re7-sky/10 px-3 py-2 text-sm text-white/80">
                Edicao esta bloqueada para o cliente no /app, mas liberada para a equipe interna neste console.
              </p>
            ) : null}
          </div>
          <div className="grid gap-3">
            <input
              className="w-full rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Fluxo principal"
            />
            <textarea
              id="admin-new-flow-definition"
              className="min-h-[18rem] w-full rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 font-mono text-sm text-white outline-none focus:border-re7-sky"
              value={newDefinition}
              onChange={(event) => setNewDefinition(event.target.value)}
              spellCheck={false}
            />
            <div className="flex flex-wrap items-center gap-2 text-sm text-white/75">
              <input
                className="min-w-[220px] flex-1 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                value={newSearch}
                onChange={(event) => setNewSearch(event.target.value)}
                placeholder="Localizar no JSON"
              />
              <button
                type="button"
                onClick={() => selectJsonOccurrence("admin-new-flow-definition", newDefinition, newSearch, true)}
                disabled={!newSearch.trim()}
                className="rounded-md border border-white/20 px-3 py-2 text-xs text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={() => selectJsonOccurrence("admin-new-flow-definition", newDefinition, newSearch)}
                disabled={!newSearch.trim()}
                className="rounded-md border border-white/20 px-3 py-2 text-xs text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Proximo
              </button>
              <span className="text-xs text-white/50">{countOccurrences(newDefinition, newSearch)} ocorrencia(s)</span>
            </div>
            {newJsonError ? (
              <p className="rounded-md border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                JSON invalido: {newJsonError}
              </p>
            ) : (
              <p className="text-xs text-emerald-200/80">JSON valido. Ao salvar, o conteudo sera reindentado.</p>
            )}
            <div className="flex flex-wrap items-center gap-4 text-sm text-white/80">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={newIsActive}
                  onChange={(event) => setNewIsActive(event.target.checked)}
                />
                Ativo
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={newEntryPoint}
                  onChange={(event) => setNewEntryPoint(event.target.checked)}
                />
                Entrada principal
              </label>
            </div>
            <div>
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating || !clientKey}
                className="rounded-md bg-re7-orange px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creating ? "Criando..." : "Criar fluxo"}
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Fluxos cadastrados</h2>
              <p className="mt-1 text-sm text-white/65">
                Edicao interna liberada. O cliente final enxerga o resultado no /app.
              </p>
            </div>
            <FlowBadge label={`${flows.length} fluxo(s)`} />
          </div>

          {sortedFlows.length === 0 && !loading ? (
            <p className="text-sm text-white/70">Nenhum fluxo cadastrado.</p>
          ) : (
            <div className="space-y-4">
              {sortedFlows.map((flow) => {
                const draft = drafts[flow.id];
                if (!draft) return null;
                const search = draftSearches[flow.id] ?? "";
                return (
                  <article key={flow.id} className="rounded-xl border border-white/10 bg-re7-navy/40 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-2">
                        <h3 className="text-lg font-semibold text-white">{flow.name}</h3>
                        <div className="flex flex-wrap items-center gap-2">
                          <FlowBadge label={flow.isActive ? "Ativo" : "Inativo"} tone={flow.isActive ? "success" : "warning"} />
                          {flow.entryPoint ? <FlowBadge label="Entrada principal" /> : null}
                          <FlowBadge label={`Atualizado em ${formatDateTime(flow.updatedAt)}`} />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleSave(flow)}
                        disabled={savingId === flow.id}
                        className="rounded-md border border-white/20 px-3 py-2 text-sm text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {savingId === flow.id ? "Salvando..." : "Salvar"}
                      </button>
                    </div>

                    <div className="mt-4 grid gap-3">
                      <input
                        className="w-full rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                        value={draft.name}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [flow.id]: {
                              ...draft,
                              name: event.target.value,
                            },
                          }))
                        }
                      />
                      <textarea
                        id={`admin-flow-definition-${flow.id}`}
                        className="min-h-[18rem] w-full rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 font-mono text-sm text-white outline-none focus:border-re7-sky"
                        value={draft.definitionText}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [flow.id]: {
                              ...draft,
                              definitionText: event.target.value,
                            },
                          }))
                        }
                        spellCheck={false}
                      />
                      <div className="flex flex-wrap items-center gap-2 text-sm text-white/75">
                        <input
                          className="min-w-[220px] flex-1 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                          value={search}
                          onChange={(event) =>
                            setDraftSearches((current) => ({
                              ...current,
                              [flow.id]: event.target.value,
                            }))
                          }
                          placeholder="Localizar no JSON"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            selectJsonOccurrence(
                              `admin-flow-definition-${flow.id}`,
                              draft.definitionText,
                              search,
                              true
                            )
                          }
                          disabled={!search.trim()}
                          className="rounded-md border border-white/20 px-3 py-2 text-xs text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Anterior
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            selectJsonOccurrence(`admin-flow-definition-${flow.id}`, draft.definitionText, search)
                          }
                          disabled={!search.trim()}
                          className="rounded-md border border-white/20 px-3 py-2 text-xs text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Proximo
                        </button>
                        <span className="text-xs text-white/50">
                          {countOccurrences(draft.definitionText, search)} ocorrencia(s)
                        </span>
                      </div>
                      {draftJsonErrors[flow.id] ? (
                        <p className="rounded-md border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                          JSON invalido: {draftJsonErrors[flow.id]}
                        </p>
                      ) : (
                        <p className="text-xs text-emerald-200/80">JSON valido.</p>
                      )}
                      <div className="flex flex-wrap items-center gap-4 text-sm text-white/80">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={draft.isActive}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [flow.id]: {
                                  ...draft,
                                  isActive: event.target.checked,
                                },
                              }))
                            }
                          />
                          Ativo
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={draft.entryPoint}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [flow.id]: {
                                  ...draft,
                                  entryPoint: event.target.checked,
                                },
                              }))
                            }
                          />
                          Entrada principal
                        </label>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
