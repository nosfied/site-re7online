import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHandoffConfirmationPrompt,
  buildAiHandoffCrmArtifacts,
  buildAssistantLimitReachedReply,
  buildAssistantGreetingReply,
  buildAssistantFallbackGuidance,
  buildContextualFallbackReply,
  buildContextualContinuationReply,
  buildSafeResponse,
  buildTenantIntentCatalogReply,
  buildTenantIntentOrchestratorOutput,
  calculateHandoffScore,
  classifyAssistantFallback,
  classifyContextualFallback,
  classifyEducationalIntent,
  classifyPendingOfferResponse,
  canEvaluateHandoffRecommendation,
  classifyRisk,
  enrichCrmFromOrchestrator,
  generateControlledAssistantReply,
  getAiAssistantState,
  isContextualAck,
  isSimpleQuestion,
  resolveTenantTopic,
  resolveTenantIntent,
  resolveOrchestratorAction,
  resolveContextualContinuationTopic,
  shouldSendHandoffConfirmationPrompt,
  updateAiMemory,
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
      allowedTopics: ["homem", "aposentar", "aposentadoria"],
    }),
    {
      allowed: true,
      educational: true,
      topic: "aposentadoria",
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
  assert.equal(classifyContextualFallback("opa").type, "greeting");
  assert.equal(classifyContextualFallback("não quero").type, "negative");
  assert.notEqual(classifyContextualFallback("sim").type, "greeting");
  assert.notEqual(classifyContextualFallback("ok").type, "greeting");
  assert.equal(classifyContextualFallback("não entendi bem").type, "clarification");
  assert.equal(classifyContextualFallback("quais os serviços de vocês?").type, "help");
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
  assert.equal(
    classifyEducationalIntent("quanto tempo de carência para salário materninade?", {
      allowedTopics: ["salário maternidade", "carência gravidez"],
    }).topic,
    "salario maternidade"
  );
  assert.equal(
    classifyEducationalIntent("vocês dão entrada em aposentadoria?", {
      allowedTopics: ["aposentadoria"],
    }).topic,
    "aposentadoria"
  );
  assert.equal(
    classifyEducationalIntent("vcs fazem aposentadoria?", {
      allowedTopics: ["aposentadoria"],
    }).topic,
    "aposentadoria"
  );
  assert.equal(
    classifyEducationalIntent("preciso me aposentar", {
      allowedTopics: ["aposentadoria"],
    }).topic,
    "aposentadoria"
  );
  assert.equal(
    classifyEducationalIntent("dar entrada na minha aposentadoria", {
      allowedTopics: ["dar entrada na aposentadoria", "aposentadoria"],
    }).topic,
    "dar entrada na aposentadoria"
  );
});

test("resolveTenantTopic matches only tenant configured topics with typo tolerance", () => {
  assert.equal(
    resolveTenantTopic("quanto tempo de carência para salário materninade?", [
      "salário maternidade",
      "aposentadoria",
    ]),
    "salario maternidade"
  );
  assert.equal(
    resolveTenantTopic("quero saber sobre seguro residencial", ["software", "suporte técnico"]),
    null
  );
});

test("resolveTenantIntent maps tenant service phrases without global domain hardcode", () => {
  const catalog = [
    {
      key: "servico_aposentadoria",
      title: "Aposentadoria",
      topics: [
        "aposentadoria",
        "voces fazem aposentadoria",
        "dar entrada na aposentadoria",
        "preciso me aposentar",
      ],
      response: "Sim, a equipe pode orientar pedidos de aposentadoria de forma geral.",
      nextQuestion: "Voce quer entender requisitos gerais, documentos ou como funciona o atendimento?",
      leadTemp: "morno" as const,
      priority: "media" as const,
      tags: ["service:aposentadoria"],
    },
    {
      key: "servico_seguro",
      title: "Seguro",
      topics: ["seguro residencial"],
      response: "Atendemos duvidas gerais sobre seguros configurados para este tenant.",
    },
    {
      key: "area_civil",
      title: "Civil",
      topics: ["divorcio", "familia"],
      response: "Esse assunto precisa de triagem da equipe.",
      handoff: true,
    },
    {
      key: "honorarios",
      title: "Honorarios",
      topics: ["preco", "preço", "quanto custa", "valor do servico"],
      response: "Valores dependem do atendimento.",
      handoff: true,
    },
    {
      key: "servicos",
      title: "Servicos",
      topics: ["quais servicos", "servicos de voces"],
      response: "Atendemos os servicos configurados.",
    },
  ];
  const retirement = resolveTenantIntent("vcs fazem aposentadoria?", catalog);
  assert.equal(retirement?.key, "servico_aposentadoria");
  assert.equal(retirement?.topic, "aposentadoria");
  assert.equal(buildTenantIntentCatalogReply(retirement!), [
    "Sim, a equipe pode orientar pedidos de aposentadoria de forma geral.",
    "Voce quer entender requisitos gerais, documentos ou como funciona o atendimento?",
  ].join("\n\n"));
  assert.equal(resolveTenantIntent("quero saber sobre seguro residencial", catalog)?.key, "servico_seguro");
  assert.equal(resolveTenantIntent("vocês fazem divórcio?", catalog)?.key, "area_civil");
  assert.equal(resolveTenantIntent("qual preço do serviço?", catalog)?.key, "honorarios");
  assert.equal(resolveTenantIntent("vcs fazem aposentadoria?", [catalog[1]]), null);
  assert.equal(
    resolveTenantIntent("qual a idade em 2026?", [
      {
        key: "salario_maternidade",
        title: "Salario maternidade",
        topics: ["salario maternidade", "maternidade"],
        response: "Resposta de maternidade.",
      },
    ]),
    null
  );
  assert.equal(
    resolveTenantIntent("qual a idade em 2026? aposentadoria", catalog)?.key,
    "servico_aposentadoria"
  );
  assert.equal(
    resolveTenantIntent(
      "o que precisa pra dar entrada?",
      [
        {
          key: "documentos_aposentadoria",
          title: "Documentos para aposentadoria",
          topics: ["documentos aposentadoria", "dar entrada aposentadoria"],
          response: "Documentos de aposentadoria.",
        },
        {
          key: "bpc_loas",
          title: "BPC/LOAS",
          topics: ["bpc", "loas"],
          response: "Critérios e documentos de BPC/LOAS.",
        },
      ],
      { preferredTopics: ["bpc loas"] }
    )?.key,
    "bpc_loas"
  );
});

test("intent catalog output enriches CRM with configured classification", () => {
  const intent = resolveTenantIntent("dar entrada na minha aposentadoria", [
    {
      key: "servico_aposentadoria",
      topics: ["dar entrada na aposentadoria", "aposentadoria"],
      response: "Sim, podemos explicar como funciona o atendimento.",
      leadTemp: "quente",
      priority: "alta",
      tags: ["service:aposentadoria"],
    },
  ]);
  assert.ok(intent);
  const output = buildTenantIntentOrchestratorOutput(
    intent!,
    buildTenantIntentCatalogReply(intent!)!
  );
  const result = enrichCrmFromOrchestrator({
    state: { answers: {}, handoff: { status: "none" } } as any,
    output,
    topic: intent!.topic,
    catalogTags: intent!.tags,
    nowIso: new Date().toISOString(),
  });
  assert.equal(result.enriched, true);
  assert.equal(result.state.answers?.flowContext?.intent, "servico_aposentadoria");
  assert.equal(result.state.answers?.flowContext?.lead_temp, "quente");
  assert.ok(result.state.answers?.flowTags?.includes("service:aposentadoria"));
});

test("pending offer helpers interpret short contextual confirmations", () => {
  assert.equal(classifyPendingOfferResponse("sim, quero"), "accepted");
  assert.equal(classifyPendingOfferResponse("pode sim"), "accepted");
  assert.equal(classifyPendingOfferResponse("não quero"), "declined");
  assert.equal(classifyPendingOfferResponse("qual documento?"), "invalid");
});

test("contextual ack continues recent CRM or memory topic without handoff prompt", () => {
  assert.equal(isContextualAck("sim quero"), true);
  assert.equal(isContextualAck("me explique"), true);
  assert.equal(isContextualAck("qual documento?"), false);
  assert.equal(isContextualAck("quero falar com humano"), false);

  const state: ConversationState = {
    ...baseState,
    answers: {
      flowContext: {
        servico: "servico_aposentadoria",
        intent: "servico_aposentadoria",
      },
      aiMemory: {
        lastTopics: ["out of scope", "aposentadoria"],
        facts: { servico: "servico_aposentadoria" },
      },
    },
  };
  assert.equal(resolveContextualContinuationTopic(state), "aposentadoria");
  assert.match(
    buildContextualContinuationReply("aposentadoria"),
    /sobre aposentadoria/
  );
  assert.match(buildContextualContinuationReply("software"), /sobre software/);
  assert.match(buildContextualContinuationReply("unknown"), /esse assunto/);
});

test("contextual continuation ignores years and demographic fragments as topics", () => {
  const state: ConversationState = {
    ...baseState,
    answers: {
      aiMemory: {
        lastTopics: ["2026", "homem", "ask_question", "explain_general_topic", "aposentadoria"],
        facts: {},
      },
    },
  };
  assert.equal(resolveContextualContinuationTopic(state), "aposentadoria");
  assert.match(buildContextualContinuationReply("2026"), /esse assunto/);
  assert.match(buildContextualContinuationReply("homem"), /esse assunto/);
  assert.match(buildContextualContinuationReply("ask_question"), /esse assunto/);
  assert.match(buildContextualContinuationReply("explain_general_topic"), /esse assunto/);
  assert.match(buildContextualContinuationReply("legal_specific_case"), /esse assunto/);
  assert.match(buildContextualContinuationReply("guardrail_legal_specific_case"), /esse assunto/);
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

test("updateAiMemory stores only compact operational facts", () => {
  const result = updateAiMemory({
    state: baseState,
    nowIso: "2026-05-08T10:00:00.000Z",
    topic: "beneficio negado",
    stage: "qualification",
    goal: "discover_service",
    flowContext: {
      area: "previdenciario",
      servico: "beneficio_negado",
      lead_temp: "quente",
      cpf: "12345678900",
      email: "teste@example.com",
    },
    wantsHuman: true,
  });
  assert.equal(result.updated, true);
  assert.equal(result.memory.facts?.area, "previdenciario");
  assert.equal(result.memory.facts?.servico, "beneficio_negado");
  assert.equal(result.memory.facts?.lead_temp, "quente");
  assert.equal("cpf" in (result.memory.facts ?? {}), false);
  assert.equal(JSON.stringify(result.memory).includes("12345678900"), false);
  assert.deepEqual(result.memory.lastTopics, ["beneficio negado"]);
  assert.equal(result.memory.preferences?.wantsHuman, true);
  assert.ok((result.memory.summary ?? "").length <= 300);
});

test("updateAiMemory compacts recent topics", () => {
  let state = baseState;
  for (const topic of ["um", "dois", "tres", "quatro", "cinco", "seis"]) {
    const result = updateAiMemory({
      state,
      nowIso: "2026-05-08T10:00:00.000Z",
      topic,
    });
    state = { ...state, answers: { ...(state.answers ?? {}), aiMemory: result.memory } };
  }
  assert.equal(state.answers?.aiMemory?.lastTopics?.length, 5);
  assert.equal(state.answers?.aiMemory?.lastTopics?.[0], "seis");
});

test("classifyRisk detects concrete or sensitive requests", () => {
  assert.equal(classifyRisk("tenho direito ao BPC?"), "legal_specific_case");
  assert.equal(classifyRisk("preciso saber se tenho direto a me aposentar"), "legal_specific_case");
  assert.equal(classifyRisk("como saber se tenho direit?"), "legal_specific_case");
  assert.equal(classifyRisk("quero saber se posso receber o loas"), "legal_specific_case");
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
    state: {
      ...baseState,
      answers: {
        ...(baseState.answers ?? {}),
        aiMemory: {
          summary: "Cliente perguntou sobre BPC.",
          facts: { area: "previdenciario", servico: "bpc_loas" },
          lastTopics: ["bpc"],
          lastUpdatedAt: "2026-05-07T09:00:00.000Z",
        },
      },
    },
    nowIso: "2026-05-07T10:00:00.000Z",
  });

  assert.equal(result.ok, true);
  assert.match(result.ok ? result.text : "", /Se quiser, posso te orientar melhor conforme sua situação\./);
  assert.equal(result.ok ? result.output.stage : null, "triage");
  assert.equal(result.ok ? result.output.next_action : null, "answer");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].businessContext?.includes("cpf"), false);
  assert.equal(calls[0].businessContext?.includes("Memória operacional resumida"), true);
  assert.equal(calls[0].businessContext?.includes("Cliente perguntou sobre BPC"), true);
  assert.equal(calls[0].businessContext?.includes("wantsHuman"), false);
  assert.equal(calls[0].businessContext?.includes("lastUpdatedAt"), false);
});

test("generateControlledAssistantReply accepts structured orchestrator output", async () => {
  const brain: AgentBrain = {
    async generateReply() {
      return {
        text: JSON.stringify({
          reply: "BPC/LOAS é um benefício assistencial explicado de forma geral.",
          intent: "bpc_loas",
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
  assert.equal(result.ok ? result.output.intent : null, "bpc_loas");
  assert.equal(result.ok ? result.output.next_action : null, "ask_question");
  assert.deepEqual(result.ok ? result.output.missing_information : [], ["tipo_de_beneficio"]);
});

test("enrichCrmFromOrchestrator fills safe CRM context and tags from AI", () => {
  const output = validateOrchestratorOutput({
    reply: "Resposta geral segura.",
    intent: "aposentadoria",
    stage: "triage",
    goal: "explain_general_topic",
    confidence: 0.82,
    missing_information: [],
    next_action: "answer",
    handoff_recommended: false,
    lead_temp: "morno",
    priority: "media",
  });
  assert.equal(output.ok, true);
  if (!output.ok) return;
  const result = enrichCrmFromOrchestrator({
    state: { ...baseState, answers: {} },
    output: output.output,
    topic: "aposentadoria",
    nowIso: "2026-05-09T00:00:00.000Z",
  });
  assert.equal(result.enriched, true);
  assert.equal(result.state.answers?.flowContext?.intent, "aposentadoria");
  assert.equal(result.state.answers?.flowContext?.servico, "aposentadoria");
  assert.equal(result.state.answers?.flowContext?.lead_temp, "morno");
  assert.equal(result.state.answers?.flowContext?.prioridade, "media");
  assert.equal(result.state.answers?.flowContext?.origem_intencao, "ai_orchestrator");
  assert.equal(result.state.answers?.flowTags?.includes("intent:aposentadoria"), true);
  assert.equal(result.state.answers?.flowTags?.includes("topic:aposentadoria"), true);
  assert.equal(result.state.answers?.flowTags?.includes("lead:morno"), true);
  assert.equal(result.priorityUpdated, true);
});

test("enrichCrmFromOrchestrator derives CRM priority from safe tenant topic", () => {
  const output = validateOrchestratorOutput({
    reply: "Resposta geral segura.",
    intent: null,
    stage: "triage",
    goal: "explain_general_topic",
    confidence: 0.84,
    missing_information: [],
    next_action: "answer",
    handoff_recommended: false,
    lead_temp: null,
    priority: null,
  });
  assert.equal(output.ok, true);
  if (!output.ok) return;
  const result = enrichCrmFromOrchestrator({
    state: { ...baseState, answers: {} },
    output: output.output,
    topic: "salario maternidade",
    nowIso: "2026-05-09T00:00:00.000Z",
  });
  assert.equal(result.enriched, true);
  assert.equal(result.state.answers?.flowContext?.intent, "salario_maternidade");
  assert.equal(result.state.answers?.flowContext?.servico, "salario_maternidade");
  assert.equal(result.state.answers?.flowContext?.lead_temp, "morno");
  assert.equal(result.state.answers?.flowContext?.prioridade, "media");
  assert.equal(result.state.answers?.flowTags?.includes("lead:morno"), true);
  assert.equal(result.state.answers?.flowTags?.includes("priority:media"), true);
});

test("enrichCrmFromOrchestrator respects confidence and stronger context", () => {
  const lowOutput = validateOrchestratorOutput({
    reply: "Resposta geral segura.",
    intent: "aposentadoria",
    stage: "triage",
    goal: "explain_general_topic",
    confidence: 0.5,
    missing_information: [],
    next_action: "answer",
    handoff_recommended: false,
  });
  assert.equal(lowOutput.ok, true);
  if (!lowOutput.ok) return;
  assert.equal(
    enrichCrmFromOrchestrator({
      state: baseState,
      output: lowOutput.output,
      topic: "aposentadoria",
      nowIso: "2026-05-09T00:00:00.000Z",
    }).skippedReason,
    "low_confidence"
  );

  const highOutput = validateOrchestratorOutput({
    reply: "Resposta geral segura.",
    intent: "aposentadoria",
    stage: "triage",
    goal: "explain_general_topic",
    confidence: 0.9,
    missing_information: [],
    next_action: "answer",
    handoff_recommended: false,
    lead_temp: "frio",
  });
  assert.equal(highOutput.ok, true);
  if (!highOutput.ok) return;
  const stateWithClassifierContext: ConversationState = {
    ...baseState,
    answers: {
      ...(baseState.answers ?? {}),
      flowContext: {
        intent: "beneficio_negado",
        lead_temp: "quente",
        origem_intencao: "mensagem_livre",
      },
      flowTags: ["intent:beneficio_negado"],
    },
  };
  const enriched = enrichCrmFromOrchestrator({
    state: stateWithClassifierContext,
    output: highOutput.output,
    topic: "aposentadoria",
    nowIso: "2026-05-09T00:00:00.000Z",
  });
  assert.equal(enriched.state.answers?.flowContext?.intent, "beneficio_negado");
  assert.equal(enriched.state.answers?.flowContext?.lead_temp, "quente");
  assert.equal(enriched.state.answers?.flowTags?.includes("topic:aposentadoria"), true);
});

test("enrichCrmFromOrchestrator does not claim origin for existing strong context without origin", () => {
  const output = validateOrchestratorOutput({
    reply: "Resposta geral segura.",
    intent: "aposentadoria",
    stage: "triage",
    goal: "explain_general_topic",
    confidence: 0.9,
    missing_information: [],
    next_action: "answer",
    handoff_recommended: false,
    lead_temp: "frio",
    priority: "baixa",
  });
  assert.equal(output.ok, true);
  if (!output.ok) return;
  const strongState: ConversationState = {
    ...baseState,
    answers: {
      flowContext: {
        intent: "beneficio_negado",
        lead_temp: "quente",
      },
      flowTags: ["intent:beneficio_negado", "lead:quente"],
    },
  };
  const first = enrichCrmFromOrchestrator({
    state: strongState,
    output: output.output,
    topic: "aposentadoria",
    nowIso: "2026-05-09T00:00:00.000Z",
  });
  assert.equal(first.state.answers?.flowContext?.origem_intencao, undefined);
  assert.equal(first.state.answers?.flowContext?.intent, "beneficio_negado");
  assert.equal(first.state.answers?.flowContext?.lead_temp, "quente");
  assert.equal(first.state.answers?.flowTags?.includes("topic:aposentadoria"), true);

  const second = enrichCrmFromOrchestrator({
    state: first.state,
    output: output.output,
    topic: "aposentadoria",
    nowIso: "2026-05-09T00:01:00.000Z",
  });
  assert.equal(second.state.answers?.flowContext?.origem_intencao, undefined);
  assert.equal(second.state.answers?.flowContext?.intent, "beneficio_negado");
  assert.equal(second.state.answers?.flowContext?.lead_temp, "quente");
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
  assert.equal(
    buildAssistantGreetingReply({ greetingMessage: "Olá, somos a equipe da Justa. Como podemos ajudar?" }),
    "Olá, somos a equipe da Justa. Como podemos ajudar?"
  );
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

test("buildAiHandoffCrmArtifacts uses safe context instead of technical reason", () => {
  const artifacts = buildAiHandoffCrmArtifacts({
    reason: "active_prompt_handoff_confirmation",
    score: 3,
    state: {
      ...baseState,
      answers: {
        flowContext: {
          servico: "servico_aposentadoria",
          lead_temp: "morno",
          prioridade: "media",
        },
        flowTags: ["topic:aposentadoria", "priority:media"],
        aiMemory: {
          summary: "Cliente demonstrou interesse em aposentadoria e pediu atendimento com a equipe.",
          facts: { stage: "triage", goal: "explain_general_topic" },
          lastTopics: ["aposentadoria", "2026", "ask_question"],
        },
        aiOrchestrator: {
          stage: "triage",
          goal: "explain_general_topic",
          lastAction: "ask_question",
          lastConfidence: 0.8,
          handoffRecommended: true,
          missingInformation: ["tipo de aposentadoria"],
        },
      },
    },
  });

  assert.match(artifacts.summaryNote, /Tema principal: aposentadoria/);
  assert.match(artifacts.summaryNote, /Temperatura: morno/);
  assert.match(artifacts.summaryNote, /Pontos a confirmar: tipo de aposentadoria/);
  assert.doesNotMatch(artifacts.summaryNote, /active_prompt_handoff_confirmation/);
  assert.doesNotMatch(artifacts.summaryNote, /ask question/);
  assert.match(artifacts.suggestedReplyNote, /atendimento com a equipe sobre aposentadoria/);
});

test("generateControlledAssistantReply accepts preclassified contextual educational intent", async () => {
  let called = false;
  const brain: AgentBrain = {
    async generateReply() {
      called = true;
      return {
        text: JSON.stringify({
          reply: "De forma geral, carencia e um numero minimo de contribuicoes exigidas em alguns beneficios.",
          stage: "triage",
          goal: "explain_general_topic",
          confidence: 0.8,
          missing_information: [],
          next_action: "answer",
          handoff_recommended: false,
        }),
        source: "ai",
      };
    },
  };
  const result = await generateControlledAssistantReply({
    brain,
    text: "qual a carência",
    tenant: {
      name: "Justa",
      defaultLanguage: "pt_BR",
      aiBusinessContext: "Direito previdenciario.",
      aiAssistantAllowedTopics: ["aposentadoria"],
    },
    state: baseState,
    nowIso: "2026-05-09T10:00:00.000Z",
    preclassifiedEducationalIntent: {
      allowed: true,
      educational: true,
      topic: "aposentadoria",
      reason: "contextual_topic_and_allowed_intent",
    },
  });
  assert.equal(result.ok, true);
  assert.equal(called, true);
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
