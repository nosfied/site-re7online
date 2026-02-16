import { logger } from "../logger/logger.js";
import { Storage } from "../storage/storage.js";
import {
  ConversationIntent,
  ConversationState,
  HandoffState,
  QuoteSiteAnswers,
} from "./conversation.types.js";

const WINDOW_HOURS = 24;

function addHoursIso(timestamp: string, hours: number) {
  const base = Number.isNaN(Date.parse(timestamp)) ? Date.now() : Date.parse(timestamp);
  return new Date(base + hours * 60 * 60 * 1000).toISOString();
}

export async function getOrCreateConversation(
  storage: Storage,
  waId: string,
  timestamp: string
): Promise<ConversationState> {
  const existing = await storage.getConversation(waId);
  if (existing) {
    return existing;
  }

  const firstSeenAt = Number.isNaN(Date.parse(timestamp))
    ? new Date().toISOString()
    : new Date(Date.parse(timestamp)).toISOString();
  const state: ConversationState = {
    waId,
    firstSeenAt,
    lastInboundAt: firstSeenAt,
    window: { isOpen: true, expiresAt: addHoursIso(firstSeenAt, WINDOW_HOURS) },
    intent: "unknown",
    handoff: { status: "none" },
    answers: {},
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
  return state.handoff.status !== "active";
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
    return {
      handled: true,
      outcome: "requested",
      state: withHandoff(state, {
        status: "pending",
        requestedAt: timestamp,
      }),
      replyText: "Posso transferir você para um atendente humano? Responda SIM ou NÃO.",
    };
  }

  return { state, handled: false };
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
  const normalized = text.toLowerCase();
  const hasPricing = /(orçamento|orcamento|preço|valor|quanto custa)/i.test(normalized);
  const hasSite = /\bsite\b/i.test(normalized);
  const shouldStart = hasPricing && hasSite;

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

export function logConversationWindow(
  state: ConversationState,
  meta?: { route?: string; method?: string; requestId?: string }
) {
  logger.info({
    event: "conversation.window",
    waId: maskNumber(state.waId),
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
