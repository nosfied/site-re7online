import crypto from "node:crypto";
import {
  ConversationOperationalStatus,
  HandoffStatus,
  MessageStatus,
  MessageType,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import {
  executeChatbotFlow,
  extractChatbotFlowId,
  validateChatbotFlowDefinition,
} from "../chatbot/chatbotFlow.js";
import { ensureDefaultOperationalDepartmentAndQueue } from "../bootstrap/defaultOperationalDepartment.js";
import type { ConversationState, FlowContext } from "../conversation/conversation.types.js";
import { getFeatures } from "../features/clientFeatures.js";
import { logger } from "../logger/logger.js";
import { publishRealtimeEvent } from "../realtime/hub.js";

const MESSAGE_RATE_LIMIT_WINDOW_MS = 60_000;
const MESSAGE_RATE_LIMIT_MAX = 20;
const MAX_MESSAGE_LENGTH = 4_000;

type JsonInput = Record<string, unknown>;
type RateBucket = { count: number; windowStart: number; lastSeen: number };

const rateBuckets = new Map<string, RateBucket>();

function normalizeText(input: unknown, maxLength: number) {
  if (typeof input !== "string") return "";
  return input.trim().replace(/\r\n/g, "\n").replace(/\r/g, "\n").slice(0, maxLength);
}

function normalizeWebchatDomain(input: unknown) {
  const value = normalizeText(input, 253).toLowerCase();
  if (!value) return "";
  try {
    const parsed = value.startsWith("http://") || value.startsWith("https://")
      ? new URL(value)
      : new URL(`https://${value}`);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return value
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .replace(/:\d+$/, "")
      .replace(/^www\./, "")
      .trim();
  }
}

function hashValue(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function shortHash(input: string, size = 32) {
  return hashValue(input).slice(0, size);
}

function getRateLimit(key: string) {
  const now = Date.now();
  for (const [bucketKey, value] of rateBuckets.entries()) {
    if (now - value.lastSeen > MESSAGE_RATE_LIMIT_WINDOW_MS * 3) {
      rateBuckets.delete(bucketKey);
    }
  }
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.windowStart >= MESSAGE_RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(key, { count: 1, windowStart: now, lastSeen: now });
    return { limited: false as const, retryAfterSec: 0 };
  }
  bucket.count += 1;
  bucket.lastSeen = now;
  if (bucket.count > MESSAGE_RATE_LIMIT_MAX) {
    return {
      limited: true as const,
      retryAfterSec: Math.max(1, Math.ceil((MESSAGE_RATE_LIMIT_WINDOW_MS - (now - bucket.windowStart)) / 1000)),
    };
  }
  return { limited: false as const, retryAfterSec: 0 };
}

function serializeInboundMessage(item: {
  id: string;
  messageId: string;
  waId: string;
  waIdCanonical: string | null;
  bodyText: string | null;
  createdAt: Date;
}) {
  return {
    id: item.id,
    messageId: item.messageId,
    waId: item.waId,
    waIdCanonical: item.waIdCanonical,
    bodyText: item.bodyText,
    createdAt: item.createdAt.toISOString(),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function toIso(value: Date | null | undefined, fallback: Date) {
  return (value ?? fallback).toISOString();
}

function toHandoffState(status: HandoffStatus | null | undefined, state: {
  handoffRequestedAt?: Date | null;
  handoffActivatedAt?: Date | null;
  handoffReleasedAt?: Date | null;
}) {
  if (status === HandoffStatus.PENDING) {
    return {
      status: "pending" as const,
      ...(state.handoffRequestedAt ? { requestedAt: state.handoffRequestedAt.toISOString() } : {}),
    };
  }
  if (status === HandoffStatus.ACTIVE) {
    return {
      status: "active" as const,
      ...(state.handoffRequestedAt ? { requestedAt: state.handoffRequestedAt.toISOString() } : {}),
      ...(state.handoffActivatedAt ? { activatedAt: state.handoffActivatedAt.toISOString() } : {}),
    };
  }
  return {
    status: "none" as const,
    ...(state.handoffReleasedAt ? { releasedAt: state.handoffReleasedAt.toISOString() } : {}),
  };
}

function fromHandoffState(status: ConversationState["handoff"]["status"]) {
  if (status === "pending") return HandoffStatus.PENDING;
  if (status === "active") return HandoffStatus.ACTIVE;
  return HandoffStatus.NONE;
}

function safeFlowContext(input: unknown): FlowContext | undefined {
  const value = asRecord(input);
  return Object.keys(value).length > 0 ? value as FlowContext : undefined;
}

function buildConversationStateFromRuntime(input: {
  clientKey: string;
  waId: string;
  waIdCanonical: string | null;
  conversationKey: string | null;
  firstSeenAt: Date | null;
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
  lastInboundMessageId: string | null;
  lastOutboundMessageId: string | null;
  windowIsOpen: boolean;
  windowExpiresAt: Date | null;
  intent: string | null;
  handoffStatus: HandoffStatus;
  handoffRequestedAt: Date | null;
  handoffActivatedAt: Date | null;
  handoffReleasedAt: Date | null;
  flow: string | null;
  flowStep: number | null;
  chatbotNodeId: string | null;
  chatbotActive: boolean;
  answers: unknown;
  mode: string | null;
  assignedUserId: string | null;
  assignedTo: string | null;
  assignedAt: Date | null;
  departmentId: string | null;
  queueId: string | null;
  status: ConversationOperationalStatus | null;
  closedAt: Date | null;
}, now: Date): ConversationState {
  const answers = asRecord(input.answers);
  return {
    clientKey: input.clientKey,
    conversationKey: input.conversationKey ?? undefined,
    waId: input.waId,
    waIdCanonical: input.waIdCanonical ?? undefined,
    firstSeenAt: toIso(input.firstSeenAt, now),
    lastInboundAt: toIso(input.lastInboundAt, now),
    ...(input.lastOutboundAt ? { lastOutboundAt: input.lastOutboundAt.toISOString() } : {}),
    ...(input.lastInboundMessageId ? { lastInboundMessageId: input.lastInboundMessageId } : {}),
    ...(input.lastOutboundMessageId ? { lastOutboundMessageId: input.lastOutboundMessageId } : {}),
    window: {
      isOpen: input.windowIsOpen,
      ...(input.windowExpiresAt ? { expiresAt: input.windowExpiresAt.toISOString() } : {}),
    },
    intent: input.intent === "pricing" || input.intent === "support" || input.intent === "handoff" ? input.intent : "unknown",
    handoff: toHandoffState(input.handoffStatus, input),
    ...(input.flow ? { flow: input.flow as ConversationState["flow"] } : {}),
    ...(typeof input.flowStep === "number" ? { flowStep: input.flowStep } : {}),
    ...(input.chatbotNodeId ? { chatbotNodeId: input.chatbotNodeId } : {}),
    chatbotActive: input.chatbotActive,
    answers: {
      ...answers,
      ...(safeFlowContext(answers.flowContext) ? { flowContext: safeFlowContext(answers.flowContext) } : {}),
      ...(Array.isArray(answers.flowTags) ? { flowTags: answers.flowTags.filter((tag): tag is string => typeof tag === "string") } : {}),
    },
    mode: input.mode === "BOT" ? "BOT" : "HUMAN",
    assignedUserId: input.assignedUserId,
    assignedTo: input.assignedTo,
    ...(input.assignedAt ? { assignedAt: input.assignedAt.toISOString() } : {}),
    departmentId: input.departmentId,
    queueId: input.queueId,
    status: input.status,
    ...(input.closedAt ? { closedAt: input.closedAt.toISOString() } : {}),
  };
}

function statusFromChatbotState(state: ConversationState, pendingHandoff: boolean) {
  if (pendingHandoff) return ConversationOperationalStatus.WAITING;
  if (state.chatbotActive) return ConversationOperationalStatus.WAITING_USER;
  return state.status ?? ConversationOperationalStatus.WAITING;
}

function pickLeadService(context: FlowContext | undefined) {
  const keys = ["intent", "need", "necessidade", "service", "servico", "profile", "perfil"];
  for (const key of keys) {
    const value = context?.[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 160);
  }
  return undefined;
}

async function runWebchatChatbotFlow(params: {
  prisma: PrismaClient;
  requestId: string;
  clientId: string;
  clientKey: string;
  client: { features: unknown; profile: unknown };
  conversationId: string;
  waId: string;
  text: string;
  channelAccountId: string;
  externalUserHash: string;
  sessionId: string;
  originDomain: string;
  now: Date;
  publishRealtimeEvent?: typeof publishRealtimeEvent;
}) {
  if (!getFeatures(params.client).chatbot) return;

  const runtimeState = await params.prisma.conversationRuntimeState.findFirst({
    where: {
      clientId: params.clientId,
      waId: params.waId,
      channel: "webchat",
      provider: "converta",
      channelAccountId: params.channelAccountId,
    },
    select: {
      waId: true,
      waIdCanonical: true,
      conversationKey: true,
      firstSeenAt: true,
      lastInboundAt: true,
      lastOutboundAt: true,
      lastInboundMessageId: true,
      lastOutboundMessageId: true,
      windowIsOpen: true,
      windowExpiresAt: true,
      intent: true,
      handoffStatus: true,
      handoffRequestedAt: true,
      handoffActivatedAt: true,
      handoffReleasedAt: true,
      flow: true,
      flowStep: true,
      chatbotNodeId: true,
      chatbotActive: true,
      answers: true,
      mode: true,
      assignedUserId: true,
      assignedTo: true,
      assignedAt: true,
      departmentId: true,
      queueId: true,
      status: true,
      closedAt: true,
    },
  });
  if (!runtimeState) return;

  const activeFlowId = extractChatbotFlowId(runtimeState.flow);
  const flow = activeFlowId && runtimeState.chatbotActive
    ? await params.prisma.chatbotFlow.findFirst({
        where: { id: activeFlowId, clientId: params.clientId, isActive: true },
        select: { id: true, definition: true },
      })
    : await params.prisma.chatbotFlow.findFirst({
        where: { clientId: params.clientId, isActive: true, entryPoint: true },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: { id: true, definition: true },
      });
  if (!flow) return;

  const validated = validateChatbotFlowDefinition(flow.definition);
  if (!validated.ok) {
    logger.error({
      event: "webchat.chatbot.definition.invalid",
      clientId: params.clientId,
      clientKey: params.clientKey,
      flowId: flow.id,
      message: validated.message,
      requestId: params.requestId,
    });
    return;
  }

  const state = buildConversationStateFromRuntime({
    ...runtimeState,
    clientKey: params.clientKey,
  }, params.now);
  const result = executeChatbotFlow({
    flowId: flow.id,
    definition: validated.definition,
    state,
    inboundText: params.text,
    nowIso: params.now.toISOString(),
  });
  for (const event of result.events ?? []) {
    logger.info({
      ...event,
      channel: "webchat",
      clientId: params.clientId,
      clientKey: params.clientKey,
      requestId: params.requestId,
    });
  }
  if (!result.handled) return;

  const nextContext = safeFlowContext(result.state.answers?.flowContext);
  const outboundText = result.replyText?.trim();
  const outboundAt = new Date();
  const outboundMessageId = outboundText
    ? `webchat.chatbot.${params.requestId}.${shortHash(`${params.waId}:${outboundAt.toISOString()}`, 16)}`
    : null;
  const pendingHandoff = Boolean(result.pendingHandoff);
  const handoffStatus = pendingHandoff ? HandoffStatus.PENDING : fromHandoffState(result.state.handoff.status);
  const handoffRequestedAt = pendingHandoff
    ? outboundAt
    : result.state.handoff.requestedAt
      ? new Date(result.state.handoff.requestedAt)
      : null;
  const mode = pendingHandoff ? "HUMAN" : result.state.chatbotActive ? "BOT" : result.state.mode ?? "BOT";

  await params.prisma.$transaction(async (tx) => {
    await tx.conversationRuntimeState.updateMany({
      where: {
        clientId: params.clientId,
        waId: params.waId,
        channel: "webchat",
        provider: "converta",
        channelAccountId: params.channelAccountId,
      },
      data: {
        flow: result.state.flow ?? null,
        flowStep: result.state.flowStep ?? null,
        chatbotNodeId: result.state.chatbotNodeId ?? null,
        chatbotActive: result.state.chatbotActive === true,
        answers: (result.state.answers ?? {}) as Prisma.InputJsonValue,
        mode,
        handoffStatus,
        handoffRequestedAt,
        status: statusFromChatbotState(result.state, pendingHandoff),
        ...(outboundMessageId ? { lastOutboundAt: outboundAt, lastOutboundMessageId: outboundMessageId } : {}),
      },
    });
    await tx.lead.updateMany({
      where: { tenantId: params.clientId, waId: params.waId },
      data: {
        ...(pickLeadService(nextContext) ? { service: pickLeadService(nextContext) } : {}),
        status: pendingHandoff ? "QUALIFIED" : "NEW",
      },
    });
    if (outboundText && outboundMessageId) {
      await tx.outboundMessage.upsert({
        where: {
          clientId_messageId: {
            clientId: params.clientId,
            messageId: outboundMessageId,
          },
        },
        create: {
          clientId: params.clientId,
          phoneNumberId: null,
          waId: params.waId,
          waIdCanonical: params.waId,
          messageId: outboundMessageId,
          channel: "webchat",
          provider: "converta",
          channelAccountId: params.channelAccountId,
          externalUserHash: params.externalUserHash,
          externalUserRef: null,
          externalMessageId: outboundMessageId,
          legacyWaId: null,
          type: MessageType.TEXT,
          status: MessageStatus.SENT,
          bodyText: outboundText,
          requestId: params.requestId,
          metaMessageId: null,
          errorBody: null,
          rawPayload: {
            source: "webchat_chatbot",
            flowId: flow.id,
            siteId: params.channelAccountId,
            sessionId: params.sessionId,
            originDomain: params.originDomain,
            delivery: "pending_public_polling",
            messageLength: outboundText.length,
          } satisfies Prisma.InputJsonValue,
        },
        update: {
          status: MessageStatus.SENT,
          bodyText: outboundText,
          externalMessageId: outboundMessageId,
          metaMessageId: null,
          errorBody: null,
        },
        select: { id: true },
      });
      await tx.conversation.updateMany({
        where: {
          clientId: params.clientId,
          waId: params.waId,
          channel: "webchat",
          channelAccountId: params.channelAccountId,
        },
        data: { lastOutboundAt: outboundAt },
      });
    }
    if (result.pendingHandoff?.summary) {
      const lead = await tx.lead.findUnique({
        where: { tenantId_waId: { tenantId: params.clientId, waId: params.waId } },
        select: { id: true },
      });
      if (lead) {
        await tx.leadNote.create({
          data: {
            tenantId: params.clientId,
            leadId: lead.id,
            body: result.pendingHandoff.summary,
          },
        });
      }
    }
    await tx.event.create({
      data: {
        clientId: params.clientId,
        conversationId: params.conversationId,
        waId: params.waId,
        waIdCanonical: params.waId,
        messageId: outboundMessageId ?? undefined,
        requestId: params.requestId,
        eventName: pendingHandoff ? "webchat.chatbot.handoff_triggered" : "webchat.chatbot.handled",
        payloadJson: {
          flowId: flow.id,
          nodeId: result.state.chatbotNodeId ?? null,
          chatbotActive: result.state.chatbotActive === true,
          pendingHandoff,
          tags: result.pendingHandoff?.tags ?? result.state.answers?.flowTags ?? [],
          hasReply: Boolean(outboundText),
        } satisfies Prisma.InputJsonValue,
      },
    });
  });

  if (pendingHandoff) {
    const publish = params.publishRealtimeEvent ?? publishRealtimeEvent;
    publish({
      type: "conversation.handoff.updated",
      clientId: params.clientId,
      waId: params.waId,
      waIdCanonical: params.waId,
      mode: "HUMAN",
      handoffStatus: "pending",
      assignedUserId: null,
      departmentId: result.state.departmentId ?? null,
      updatedAt: outboundAt.toISOString(),
    });
  }
}

export type WebchatInboundResult =
  | {
      ok: true;
      conversation: { id: string; waId: string; status: string };
      message: ReturnType<typeof serializeInboundMessage>;
      contact: { id: string };
    }
  | {
      ok: false;
      error:
        | "webchat_token_required"
        | "webchat_origin_required"
        | "webchat_session_not_found"
        | "webchat_session_inactive"
        | "webchat_session_expired"
        | "webchat_site_inactive"
        | "client_inactive"
        | "feature_not_enabled"
        | "webchat_origin_not_allowed"
        | "webchat_rate_limited"
        | "webchat_message_required"
        | "webchat_message_too_long";
      retryAfterSec?: number;
    };

export async function createWebchatInboundMessage(params: {
  prisma: PrismaClient;
  requestId: string;
  input: JsonInput;
  origin: string | null;
  ip: string;
  publishRealtimeEvent?: typeof publishRealtimeEvent;
}): Promise<WebchatInboundResult> {
  const token = normalizeText(params.input.sessionToken, 200);
  if (!token) return { ok: false, error: "webchat_token_required" };
  const originDomain = normalizeWebchatDomain(params.origin);
  if (!originDomain) return { ok: false, error: "webchat_origin_required" };

  const textRaw = typeof params.input.text === "string" ? params.input.text : "";
  const text = normalizeText(textRaw, MAX_MESSAGE_LENGTH);
  if (!text) return { ok: false, error: "webchat_message_required" };
  if (textRaw.length > MAX_MESSAGE_LENGTH) return { ok: false, error: "webchat_message_too_long" };

  const tokenHash = hashValue(token);
  const session = await params.prisma.webchatSession.findUnique({
    where: { tokenHash },
    include: {
      visitor: { select: { id: true, visitorIdHash: true, name: true, email: true, phone: true } },
      site: {
        include: {
          client: { select: { id: true, clientKey: true, name: true, status: true, features: true, profile: true } },
          allowedDomains: { where: { active: true }, select: { domain: true } },
        },
      },
    },
  });
  if (!session) return { ok: false, error: "webchat_session_not_found" };

  const rate = getRateLimit(`message:${session.siteId}:${session.id}:${hashValue(params.ip || "unknown")}`);
  if (rate.limited) return { ok: false, error: "webchat_rate_limited", retryAfterSec: rate.retryAfterSec };
  if (session.status !== "active") return { ok: false, error: "webchat_session_inactive" };
  if (session.expiresAt.getTime() <= Date.now()) {
    await params.prisma.webchatSession.update({ where: { id: session.id }, data: { status: "expired" } });
    return { ok: false, error: "webchat_session_expired" };
  }
  if (session.site.status !== "active") return { ok: false, error: "webchat_site_inactive" };
  if (session.site.client.status !== "ACTIVE") return { ok: false, error: "client_inactive" };
  if (!getFeatures(session.site.client).webchat) return { ok: false, error: "feature_not_enabled" };
  const allowed = session.site.allowedDomains.some((item) => normalizeWebchatDomain(item.domain) === originDomain);
  if (!allowed || session.originDomain !== originDomain) {
    return { ok: false, error: "webchat_origin_not_allowed" };
  }

  const now = new Date();
  const externalUserHash = session.visitor.visitorIdHash;
  const channelFields = {
    channel: "webchat",
    provider: "converta",
    channelAccountId: session.siteId,
    externalUserHash,
    externalUserRef: null,
    legacyWaId: null,
  };
  const syntheticWaId = `webchat:${shortHash(`${session.siteId}:${externalUserHash}`)}`;
  const messageId = `webchat:${session.siteId}:${shortHash(`${session.id}:${params.requestId}:${now.toISOString()}`, 24)}`;
  const displayName = session.visitor.name ?? session.visitor.email ?? "Visitante Webchat";
  const defaults = await ensureDefaultOperationalDepartmentAndQueue(params.prisma, session.clientId);

  const [conversation, runtimeState, inbound, contact] = await params.prisma.$transaction(async (tx) => {
    const contactRecord = await tx.contact.upsert({
      where: { clientId_waId: { clientId: session.clientId, waId: syntheticWaId } },
      create: {
        clientId: session.clientId,
        waId: syntheticWaId,
        name: displayName,
        ...channelFields,
      },
      update: {
        name: displayName,
        ...channelFields,
      },
      select: { id: true },
    });
    const identity = await tx.contactChannelIdentity.upsert({
      where: {
        clientId_channel_provider_channelAccountId_externalUserHash: {
          clientId: session.clientId,
          channel: "webchat",
          provider: "converta",
          channelAccountId: session.siteId,
          externalUserHash,
        },
      },
      create: {
        clientId: session.clientId,
        contactId: contactRecord.id,
        channel: "webchat",
        provider: "converta",
        channelAccountId: session.siteId,
        externalUserHash,
        displayName,
        firstSeenAt: now,
        lastSeenAt: now,
      },
      update: {
        contactId: contactRecord.id,
        displayName,
        lastSeenAt: now,
      },
      select: { id: true },
    });
    const conversationRecord = await tx.conversation.upsert({
      where: { clientId_waId: { clientId: session.clientId, waId: syntheticWaId } },
      create: {
        clientId: session.clientId,
        waId: syntheticWaId,
        waIdCanonical: syntheticWaId,
        phoneNumberId: null,
        ...channelFields,
        departmentId: defaults.department.id,
        windowIsOpen: true,
        lastInboundAt: now,
      },
      update: {
        waIdCanonical: syntheticWaId,
        ...channelFields,
        departmentId: defaults.department.id,
        lastInboundAt: now,
        deletedAt: null,
        anonymizedAt: null,
      },
      select: { id: true, waId: true },
    });
    const runtimeRecord = await tx.conversationRuntimeState.upsert({
      where: { clientId_waId: { clientId: session.clientId, waId: syntheticWaId } },
      create: {
        clientId: session.clientId,
        waId: syntheticWaId,
        waIdCanonical: syntheticWaId,
        conversationKey: `${session.site.client.clientKey}:webchat:${session.siteId}:${externalUserHash}`,
        ...channelFields,
        firstSeenAt: now,
        windowIsOpen: true,
        lastInboundAt: now,
        lastInboundMessageId: messageId,
        handoffStatus: HandoffStatus.NONE,
        mode: "HUMAN",
        status: ConversationOperationalStatus.WAITING,
        departmentId: defaults.department.id,
        queueId: defaults.queue.id,
      },
      update: {
        waIdCanonical: syntheticWaId,
        ...channelFields,
        lastInboundAt: now,
        lastInboundMessageId: messageId,
        mode: "HUMAN",
        status: ConversationOperationalStatus.WAITING,
        departmentId: defaults.department.id,
        queueId: defaults.queue.id,
        closedAt: null,
      },
      select: { id: true, status: true },
    });
    const inboundRecord = await tx.inboundMessage.create({
      data: {
        clientId: session.clientId,
        phoneNumberId: null,
        waId: syntheticWaId,
        waIdCanonical: syntheticWaId,
        messageId,
        ...channelFields,
        externalMessageId: messageId,
        type: MessageType.TEXT,
        bodyText: text,
        allowlistHit: false,
        requestId: params.requestId,
        createdAt: now,
        rawPayload: {
          source: "webchat",
          siteId: session.siteId,
          sessionId: session.id,
          originDomain,
          messageLength: text.length,
        } satisfies Prisma.InputJsonValue,
      },
      select: { id: true, messageId: true, waId: true, waIdCanonical: true, bodyText: true, createdAt: true },
    });
    await tx.lead.upsert({
      where: { tenantId_waId: { tenantId: session.clientId, waId: syntheticWaId } },
      create: {
        tenantId: session.clientId,
        waId: syntheticWaId,
        waIdCanonical: syntheticWaId,
        name: displayName,
        phone: session.visitor.phone,
        email: session.visitor.email,
        status: "NEW",
        contactChannelIdentityId: identity.id,
        ...channelFields,
      },
      update: {
        waIdCanonical: syntheticWaId,
        name: displayName,
        phone: session.visitor.phone,
        email: session.visitor.email,
        contactChannelIdentityId: identity.id,
        ...channelFields,
      },
      select: { id: true },
    });
    await tx.webchatSession.update({
      where: { id: session.id },
      data: { lastSeenAt: now },
    });
    await tx.webchatVisitor.update({
      where: { id: session.visitorId },
      data: { lastSeenAt: now },
    });
    await tx.event.create({
      data: {
        clientId: session.clientId,
        conversationId: conversationRecord.id,
        waId: syntheticWaId,
        waIdCanonical: syntheticWaId,
        messageId,
        requestId: params.requestId,
        eventName: "webchat.message.received",
        payloadJson: {
          siteId: session.siteId,
          sessionId: session.id,
          visitorId: session.visitor.id,
          originDomain,
          messageLength: text.length,
        } satisfies Prisma.InputJsonValue,
      },
    });
    return [conversationRecord, runtimeRecord, inboundRecord, contactRecord] as const;
  });

  const publish = params.publishRealtimeEvent ?? publishRealtimeEvent;
  publish({
    type: "message.created",
    clientId: session.clientId,
    waId: syntheticWaId,
    waIdCanonical: syntheticWaId,
    mode: "HUMAN",
    handoffStatus: "none",
    assignedUserId: null,
    departmentId: defaults.department.id,
    message: {
      direction: "INBOUND",
      type: MessageType.TEXT,
      status: "RECEIVED",
      intent: null,
      bodyText: text,
      media: undefined,
      templateName: null,
      templateLang: null,
      requestId: params.requestId,
      messageId,
      metaMessageId: null,
      errorBody: null,
      createdAt: now.toISOString(),
    },
  });

  try {
    await runWebchatChatbotFlow({
      prisma: params.prisma,
      requestId: params.requestId,
      clientId: session.clientId,
      clientKey: session.site.client.clientKey,
      client: session.site.client,
      conversationId: conversation.id,
      waId: conversation.waId,
      text,
      channelAccountId: session.siteId,
      externalUserHash,
      sessionId: session.id,
      originDomain,
      now,
      publishRealtimeEvent: params.publishRealtimeEvent,
    });
  } catch (error) {
    logger.error({
      event: "webchat.chatbot.failed",
      clientId: session.clientId,
      clientKey: session.site.client.clientKey,
      siteId: session.siteId,
      requestId: params.requestId,
      message: (error as Error).message,
    });
  }

  return {
    ok: true,
    conversation: {
      id: conversation.id,
      waId: conversation.waId,
      status: runtimeState.status ?? ConversationOperationalStatus.WAITING,
    },
    message: serializeInboundMessage(inbound),
    contact,
  };
}
