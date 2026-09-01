import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHandoffSummary,
  buildSuggestedReply,
  clearChatbotRuntime,
  executeChatbotFlow,
  getChatbotFlowStructureHash,
  getInitialChatbotAwaitingNodeId,
  validateChatbotFlowDefinition,
} from "./chatbotFlow.js";
import { executeChatbotFlowWithConsent } from "./chatbotConsentRuntime.js";
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

function makeCurrentChatbotState(
  definition: ReturnType<typeof getChatbotFlowStructureHash> extends string
    ? Parameters<typeof getChatbotFlowStructureHash>[0]
    : never,
  overrides: Partial<ConversationState>
): ConversationState {
  const runtime =
    overrides.answers?.chatbotRuntime &&
    typeof overrides.answers.chatbotRuntime === "object" &&
    !Array.isArray(overrides.answers.chatbotRuntime)
      ? overrides.answers.chatbotRuntime
      : {};
  return makeState({
    ...overrides,
    answers: {
      ...(overrides.answers ?? {}),
      chatbotRuntime: {
        ...runtime,
        flowStructureHash: getChatbotFlowStructureHash(definition),
      },
    },
  });
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

test("executeChatbotFlow auto-selects a single visible availability route", () => {
  const definition = validateChatbotFlowDefinition({
    start: "availability_router",
    nodes: {
      availability_router: {
        type: "menu",
        text: "Roteando atendimento.",
        autoSelectSingleVisibleOption: true,
        options: [
          {
            label: "1 - Aberto",
            next: "open_menu",
            departmentId: "department_general",
            visibilityCondition: { departmentAvailability: "OPEN" },
          },
          {
            label: "2 - Fechado",
            next: "closed_menu",
            departmentId: "department_general",
            visibilityCondition: { departmentAvailability: "CLOSED" },
          },
          {
            label: "3 - Sem escala",
            next: "closed_menu",
            departmentId: "department_general",
            visibilityCondition: { departmentAvailability: "NO_SCHEDULE" },
          },
        ],
      },
      open_menu: {
        type: "menu",
        text: "Menu em expediente",
        options: [{ label: "8 - Outros", next: "handoff" }],
      },
      closed_menu: {
        type: "menu",
        text: "Menu fora de expediente",
        options: [{ label: "4 - Dúvidas técnicas", next: "handoff" }],
      },
      handoff: { type: "handoff", text: "Vou encaminhar." },
    },
  });

  assert.equal(definition.ok, true);
  if (!definition.ok) return;

  const open = executeChatbotFlow({
    flowId: "flow_availability",
    definition: definition.definition,
    state: makeState(),
    inboundText: "oi",
    nowIso: "2026-08-17T13:00:00.000Z",
    options: { departmentAvailabilityById: { department_general: "OPEN" } },
  });
  assert.equal(open.replyText?.includes("Menu em expediente"), true);
  assert.equal(open.replyText?.includes("Menu fora de expediente"), false);
  assert.equal(open.state.chatbotNodeId, "open_menu");

  const closed = executeChatbotFlow({
    flowId: "flow_availability",
    definition: definition.definition,
    state: makeState(),
    inboundText: "oi",
    nowIso: "2026-08-17T20:03:00.000Z",
    options: { departmentAvailabilityById: { department_general: "CLOSED" } },
  });
  assert.equal(closed.replyText?.includes("Menu fora de expediente"), true);
  assert.equal(closed.replyText?.includes("Menu em expediente"), false);
  assert.equal(closed.state.chatbotNodeId, "closed_menu");

  const noSchedule = executeChatbotFlow({
    flowId: "flow_availability",
    definition: definition.definition,
    state: makeState(),
    inboundText: "oi",
    nowIso: "2026-08-17T13:00:00.000Z",
    options: { departmentAvailabilityById: { department_general: "NO_SCHEDULE" } },
  });
  assert.equal(noSchedule.replyText?.includes("Menu fora de expediente"), true);
  assert.equal(noSchedule.state.chatbotNodeId, "closed_menu");
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
  assert.match(result.replyText ?? "", /\*1\* - Atendimento/);
});

test("executeChatbotFlow hides department option when department is closed", () => {
  const validated = validateChatbotFlowDefinition({
    start: "menu",
    nodes: {
      menu: {
        type: "menu",
        text: "Escolha uma opção",
        options: [
          { label: "Atendimento geral", next: "general" },
          {
            label: "Falar com atendente",
            next: "human",
            departmentId: "department_technical",
            visibilityCondition: { departmentAvailability: "OPEN" },
          },
        ],
      },
      general: { type: "text", text: "Geral" },
      human: { type: "handoff", text: "Encaminhando", departmentId: "department_technical" },
    },
  });
  assert.equal(validated.ok, true);
  if (!validated.ok) return;

  const menu = executeChatbotFlow({
    flowId: "flow_visibility",
    definition: validated.definition,
    state: makeState(),
    inboundText: "oi",
    nowIso: "2026-04-17T10:00:01.000Z",
    options: { departmentAvailabilityById: { department_technical: "CLOSED" } },
  });

  assert.match(menu.replyText ?? "", /\*1\* - Atendimento geral/);
  assert.doesNotMatch(menu.replyText ?? "", /Falar com atendente/);

  const blocked = executeChatbotFlow({
    flowId: "flow_visibility",
    definition: validated.definition,
    state: {
      ...menu.state,
      flow: "chatbot:flow_visibility",
      chatbotActive: true,
      chatbotNodeId: "menu",
    },
    inboundText: "2",
    nowIso: "2026-04-17T10:00:02.000Z",
    options: { departmentAvailabilityById: { department_technical: "CLOSED" } },
  });

  assert.equal(blocked.pendingHandoff, undefined);
  assert.match(blocked.replyText ?? "", /\*1\* - Atendimento geral/);
  assert.doesNotMatch(blocked.replyText ?? "", /Falar com atendente/);
});

test("executeChatbotFlow prompts for consent and advances after accepted consent marker", () => {
  const validated = validateChatbotFlowDefinition({
    start: "consent",
    nodes: {
      consent: {
        type: "consent",
        purpose: "attendance",
        textVersion: "v1",
        message: "Responda ACEITO para continuar.",
        acceptOption: "ACEITO",
        onAccepted: "menu",
      },
      menu: {
        type: "menu",
        text: "Escolha",
        options: [{ label: "Atendimento", next: "done" }],
      },
      done: {
        type: "text",
        text: "Tudo certo",
      },
    },
  });
  assert.equal(validated.ok, true);
  if (!validated.ok) return;

  const prompt = executeChatbotFlow({
    flowId: "flow_consent",
    definition: validated.definition,
    state: makeState(),
    inboundText: "oi",
    nowIso: "2026-04-17T10:00:01.000Z",
  });
  assert.equal(prompt.handled, true);
  assert.equal(prompt.state.chatbotNodeId, "consent");
  assert.match(prompt.replyText ?? "", /ACEITO/);
  assert.equal(prompt.managementInteraction?.outboundKind, "consent_prompt");

  const accepted = executeChatbotFlow({
    flowId: "flow_consent",
    definition: validated.definition,
    state: makeState({
      answers: {
        chatbotRuntime: {
          acceptedConsents: {
            "attendance:v1": true,
          },
        } as any,
      },
    }),
    inboundText: "oi",
    nowIso: "2026-04-17T10:00:02.000Z",
  });
  assert.equal(accepted.handled, true);
  assert.equal(accepted.state.chatbotNodeId, "menu");
  assert.match(accepted.replyText ?? "", /\*1\* - Atendimento/);
});

test("executeChatbotFlowWithConsent repeats consent prompt for invalid answer when decline option is explicit", async () => {
  const validated = validateChatbotFlowDefinition({
    start: "consent",
    nodes: {
      consent: {
        type: "consent",
        purpose: "attendance",
        textVersion: "v1",
        message: "Você autoriza o contato pelo número {{contactPhone}}?\nDigite 1 para aceitar ou 2 para encerrar.",
        acceptOption: "1",
        declineOption: "2",
        invalidText: "⚠️ Desculpe, essa opção é inválida.",
        onAccepted: "menu",
        onDeclined: "declined",
      },
      menu: {
        type: "menu",
        text: "Escolha",
        options: [{ label: "Atendimento", next: "done" }],
      },
      done: {
        type: "text",
        text: "Tudo certo",
      },
      declined: {
        type: "text",
        text: "Atendimento encerrado.",
      },
    },
  });
  assert.equal(validated.ok, true);
  if (!validated.ok) return;

  const prisma = {
    contact: { findFirst: async () => null },
    lead: { findFirst: async () => null },
    conversation: { findFirst: async () => null },
    contactConsent: {
      findFirst: async () => null,
      updateMany: async () => ({ count: 0 }),
      create: async () => ({ id: "consent_1", textHash: "hash" }),
    },
    event: { create: async () => ({ id: "event_1" }) },
  } as any;

  const result = await executeChatbotFlowWithConsent({
    prisma,
    clientId: "client_1",
    waId: "5511999999999",
    sourceChannel: "whatsapp",
    sourceProvider: "web_session",
    source: "test",
    requestId: "request_1",
    flowId: "flow_consent",
    definition: validated.definition,
    state: makeState({
      waId: "558499049614",
      flow: "chatbot:flow_consent",
      chatbotActive: true,
      chatbotNodeId: "consent",
    }),
    inboundText: "olá",
    nowIso: "2026-04-17T10:00:02.000Z",
  });

  assert.equal(result.handled, true);
  assert.equal(result.state.chatbotNodeId, "consent");
  assert.match(result.replyText ?? "", /opção é inválida/);
  assert.match(result.replyText ?? "", /Digite 1 para aceitar/);
  assert.match(result.replyText ?? "", /55 \(84\) 9904-9614/);
  assert.equal(result.managementInteraction?.inboundKind, "consent_invalid");
  assert.equal(result.managementInteraction?.outboundKind, "consent_prompt");

  const declined = await executeChatbotFlowWithConsent({
    prisma,
    clientId: "client_1",
    waId: "5511999999999",
    sourceChannel: "whatsapp",
    sourceProvider: "web_session",
    source: "test",
    requestId: "request_2",
    flowId: "flow_consent",
    definition: validated.definition,
    state: makeState({
      flow: "chatbot:flow_consent",
      chatbotActive: true,
      chatbotNodeId: "consent",
    }),
    inboundText: "2",
    nowIso: "2026-04-17T10:00:03.000Z",
  });

  assert.equal(declined.handled, true);
  assert.match(declined.replyText ?? "", /Atendimento encerrado/);
  assert.equal(declined.managementInteraction?.inboundKind, "consent_negative");

  const accepted = await executeChatbotFlowWithConsent({
    prisma,
    clientId: "client_1",
    waId: "5511999999999",
    sourceChannel: "whatsapp",
    sourceProvider: "web_session",
    source: "test",
    requestId: "request_3",
    flowId: "flow_consent",
    definition: validated.definition,
    state: makeState({
      flow: "chatbot:flow_consent",
      chatbotActive: true,
      chatbotNodeId: "consent",
    }),
    inboundText: "1",
    nowIso: "2026-04-17T10:00:04.000Z",
  });

  assert.equal(accepted.handled, true);
  assert.equal(accepted.managementInteraction?.inboundKind, "consent_positive");
});

test("executeChatbotFlowWithConsent prompts initial start consent without validating first inbound", async () => {
  const validated = validateChatbotFlowDefinition({
    start: "consent",
    nodes: {
      consent: {
        type: "consent",
        purpose: "attendance",
        textVersion: "v1",
        message: "Digite 1 para aceitar ou 2 para encerrar.",
        acceptOption: "1",
        declineOption: "2",
        invalidText: "Opção inválida.",
        onAccepted: "menu",
        onDeclined: "declined",
      },
      menu: {
        type: "menu",
        text: "Menu",
        options: [{ label: "1 - Atendimento", next: "done" }],
      },
      done: {
        type: "text",
        text: "Tudo certo.",
      },
      declined: {
        type: "text",
        text: "Atendimento encerrado.",
      },
    },
  });
  assert.equal(validated.ok, true);
  if (!validated.ok) return;

  const prisma = {
    contact: { findFirst: async () => null },
    lead: { findFirst: async () => null },
    conversation: { findFirst: async () => null },
    contactConsent: {
      findFirst: async () => null,
      updateMany: async () => ({ count: 0 }),
      create: async () => ({ id: "consent_1", textHash: "hash" }),
    },
    event: { create: async () => ({ id: "event_1" }) },
  } as any;

  const result = await executeChatbotFlowWithConsent({
    prisma,
    clientId: "client_1",
    waId: "5511999999999",
    sourceChannel: "whatsapp",
    sourceProvider: "web_session",
    source: "test",
    requestId: "request_initial",
    flowId: "flow_consent",
    definition: validated.definition,
    state: makeState(),
    inboundText: "oi",
    nowIso: "2026-04-17T10:00:01.000Z",
    startNodeId: "consent",
  });

  assert.equal(result.handled, true);
  assert.equal(result.state.chatbotNodeId, "consent");
  assert.equal(result.replyText, "Digite 1 para aceitar ou 2 para encerrar.");
  assert.equal(result.managementInteraction?.outboundKind, "consent_prompt");
  assert.equal(result.managementInteraction?.inboundKind, undefined);
});

test("executeChatbotFlow restarts legacy active runtime without validating inbound against stale node", () => {
  const validated = validateChatbotFlowDefinition({
    start: "consent",
    nodes: {
      consent: {
        type: "consent",
        purpose: "attendance",
        textVersion: "v1",
        message: "Digite 1 para aceitar.",
        acceptOption: "1",
        onAccepted: "menu",
      },
      menu: {
        type: "menu",
        text: "Menu atual",
        options: [{ label: "1 - Atendimento", next: "done" }],
      },
      stale_menu: {
        type: "menu",
        text: "Menu antigo",
        options: [{ label: "1 - Antigo", next: "done" }],
      },
      done: {
        type: "text",
        text: "Tudo certo.",
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
      chatbotNodeId: "stale_menu",
      answers: {
        flowContext: { currentMenu: "old_menu" },
      },
    }),
    inboundText: "Oi",
    nowIso: "2026-09-01T10:00:00.000Z",
  });

  assert.equal(result.handled, true);
  assert.equal(result.state.chatbotNodeId, "consent");
  assert.equal(result.replyText, "Digite 1 para aceitar.");
  assert.equal(result.events?.[0]?.event, "flow.runtime_coherence.restart_applied");
  assert.equal(result.events?.[0]?.reason, "legacy_revision_missing");
  assert.equal(result.state.answers?.flowContext?.currentMenu, "old_menu");
  assert.equal(
    result.state.answers?.chatbotRuntime?.flowStructureHash,
    getChatbotFlowStructureHash(validated.definition)
  );
});

test("executeChatbotFlow preserves active runtime when structural revision is current", () => {
  const validated = validateChatbotFlowDefinition({
    start: "consent",
    nodes: {
      consent: {
        type: "consent",
        purpose: "attendance",
        textVersion: "v1",
        message: "Digite 1 para aceitar.",
        acceptOption: "1",
        onAccepted: "menu",
      },
      menu: {
        type: "menu",
        text: "Menu atual",
        options: [{ label: "1 - Atendimento", next: "done" }],
      },
      done: {
        type: "text",
        text: "Tudo certo.",
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
      answers: {
        chatbotRuntime: {
          flowStructureHash: getChatbotFlowStructureHash(validated.definition),
        },
      },
    }),
    inboundText: "1",
    nowIso: "2026-09-01T10:00:00.000Z",
  });

  assert.equal(result.handled, true);
  assert.equal(result.replyText, "Tudo certo.");
  assert.equal(result.events?.some((event) => event.event === "flow.runtime_coherence.restart_applied"), false);
});

test("getChatbotFlowStructureHash ignores copy-only text changes", () => {
  const first = validateChatbotFlowDefinition({
    start: "menu",
    nodes: {
      menu: {
        type: "menu",
        text: "Menu v1",
        fallbackText: "Inválido v1",
        options: [{ label: "1 - Atendimento", next: "done" }],
      },
      done: {
        type: "text",
        text: "Texto v1.",
      },
    },
  });
  const second = validateChatbotFlowDefinition({
    start: "menu",
    nodes: {
      menu: {
        type: "menu",
        text: "Menu v2",
        fallbackText: "Inválido v2",
        options: [{ label: "1 - Atendimento", next: "done" }],
      },
      done: {
        type: "text",
        text: "Texto v2.",
      },
    },
  });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;

  assert.equal(getChatbotFlowStructureHash(first.definition), getChatbotFlowStructureHash(second.definition));
});

test("getChatbotFlowStructureHash is deterministic across non-semantic object key order", () => {
  const first = validateChatbotFlowDefinition({
    start: "menu",
    globalCommands: [{ command: "0", next: "menu", label: "Menu principal" }],
    nodes: {
      menu: {
        type: "menu",
        text: "Menu",
        options: [{ label: "1 - Atendimento", next: "done" }],
      },
      done: {
        type: "text",
        text: "Tudo certo.",
      },
    },
  });
  const second = validateChatbotFlowDefinition({
    nodes: {
      done: {
        text: "Tudo certo.",
        type: "text",
      },
      menu: {
        options: [{ next: "done", label: "1 - Atendimento" }],
        text: "Menu",
        type: "menu",
      },
    },
    globalCommands: [{ label: "Menu principal", next: "menu", command: "0" }],
    start: "menu",
  });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;

  assert.equal(getChatbotFlowStructureHash(first.definition), getChatbotFlowStructureHash(second.definition));
});

test("executeChatbotFlow restarts active runtime when structural revision changes", () => {
  const previous = validateChatbotFlowDefinition({
    start: "menu",
    nodes: {
      menu: {
        type: "menu",
        text: "Menu",
        options: [{ label: "1 - Atendimento", next: "done" }],
      },
      done: {
        type: "text",
        text: "Tudo certo.",
      },
    },
  });
  const current = validateChatbotFlowDefinition({
    start: "consent",
    nodes: {
      consent: {
        type: "consent",
        purpose: "attendance",
        textVersion: "v1",
        message: "Digite 1 para aceitar.",
        acceptOption: "1",
        onAccepted: "menu",
      },
      menu: {
        type: "menu",
        text: "Menu",
        options: [{ label: "1 - Atendimento", next: "done" }],
      },
      done: {
        type: "text",
        text: "Tudo certo.",
      },
    },
  });
  assert.equal(previous.ok, true);
  assert.equal(current.ok, true);
  if (!previous.ok || !current.ok) return;

  const result = executeChatbotFlow({
    flowId: "flow_1",
    definition: current.definition,
    state: makeState({
      flow: "chatbot:flow_1",
      chatbotActive: true,
      chatbotNodeId: "menu",
      answers: {
        chatbotRuntime: {
          flowStructureHash: getChatbotFlowStructureHash(previous.definition),
        },
      },
    }),
    inboundText: "Oi",
    nowIso: "2026-09-01T10:00:00.000Z",
  });

  assert.equal(result.handled, true);
  assert.equal(result.state.chatbotNodeId, "consent");
  assert.equal(result.replyText, "Digite 1 para aceitar.");
  assert.equal(result.events?.[0]?.event, "flow.runtime_coherence.restart_applied");
  assert.equal(result.events?.[0]?.reason, "structure_changed");
});

test("executeChatbotFlow restarts active runtime when current node no longer exists", () => {
  const current = validateChatbotFlowDefinition({
    start: "consent",
    nodes: {
      consent: {
        type: "consent",
        purpose: "attendance",
        textVersion: "v1",
        message: "Digite 1 para aceitar.",
        acceptOption: "1",
        onAccepted: "menu",
      },
      menu: {
        type: "menu",
        text: "Menu atual",
        options: [{ label: "1 - Atendimento", next: "done" }],
      },
      done: {
        type: "text",
        text: "Tudo certo.",
      },
    },
  });
  assert.equal(current.ok, true);
  if (!current.ok) return;

  const result = executeChatbotFlow({
    flowId: "flow_1",
    definition: current.definition,
    state: makeState({
      flow: "chatbot:flow_1",
      chatbotActive: true,
      chatbotNodeId: "removed_menu",
      answers: {
        chatbotRuntime: {
          flowStructureHash: getChatbotFlowStructureHash(current.definition),
        },
      },
    }),
    inboundText: "Oi",
    nowIso: "2026-09-01T10:00:00.000Z",
  });

  assert.equal(result.handled, true);
  assert.equal(result.state.chatbotNodeId, "consent");
  assert.equal(result.replyText, "Digite 1 para aceitar.");
  assert.equal(result.events?.[0]?.event, "flow.runtime_coherence.restart_applied");
  assert.equal(result.events?.[0]?.reason, "node_missing");
});

test("executeChatbotFlow preserves explicit menu option numbers", () => {
  const validated = validateChatbotFlowDefinition({
    start: "menu",
    nodes: {
      menu: {
        type: "menu",
        text: "Escolha",
        options: [
          { label: "Dúvidas técnicas", next: "technical" },
          { label: "0 - Voltar", next: "start" },
        ],
      },
      technical: {
        type: "text",
        text: "Encaminhando dúvidas técnicas.",
      },
      start: {
        type: "text",
        text: "Voltando ao início.",
      },
    },
  });
  assert.equal(validated.ok, true);
  if (!validated.ok) return;

  const menu = executeChatbotFlow({
    flowId: "flow_explicit_menu_numbers",
    definition: validated.definition,
    state: makeState(),
    inboundText: "oi",
    nowIso: "2026-08-12T10:00:00.000Z",
  });
  assert.match(menu.replyText ?? "", /\*1\* - Dúvidas técnicas/);
  assert.match(menu.replyText ?? "", /\*0\* - Voltar/);
  assert.doesNotMatch(menu.replyText ?? "", /2\. 0 - Voltar/);

  const selected = executeChatbotFlow({
    flowId: "flow_explicit_menu_numbers",
    definition: validated.definition,
    state: makeCurrentChatbotState(validated.definition, {
      flow: "chatbot:flow_explicit_menu_numbers",
      chatbotActive: true,
      chatbotNodeId: "menu",
    }),
    inboundText: "0",
    nowIso: "2026-08-12T10:00:01.000Z",
  });
  assert.equal(selected.handled, true);
  assert.equal(selected.replyText, "Voltando ao início.");
});

function makeConsolidatedMenuFixture() {
  return validateChatbotFlowDefinition({
    metadata: {
      preset: "tenant-demo-consolidated",
      closeCommandSource: "TenantOperationalConfig.config.chatbotCloseCommand",
    },
    start: "main_menu",
    globalCommands: [{ command: "#", action: "BACK", allowedModes: ["BOT"] }],
    nodes: {
      main_menu: {
        type: "menu",
        text:
          "Seja bem-vindo (a).\n\n🚨 *Nosso horário de atendimento direcionado é de segunda a sexta.*\n\n😁 Digite o número de acordo com o assunto desejado:",
        fallbackText:
          "⚠️ Desculpe, essa opção é inválida. Tente novamente digitando apenas o número correspondente ao seu interesse, tá?",
        showBackCommand: false,
        options: [
          { label: "1 - PNAB", next: "handoff_general", departmentId: "department_general", queueId: "queue_general" },
          { label: "2 - Lei Paulo Gustavo", next: "handoff_general", departmentId: "department_general", queueId: "queue_general" },
          { label: "3 - Outros Editais", next: "handoff_general", departmentId: "department_general", queueId: "queue_general" },
          { label: "4 - Mapa Cultural", next: "mapa_menu" },
          { label: "5 - Fundarpe", next: "fundarpe_menu" },
          { label: "6 - Busca Ativa", next: "handoff_general", departmentId: "department_general", queueId: "queue_general" },
          { label: "7 - Cultura Viva", next: "cultura_viva_menu" },
          { label: "8 - Outros", next: "handoff_general", departmentId: "department_general", queueId: "queue_general" },
        ],
      },
      mapa_menu: {
        type: "menu",
        text: "😁 Digite o número de acordo com o assunto desejado:\n\n👉 *4 - Mapa Cultural:*",
        fallbackText: "⚠️ Desculpe, essa opção é inválida.",
        options: [
          { label: "1 - Acesse o Mapa Cultural", next: "mapa_link" },
          { label: "2 - Tutorial", next: "mapa_tutorial" },
          {
            label: "3 - Falar com atendimento técnico",
            next: "handoff_technical",
            departmentId: "department_technical",
            queueId: "queue_technical",
            visibilityCondition: { departmentAvailability: "OPEN" },
          },
        ],
      },
      fundarpe_menu: {
        type: "menu",
        text: "😁 Digite o número de acordo com o assunto desejado:\n\n👉 *5 - Fundarpe:*",
        options: [
          { label: "1 - Contato Fundarpe", next: "fundarpe_contact" },
          { label: "2 - Falar com atendimento Fundarpe", next: "handoff_fundarpe", departmentId: "department_fundarpe", queueId: "queue_fundarpe" },
        ],
      },
      cultura_viva_menu: {
        type: "menu",
        text: "😁 Digite o número de acordo com o assunto desejado:\n\n👉 *7 - Cultura Viva:*",
        options: [{ label: "1 - Contatos Cultura Viva", next: "cultura_viva_contact" }],
      },
      mapa_link: { type: "text", text: "Link do Mapa.", next: "mapa_menu" },
      mapa_tutorial: { type: "text", text: "Tutorial do Mapa.", next: "mapa_menu" },
      fundarpe_contact: { type: "text", text: "Contato Fundarpe.", next: "fundarpe_menu" },
      cultura_viva_contact: { type: "text", text: "Contato Cultura Viva.", next: "cultura_viva_menu" },
      handoff_general: { type: "handoff", text: "Encaminhando.", departmentId: "department_general", queueId: "queue_general" },
      handoff_fundarpe: { type: "handoff", text: "Encaminhando Fundarpe.", departmentId: "department_fundarpe", queueId: "queue_fundarpe" },
      handoff_technical: { type: "handoff", text: "Encaminhando técnico.", departmentId: "department_technical", queueId: "queue_technical" },
    },
  });
}

test("executeChatbotFlow keeps consolidated menu explicit numbers bold without duplicating labels", () => {
  const validated = makeConsolidatedMenuFixture();
  assert.equal(validated.ok, true);
  if (!validated.ok) return;

  const result = executeChatbotFlow({
    flowId: "flow_consolidated",
    definition: validated.definition,
    state: makeState(),
    inboundText: "oi",
    nowIso: "2026-08-17T13:00:00.000Z",
  });

  assert.match(result.replyText ?? "", /\*1\* - PNAB/);
  assert.match(result.replyText ?? "", /\*8\* - Outros/);
  assert.doesNotMatch(result.replyText ?? "", /\*1\* - 1 - PNAB/);
  assert.doesNotMatch(result.replyText ?? "", /#ENCERRAR#/);
});

test("executeChatbotFlow does not map hidden explicit options by visible array index", () => {
  const validated = makeConsolidatedMenuFixture();
  assert.equal(validated.ok, true);
  if (!validated.ok) return;

  const result = executeChatbotFlow({
    flowId: "flow_consolidated",
    definition: validated.definition,
    state: makeCurrentChatbotState(validated.definition, {
      flow: "chatbot:flow_consolidated",
      chatbotActive: true,
      chatbotNodeId: "mapa_menu",
    }),
    inboundText: "3",
    nowIso: "2026-08-17T15:30:00.000Z",
    options: { departmentAvailabilityById: { department_technical: "CLOSED" } },
  });

  assert.equal(result.pendingHandoff, undefined);
  assert.match(result.replyText ?? "", /opção é inválida/i);
  assert.match(result.replyText ?? "", /\*1\* - Acesse o Mapa Cultural/);
  assert.match(result.replyText ?? "", /\*2\* - Tutorial/);
  assert.doesNotMatch(result.replyText ?? "", /Falar com atendimento técnico/);
});

test("executeChatbotFlow keeps global close command outside consolidated flow commands", () => {
  const validated = makeConsolidatedMenuFixture();
  assert.equal(validated.ok, true);
  if (!validated.ok) return;

  assert.deepEqual(validated.definition.globalCommands, [
    { command: "#", action: "BACK", allowedModes: ["BOT"] },
  ]);

  const result = executeChatbotFlow({
    flowId: "flow_consolidated",
    definition: validated.definition,
    state: makeCurrentChatbotState(validated.definition, {
      flow: "chatbot:flow_consolidated",
      chatbotActive: true,
      chatbotNodeId: "fundarpe_menu",
    }),
    inboundText: "#",
    nowIso: "2026-08-17T14:00:00.000Z",
  });

  assert.equal(result.state.chatbotNodeId, "main_menu");
  assert.match(result.replyText ?? "", /\*5\* - Fundarpe/);
});

test("executeChatbotFlow applies configured global back command without hardcoding command text", () => {
  const validated = validateChatbotFlowDefinition({
    start: "main",
    globalCommands: [{ command: "#", action: "BACK", allowedModes: ["BOT"] }],
    nodes: {
      main: {
        type: "menu",
        text: "Menu principal",
        options: [{ label: "4 - Submenu", next: "submenu" }],
      },
      submenu: {
        type: "menu",
        text: "Submenu",
        options: [{ label: "1 - Detalhe", next: "detail" }],
      },
      detail: {
        type: "text",
        text: "Detalhe",
        next: "submenu",
      },
    },
  });
  assert.equal(validated.ok, true);
  if (!validated.ok) return;

  const result = executeChatbotFlow({
    flowId: "flow_back",
    definition: validated.definition,
    state: makeCurrentChatbotState(validated.definition, {
      flow: "chatbot:flow_back",
      chatbotActive: true,
      chatbotNodeId: "submenu",
      answers: {
        chatbotRuntime: { lastInteractionAt: "2026-08-12T10:00:00.000Z" },
      },
    }),
    inboundText: "#",
    nowIso: "2026-08-12T10:01:00.000Z",
  });

  assert.equal(result.handled, true);
  assert.equal(result.state.chatbotNodeId, "main");
  assert.match(result.replyText ?? "", /Menu principal/);
  assert.equal(result.events?.[0]?.event, "flow.global_command.applied");
});

test("executeChatbotFlow treats root back command as invalid option and redisplays root menu", () => {
  const validated = validateChatbotFlowDefinition({
    start: "main",
    globalCommands: [{ command: "#", action: "BACK", allowedModes: ["BOT"] }],
    nodes: {
      main: {
        type: "menu",
        text: "Menu principal",
        options: [{ label: "1 - Atendimento", next: "handoff" }],
      },
      handoff: { type: "handoff" },
    },
  });
  assert.equal(validated.ok, true);
  if (!validated.ok) return;

  const result = executeChatbotFlow({
    flowId: "flow_back_root",
    definition: validated.definition,
    state: makeCurrentChatbotState(validated.definition, {
      flow: "chatbot:flow_back_root",
      chatbotActive: true,
      chatbotNodeId: "main",
      answers: {
        chatbotRuntime: { lastInteractionAt: "2026-08-12T10:00:00.000Z" },
      },
    }),
    inboundText: "#",
    nowIso: "2026-08-12T10:01:00.000Z",
  });

  assert.equal(result.handled, true);
  assert.equal(result.state.chatbotNodeId, "main");
  assert.match(result.replyText ?? "", /Opção inválida/);
  assert.match(result.replyText ?? "", /Menu principal/);
});

test("executeChatbotFlow can hide the rendered back command on selected menus", () => {
  const validated = validateChatbotFlowDefinition({
    start: "main",
    globalCommands: [{ command: "#", action: "BACK", allowedModes: ["BOT"] }],
    nodes: {
      main: {
        type: "menu",
        text: "Menu principal",
        showBackCommand: false,
        options: [{ label: "4 - Submenu", next: "submenu" }],
      },
      submenu: {
        type: "menu",
        text: "Submenu",
        options: [{ label: "1 - Detalhe", next: "detail" }],
      },
      detail: { type: "text", text: "Detalhe" },
    },
  });
  assert.equal(validated.ok, true);
  if (!validated.ok) return;

  const root = executeChatbotFlow({
    flowId: "flow_hidden_back",
    definition: validated.definition,
    state: makeState(),
    inboundText: "oi",
    nowIso: "2026-08-12T10:00:00.000Z",
  });
  assert.match(root.replyText ?? "", /Menu principal/);
  assert.doesNotMatch(root.replyText ?? "", /# - Voltar/);

  const submenu = executeChatbotFlow({
    flowId: "flow_hidden_back",
    definition: validated.definition,
    state: makeCurrentChatbotState(validated.definition, {
      flow: "chatbot:flow_hidden_back",
      chatbotActive: true,
      chatbotNodeId: "main",
    }),
    inboundText: "4",
    nowIso: "2026-08-12T10:01:00.000Z",
  });
  assert.match(submenu.replyText ?? "", /Submenu/);
  assert.match(submenu.replyText ?? "", /# - Voltar às opções anteriores\./);
});

test("executeChatbotFlow treats root menu after consent as invalid option on back command", () => {
  const validated = validateChatbotFlowDefinition({
    start: "consent",
    globalCommands: [{ command: "#", action: "BACK", allowedModes: ["BOT"] }],
    nodes: {
      consent: {
        type: "consent",
        purpose: "service",
        textVersion: "v1",
        message: "Autoriza?",
        acceptOption: "1",
        declineOption: "2",
        onAccepted: "welcome",
        onDeclined: "declined",
      },
      welcome: {
        type: "text",
        text: "Bem-vindo",
        next: "main",
      },
      main: {
        type: "menu",
        text: "Menu principal",
        fallbackText: "Opção inválida.",
        options: [{ label: "4 - Atendimento", next: "handoff" }],
      },
      handoff: { type: "handoff" },
      declined: { type: "text", text: "Encerrado" },
    },
  });
  assert.equal(validated.ok, true);
  if (!validated.ok) return;

  const result = executeChatbotFlow({
    flowId: "flow_back_root_after_consent",
    definition: validated.definition,
    state: makeCurrentChatbotState(validated.definition, {
      flow: "chatbot:flow_back_root_after_consent",
      chatbotActive: true,
      chatbotNodeId: "main",
      answers: {
        chatbotRuntime: {
          acceptedConsents: { "service:v1": true },
          lastInteractionAt: "2026-08-12T10:00:00.000Z",
        },
      },
    }),
    inboundText: "#",
    nowIso: "2026-08-12T10:01:00.000Z",
  });

  assert.equal(result.handled, true);
  assert.equal(result.state.chatbotNodeId, "main");
  assert.match(result.replyText ?? "", /Opção inválida/);
  assert.match(result.replyText ?? "", /Menu principal/);
  assert.doesNotMatch(result.replyText ?? "", /Autoriza/);
});

test("executeChatbotFlow ignores global back command during human handoff", () => {
  const validated = validateChatbotFlowDefinition({
    start: "main",
    globalCommands: [{ command: "#", action: "BACK", allowedModes: ["BOT"] }],
    nodes: {
      main: {
        type: "menu",
        text: "Menu principal",
        options: [{ label: "1 - Atendimento", next: "handoff" }],
      },
      handoff: { type: "handoff" },
    },
  });
  assert.equal(validated.ok, true);
  if (!validated.ok) return;

  const result = executeChatbotFlow({
    flowId: "flow_back_human",
    definition: validated.definition,
    state: makeCurrentChatbotState(validated.definition, {
      flow: "chatbot:flow_back_human",
      chatbotActive: true,
      chatbotNodeId: "main",
      mode: "HUMAN",
      handoff: { status: "active", activatedAt: "2026-08-12T10:00:00.000Z" },
    }),
    inboundText: "#",
    nowIso: "2026-08-12T10:01:00.000Z",
  });

  assert.equal(result.handled, true);
  assert.equal(result.state.chatbotNodeId, "main");
  assert.match(result.replyText ?? "", /Menu principal/);
  assert.equal(Boolean(result.events?.some((event) => event.event === "flow.global_command.applied")), false);
});

test("executeChatbotFlow ignores global back command when conversation is assigned", () => {
  const validated = validateChatbotFlowDefinition({
    start: "main",
    globalCommands: [{ command: "#", action: "BACK", allowedModes: ["BOT"] }],
    nodes: {
      main: {
        type: "menu",
        text: "Menu principal",
        options: [{ label: "1 - Submenu", next: "submenu" }],
      },
      submenu: {
        type: "menu",
        text: "Submenu",
        options: [{ label: "1 - Detalhe", next: "detail" }],
      },
      detail: { type: "text", text: "Detalhe" },
    },
  });
  assert.equal(validated.ok, true);
  if (!validated.ok) return;

  const result = executeChatbotFlow({
    flowId: "flow_back_assigned",
    definition: validated.definition,
    state: makeCurrentChatbotState(validated.definition, {
      flow: "chatbot:flow_back_assigned",
      chatbotActive: true,
      chatbotNodeId: "submenu",
      assignedUserId: "operator-1",
    }),
    inboundText: "#",
    nowIso: "2026-08-12T10:01:00.000Z",
  });

  assert.equal(result.handled, true);
  assert.equal(result.state.chatbotNodeId, "submenu");
  assert.match(result.replyText ?? "", /Submenu/);
  assert.equal(Boolean(result.events?.some((event) => event.event === "flow.global_command.applied")), false);
});

test("executeChatbotFlow resets submenu after configured inactivity while preserving flow context", () => {
  const validated = validateChatbotFlowDefinition({
    start: "main",
    inactivityPolicy: { resetAfterMinutes: 30 },
    nodes: {
      main: {
        type: "menu",
        text: "Menu principal",
        options: [{ label: "1 - Submenu", next: "submenu" }],
      },
      submenu: {
        type: "menu",
        text: "Submenu antigo",
        options: [{ label: "1 - Detalhe", next: "detail" }],
      },
      detail: { type: "text", text: "Detalhe" },
    },
  });
  assert.equal(validated.ok, true);
  if (!validated.ok) return;

  const result = executeChatbotFlow({
    flowId: "flow_timeout",
    definition: validated.definition,
    state: makeCurrentChatbotState(validated.definition, {
      flow: "chatbot:flow_timeout",
      chatbotActive: true,
      chatbotNodeId: "submenu",
      answers: {
        flowContext: { consent: true },
        chatbotRuntime: { lastInteractionAt: "2026-08-12T10:00:00.000Z" },
      },
    }),
    inboundText: "1",
    nowIso: "2026-08-12T10:45:00.000Z",
  });

  assert.equal(result.handled, true);
  assert.equal(result.state.chatbotNodeId, "main");
  assert.equal(result.state.answers?.flowContext?.consent, true);
  assert.match(result.replyText ?? "", /Menu principal/);
  assert.equal(result.events?.[0]?.event, "flow.inactivity_reset.applied");
});

test("executeChatbotFlow keeps submenu inside inactivity window", () => {
  const validated = validateChatbotFlowDefinition({
    start: "main",
    inactivityPolicy: { resetAfterMinutes: 30 },
    nodes: {
      main: {
        type: "menu",
        text: "Menu principal",
        options: [{ label: "1 - Submenu", next: "submenu" }],
      },
      submenu: {
        type: "menu",
        text: "Submenu",
        options: [{ label: "1 - Detalhe", next: "detail" }],
      },
      detail: { type: "text", text: "Detalhe" },
    },
  });
  assert.equal(validated.ok, true);
  if (!validated.ok) return;

  const result = executeChatbotFlow({
    flowId: "flow_timeout",
    definition: validated.definition,
    state: makeCurrentChatbotState(validated.definition, {
      flow: "chatbot:flow_timeout",
      chatbotActive: true,
      chatbotNodeId: "submenu",
      answers: {
        chatbotRuntime: { lastInteractionAt: "2026-08-12T10:00:00.000Z" },
      },
    }),
    inboundText: "1",
    nowIso: "2026-08-12T10:10:00.000Z",
  });

  assert.equal(result.handled, true);
  assert.equal(result.replyText, "Detalhe");
  assert.equal(Boolean(result.events?.some((event) => event.event === "flow.inactivity_reset.applied")), false);
});

test("validateChatbotFlowDefinition rejects duplicate explicit menu option numbers", () => {
  const result = validateChatbotFlowDefinition({
    start: "menu",
    nodes: {
      menu: {
        type: "menu",
        text: "Escolha",
        options: [
          { label: "2. Atendimento", next: "handoff" },
          { label: "2 - Outro atendimento", next: "handoff" },
        ],
      },
      handoff: {
        type: "handoff",
      },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /duplicate option/);
});

test("executeChatbotFlow captures validated contact fields before menu", () => {
  const validated = validateChatbotFlowDefinition({
    start: "capture_email",
    nodes: {
      capture_email: {
        type: "capture",
        text: "Informe seu e-mail.",
        field: "contact_email",
        validation: "email",
        errorText: "Informe um e-mail válido.",
        next: "menu",
      },
      menu: {
        type: "menu",
        text: "Escolha",
        options: [{ label: "Demonstração", next: "done" }],
      },
      done: {
        type: "text",
        text: "Tudo certo",
      },
    },
  });
  assert.equal(validated.ok, true);
  if (!validated.ok) return;

  const prompt = executeChatbotFlow({
    flowId: "flow_1",
    definition: validated.definition,
    state: makeState(),
    inboundText: "oi",
    nowIso: "2026-04-17T10:00:01.000Z",
  });

  assert.equal(prompt.handled, true);
  assert.equal(prompt.state.chatbotActive, true);
  assert.equal(prompt.state.chatbotNodeId, "capture_email");
  assert.match(prompt.replyText ?? "", /Informe seu e-mail/);

  const invalid = executeChatbotFlow({
    flowId: "flow_1",
    definition: validated.definition,
    state: prompt.state,
    inboundText: "email invalido",
    nowIso: "2026-04-17T10:00:02.000Z",
  });

  assert.equal(invalid.state.chatbotNodeId, "capture_email");
  assert.match(invalid.replyText ?? "", /e-mail válido/);

  const valid = executeChatbotFlow({
    flowId: "flow_1",
    definition: validated.definition,
    state: invalid.state,
    inboundText: "ANA@EXAMPLE.COM",
    nowIso: "2026-04-17T10:00:03.000Z",
  });

  assert.equal(valid.state.chatbotNodeId, "menu");
  assert.equal(valid.state.answers?.flowContext?.contact_email, "ana@example.com");
  assert.match(valid.replyText ?? "", /\*1\* - Demonstração/);
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
    state: makeCurrentChatbotState(validated.definition, {
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
    state: makeCurrentChatbotState(validated.definition, {
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

test("executeChatbotFlow can answer text and remain on a menu without redisplay", () => {
  const validated = validateChatbotFlowDefinition({
    start: "menu",
    nodes: {
      menu: {
        type: "menu",
        text: "Escolha",
        options: [{ label: "1. Link", next: "link" }],
      },
      link: {
        type: "text",
        text: "Clique Aqui: https://example.test",
        returnTo: "menu",
      },
    },
  });
  assert.equal(validated.ok, true);
  if (!validated.ok) return;

  const result = executeChatbotFlow({
    flowId: "flow_1",
    definition: validated.definition,
    state: makeCurrentChatbotState(validated.definition, {
      flow: "chatbot:flow_1",
      chatbotActive: true,
      chatbotNodeId: "menu",
    }),
    inboundText: "1",
    nowIso: "2026-04-17T10:00:02.000Z",
  });

  assert.equal(result.handled, true);
  assert.equal(result.state.chatbotActive, true);
  assert.equal(result.state.chatbotNodeId, "menu");
  assert.equal(result.replyText, "Clique Aqui: https://example.test");
});

test("executeChatbotFlow can hand off on invalid menu answer when configured", () => {
  const validated = validateChatbotFlowDefinition({
    start: "menu",
    nodes: {
      menu: {
        type: "menu",
        text: "Escolha",
        options: [
          { label: "4 - Atendimento", next: "text_1" },
          { label: "5 - Fundarpe", next: "text_2" },
          { label: "7 - Cultura Viva", next: "text_3" },
        ],
        invalidSelectionAction: {
          action: "HANDOFF",
          text: "Aguarde só mais um pouco, estou te direcionando para um/uma atendente.",
          departmentId: "department_general",
          queueId: "queue_general",
          context: { motivo: "opcao_invalida" },
          tags: ["invalid_selection"],
        },
      },
      text_1: {
        type: "text",
        text: "Tudo certo",
      },
      text_2: {
        type: "text",
        text: "Fundarpe",
      },
      text_3: {
        type: "text",
        text: "Cultura Viva",
      },
    },
  });
  assert.equal(validated.ok, true);
  if (!validated.ok) return;

  const result = executeChatbotFlow({
    flowId: "flow_1",
    definition: validated.definition,
    state: makeCurrentChatbotState(validated.definition, {
      flow: "chatbot:flow_1",
      chatbotActive: true,
      chatbotNodeId: "menu",
    }),
    inboundText: "3",
    nowIso: "2026-04-17T10:00:02.000Z",
  });

  assert.equal(result.handled, true);
  assert.equal(result.state.chatbotActive, false);
  assert.equal(result.state.chatbotNodeId, undefined);
  assert.equal(result.state.departmentId, "department_general");
  assert.equal(result.state.queueId, "queue_general");
  assert.equal(result.pendingHandoff?.feedbackText, "Aguarde só mais um pouco, estou te direcionando para um/uma atendente.");
  assert.equal(result.pendingHandoff?.departmentId, "department_general");
  assert.equal(result.pendingHandoff?.queueId, "queue_general");
  assert.equal(result.pendingHandoff?.tags.includes("invalid_selection"), true);
  assert.equal(result.events?.some((event) => event.event === "flow.invalid_selection.handoff_applied"), true);
  assert.doesNotMatch(result.replyText ?? "", /Cultura Viva/);
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
    state: makeCurrentChatbotState(validated.definition, {
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
    state: makeCurrentChatbotState(validated.definition, {
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
    state: makeCurrentChatbotState(validated.definition, {
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

test("executeChatbotFlow applies selected option routing", () => {
  const validated = validateChatbotFlowDefinition({
    start: "menu",
    nodes: {
      menu: {
        type: "menu",
        text: "Escolha",
        options: [
          {
            label: "Duvidas tecnicas",
            next: "handoff_tecnico",
            departmentId: "department_technical",
            queueId: "queue_technical",
            context: { area: "duvidas_tecnicas" },
          },
        ],
      },
      handoff_tecnico: {
        type: "handoff",
        text: "Vou encaminhar.",
      },
    },
  });
  assert.equal(validated.ok, true);
  if (!validated.ok) return;

  const result = executeChatbotFlow({
    flowId: "flow_option_routing",
    definition: validated.definition,
    state: makeCurrentChatbotState(validated.definition, {
      flow: "chatbot:flow_option_routing",
      chatbotActive: true,
      chatbotNodeId: "menu",
      departmentId: "department_general",
      queueId: "queue_general",
    }),
    inboundText: "1",
    nowIso: "2026-08-07T12:00:00.000Z",
  });

  assert.equal(result.handled, true);
  assert.equal(result.state.departmentId, "department_technical");
  assert.equal(result.state.queueId, "queue_technical");
  assert.match(result.pendingHandoff?.summary ?? "", /Área: Duvidas Tecnicas/);
});

test("executeChatbotFlow exposes department handoff closed text", () => {
  const validated = validateChatbotFlowDefinition({
    start: "menu",
    nodes: {
      menu: {
        type: "menu",
        text: "Escolha",
        options: [
          {
            label: "Tecnico",
            next: "handoff_tecnico",
            departmentId: "department_technical",
            queueId: "queue_technical",
          },
        ],
      },
      handoff_tecnico: {
        type: "handoff",
        text: "Vou encaminhar.",
        closedText: "O setor tecnico esta fechado agora. Volte no proximo horario de atendimento.",
      },
    },
  });
  assert.equal(validated.ok, true);
  if (!validated.ok) return;

  const result = executeChatbotFlow({
    flowId: "flow_option_routing_closed",
    definition: validated.definition,
    state: makeCurrentChatbotState(validated.definition, {
      flow: "chatbot:flow_option_routing_closed",
      chatbotActive: true,
      chatbotNodeId: "menu",
    }),
    inboundText: "1",
    nowIso: "2026-08-07T12:00:00.000Z",
  });

  assert.equal(result.handled, true);
  assert.equal(result.pendingHandoff?.departmentId, "department_technical");
  assert.equal(result.pendingHandoff?.queueId, "queue_technical");
  assert.equal(
    result.pendingHandoff?.closedText,
    "O setor tecnico esta fechado agora. Volte no proximo horario de atendimento."
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

test("buildSuggestedReply returns intent-specific BPC suggestion", () => {
  const suggestion = buildSuggestedReply({
    intent: "bpc_loas",
    servico: "bpc_loas",
    origem_intencao: "mensagem_livre",
  });

  assert.match(suggestion, /BPC\/LOAS/);
  assert.match(suggestion, /próximos passos/);
});

test("buildSuggestedReply returns intent-specific denied benefit suggestion", () => {
  const suggestion = buildSuggestedReply({
    intent: "beneficio_negado",
    servico: "beneficio_negado",
    prioridade: "alta",
  });

  assert.match(suggestion, /benefício negado/i);
  assert.match(suggestion, /recurso|novo pedido|medida judicial/i);
});

test("buildSuggestedReply falls back to generic suggestion", () => {
  const suggestion = buildSuggestedReply({});

  assert.match(suggestion, /Recebi seu atendimento pela automação/);
  assert.match(suggestion, /orientar pelos próximos passos/);
});

test("buildSuggestedReply does not include sensitive context values", () => {
  const suggestion = buildSuggestedReply({
    servico: "5511999999999",
    situacao: "cliente@example.com",
    nome: "Maria",
  });

  assert.doesNotMatch(suggestion, /5511999999999/);
  assert.doesNotMatch(suggestion, /cliente@example.com/);
  assert.doesNotMatch(suggestion, /Maria/);
  assert.match(suggestion, /Recebi seu atendimento pela automação/);
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
