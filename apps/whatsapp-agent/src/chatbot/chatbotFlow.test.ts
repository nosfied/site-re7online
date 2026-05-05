import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHandoffSummary,
  clearChatbotRuntime,
  executeChatbotFlow,
  getInitialChatbotAwaitingNodeId,
  validateChatbotFlowDefinition,
} from "./chatbotFlow.js";
import {
  applyFlowIntentClassificationToContext,
  classifyFreeTextFlowIntent,
} from "./intentClassifier.js";
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

test("classifyFreeTextFlowIntent returns no match for greeting", () => {
  const result = classifyFreeTextFlowIntent("oi");
  assert.equal(result, null);
});

test("classifyFreeTextFlowIntent routes BPC free text", () => {
  const result = classifyFreeTextFlowIntent("quero pedir BPC para meu filho autista");

  assert.equal(result?.intent, "bpc_loas");
  assert.equal(result?.targetNode, "bpc_tipo");
  assert.equal(result?.context.intent, "bpc_loas");
  assert.equal(result?.context.origem_intencao, "mensagem_livre");
  assert.deepEqual(result?.tags, ["previdenciario", "bpc_loas", "mensagem_livre"]);
});

test("classifyFreeTextFlowIntent routes denied benefit and resolves retirement conflict", () => {
  const denied = classifyFreeTextFlowIntent("meu benefício foi negado");
  const conflict = classifyFreeTextFlowIntent("minha aposentadoria foi negada");

  assert.equal(denied?.intent, "beneficio_negado");
  assert.equal(denied?.targetNode, "negado_beneficio");
  assert.equal(conflict?.intent, "beneficio_negado");
  assert.equal(conflict?.targetNode, "negado_beneficio");
  assert.equal(conflict?.conflictedIntents.includes("aposentadoria"), true);
});

test("classifyFreeTextFlowIntent routes other previdenciario intents", () => {
  assert.equal(classifyFreeTextFlowIntent("meu benefício foi cortado")?.targetNode, "cortado_beneficio");
  assert.equal(classifyFreeTextFlowIntent("quero revisar minha aposentadoria")?.targetNode, "revisao_beneficio");
  assert.equal(classifyFreeTextFlowIntent("pensão por morte")?.targetNode, "pensao_situacao");
});

test("applyFlowIntentClassificationToContext does not overwrite existing context", () => {
  const classification = classifyFreeTextFlowIntent("meu benefício foi negado");
  assert.ok(classification);
  if (!classification) return;

  const result = applyFlowIntentClassificationToContext({
    currentContext: { intent: "manual", area: "previdenciario" },
    currentTags: ["previdenciario", "manual"],
    classification,
  });

  assert.equal(result.flowContext.intent, "manual");
  assert.equal(result.flowContext.origem_intencao, "mensagem_livre");
  assert.deepEqual(result.flowTags, [
    "previdenciario",
    "manual",
    "beneficio_negado",
    "mensagem_livre",
  ]);
});

test("executeChatbotFlow can start from classified node without menu reply", () => {
  const validated = validateChatbotFlowDefinition({
    start: "menu_principal",
    nodes: {
      menu_principal: {
        type: "menu",
        text: "Como podemos ajudar?",
        options: [{ label: "BPC", next: "bpc_tipo" }],
      },
      bpc_tipo: {
        type: "menu",
        text: "O BPC/LOAS é para qual situação?",
        options: [{ label: "Idoso", next: "handoff_1" }],
      },
      handoff_1: {
        type: "handoff",
        text: "Vou encaminhar.",
      },
    },
  });
  assert.equal(validated.ok, true);
  if (!validated.ok) return;

  const result = executeChatbotFlow({
    flowId: "flow_classifier",
    definition: validated.definition,
    state: makeState(),
    inboundText: "quero pedir bpc",
    nowIso: "2026-04-17T10:00:01.000Z",
    startNodeId: "bpc_tipo",
  });

  assert.equal(result.handled, true);
  assert.equal(result.state.chatbotNodeId, "bpc_tipo");
  assert.match(result.replyText ?? "", /O BPC\/LOAS é para qual situação/);
  assert.doesNotMatch(result.replyText ?? "", /Como podemos ajudar/);
});

test("getInitialChatbotAwaitingNodeId follows text intro to first menu", () => {
  const validated = validateChatbotFlowDefinition({
    start: "boas_vindas",
    nodes: {
      boas_vindas: {
        type: "text",
        text: "Ola.",
        next: "menu_principal",
      },
      menu_principal: {
        type: "menu",
        text: "Como podemos ajudar?",
        options: [{ label: "BPC", next: "bpc_tipo" }],
      },
      bpc_tipo: {
        type: "menu",
        text: "O BPC/LOAS é para qual situação?",
        options: [{ label: "Idoso", next: "handoff_1" }],
      },
      handoff_1: {
        type: "handoff",
        text: "Vou encaminhar.",
      },
    },
  });
  assert.equal(validated.ok, true);
  if (!validated.ok) return;

  assert.equal(getInitialChatbotAwaitingNodeId(validated.definition), "menu_principal");
});

test("executeChatbotFlow can reroute from initial menu free text without repeating default menu", () => {
  const validated = validateChatbotFlowDefinition({
    start: "boas_vindas",
    nodes: {
      boas_vindas: {
        type: "text",
        text: "Ola.",
        next: "menu_principal",
      },
      menu_principal: {
        type: "menu",
        text: "Como podemos ajudar?",
        options: [{ label: "Negado", next: "negado_beneficio" }],
      },
      negado_beneficio: {
        type: "menu",
        text: "Qual benefício foi negado?",
        options: [{ label: "Aposentadoria", next: "handoff_1" }],
      },
      handoff_1: {
        type: "handoff",
        text: "Vou encaminhar.",
      },
    },
  });
  assert.equal(validated.ok, true);
  if (!validated.ok) return;

  const result = executeChatbotFlow({
    flowId: "flow_classifier",
    definition: validated.definition,
    state: makeState({
      flow: "chatbot:flow_classifier",
      chatbotActive: true,
      chatbotNodeId: "menu_principal",
    }),
    inboundText: "meu benefício foi negado",
    nowIso: "2026-04-17T10:00:01.000Z",
    startNodeId: "negado_beneficio",
  });

  assert.equal(result.handled, true);
  assert.equal(result.state.chatbotNodeId, "negado_beneficio");
  assert.match(result.replyText ?? "", /Qual benefício foi negado/);
  assert.doesNotMatch(result.replyText ?? "", /Como podemos ajudar/);
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

test("executeChatbotFlow merges node context and tags without changing client reply", () => {
  const validated = validateChatbotFlowDefinition({
    start: "inicio",
    nodes: {
      inicio: {
        type: "text",
        text: "Entendi.",
        context: { area: "previdenciario", servico: "aposentadoria" },
        tags: ["previdenciario", "qualificado"],
        next: "handoff_1",
      },
      handoff_1: {
        type: "handoff",
        text: "Vou encaminhar para um especialista.",
        handoffSummary: "Lead qualificado pela automação.",
        tags: ["qualificado"],
      },
    },
  });
  assert.equal(validated.ok, true);
  if (!validated.ok) return;

  const result = executeChatbotFlow({
    flowId: "flow_context",
    definition: validated.definition,
    state: makeState(),
    inboundText: "oi",
    nowIso: "2026-04-17T10:00:05.000Z",
  });

  assert.equal(result.handled, true);
  assert.equal(result.replyText, "Entendi.\n\nVou encaminhar para um especialista.");
  assert.match(result.pendingHandoff?.summary ?? "", /Lead qualificado/);
  assert.match(result.pendingHandoff?.summary ?? "", /Resumo do atendimento/);
  assert.match(result.pendingHandoff?.summary ?? "", /Área: Previdenciário/);
  assert.match(result.pendingHandoff?.summary ?? "", /Serviço: Aposentadoria/);
  assert.deepEqual(result.pendingHandoff?.tags, ["previdenciario", "qualificado"]);
  assert.equal(
    result.events?.some((event) => event.event === "flow.context.merged"),
    true
  );
  assert.equal(
    result.events?.some((event) => event.event === "flow.context.tags_added"),
    true
  );
});

test("executeChatbotFlow merges selected option context", () => {
  const validated = validateChatbotFlowDefinition({
    start: "menu",
    nodes: {
      menu: {
        type: "menu",
        text: "Escolha",
        options: [
          {
            label: "Aposentadoria",
            next: "handoff_1",
            context: { servico: "aposentadoria" },
            tags: ["previdenciario"],
          },
        ],
      },
      handoff_1: {
        type: "handoff",
        text: "Vou encaminhar.",
      },
    },
  });
  assert.equal(validated.ok, true);
  if (!validated.ok) return;

  const result = executeChatbotFlow({
    flowId: "flow_option_context",
    definition: validated.definition,
    state: makeState({
      flow: "chatbot:flow_option_context",
      chatbotActive: true,
      chatbotNodeId: "menu",
    }),
    inboundText: "1",
    nowIso: "2026-04-17T10:00:06.000Z",
  });

  assert.equal(result.handled, true);
  assert.match(result.pendingHandoff?.summary ?? "", /Serviço: Aposentadoria/);
  assert.deepEqual(result.pendingHandoff?.tags, ["previdenciario"]);
  assert.equal(
    result.events?.some(
      (event) => event.event === "flow.context.merged" && event.source === "option"
    ),
    true
  );
});

test("buildHandoffSummary skips sensitive context values", () => {
  const summary = buildHandoffSummary({
    servico: "revisao",
    telefone: "5584999999999",
    email: "cliente@example.com",
    nome: "Maria",
  });

  assert.match(summary, /Serviço: Revisão/);
  assert.doesNotMatch(summary, /5584999999999/);
  assert.doesNotMatch(summary, /cliente@example.com/);
  assert.doesNotMatch(summary, /Maria/);
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
