import { logger } from "../logger/logger.js";
import { Storage } from "../storage/storage.js";
import { ConversationIntent, ConversationState } from "./conversation.types.js";

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
    botPaused: false,
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
  if (/(preço|valor|orçamento|quanto custa)/i.test(value)) {
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
  if (nextIntent === "handoff") {
    const pausedAt = Number.isNaN(Date.parse(timestamp))
      ? new Date().toISOString()
      : new Date(Date.parse(timestamp)).toISOString();
    return {
      ...next,
      intent: nextIntent,
      botPaused: true,
      pausedReason: "handoff",
      pausedAt,
    };
  }
  return { ...next, intent: nextIntent };
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

export function isWindowOpen(state: ConversationState, now: number) {
  if (!state.window.isOpen || !state.window.expiresAt) {
    return false;
  }
  return now < Date.parse(state.window.expiresAt);
}

export function shouldAutoReply(state: ConversationState) {
  return !state.botPaused;
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
    const pausedAt = new Date().toISOString();
    return {
      handled: true,
      action: "pause",
      state: {
        ...state,
        botPaused: true,
        pausedReason: "admin",
        pausedAt,
      },
    };
  }
  if (command === "#bot on") {
    return {
      handled: true,
      action: "resume",
      state: {
        ...state,
        botPaused: false,
        pausedReason: undefined,
        pausedAt: undefined,
      },
    };
  }
  return { state, handled: false };
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
