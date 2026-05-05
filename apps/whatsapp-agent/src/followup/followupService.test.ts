import test from "node:test";
import assert from "node:assert/strict";
import { ConversationOperationalStatus, HandoffStatus } from "@prisma/client";
import {
  buildFollowUpMessage,
  evaluateFollowUpEligibility,
} from "./followupService.js";

const now = new Date("2026-05-05T12:00:00.000Z");
const lastInboundAt = new Date("2026-05-05T10:00:00.000Z");
const lastOutboundAt = new Date("2026-05-05T10:30:00.000Z");
const windowExpiresAt = new Date("2026-05-06T10:00:00.000Z");

function makeState(overrides: Record<string, unknown> = {}) {
  return {
    id: "runtime-1",
    clientId: "client-1",
    waId: "5584999999999",
    waIdCanonical: "5584999999999",
    conversationKey: "conv-1",
    windowIsOpen: true,
    windowExpiresAt,
    lastInboundAt,
    lastOutboundAt,
    handoffStatus: HandoffStatus.NONE,
    chatbotNodeId: "menu_bpc",
    chatbotActive: true,
    answers: {
      flowContext: {
        intent: "bpc_loas",
        servico: "bpc_loas",
      },
      flowTags: ["bpc_loas"],
    },
    mode: "BOT",
    assignedUserId: null,
    assignedTo: null,
    status: null,
    closedAt: null,
    client: {
      clientKey: "justa-advocacia",
      name: "Justa Advocacia",
    },
    ...overrides,
  };
}

function makeConversation(overrides: Record<string, unknown> = {}) {
  return {
    id: "conversation-1",
    deletedAt: null,
    anonymizedAt: null,
    closedAt: null,
    windowIsOpen: true,
    windowExpiresAt,
    ...overrides,
  };
}

test("buildFollowUpMessage returns intent-specific message without free text", () => {
  const message = buildFollowUpMessage(
    {
      intent: "beneficio_negado",
      servico: "beneficio_negado",
      observacao: "cliente informou CPF 12345678901",
    },
    ["beneficio_negado"]
  );

  assert.match(message, /benefício negado/i);
  assert.doesNotMatch(message, /12345678901/);
});

test("buildFollowUpMessage falls back to generic message", () => {
  const message = buildFollowUpMessage({}, []);

  assert.match(message, /Podemos continuar seu atendimento/);
});

test("evaluateFollowUpEligibility triggers when customer stopped after bot outbound", () => {
  const eligibility = evaluateFollowUpEligibility(makeState() as never, makeConversation() as never, {
    now,
    delayMinutes: 30,
    maxPerConversation: 1,
    minIntervalMinutes: 60,
  });

  assert.equal(eligibility.eligible, true);
  if (eligibility.eligible) {
    assert.equal(eligibility.nextCount, 1);
    assert.equal(eligibility.nodeId, "menu_bpc");
    assert.match(eligibility.requestId, /^followup:client-1:5584999999999:menu_bpc:1$/);
  }
});

test("evaluateFollowUpEligibility skips when customer already replied", () => {
  const eligibility = evaluateFollowUpEligibility(
    makeState({ lastInboundAt: new Date("2026-05-05T10:45:00.000Z") }) as never,
    makeConversation() as never,
    { now, delayMinutes: 30 }
  );

  assert.equal(eligibility.eligible, false);
  if (!eligibility.eligible) {
    assert.equal(eligibility.reason, "customer_already_replied");
  }
});

test("evaluateFollowUpEligibility skips human mode", () => {
  const eligibility = evaluateFollowUpEligibility(
    makeState({ mode: "HUMAN" }) as never,
    makeConversation() as never,
    { now, delayMinutes: 30 }
  );

  assert.equal(eligibility.eligible, false);
  if (!eligibility.eligible) {
    assert.equal(eligibility.reason, "human_mode");
  }
});

test("evaluateFollowUpEligibility skips closed window", () => {
  const eligibility = evaluateFollowUpEligibility(
    makeState({ windowExpiresAt: new Date("2026-05-05T11:00:00.000Z") }) as never,
    makeConversation({ windowExpiresAt: new Date("2026-05-05T11:00:00.000Z") }) as never,
    { now, delayMinutes: 30 }
  );

  assert.equal(eligibility.eligible, false);
  if (!eligibility.eligible) {
    assert.equal(eligibility.reason, "window_closed");
  }
});

test("evaluateFollowUpEligibility skips when follow-up limit is reached", () => {
  const eligibility = evaluateFollowUpEligibility(
    makeState({
      answers: {
        followUp: {
          count: 1,
          lastSentAt: "2026-05-05T11:00:00.000Z",
          lastRequestId: "followup:previous",
          dryRun: true,
        },
      },
    }) as never,
    makeConversation() as never,
    { now, delayMinutes: 30, maxPerConversation: 1 }
  );

  assert.equal(eligibility.eligible, false);
  if (!eligibility.eligible) {
    assert.equal(eligibility.reason, "limit_reached");
  }
});

test("evaluateFollowUpEligibility skips operationally closed conversation", () => {
  const eligibility = evaluateFollowUpEligibility(
    makeState({ status: ConversationOperationalStatus.CLOSED }) as never,
    makeConversation() as never,
    { now, delayMinutes: 30 }
  );

  assert.equal(eligibility.eligible, false);
  if (!eligibility.eligible) {
    assert.equal(eligibility.reason, "status_closed");
  }
});
