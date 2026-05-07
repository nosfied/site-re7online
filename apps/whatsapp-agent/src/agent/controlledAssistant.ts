import { TenantConfig } from "../config/tenantConfig.js";
import { ConversationState, FlowContext } from "../conversation/conversation.types.js";
import { AgentBrain } from "./agent.types.js";

export type AiAssistantProfile = "business" | "government" | "legal_previdenciario";

export type ControlledAssistantInput = {
  brain: AgentBrain;
  text: string;
  tenant: Pick<
    TenantConfig,
    | "name"
    | "defaultLanguage"
    | "aiBusinessContext"
    | "aiAssistantProfile"
    | "aiAssistantSystemPrompt"
  >;
  clientProfile?: string | null;
  state: ConversationState;
  nowIso: string;
};

export type ControlledAssistantResult =
  | { ok: true; text: string; model?: string; usage?: unknown }
  | { ok: false; reason: string };

const SIMPLE_QUESTION_STARTERS = [
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

const SIMPLE_TOPIC_TERMS = [
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

const BLOCKED_TERMS = [
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

export function isSimpleQuestion(text: string | null | undefined) {
  const raw = String(text ?? "").trim();
  const normalized = normalizeText(raw);
  if (!normalized) return false;
  if (raw.length > 220) return false;
  if (containsPersonalData(raw)) return false;
  if (BLOCKED_TERMS.some((term) => normalized.includes(normalizeText(term)))) {
    return false;
  }
  const startsLikeQuestion = SIMPLE_QUESTION_STARTERS.some((term) =>
    normalized.startsWith(normalizeText(term))
  );
  const hasTopic = SIMPLE_TOPIC_TERMS.some((term) => normalized.includes(normalizeText(term)));
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
  const profile = params.tenant.aiAssistantProfile ?? params.clientProfile ?? "business";
  const context = sanitizeFlowContext(params.state.answers?.flowContext);
  return [
    `Tenant: ${params.tenant.name}`,
    `Idioma: ${params.tenant.defaultLanguage ?? "pt_BR"}`,
    `Perfil: ${profile}`,
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
  if (!isSimpleQuestion(input.text)) {
    return { ok: false, reason: "not_simple_question" };
  }
  const aiReply = await input.brain.generateReply({
    waId: input.state.waId,
    intent: input.state.intent ?? "unknown",
    lastMessages: [],
    inboundText: input.text.trim().slice(0, 220),
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
