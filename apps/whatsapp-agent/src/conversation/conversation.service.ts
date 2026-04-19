import { logger } from "../logger/logger.js";
import { Storage } from "../storage/storage.js";
import { makeConversationKey } from "../storage/conversationKey.js";
import {
  ConversationIntent,
  ConversationState,
  HandoffState,
  QuoteSiteAnswers,
} from "./conversation.types.js";
import { canonicalizeBrazilWaId } from "../utils/waid.js";

const WINDOW_HOURS = 24;
export const DEFAULT_HANDOFF_PROMPT =
  "Posso transferir voce para um atendente humano? Responda SIM ou NAO.";

function addHoursIso(timestamp: string, hours: number) {
  const base = Number.isNaN(Date.parse(timestamp)) ? Date.now() : Date.parse(timestamp);
  return new Date(base + hours * 60 * 60 * 1000).toISOString();
}

export async function getOrCreateConversation(
  storage: Storage,
  clientKey: string,
  waId: string,
  timestamp: string
): Promise<ConversationState> {
  const existing = await storage.getConversation(waId, clientKey);
  if (existing) {
    return existing;
  }

  const firstSeenAt = Number.isNaN(Date.parse(timestamp))
    ? new Date().toISOString()
    : new Date(Date.parse(timestamp)).toISOString();
  const state: ConversationState = {
    clientKey,
    conversationKey: makeConversationKey(clientKey, waId),
    waId,
    waIdCanonical: canonicalizeBrazilWaId(waId),
    firstSeenAt,
    lastInboundAt: firstSeenAt,
    window: { isOpen: true, expiresAt: addHoursIso(firstSeenAt, WINDOW_HOURS) },
    intent: "unknown",
    handoff: { status: "none" },
    demoStatus: "none",
    answers: {},
    mode: "BOT",
    assignedUserId: null,
    assignedTo: null,
    assignedAt: null,
  };
  await storage.upsertConversation(state);
  return state;
}

export function updateWindow(state: ConversationState, lastInboundAt: string): ConversationState {
  return {
    ...state,
    lastInboundAt,
    window: { isOpen: true, expiresAt: addHoursIso(lastInboundAt, WINDOW_HOURS) },
  };
}

export function detectIntent(text: string | null): ConversationIntent {
  if (!text) {
    return "unknown";
  }
  const value = text.toLowerCase();
  if (/(preço|valor|orçamento|quanto custa|planos)/i.test(value)) {
    return "pricing";
  }
  if (/(suporte|ajuda|erro|problema)/i.test(value)) {
    return "support";
  }
  if (/(humano|atendente|pessoa|falar com alguém|ligar)/i.test(value)) {
    return "handoff";
  }
  return "unknown";
}

export function updateInbound(
  state: ConversationState,
  messageId: string,
  timestamp: string,
  text: string | null
): ConversationState {
  const nextIntent = detectIntent(text);
  const next = updateWindow(
    {
      ...state,
      lastInboundMessageId: messageId,
    },
    timestamp
  );
  const answers = consolidateAnswers(next.answers ?? {}, text);
  return { ...next, intent: nextIntent, answers };
}

export function updateInboundMeta(
  state: ConversationState,
  messageId: string,
  timestamp: string
): ConversationState {
  return updateWindow(
    {
      ...state,
      lastInboundMessageId: messageId,
    },
    timestamp
  );
}

export function updateOutbound(
  state: ConversationState,
  messageId: string | undefined,
  timestamp: string
): ConversationState {
  return {
    ...state,
    lastOutboundAt: timestamp,
    lastOutboundMessageId: messageId,
  };
}

export function markTemplateNeeded(
  state: ConversationState,
  info: {
    templateSuggested: string;
    atIso: string;
    intent?: ConversationIntent;
    lastInboundMessageId?: string;
  }
): ConversationState {
  return {
    ...state,
    templateNeeded: true,
    templateSuggested: info.templateSuggested,
    lastNeedAt: info.atIso,
    lastIntent: info.intent ?? state.intent,
    lastInboundMessageId: info.lastInboundMessageId ?? state.lastInboundMessageId,
  };
}

export function clearTemplateNeeded(state: ConversationState): ConversationState {
  return {
    ...state,
    templateNeeded: false,
    templateSuggested: undefined,
    lastNeedAt: undefined,
    lastIntent: undefined,
  };
}

export function isWindowOpen(state: ConversationState, now: number) {
  if (!state.window.isOpen || !state.window.expiresAt) {
    return false;
  }
  return now < Date.parse(state.window.expiresAt);
}

export type OutboundDecision = {
  action: "send" | "block";
  replyType?: "text" | "template";
  templateName?: string;
  templateLanguage?: string;
  policy?: "B_manual_template";
  windowOpen: boolean;
  events?: Array<{
    event: "outbound.blocked.window_closed" | "outbound.needs_template";
    suggestedTemplate?: string;
    language?: string;
  }>;
};

export function decideOutboundPolicy(params: {
  state: ConversationState;
  now: number;
  isSandbox: boolean;
  outOfWindowTemplate: string;
  sandboxTemplate?: string;
}): OutboundDecision {
  const windowOpen = isWindowOpen(params.state, params.now);
  if (!windowOpen) {
    const suggestedTemplate = params.outOfWindowTemplate;
    return {
      action: "block",
      policy: "B_manual_template",
      windowOpen,
      templateName: suggestedTemplate,
      templateLanguage: "pt_BR",
      events: [
        { event: "outbound.blocked.window_closed" },
        {
          event: "outbound.needs_template",
          suggestedTemplate,
          language: "pt_BR",
        },
      ],
    };
  }

  if (params.isSandbox) {
    return {
      action: "send",
      replyType: "template",
      templateName: params.sandboxTemplate ?? "hello_world",
      templateLanguage: "en_US",
      windowOpen,
    };
  }

  return { action: "send", replyType: "text", windowOpen };
}

export function shouldAutoReply(state: ConversationState) {
  const mode = state.mode ?? "BOT";
  return state.handoff.status !== "active" && mode !== "HUMAN";
}

export function getHandoffStatus(state: ConversationState) {
  return state.handoff.status;
}

function withHandoff(
  state: ConversationState,
  handoff: Partial<HandoffState> & { status: HandoffState["status"] }
): ConversationState {
  return {
    ...state,
    handoff: {
      ...state.handoff,
      ...handoff,
    },
  };
}

export function handleHandoff(
  state: ConversationState,
  inboundText: string | null,
  timestamp: string
): {
  state: ConversationState;
  handled: boolean;
  replyText?: string;
  outcome?: "requested" | "accepted" | "declined";
} {
  const text = (inboundText ?? "").trim().toLowerCase();
  if (!text) {
    return { state, handled: false };
  }

  if (state.handoff.status === "pending") {
    if (text === "sim") {
      return {
        handled: true,
        outcome: "accepted",
        state: withHandoff(state, {
          status: "active",
          activatedAt: timestamp,
        }),
      };
    }
    if (text === "não" || text === "nao") {
      return {
        handled: true,
        outcome: "declined",
        state: withHandoff(state, {
          status: "none",
          releasedAt: timestamp,
        }),
      };
    }
    return {
      handled: true,
      outcome: "requested",
      state,
      replyText: "Responda apenas SIM ou NÃO para que eu possa transferir.",
    };
  }

  if (detectIntent(inboundText) === "handoff") {
    return requestHumanHandoff(state, timestamp);
  }

  return { state, handled: false };
}

export function requestHumanHandoff(
  state: ConversationState,
  timestamp: string,
  promptText = DEFAULT_HANDOFF_PROMPT
): {
  state: ConversationState;
  handled: true;
  replyText: string;
  outcome: "requested";
} {
  return {
    handled: true,
    outcome: "requested",
    state: withHandoff(state, {
      status: "pending",
      requestedAt: timestamp,
    }),
    replyText: promptText,
  };
}

export function activateHumanHandoff(
  state: ConversationState,
  timestamp: string,
  replyText = "Vou te transferir para um atendente humano."
): {
  state: ConversationState;
  handled: true;
  replyText: string;
  outcome: "accepted";
} {
  return {
    handled: true,
    outcome: "accepted",
    state: withHandoff(state, {
      status: "active",
      activatedAt: timestamp,
    }),
    replyText,
  };
}

export function applyAdminCommand(
  state: ConversationState,
  inboundText: string | null
): { state: ConversationState; handled: boolean; action?: "pause" | "resume" } {
  if (!inboundText) {
    return { state, handled: false };
  }
  const command = inboundText.trim().toLowerCase();
  if (command === "#bot off") {
    return {
      handled: true,
      action: "pause",
      state: withHandoff(state, {
        status: "active",
        activatedAt: new Date().toISOString(),
      }),
    };
  }
  if (command === "#bot on") {
    return {
      handled: true,
      action: "resume",
      state: withHandoff(state, {
        status: "none",
        releasedAt: new Date().toISOString(),
      }),
    };
  }
  return { state, handled: false };
}

const quoteQuestions = [
  "Qual o nome da empresa e sua cidade?",
  "O site é institucional, landing page, e-commerce ou portal?",
  "Quantas páginas você imagina? (1 / até 5 / 10+)",
  "Precisa de quais itens? (WhatsApp, formulário, blog, agendamento, área do cliente)",
  "Você já tem domínio e identidade visual (logo/cores)?",
  "Qual prazo ideal para colocar no ar?",
];

export function advanceQuoteSiteFlow(
  state: ConversationState,
  inboundText: string | null
): { state: ConversationState; handled: boolean; replyText?: string; completed?: boolean } {
  const text = (inboundText ?? "").trim();
  const shouldStart = shouldStartQuoteSite(text);

  if (!state.flow && !shouldStart) {
    return { state, handled: false };
  }

  const answers = consolidateAnswers(state.answers ?? {}, inboundText);

  if (!state.flow && shouldStart) {
    return {
      handled: true,
      state: {
        ...state,
        flow: "quote_site",
        flowStep: 1,
        answers,
      },
      replyText: quoteQuestions[0],
    };
  }

  if (state.flow !== "quote_site") {
    return { state, handled: false };
  }

  // Do not consume demo scheduling messages as quote answers.
  if (looksLikeDemoInterruption(text)) {
    return { state, handled: false };
  }

  const currentStep = state.flowStep ?? 1;
  const nextAnswers = saveFlowAnswer(answers, currentStep, text);
  const nextStep = currentStep + 1;
  if (nextStep <= 6) {
    return {
      handled: true,
      state: {
        ...state,
        flow: "quote_site",
        flowStep: nextStep,
        answers: nextAnswers,
      },
      replyText: quoteQuestions[nextStep - 1],
    };
  }

  return {
    handled: true,
    completed: true,
    state: {
      ...state,
      flow: undefined,
      flowStep: undefined,
      answers: nextAnswers,
    },
    replyText: buildQuoteSummary(nextAnswers),
  };
}

export function shouldStartQuoteSite(text: string | null | undefined): boolean {
  const normalized = (text ?? "").toLowerCase().trim();
  const hasPricing = /(orçamento|orcamento|preço|valor|quanto custa)/i.test(normalized);
  const hasSite = /\bsite\b/i.test(normalized);
  return hasPricing && hasSite;
}

export type ParsedLeadFields = {
  name?: string;
  city?: string;
  serviceType?: string;
  rawText?: string;
};

export type DemoIntentResult = {
  type: "requested" | "scheduled";
  scheduleExtract?: string;
};

export function hasDemoContextSignal(text: string): boolean {
  const normalized = normalizeConversationTextLite(text);
  const demoContext = [
    "demo",
    "demonstra",
    "reuniao",
    "reunião",
    "apresenta",
    "call",
    "contato",
    "horario",
    "horário",
  ];
  return demoContext.some((word) => normalized.includes(word));
}

export function parseDemoIntent(
  text: string,
  requirePositive = true
): DemoIntentResult | null {
  const normalized = normalizeConversationTextLite(text);
  const positives = [
    "sim",
    "quero",
    "pode",
    "ok",
    "beleza",
    "vamos",
    "aceito",
    "pode chamar",
    "pode falar",
    "gostaria",
    "agendar",
    "marcar",
  ];
  const hasDemoAction =
    normalized.includes("demo") ||
    normalized.includes("demonstra") ||
    normalized.includes("agendar") ||
    normalized.includes("marcar");
  if (
    requirePositive &&
    !hasDemoAction &&
    !positives.some((word) => normalized.includes(word))
  ) {
    return null;
  }

  const hourMatch =
    normalized.match(/\b([01]?\d|2[0-3])\s*(h|hs)\b/) ??
    normalized.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/);
  const dayMatch = normalized.match(
    /\b(hoje|amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo)\b/
  );
  const dateMatch = normalized.match(/\b(\d{1,2}\/\d{1,2})\b/);

  const hasHour = Boolean(hourMatch);
  const hasDayOrDate = Boolean(dayMatch || dateMatch);

  if (hasHour && hasDayOrDate) {
    const extract = [dayMatch?.[0], dateMatch?.[0], hourMatch?.[0]]
      .filter(Boolean)
      .join(" ")
      .trim();
    return { type: "scheduled", scheduleExtract: extract || undefined };
  }

  return { type: "requested" };
}

export function applyDemoRequestedTransition(
  state: ConversationState,
  nowIso: string
): {
  state: ConversationState;
  updated: boolean;
  replyText: string;
} {
  if ((state.demoStatus ?? "none") === "requested") {
    return {
      state,
      updated: false,
      replyText: "Qual melhor dia e horário para a demonstração?",
    };
  }

  return {
    state: {
      ...state,
      demoStatus: "requested",
      lastDemoRequestedAt: nowIso,
    },
    updated: true,
    replyText: "Qual melhor dia e horário para a demonstração?",
  };
}

export function applyDemoScheduledTransition(params: {
  state: ConversationState;
  nowIso: string;
  scheduleExtract?: string;
}): {
  state: ConversationState;
  updated: boolean;
  replyText: string;
} {
  if ((params.state.demoStatus ?? "none") === "scheduled") {
    return {
      state: params.state,
      updated: false,
      replyText:
        "Perfeito! Vamos entrar em contato no dia/horário informado. Se preferir, diga outra opção.",
    };
  }

  return {
    state: {
      ...params.state,
      demoStatus: "scheduled",
      lastDemoScheduledAt: params.nowIso,
      demoPreferredSchedule: params.scheduleExtract,
    },
    updated: true,
    replyText:
      "Perfeito! Vamos entrar em contato no dia/horário informado. Se preferir, diga outra opção.",
  };
}

export function getDemoScheduledQuickReply(params: {
  state: ConversationState;
  inboundText: string;
  nowMs: number;
}): string | null {
  if ((params.state.demoStatus ?? "none") !== "scheduled") {
    return null;
  }
  const normalizedText = normalizeConversationTextLite(params.inboundText);
  const scheduledAtMs = Date.parse(params.state.lastDemoScheduledAt ?? "");
  const isRecentSchedule =
    !Number.isNaN(scheduledAtMs) && params.nowMs - scheduledAtMs <= 30 * 60 * 1000;
  const isSimpleAffirmation =
    /^(sim|ok|beleza|certo|confirmo|confirmado|obrigado|obg|valeu)$/i.test(normalizedText);
  const isSimpleDecline = /^(nao|não)$/i.test(normalizedText);
  if (!isRecentSchedule || (!isSimpleAffirmation && !isSimpleDecline)) {
    return null;
  }
  return isSimpleDecline
    ? "Tudo bem. Se quiser reagendar, envie outro dia e horário."
    : "Seu agendamento já foi registrado. Nosso time confirma com você pelo WhatsApp.";
}

export function shouldStartLeadCapture(params: {
  demoHandled: boolean;
  leadReplyText?: string;
  intent?: ConversationIntent;
  windowOpen: boolean;
  hasRecentRequest: boolean;
}) {
  return (
    !params.demoHandled &&
    !params.leadReplyText &&
    params.intent === "pricing" &&
    params.windowOpen &&
    !params.hasRecentRequest
  );
}

export function maybeRequestLeadCapture(params: {
  state: ConversationState;
  nowIso: string;
  shouldRequest: boolean;
}): {
  requested: boolean;
  state: ConversationState;
  replyText?: string;
} {
  if (!params.shouldRequest) {
    return { requested: false, state: params.state };
  }
  return {
    requested: true,
    state: {
      ...params.state,
      leadRequestedAt: params.nowIso,
    },
    replyText:
      "Para te ajudar melhor, me informe: Nome, Cidade e Serviço (Tráfego, Site, WhatsApp ou Social Media).",
  };
}

export function maybeCaptureLeadFromReply(params: {
  state: ConversationState;
  inboundText: string | null;
  parsedLead: ParsedLeadFields;
  nowMs: number;
  nowIso: string;
  demoHandled: boolean;
  leadWindowMs: number;
}): {
  captured: boolean;
  state: ConversationState;
  replyText?: string;
  parsedLead?: ParsedLeadFields;
} {
  if (params.demoHandled || !params.inboundText || !params.state.leadRequestedAt) {
    return { captured: false, state: params.state };
  }
  const requestedAtMs = Date.parse(params.state.leadRequestedAt);
  if (Number.isNaN(requestedAtMs) || params.nowMs - requestedAtMs > params.leadWindowMs) {
    return { captured: false, state: params.state };
  }

  const hasAtLeastTwo =
    Number(Boolean(params.parsedLead.name)) +
      Number(Boolean(params.parsedLead.city)) +
      Number(Boolean(params.parsedLead.serviceType)) >=
    2;
  if (!hasAtLeastTwo && params.inboundText.length < 10) {
    return { captured: false, state: params.state };
  }

  const nextState: ConversationState = {
    ...params.state,
    leadRequestedAt: undefined,
    leadCapturedAt: params.nowIso,
    flow: undefined,
    flowStep: undefined,
    answers: undefined,
  };

  const replyText = params.parsedLead.name
    ? `Perfeito, ${params.parsedLead.name}. Já registrei seu pedido. Um atendente chama você em seguida.`
    : "Perfeito. Já registrei seu pedido. Um atendente chama você em seguida.";

  return {
    captured: true,
    state: nextState,
    replyText,
    parsedLead: params.parsedLead,
  };
}

function saveFlowAnswer(answers: QuoteSiteAnswers, step: number, text: string): QuoteSiteAnswers {
  const next = { ...answers };
  if (!text) {
    return next;
  }
  if (step === 1) next.companyCity = text;
  if (step === 2) next.siteType = text;
  if (step === 3) next.pages = text;
  if (step === 4) next.items = text;
  if (step === 5) next.brandAssets = text;
  if (step === 6) next.deadline = text;
  return next;
}

function consolidateAnswers(answers: QuoteSiteAnswers, text: string | null): QuoteSiteAnswers {
  if (!text) {
    return answers;
  }
  const next = { ...answers };
  const normalized = text.toLowerCase();
  if (/contab/.test(normalized)) {
    next.segment = "contabilidade";
  }
  if (/(site novo|novo site|site novo)/i.test(normalized)) {
    next.siteNew = true;
  }
  return next;
}

function buildQuoteSummary(answers: QuoteSiteAnswers): string {
  const bullets = [
    `Empresa/Cidade: ${answers.companyCity ?? "não informado"}`,
    `Tipo de site: ${answers.siteType ?? "não informado"}`,
    `Páginas: ${answers.pages ?? "não informado"}`,
    `Itens: ${answers.items ?? "não informado"}`,
    `Domínio/Identidade: ${answers.brandAssets ?? "não informado"}`,
    `Prazo: ${answers.deadline ?? "não informado"}`,
  ];

  const packages = [
    "Essencial: R$ 2.500 a R$ 4.000 (2-3 semanas)",
    "Profissional: R$ 4.500 a R$ 8.000 (3-5 semanas)",
    "Premium: R$ 9.000 a R$ 18.000 (5-8 semanas)",
  ];

  return [
    "Perfeito! Resumo do briefing:",
    ...bullets.map((item) => `- ${item}`),
    "",
    "Pacotes estimados:",
    ...packages.map((item) => `- ${item}`),
    "",
    "Posso te enviar uma proposta formal? Qual seu e-mail?",
  ].join("\n");
}

function looksLikeDemoInterruption(text: string) {
  if (!text) {
    return false;
  }
  const normalized = text.toLowerCase();
  const hasDemoKeyword =
    /(demo|demonstra|agend|reagendar|apresenta|reuni[aã]o|call)/i.test(normalized);
  const hasDayOrDate =
    /\b(hoje|amanh[aã]|segunda|terca|terça|quarta|quinta|sexta|sabado|sábado|domingo)\b/i.test(
      normalized
    ) || /\b\d{1,2}\/\d{1,2}\b/.test(normalized);
  const hasHour =
    /\b([01]?\d|2[0-3])\s*(h|hs)\b/i.test(normalized) ||
    /\b([01]?\d|2[0-3]):[0-5]\d\b/.test(normalized);

  return hasDemoKeyword || (hasDayOrDate && hasHour);
}

function normalizeConversationTextLite(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function logConversationWindow(
  state: ConversationState,
  meta?: { route?: string; method?: string; requestId?: string }
) {
  logger.info({
    event: "conversation.window",
    waId: maskNumber(state.waId),
    ...(state.conversationKey ? { conversationKey: state.conversationKey } : {}),
    isOpen: state.window.isOpen,
    expiresAt: state.window.expiresAt,
    route: meta?.route,
    method: meta?.method,
    requestId: meta?.requestId,
  });
}

export function logConversationIntent(
  state: ConversationState,
  meta?: { route?: string; method?: string; requestId?: string }
) {
  logger.info({
    event: "conversation.intent",
    waId: maskNumber(state.waId),
    ...(state.conversationKey ? { conversationKey: state.conversationKey } : {}),
    intent: state.intent ?? "unknown",
    route: meta?.route,
    method: meta?.method,
    requestId: meta?.requestId,
  });
}

function maskNumber(number: string) {
  const tail = number.slice(-6);
  return `***${tail}`;
}
