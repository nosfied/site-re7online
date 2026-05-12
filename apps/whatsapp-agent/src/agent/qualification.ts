import type {
  AIQualificationState,
  FlowContext,
  QuoteSiteAnswers,
} from "../conversation/conversation.types.js";

export type AiQualificationSlot = {
  key: string;
  label?: string;
  type?: "text" | "enum" | "boolean";
  required?: boolean;
  requiredWhen?: Record<string, string | boolean | number>;
  allowedValues?: string[];
  question: string;
  captureHints?: string[];
  askAfter?: string[];
  crmMapping?: {
    flowContextKey?: string;
    leadField?: "company" | "service";
    leadTemp?: "frio" | "morno" | "quente";
    priority?: "baixa" | "media" | "alta";
    whenValue?: string[];
  };
};

export type AiQualificationCommercialContinuation = {
  enabled?: boolean;
  negativeReply?: string;
  ambiguousEnumReply?: string;
};

export type AiQualificationSchema = {
  enabled?: boolean;
  schemaVersion?: string;
  slots?: AiQualificationSlot[];
  handoffWhen?: string[];
  outcomes?: string[];
  commercialContinuation?: AiQualificationCommercialContinuation;
};

const SENSITIVE_KEYS = new Set([
  "cpf",
  "rg",
  "documento",
  "senha",
  "password",
  "token",
  "cartao",
  "credit_card",
  "cvc",
  "cvv",
]);

const GREETING_ONLY = new Set(["oi", "ola", "olá", "bom_dia", "boa_tarde", "boa_noite", "opa"]);
const POSITIVE_TERMS = new Set(["sim", "quero", "pode", "ok", "claro", "pode_sim", "sim_quero"]);
const NEGATIVE_TERMS = new Set([
  "nao",
  "não",
  "nao_quero",
  "não_quero",
  "agora_nao",
  "agora_não",
  "nao_precisa",
  "não_precisa",
  "depois",
  "parar",
  "encerrar",
]);
const DEFAULT_AMBIGUOUS_ENUM_REPLY = "Certo. Escolha uma das opções para eu continuar.";
const OPERATIONAL_STOP_TERMS = [
  "parar",
  "encerrar",
  "cancelar",
  "sair",
  "nao precisa",
  "não precisa",
  "nao quero",
  "não quero",
  "agora nao",
  "agora não",
];
const ABUSIVE_TERMS = [
  "va cagar",
  "vá cagar",
  "vai cagar",
  "merda",
  "porra",
  "foda se",
  "foda-se",
];
const SENSITIVE_TEXT_PATTERNS = [
  /\bcpf\b/i,
  /\brg\b/i,
  /\bsenha\b/i,
  /\bpassword\b/i,
  /\btoken\b/i,
  /\bcart[aã]o\b/i,
  /\bcvv\b/i,
  /\bcvc\b/i,
  /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/,
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/,
];

function normalizeToken(input: unknown, maxLength = 60) {
  if (typeof input !== "string") return "";
  return input
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_:-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, maxLength);
}

function normalizeComparable(input: unknown) {
  return normalizeToken(input, 120).replace(/_/g, " ");
}

function hasTokenMatch(text: string, term: string) {
  if (!text || !term) return false;
  return text === term || text.includes(` ${term} `) || text.startsWith(`${term} `) || text.endsWith(` ${term}`);
}

function normalizeDisplayString(input: unknown, maxLength: number) {
  if (typeof input !== "string") return "";
  return input.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizeStringList(input: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(input)) return [];
  return [
    ...new Set(
      input
        .map((item) => normalizeDisplayString(item, maxLength))
        .filter(Boolean)
        .slice(0, maxItems)
    ),
  ];
}

function normalizeTokenList(input: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(input)) return [];
  return [
    ...new Set(
      input
        .map((item) => normalizeToken(item, maxLength))
        .filter(Boolean)
        .slice(0, maxItems)
    ),
  ];
}

function normalizeHandoffWhenList(input: unknown) {
  if (!Array.isArray(input)) return [];
  return [
    ...new Set(
      input
        .map((item) => {
          const value = normalizeDisplayString(item, 120)
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/\s+/g, "");
          if (!value) return "";
          if (/^(all|when):[a-z0-9_:+\-=\s]+$/.test(value)) return value;
          return normalizeToken(value, 80);
        })
        .filter(Boolean)
        .slice(0, 40)
    ),
  ];
}

function normalizeCrmMapping(input: unknown): AiQualificationSlot["crmMapping"] | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const raw = input as Record<string, unknown>;
  const flowContextKey = normalizeToken(raw.flowContextKey, 60);
  const leadField =
    raw.leadField === "company" || raw.leadField === "service" ? raw.leadField : undefined;
  const leadTemp =
    raw.leadTemp === "frio" || raw.leadTemp === "morno" || raw.leadTemp === "quente"
      ? raw.leadTemp
      : undefined;
  const priority =
    raw.priority === "baixa" || raw.priority === "media" || raw.priority === "alta"
      ? raw.priority
      : undefined;
  const whenValue = normalizeStringList(raw.whenValue, 20, 120);
  const mapping: NonNullable<AiQualificationSlot["crmMapping"]> = {
    ...(flowContextKey && !SENSITIVE_KEYS.has(flowContextKey) ? { flowContextKey } : {}),
    ...(leadField ? { leadField } : {}),
    ...(leadTemp ? { leadTemp } : {}),
    ...(priority ? { priority } : {}),
    ...(whenValue.length ? { whenValue } : {}),
  };
  return Object.keys(mapping).length ? mapping : undefined;
}

function normalizeCommercialContinuation(
  input: unknown
): AiQualificationCommercialContinuation | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const raw = input as Record<string, unknown>;
  if (raw.enabled !== undefined && typeof raw.enabled !== "boolean") return undefined;
  const negativeReply = normalizeDisplayString(raw.negativeReply, 300);
  const ambiguousEnumReply = normalizeDisplayString(raw.ambiguousEnumReply, 300);
  const continuation: AiQualificationCommercialContinuation = {
    ...(typeof raw.enabled === "boolean" ? { enabled: raw.enabled } : {}),
    ...(negativeReply ? { negativeReply } : {}),
    ...(ambiguousEnumReply ? { ambiguousEnumReply } : {}),
  };
  return Object.keys(continuation).length ? continuation : undefined;
}

function normalizeRequiredWhen(input: unknown): Record<string, string | boolean | number> | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const entries = Object.entries(input as Record<string, unknown>).slice(0, 10);
  const normalized: Record<string, string | boolean | number> = {};
  for (const [rawKey, rawValue] of entries) {
    const key = normalizeToken(rawKey, 60);
    if (!key || SENSITIVE_KEYS.has(key)) continue;
    if (
      typeof rawValue !== "string" &&
      typeof rawValue !== "boolean" &&
      typeof rawValue !== "number"
    ) {
      continue;
    }
    normalized[key] =
      typeof rawValue === "string" ? normalizeDisplayString(rawValue, 120) : rawValue;
  }
  return Object.keys(normalized).length ? normalized : undefined;
}

export function normalizeQualificationSchema(input: unknown): AiQualificationSchema | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const raw = input as Record<string, unknown>;
  if (raw.enabled !== undefined && typeof raw.enabled !== "boolean") return undefined;
  if (raw.schemaVersion !== undefined && typeof raw.schemaVersion !== "string") return undefined;
  if (raw.slots !== undefined && !Array.isArray(raw.slots)) return undefined;
  if (raw.handoffWhen !== undefined && !Array.isArray(raw.handoffWhen)) return undefined;
  if (raw.outcomes !== undefined && !Array.isArray(raw.outcomes)) return undefined;
  const commercialContinuation = normalizeCommercialContinuation(raw.commercialContinuation);
  if (raw.commercialContinuation !== undefined && !commercialContinuation) return undefined;
  const slots: AiQualificationSlot[] = [];
  if (Array.isArray(raw.slots)) {
    const seen = new Set<string>();
    for (const rawSlot of raw.slots.slice(0, 40)) {
      if (!rawSlot || typeof rawSlot !== "object" || Array.isArray(rawSlot)) continue;
      const slot = rawSlot as Record<string, unknown>;
      const key = normalizeToken(slot.key, 60);
      const question = normalizeDisplayString(slot.question, 240);
      if (!key || !question || SENSITIVE_KEYS.has(key) || seen.has(key)) continue;
      seen.add(key);
      const type =
        slot.type === "enum" || slot.type === "boolean" || slot.type === "text"
          ? slot.type
          : "text";
      const allowedValues =
        type === "enum" ? normalizeStringList(slot.allowedValues, 40, 120) : [];
      const requiredWhen = normalizeRequiredWhen(slot.requiredWhen);
      const askAfter = normalizeTokenList(slot.askAfter, 20, 60).filter(
        (item) => !SENSITIVE_KEYS.has(item)
      );
      const crmMapping = normalizeCrmMapping(slot.crmMapping);
      slots.push({
        key,
        ...(typeof slot.label === "string" && slot.label.trim()
          ? { label: normalizeDisplayString(slot.label, 80) }
          : {}),
        type,
        ...(slot.required === true ? { required: true } : {}),
        ...(requiredWhen ? { requiredWhen } : {}),
        ...(allowedValues.length ? { allowedValues } : {}),
        question,
        ...(Array.isArray(slot.captureHints)
          ? { captureHints: normalizeStringList(slot.captureHints, 20, 120) }
          : {}),
        ...(askAfter.length ? { askAfter } : {}),
        ...(crmMapping ? { crmMapping } : {}),
      });
    }
  }
  const schema: AiQualificationSchema = {
    ...(typeof raw.enabled === "boolean" ? { enabled: raw.enabled } : {}),
    ...(typeof raw.schemaVersion === "string" && raw.schemaVersion.trim()
      ? { schemaVersion: normalizeDisplayString(raw.schemaVersion, 40) }
      : {}),
    ...(slots.length ? { slots } : {}),
    ...(Array.isArray(raw.handoffWhen) ? { handoffWhen: normalizeHandoffWhenList(raw.handoffWhen) } : {}),
    ...(Array.isArray(raw.outcomes)
      ? { outcomes: normalizeTokenList(raw.outcomes, 40, 80) }
      : {}),
    ...(commercialContinuation ? { commercialContinuation } : {}),
  };
  return Object.keys(schema).length ? schema : undefined;
}

export function isQualificationEnabled(schema?: AiQualificationSchema | null) {
  const normalized = normalizeQualificationSchema(schema);
  return normalized?.enabled === true && Boolean(normalized.slots?.length);
}

function slotApplies(slot: AiQualificationSlot, state?: AIQualificationState | null) {
  if (!slot.requiredWhen) return true;
  const values = state?.slots ?? {};
  return Object.entries(slot.requiredWhen).every(([key, expected]) => values[key] === expected);
}

export function getNextQualificationSlot(
  schema?: AiQualificationSchema | null,
  state?: AIQualificationState | null
) {
  const normalized = normalizeQualificationSchema(schema);
  if (!normalized?.slots?.length) return null;
  const completed = new Set(state?.completedSlots ?? []);
  const findSlot = (predicate: (slot: AiQualificationSlot) => boolean) => {
    for (const slot of normalized.slots ?? []) {
      if (completed.has(slot.key)) continue;
      if (!slotApplies(slot, state)) continue;
      if (predicate(slot)) return slot;
    }
    return null;
  };
  const requiredSlot = findSlot((slot) => Boolean(slot.required || slot.requiredWhen));
  if (requiredSlot) return requiredSlot;
  return findSlot((slot) => Boolean(slot.askAfter?.some((key) => completed.has(key))));
}

export function getInitialQualificationState(
  schema?: AiQualificationSchema | null,
  nowIso = new Date().toISOString()
): AIQualificationState {
  const normalized = normalizeQualificationSchema(schema);
  const enabled = isQualificationEnabled(normalized);
  const initialState: AIQualificationState = {
    enabledSnapshot: enabled,
    schemaVersion: normalized?.schemaVersion,
    stage: enabled ? "idle" : "cancelled",
    currentSlot: null,
    slots: {},
    completedSlots: [],
    missingSlots: [],
    lastQuestion: null,
    readyForHandoff: false,
    outcome: null,
    updatedAt: nowIso,
  };
  const nextSlot = getNextQualificationSlot(normalized, initialState);
  return {
    ...initialState,
    currentSlot: nextSlot?.key ?? null,
    missingSlots: nextSlot ? [nextSlot.key] : [],
  };
}

export function validateQualificationSlotValue(slot: AiQualificationSlot, value: unknown) {
  if (slot.type === "boolean") {
    if (typeof value !== "boolean") return { ok: false as const, reason: "invalid_boolean" };
    return { ok: true as const, value };
  }
  const text = normalizeDisplayString(value, 240);
  if (!text) return { ok: false as const, reason: "empty" };
  if (slot.type === "enum") {
    const allowed = new Set((slot.allowedValues ?? []).map((item) => item.toLowerCase()));
    if (!allowed.has(text.toLowerCase())) {
      return { ok: false as const, reason: "not_allowed" };
    }
  }
  return { ok: true as const, value: text };
}

function containsSensitiveText(text: string) {
  return SENSITIVE_TEXT_PATTERNS.some((pattern) => pattern.test(text));
}

function normalizeOperationalText(text: string | null | undefined) {
  return normalizeDisplayString(text, 240)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsOperationalTerm(text: string, terms: string[] = []) {
  const normalized = normalizeOperationalText(text);
  if (!normalized) return false;
  return terms.some((term) => {
    const normalizedTerm = normalizeOperationalText(term);
    return Boolean(
      normalizedTerm &&
        (normalized === normalizedTerm ||
          normalized.includes(` ${normalizedTerm} `) ||
          normalized.startsWith(`${normalizedTerm} `) ||
          normalized.endsWith(` ${normalizedTerm}`))
    );
  });
}

function isExplicitNegativeText(text: string) {
  const normalized = normalizeOperationalText(text);
  if (!normalized) return false;
  return (
    [...NEGATIVE_TERMS].some((term) => normalized === normalizeOperationalText(term)) ||
    containsOperationalTerm(normalized, OPERATIONAL_STOP_TERMS)
  );
}

function isOperationalText(text: string, handoffKeywords: string[] = []) {
  const normalized = normalizeOperationalText(text);
  if (!normalized) return false;
  if (isExplicitNegativeText(normalized)) return true;
  if (containsOperationalTerm(normalized, handoffKeywords)) return true;
  if (containsOperationalTerm(normalized, ABUSIVE_TERMS)) return true;
  return containsSensitiveText(text);
}

function isPositiveOnlyText(text: string) {
  const token = normalizeToken(text, 80);
  return POSITIVE_TERMS.has(token) && !isExplicitNegativeText(text);
}

function isShortUsefulText(text: string) {
  const token = normalizeToken(text, 80);
  if (!token || GREETING_ONLY.has(token) || POSITIVE_TERMS.has(token) || NEGATIVE_TERMS.has(token)) {
    return false;
  }
  if (text.length > 160 || containsSensitiveText(text)) return false;
  return text.trim().length >= 2;
}

function deterministicSlotCapture(slot: AiQualificationSlot, text: string, handoffKeywords: string[] = []) {
  const normalizedText = normalizeComparable(text);
  if (!normalizedText || containsSensitiveText(text)) {
    return { captured: false as const, reason: "invalid_or_sensitive" };
  }
  if (slot.type !== "boolean" && isOperationalText(text, handoffKeywords)) {
    return { captured: false as const, reason: "operational_intent" };
  }
  if (slot.type === "boolean") {
    const token = normalizeToken(text, 80);
    if (NEGATIVE_TERMS.has(token)) return { captured: true as const, value: false };
    if (isExplicitNegativeText(text)) return { captured: true as const, value: false };
    if (POSITIVE_TERMS.has(token)) return { captured: true as const, value: true };
    return { captured: false as const, reason: "invalid_boolean" };
  }
  if (slot.type === "enum") {
    for (const allowedValue of slot.allowedValues ?? []) {
      const allowed = normalizeComparable(allowedValue);
      if (hasTokenMatch(` ${normalizedText} `, allowed)) {
        return { captured: true as const, value: allowedValue };
      }
    }
    for (const hint of slot.captureHints ?? []) {
      const normalizedHint = normalizeComparable(hint);
      if (hasTokenMatch(` ${normalizedText} `, normalizedHint)) {
        return { captured: true as const, value: hint };
      }
    }
    return { captured: false as const, reason: "not_allowed" };
  }
  const value = normalizeDisplayString(text, 160);
  if (!isShortUsefulText(value)) return { captured: false as const, reason: "not_useful_text" };
  return { captured: true as const, value };
}

export type QualificationTurnLog =
  | { event: "ai.qualification.started"; payload: Record<string, unknown> }
  | { event: "ai.qualification.slot_captured"; payload: Record<string, unknown> }
  | { event: "ai.qualification.ask_next"; payload: Record<string, unknown> }
  | { event: "ai.qualification.completed"; payload: Record<string, unknown> }
  | { event: "ai.qualification.skipped"; payload: Record<string, unknown> };

export type QualificationTurnResult = {
  enabled: boolean;
  handled: boolean;
  state?: AIQualificationState;
  replyText?: string;
  logs: QualificationTurnLog[];
};

export type QualificationCrmArtifacts = {
  flowContextPatch?: FlowContext;
  flowTagsToAdd?: string[];
  summaryLines?: string[];
  nextStep?: string | null;
  leadPatch?: {
    company?: string;
    service?: string;
  };
  conflicts?: string[];
  skippedReason?: string | null;
};

export type HumanizedQualificationSummary = {
  headline?: string | null;
  narrative?: string | null;
  operatorSummary?: string | null;
  suggestionContext?: string | null;
};

function missingRequiredSlots(schema: AiQualificationSchema, state: AIQualificationState) {
  return (schema.slots ?? [])
    .filter((slot) => {
      if (!slot.required && !slot.requiredWhen) return false;
      if (!slotApplies(slot, state)) return false;
      return !state.completedSlots?.includes(slot.key);
    })
    .map((slot) => slot.key);
}

function qualificationExpressionMatches(expression: string, state: AIQualificationState) {
  const completed = new Set(state.completedSlots ?? []);
  const normalizedExpression = normalizeDisplayString(expression, 160)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "");
  if (!normalizedExpression) return false;
  if (normalizedExpression.startsWith("all:")) {
    return normalizedExpression
      .slice("all:".length)
      .split("+")
      .filter(Boolean)
      .every((key) => completed.has(normalizeToken(key, 60)));
  }
  if (normalizedExpression.startsWith("when:")) {
    const [condition, ...requiredSlots] = normalizedExpression.slice("when:".length).split("+");
    const [rawKey, expected] = condition.split("=");
    const key = normalizeToken(rawKey, 60);
    if (!key || !expected || normalizeComparable(state.slots?.[key]) !== normalizeComparable(expected)) {
      return false;
    }
    return requiredSlots.filter(Boolean).every((slotKey) => completed.has(normalizeToken(slotKey, 60)));
  }
  return completed.has(normalizeToken(normalizedExpression, 60));
}

function shouldMarkReadyForHandoff(schema: AiQualificationSchema, state: AIQualificationState) {
  if (state.readyForHandoff === true) return true;
  return Boolean(schema.handoffWhen?.some((item) => qualificationExpressionMatches(item, state)));
}

export function handleQualificationTurn(params: {
  schema?: AiQualificationSchema | null;
  state?: AIQualificationState | null;
  text: string;
  handoffKeywords?: string[];
  nowIso?: string;
}): QualificationTurnResult {
  const schema = normalizeQualificationSchema(params.schema);
  if (!isQualificationEnabled(schema)) {
    return {
      enabled: false,
      handled: false,
      logs: [{ event: "ai.qualification.skipped", payload: { reason: "disabled" } }],
    };
  }
  const hasExistingState = params.state?.enabledSnapshot === true;
  if (!hasExistingState && GREETING_ONLY.has(normalizeToken(params.text, 80))) {
    return {
      enabled: true,
      handled: false,
      logs: [{ event: "ai.qualification.skipped", payload: { reason: "initial_greeting" } }],
    };
  }
  const nowIso = params.nowIso ?? new Date().toISOString();
  const logs: QualificationTurnLog[] = [];
  const existingState = hasExistingState ? params.state! : null;
  let state: AIQualificationState = hasExistingState
    ? {
        ...existingState,
        slots: { ...(existingState?.slots ?? {}) },
        completedSlots: [...(existingState?.completedSlots ?? [])],
        missingSlots: [...(existingState?.missingSlots ?? [])],
      }
    : getInitialQualificationState(schema, nowIso);
  if (!hasExistingState) {
    logs.push({
      event: "ai.qualification.started",
      payload: { schemaVersion: schema?.schemaVersion ?? null },
    });
  }

  const slotByKey = new Map((schema?.slots ?? []).map((slot) => [slot.key, slot]));
  let currentSlot = state.currentSlot ? slotByKey.get(state.currentSlot) ?? null : null;
  if (!currentSlot) currentSlot = getNextQualificationSlot(schema, state);

  if (!currentSlot) {
    const missingSlots = missingRequiredSlots(schema!, state);
    state = {
      ...state,
      stage: missingSlots.length ? "collecting" : state.readyForHandoff ? "handoff_ready" : "completed",
      currentSlot: null,
      missingSlots,
      updatedAt: nowIso,
    };
    logs.push({
      event: "ai.qualification.completed",
      payload: { readyForHandoff: state.readyForHandoff === true },
    });
    return { enabled: true, handled: false, state, logs };
  }

  const continuation = schema?.commercialContinuation;
  const capture = deterministicSlotCapture(currentSlot, params.text, params.handoffKeywords);
  if (capture.captured) {
    const completedSlots = new Set(state.completedSlots ?? []);
    completedSlots.add(currentSlot.key);
    state = {
      ...state,
      stage: "collecting",
      slots: {
        ...(state.slots ?? {}),
        [currentSlot.key]: capture.value,
      },
      completedSlots: [...completedSlots],
      updatedAt: nowIso,
    };
    state = {
      ...state,
      readyForHandoff:
        Boolean(schema?.handoffWhen?.includes(currentSlot.key)) ||
        Boolean(schema?.handoffWhen?.includes(normalizeToken(capture.value, 80))) ||
        shouldMarkReadyForHandoff(schema!, state),
    };
    logs.push({
      event: "ai.qualification.slot_captured",
      payload: { slot: currentSlot.key, type: currentSlot.type ?? "text" },
    });
  } else if (
    currentSlot.type === "enum" &&
    isPositiveOnlyText(params.text) &&
    continuation?.enabled === true
  ) {
    state = {
      ...state,
      stage: "collecting",
      currentSlot: currentSlot.key,
      missingSlots: [currentSlot.key],
      lastQuestion: currentSlot.question,
      updatedAt: nowIso,
    };
    const replyText = continuation.ambiguousEnumReply?.trim() || currentSlot.question || DEFAULT_AMBIGUOUS_ENUM_REPLY;
    logs.push({
      event: "ai.qualification.ask_next",
      payload: { slot: currentSlot.key, reason: "ambiguous_enum_ack" },
    });
    return { enabled: true, handled: true, state, replyText, logs };
  } else if (
    currentSlot.askAfter?.length &&
    isExplicitNegativeText(params.text) &&
    continuation?.enabled === true
  ) {
    const completedSlots = new Set(state.completedSlots ?? []);
    completedSlots.add(currentSlot.key);
    state = {
      ...state,
      stage: "collecting",
      currentSlot: null,
      completedSlots: [...completedSlots],
      missingSlots: missingRequiredSlots(schema!, state),
      lastQuestion: null,
      updatedAt: nowIso,
    };
    const nextSlot = getNextQualificationSlot(schema, state);
    state = {
      ...state,
      currentSlot: nextSlot?.key ?? null,
      lastQuestion: nextSlot?.question ?? null,
    };
    logs.push({
      event: "ai.qualification.skipped",
      payload: { reason: "negative_followup_declined", slot: currentSlot.key },
    });
    return {
      enabled: true,
      handled: true,
      state,
      replyText: continuation.negativeReply?.trim() || "Tudo bem. Posso continuar te ajudando por aqui.",
      logs,
    };
  } else if (!state.lastQuestion || state.lastQuestion !== currentSlot.question) {
    state = {
      ...state,
      stage: "collecting",
      currentSlot: currentSlot.key,
      missingSlots: [currentSlot.key],
      lastQuestion: currentSlot.question,
      updatedAt: nowIso,
    };
    logs.push({
      event: "ai.qualification.ask_next",
      payload: { slot: currentSlot.key, reason: capture.reason ?? "ask_current" },
    });
    return { enabled: true, handled: true, state, replyText: currentSlot.question, logs };
  } else {
    state = {
      ...state,
      stage: "collecting",
      currentSlot: currentSlot.key,
      missingSlots: [currentSlot.key],
      updatedAt: nowIso,
    };
    logs.push({
      event: "ai.qualification.skipped",
      payload: { reason: capture.reason ?? "not_captured", slot: currentSlot.key },
    });
    return { enabled: true, handled: false, state, logs };
  }

  const nextSlot = getNextQualificationSlot(schema, state);
  const missingSlots = missingRequiredSlots(schema!, state);
  if (nextSlot) {
    state = {
      ...state,
      stage: "collecting",
      currentSlot: nextSlot.key,
      missingSlots,
      lastQuestion: nextSlot.question,
      updatedAt: nowIso,
    };
    logs.push({
      event: "ai.qualification.ask_next",
      payload: {
        slot: nextSlot.key,
        reason: nextSlot.askAfter?.length ? "next_followup_slot" : "next_required_slot",
      },
    });
    return { enabled: true, handled: true, state, replyText: nextSlot.question, logs };
  }

  state = {
    ...state,
    stage: state.readyForHandoff ? "handoff_ready" : "completed",
    currentSlot: null,
    missingSlots,
    lastQuestion: null,
    updatedAt: nowIso,
  };
  logs.push({
    event: "ai.qualification.completed",
    payload: { readyForHandoff: state.readyForHandoff === true },
  });
  return { enabled: true, handled: false, state, logs };
}

function hasFlowContextValue(value: unknown) {
  return value !== undefined && value !== null && !(typeof value === "string" && !value.trim());
}

function humanizeSlotKey(key: string) {
  return key
    .split(/[_:-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatSlotValueForSummary(value: string | number | boolean | null | undefined) {
  if (value === undefined || value === null) return "";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  return normalizeDisplayString(String(value), 160);
}

function normalizeHumanText(value: unknown) {
  const text = normalizeDisplayString(value, 180);
  if (!text || containsSensitiveText(text)) return "";
  return text;
}

function lowerFirst(value: string) {
  return value ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

function joinNatural(parts: string[]) {
  const unique = [...new Set(parts.map((part) => part.trim()).filter(Boolean))];
  if (unique.length <= 1) return unique[0] ?? "";
  if (unique.length === 2) return `${unique[0]} e ${unique[1]}`;
  return `${unique.slice(0, -1).join(", ")} e ${unique[unique.length - 1]}`;
}

function inferSlotRole(slot: AiQualificationSlot, index: number) {
  const normalizedKey = normalizeToken(slot.key, 80);
  const normalizedLabel = normalizeToken(slot.label, 80);
  const combined = `${normalizedKey} ${normalizedLabel}`;
  if (slot.crmMapping?.leadField === "company") return "company";
  if (slot.crmMapping?.leadField === "service") return "service";
  if (slot.type === "enum" && /(tipo|type|categoria|category|perfil|profile)/.test(combined)) {
    return "type";
  }
  if (/(detalhe|detail|preferencia|preference|observacao|observacao)/.test(combined)) {
    return "detail";
  }
  if (/(duvida|d[uú]vida|intencao|intencao|objetivo|confirmar|confirmacao|assunto)/.test(combined)) {
    return "intent";
  }
  return `other:${index}`;
}

function buildHumanizedSlotEntries(state: AIQualificationState, schema?: AiQualificationSchema | null) {
  const normalizedSchema = normalizeQualificationSchema(schema);
  const slotByKey = new Map((normalizedSchema?.slots ?? []).map((slot) => [slot.key, slot]));
  const completed = new Set(state.completedSlots ?? []);
  const entries: Array<{
    key: string;
    label: string;
    value: string;
    role: string;
    order: number;
  }> = [];
  let order = 0;
  for (const [key, rawValue] of Object.entries(state.slots ?? {})) {
    const normalizedKey = normalizeToken(key, 80);
    const value = normalizeHumanText(rawValue);
    if (!normalizedKey || !value || !completed.has(normalizedKey)) continue;
    const slot = slotByKey.get(normalizedKey);
    const label = slot?.label ? normalizeDisplayString(slot.label, 80) : humanizeSlotKey(normalizedKey);
    entries.push({
      key: normalizedKey,
      label,
      value,
      role: slot ? inferSlotRole(slot, order) : `other:${order}`,
      order,
    });
    order += 1;
  }
  return entries;
}

export function buildHumanizedQualificationSummary(params: {
  state?: AIQualificationState | null;
  schema?: AiQualificationSchema | null;
  flowContext?: FlowContext | null;
  tags?: string[] | null;
  nextStep?: string | null;
}): HumanizedQualificationSummary {
  const state = params.state;
  if (!state?.slots || !Object.keys(state.slots).length) return {};
  const entries = buildHumanizedSlotEntries(state, params.schema);
  if (!entries.length) return {};

  const company = entries.find((entry) => entry.role === "company");
  const service = entries.find((entry) => entry.role === "service");
  const type = entries.find((entry) => entry.role === "type");
  const details = entries.filter((entry) => entry.role === "detail");
  const intents = entries.filter((entry) => entry.role === "intent");
  const others = entries.filter(
    (entry) =>
      entry !== company &&
      entry !== service &&
      entry !== type &&
      !details.includes(entry) &&
      !intents.includes(entry)
  );

  const headline = state.readyForHandoff
    ? "Cliente solicitou atendimento da equipe"
    : type?.value
      ? `Lead ${lowerFirst(type.value)} qualificado`
      : "Lead qualificado";

  const firstSentenceParts: string[] = [];
  if (company?.value) firstSentenceParts.push(`Cliente informou ${lowerFirst(company.label)}: ${company.value}`);
  if (type?.value && service?.value) {
    firstSentenceParts.push(
      `${company?.value ? "procura" : "Cliente procura"} atendimento do tipo ${lowerFirst(type.value)} para ${service.value}`
    );
  } else if (service?.value) {
    firstSentenceParts.push(`${company?.value ? "procura" : "Cliente procura"} atendimento para ${service.value}`);
  } else if (type?.value) {
    firstSentenceParts.push(`${company?.value ? "procura" : "Cliente procura"} atendimento do tipo ${lowerFirst(type.value)}`);
  }

  const narrativeSentences: string[] = [];
  const firstSentence = joinNatural(firstSentenceParts);
  if (firstSentence) {
    narrativeSentences.push(`${firstSentence.charAt(0).toUpperCase()}${firstSentence.slice(1)}.`);
  }

  if (details.length) {
    narrativeSentences.push(`Detalhes informados: ${joinNatural(details.map((entry) => entry.value))}.`);
  }
  if (intents.length) {
    narrativeSentences.push(`Demonstrou interesse em ${joinNatural(intents.map((entry) => entry.value))}.`);
  }
  if (others.length && narrativeSentences.length < 3) {
    narrativeSentences.push(
      `Também informou ${joinNatural(
        others.slice(0, 2).map((entry) => `${lowerFirst(entry.label)}: ${entry.value}`)
      )}.`
    );
  }
  if (state.readyForHandoff) {
    narrativeSentences.push("Solicitou atendimento da equipe.");
  }

  const narrative = narrativeSentences.join(" ").replace(/\s+/g, " ").trim();
  const operatorSummary = narrative || entries.map((entry) => `${entry.label}: ${entry.value}`).join("; ");
  const suggestionContext = narrative
    ? `Cliente já informou: ${narrative}`
    : `Cliente já informou: ${entries.map((entry) => `${lowerFirst(entry.label)}: ${entry.value}`).join("; ")}.`;

  return {
    headline,
    narrative: narrative || null,
    operatorSummary: operatorSummary || null,
    suggestionContext: suggestionContext || null,
  };
}

function isSafeCrmSlotValue(value: unknown): value is string | number | boolean | null {
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "string") return false;
  const text = normalizeDisplayString(value, 160);
  return Boolean(text) && !containsSensitiveText(text);
}

const LEAD_TEMP_RANK: Record<"frio" | "morno" | "quente", number> = {
  frio: 1,
  morno: 2,
  quente: 3,
};

const PRIORITY_RANK: Record<"baixa" | "media" | "alta", number> = {
  baixa: 1,
  media: 2,
  alta: 3,
};

function crmMappingApplies(slot: AiQualificationSlot, value: unknown) {
  const whenValue = slot.crmMapping?.whenValue;
  if (!whenValue?.length) return true;
  const normalizedValue = normalizeComparable(value);
  return whenValue.some((item) => {
    const normalizedItem = normalizeComparable(item);
    return normalizedValue === normalizedItem || hasTokenMatch(` ${normalizedValue} `, normalizedItem);
  });
}

function shouldApplyRankedCrmValue<T extends string>(
  currentValue: unknown,
  nextValue: T,
  rank: Record<T, number>
) {
  if (!hasFlowContextValue(currentValue)) return true;
  const currentToken = normalizeToken(currentValue, 40) as T;
  if (!Object.prototype.hasOwnProperty.call(rank, currentToken)) return false;
  return rank[nextValue] > rank[currentToken];
}

function buildQualificationNextStep(state: AIQualificationState) {
  if (state.readyForHandoff) {
    return "Revisar a qualificação capturada e confirmar o próximo passo com o cliente.";
  }
  if (state.missingSlots?.length) {
    return "Completar a qualificação pendente antes de avançar no atendimento.";
  }
  if (state.stage === "completed") {
    return "Cliente qualificado; revisar interesse e seguir atendimento comercial.";
  }
  return null;
}

export function buildQualificationCrmArtifacts(params: {
  state?: AIQualificationState | null;
  schema?: AiQualificationSchema | null;
  answers?: QuoteSiteAnswers | null;
  nowIso?: string;
}): QualificationCrmArtifacts {
  const state = params.state;
  const schema = normalizeQualificationSchema(params.schema);
  if (!state?.slots || !Object.keys(state.slots).length || !schema?.slots?.length) {
    return { skippedReason: "missing_qualification_slots" };
  }
  const nowIso = params.nowIso ?? new Date().toISOString();
  const currentContext = params.answers?.flowContext ?? {};
  const patch: FlowContext = {};
  const leadPatch: NonNullable<QualificationCrmArtifacts["leadPatch"]> = {};
  const summaryLines: string[] = [];
  const tags = new Set<string>();
  const conflicts: string[] = [];
  const completedSlots = new Set(state.completedSlots ?? []);
  const slotByKey = new Map(schema.slots.map((slot) => [slot.key, slot]));

  for (const [key, rawValue] of Object.entries(state.slots)) {
    const normalizedKey = normalizeToken(key, 60);
    if (!normalizedKey || SENSITIVE_KEYS.has(normalizedKey) || !isSafeCrmSlotValue(rawValue)) {
      continue;
    }
    const slot = slotByKey.get(normalizedKey);
    if (!slot || !completedSlots.has(normalizedKey)) continue;
    const displayValue = formatSlotValueForSummary(rawValue);
    if (!displayValue) continue;
    const label = slot.label ? normalizeDisplayString(slot.label, 80) : humanizeSlotKey(normalizedKey);
    summaryLines.push(`${label}: ${displayValue}`);
    tags.add(`qualification:slot:${normalizedKey}`);
    const contextKey = slot.crmMapping?.flowContextKey ?? normalizedKey;
    if (hasFlowContextValue(currentContext[contextKey])) {
      conflicts.push(contextKey);
    } else {
      patch[contextKey] = rawValue;
    }
    if (slot.crmMapping && crmMappingApplies(slot, rawValue)) {
      if (slot.crmMapping.leadField === "company" && typeof rawValue === "string") {
        leadPatch.company = normalizeDisplayString(rawValue, 160);
      }
      if (slot.crmMapping.leadField === "service" && typeof rawValue === "string") {
        leadPatch.service = normalizeDisplayString(rawValue, 160);
      }
      if (
        slot.crmMapping.leadTemp &&
        shouldApplyRankedCrmValue(currentContext.lead_temp ?? patch.lead_temp, slot.crmMapping.leadTemp, LEAD_TEMP_RANK)
      ) {
        patch.lead_temp = slot.crmMapping.leadTemp;
      }
      if (
        slot.crmMapping.priority &&
        shouldApplyRankedCrmValue(
          currentContext.prioridade ?? currentContext.priority ?? patch.prioridade,
          slot.crmMapping.priority,
          PRIORITY_RANK
        )
      ) {
        patch.prioridade = slot.crmMapping.priority;
      }
    }
  }

  const nextStep = buildQualificationNextStep(state);
  patch.qualification = {
    source: "aiQualification",
    schemaVersion: state.schemaVersion ?? schema.schemaVersion ?? null,
    updatedAt: nowIso,
    completedSlots: state.completedSlots ?? [],
    missingSlots: state.missingSlots ?? [],
    outcome: state.outcome ?? null,
    readyForHandoff: state.readyForHandoff === true,
    summaryLines,
    nextStep: nextStep ?? null,
  };
  if (state.stage === "completed") tags.add("qualification:completed");
  if (state.stage === "handoff_ready" || state.readyForHandoff) {
    tags.add("qualification:handoff_ready");
  }
  return {
    flowContextPatch: patch,
    flowTagsToAdd: [...tags],
    summaryLines,
    nextStep,
    leadPatch: Object.keys(leadPatch).length ? leadPatch : undefined,
    conflicts,
  };
}

export function resolveQualificationOutcome(
  schema?: AiQualificationSchema | null,
  state?: AIQualificationState | null
) {
  const normalized = normalizeQualificationSchema(schema);
  const outcome = normalizeToken(state?.outcome, 80);
  if (outcome && normalized?.outcomes?.includes(outcome)) return outcome;
  const currentSlot = normalizeToken(state?.currentSlot, 80);
  if (state?.readyForHandoff && currentSlot && normalized?.handoffWhen?.includes(currentSlot)) {
    return currentSlot;
  }
  return null;
}
