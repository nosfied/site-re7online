import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHandoffConfirmationPrompt,
  buildAssistantLimitReachedReply,
  buildAssistantGreetingReply,
  buildAssistantFallbackGuidance,
  buildContextualFallbackReply,
  buildSafeResponse,
  calculateHandoffScore,
  classifyAssistantFallback,
  classifyContextualFallback,
  classifyEducationalIntent,
  canEvaluateHandoffRecommendation,
  classifyRisk,
  generateControlledAssistantReply,
  getAiAssistantState,
  isSimpleQuestion,
  resolveOrchestratorAction,
  shouldSendHandoffConfirmationPrompt,
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
  assert.equal(isSimpleQuestion("O que é BPC?"), false);
  assert.equal(isSimpleQuestion("Como funciona aposentadoria?"), false);
  assert.equal(isSimpleQuestion("O que é BPC?", { allowedTopics: ["bpc"] }), true);
  assert.equal(isSimpleQuestion("Como funciona aposentadoria?", { allowedTopics: ["aposentadoria"] }), true);
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

test("classifyEducationalIntent routes broader tenant educational questions", () => {
  assert.deepEqual(
    classifyEducationalIntent("sou homem, posso me aposentar com quantos anos em 2026?", {
      allowedTopics: ["aposentar", "aposentadoria"],
    }),
    {
      allowed: true,
      educational: true,
      topic: "aposentar",
      reason: "educational_pattern_and_allowed_topic",
    }
  );
  assert.equal(
    classifyEducationalIntent("qual preço é cobrado pelos serviços?", {
      allowedTopics: ["serviço", "preço"],
    }).allowed,
    true
  );
  assert.equal(
    classifyEducationalIntent("qual preço é cobrado?", {
      allowedTopics: ["aposentadoria"],
    }).reason,
    "topic_not_allowed"
  );
});

test("classifyContextualFallback handles light intents and tenant secondary topics", () => {
  assert.deepEqual(classifyContextualFallback("boa noite"), {
    type: "greeting",
    confidence: 0.9,
    reason: "greeting_exact",
  });
  assert.equal(classifyContextualFallback("não quero").type, "negative");
  assert.equal(classifyContextualFallback("não entendi bem").type, "clarification");
  assert.equal(
    classifyContextualFallback("vocês fazem divórcio?", {
      aiAssistantSecondaryTopics: ["divórcio", "família"],
    }).type,
    "near_domain"
  );
  assert.equal(
    classifyContextualFallback("vocês vendem material esportivo?", {
      aiAssistantAllowedTopics: ["aposentadoria", "bpc"],
    }).type,
    "out_of_scope"
  );
  assert.equal(
    classifyEducationalIntent("qual a carência para gravidez?", {
      allowedTopics: ["carência gravidez", "gravidez"],
    }).allowed,
    true
  );
});

test("buildContextualFallbackReply uses short universal replies and anti-repeat", () => {
  assert.equal(
    buildContextualFallbackReply({ result: classifyContextualFallback("boa noite") }),
    "Olá! Me diga em poucas palavras como posso te ajudar."
  );
  assert.equal(
    buildContextualFallbackReply({
      result: { type: "help", confidence: 0.8, reason: "help_request" },
      fallbackMessage: "Mensagem do tenant.",
    }),
    "Mensagem do tenant."
  );
  assert.equal(
    buildContextualFallbackReply({
      result: { type: "out_of_scope", confidence: 0.7, reason: "topic_not_allowed" },
      repeated: true,
    }),
    "Entendi. Quer que eu direcione para uma pessoa da equipe?"
  );
});

test("buildAssistantLimitReachedReply does not depend on LLM output", () => {
  assert.equal(
    buildAssistantLimitReachedReply({
      context: {
        fallbackMessage: "Mensagem longa do tenant.",
      },
      canOfferHandoff: false,
    }),
    "Para continuar com segurança, posso direcionar você para uma pessoa da equipe."
  );
  assert.equal(
    buildAssistantLimitReachedReply({
      context: {
        handoffPrompt: "Posso encaminhar para a equipe?",
      },
      canOfferHandoff: true,
    }),
    "Posso encaminhar para a equipe?"
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
  assert.match(legal, /Não consigo confirmar uma situação específica/);
  assert.doesNotMatch(legal.toLowerCase(), /advogado|advocacia|jurídico|juridico|previdenci/);

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
      aiAssistantAllowedTopics: ["bpc", "loas"],
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
      aiAssistantAllowedTopics: ["bpc", "loas"],
    },
    state: baseState,
    nowIso: "2026-05-07T10:00:00.000Z",
  });

  assert.equal(result.ok, true);
  assert.equal(result.ok ? result.output.stage : null, "qualification");
  assert.equal(result.ok ? result.output.next_action : null, "ask_question");
  assert.deepEqual(result.ok ? result.output.missing_information : [], ["tipo_de_beneficio"]);
});

test("generateControlledAssistantReply rejects truncated JSON instead of sending code", async () => {
  const brain: AgentBrain = {
    async generateReply() {
      return {
        text: '{"reply":"Olá!","stage":"triage","goal":"explain_general_topic","confidence":0.9',
        source: "ai",
        model: "test-model",
      };
    },
  };

  const result = await generateControlledAssistantReply({
    brain,
    text: "sou homem, posso me aposentar com quantos anos em 2026?",
    tenant: {
      name: "Justa",
      defaultLanguage: "pt_BR",
      aiBusinessContext: "Direito previdenciario.",
      aiAssistantAllowedTopics: ["aposentar", "aposentadoria"],
    },
    state: baseState,
    nowIso: "2026-05-07T10:00:00.000Z",
  });

  assert.deepEqual(result, { ok: false, reason: "invalid_json_output" });
});

test("buildAssistantGreetingReply is short and neutral", () => {
  assert.equal(buildAssistantGreetingReply(), "Olá! Me diga em poucas palavras como posso te ajudar.");
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

test("resolveOrchestratorAction handles allowed 60B actions", () => {
  const baseOutput = validateOrchestratorOutput({
    reply: "Resposta geral segura.",
    stage: "triage",
    goal: "explain_general_topic",
    confidence: 0.8,
    missing_information: [],
    next_action: "answer",
    handoff_recommended: false,
  });
  assert.equal(baseOutput.ok, true);
  if (!baseOutput.ok) return;

  assert.deepEqual(resolveOrchestratorAction(baseOutput.output, "Menu seguro.").action, "answer");

  const askOutput = {
    ...baseOutput.output,
    next_action: "ask_question" as const,
    next_question: "Você quer entender requisitos ou próximos passos?",
  };
  const askAction = resolveOrchestratorAction(askOutput, "Menu seguro.");
  assert.equal(askAction.shouldSend, true);
  assert.equal(askAction.action, "ask_question");
  assert.equal(askAction.shouldSend ? askAction.text : "", askOutput.next_question);

  const invalidAskAction = resolveOrchestratorAction(
    {
      ...baseOutput.output,
      next_action: "ask_question",
      next_question: "Qual seu CPF?",
    },
    "Menu seguro."
  );
  assert.equal(invalidAskAction.shouldSend, true);
  assert.equal(invalidAskAction.action, "answer");

  const noReplyAction = resolveOrchestratorAction(
    { ...baseOutput.output, next_action: "no_reply" },
    "Menu seguro."
  );
  assert.equal(noReplyAction.shouldSend, false);
  assert.equal(noReplyAction.action, "no_reply");

  const fallbackAction = resolveOrchestratorAction(
    { ...baseOutput.output, next_action: "fallback_menu" },
    "Menu seguro."
  );
  assert.equal(fallbackAction.shouldSend, true);
  assert.equal(fallbackAction.action, "fallback_menu");
});

test("resolveOrchestratorAction ignores handoff actions in 60B", () => {
  const output = validateOrchestratorOutput({
    reply: "Posso te direcionar para atendimento, se preferir.",
    stage: "handoff_recommended",
    goal: "recommend_handoff",
    confidence: 0.8,
    missing_information: [],
    next_action: "handoff_force",
    handoff_recommended: true,
  });
  assert.equal(output.ok, true);
  if (!output.ok) return;
  const action = resolveOrchestratorAction(output.output, "Menu seguro.");
  assert.equal(action.shouldSend, true);
  assert.equal(action.action, "handoff_force_ignored");
  assert.equal(action.ignoredAction, "handoff_force");
});

test("calculateHandoffScore allows high-confidence supervised recommendation with strong signals", () => {
  const output = validateOrchestratorOutput({
    reply: "Posso te direcionar para atendimento, se preferir.",
    stage: "handoff_recommended",
    goal: "recommend_handoff",
    confidence: 0.8,
    missing_information: [],
    next_action: "handoff_recommend",
    handoff_recommended: true,
    lead_temp: "quente",
    priority: "alta",
  });
  assert.equal(output.ok, true);
  if (!output.ok) return;
  const score = calculateHandoffScore({ output: output.output });
  assert.equal(score.allowed, true);
  assert.equal(score.score >= 3, true);
  assert.equal(score.reasons.includes("explicit_human_request"), true);
  assert.equal(score.reasons.includes("lead_hot"), true);
  assert.equal(score.reasons.includes("priority_high"), true);
});

test("calculateHandoffScore denies low signal recommendation", () => {
  const output = validateOrchestratorOutput({
    reply: "Posso seguir explicando de forma geral.",
    stage: "triage",
    goal: "explain_general_topic",
    confidence: 0.92,
    missing_information: [],
    next_action: "answer",
    handoff_recommended: true,
  });
  assert.equal(output.ok, true);
  if (!output.ok) return;
  const score = calculateHandoffScore({ output: output.output });
  assert.equal(score.allowed, false);
  assert.equal(score.score, 0);
});

test("calculateHandoffScore includes guardrail, low confidence and repeated missing information", () => {
  const output = validateOrchestratorOutput({
    reply: "Posso te explicar o caminho geral.",
    stage: "clarification",
    goal: "collect_safe_context",
    confidence: 0.42,
    missing_information: ["benefit_type"],
    next_action: "answer",
    handoff_recommended: true,
  });
  assert.equal(output.ok, true);
  if (!output.ok) return;
  const score = calculateHandoffScore({
    output: output.output,
    previousMissingInformation: ["benefit_type"],
    guardrailRisk: "document_analysis",
  });
  assert.equal(score.allowed, true);
  assert.equal(score.reasons.includes("guardrail_document_analysis"), true);
  assert.equal(score.reasons.includes("confidence_below_045"), true);
  assert.equal(score.reasons.includes("missing_information_repeated"), true);
});

test("canEvaluateHandoffRecommendation blocks unsafe operational states", () => {
  assert.deepEqual(
    canEvaluateHandoffRecommendation({
      state: { ...baseState, mode: "HUMAN" },
      windowOpen: true,
      tenantAiEnabled: true,
      tenantFallbackToHandoff: true,
    }),
    { ok: false, reason: "human_mode" }
  );
  assert.deepEqual(
    canEvaluateHandoffRecommendation({
      state: { ...baseState, handoff: { status: "active" } },
      windowOpen: true,
      tenantAiEnabled: true,
      tenantFallbackToHandoff: true,
    }),
    { ok: false, reason: "handoff_active" }
  );
  assert.deepEqual(
    canEvaluateHandoffRecommendation({
      state: { ...baseState, chatbotActive: true, chatbotNodeId: "menu_principal" },
      windowOpen: true,
      tenantAiEnabled: true,
      tenantFallbackToHandoff: true,
    }),
    { ok: false, reason: "flow_active" }
  );
  assert.deepEqual(
    canEvaluateHandoffRecommendation({
      state: baseState,
      windowOpen: true,
      tenantAiEnabled: true,
      tenantFallbackToHandoff: false,
    }),
    { ok: false, reason: "tenant_handoff_fallback_disabled" }
  );
});

test("buildHandoffConfirmationPrompt uses neutral global fallback", () => {
  assert.equal(
    buildHandoffConfirmationPrompt({
      context: {
        tenantName: "Justa Advocacia",
        aiBusinessContext: "Direito previdenciario",
        flowContext: { area: "previdenciario" },
      },
    }),
    "Para te orientar melhor, posso direcionar seu atendimento para uma pessoa da equipe?"
  );
  assert.equal(
    buildHandoffConfirmationPrompt({
      context: {
        tenantName: "Loja Exemplo",
        aiBusinessContext: "Atendimento comercial",
      },
    }),
    "Para te orientar melhor, posso direcionar seu atendimento para uma pessoa da equipe?"
  );
});

test("assistant fallback classification uses universal and tenant handoff signals", () => {
  assert.deepEqual(classifyAssistantFallback("quero falar com atendente"), {
    intent: "handoff_prompt",
    reason: "handoff_signal",
  });
  assert.deepEqual(
    classifyAssistantFallback("preciso falar com consultor", {
      handoffKeywords: ["consultor"],
    }),
    {
      intent: "handoff_prompt",
      reason: "handoff_signal",
    }
  );
  assert.deepEqual(classifyAssistantFallback("oi"), {
    intent: "generic_guidance",
    reason: "vague_message",
  });
  assert.deepEqual(classifyAssistantFallback("nao sei explicar direito"), {
    intent: "generic_guidance",
    reason: "not_simple_question",
  });
});

test("assistant fallback guidance adapts to tenant context and supports custom text", () => {
  const legal = buildAssistantFallbackGuidance({
    tenantName: "Justa Advocacia",
    aiBusinessContext: "Direito previdenciario",
  });
  assert.match(legal, /serviços disponíveis/);
  assert.doesNotMatch(legal.toLowerCase(), /bpc|aposentadoria|previdenci/);

  const generic = buildAssistantFallbackGuidance({
    tenantName: "Loja Exemplo",
    aiBusinessContext: "Varejo",
  });
  assert.match(generic, /serviços disponíveis/);
  assert.doesNotMatch(generic.toLowerCase(), /bpc|aposentadoria/);

  assert.equal(
    buildAssistantFallbackGuidance({
      fallbackMessage: "Mensagem personalizada do tenant.",
    }),
    "Mensagem personalizada do tenant."
  );
});

test("buildHandoffConfirmationPrompt supports tenant custom prompt", () => {
  assert.equal(
    buildHandoffConfirmationPrompt({
      context: {
        tenantName: "Justa Advocacia",
        aiBusinessContext: "Direito previdenciario",
      },
    }),
    "Para te orientar melhor, posso direcionar seu atendimento para uma pessoa da equipe?"
  );
  assert.equal(
    buildHandoffConfirmationPrompt({
      context: {
        handoffPrompt: "Posso direcionar para nosso time de suporte?",
      },
    }),
    "Posso direcionar para nosso time de suporte?"
  );
});

test("shouldSendHandoffConfirmationPrompt enforces idempotency and operational safety", () => {
  assert.equal(
    shouldSendHandoffConfirmationPrompt({
      allowed: true,
      state: baseState,
      messageId: "m1",
    }),
    true
  );
  assert.equal(
    shouldSendHandoffConfirmationPrompt({
      allowed: false,
      state: baseState,
      messageId: "m1",
    }),
    false
  );
  assert.equal(
    shouldSendHandoffConfirmationPrompt({
      allowed: true,
      state: { ...baseState, mode: "HUMAN" },
      messageId: "m1",
    }),
    false
  );
  assert.equal(
    shouldSendHandoffConfirmationPrompt({
      allowed: true,
      state: { ...baseState, handoff: { status: "pending" } },
      messageId: "m1",
    }),
    false
  );
  assert.equal(
    shouldSendHandoffConfirmationPrompt({
      allowed: true,
      state: {
        ...baseState,
        answers: {
          ...baseState.answers,
          aiOrchestrator: {
            handoffPrompt: {
              prompted: true,
              promptedAt: "2026-05-08T10:00:00.000Z",
              messageId: "m1",
              reason: "explicit_human_request",
              score: 3,
              awaitingConfirmation: true,
            },
          },
        },
      },
      messageId: "m1",
    }),
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
    lastFallbackType: null,
    lastFallbackAt: null,
    fallbackCount: 0,
  });
});
