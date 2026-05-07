import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSafeResponse,
  classifyRisk,
  generateControlledAssistantReply,
  getAiAssistantState,
  isSimpleQuestion,
  validateOrchestratorOutput,
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

test("isSimpleQuestion supports tenant-specific topics and extra blocked terms", () => {
  assert.equal(isSimpleQuestion("Como funciona o plano?", { allowedTopics: ["plano"] }), true);
  assert.equal(
    isSimpleQuestion("Como funciona o plano?", {
      allowedTopics: ["plano"],
      blockedTerms: ["plano"],
    }),
    false
  );
});

test("classifyRisk detects concrete or sensitive requests", () => {
  assert.equal(classifyRisk("tenho direito ao BPC?"), "legal_specific_case");
  assert.equal(classifyRisk("quanto vou receber?"), "benefit_amount");
  assert.equal(classifyRisk("meu caso ganha?"), "outcome_prediction");
  assert.equal(classifyRisk("analise meu documento"), "document_analysis");
  assert.equal(classifyRisk("meu CPF é 123.456.789-00"), "personal_data");
  assert.equal(classifyRisk("como burlar o cadastro?"), "fraud_or_illicit");
});

test("classifyRisk does not block educational questions", () => {
  assert.equal(classifyRisk("o que é BPC?"), null);
  assert.equal(classifyRisk("como funciona aposentadoria?"), null);
  assert.equal(classifyRisk("quanto tempo demora?"), null);
});

test("buildSafeResponse adapts to legal and generic contexts", () => {
  const legal = buildSafeResponse("legal_specific_case", {
    tenantName: "Justa Advocacia",
    aiBusinessContext: "Direito previdenciario",
    flowContext: { area: "previdenciario", servico: "bpc_loas" },
  });
  assert.match(legal, /Não posso afirmar isso sem uma análise individual do caso/);
  assert.match(legal, /especialista/);

  const generic = buildSafeResponse("legal_specific_case", {
    tenantName: "Loja Exemplo",
    aiBusinessContext: "Venda de planos empresariais",
  });
  assert.match(generic, /Não consigo confirmar uma situação específica/);
  assert.doesNotMatch(generic.toLowerCase(), /advogado|advocacia|jurídico|juridico/);
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
    },
    state: baseState,
    nowIso: "2026-05-07T10:00:00.000Z",
  });

  assert.equal(result.ok, true);
  assert.match(result.ok ? result.text : "", /Se quiser, posso te orientar melhor conforme sua situação\./);
  assert.equal(result.ok ? result.output.stage : null, "triage");
  assert.equal(result.ok ? result.output.next_action : null, "answer");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].businessContext?.includes("cpf"), false);
});

test("generateControlledAssistantReply accepts structured orchestrator output", async () => {
  const brain: AgentBrain = {
    async generateReply() {
      return {
        text: JSON.stringify({
          reply: "BPC/LOAS é um benefício assistencial explicado de forma geral.",
          stage: "qualification",
          goal: "discover_service",
          confidence: 0.82,
          missing_information: ["tipo_de_beneficio"],
          next_action: "ask_question",
          next_question: "Você quer entender requisitos ou próximos passos?",
          handoff_recommended: false,
          lead_temp: "morno",
          priority: "media",
        }),
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
    },
    state: baseState,
    nowIso: "2026-05-07T10:00:00.000Z",
  });

  assert.equal(result.ok, true);
  assert.equal(result.ok ? result.output.stage : null, "qualification");
  assert.equal(result.ok ? result.output.next_action : null, "ask_question");
  assert.deepEqual(result.ok ? result.output.missing_information : [], ["tipo_de_beneficio"]);
});

test("validateOrchestratorOutput rejects invalid schema", () => {
  assert.equal(
    validateOrchestratorOutput({
      reply: "Resposta segura.",
      stage: "unknown",
      confidence: 0.7,
      next_action: "answer",
    }).ok,
    false
  );
  assert.equal(
    validateOrchestratorOutput({
      reply: "Resposta segura.",
      stage: "triage",
      confidence: 1.2,
      next_action: "answer",
    }).ok,
    false
  );
  assert.equal(
    validateOrchestratorOutput({
      reply: "Resposta segura.",
      stage: "triage",
      confidence: 0.7,
      next_action: "execute_transfer",
    }).ok,
    false
  );
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
