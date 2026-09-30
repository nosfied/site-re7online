import assert from "node:assert/strict";
import test from "node:test";

import {
  handleHandoff,
  isWindowOpen,
  shouldRunLegacyHandoffAutomation,
} from "./conversation.service.js";
import type { ConversationState } from "./conversation.types.js";

function makeConversation(overrides: Partial<ConversationState> = {}): ConversationState {
  return {
    clientKey: "tenant",
    conversationKey: "tenant:5584999999999",
    waId: "5584999999999",
    waIdCanonical: "5584999999999",
    firstSeenAt: "2026-08-27T12:00:00.000Z",
    lastInboundAt: "2026-08-27T12:00:00.000Z",
    window: { isOpen: true, expiresAt: "2026-08-28T12:00:00.000Z" },
    intent: "unknown",
    handoff: { status: "none" },
    demoStatus: "none",
    answers: {},
    mode: "BOT",
    assignedUserId: null,
    assignedTo: null,
    assignedAt: null,
    ...overrides,
  };
}

test("isWindowOpen closes exactly at expiration boundary", () => {
  const state = makeConversation({
    window: { isOpen: true, expiresAt: "2026-08-28T12:00:00.000Z" },
  });

  assert.equal(isWindowOpen(state, Date.parse("2026-08-28T11:59:59.999Z")), true);
  assert.equal(isWindowOpen(state, Date.parse("2026-08-28T12:00:00.000Z")), false);
  assert.equal(isWindowOpen(makeConversation({ window: { isOpen: false, expiresAt: "2026-08-28T12:00:00.000Z" } }), Date.parse("2026-08-28T11:00:00.000Z")), false);
  assert.equal(isWindowOpen(makeConversation({ window: { isOpen: true, expiresAt: undefined } }), Date.parse("2026-08-28T11:00:00.000Z")), false);
});

test("legacy handoff automation respects tenant disable flag", () => {
  assert.equal(
    shouldRunLegacyHandoffAutomation({
      disableLegacyFlows: true,
      supervisedAiHandoffEnabled: false,
      wasPending: false,
      hasConfigurableChatbotFlow: false,
    }),
    false
  );
  assert.equal(
    shouldRunLegacyHandoffAutomation({
      disableLegacyFlows: true,
      supervisedAiHandoffEnabled: false,
      wasPending: true,
      hasConfigurableChatbotFlow: false,
    }),
    false
  );
});

test("legacy handoff automation preserves enabled tenant behavior", () => {
  assert.equal(
    shouldRunLegacyHandoffAutomation({
      disableLegacyFlows: false,
      supervisedAiHandoffEnabled: false,
      wasPending: false,
      hasConfigurableChatbotFlow: false,
    }),
    true
  );
  assert.equal(
    shouldRunLegacyHandoffAutomation({
      disableLegacyFlows: false,
      supervisedAiHandoffEnabled: false,
      wasPending: true,
      hasConfigurableChatbotFlow: true,
    }),
    true
  );
});

test("legacy handoff automation stays blocked for configurable chatbot or supervised AI", () => {
  assert.equal(
    shouldRunLegacyHandoffAutomation({
      disableLegacyFlows: false,
      supervisedAiHandoffEnabled: false,
      wasPending: false,
      hasConfigurableChatbotFlow: true,
    }),
    false
  );
  assert.equal(
    shouldRunLegacyHandoffAutomation({
      disableLegacyFlows: false,
      supervisedAiHandoffEnabled: true,
      wasPending: true,
      hasConfigurableChatbotFlow: false,
    }),
    false
  );
});

test("legacy handoff prompt and pending reply remain unchanged when automation is allowed", () => {
  const requested = handleHandoff(makeConversation(), "quero falar com atendente", "2026-08-27T12:01:00.000Z");
  assert.equal(requested.handled, true);
  assert.equal(requested.outcome, "requested");
  assert.equal(requested.replyText, "Posso transferir voce para um atendente humano? Responda SIM ou NAO.");

  const invalidPendingReply = handleHandoff(
    makeConversation({ handoff: { status: "pending", requestedAt: "2026-08-27T12:01:00.000Z" } }),
    "talvez",
    "2026-08-27T12:02:00.000Z"
  );
  assert.equal(invalidPendingReply.handled, true);
  assert.equal(invalidPendingReply.outcome, "requested");
  assert.equal(invalidPendingReply.replyText, "Responda apenas SIM ou NÃO para que eu possa transferir.");
});
