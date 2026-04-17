import { ConversationState } from "../conversation/conversation.types.js";
import { requestHumanHandoff } from "../conversation/conversation.service.js";

export type ChatbotMenuNode = {
  type: "menu";
  text: string;
  options: Array<{
    label: string;
    next: string;
  }>;
};

export type ChatbotTextNode = {
  type: "text";
  text: string;
  next?: string;
};

export type ChatbotHandoffNode = {
  type: "handoff";
  text?: string;
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
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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
      normalizedOptions.push({ label, next });
    }
    return {
      ok: true,
      node: {
        type: "menu",
        text,
        options: normalizedOptions,
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
        type: "text",
        text,
        ...(next ? { next } : {}),
      },
    };
  }

  const text = getNonEmptyString(rawNode.text);
  return {
    ok: true,
    node: {
      type: "handoff",
      ...(text ? { text } : {}),
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

function executeNodeChain(params: {
  definition: ChatbotFlowDefinition;
  state: ConversationState;
  flowId: string;
  nodeId: string;
  nowIso: string;
}): ChatbotExecutionResult {
  const messages: string[] = [];
  let currentState = params.state;
  let currentNodeId: string | null = params.nodeId;
  const visited = new Set<string>();

  while (currentNodeId) {
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

    if (node.type === "menu") {
      currentState = withChatbotRuntime(currentState, params.flowId, currentNodeId, true);
      messages.push(renderMenu(node));
      return {
        handled: true,
        state: currentState,
        replyText: messages.join("\n\n"),
      };
    }

    if (node.type === "text") {
      messages.push(node.text);
      if (node.next) {
        currentNodeId = node.next;
        continue;
      }
      return {
        handled: true,
        state: clearChatbotRuntime(currentState),
        replyText: messages.join("\n\n"),
      };
    }

    const handoff = requestHumanHandoff(clearChatbotRuntime(currentState), params.nowIso, node.text);
    messages.push(handoff.replyText);
    return {
      handled: true,
      state: handoff.state,
      replyText: messages.join("\n\n"),
    };
  }

  return {
    handled: false,
    state: clearChatbotRuntime(currentState),
  };
}

export function executeChatbotFlow(params: {
  flowId: string;
  definition: ChatbotFlowDefinition;
  state: ConversationState;
  inboundText: string | null | undefined;
  nowIso: string;
}): ChatbotExecutionResult {
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

  return executeNodeChain({
    definition: params.definition,
    state: params.state,
    flowId: params.flowId,
    nodeId: currentNode.options[choice - 1]!.next,
    nowIso: params.nowIso,
  });
}
