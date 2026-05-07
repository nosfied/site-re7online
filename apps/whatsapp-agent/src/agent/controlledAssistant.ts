import { TenantConfig } from "../config/tenantConfig.js";
import { ConversationState, FlowContext } from "../conversation/conversation.types.js";
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
  >;
  state: ConversationState;
  nowIso: string;
};

export type ControlledAssistantResult =
  | { ok: true; text: string; model?: string; usage?: unknown }
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
};

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

export const AI_ASSISTANT_GLOBAL_TOPIC_TERMS = [
  "bpc",
  "loas",
  "aposentadoria",
  "beneficio",
  "beneficio assistencial",
  "pensao",
  "inss",
  "revisao",
  "contribuicao",
  "contribuir",
  "contribui",
  "demora",
];

export const AI_ASSISTANT_GLOBAL_BLOCKED_TERMS = [
  "tenho direito",
  "tenho chance",
  "meu caso",
  "meu processo",
  "meu recurso",
  "meu documento",
  "analise",
  "analisar",
  "posso processar",
  "vou ganhar",
  "caso ganha",
  "quanto vou receber",
  "valor vou receber",
  "calcule",
  "calcular",
  "laudo",
  "diagnostico",
  "doenca",
  "cid",
];

const SAFE_CONTEXT_KEYS = [
  "area",
  "servico",
  "intent",
  "prioridade",
  "lead_temp",
  "origem_intencao",
] as const;

const REQUIRED_SUFFIX = "Se quiser, posso te orientar melhor conforme sua situação.";
export const AI_ASSISTANT_MAX_INPUT_CHARS = 220;

type SimpleQuestionOptions = {
  allowedTopics?: string[] | null;
  blockedTerms?: string[] | null;
};

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
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

function isLegalLikeContext(context: AssistantTenantContext) {
  const flowContext = context.flowContext ?? {};
  const summary = [
    context.tenantName,
    context.aiBusinessContext,
    flowContext.area,
    flowContext.servico,
    flowContext.intent,
    ...(context.flowTags ?? []),
  ]
    .filter((value) => typeof value === "string" || typeof value === "number")
    .join(" ");
  const normalized = normalizeText(summary);
  return containsAnyTerm(normalized, [
    "juridico",
    "advocacia",
    "previdenciario",
    "inss",
    "bpc",
    "loas",
    "aposentadoria",
    "beneficio",
    "pensao",
  ]);
}

export function buildSafeResponse(risk: GuardrailRisk, tenantContext: AssistantTenantContext) {
  const legalLike = isLegalLikeContext(tenantContext);
  if (risk === "personal_data") {
    return [
      "Para sua segurança, não envie CPF, documentos, telefone, e-mail ou outros dados pessoais por aqui sem necessidade.",
      legalLike
        ? "Posso te explicar o tema de forma geral, sem analisar dados individuais."
        : "Posso te explicar o assunto de forma geral, sem analisar informações pessoais.",
      REQUIRED_SUFFIX,
    ].join("\n\n");
  }
  if (risk === "fraud_or_illicit") {
    return [
      "Não posso orientar sobre fraude, falsificação, omissão de informações ou qualquer procedimento irregular.",
      legalLike
        ? "Posso explicar caminhos regulares e seguros para buscar orientação sobre o tema."
        : "Posso explicar alternativas regulares e seguras para seguir com o atendimento.",
      REQUIRED_SUFFIX,
    ].join("\n\n");
  }
  if (legalLike) {
    const detail =
      risk === "benefit_amount"
        ? "Não posso calcular ou estimar valores sem análise individual e documentação adequada."
        : risk === "outcome_prediction"
          ? "Não posso prever resultado ou afirmar chance de êxito sem análise individual do caso."
          : risk === "document_analysis"
            ? "Não posso analisar laudos, documentos, exames ou diagnósticos por aqui."
            : "Não posso afirmar isso sem uma análise individual do caso.";
    return [
      detail,
      "Posso te explicar de forma geral como esse tema funciona e, se preferir, te direcionar para um especialista.",
      REQUIRED_SUFFIX,
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
    REQUIRED_SUFFIX,
  ].join("\n\n");
}

export function isSimpleQuestion(
  text: string | null | undefined,
  options: SimpleQuestionOptions = {}
) {
  const raw = String(text ?? "").trim();
  const normalized = normalizeText(raw);
  if (!normalized) return false;
  if (raw.length > AI_ASSISTANT_MAX_INPUT_CHARS) return false;
  if (containsPersonalData(raw)) return false;
  const blockedTerms = [
    ...AI_ASSISTANT_GLOBAL_BLOCKED_TERMS,
    ...normalizeTermList(options.blockedTerms),
  ];
  if (blockedTerms.some((term) => normalized.includes(normalizeText(term)))) {
    return false;
  }
  const startsLikeQuestion = AI_ASSISTANT_SIMPLE_QUESTION_STARTERS.some((term) =>
    normalized.startsWith(normalizeText(term))
  );
  const topicTerms = [
    ...AI_ASSISTANT_GLOBAL_TOPIC_TERMS,
    ...normalizeTermList(options.allowedTopics),
  ];
  const hasTopic = topicTerms.some((term) => normalized.includes(normalizeText(term)));
  return startsLikeQuestion && hasTopic;
}

export function getAiAssistantState(state: ConversationState) {
  const answers = state.answers ?? {};
  const current = answers.aiAssistant;
  if (!current || typeof current !== "object" || Array.isArray(current)) {
    return { count: 0, lastRespondedAt: null, lastMessageId: null };
  }
  const record = current as Record<string, unknown>;
  return {
    count: typeof record.count === "number" && Number.isFinite(record.count) ? record.count : 0,
    lastRespondedAt:
      typeof record.lastRespondedAt === "string" ? record.lastRespondedAt : null,
    lastMessageId: typeof record.lastMessageId === "string" ? record.lastMessageId : null,
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

function buildBusinessContext(params: ControlledAssistantInput) {
  const context = sanitizeFlowContext(params.state.answers?.flowContext);
  return [
    `Tenant: ${params.tenant.name}`,
    `Idioma: ${params.tenant.defaultLanguage ?? "pt_BR"}`,
    `Contexto aprovado do tenant: ${params.tenant.aiBusinessContext ?? "nao informado"}`,
    params.tenant.aiAssistantSystemPrompt
      ? `Instrucao adicional aprovada: ${params.tenant.aiAssistantSystemPrompt}`
      : null,
    `Contexto categórico: ${JSON.stringify(context)}`,
    "Regras: responda apenas dúvidas gerais e educativas. Não dê parecer jurídico, não analise caso concreto, não prometa resultado, não solicite dados sensíveis e encaminhe dúvidas específicas para atendimento humano.",
    `Finalize exatamente com: ${REQUIRED_SUFFIX}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function sanitizeReply(text: string) {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
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

export async function generateControlledAssistantReply(
  input: ControlledAssistantInput
): Promise<ControlledAssistantResult> {
  if (
    !isSimpleQuestion(input.text, {
      allowedTopics: input.tenant.aiAssistantAllowedTopics,
      blockedTerms: input.tenant.aiAssistantBlockedTerms,
    })
  ) {
    return { ok: false, reason: "not_simple_question" };
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
  const text = sanitizeReply(aiReply.text);
  if (!text) {
    return { ok: false, reason: "empty_or_unsafe_reply" };
  }
  return { ok: true, text, model: aiReply.model, usage: aiReply.usage };
}
