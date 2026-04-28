import test from "node:test";
import assert from "node:assert/strict";
import {
  clearChatbotRuntime,
  executeChatbotFlow,
  validateChatbotFlowDefinition,
} from "./chatbotFlow.js";
import { ConversationState } from "../conversation/conversation.types.js";

function makeState(overrides?: Partial<ConversationState>): ConversationState {
  return {
    waId: "5511999999999",
    firstSeenAt: "2026-04-17T10:00:00.000Z",
    lastInboundAt: "2026-04-17T10:00:00.000Z",
    window: { isOpen: true, expiresAt: "2026-04-18T10:00:00.000Z" },
    handoff: { status: "none" },
    answers: {},
    mode: "BOT",
    chatbotActive: false,
    ...overrides,
  };
}

test("validateChatbotFlowDefinition accepts valid flow", () => {
  const result = validateChatbotFlowDefinition({
    start: "menu",
    nodes: {
      menu: {
        type: "menu",
        text: "Escolha",
        options: [{ label: "Atendimento", next: "text_1" }],
      },
      text_1: {
        type: "text",
        text: "Tudo certo",
      },
    },
  });
  assert.equal(result.ok, true);
});

test("validateChatbotFlowDefinition rejects invalid next", () => {
  const result = validateChatbotFlowDefinition({
    start: "menu",
    nodes: {
      menu: {
        type: "menu",
        text: "Escolha",
        options: [{ label: "Atendimento", next: "missing" }],
      },
    },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "invalid_chatbot_definition");
  }
});

test("executeChatbotFlow starts in menu and waits for numeric answer", () => {
  const validated = validateChatbotFlowDefinition({
    start: "menu",
    nodes: {
      menu: {
        type: "menu",
        text: "Escolha",
        options: [{ label: "Atendimento", next: "text_1" }],
      },
      text_1: {
        type: "text",
        text: "Tudo certo",
      },
    },
  });
  assert.equal(validated.ok, true);
  if (!validated.ok) return;

  const result = executeChatbotFlow({
    flowId: "flow_1",
    definition: validated.definition,
    state: makeState(),
    inboundText: "oi",
    nowIso: "2026-04-17T10:00:01.000Z",
  });

  assert.equal(result.handled, true);
  assert.equal(result.state.chatbotActive, true);
  assert.equal(result.state.chatbotNodeId, "menu");
  assert.match(result.replyText ?? "", /1\. Atendimento/);
});

test("executeChatbotFlow repeats menu on invalid answer", () => {
  const validated = validateChatbotFlowDefinition({
    start: "menu",
    nodes: {
      menu: {
        type: "menu",
        text: "Escolha",
        options: [{ label: "Atendimento", next: "text_1" }],
      },
      text_1: {
        type: "text",
        text: "Tudo certo",
      },
    },
  });
  assert.equal(validated.ok, true);
  if (!validated.ok) return;

  const result = executeChatbotFlow({
    flowId: "flow_1",
    definition: validated.definition,
    state: makeState({
      flow: "chatbot:flow_1",
      chatbotActive: true,
      chatbotNodeId: "menu",
    }),
    inboundText: "abc",
    nowIso: "2026-04-17T10:00:02.000Z",
  });

  assert.equal(result.handled, true);
  assert.equal(result.state.chatbotActive, true);
  assert.equal(result.state.chatbotNodeId, "menu");
  assert.match(result.replyText ?? "", /Escolha/);
});

test("executeChatbotFlow follows text next and reaches handoff", () => {
  const validated = validateChatbotFlowDefinition({
    start: "menu",
    nodes: {
      menu: {
        type: "menu",
        text: "Escolha",
        options: [{ label: "Humano", next: "text_1" }],
      },
      text_1: {
        type: "text",
        text: "Vou te encaminhar.",
        next: "handoff_1",
      },
      handoff_1: {
        type: "handoff",
      },
    },
  });
  assert.equal(validated.ok, true);
  if (!validated.ok) return;

  const result = executeChatbotFlow({
    flowId: "flow_1",
    definition: validated.definition,
    state: makeState({
      flow: "chatbot:flow_1",
      chatbotActive: true,
      chatbotNodeId: "menu",
    }),
    inboundText: "1",
    nowIso: "2026-04-17T10:00:03.000Z",
  });

  assert.equal(result.handled, true);
  assert.equal(result.state.chatbotActive, false);
  assert.equal(result.state.chatbotNodeId, undefined);
  assert.equal(result.state.handoff.status, "none");
  assert.equal(result.pendingHandoff?.feedbackText, "Vou te transferir para um atendente humano.");
  assert.equal(result.events?.some((event) => event.event === "flow.node.auto_advanced"), true);
  assert.match(result.replyText ?? "", /Vou te encaminhar/);
});

test("executeChatbotFlow returns handoff feedback before human activation", () => {
  const validated = validateChatbotFlowDefinition({
    start: "menu",
    nodes: {
      menu: {
        type: "menu",
        text: "Escolha",
        options: [{ label: "Humano", next: "handoff_1" }],
      },
      handoff_1: {
        type: "handoff",
        text: "Vou encaminhar para um especialista agora.",
      },
    },
  });
  assert.equal(validated.ok, true);
  if (!validated.ok) return;

  const result = executeChatbotFlow({
    flowId: "flow_1",
    definition: validated.definition,
    state: makeState({
      flow: "chatbot:flow_1",
      chatbotActive: true,
      chatbotNodeId: "menu",
    }),
    inboundText: "1",
    nowIso: "2026-04-17T10:00:03.000Z",
  });

  assert.equal(result.handled, true);
  assert.equal(result.state.handoff.status, "none");
  assert.equal(result.state.mode, "BOT");
  assert.equal(result.pendingHandoff?.feedbackText, "Vou encaminhar para um especialista agora.");
  assert.equal(result.replyText, "Vou encaminhar para um especialista agora.");
});

test("clearChatbotRuntime removes chatbot state", () => {
  const cleared = clearChatbotRuntime(
    makeState({
      flow: "chatbot:flow_1",
      chatbotActive: true,
      chatbotNodeId: "menu",
    })
  );
  assert.equal(cleared.chatbotActive, false);
  assert.equal(cleared.chatbotNodeId, undefined);
  assert.equal(cleared.flow, undefined);
});

test("executeChatbotFlow stops long chains to avoid runaway execution", () => {
  const nodes: Record<string, { type: "text"; text: string; next?: string }> = {};
  for (let index = 0; index < 14; index += 1) {
    nodes[`n${index}`] = {
      type: "text",
      text: `Passo ${index}`,
      ...(index < 13 ? { next: `n${index + 1}` } : {}),
    };
  }

  const validated = validateChatbotFlowDefinition({
    start: "n0",
    nodes,
  });
  assert.equal(validated.ok, true);
  if (!validated.ok) return;

  const result = executeChatbotFlow({
    flowId: "flow_long",
    definition: validated.definition,
    state: makeState(),
    inboundText: "oi",
    nowIso: "2026-04-17T10:00:04.000Z",
  });

  assert.equal(result.handled, false);
  assert.equal(result.state.chatbotActive, false);
  assert.equal(result.state.chatbotNodeId, undefined);
});
