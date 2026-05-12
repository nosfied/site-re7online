import type { AIQualificationState } from "../conversation/conversation.types.js";
import type { AiQualificationSchema, AiQualificationSlot } from "./qualification.js";

export const SEMANTIC_QUALIFICATION_ACCEPT_CONFIDENCE = 0.85;
export const SEMANTIC_QUALIFICATION_CONFIRM_CONFIDENCE = 0.6;

export type SemanticQualificationResolution = {
  intent:
    | "answer_slot"
    | "handoff_request"
    | "negative"
    | "affirmative"
    | "ambiguous"
    | "out_of_scope"
    | "unknown";
  slotKey?: string | null;
  normalizedValue?: string | null;
  confidence?: number;
  shouldAskClarification?: boolean;
  clarificationReason?: string | null;
  matchedAllowedValue?: string | null;
  safeReply?: string | null;
};

type ResolveSemanticQualificationParams = {
  text: string;
  currentSlot?: AiQualificationSlot | null;
  schema?: AiQualificationSchema | null;
  state?: AIQualificationState | null;
  handoffKeywords?: string[];
};

const POSITIVE_ONLY = new Set(["sim", "quero", "sim quero", "pode", "pode sim", "ok", "claro"]);
const NEGATIVE_PHRASES = [
  "nao quero",
  "não quero",
  "nao precisa",
  "não precisa",
  "agora nao",
  "agora não",
  "depois",
  "cancelar",
  "encerrar",
  "parar",
];
const HANDOFF_PHRASES = [
  "humano",
  "atendente",
  "atendimento humano",
  "pessoa da equipe",
  "falar com alguem",
  "falar com alguém",
  "falar com atendente",
  "me chama",
];
const AMBIGUOUS_SHORT_TERMS = new Set(["sim", "quero", "pode", "ok", "claro"]);

function normalizeDisplay(input: unknown, maxLength = 180) {
  return typeof input === "string" ? input.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

function normalizeText(input: unknown) {
  return normalizeDisplay(input, 240)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(input: unknown) {
  return normalizeText(input).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function containsTerm(text: string, term: string) {
  const normalizedTerm = normalizeText(term);
  if (!text || !normalizedTerm) return false;
  return (
    text === normalizedTerm ||
    text.includes(` ${normalizedTerm} `) ||
    text.startsWith(`${normalizedTerm} `) ||
    text.endsWith(` ${normalizedTerm}`)
  );
}

function containsAny(text: string, terms: string[]) {
  return terms.some((term) => containsTerm(text, term));
}

function isNegative(text: string) {
  return containsAny(text, NEGATIVE_PHRASES);
}

function isHandoffRequest(text: string, handoffKeywords: string[] = []) {
  return containsAny(text, [...handoffKeywords, ...HANDOFF_PHRASES]);
}

function confidenceForMatch(text: string, term: string, base: number) {
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return 0;
  if (text === normalizedTerm) return Math.min(0.98, base + 0.12);
  if (containsTerm(text, normalizedTerm)) return base;
  return 0;
}

function findEnumMatch(slot: AiQualificationSlot, text: string) {
  let best: { value: string; confidence: number; source: "allowed" | "hint" | "semantic" } | null = null;
  for (const allowedValue of slot.allowedValues ?? []) {
    const allowedConfidence = confidenceForMatch(text, allowedValue, 0.92);
    if (allowedConfidence > (best?.confidence ?? 0)) {
      best = { value: allowedValue, confidence: allowedConfidence, source: "allowed" };
    }
    const aliases = slot.semanticAliases?.[allowedValue] ?? [];
    for (const alias of aliases) {
      const aliasConfidence = confidenceForMatch(text, alias, 0.86);
      if (aliasConfidence > (best?.confidence ?? 0)) {
        best = { value: allowedValue, confidence: aliasConfidence, source: "semantic" };
      }
    }
  }
  for (const hint of slot.captureHints ?? []) {
    const hintConfidence = confidenceForMatch(text, hint, 0.86);
    if (hintConfidence > (best?.confidence ?? 0)) {
      const allowedValue =
        slot.allowedValues?.find((item) => normalizeKey(item) === normalizeKey(hint)) ?? hint;
      best = { value: allowedValue, confidence: hintConfidence, source: "hint" };
    }
  }
  return best;
}

function usefulTextConfidence(text: string) {
  if (!text || text.length < 2 || text.length > 180) return 0;
  if (POSITIVE_ONLY.has(text) || isNegative(text)) return 0;
  const words = text.split(/\s+/g).filter(Boolean);
  if (words.length >= 3) return 0.9;
  if (words.length === 2) return 0.86;
  return 0.72;
}

function applicableUncompletedSlots(schema: AiQualificationSchema, state?: AIQualificationState | null) {
  const completed = new Set(state?.completedSlots ?? []);
  return (schema.slots ?? []).filter((slot) => !completed.has(slot.key));
}

export function resolveSemanticQualification(
  params: ResolveSemanticQualificationParams
): SemanticQualificationResolution {
  const normalized = normalizeText(params.text);
  if (!normalized) {
    return { intent: "unknown", confidence: 0, shouldAskClarification: true };
  }
  if (isNegative(normalized)) {
    return { intent: "negative", confidence: 0.96 };
  }
  if (isHandoffRequest(normalized, params.handoffKeywords)) {
    return { intent: "handoff_request", confidence: 0.95 };
  }
  if (POSITIVE_ONLY.has(normalized)) {
    if (params.currentSlot?.type === "enum") {
      return {
        intent: "ambiguous",
        slotKey: params.currentSlot.key,
        confidence: 0.9,
        shouldAskClarification: true,
        clarificationReason: "positive_ack_for_enum",
        safeReply: params.currentSlot.question,
      };
    }
    return { intent: "affirmative", confidence: 0.88 };
  }

  const schema = params.schema;
  const currentSlot = params.currentSlot ?? null;
  const slotCandidates = [
    ...(currentSlot ? [currentSlot] : []),
    ...(schema ? applicableUncompletedSlots(schema, params.state).filter((slot) => slot.key !== currentSlot?.key) : []),
  ];

  for (const slot of slotCandidates) {
    if (slot.type === "enum") {
      const match = findEnumMatch(slot, normalized);
      if (match) {
        return {
          intent: "answer_slot",
          slotKey: slot.key,
          normalizedValue: match.value,
          matchedAllowedValue: slot.allowedValues?.includes(match.value) ? match.value : null,
          confidence: match.confidence,
        };
      }
    }
  }

  if (currentSlot && currentSlot.type !== "enum" && currentSlot.type !== "boolean") {
    const confidence = usefulTextConfidence(normalized);
    if (confidence > 0) {
      return {
        intent: "answer_slot",
        slotKey: currentSlot.key,
        normalizedValue: normalizeDisplay(params.text, 160),
        confidence,
      };
    }
  }

  const hasQuestionSignal = /\b(qual|como|quando|quanto|onde|tem|posso|pode)\b/i.test(normalized);
  return {
    intent: hasQuestionSignal ? "out_of_scope" : "unknown",
    confidence: hasQuestionSignal ? 0.62 : 0.4,
    shouldAskClarification: true,
    clarificationReason: hasQuestionSignal ? "question_without_slot_match" : "no_semantic_match",
  };
}
