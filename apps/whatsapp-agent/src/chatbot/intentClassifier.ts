import { FlowContext } from "../conversation/conversation.types.js";

export type FlowIntent =
  | "beneficio_cortado_suspenso"
  | "beneficio_negado"
  | "bpc_loas"
  | "pensao_por_morte"
  | "revisao_beneficio"
  | "aposentadoria"
  | "atendimento_humano";

export type FlowIntentClassifierResult = {
  intent: FlowIntent;
  targetNode: string;
  confidence: number;
  score: number;
  matchedTerms: string[];
  context: FlowContext;
  tags: string[];
  conflictedIntents: FlowIntent[];
};

const INTENT_PRIORITY: FlowIntent[] = [
  "beneficio_cortado_suspenso",
  "beneficio_negado",
  "bpc_loas",
  "pensao_por_morte",
  "revisao_beneficio",
  "aposentadoria",
  "atendimento_humano",
];

const INTENT_TARGET_NODE: Record<FlowIntent, string> = {
  aposentadoria: "aposentadoria_idade",
  bpc_loas: "bpc_tipo",
  beneficio_negado: "negado_beneficio",
  beneficio_cortado_suspenso: "cortado_beneficio",
  revisao_beneficio: "revisao_beneficio",
  pensao_por_morte: "pensao_situacao",
  atendimento_humano: "handoff_direto",
};

const INTENT_TERMS: Record<FlowIntent, string[]> = {
  beneficio_cortado_suspenso: [
    "cortado",
    "suspenso",
    "cancelado",
    "cessado",
    "parou de pagar",
    "bloquearam meu beneficio",
    "beneficio cessado",
  ],
  beneficio_negado: [
    "negado",
    "negada",
    "indeferido",
    "recusado",
    "nao aprovou",
    "beneficio negado",
    "inss negou",
    "pedido negado",
    "pedido negada",
  ],
  bpc_loas: [
    "bpc",
    "loas",
    "beneficio assistencial",
    "idoso 65",
    "deficiencia",
    "autista",
    "autismo",
    "crianca especial",
    "filho autista",
  ],
  pensao_por_morte: [
    "pensao por morte",
    "pensao",
    "morte",
    "falecimento",
    "falecido",
    "viuva",
    "viuvo",
  ],
  revisao_beneficio: [
    "revisao",
    "revisar",
    "valor errado",
    "recebo pouco",
    "beneficio baixo",
    "corrigir beneficio",
    "aumentar aposentadoria",
  ],
  aposentadoria: [
    "aposentar",
    "aposentadoria",
    "tempo de contribuicao",
    "idade para aposentar",
    "me aposentar",
    "inss aposentadoria",
  ],
  atendimento_humano: [
    "atendente",
    "humano",
    "falar com alguem",
    "advogado",
    "falar com advogado",
    "atendimento",
  ],
};

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildIntentTags(intent: FlowIntent) {
  return Array.from(new Set(["previdenciario", intent, "mensagem_livre"]));
}

export function classifyFreeTextFlowIntent(
  text: string | null | undefined
): FlowIntentClassifierResult | null {
  const normalized = normalizeText(text);
  if (!normalized) return null;

  const matches = INTENT_PRIORITY.map((intent) => {
    const matchedTerms = INTENT_TERMS[intent].filter((term) =>
      normalized.includes(normalizeText(term))
    );
    return {
      intent,
      matchedTerms,
      score: matchedTerms.length,
    };
  }).filter((item) => item.score > 0);

  if (matches.length === 0) return null;

  const selected = INTENT_PRIORITY.map((intent) =>
    matches.find((item) => item.intent === intent)
  ).find(Boolean);
  if (!selected) return null;

  const conflictedIntents = matches
    .map((item) => item.intent)
    .filter((intent) => intent !== selected.intent);

  return {
    intent: selected.intent,
    targetNode: INTENT_TARGET_NODE[selected.intent],
    confidence: selected.score >= 2 ? 0.9 : 0.75,
    score: selected.score,
    matchedTerms: selected.matchedTerms,
    context: {
      intent: selected.intent,
      origem_intencao: "mensagem_livre",
    },
    tags: buildIntentTags(selected.intent),
    conflictedIntents,
  };
}

export function applyFlowIntentClassificationToContext(params: {
  currentContext?: FlowContext | null;
  currentTags?: string[] | null;
  classification: FlowIntentClassifierResult;
}) {
  const currentContext = params.currentContext ?? {};
  const currentTags = params.currentTags ?? [];
  return {
    flowContext: {
      ...params.classification.context,
      ...currentContext,
    },
    flowTags: Array.from(new Set([...currentTags, ...params.classification.tags])),
  };
}
