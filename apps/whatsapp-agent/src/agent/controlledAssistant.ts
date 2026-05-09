import { TenantConfig } from "../config/tenantConfig.js";
import {
  ConversationGoal,
  ConversationStage,
  ConversationState,
  FlowContext,
  AIMemoryState,
  OrchestratorNextAction,
} from "../conversation/conversation.types.js";
import { AgentBrain } from "./agent.types.js";

export type ControlledAssistantInput = {
  brain: AgentBrain;
  text: string;
  tenant: Pick<
    TenantConfig,
    | "name"
    | "defaultLanguage"
    | "aiBusinessContext"
    | "aiAssistantSystemPrompt"
    | "aiAssistantAllowedTopics"
    | "aiAssistantBlockedTerms"
    | "aiAssistantSecondaryTopics"
    | "aiAssistantIntentCatalog"
  >;
  state: ConversationState;
  nowIso: string;
  preclassifiedEducationalIntent?: EducationalIntentResult | null;
};

export type ControlledAssistantResult =
  | {
      ok: true;
      text: string;
      output: ValidatedOrchestratorOutput;
      model?: string;
      usage?: unknown;
    }
  | { ok: false; reason: string };

export type GuardrailRisk =
  | "legal_specific_case"
  | "document_analysis"
  | "benefit_amount"
  | "outcome_prediction"
  | "personal_data"
  | "fraud_or_illicit";

export type AssistantTenantContext = {
  tenantName?: string | null;
  aiBusinessContext?: string | null;
  defaultLanguage?: string | null;
  flowContext?: FlowContext;
  flowTags?: string[];
  handoffPrompt?: string | null;
  fallbackMessage?: string | null;
  greetingMessage?: string | null;
  allowedTopics?: string[] | null;
  secondaryTopics?: string[] | null;
  intentCatalog?: TenantConfig["aiAssistantIntentCatalog"] | null;
};

export type ResolvedTenantIntent = {
  key: string;
  title: string | null;
  topic: string;
  response: string | null;
  nextQuestion: string | null;
  leadTemp: OrchestratorLeadTemp | null;
  priority: OrchestratorPriority | null;
  handoff: boolean;
  tags: string[];
};

export type ContextualFallbackType =
  | "greeting"
  | "negative"
  | "out_of_scope"
  | "near_domain"
  | "clarification"
  | "help"
  | "unknown";

export type ContextualFallbackResult = {
  type: ContextualFallbackType;
  confidence: number;
  reason: string;
};

export type OrchestratorLeadTemp = "quente" | "morno" | "frio";
export type OrchestratorPriority = "alta" | "media" | "baixa";

export type RawOrchestratorOutput = {
  reply?: unknown;
  intent?: unknown;
  stage?: unknown;
  goal?: unknown;
  confidence?: unknown;
  missing_information?: unknown;
  next_action?: unknown;
  next_question?: unknown;
  handoff_recommended?: unknown;
  lead_temp?: unknown;
  priority?: unknown;
};

export type ValidatedOrchestratorOutput = {
  reply: string;
  intent: string | null;
  stage: ConversationStage;
  goal: ConversationGoal | string | null;
  confidence: number;
  missing_information: string[];
  next_action: OrchestratorNextAction;
  next_question: string | null;
  handoff_recommended: boolean;
  lead_temp: OrchestratorLeadTemp | null;
  priority: OrchestratorPriority | null;
};

export type AICrmEnrichmentInput = {
  state: ConversationState;
  output: ValidatedOrchestratorOutput;
  topic?: string | null;
  catalogTags?: string[] | null;
  nowIso: string;
};

export type AICrmEnrichmentResult = {
  state: ConversationState;
  enriched: boolean;
  skippedReason?: string;
  changedFields: string[];
  addedTags: string[];
  priorityUpdated: boolean;
};

export type ResolvedOrchestratorAction =
  | {
      shouldSend: true;
      action: "answer" | "ask_question" | "fallback_menu" | "handoff_recommend_ignored" | "handoff_force_ignored";
      text: string;
      lastQuestion: string | null;
      ignoredAction?: OrchestratorNextAction;
    }
  | {
      shouldSend: false;
      action: "no_reply";
      reason: string;
      lastQuestion: null;
      ignoredAction?: OrchestratorNextAction;
    };

export type HandoffScoreInput = {
  output?: Pick<
    ValidatedOrchestratorOutput,
    | "confidence"
    | "missing_information"
    | "next_action"
    | "handoff_recommended"
    | "lead_temp"
    | "priority"
  >;
  previousMissingInformation?: string[];
  explicitHumanRequest?: boolean;
  guardrailRisk?: GuardrailRisk | null;
  assistantLimitReached?: boolean;
};

export type HandoffScoreResult = {
  score: number;
  allowed: boolean;
  threshold: number;
  reasons: string[];
  primaryReason: string | null;
};

export type HandoffRecommendationEligibilityInput = {
  state: ConversationState;
  duplicateMessage?: boolean;
  windowOpen?: boolean;
  tenantAiEnabled?: boolean;
  tenantFallbackToHandoff?: boolean;
};

export type HandoffRecommendationEligibility =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "duplicate_message"
        | "window_closed"
        | "tenant_ai_disabled"
        | "tenant_handoff_fallback_disabled"
        | "human_mode"
        | "handoff_active"
        | "flow_active";
    };

export type HandoffPromptInput = {
  context: AssistantTenantContext;
};

export type AIMemoryUpdateInput = {
  state: ConversationState;
  nowIso: string;
  topic?: string | null;
  stage?: ConversationStage | string | null;
  goal?: ConversationGoal | string | null;
  flowContext?: FlowContext | null;
  leadTemp?: OrchestratorLeadTemp | null;
  priority?: OrchestratorPriority | null;
  wantsHuman?: boolean;
  handoffRecommended?: boolean;
  guardrailRisk?: GuardrailRisk | null;
};

export type AIMemoryUpdateResult = {
  memory: AIMemoryState;
  updated: boolean;
  compacted: boolean;
};

export type AIHandoffCrmArtifactInput = {
  state: ConversationState;
  reason?: string | null;
  score?: number | null;
};

export type AIHandoffCrmArtifacts = {
  summaryNote: string;
  suggestedReplyNote: string;
};

export type AssistantFallbackIntent = "handoff_prompt" | "generic_guidance";

export type AssistantFallbackDecision = {
  intent: AssistantFallbackIntent;
  reason: string;
};

const GENERIC_GREETING_REPLY =
  "Olá! Me diga em poucas palavras como posso te ajudar.";
const CONTEXTUAL_FALLBACK_REPLIES: Record<ContextualFallbackType, string> = {
  greeting: GENERIC_GREETING_REPLY,
  negative: "Tudo bem. Se precisar de algo, é só me chamar.",
  clarification: "Claro. Me diga em poucas palavras qual ponto você quer entender melhor.",
  out_of_scope:
    "Esse tema pode fugir do atendimento automático configurado aqui. Posso direcionar você para uma pessoa da equipe?",
  near_domain:
    "Esse assunto parece próximo do atendimento da equipe, mas pode precisar de uma análise mais específica. Posso encaminhar você para uma pessoa da equipe?",
  help: "",
  unknown: "Não consegui identificar bem o assunto. Você pode me dizer em poucas palavras o que precisa?",
};
const REPEATED_CONTEXTUAL_FALLBACK_REPLY =
  "Entendi. Quer que eu direcione para uma pessoa da equipe?";

export const AI_ASSISTANT_SIMPLE_QUESTION_STARTERS = [
  "o que",
  "oq",
  "como",
  "qual",
  "quais",
  "quando",
  "quanto tempo",
  "precisa",
  "pode explicar",
  "me explica",
  "explique",
];

export const AI_ASSISTANT_GLOBAL_TOPIC_TERMS: string[] = [];

export const AI_ASSISTANT_GLOBAL_BLOCKED_TERMS = [
  "tenho direito",
  "tenho chance",
  "meu caso",
  "minha situacao",
  "minha situação",
  "me enquadro",
  "analise",
  "analisar",
  "vou ganhar",
  "caso ganha",
  "quanto vou receber",
  "valor vou receber",
  "calcule",
  "calcular",
  "laudo",
  "diagnostico",
  "diagnóstico",
  "doenca",
  "doença",
  "cid",
];

export const AI_ASSISTANT_GLOBAL_HANDOFF_TERMS = [
  "atendente",
  "atendimento humano",
  "falar com alguem",
  "falar com alguém",
  "falar com uma pessoa",
  "pessoa da equipe",
  "humano",
  "especialista",
  "encaminhar",
  "me chama",
  "preciso de ajuda",
  "preciso de uma analise",
  "preciso de uma análise",
  "analise mais especifica",
  "análise mais específica",
  "nao resolveu",
  "não resolveu",
];

const AI_ASSISTANT_VAGUE_MESSAGE_TERMS = [
  "tudo bem",
  "ok",
  "sim",
  "nao",
  "não",
  "obrigado",
  "obrigada",
  "valeu",
];

const AI_ASSISTANT_GREETING_TERMS = [
  "oi",
  "ola",
  "olá",
  "opa",
  "bom dia",
  "boa tarde",
  "boa noite",
];

const SAFE_CONTEXT_KEYS = [
  "area",
  "servico",
  "intent",
  "prioridade",
  "lead_temp",
  "origem_intencao",
] as const;

const AI_MEMORY_FACT_KEYS = [
  "area",
  "servico",
  "intent",
  "prioridade",
  "lead_temp",
  "origem_intencao",
  "stage",
  "goal",
] as const;

const REQUIRED_SUFFIX = "Se quiser, posso te orientar melhor conforme sua situação.";
const GENERIC_SAFE_SUFFIX = "Se quiser, posso te orientar melhor conforme sua situação.";
export const AI_ASSISTANT_MAX_INPUT_CHARS = 220;
export const ORCHESTRATOR_MAX_REPLY_CHARS = 700;
export const ORCHESTRATOR_MAX_LIST_ITEMS = 8;
export const AI_MEMORY_MAX_SUMMARY_CHARS = 300;
export const AI_MEMORY_MAX_TOPICS = 5;
export const ORCHESTRATOR_MAX_QUESTION_CHARS = 180;
export const ORCHESTRATOR_HANDOFF_THRESHOLD = 3;

const CONVERSATION_STAGE_ALLOWLIST: readonly ConversationStage[] = [
  "greeting",
  "triage",
  "qualification",
  "clarification",
  "waiting_user",
  "handoff_recommended",
  "handoff_active",
  "closed",
];

const ORCHESTRATOR_NEXT_ACTION_ALLOWLIST: readonly OrchestratorNextAction[] = [
  "answer",
  "ask_question",
  "handoff_recommend",
  "handoff_force",
  "fallback_menu",
  "no_reply",
];

const ORCHESTRATOR_GOAL_ALLOWLIST: readonly ConversationGoal[] = [
  "identify_need",
  "explain_general_topic",
  "discover_service",
  "discover_urgency",
  "collect_safe_context",
  "recommend_handoff",
];

const NON_BUSINESS_TOPIC_TERMS = new Set([
  ...CONVERSATION_STAGE_ALLOWLIST,
  ...ORCHESTRATOR_NEXT_ACTION_ALLOWLIST,
  ...ORCHESTRATOR_GOAL_ALLOWLIST,
  "out_of_scope",
  "out of scope",
  "unknown",
  "desconhecido",
  "greeting",
  "negative",
  "clarification",
  "help",
  "handoff_request",
  "handoff request",
  "legal_specific_case",
  "legal specific case",
  "document_analysis",
  "document analysis",
  "benefit_amount",
  "benefit amount",
  "outcome_prediction",
  "outcome prediction",
  "personal_data",
  "personal data",
  "fraud_or_illicit",
  "fraud or illicit",
  "guardrail_legal_specific_case",
  "guardrail legal specific case",
  "guardrail_document_analysis",
  "guardrail document analysis",
  "guardrail_benefit_amount",
  "guardrail benefit amount",
  "guardrail_outcome_prediction",
  "guardrail outcome prediction",
  "guardrail_personal_data",
  "guardrail personal data",
  "guardrail_fraud_or_illicit",
  "guardrail fraud or illicit",
].flatMap((term) => [term, normalizeText(term)]));

type SimpleQuestionOptions = {
  allowedTopics?: string[] | null;
  blockedTerms?: string[] | null;
};

export type EducationalIntentResult = {
  allowed: boolean;
  educational: boolean;
  topic?: string;
  reason?: string;
  concreteRisk?: boolean;
};

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\bvcs\b/g, "voces")
    .replace(/\bvc\b/g, "voce")
    .replace(/[^\p{L}\p{N}\s?]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsPersonalData(text: string) {
  const normalized = text.replace(/\D/g, "");
  if (normalized.length >= 9) return true;
  if (/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(text)) return true;
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) return true;
  return false;
}

function normalizeTermList(values: string[] | null | undefined) {
  return (values ?? [])
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .slice(0, 80);
}

function containsAnyTerm(normalizedText: string, terms: string[]) {
  return terms.some((term) => normalizedText.includes(normalizeText(term)));
}

const TOPIC_STOPWORDS = new Set([
  "a",
  "o",
  "as",
  "os",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "em",
  "para",
  "por",
  "com",
  "sem",
  "que",
  "qual",
  "quais",
  "quanto",
  "quantos",
  "tempo",
  "precisa",
  "preciso",
  "receber",
  "beneficio",
  "benefício",
  "servico",
  "serviço",
]);

function topicTokens(value: string | null | undefined) {
  return normalizeText(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !TOPIC_STOPWORDS.has(token));
}

function editDistanceWithin(a: string, b: string, maxDistance: number) {
  if (Math.abs(a.length - b.length) > maxDistance) return false;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    let rowMin = previous[0];
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + cost);
      diagonal = above;
      rowMin = Math.min(rowMin, previous[j]);
    }
    if (rowMin > maxDistance) return false;
  }
  return previous[b.length] <= maxDistance;
}

function topicTokenMatches(messageToken: string, topicToken: string) {
  if (messageToken === topicToken) return true;
  if (messageToken.includes(topicToken) || topicToken.includes(messageToken)) return true;
  const sharedPrefix = Math.min(messageToken.length, topicToken.length);
  if (sharedPrefix >= 5 && messageToken.slice(0, 5) === topicToken.slice(0, 5)) return true;
  const maxDistance = Math.max(messageToken.length, topicToken.length) >= 8 ? 2 : 1;
  return editDistanceWithin(messageToken, topicToken, maxDistance);
}

export function resolveTenantTopic(
  text: string | null | undefined,
  allowedTopics: string[] | null | undefined
) {
  const raw = String(text ?? "").trim();
  const normalizedText = normalizeText(raw);
  if (!normalizedText) return null;
  const messageTokens = topicTokens(raw);
  let best: { topic: string; score: number; specificity: number } | null = null;
  for (const topic of normalizeTermList(allowedTopics)) {
    const normalizedTopic = normalizeText(topic);
    const safeTopic = normalizeContinuationTopic(topic);
    if (!normalizedTopic || !safeTopic) continue;
    const tokens = topicTokens(topic);
    if (!tokens.length) continue;
    let score = normalizedText.includes(normalizedTopic) ? 1 : 0;
    if (!score) {
      const matched = tokens.filter((topicToken) =>
        messageTokens.some((messageToken) => topicTokenMatches(messageToken, topicToken))
      ).length;
      score = matched / tokens.length;
    }
    if (score < 0.66) continue;
    const specificity = tokens.join("").length;
    if (
      !best ||
      score > best.score ||
      (score === best.score && specificity > best.specificity)
    ) {
      best = { topic: safeTopic, score, specificity };
    }
  }
  return best?.topic ?? null;
}

export function resolveTenantIntent(
  text: string | null | undefined,
  catalog: TenantConfig["aiAssistantIntentCatalog"] | null | undefined,
  options: { preferredTopics?: unknown[] } = {}
): ResolvedTenantIntent | null {
  const raw = String(text ?? "").trim();
  if (!raw || !Array.isArray(catalog) || !catalog.length) return null;
  let best: (ResolvedTenantIntent & { specificity: number; score: number }) | null = null;
  for (const item of catalog) {
    if (!item?.key) continue;
    const candidates = [
      ...(Array.isArray(item.topics) ? item.topics : []),
      item.title ?? "",
      item.key.replace(/[_:-]/g, " "),
    ].filter((term): term is string => Boolean(term && term.trim()));
    const match = resolveTenantIntentCatalogMatch(raw, candidates, options.preferredTopics);
    if (!match) continue;
    const key = sanitizeCrmToken(item.key) ?? item.key.trim().toLowerCase();
    const canonicalTopic = normalizeContinuationTopic(item.title) ?? match.topic;
    const specificity = Math.max(match.specificity, key.length);
    const resolved: ResolvedTenantIntent & { specificity: number } = {
      key,
      title: typeof item.title === "string" && item.title.trim() ? item.title.trim() : null,
      topic: canonicalTopic,
      response: typeof item.response === "string" && item.response.trim() ? item.response.trim() : null,
      nextQuestion:
        typeof item.nextQuestion === "string" && item.nextQuestion.trim()
          ? item.nextQuestion.trim()
          : null,
      leadTemp: item.leadTemp ?? null,
      priority: item.priority ?? null,
      handoff: item.handoff === true,
      tags: Array.isArray(item.tags)
        ? item.tags
            .map((tag) => sanitizeCrmTag(tag))
            .filter((tag): tag is string => Boolean(tag))
        : [],
      specificity,
    };
    if (
      !best ||
      match.score > best.score ||
      (match.score === best.score && resolved.specificity > best.specificity)
    ) {
      best = { ...resolved, specificity, score: match.score };
    }
  }
  if (!best) return null;
  const { specificity: _specificity, score: _score, ...resolved } = best as ResolvedTenantIntent & {
    specificity: number;
    score?: number;
  };
  return resolved;
}

const INTENT_CATALOG_GENERIC_TOKENS = new Set([
  "voces",
  "fazem",
  "dao",
  "dão",
  "dar",
  "entrada",
  "preciso",
  "quero",
  "queria",
  "gostaria",
  "qual",
  "quais",
  "saber",
  "sobre",
  "pra",
  "pro",
  "servico",
  "servicos",
  "atendimento",
  "me",
  "minha",
  "meu",
  "idade",
  "idades",
  "ano",
  "anos",
]);

function intentCatalogTokenMatches(messageToken: string, topicToken: string) {
  if (messageToken === topicToken) return true;
  if (messageToken.includes(topicToken) || topicToken.includes(messageToken)) return true;
  const sharedPrefix = Math.min(messageToken.length, topicToken.length);
  if (sharedPrefix >= 5 && messageToken.slice(0, 5) === topicToken.slice(0, 5)) return true;
  if (Math.max(messageToken.length, topicToken.length) < 7) return false;
  if (messageToken.slice(0, 4) !== topicToken.slice(0, 4)) return false;
  return editDistanceWithin(messageToken, topicToken, 1);
}

function resolveTenantIntentCatalogMatch(
  raw: string,
  candidates: string[],
  preferredTopics: unknown[] = []
) {
  const normalizedText = normalizeText(raw);
  const messageTokens = topicTokens(raw).filter((token) => !INTENT_CATALOG_GENERIC_TOKENS.has(token));
  const preferredTokens = preferredTopics
    .map((topic) => normalizeContinuationTopic(topic))
    .filter((topic): topic is string => Boolean(topic))
    .flatMap((topic) => topicTokens(topic));
  let best: { topic: string; score: number; specificity: number } | null = null;
  for (const candidate of candidates) {
    const normalizedTopic = normalizeText(candidate);
    const safeTopic = normalizeContinuationTopic(candidate);
    if (!normalizedTopic || !safeTopic) continue;
    const tokens = topicTokens(candidate);
    if (!tokens.length) continue;
    const contentTokens = tokens.filter((token) => !INTENT_CATALOG_GENERIC_TOKENS.has(token));
    if (!contentTokens.length) continue;
    const preferredMatched = preferredTokens.length
      ? contentTokens.filter((topicToken) =>
          preferredTokens.some((preferredToken) => intentCatalogTokenMatches(preferredToken, topicToken))
        ).length
      : 0;
    const genericOperationalRequest =
      messageTokens.length <= 2 &&
      containsAnyTerm(normalizedText, [
        "o que precisa",
        "que precisa",
        "dar entrada",
        "como funciona",
        "documentos",
        "documentacao",
        "documentação",
        "criterios",
        "critérios",
        "quais documentos",
      ]);
    const hasContentMatch =
      contentTokens.some((topicToken) =>
        messageTokens.some((messageToken) => intentCatalogTokenMatches(messageToken, topicToken))
      ) ||
      (preferredMatched > 0 && genericOperationalRequest);
    if (!hasContentMatch) continue;
    let score = normalizedText.includes(normalizedTopic) ? 1 : 0;
    if (!score) {
      const matched = tokens.filter((topicToken) =>
        messageTokens.some((messageToken) => intentCatalogTokenMatches(messageToken, topicToken))
      ).length;
      score = matched / tokens.length;
    }
    if (score < 0.66 && preferredMatched) {
      if (preferredMatched && genericOperationalRequest) {
        score = Math.max(score, 1.05);
      }
    }
    if (score < 0.66) continue;
    const specificity = contentTokens.join("").length || tokens.join("").length;
    if (
      !best ||
      score > best.score ||
      (score === best.score && specificity > best.specificity)
    ) {
      best = { topic: safeTopic, score, specificity };
    }
  }
  return best;
}

export function buildTenantIntentCatalogReply(intent: ResolvedTenantIntent) {
  const response = intent.response?.trim();
  if (!response) return null;
  const nextQuestion = intent.nextQuestion?.trim();
  const text = nextQuestion && !response.includes(nextQuestion)
    ? `${response}\n\n${nextQuestion}`
    : response;
  return text.slice(0, ORCHESTRATOR_MAX_REPLY_CHARS).trim();
}

export function buildTenantIntentOrchestratorOutput(
  intent: ResolvedTenantIntent,
  reply: string
): ValidatedOrchestratorOutput {
  return {
    reply,
    intent: intent.key,
    stage: intent.handoff ? "handoff_recommended" : "triage",
    goal: intent.handoff ? "recommend_handoff" : "explain_general_topic",
    confidence: 1,
    missing_information: [],
    next_action: intent.handoff ? "handoff_recommend" : "answer",
    next_question: intent.nextQuestion,
    handoff_recommended: intent.handoff,
    lead_temp: intent.leadTemp,
    priority: intent.priority,
  };
}

export function classifyRisk(
  text: string | null | undefined,
  _context: AssistantTenantContext = {}
): GuardrailRisk | null {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  const normalized = normalizeText(raw);
  if (containsPersonalData(raw)) return "personal_data";
  if (
    containsAnyTerm(normalized, [
      "fraude",
      "fraudar",
      "burlar",
      "falsificar",
      "mentir",
      "omitir",
      "documento falso",
      "nota falsa",
    ])
  ) {
    return "fraud_or_illicit";
  }
  if (
    containsAnyTerm(normalized, [
      "analise meu documento",
      "analisar meu documento",
      "meu documento",
      "laudo",
      "diagnostico",
      "cid",
      "exame",
      "atestado",
    ])
  ) {
    return "document_analysis";
  }
  if (
    containsAnyTerm(normalized, [
      "quanto vou receber",
      "valor vou receber",
      "qual valor",
      "calcule",
      "calcular",
      "receber quanto",
    ])
  ) {
    return "benefit_amount";
  }
  if (
    containsAnyTerm(normalized, [
      "vou ganhar",
      "caso ganha",
      "meu caso ganha",
      "resultado garantido",
      "garantia de resultado",
      "tenho chance",
    ])
  ) {
    return "outcome_prediction";
  }
  if (
    containsAnyTerm(normalized, [
      "tenho direito",
      "tenho direto",
      "tenho direit",
      "se tenho direito",
      "se tenho direto",
      "se tenho direit",
      "posso receber",
      "meu caso",
      "meu processo",
      "meu recurso",
      "posso processar",
      "minha situacao",
      "me enquadro",
    ])
  ) {
    return "legal_specific_case";
  }
  return null;
}

export function buildHandoffConfirmationPrompt(input: HandoffPromptInput) {
  const configuredPrompt = input.context.handoffPrompt?.trim();
  if (configuredPrompt) {
    return configuredPrompt.slice(0, 500);
  }
  return "Para te orientar melhor, posso direcionar seu atendimento para uma pessoa da equipe?";
}

export function classifyAssistantFallback(
  text: string | null | undefined,
  options: { handoffKeywords?: string[] | null } = {}
): AssistantFallbackDecision | null {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  const normalized = normalizeText(raw);
  const handoffTerms = [
    ...AI_ASSISTANT_GLOBAL_HANDOFF_TERMS,
    ...normalizeTermList(options.handoffKeywords),
  ];
  if (containsAnyTerm(normalized, handoffTerms)) {
    return { intent: "handoff_prompt", reason: "handoff_signal" };
  }
  if (
    AI_ASSISTANT_GREETING_TERMS.some((term) => normalized === normalizeText(term)) ||
    AI_ASSISTANT_VAGUE_MESSAGE_TERMS.some((term) => normalized === normalizeText(term))
  ) {
    return { intent: "generic_guidance", reason: "vague_message" };
  }
  return { intent: "generic_guidance", reason: "not_simple_question" };
}

export function classifyContextualFallback(
  text: string | null | undefined,
  tenant: {
    aiAssistantAllowedTopics?: string[] | null;
    aiAssistantSecondaryTopics?: string[] | null;
  } = {},
): ContextualFallbackResult {
  const raw = String(text ?? "").trim();
  const normalized = normalizeText(raw);
  if (!normalized) return { type: "unknown", confidence: 0.4, reason: "empty" };
  if (AI_ASSISTANT_GREETING_TERMS.some((term) => normalized === normalizeText(term))) {
    return { type: "greeting", confidence: 0.9, reason: "greeting_exact" };
  }
  const negativeTerms = ["nao", "não", "obrigado", "obrigada", "valeu"];
  if (negativeTerms.some((term) => normalized === normalizeText(term))) {
    return { type: "negative", confidence: 0.9, reason: "negative_short" };
  }
  if (
    containsAnyTerm(normalized, [
      "nao quero",
      "não quero",
      "agora nao",
      "agora não",
      "depois",
      "nao precisa",
      "não precisa",
      "obrigado",
      "obrigada",
      "valeu",
    ])
  ) {
    return { type: "negative", confidence: 0.86, reason: "negative_phrase" };
  }
  if (
    containsAnyTerm(normalized, [
      "ajuda",
      "o que voces fazem",
      "o que vocês fazem",
      "quais servicos",
      "quais serviços",
      "quais os servicos",
      "quais os serviços",
      "servicos de voces",
      "serviços de vocês",
      "servicos voces",
      "serviços vocês",
      "o que voces atendem",
      "o que vocês atendem",
    ])
  ) {
    return { type: "help", confidence: 0.84, reason: "help_request" };
  }
  if (
    containsAnyTerm(normalized, [
      "nao entendi",
      "não entendi",
      "explique melhor",
      "como assim",
      "nao ficou claro",
      "não ficou claro",
    ])
  ) {
    return { type: "clarification", confidence: 0.84, reason: "clarification_request" };
  }
  const secondaryTopic = normalizeTermList(tenant.aiAssistantSecondaryTopics).find((term) =>
    normalized.includes(normalizeText(term))
  ) ?? resolveTenantTopic(raw, tenant.aiAssistantSecondaryTopics);
  if (secondaryTopic) {
    return { type: "near_domain", confidence: 0.78, reason: "secondary_topic" };
  }
  const allowedTopic = resolveTenantTopic(raw, tenant.aiAssistantAllowedTopics);
  if (!allowedTopic) {
    return { type: "out_of_scope", confidence: 0.7, reason: "topic_not_allowed" };
  }
  return { type: "unknown", confidence: 0.5, reason: "unclassified_allowed_topic" };
}

export function buildContextualFallbackReply(input: {
  result: ContextualFallbackResult;
  fallbackMessage?: string | null;
  greetingMessage?: string | null;
  repeated?: boolean;
}) {
  if (input.repeated) return REPEATED_CONTEXTUAL_FALLBACK_REPLY;
  if (input.result.type === "greeting" && input.greetingMessage?.trim()) {
    return input.greetingMessage.trim().slice(0, 700);
  }
  if (input.result.type === "help" && input.fallbackMessage?.trim()) {
    return input.fallbackMessage.trim().slice(0, 700);
  }
  return CONTEXTUAL_FALLBACK_REPLIES[input.result.type] || CONTEXTUAL_FALLBACK_REPLIES.unknown;
}

export function classifyPendingOfferResponse(text: string | null | undefined) {
  const normalized = normalizeText(text);
  if (!normalized) return "invalid" as const;
  const negativeTerms = [
    "nao",
    "agora nao",
    "depois",
    "nao quero",
    "continuar aqui",
  ];
  if (negativeTerms.some((term) => normalized === term || normalized.includes(term))) {
    return "declined" as const;
  }
  const positiveTerms = [
    "sim",
    "quero",
    "pode",
    "ok",
    "claro",
    "sim quero",
    "pode sim",
    "pode encaminhar",
  ];
  if (positiveTerms.some((term) => normalized === term || normalized.includes(term))) {
    return "accepted" as const;
  }
  return "invalid" as const;
}

export function isContextualAck(text: string | null | undefined) {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  const ackTerms = [
    "sim",
    "sim quero",
    "quero",
    "pode",
    "pode sim",
    "ok",
    "claro",
    "quero sim",
    "continuar",
    "me explique",
    "explica melhor",
  ];
  return ackTerms.some((term) => normalized === term);
}

function normalizeContinuationTopic(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed || containsPersonalData(trimmed) || classifyRisk(trimmed)) return null;
  const normalized = normalizeText(trimmed);
  if (!normalized || NON_BUSINESS_TOPIC_TERMS.has(normalized)) return null;
  if (NON_BUSINESS_TOPIC_TERMS.has(normalized.replace(/[_-]+/g, " "))) return null;
  if (/^\d+$/.test(normalized) || /\b(19|20)\d{2}\b/.test(normalized)) return null;
  if (["homem", "mulher", "masculino", "feminino", "idade", "anos", "ano"].includes(normalized)) {
    return null;
  }
  const lettersOnly = normalized.replace(/[^\p{L}]/gu, "");
  if (lettersOnly.length < 3) return null;
  return sanitizeMemoryTopic(trimmed) ?? null;
}

function formatContinuationTopic(topic: string | null | undefined) {
  const normalized = normalizeContinuationTopic(topic);
  if (!normalized) return null;
  const readable = normalized
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  if (!readable || readable.length < 3 || containsPersonalData(readable) || classifyRisk(readable)) {
    return null;
  }
  return readable;
}

export function resolveContextualContinuationTopic(state: ConversationState) {
  const context = state.answers?.flowContext ?? {};
  const memory = state.answers?.aiMemory;
  const candidates = [
    ...(memory?.lastTopics ?? []),
    memory?.facts?.servico,
    memory?.facts?.intent,
    context.servico,
    context.intent,
    context.area,
    memory?.facts?.area,
  ];
  for (const candidate of candidates) {
    const topic = normalizeContinuationTopic(candidate);
    if (topic) return topic;
  }
  return null;
}

export function buildContextualContinuationReply(topic: string | null | undefined) {
  const readableTopic = formatContinuationTopic(topic);
  if (readableTopic) {
    return `Certo. Posso continuar te orientando sobre ${readableTopic}. Qual ponto você quer entender melhor?`;
  }
  return "Certo. Posso continuar te orientando sobre esse assunto. Qual ponto você quer entender melhor?";
}

export function buildAssistantLimitReachedReply(input: {
  context: AssistantTenantContext;
  canOfferHandoff?: boolean;
}) {
  if (input.canOfferHandoff) {
    return buildHandoffConfirmationPrompt({ context: input.context });
  }
  return "Para continuar com segurança, posso direcionar você para uma pessoa da equipe.";
}

export function buildAssistantFallbackGuidance(context: AssistantTenantContext) {
  const configuredMessage = context.fallbackMessage?.trim();
  if (configuredMessage) {
    return configuredMessage.slice(0, 700);
  }
  return [
    "Posso te ajudar com dúvidas gerais sobre os serviços disponíveis.",
    "Se quiser atendimento especializado, posso direcionar você para uma pessoa da equipe.",
  ].join("\n\n");
}

export function buildAssistantGreetingReply(context: Pick<AssistantTenantContext, "greetingMessage"> = {}) {
  return context.greetingMessage?.trim().slice(0, 700) || GENERIC_GREETING_REPLY;
}

export function buildSafeResponse(risk: GuardrailRisk, tenantContext: AssistantTenantContext) {
  if (risk === "personal_data") {
    return [
      "Para sua segurança, não envie CPF, documentos, telefone, e-mail ou outros dados pessoais por aqui sem necessidade.",
      "Posso te explicar o assunto de forma geral, sem analisar informações pessoais.",
      GENERIC_SAFE_SUFFIX,
    ].join("\n\n");
  }
  if (risk === "fraud_or_illicit") {
    return [
      "Não posso orientar sobre fraude, falsificação, omissão de informações ou qualquer procedimento irregular.",
      "Posso explicar alternativas regulares e seguras para seguir com o atendimento.",
      GENERIC_SAFE_SUFFIX,
    ].join("\n\n");
  }
  const detail =
    risk === "benefit_amount"
      ? "Não consigo calcular ou confirmar valores sem avaliar melhor as informações."
      : risk === "outcome_prediction"
        ? "Não consigo garantir resultado ou prever desfecho sem uma avaliação adequada."
        : risk === "document_analysis"
          ? "Não consigo analisar documentos ou informações específicas por aqui."
          : "Não consigo confirmar uma situação específica sem avaliar melhor as informações.";
  return [
    detail,
    "Posso te explicar de forma geral como isso funciona e, se preferir, te direcionar para atendimento.",
    GENERIC_SAFE_SUFFIX,
  ].join("\n\n");
}

export function isSimpleQuestion(
  text: string | null | undefined,
  options: SimpleQuestionOptions = {}
) {
  return classifyEducationalIntent(text, options).allowed;
}

export function classifyEducationalIntent(
  text: string | null | undefined,
  options: SimpleQuestionOptions = {}
): EducationalIntentResult {
  const raw = String(text ?? "").trim();
  const normalized = normalizeText(raw);
  if (!normalized) return { allowed: false, educational: false, reason: "empty" };
  if (raw.length > AI_ASSISTANT_MAX_INPUT_CHARS) {
    return { allowed: false, educational: false, reason: "too_long" };
  }
  if (containsPersonalData(raw)) {
    return { allowed: false, educational: false, concreteRisk: true, reason: "personal_data" };
  }
  const risk = classifyRisk(raw);
  if (risk) {
    return { allowed: false, educational: false, concreteRisk: true, reason: risk };
  }
  const blockedTerms = [
    ...AI_ASSISTANT_GLOBAL_BLOCKED_TERMS,
    ...normalizeTermList(options.blockedTerms),
  ];
  if (blockedTerms.some((term) => normalized.includes(normalizeText(term)))) {
    return { allowed: false, educational: false, concreteRisk: true, reason: "blocked_term" };
  }
  const startsLikeQuestion = AI_ASSISTANT_SIMPLE_QUESTION_STARTERS.some((term) =>
    normalized.startsWith(normalizeText(term))
  );
  const educationalPatterns = [
    "com quantos",
    "quanto custa",
    "qual preco",
    "qual preço",
    "preco",
    "preço",
    "honorario",
    "honorário",
    "honorarios",
    "honorários",
    "valor do servico",
    "valor do serviço",
    "o que preciso",
    "para comecar",
    "para começar",
    "voces fazem",
    "vocês fazem",
    "voces atendem",
    "vocês atendem",
    "voces dao entrada",
    "vocês dão entrada",
    "voces fazem",
    "vocês fazem",
    "preciso me",
    "quero me",
    "me aposentar",
    "dar entrada",
    "entrada na",
    "dao entrada",
    "dão entrada",
    "trabalham com",
    "atendem",
  ];
  const looksEducational = startsLikeQuestion || containsAnyTerm(normalized, educationalPatterns);
  if (!looksEducational) {
    return { allowed: false, educational: false, reason: "not_educational_shape" };
  }
  const matchedTopic = resolveTenantTopic(raw, options.allowedTopics);
  if (!matchedTopic) {
    return { allowed: false, educational: true, reason: "topic_not_allowed" };
  }
  return {
    allowed: true,
    educational: true,
    topic: matchedTopic,
    reason: startsLikeQuestion ? "question_starter_and_allowed_topic" : "educational_pattern_and_allowed_topic",
  };
}

export function getAiAssistantState(state: ConversationState) {
  const answers = state.answers ?? {};
  const current = answers.aiAssistant;
  if (!current || typeof current !== "object" || Array.isArray(current)) {
    return {
      count: 0,
      lastRespondedAt: null,
      lastMessageId: null,
      lastFallbackType: null,
      lastFallbackAt: null,
      fallbackCount: 0,
    };
  }
  const record = current as Record<string, unknown>;
  return {
    count: typeof record.count === "number" && Number.isFinite(record.count) ? record.count : 0,
    lastRespondedAt:
      typeof record.lastRespondedAt === "string" ? record.lastRespondedAt : null,
    lastMessageId: typeof record.lastMessageId === "string" ? record.lastMessageId : null,
    lastFallbackType:
      typeof record.lastFallbackType === "string" ? record.lastFallbackType : null,
    lastFallbackAt: typeof record.lastFallbackAt === "string" ? record.lastFallbackAt : null,
    fallbackCount:
      typeof record.fallbackCount === "number" && Number.isFinite(record.fallbackCount)
        ? record.fallbackCount
        : 0,
  };
}

function sanitizeFlowContext(context: FlowContext | undefined) {
  const safe: Record<string, string | number | boolean | null> = {};
  for (const key of SAFE_CONTEXT_KEYS) {
    const value = context?.[key];
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      safe[key] = value;
    }
  }
  return safe;
}

function sanitizeMemoryTopic(topic: string | null | undefined) {
  const trimmed = String(topic ?? "").replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.length > 60 || containsPersonalData(trimmed) || classifyRisk(trimmed)) {
    return null;
  }
  const normalized = normalizeText(trimmed);
  if (!normalized || NON_BUSINESS_TOPIC_TERMS.has(normalized)) return null;
  if (NON_BUSINESS_TOPIC_TERMS.has(normalized.replace(/[_-]+/g, " "))) return null;
  if (/^\d+$/.test(normalized) || /\b(19|20)\d{2}\b/.test(normalized)) return null;
  if (["homem", "mulher", "masculino", "feminino", "idade", "anos", "ano"].includes(normalized)) {
    return null;
  }
  return normalized.replace(/[^a-z0-9_ -]/g, "").trim().slice(0, 60) || null;
}

function sanitizeAiMemory(memory: AIMemoryState | null | undefined): AIMemoryState | null {
  if (!memory || typeof memory !== "object" || Array.isArray(memory)) return null;
  const summary =
    typeof memory.summary === "string" &&
    !containsPersonalData(memory.summary) &&
    !classifyRisk(memory.summary)
      ? memory.summary.replace(/\s+/g, " ").trim().slice(0, AI_MEMORY_MAX_SUMMARY_CHARS)
      : undefined;
  const facts: Record<string, string | number | boolean | null> = {};
  const sourceFacts =
    memory.facts && typeof memory.facts === "object" && !Array.isArray(memory.facts)
      ? memory.facts
      : {};
  for (const key of AI_MEMORY_FACT_KEYS) {
    const value = sourceFacts[key];
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      const stringValue = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : value;
      if (typeof stringValue !== "string" || (!containsPersonalData(stringValue) && !classifyRisk(stringValue))) {
        facts[key] = typeof stringValue === "string" ? stringValue.slice(0, 80) : stringValue;
      }
    }
  }
  const lastTopics = Array.isArray(memory.lastTopics)
    ? memory.lastTopics
        .map((topic) => sanitizeMemoryTopic(topic))
        .filter((topic): topic is string => Boolean(topic))
        .slice(0, AI_MEMORY_MAX_TOPICS)
    : [];
  const preferences =
    memory.preferences && typeof memory.preferences === "object" && memory.preferences.wantsHuman === true
      ? { wantsHuman: true }
      : undefined;
  const lastUpdatedAt = typeof memory.lastUpdatedAt === "string" ? memory.lastUpdatedAt : undefined;
  const sanitized: AIMemoryState = {};
  if (summary) sanitized.summary = summary;
  if (Object.keys(facts).length) sanitized.facts = facts;
  if (lastTopics.length) sanitized.lastTopics = lastTopics;
  if (preferences) sanitized.preferences = preferences;
  if (lastUpdatedAt) sanitized.lastUpdatedAt = lastUpdatedAt;
  return Object.keys(sanitized).length ? sanitized : null;
}

function buildAiMemorySummary(memory: AIMemoryState) {
  const topics = memory.lastTopics?.slice(0, 2).join(" e ");
  const service = memory.facts?.servico ?? memory.facts?.intent ?? null;
  const stage = memory.facts?.stage ?? null;
  const parts = [
    topics ? `Cliente trouxe tópico recente: ${topics}.` : null,
    service ? `Contexto categórico: ${String(service)}.` : null,
    stage ? `Estágio: ${String(stage)}.` : null,
    memory.preferences?.wantsHuman ? "Cliente demonstrou preferência por atendimento humano." : null,
  ].filter(Boolean);
  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, AI_MEMORY_MAX_SUMMARY_CHARS);
}

export function updateAiMemory(input: AIMemoryUpdateInput): AIMemoryUpdateResult {
  const previous = sanitizeAiMemory(input.state.answers?.aiMemory) ?? {};
  const facts: Record<string, string | number | boolean | null> = { ...(previous.facts ?? {}) };
  const context = sanitizeFlowContext(input.flowContext ?? input.state.answers?.flowContext);
  for (const key of AI_MEMORY_FACT_KEYS) {
    const value = key === "stage" ? input.stage : key === "goal" ? input.goal : context[key];
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      const stringValue = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : value;
      if (typeof stringValue !== "string" || (!containsPersonalData(stringValue) && !classifyRisk(stringValue))) {
        facts[key] = typeof stringValue === "string" ? stringValue.slice(0, 80) : stringValue;
      }
    }
  }
  if (input.leadTemp) facts.lead_temp = input.leadTemp;
  if (input.priority) facts.prioridade = input.priority;

  const nextTopics = [
    sanitizeMemoryTopic(input.topic),
    ...(previous.lastTopics ?? []),
  ].filter((topic): topic is string => Boolean(topic));
  const uniqueTopics = Array.from(new Set(nextTopics)).slice(0, AI_MEMORY_MAX_TOPICS);
  const preferences = {
    ...(previous.preferences ?? {}),
    ...(input.wantsHuman || input.handoffRecommended ? { wantsHuman: true } : {}),
  };
  const nextMemory: AIMemoryState = {
    facts,
    lastTopics: uniqueTopics,
    preferences: Object.keys(preferences).length ? preferences : undefined,
    lastUpdatedAt: input.nowIso,
  };
  nextMemory.summary = buildAiMemorySummary(nextMemory);
  const compacted =
    (previous.summary?.length ?? 0) > AI_MEMORY_MAX_SUMMARY_CHARS ||
    (previous.lastTopics?.length ?? 0) > AI_MEMORY_MAX_TOPICS ||
    nextTopics.length > AI_MEMORY_MAX_TOPICS;
  const previousJson = JSON.stringify(previous);
  const nextJson = JSON.stringify(nextMemory);
  return { memory: nextMemory, updated: previousJson !== nextJson, compacted };
}

function canSetAiCrmField(context: FlowContext, key: string) {
  const currentOrigin = typeof context.origem_intencao === "string" ? context.origem_intencao : null;
  if (!hasOperationalContextValue(context[key])) return true;
  return currentOrigin === "ai_orchestrator";
}

function hasStrongOperationalContext(context: FlowContext, tags: string[]) {
  const strongKeys = ["intent", "servico", "area", "situacao", "lead_temp", "prioridade"];
  return (
    strongKeys.some((key) => hasOperationalContextValue(context[key])) ||
    tags.some(
      (tag) =>
        typeof tag === "string" &&
        (/^(intent|lead|priority|flow|topic):/.test(tag) || tag === "mensagem_livre")
    )
  );
}

function addUniqueTag(tags: string[], tag: string) {
  if (!tag || tags.includes(tag)) return false;
  tags.push(tag);
  return true;
}

function deriveAiCrmPriority(input: {
  output: ValidatedOrchestratorOutput;
  topic?: string | null;
}): { leadTemp: OrchestratorLeadTemp | null; priority: OrchestratorPriority | null } {
  if (input.output.handoff_recommended) {
    return {
      leadTemp: input.output.lead_temp ?? "quente",
      priority: input.output.priority ?? "alta",
    };
  }
  if (input.output.lead_temp || input.output.priority) {
    return {
      leadTemp: input.output.lead_temp,
      priority: input.output.priority,
    };
  }
  const topic = sanitizeCrmToken(input.topic ?? input.output.intent);
  if (!topic) return { leadTemp: null, priority: null };
  return { leadTemp: "morno", priority: "media" };
}

export function enrichCrmFromOrchestrator(input: AICrmEnrichmentInput): AICrmEnrichmentResult {
  if (input.output.confidence < 0.65) {
    return {
      state: input.state,
      enriched: false,
      skippedReason: "low_confidence",
      changedFields: [],
      addedTags: [],
      priorityUpdated: false,
    };
  }
  const answers = input.state.answers ?? {};
  const currentContext = answers.flowContext ?? {};
  const nextContext: FlowContext = { ...currentContext };
  const currentTags = Array.isArray(answers.flowTags) ? answers.flowTags : [];
  const nextTags = [...currentTags];
  const changedFields: string[] = [];
  const addedTags: string[] = [];
  const currentOrigin =
    typeof currentContext.origem_intencao === "string" ? currentContext.origem_intencao : null;
  const canClaimAiOrigin =
    currentOrigin === "ai_orchestrator" ||
    (!currentOrigin && !hasStrongOperationalContext(currentContext, currentTags));
  const setField = (key: string, value: string | number | boolean | null | undefined) => {
    if (!hasOperationalContextValue(value) || !canSetAiCrmField(currentContext, key)) return;
    nextContext[key] = value as string | number | boolean | null;
    changedFields.push(key);
  };
  const memoryFacts = answers.aiMemory?.facts ?? {};
  const topic = sanitizeCrmToken(input.topic);
  const intent = input.output.intent ?? topic ?? sanitizeCrmToken(memoryFacts.intent);
  const service = intent ?? sanitizeCrmToken(memoryFacts.servico);
  const derivedPriority = deriveAiCrmPriority({ output: input.output, topic });
  if (canClaimAiOrigin) {
    setField("origem_intencao", "ai_orchestrator");
  }
  setField("intent", intent ?? undefined);
  setField("servico", service ?? undefined);
  setField("area", sanitizeCrmToken(memoryFacts.area) ?? undefined);
  setField("situacao", input.output.stage);
  setField("fase", input.output.stage);
  setField("lead_temp", derivedPriority.leadTemp ?? undefined);
  setField("prioridade", derivedPriority.priority ?? undefined);

  const tagCandidates = [
    intent ? `intent:${intent}` : null,
    topic ? `topic:${topic}` : null,
    derivedPriority.leadTemp ? `lead:${derivedPriority.leadTemp}` : null,
    derivedPriority.priority ? `priority:${derivedPriority.priority}` : null,
    ...(input.catalogTags ?? []),
  ].filter((tag): tag is string => Boolean(tag));
  for (const tag of tagCandidates) {
    if (addUniqueTag(nextTags, tag)) addedTags.push(tag);
  }

  if (!changedFields.length && !addedTags.length) {
    return {
      state: input.state,
      enriched: false,
      skippedReason: "no_changes",
      changedFields,
      addedTags,
      priorityUpdated: false,
    };
  }

  return {
    state: {
      ...input.state,
      answers: {
        ...answers,
        flowContext: nextContext,
        flowTags: nextTags,
      },
    },
    enriched: true,
    changedFields,
    addedTags,
    priorityUpdated: changedFields.includes("lead_temp") || changedFields.includes("prioridade"),
  };
}

export function buildAiHandoffCrmArtifacts(
  input: AIHandoffCrmArtifactInput
): AIHandoffCrmArtifacts {
  const answers = input.state.answers ?? {};
  const context = sanitizeFlowContext(answers.flowContext);
  const memory = sanitizeAiMemory(answers.aiMemory);
  const tags = Array.isArray(answers.flowTags) ? answers.flowTags : [];
  const orchestrator = answers.aiOrchestrator;
  const topics = uniqueDisplayValues([
    context.servico,
    context.intent,
    context.area,
    memory?.facts?.servico,
    memory?.facts?.intent,
    memory?.facts?.area,
    ...tags
      .filter((tag) => /^topic:/i.test(tag) || /^intent:/i.test(tag))
      .map((tag) => tag.split(":").slice(1).join(":")),
    ...(memory?.lastTopics ?? []),
  ]);
  const mainTopic = topics[0] ?? null;
  const area = formatCrmDisplayValue(context.area);
  const service = formatCrmDisplayValue(context.servico ?? context.intent);
  const leadTemp = formatCrmDisplayValue(context.lead_temp ?? memory?.facts?.lead_temp);
  const priority = formatCrmDisplayValue(context.prioridade ?? context.priority);
  const memorySummary = sanitizeCrmSummaryForDisplay(memory?.summary);
  const missingInfo = uniqueDisplayValues(
    (orchestrator?.missingInformation ?? []).filter((item) =>
      isMissingInformationRelevantToTopic(item, mainTopic)
    ),
    3
  );
  const handoffReason =
    input.reason === "active_prompt_handoff_confirmation" ||
    input.reason === "pending_offer_handoff"
      ? "cliente confirmou que deseja atendimento com a equipe"
      : "encaminhamento recomendado pela IA controlada";
  const summaryLines = [
    "[Resumo automático]",
    "Resumo do atendimento",
    "---------------------",
    "Origem: IA controlada",
    `Encaminhamento: ${handoffReason}`,
    mainTopic ? `Tema principal: ${mainTopic}` : null,
    area ? `Área: ${area}` : null,
    service ? `Serviço/interesse: ${service}` : null,
    leadTemp ? `Temperatura: ${leadTemp}` : null,
    priority ? `Prioridade: ${priority}` : null,
    topics.length > 1 ? `Tópicos recentes: ${topics.join(", ")}` : null,
    memorySummary ? `Contexto resumido: ${memorySummary}` : null,
    missingInfo.length ? `Pontos a confirmar: ${missingInfo.join(", ")}` : null,
    typeof input.score === "number" ? `Score de encaminhamento: ${input.score}` : null,
    "Próximo passo: revisar o contexto e conduzir o atendimento humano sem pedir dados sensíveis no primeiro contato.",
  ].filter((line): line is string => Boolean(line));

  const topicText = mainTopic ? ` sobre ${mainTopic}` : "";
  const firstQuestion = missingInfo[0]
    ? `Para começar, posso confirmar ${missingInfo[0]} e entender o melhor próximo passo.`
    : "Para começar, vou confirmar o objetivo do atendimento e orientar os próximos passos.";
  const suggestedReply = [
    "[Sugestão de resposta]",
    `Olá, tudo bem? Vi que você pediu atendimento com a equipe${topicText}. Vou revisar o contexto que já foi informado e te orientar com segurança.`,
    firstQuestion,
  ].join("\n");

  return {
    summaryNote: summaryLines.join("\n"),
    suggestedReplyNote: suggestedReply,
  };
}

function buildBusinessContext(params: ControlledAssistantInput) {
  const context = sanitizeFlowContext(params.state.answers?.flowContext);
  const memory = sanitizeAiMemory(params.state.answers?.aiMemory);
  const memoryForPrompt = memory
    ? {
        summary: memory.summary,
        facts: memory.facts,
        lastTopics: memory.lastTopics,
      }
    : null;
  return [
    `Tenant: ${params.tenant.name}`,
    `Idioma: ${params.tenant.defaultLanguage ?? "pt_BR"}`,
    `Contexto aprovado do tenant: ${params.tenant.aiBusinessContext ?? "nao informado"}`,
    params.tenant.aiAssistantSystemPrompt
      ? `Instrucao adicional aprovada: ${params.tenant.aiAssistantSystemPrompt}`
      : null,
    `Contexto categórico: ${JSON.stringify(context)}`,
    memoryForPrompt ? `Memória operacional resumida: ${JSON.stringify(memoryForPrompt)}` : null,
    "Regras: responda apenas dúvidas gerais e educativas dentro do contexto aprovado do tenant. Não dê orientação profissional individualizada, não analise caso concreto, não prometa resultado, não solicite dados sensíveis e encaminhe dúvidas específicas para atendimento humano.",
    "Formato obrigatório: retorne apenas JSON válido, sem markdown, no schema {\"reply\":\"...\",\"intent\":null,\"stage\":\"triage\",\"goal\":\"explain_general_topic\",\"confidence\":0.8,\"missing_information\":[],\"next_action\":\"answer\",\"next_question\":null,\"handoff_recommended\":false,\"lead_temp\":null,\"priority\":null}.",
    "Ações permitidas: answer, ask_question, fallback_menu e no_reply. handoff_recommend e handoff_force são apenas informativos e não ativam atendimento humano.",
    `Finalize exatamente com: ${REQUIRED_SUFFIX}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function sanitizeReply(text: string) {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("{") || trimmed.startsWith("[") || trimmed.includes('{"reply"')) {
    return "";
  }
  const forbidden = [
    "você tem direito",
    "voce tem direito",
    "garanto",
    "causa ganha",
    "resultado garantido",
  ];
  const normalized = normalizeText(trimmed);
  if (forbidden.some((term) => normalized.includes(normalizeText(term)))) {
    return "";
  }
  const withoutSuffix = trimmed.replace(REQUIRED_SUFFIX, "").trim();
  return `${withoutSuffix.slice(0, 620)}\n\n${REQUIRED_SUFFIX}`.trim();
}

function sanitizeQuestion(text: string | null | undefined) {
  const trimmed = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.length > ORCHESTRATOR_MAX_QUESTION_CHARS) return "";
  if (containsPersonalData(trimmed)) return "";
  if (classifyRisk(trimmed)) return "";
  const questionCount = (trimmed.match(/\?/g) ?? []).length;
  if (questionCount > 1) return "";
  const normalized = normalizeText(trimmed);
  const forbidden = [
    "voce tem direito",
    "você tem direito",
    "garanto",
    "resultado garantido",
    "causa ganha",
    "cpf",
    "documento",
    "rg",
    "envie seu cpf",
    "mande seu cpf",
    "envie documento",
    "mande documento",
  ];
  if (forbidden.some((term) => normalized.includes(normalizeText(term)))) return "";
  return trimmed;
}

function sanitizeShortString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function sanitizeCrmToken(value: unknown, maxLength = 80) {
  const raw = sanitizeShortString(value, maxLength);
  if (!raw || containsPersonalData(raw) || classifyRisk(raw)) return null;
  return normalizeText(raw).replace(/[^a-z0-9_ -]/g, "").trim().replace(/\s+/g, "_").slice(0, maxLength) || null;
}

function sanitizeCrmTag(value: unknown, maxLength = 80) {
  const raw = sanitizeShortString(value, maxLength);
  if (!raw || containsPersonalData(raw) || classifyRisk(raw)) return null;
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_:-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, maxLength) || null;
}

function formatCrmDisplayValue(value: unknown) {
  const token = sanitizeCrmToken(value, 80);
  if (!token) return null;
  const normalized = token
    .replace(/^(intent|topic|lead|priority|servico|service|area):/i, "")
    .replace(/^(intent|topic|lead|priority|servico|service|area)_/i, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;
  const blocked = new Set([
    "active prompt handoff confirmation",
    "pending offer handoff",
    "handoff confirmation",
    "handoff request",
    "ask question",
    "answer",
    "fallback menu",
    "no reply",
    "contextual continue",
    "explain general topic",
    "identify need",
    "triage",
    "qualification",
    "clarification",
    "waiting user",
    "handoff recommended",
  ]);
  if (blocked.has(normalized)) return null;
  if (/^\d{4}$/.test(normalized)) return null;
  if (["homem", "mulher", "masculino", "feminino"].includes(normalized)) return null;
  return normalized.slice(0, 80);
}

function uniqueDisplayValues(values: unknown[], maxItems = 4) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const label = formatCrmDisplayValue(value);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    result.push(label);
    if (result.length >= maxItems) break;
  }
  return result;
}

function sanitizeCrmSummaryForDisplay(value: unknown) {
  const summary = sanitizeShortString(value, 300);
  if (!summary) return null;
  const normalized = normalizeText(summary);
  const technicalFragments = [
    "handoff request",
    "handoff_request",
    "active prompt",
    "active_prompt",
    "pending offer",
    "pending_offer",
    "handoff recommended",
    "handoff_recommended",
    "ask question",
    "ask_question",
    "explain general topic",
    "explain_general_topic",
  ];
  if (technicalFragments.some((fragment) => normalized.includes(normalizeText(fragment)))) {
    return null;
  }
  return summary;
}

function isMissingInformationRelevantToTopic(value: unknown, mainTopic: string | null) {
  const label = formatCrmDisplayValue(value);
  if (!label) return false;
  if (!mainTopic) return true;
  const labelTokens = topicTokens(label);
  const topicTokenSet = new Set(topicTokens(mainTopic));
  if (!labelTokens.length || !topicTokenSet.size) return true;
  return labelTokens.some((token) =>
    Array.from(topicTokenSet).some((topicToken) => topicTokenMatches(token, topicToken))
  );
}

function hasOperationalContextValue(value: unknown) {
  return (
    (typeof value === "string" && value.trim().length > 0) ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => sanitizeShortString(item, 80))
    .filter((item): item is string => Boolean(item))
    .slice(0, ORCHESTRATOR_MAX_LIST_ITEMS);
}

function countRepeatedMissingInformation(current: string[], previous: string[] | null | undefined) {
  if (!current.length || !previous?.length) return 0;
  const previousSet = new Set(previous.map((item) => normalizeText(item)));
  return current.filter((item) => previousSet.has(normalizeText(item))).length;
}

export function calculateHandoffScore(
  input: HandoffScoreInput,
  threshold = ORCHESTRATOR_HANDOFF_THRESHOLD
): HandoffScoreResult {
  const reasons: string[] = [];
  let score = 0;
  const output = input.output;
  const explicitHumanRequest =
    input.explicitHumanRequest === true ||
    output?.next_action === "handoff_recommend" ||
    output?.next_action === "handoff_force";

  if (explicitHumanRequest) {
    score += 3;
    reasons.push("explicit_human_request");
  }

  if (
    input.guardrailRisk === "legal_specific_case" ||
    input.guardrailRisk === "document_analysis" ||
    input.guardrailRisk === "benefit_amount" ||
    input.guardrailRisk === "outcome_prediction"
  ) {
    score += 3;
    reasons.push(`guardrail_${input.guardrailRisk}`);
  }

  if (output?.lead_temp === "quente") {
    score += 2;
    reasons.push("lead_hot");
  }

  if (output?.priority === "alta") {
    score += 2;
    reasons.push("priority_high");
  }

  if (typeof output?.confidence === "number") {
    if (output.confidence < 0.45) {
      score += 2;
      reasons.push("confidence_below_045");
    } else if (output.confidence < 0.6) {
      score += 1;
      reasons.push("confidence_below_060");
    }
  }

  if (input.assistantLimitReached) {
    score += 1;
    reasons.push("assistant_limit_reached");
  }

  if (
    countRepeatedMissingInformation(
      output?.missing_information ?? [],
      input.previousMissingInformation
    ) > 0
  ) {
    score += 1;
    reasons.push("missing_information_repeated");
  }

  return {
    score,
    allowed: score >= threshold,
    threshold,
    reasons,
    primaryReason: reasons[0] ?? null,
  };
}

export function canEvaluateHandoffRecommendation(
  input: HandoffRecommendationEligibilityInput
): HandoffRecommendationEligibility {
  if (input.duplicateMessage) return { ok: false, reason: "duplicate_message" };
  if (input.windowOpen === false) return { ok: false, reason: "window_closed" };
  if (!input.tenantAiEnabled) return { ok: false, reason: "tenant_ai_disabled" };
  if (!input.tenantFallbackToHandoff) {
    return { ok: false, reason: "tenant_handoff_fallback_disabled" };
  }
  if (input.state.mode === "HUMAN") return { ok: false, reason: "human_mode" };
  if (input.state.handoff.status === "active" || input.state.handoff.status === "pending") {
    return { ok: false, reason: "handoff_active" };
  }
  if (input.state.chatbotActive || input.state.chatbotNodeId) {
    return { ok: false, reason: "flow_active" };
  }
  return { ok: true };
}

export function shouldSendHandoffConfirmationPrompt(input: {
  allowed: boolean;
  state: ConversationState;
  messageId: string;
}) {
  if (!input.allowed) return false;
  if (input.state.mode === "HUMAN") return false;
  if (input.state.handoff.status !== "none") return false;
  const prompt = input.state.answers?.aiOrchestrator?.handoffPrompt;
  if (!prompt?.awaitingConfirmation) return true;
  return prompt.messageId !== input.messageId && prompt.awaitingConfirmation !== true;
}

function parseMaybeJsonObject(text: string): RawOrchestratorOutput | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as RawOrchestratorOutput)
      : null;
  } catch {
    return null;
  }
}

export function validateOrchestratorOutput(
  raw: RawOrchestratorOutput,
  fallbackReply?: string
): { ok: true; output: ValidatedOrchestratorOutput } | { ok: false; reason: string } {
  const reply = sanitizeReply(
    sanitizeShortString(raw.reply, ORCHESTRATOR_MAX_REPLY_CHARS) ?? fallbackReply ?? ""
  );
  if (!reply) return { ok: false, reason: "invalid_reply" };

  const stage =
    typeof raw.stage === "string" &&
    CONVERSATION_STAGE_ALLOWLIST.includes(raw.stage as ConversationStage)
      ? (raw.stage as ConversationStage)
      : null;
  if (!stage) return { ok: false, reason: "invalid_stage" };

  const nextAction =
    typeof raw.next_action === "string" &&
    ORCHESTRATOR_NEXT_ACTION_ALLOWLIST.includes(raw.next_action as OrchestratorNextAction)
      ? (raw.next_action as OrchestratorNextAction)
      : null;
  if (!nextAction) return { ok: false, reason: "invalid_next_action" };

  const confidence = typeof raw.confidence === "number" ? raw.confidence : Number.NaN;
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return { ok: false, reason: "invalid_confidence" };
  }

  const goal =
    typeof raw.goal === "string" && raw.goal.trim()
      ? ORCHESTRATOR_GOAL_ALLOWLIST.includes(raw.goal as ConversationGoal)
        ? (raw.goal as ConversationGoal)
        : raw.goal.trim().slice(0, 60)
      : null;
  const leadTemp =
    raw.lead_temp === "quente" || raw.lead_temp === "morno" || raw.lead_temp === "frio"
      ? raw.lead_temp
      : null;
  const priority =
    raw.priority === "alta" || raw.priority === "media" || raw.priority === "baixa"
      ? raw.priority
      : null;

  return {
    ok: true,
    output: {
      reply,
      intent: sanitizeCrmToken(raw.intent, 80),
      stage,
      goal,
      confidence,
      missing_information: normalizeStringList(raw.missing_information),
      next_action: nextAction,
      next_question:
        sanitizeQuestion(sanitizeShortString(raw.next_question, ORCHESTRATOR_MAX_QUESTION_CHARS)) ||
        null,
      handoff_recommended: raw.handoff_recommended === true,
      lead_temp: leadTemp,
      priority,
    },
  };
}

export function resolveOrchestratorAction(
  output: ValidatedOrchestratorOutput,
  fallbackMenuText: string
): ResolvedOrchestratorAction {
  if (output.next_action === "no_reply") {
    return {
      shouldSend: false,
      action: "no_reply",
      reason: "orchestrator_no_reply",
      lastQuestion: null,
    };
  }
  if (output.next_action === "ask_question") {
    const question = sanitizeQuestion(output.next_question);
    if (question) {
      return {
        shouldSend: true,
        action: "ask_question",
        text: question,
        lastQuestion: question,
      };
    }
    return {
      shouldSend: true,
      action: "answer",
      text: output.reply,
      lastQuestion: null,
    };
  }
  if (output.next_action === "fallback_menu") {
    return {
      shouldSend: true,
      action: "fallback_menu",
      text: sanitizeReply(fallbackMenuText) || output.reply,
      lastQuestion: null,
    };
  }
  if (output.next_action === "handoff_recommend" || output.next_action === "handoff_force") {
    return {
      shouldSend: true,
      action:
        output.next_action === "handoff_recommend"
          ? "handoff_recommend_ignored"
          : "handoff_force_ignored",
      text: output.reply,
      lastQuestion: null,
      ignoredAction: output.next_action,
    };
  }
  return {
    shouldSend: true,
    action: "answer",
    text: output.reply,
    lastQuestion: null,
  };
}

function buildLegacyOrchestratorOutput(reply: string): RawOrchestratorOutput {
  return {
    reply,
    intent: null,
    stage: "triage",
    goal: "explain_general_topic",
    confidence: 0.7,
    missing_information: [],
    next_action: "answer",
    next_question: null,
    handoff_recommended: false,
    lead_temp: null,
    priority: null,
  };
}

export async function generateControlledAssistantReply(
  input: ControlledAssistantInput
): Promise<ControlledAssistantResult> {
  const educationalIntent =
    input.preclassifiedEducationalIntent?.allowed === true
      ? input.preclassifiedEducationalIntent
      : classifyEducationalIntent(input.text, {
          allowedTopics: input.tenant.aiAssistantAllowedTopics,
          blockedTerms: input.tenant.aiAssistantBlockedTerms,
        });
  if (!educationalIntent.allowed) {
    return { ok: false, reason: educationalIntent.reason ?? "educational_intent_blocked" };
  }
  const aiReply = await input.brain.generateReply({
    waId: input.state.waId,
    intent: input.state.intent ?? "unknown",
    lastMessages: [],
    inboundText: input.text.trim().slice(0, AI_ASSISTANT_MAX_INPUT_CHARS),
    nowIso: input.nowIso,
    businessContext: buildBusinessContext(input),
    stateSummary: {
      flow: input.state.flow,
      flowStep: input.state.flowStep,
      answers: sanitizeFlowContext(input.state.answers?.flowContext),
    },
  });
  const parsedOutput = parseMaybeJsonObject(aiReply.text);
  if (!parsedOutput && aiReply.text.trim().startsWith("{")) {
    return { ok: false, reason: "invalid_json_output" };
  }
  const validation = validateOrchestratorOutput(
    parsedOutput ?? buildLegacyOrchestratorOutput(aiReply.text),
    aiReply.text
  );
  if (!validation.ok) {
    return { ok: false, reason: validation.reason };
  }
  return {
    ok: true,
    text: validation.output.reply,
    output: validation.output,
    model: aiReply.model,
    usage: aiReply.usage,
  };
}
