import test from "node:test";
import assert from "node:assert/strict";
import {
  clearAutomationRuntimeAnswers,
  shouldResetClosedConversationForBotReentry,
} from "./automationRuntime.js";

test("clearAutomationRuntimeAnswers removes transient AI state and preserves CRM context", () => {
  const result = clearAutomationRuntimeAnswers({
    email: "cliente@example.com",
    flowTags: ["qualification:slot:email"],
    aiAssistant: { count: 6 },
    aiMemory: { summary: "old" },
    aiOrchestrator: { stage: "handoff_recommended" },
    aiQualification: { currentSlot: "email" },
    flowContext: {
      produto_interesse: "vestido",
      qualification: { missingSlots: ["email"] },
    },
  });

  assert.deepEqual(result, {
    email: "cliente@example.com",
    flowContext: {
      produto_interesse: "vestido",
    },
  });
});

test("shouldResetClosedConversationForBotReentry resets inbound after closed status", () => {
  assert.equal(
    shouldResetClosedConversationForBotReentry({
      status: "CLOSED",
      closedAt: "2026-06-07T17:11:28.976Z",
      inboundAt: new Date("2026-06-07T17:12:31.000Z"),
    }),
    true
  );
  assert.equal(
    shouldResetClosedConversationForBotReentry({
      status: "WAITING",
      closedAt: "2026-06-07T17:11:28.976Z",
      inboundAt: new Date("2026-06-07T17:12:31.000Z"),
    }),
    false
  );
});
