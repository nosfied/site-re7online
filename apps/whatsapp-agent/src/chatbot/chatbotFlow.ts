import { ConversationState, FlowContext } from "../conversation/conversation.types.js";

export type ChatbotFlowMetadata = {
  context?: FlowContext;
  tags?: string[];
};

export type ChatbotMenuOption = Record<string, unknown> & ChatbotFlowMetadata & {
  label: string;
  next: string;
};

export type ChatbotMenuNode = Record<string, unknown> & ChatbotFlowMetadata & {
  type: "menu";
  text: string;
  options: ChatbotMenuOption[];
};

export type ChatbotTextNode = Record<string, unknown> & ChatbotFlowMetadata & {
  type: "text";
  text: string;
  next?: string;
};

export type ChatbotHandoffNode = Record<string, unknown> & ChatbotFlowMetadata & {
  type: "handoff";
  text?: string;
  handoffSummary?: string;
};

export type ChatbotNode = ChatbotMenuNode | ChatbotTextNode | ChatbotHandoffNode;

export type ChatbotFlowDefinition = {
  start: string;
  nodes: Record<string, ChatbotNode>;
};

export type ChatbotValidationResult =
  | {
      ok: true;
      definition: ChatbotFlowDefinition;
    }
  | {
      ok: false;
      code: "invalid_chatbot_definition";
      message: string;
    };

export type ChatbotExecutionResult = {
  handled: boolean;
  state: ConversationState;
  replyText?: string;
  pendingHandoff?: {
    feedbackText: string;
    summary: string;
    suggestedReply: string;
    tags: string[];
    nodeId: string;
  };
  events?: ChatbotExecutionEvent[];
};

const CHATBOT_MAX_STEPS_PER_EXECUTION = 12;
const CHATBOT_MAX_AUTO_ADVANCES_PER_EXECUTION = 5;
const DEFAULT_HANDOFF_FEEDBACK_TEXT = "Vou te transferir para um atendente humano.";

export type ChatbotExecutionEvent =
  | {
      event: "flow.node.auto_advanced";
      flowId: string;
      fromNodeId: string;
      toNodeId: string;
    }
  | {
      event: "flow.context.merged";
      flowId: string;
      nodeId: string;
      source: "node" | "option";
      keys: string[];
    }
  | {
      event: "flow.context.tags_added";
      flowId: string;
      nodeId: string;
      source: "node" | "option";
      tags: string[];
    };

export function getInitialChatbotAwaitingNodeId(definition: ChatbotFlowDefinition) {
  let nodeId = definition.start;
  const visited = new Set<string>();
  for (let step = 0; step < CHATBOT_MAX_AUTO_ADVANCES_PER_EXECUTION; step += 1) {
    if (visited.has(nodeId)) return nodeId;
    visited.add(nodeId);
    const node = definition.nodes[nodeId];
    if (!node) return nodeId;
    if (node.type !== "text" || !node.next) return nodeId;
    nodeId = node.next;
  }
  return nodeId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeJsonValue(value: unknown): FlowContext[string] | undefined {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
    return value as FlowContext[string];
  }
  if (Array.isArray(value)) {
    const normalizedArray = value
      .map((item) => normalizeJsonValue(item))
      .filter((item): item is FlowContext[string] => item !== undefined);
    return normalizedArray;
  }
  if (isRecord(value)) {
    const normalizedObject: FlowContext = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      const normalizedValue = normalizeJsonValue(nestedValue);
      if (normalizedValue !== undefined) {
        normalizedObject[key] = normalizedValue;
      }
    }
    return normalizedObject;
  }
  return undefined;
}

function normalizeContext(value: unknown): FlowContext | undefined {
  if (!isRecord(value)) return undefined;
  const normalized: FlowContext = {};
  for (const [key, contextValue] of Object.entries(value)) {
    const normalizedValue = normalizeJsonValue(contextValue);
    if (normalizedValue !== undefined) {
      normalized[key] = normalizedValue;
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const tags = Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    )
  );
  return tags.length > 0 ? tags : undefined;
}

function getNodeMetadata(rawNode: Record<string, unknown>): ChatbotFlowMetadata {
  const context = normalizeContext(rawNode.context);
  const tags = normalizeTags(rawNode.tags);
  return {
    ...(context ? { context } : {}),
    ...(tags ? { tags } : {}),
  };
}

function preserveUnknownFields(
  rawNode: Record<string, unknown>,
  knownFields: string[]
): Record<string, unknown> {
  const preserved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawNode)) {
    if (!knownFields.includes(key)) {
      preserved[key] = value;
    }
  }
  return preserved;
}

type ChatbotNodeValidationResult =
  | { ok: true; node: ChatbotNode }
  | {
      ok: false;
      code: "invalid_chatbot_definition";
      message: string;
    };

function normalizeNode(rawNode: unknown, nodeId: string): ChatbotNodeValidationResult {
  if (!isRecord(rawNode)) {
    return {
      ok: false,
      code: "invalid_chatbot_definition",
      message: `Node "${nodeId}" must be an object.`,
    };
  }

  const type = getNonEmptyString(rawNode.type);
  if (!type || !["menu", "text", "handoff"].includes(type)) {
    return {
      ok: false,
      code: "invalid_chatbot_definition",
      message: `Node "${nodeId}" has an invalid type.`,
    };
  }

  if (type === "menu") {
    const text = getNonEmptyString(rawNode.text);
    const options = rawNode.options;
    if (!text) {
      return {
        ok: false,
        code: "invalid_chatbot_definition",
        message: `Menu node "${nodeId}" requires text.`,
      };
    }
    if (!Array.isArray(options) || options.length === 0) {
      return {
        ok: false,
        code: "invalid_chatbot_definition",
        message: `Menu node "${nodeId}" requires at least one option.`,
      };
    }
    const normalizedOptions: ChatbotMenuNode["options"] = [];
    for (let index = 0; index < options.length; index += 1) {
      const rawOption = options[index];
      if (!isRecord(rawOption)) {
        return {
          ok: false,
          code: "invalid_chatbot_definition",
          message: `Menu node "${nodeId}" has an invalid option at index ${index}.`,
        };
      }
      const label = getNonEmptyString(rawOption.label);
      const next = getNonEmptyString(rawOption.next);
      if (!label || !next) {
        return {
          ok: false,
          code: "invalid_chatbot_definition",
          message: `Menu node "${nodeId}" option ${index + 1} requires label and next.`,
        };
      }
      normalizedOptions.push({
        ...preserveUnknownFields(rawOption, ["label", "next", "context", "tags"]),
        label,
        next,
        ...getNodeMetadata(rawOption),
      });
    }
    return {
      ok: true,
      node: {
        ...preserveUnknownFields(rawNode, ["type", "text", "options", "context", "tags"]),
        type: "menu",
        text,
        options: normalizedOptions,
        ...getNodeMetadata(rawNode),
      },
    };
  }

  if (type === "text") {
    const text = getNonEmptyString(rawNode.text);
    if (!text) {
      return {
        ok: false,
        code: "invalid_chatbot_definition",
        message: `Text node "${nodeId}" requires text.`,
      };
    }
    const next = getNonEmptyString(rawNode.next);
    return {
      ok: true,
      node: {
        ...preserveUnknownFields(rawNode, ["type", "text", "next", "context", "tags"]),
        type: "text",
        text,
        ...(next ? { next } : {}),
        ...getNodeMetadata(rawNode),
      },
    };
  }

  const text = getNonEmptyString(rawNode.text);
  const handoffSummary = getNonEmptyString(rawNode.handoffSummary);
  return {
    ok: true,
    node: {
      ...preserveUnknownFields(rawNode, [
        "type",
        "text",
        "context",
        "tags",
        "handoffSummary",
      ]),
      type: "handoff",
      ...(text ? { text } : {}),
      ...(handoffSummary ? { handoffSummary } : {}),
      ...getNodeMetadata(rawNode),
    },
  };
}

export function validateChatbotFlowDefinition(definition: unknown): ChatbotValidationResult {
  if (!isRecord(definition)) {
    return {
      ok: false,
      code: "invalid_chatbot_definition",
      message: "Definition must be a JSON object.",
    };
  }

  const start = getNonEmptyString(definition.start);
  const rawNodes = definition.nodes;
  if (!start) {
    return {
      ok: false,
      code: "invalid_chatbot_definition",
      message: "Definition.start is required.",
    };
  }
  if (!isRecord(rawNodes) || Object.keys(rawNodes).length === 0) {
    return {
      ok: false,
      code: "invalid_chatbot_definition",
      message: "Definition.nodes must be a non-empty object.",
    };
  }

  const nodes: Record<string, ChatbotNode> = {};
  for (const [nodeId, rawNode] of Object.entries(rawNodes)) {
    const normalized = normalizeNode(rawNode, nodeId);
    if (!normalized.ok) return normalized;
    nodes[nodeId] = normalized.node;
  }

  if (!nodes[start]) {
    return {
      ok: false,
      code: "invalid_chatbot_definition",
      message: "Definition.start must point to a valid node.",
    };
  }

  for (const [nodeId, node] of Object.entries(nodes)) {
    if (node.type === "menu") {
      for (const option of node.options) {
        if (!nodes[option.next]) {
          return {
            ok: false,
            code: "invalid_chatbot_definition",
            message: `Menu node "${nodeId}" points to an unknown node "${option.next}".`,
          };
        }
      }
    }
    if (node.type === "text" && node.next && !nodes[node.next]) {
      return {
        ok: false,
        code: "invalid_chatbot_definition",
        message: `Text node "${nodeId}" points to an unknown node "${node.next}".`,
      };
    }
  }

  return {
    ok: true,
    definition: {
      start,
      nodes,
    },
  };
}

export function extractChatbotFlowId(flow: string | null | undefined) {
  if (!flow || !flow.startsWith("chatbot:")) return null;
  const flowId = flow.slice("chatbot:".length).trim();
  return flowId || null;
}

function withChatbotRuntime(
  state: ConversationState,
  flowId: string | null,
  nodeId: string | null,
  active: boolean
): ConversationState {
  return {
    ...state,
    flow: flowId ? (`chatbot:${flowId}` as ConversationState["flow"]) : undefined,
    chatbotNodeId: nodeId ?? undefined,
    chatbotActive: active,
  };
}

export function clearChatbotRuntime(state: ConversationState): ConversationState {
  if (!state.chatbotActive && !state.chatbotNodeId && !extractChatbotFlowId(state.flow)) {
    return state;
  }
  return withChatbotRuntime(state, null, null, false);
}

function renderMenu(node: ChatbotMenuNode) {
  const lines = node.options.map((option, index) => `${index + 1}. ${option.label}`);
  return [node.text, ...lines].join("\n");
}

function parseMenuSelection(text: string | null | undefined) {
  if (!text) return null;
  const normalized = text.trim();
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function mergeFlowMetadata(
  params: {
    state: ConversationState;
    metadata: ChatbotFlowMetadata;
    flowId: string;
    nodeId: string;
    source: "node" | "option";
    events: ChatbotExecutionEvent[];
  }
): ConversationState {
  let nextState = params.state;
  const context = params.metadata.context;
  if (context && Object.keys(context).length > 0) {
    const currentContext = isRecord(nextState.answers?.flowContext)
      ? nextState.answers?.flowContext
      : {};
    nextState = {
      ...nextState,
      answers: {
        ...(nextState.answers ?? {}),
        flowContext: {
          ...currentContext,
          ...context,
        },
      },
    };
    params.events.push({
      event: "flow.context.merged",
      flowId: params.flowId,
      nodeId: params.nodeId,
      source: params.source,
      keys: Object.keys(context),
    });
  }

  const tags = params.metadata.tags;
  if (tags && tags.length > 0) {
    const currentTags = Array.isArray(nextState.answers?.flowTags)
      ? nextState.answers?.flowTags ?? []
      : [];
    const mergedTags = Array.from(new Set([...currentTags, ...tags]));
    const addedTags = tags.filter((tag) => !currentTags.includes(tag));
    if (addedTags.length > 0) {
      nextState = {
        ...nextState,
        answers: {
          ...(nextState.answers ?? {}),
          flowTags: mergedTags,
        },
      };
      params.events.push({
        event: "flow.context.tags_added",
        flowId: params.flowId,
        nodeId: params.nodeId,
        source: params.source,
        tags: addedTags,
      });
    }
  }

  return nextState;
}

const HANDOFF_CONTEXT_LABELS: Record<string, string> = {
  area: "Área",
  assunto: "Assunto",
  benefit: "Benefício",
  beneficio: "Benefício",
  caseType: "Caso",
  caso: "Caso",
  department: "Setor",
  etapa: "Etapa",
  fase: "Fase",
  handoff_reason: "Motivo do encaminhamento",
  interest: "Interesse",
  interesse: "Interesse",
  lead_temp: "Temperatura do lead",
  motivo: "Motivo",
  origem: "Origem",
  perfil: "Perfil",
  priority: "Prioridade",
  prioridade: "Prioridade",
  profile: "Perfil",
  reason: "Motivo",
  segment: "Segmento",
  segmento: "Segmento",
  service: "Serviço",
  servico: "Serviço",
  servicoPretendido: "Serviço",
  situacao: "Situação",
  status: "Status",
  step: "Etapa",
};

const HANDOFF_CONTEXT_ORDER = [
  "area",
  "servico",
  "service",
  "servicoPretendido",
  "perfil",
  "profile",
  "situacao",
  "fase",
  "priority",
  "prioridade",
  "lead_temp",
  "handoff_reason",
  "motivo",
  "reason",
  "origem",
  "assunto",
  "status",
];

const HANDOFF_CONTEXT_VALUES: Record<string, string> = {
  alta: "Alta",
  analise_bpc_loas: "Análise BPC/LOAS",
  aposentadoria: "Aposentadoria",
  bpc_loas: "BPC/LOAS",
  diagnostico_bpc: "Diagnóstico BPC",
  pedido_negado: "Pedido negado",
  pessoa_com_deficiencia: "Pessoa com deficiência",
  previdenciario: "Previdenciário",
  quente: "Quente",
  revisao: "Revisão",
};

const SENSITIVE_CONTEXT_KEY_PATTERN =
  /(cpf|cnpj|rg|email|mail|phone|telefone|celular|whatsapp|waid|nome|name|address|endereco|document|documento)/i;
const SENSITIVE_CONTEXT_VALUE_PATTERN =
  /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})|(\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b)|(\b\d{10,13}\b)/i;

function formatContextLabel(key: string) {
  const knownLabel = HANDOFF_CONTEXT_LABELS[key];
  if (knownLabel) return knownLabel;
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatContextValue(text: string) {
  const knownValue = HANDOFF_CONTEXT_VALUES[text];
  if (knownValue) return knownValue;
  if (/^[a-z0-9_-]+$/.test(text) && /[_-]/.test(text)) {
    return text
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
  return text;
}

function formatSafeContextValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (!["string", "number", "boolean"].includes(typeof value)) return null;
  const text = String(value).trim().replace(/\s+/g, " ");
  if (!text || SENSITIVE_CONTEXT_VALUE_PATTERN.test(text)) return null;
  return formatContextValue(text).slice(0, 160);
}

function sortContextEntries(entries: Array<[string, FlowContext[string]]>) {
  return entries.sort(([leftKey], [rightKey]) => {
    const leftIndex = HANDOFF_CONTEXT_ORDER.indexOf(leftKey);
    const rightIndex = HANDOFF_CONTEXT_ORDER.indexOf(rightKey);
    if (leftIndex !== -1 || rightIndex !== -1) {
      return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) -
        (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex);
    }
    return leftKey.localeCompare(rightKey);
  });
}

export function buildHandoffSummary(
  flowContext: FlowContext | null | undefined,
  node?: Pick<ChatbotHandoffNode, "handoffSummary">
): string {
  const contextLines: string[] = [];
  const customSummary = getNonEmptyString(node?.handoffSummary);

  if (flowContext && isRecord(flowContext)) {
    for (const [key, value] of sortContextEntries(Object.entries(flowContext))) {
      if (SENSITIVE_CONTEXT_KEY_PATTERN.test(key)) continue;
      const label = formatContextLabel(key);
      const formattedValue = formatSafeContextValue(value);
      if (!formattedValue) continue;
      contextLines.push(`${label}: ${formattedValue}`);
    }
  }

  if (contextLines.length === 0 && (!customSummary || SENSITIVE_CONTEXT_VALUE_PATTERN.test(customSummary))) {
    return "Atendimento encaminhado pela automação. Sem contexto adicional registrado.";
  }

  return [
    "Resumo do atendimento",
    "---------------------",
    ...contextLines,
    ...(customSummary && !SENSITIVE_CONTEXT_VALUE_PATTERN.test(customSummary)
      ? ["", "Observação", "----------", customSummary.slice(0, 500)]
      : []),
  ].join("\n");
}

function getSafeContextText(
  flowContext: FlowContext | null | undefined,
  keys: string[]
) {
  if (!flowContext || !isRecord(flowContext)) return null;
  for (const key of keys) {
    if (SENSITIVE_CONTEXT_KEY_PATTERN.test(key)) continue;
    const value = formatSafeContextValue(flowContext[key]);
    if (value) return value;
  }
  return null;
}

function getNormalizedContextValue(
  flowContext: FlowContext | null | undefined,
  keys: string[]
) {
  if (!flowContext || !isRecord(flowContext)) return null;
  for (const key of keys) {
    if (SENSITIVE_CONTEXT_KEY_PATTERN.test(key)) continue;
    const rawValue = flowContext[key];
    if (typeof rawValue !== "string") continue;
    const value = rawValue.trim().toLowerCase();
    if (value && !SENSITIVE_CONTEXT_VALUE_PATTERN.test(value)) return value;
  }
  return null;
}

export function buildSuggestedReply(
  flowContext: FlowContext | null | undefined,
  tags?: string[] | null
): string {
  const intent = getNormalizedContextValue(flowContext, ["intent", "servico", "service"]);
  const service = getSafeContextText(flowContext, ["servico", "service", "servicoPretendido", "intent"]);
  const situation = getSafeContextText(flowContext, ["situacao", "fase", "status"]);
  const normalizedTags = new Set((tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean));
  const hasTag = (tag: string) => normalizedTags.has(tag);

  if (intent === "beneficio_negado" || intent === "pedido_negado" || hasTag("beneficio_negado")) {
    return [
      "Olá, tudo bem? Vi que seu atendimento chegou sobre benefício negado pelo INSS.",
      "Vou analisar as informações iniciais e te orientar sobre recurso, novo pedido ou medida judicial, conforme o caso.",
    ].join("\n");
  }

  if (intent === "bpc_loas" || intent === "bpc" || hasTag("bpc_loas")) {
    return [
      "Olá, tudo bem? Vi que seu atendimento chegou sobre BPC/LOAS.",
      "Vou verificar os pontos principais do caso, como renda familiar, idade ou deficiência, e te orientar sobre os próximos passos.",
    ].join("\n");
  }

  if (
    intent === "beneficio_cortado_suspenso" ||
    intent === "beneficio_cortado" ||
    intent === "beneficio_suspenso" ||
    hasTag("beneficio_cortado_suspenso")
  ) {
    return [
      "Olá, tudo bem? Vi que seu atendimento chegou sobre benefício cortado ou suspenso.",
      "Vou analisar o que ocorreu e te orientar sobre os próximos passos para tentar regularizar a situação.",
    ].join("\n");
  }

  if (intent === "revisao_beneficio" || intent === "revisao" || hasTag("revisao_beneficio")) {
    return [
      "Olá, tudo bem? Vi que seu atendimento chegou sobre revisão de benefício.",
      "Vou conferir as informações iniciais para avaliar se há possibilidade de correção de valor ou atrasados.",
    ].join("\n");
  }

  if (intent === "pensao_por_morte" || hasTag("pensao_por_morte")) {
    return [
      "Olá, tudo bem? Vi que seu atendimento chegou sobre pensão por morte.",
      "Vou analisar as informações iniciais para entender vínculo, dependência e documentação necessária.",
    ].join("\n");
  }

  if (intent === "aposentadoria" || hasTag("aposentadoria")) {
    return [
      "Olá, tudo bem? Vi que seu atendimento chegou sobre aposentadoria.",
      "Vou analisar idade, contribuições e histórico no INSS para entender qual caminho pode ser mais adequado.",
    ].join("\n");
  }

  if (service || situation) {
    return [
      "Olá, tudo bem? Recebi seu atendimento pela automação.",
      `Vi que o tema inicial é ${service ?? situation}. Vou analisar as informações registradas e te orientar pelos próximos passos.`,
    ].join("\n");
  }

  return [
    "Olá, tudo bem? Recebi seu atendimento pela automação.",
    "Vou analisar as informações iniciais e te orientar pelos próximos passos.",
  ].join("\n");
}

function executeNodeChain(params: {
  definition: ChatbotFlowDefinition;
  state: ConversationState;
  flowId: string;
  nodeId: string;
  nowIso: string;
}): ChatbotExecutionResult {
  const messages: string[] = [];
  const events: ChatbotExecutionEvent[] = [];
  let currentState = params.state;
  let currentNodeId: string | null = params.nodeId;
  const visited = new Set<string>();
  let stepCount = 0;
  let autoAdvanceCount = 0;

  while (currentNodeId) {
    stepCount += 1;
    if (stepCount > CHATBOT_MAX_STEPS_PER_EXECUTION) {
      return {
        handled: false,
        state: clearChatbotRuntime(currentState),
      };
    }
    if (visited.has(currentNodeId)) {
      return {
        handled: false,
        state: clearChatbotRuntime(currentState),
      };
    }
    visited.add(currentNodeId);
    const node: ChatbotNode | undefined = params.definition.nodes[currentNodeId];
    if (!node) {
      return {
        handled: false,
        state: clearChatbotRuntime(currentState),
      };
    }

    currentState = mergeFlowMetadata({
      state: currentState,
      metadata: node,
      flowId: params.flowId,
      nodeId: currentNodeId,
      source: "node",
      events,
    });

    if (node.type === "menu") {
      currentState = withChatbotRuntime(currentState, params.flowId, currentNodeId, true);
      messages.push(renderMenu(node));
      return {
        handled: true,
        state: currentState,
        replyText: messages.join("\n\n"),
        events,
      };
    }

    if (node.type === "text") {
      messages.push(node.text);
      if (node.next) {
        autoAdvanceCount += 1;
        if (autoAdvanceCount > CHATBOT_MAX_AUTO_ADVANCES_PER_EXECUTION) {
          return {
            handled: false,
            state: clearChatbotRuntime(currentState),
            events,
          };
        }
        events.push({
          event: "flow.node.auto_advanced",
          flowId: params.flowId,
          fromNodeId: currentNodeId,
          toNodeId: node.next,
        });
        currentNodeId = node.next;
        continue;
      }
      return {
        handled: true,
        state: clearChatbotRuntime(currentState),
        replyText: messages.join("\n\n"),
        events,
      };
    }

    const feedbackText = node.text ?? DEFAULT_HANDOFF_FEEDBACK_TEXT;
    const summary = buildHandoffSummary(currentState.answers?.flowContext, node);
    const suggestedReply = buildSuggestedReply(
      currentState.answers?.flowContext,
      currentState.answers?.flowTags
    );
    messages.push(feedbackText);
    return {
      handled: true,
      state: clearChatbotRuntime(currentState),
      replyText: messages.join("\n\n"),
      pendingHandoff: {
        feedbackText,
        summary,
        suggestedReply,
        tags: currentState.answers?.flowTags ?? [],
        nodeId: currentNodeId,
      },
      events,
    };
  }

  return {
    handled: false,
    state: clearChatbotRuntime(currentState),
    events,
  };
}

export function executeChatbotFlow(params: {
  flowId: string;
  definition: ChatbotFlowDefinition;
  state: ConversationState;
  inboundText: string | null | undefined;
  nowIso: string;
  startNodeId?: string;
}): ChatbotExecutionResult {
  if (params.startNodeId && params.definition.nodes[params.startNodeId]) {
    return executeNodeChain({
      definition: params.definition,
      state: params.state,
      flowId: params.flowId,
      nodeId: params.startNodeId,
      nowIso: params.nowIso,
    });
  }

  if (!params.state.chatbotActive || !params.state.chatbotNodeId) {
    return executeNodeChain({
      definition: params.definition,
      state: params.state,
      flowId: params.flowId,
      nodeId: params.definition.start,
      nowIso: params.nowIso,
    });
  }

  const currentNode = params.definition.nodes[params.state.chatbotNodeId];
  if (!currentNode) {
    return {
      handled: false,
      state: clearChatbotRuntime(params.state),
    };
  }

  if (currentNode.type !== "menu") {
    return executeNodeChain({
      definition: params.definition,
      state: params.state,
      flowId: params.flowId,
      nodeId: params.state.chatbotNodeId,
      nowIso: params.nowIso,
    });
  }

  const choice = parseMenuSelection(params.inboundText);
  if (!choice || choice > currentNode.options.length) {
    return {
      handled: true,
      state: withChatbotRuntime(params.state, params.flowId, params.state.chatbotNodeId, true),
      replyText: renderMenu(currentNode),
    };
  }

  const selectedOption = currentNode.options[choice - 1]!;
  const events: ChatbotExecutionEvent[] = [];
  const stateWithOptionContext = mergeFlowMetadata({
    state: params.state,
    metadata: selectedOption,
    flowId: params.flowId,
    nodeId: params.state.chatbotNodeId,
    source: "option",
    events,
  });
  const result = executeNodeChain({
    definition: params.definition,
    state: stateWithOptionContext,
    flowId: params.flowId,
    nodeId: selectedOption.next,
    nowIso: params.nowIso,
  });
  return {
    ...result,
    events: [...events, ...(result.events ?? [])],
  };
}
