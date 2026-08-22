import type { PrismaClient } from "@prisma/client";
import {
  ChatbotExecutionResult,
  ChatbotFlowDefinition,
  ChatbotConsentNode,
  type ChatbotExecutionOptions,
  clearChatbotRuntime,
  executeChatbotFlow,
  getChatbotConsentKey,
  renderChatbotTemplateText,
} from "./chatbotFlow.js";
import type { ConversationState } from "../conversation/conversation.types.js";
import {
  getContactConsentState,
  recordContactConsent,
} from "../consent/contactConsent.js";

type PrismaForChatbotConsent = Pick<PrismaClient, "contact" | "lead" | "conversation" | "contactConsent" | "event">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeAnswer(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function getConsentNodes(definition: ChatbotFlowDefinition) {
  return Object.values(definition.nodes).filter((node): node is ChatbotConsentNode => node.type === "consent");
}

function hasAcceptedConsent(state: ConversationState, node: ChatbotConsentNode) {
  const runtime = isRecord(state.answers?.chatbotRuntime) ? state.answers?.chatbotRuntime : {};
  const acceptedConsents = isRecord(runtime.acceptedConsents) ? runtime.acceptedConsents : {};
  return acceptedConsents[getChatbotConsentKey(node)] === true;
}

function withAcceptedConsent(state: ConversationState, node: ChatbotConsentNode): ConversationState {
  const runtime = isRecord(state.answers?.chatbotRuntime) ? state.answers?.chatbotRuntime : {};
  const acceptedConsents = isRecord(runtime.acceptedConsents) ? runtime.acceptedConsents : {};
  return {
    ...state,
    answers: {
      ...(state.answers ?? {}),
      chatbotRuntime: {
        ...runtime,
        acceptedConsents: {
          ...acceptedConsents,
          [getChatbotConsentKey(node)]: true,
        },
      },
    },
  };
}

async function hydrateAcceptedConsents(params: {
  prisma: PrismaForChatbotConsent;
  clientId: string;
  waId: string;
  state: ConversationState;
  definition: ChatbotFlowDefinition;
}) {
  let state = params.state;
  for (const node of getConsentNodes(params.definition)) {
    const consent = await getContactConsentState({
      prisma: params.prisma,
      clientId: params.clientId,
      waId: params.waId,
      purpose: node.purpose,
      textVersion: node.textVersion,
      textBody: renderChatbotTemplateText(node.message, state),
    });
    if (consent.ok && consent.status === "accepted") {
      state = withAcceptedConsent(state, node);
    }
  }
  return state;
}

export async function resolveChatbotConsentPrecedence(params: {
  prisma: PrismaForChatbotConsent;
  clientId: string;
  waId: string;
  state: ConversationState;
  definition: ChatbotFlowDefinition;
}) {
  const consentNodes = getConsentNodes(params.definition);
  if (consentNodes.length === 0) return { accepted: true as const, pendingNodeIds: [] as string[] };
  const hydratedState = await hydrateAcceptedConsents(params);
  const pendingNodeIds = Object.entries(params.definition.nodes)
    .filter(([, node]) => node.type === "consent" && !hasAcceptedConsent(hydratedState, node))
    .map(([nodeId]) => nodeId);
  return {
    accepted: pendingNodeIds.length === 0,
    pendingNodeIds,
  };
}

function getCurrentConsentNode(params: {
  definition: ChatbotFlowDefinition;
  state: ConversationState;
  startNodeId?: string;
}) {
  const nodeId = params.startNodeId ?? params.state.chatbotNodeId ?? null;
  if (!nodeId) return null;
  const node = params.definition.nodes[nodeId];
  return node?.type === "consent" ? { nodeId, node } : null;
}

export async function executeChatbotFlowWithConsent(params: {
  prisma: PrismaForChatbotConsent;
  clientId: string;
  waId: string;
  sourceChannel: string;
  sourceProvider: string;
  source: string;
  requestId: string;
  flowId: string;
  definition: ChatbotFlowDefinition;
  state: ConversationState;
  inboundText: string | null | undefined;
  nowIso: string;
  startNodeId?: string;
  options?: ChatbotExecutionOptions;
}): Promise<ChatbotExecutionResult> {
  const hydratedState = await hydrateAcceptedConsents({
    prisma: params.prisma,
    clientId: params.clientId,
    waId: params.waId,
    state: params.state,
    definition: params.definition,
  });
  const currentConsent = getCurrentConsentNode({
    definition: params.definition,
    state: hydratedState,
    startNodeId: params.startNodeId,
  });
  if (currentConsent) {
    const answer = normalizeAnswer(params.inboundText);
    const accepted = answer === normalizeAnswer(currentConsent.node.acceptOption);
    const declineOption = currentConsent.node.declineOption
      ? normalizeAnswer(currentConsent.node.declineOption)
      : null;
    if (accepted) {
      const recorded = await recordContactConsent({
        prisma: params.prisma,
        clientId: params.clientId,
        waId: params.waId,
        purpose: currentConsent.node.purpose,
        textVersion: currentConsent.node.textVersion,
        textBody: renderChatbotTemplateText(currentConsent.node.message, hydratedState),
        sourceChannel: params.sourceChannel,
        sourceProvider: params.sourceProvider,
        source: params.source,
        requestId: params.requestId,
      });
      if (recorded.ok) {
        const result = executeChatbotFlow({
          flowId: params.flowId,
          definition: params.definition,
          state: withAcceptedConsent(hydratedState, currentConsent.node),
          inboundText: params.inboundText,
          nowIso: params.nowIso,
          startNodeId: currentConsent.node.onAccepted,
          options: params.options,
        });
        return {
          ...result,
          managementInteraction: {
            ...(result.managementInteraction ?? {}),
            inboundKind: "consent_positive",
          },
        };
      }
    }
    if (
      currentConsent.node.onDeclined &&
      answer &&
      answer !== normalizeAnswer(currentConsent.node.acceptOption) &&
      (!declineOption || answer === declineOption)
    ) {
      const result = executeChatbotFlow({
        flowId: params.flowId,
        definition: params.definition,
        state: clearChatbotRuntime(hydratedState),
        inboundText: params.inboundText,
        nowIso: params.nowIso,
        startNodeId: currentConsent.node.onDeclined,
        options: params.options,
      });
      return {
        ...result,
        managementInteraction: {
          ...(result.managementInteraction ?? {}),
          inboundKind: "consent_negative",
        },
      };
    }
    if (answer && declineOption && answer !== declineOption) {
      const replyText = currentConsent.node.invalidText
        ? `${renderChatbotTemplateText(currentConsent.node.invalidText, hydratedState)}\n\n${renderChatbotTemplateText(currentConsent.node.message, hydratedState)}`
        : renderChatbotTemplateText(currentConsent.node.message, hydratedState);
      return {
        handled: true,
        state: hydratedState,
        replyText,
        managementInteraction: {
          inboundKind: "consent_invalid",
          outboundKind: "consent_prompt",
        },
      };
    }
  }

  return executeChatbotFlow({
    flowId: params.flowId,
    definition: params.definition,
    state: hydratedState,
    inboundText: params.inboundText,
    nowIso: params.nowIso,
    startNodeId: params.startNodeId,
    options: params.options,
  });
}
