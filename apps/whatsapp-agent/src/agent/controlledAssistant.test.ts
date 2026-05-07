import test from "node:test";
import assert from "node:assert/strict";
import {
  generateControlledAssistantReply,
  getAiAssistantState,
  isSimpleQuestion,
} from "./controlledAssistant.js";
import { AgentBrain } from "./agent.types.js";
import { ConversationState } from "../conversation/conversation.types.js";

const baseState: ConversationState = {
  waId: "558499999999",
  firstSeenAt: "2026-05-07T10:00:00.000Z",
  lastInboundAt: "2026-05-07T10:00:00.000Z",
  window: { isOpen: true, expiresAt: "2026-05-08T10:00:00.000Z" },
  intent: "unknown",
  handoff: { status: "none" },
  mode: "BOT",
  answers: {
    flowContext: {
      area: "previdenciario",
      servico: "bpc_loas",
      cpf: "nao_deve_ir",
    },
  },
};

test("isSimpleQuestion accepts general educational questions", () => {
  assert.equal(isSimpleQuestion("O que é BPC?"), true);
  assert.equal(isSimpleQuestion("Como funciona aposentadoria?"), true);
});

test("isSimpleQuestion blocks concrete legal or sensitive questions", () => {
  assert.equal(isSimpleQuestion("Tenho direito ao BPC?"), false);
  assert.equal(isSimpleQuestion("Quanto vou receber de aposentadoria?"), false);
  assert.equal(isSimpleQuestion("Meu CPF é 123.456.789-00, analise meu caso"), false);
});

test("generateControlledAssistantReply sanitizes context and appends required suffix", async () => {
  const calls: Array<{ businessContext?: string; inboundText: string }> = [];
  const brain: AgentBrain = {
    async generateReply(input) {
      calls.push({
        businessContext: input.businessContext,
        inboundText: input.inboundText,
      });
      return {
        text: "BPC/LOAS é um benefício assistencial para pessoas que cumprem critérios legais.",
        source: "ai",
        model: "test-model",
      };
    },
  };

  const result = await generateControlledAssistantReply({
    brain,
    text: "O que é BPC?",
    tenant: {
      name: "Justa",
      defaultLanguage: "pt_BR",
      aiBusinessContext: "Direito previdenciario.",
      aiAssistantProfile: "legal_previdenciario",
    },
    clientProfile: "business",
    state: baseState,
    nowIso: "2026-05-07T10:00:00.000Z",
  });

  assert.equal(result.ok, true);
  assert.match(result.ok ? result.text : "", /Se quiser, posso te orientar melhor conforme sua situação\./);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].businessContext?.includes("cpf"), false);
});

test("generateControlledAssistantReply does not call brain for complex questions", async () => {
  let called = false;
  const brain: AgentBrain = {
    async generateReply() {
      called = true;
      return { text: "nao deveria", source: "ai" };
    },
  };

  const result = await generateControlledAssistantReply({
    brain,
    text: "Tenho direito ao benefício?",
    tenant: {
      name: "Justa",
      defaultLanguage: "pt_BR",
      aiBusinessContext: "Direito previdenciario.",
    },
    state: baseState,
    nowIso: "2026-05-07T10:00:00.000Z",
  });

  assert.equal(result.ok, false);
  assert.equal(called, false);
});

test("getAiAssistantState normalizes missing state", () => {
  assert.deepEqual(getAiAssistantState(baseState), {
    count: 0,
    lastRespondedAt: null,
    lastMessageId: null,
  });
});
