import crypto from "node:crypto";
import {
  ConversationOperationalStatus,
  HandoffStatus,
  MessageStatus,
  MessageType,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import { buildConversationProtocol } from "../inbox/conversationProtocol.js";
import { publishRealtimeEvent } from "../realtime/hub.js";
import { ensureDefaultOperationalDepartmentAndQueue } from "../bootstrap/defaultOperationalDepartment.js";
import { getFeatures } from "../features/clientFeatures.js";
import { runWebchatChatbotFlow } from "../webchat/webchatInboundService.js";

const SUPPORT_CHANNEL = "support";
const SUPPORT_PROVIDER = "converta";
const SUPPORT_CHANNEL_ACCOUNT_ID = "platform-support";
const MAX_MESSAGE_LENGTH = 4_000;

type SupportRole = "ADMIN" | "SUPERVISOR" | "AGENT" | string;

type SupportRequester = {
  clientId: string;
  clientKey: string;
  tenantName: string;
  userId: string;
  userName: string;
  role: SupportRole;
};

export type SupportGatewayResult<T> =
  | ({ ok: true } & T)
  | { ok: false; status: 400 | 403 | 404 | 409 | 429 | 503; error: string; message: string };

function normalizeText(input: unknown, maxLength = MAX_MESSAGE_LENGTH) {
  if (typeof input !== "string") return "";
  return input.trim().replace(/\r\n/g, "\n").replace(/\r/g, "\n").slice(0, maxLength);
}

function hashValue(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function shortHash(input: string, size = 32) {
  return hashValue(input).slice(0, size);
}

function buildSourceHash(requester: Pick<SupportRequester, "clientId" | "userId">) {
  return shortHash(`${requester.clientId}:${requester.userId}`, 48);
}

function buildRequesterLabel(requester: SupportRequester) {
  const tenant = normalizeText(requester.tenantName || requester.clientKey, 80);
  const user = normalizeText(requester.userName, 80);
  return [tenant, user].filter(Boolean).join(" - ") || "Solicitante";
}

function buildSupportWaId(sourceHash: string, seed: string) {
  return `support:${sourceHash}:${shortHash(seed, 16)}`;
}

function buildSupportConversationHash(sourceHash: string, waId: string) {
  return shortHash(`${sourceHash}:${waId}`, 48);
}

function buildSupportRef(conversationKey: string) {
  return conversationKey.replace(/^support:/, "");
}

function buildConversationKeyFromRef(supportRef: string) {
  const normalized = normalizeText(supportRef, 96).replace(/[^a-zA-Z0-9_-]/g, "");
  return normalized ? `support:${normalized}` : "";
}

function buildConversationKey(conversationId: string, sourceHash: string) {
  return `support:${shortHash(`${conversationId}:${sourceHash}`, 32)}`;
}

function isAllowedRequesterRole(role: SupportRole) {
  const normalized = String(role ?? "").trim().toUpperCase();
  return normalized === "ADMIN" || normalized === "SUPERVISOR";
}

async function resolveSupportTenant(
  prisma: PrismaClient,
  supportTenantKey: string
) {
  const key = normalizeText(supportTenantKey, 120);
  if (!key) {
    return {
      ok: false as const,
      status: 503 as const,
      error: "support_unavailable",
      message: "O suporte pela plataforma ainda nao esta disponivel.",
    };
  }
  const client = await prisma.client.findUnique({
    where: { clientKey: key },
    select: { id: true, clientKey: true, name: true, status: true, features: true, profile: true },
  });
  if (!client || client.status !== "ACTIVE") {
    return {
      ok: false as const,
      status: 503 as const,
      error: "support_unavailable",
      message: "O suporte pela plataforma ainda nao esta disponivel.",
    };
  }
  return { ok: true as const, client };
}

async function getActiveSupportConversation(
  prisma: PrismaClient,
  params: {
    supportClientId: string;
    sourceHash: string;
  }
) {
  return prisma.conversation.findFirst({
    where: {
      clientId: params.supportClientId,
      channel: SUPPORT_CHANNEL,
      provider: SUPPORT_PROVIDER,
      channelAccountId: SUPPORT_CHANNEL_ACCOUNT_ID,
      externalUserRef: params.sourceHash,
      deletedAt: null,
      anonymizedAt: null,
      closedAt: null,
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      waId: true,
      waIdCanonical: true,
      createdAt: true,
      updatedAt: true,
      lastInboundAt: true,
      lastOutboundAt: true,
      closedAt: true,
    },
  });
}

async function serializeSupportConversation(
  prisma: PrismaClient,
  params: {
    supportClientId: string;
    sourceHash: string;
    conversation: {
      id: string;
      waId: string;
      waIdCanonical: string | null;
      createdAt: Date;
      updatedAt: Date;
      lastInboundAt: Date | null;
      lastOutboundAt: Date | null;
      closedAt: Date | null;
    };
  }
) {
  const runtime = await prisma.conversationRuntimeState.findFirst({
    where: {
      clientId: params.supportClientId,
      waId: params.conversation.waId,
      channel: SUPPORT_CHANNEL,
      provider: SUPPORT_PROVIDER,
      externalUserRef: params.sourceHash,
    },
    select: {
      conversationKey: true,
      mode: true,
      handoffStatus: true,
      status: true,
      closedAt: true,
    },
  });
  const conversationKey = runtime?.conversationKey ?? buildConversationKey(params.conversation.id, params.sourceHash);
  return {
    supportRef: buildSupportRef(conversationKey),
    protocol: buildConversationProtocol(params.conversation),
    status:
      params.conversation.closedAt || runtime?.closedAt || runtime?.status === ConversationOperationalStatus.CLOSED
        ? "closed"
        : "active",
    mode: runtime?.mode ?? null,
    handoffStatus:
      runtime?.handoffStatus === HandoffStatus.PENDING
        ? "pending"
        : runtime?.handoffStatus === HandoffStatus.ACTIVE
          ? "active"
          : "none",
    createdAt: params.conversation.createdAt.toISOString(),
    updatedAt: params.conversation.updatedAt.toISOString(),
    lastInboundAt: params.conversation.lastInboundAt?.toISOString() ?? null,
    lastOutboundAt: params.conversation.lastOutboundAt?.toISOString() ?? null,
  };
}

async function resolveSupportConversationByRef(
  prisma: PrismaClient,
  params: {
    supportClientId: string;
    sourceHash: string;
    supportRef: string;
  }
) {
  const conversationKey = buildConversationKeyFromRef(params.supportRef);
  if (!conversationKey) return null;
  const runtime = await prisma.conversationRuntimeState.findFirst({
    where: {
      clientId: params.supportClientId,
      conversationKey,
      channel: SUPPORT_CHANNEL,
      provider: SUPPORT_PROVIDER,
      channelAccountId: SUPPORT_CHANNEL_ACCOUNT_ID,
      externalUserRef: params.sourceHash,
    },
    select: { waId: true },
  });
  if (!runtime) return null;
  return prisma.conversation.findFirst({
    where: {
      clientId: params.supportClientId,
      waId: runtime.waId,
      channel: SUPPORT_CHANNEL,
      provider: SUPPORT_PROVIDER,
      channelAccountId: SUPPORT_CHANNEL_ACCOUNT_ID,
      externalUserRef: params.sourceHash,
      deletedAt: null,
      anonymizedAt: null,
    },
    select: {
      id: true,
      waId: true,
      waIdCanonical: true,
      createdAt: true,
      updatedAt: true,
      lastInboundAt: true,
      lastOutboundAt: true,
      closedAt: true,
    },
  });
}

async function persistSupportInboundMessage(
  prisma: PrismaClient,
  params: {
    requestId: string;
    supportClient: { id: string; clientKey: string; features: unknown; profile: unknown };
    requester: SupportRequester;
    conversation: { id: string; waId: string };
    text: string;
  }
) {
  const now = new Date();
  const sourceHash = buildSourceHash(params.requester);
  const messageId = `support.inbound.${params.requestId}.${shortHash(`${params.conversation.waId}:${now.toISOString()}`, 12)}`;
  await prisma.$transaction(async (tx) => {
    await tx.inboundMessage.create({
      data: {
        clientId: params.supportClient.id,
        phoneNumberId: null,
        waId: params.conversation.waId,
        waIdCanonical: params.conversation.waId,
        messageId,
        channel: SUPPORT_CHANNEL,
        provider: SUPPORT_PROVIDER,
        channelAccountId: SUPPORT_CHANNEL_ACCOUNT_ID,
        externalUserHash: sourceHash,
        externalUserRef: sourceHash,
        externalMessageId: messageId,
        legacyWaId: null,
        type: MessageType.TEXT,
        bodyText: params.text,
        allowlistHit: false,
        requestId: params.requestId,
        createdAt: now,
        rawPayload: {
          source: "support_hub",
          requesterRole: params.requester.role,
          sourceTenantHash: shortHash(params.requester.clientId, 16),
          requesterHash: shortHash(params.requester.userId, 16),
          messageLength: params.text.length,
        } satisfies Prisma.InputJsonValue,
      },
    });
    await tx.conversation.update({
      where: { id: params.conversation.id },
      data: { lastInboundAt: now, updatedAt: now },
    });
    await tx.conversationRuntimeState.updateMany({
      where: {
        clientId: params.supportClient.id,
        waId: params.conversation.waId,
        channel: SUPPORT_CHANNEL,
        provider: SUPPORT_PROVIDER,
      },
      data: {
        lastInboundAt: now,
        lastInboundMessageId: messageId,
        closedAt: null,
      },
    });
    await tx.event.create({
      data: {
        clientId: params.supportClient.id,
        conversationId: params.conversation.id,
        waId: params.conversation.waId,
        waIdCanonical: params.conversation.waId,
        messageId,
        requestId: params.requestId,
        eventName: "support.message.received",
        payloadJson: {
          source: "support_hub",
          requesterRole: params.requester.role,
          sourceTenantHash: shortHash(params.requester.clientId, 16),
          requesterHash: shortHash(params.requester.userId, 16),
          messageLength: params.text.length,
        } satisfies Prisma.InputJsonValue,
      },
    });
  });
  publishRealtimeEvent({
    type: "message.created",
    clientId: params.supportClient.id,
    waId: params.conversation.waId,
    waIdCanonical: params.conversation.waId,
    mode: "BOT",
    handoffStatus: "none",
    assignedUserId: null,
    departmentId: null,
    message: {
      direction: "INBOUND",
      type: MessageType.TEXT,
      status: "RECEIVED",
      intent: null,
      bodyText: params.text,
      templateName: null,
      templateLang: null,
      requestId: params.requestId,
      messageId,
      metaMessageId: null,
      errorBody: null,
      createdAt: now.toISOString(),
    },
  });
  await runWebchatChatbotFlow({
    prisma,
    requestId: params.requestId,
    clientId: params.supportClient.id,
    clientKey: params.supportClient.clientKey,
    client: params.supportClient,
    conversationId: params.conversation.id,
    waId: params.conversation.waId,
    text: params.text,
    channel: SUPPORT_CHANNEL,
    channelAccountId: SUPPORT_CHANNEL_ACCOUNT_ID,
    externalUserHash: sourceHash,
    sessionId: "support_hub",
    originDomain: "app",
    now,
  });
}

export async function listSupportConversations(params: {
  prisma: PrismaClient;
  supportTenantKey: string;
  requester: SupportRequester;
}): Promise<SupportGatewayResult<{ conversations: Array<Awaited<ReturnType<typeof serializeSupportConversation>>> }>> {
  if (!isAllowedRequesterRole(params.requester.role)) {
    return { ok: false, status: 403, error: "forbidden", message: "Apenas administradores e supervisores podem abrir suporte." };
  }
  const supportTenant = await resolveSupportTenant(params.prisma, params.supportTenantKey);
  if (!supportTenant.ok) return supportTenant;
  const sourceHash = buildSourceHash(params.requester);
  const rows = await params.prisma.conversation.findMany({
    where: {
      clientId: supportTenant.client.id,
      channel: SUPPORT_CHANNEL,
      provider: SUPPORT_PROVIDER,
      channelAccountId: SUPPORT_CHANNEL_ACCOUNT_ID,
      externalUserRef: sourceHash,
      deletedAt: null,
      anonymizedAt: null,
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: 20,
    select: {
      id: true,
      waId: true,
      waIdCanonical: true,
      createdAt: true,
      updatedAt: true,
      lastInboundAt: true,
      lastOutboundAt: true,
      closedAt: true,
    },
  });
  return {
    ok: true,
    conversations: await Promise.all(rows.map((conversation) => serializeSupportConversation(params.prisma, {
      supportClientId: supportTenant.client.id,
      sourceHash,
      conversation,
    }))),
  };
}

export async function openSupportConversation(params: {
  prisma: PrismaClient;
  supportTenantKey: string;
  requestId: string;
  requester: SupportRequester;
  text: unknown;
}): Promise<SupportGatewayResult<{ conversation: Awaited<ReturnType<typeof serializeSupportConversation>>; resumed: boolean }>> {
  if (!isAllowedRequesterRole(params.requester.role)) {
    return { ok: false, status: 403, error: "forbidden", message: "Apenas administradores e supervisores podem abrir suporte." };
  }
  const textRaw = typeof params.text === "string" ? params.text : "";
  const text = normalizeText(textRaw);
  if (textRaw.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, status: 400, error: "support_message_too_long", message: "Mensagem muito longa." };
  }
  const supportTenant = await resolveSupportTenant(params.prisma, params.supportTenantKey);
  if (!supportTenant.ok) return supportTenant;
  const sourceHash = buildSourceHash(params.requester);
  const active = await getActiveSupportConversation(params.prisma, {
    supportClientId: supportTenant.client.id,
    sourceHash,
  });
  if (active) {
    if (text) {
      await persistSupportInboundMessage(params.prisma, {
        requestId: params.requestId,
        supportClient: supportTenant.client,
        requester: params.requester,
        conversation: active,
        text,
      });
    }
    return {
      ok: true,
      resumed: true,
      conversation: await serializeSupportConversation(params.prisma, {
        supportClientId: supportTenant.client.id,
        sourceHash,
        conversation: active,
      }),
    };
  }
  if (!text) {
    return { ok: false, status: 400, error: "support_message_required", message: "Descreva como podemos ajudar." };
  }
  const now = new Date();
  const requesterLabel = buildRequesterLabel(params.requester);
  const waId = buildSupportWaId(sourceHash, `${params.requestId}:${now.toISOString()}`);
  const conversationHash = buildSupportConversationHash(sourceHash, waId);
  const defaults = await ensureDefaultOperationalDepartmentAndQueue(params.prisma, supportTenant.client.id);
  const chatbotEnabled = getFeatures(supportTenant.client).chatbot;
  const activeEntryFlow = chatbotEnabled
    ? await params.prisma.chatbotFlow.findFirst({
        where: { clientId: supportTenant.client.id, isActive: true, entryPoint: true },
        select: { id: true },
      })
    : null;
  const startsInAutomation = Boolean(activeEntryFlow);
  const conversation = await params.prisma.$transaction(async (tx) => {
    const existingContact = await tx.contact.findFirst({
      where: {
        clientId: supportTenant.client.id,
        channel: SUPPORT_CHANNEL,
        provider: SUPPORT_PROVIDER,
        channelAccountId: SUPPORT_CHANNEL_ACCOUNT_ID,
        externalUserHash: sourceHash,
      },
      select: { id: true, waId: true },
    });
    const contact = existingContact
      ? await tx.contact.update({
          where: { id: existingContact.id },
          data: { name: requesterLabel },
          select: { id: true },
        })
      : await tx.contact.create({
          data: {
            clientId: supportTenant.client.id,
            waId,
            name: requesterLabel,
            channel: SUPPORT_CHANNEL,
            provider: SUPPORT_PROVIDER,
            channelAccountId: SUPPORT_CHANNEL_ACCOUNT_ID,
            externalUserHash: sourceHash,
          },
          select: { id: true },
        });
    const identity = await tx.contactChannelIdentity.upsert({
      where: {
        clientId_channel_provider_channelAccountId_externalUserHash: {
          clientId: supportTenant.client.id,
          channel: SUPPORT_CHANNEL,
          provider: SUPPORT_PROVIDER,
          channelAccountId: SUPPORT_CHANNEL_ACCOUNT_ID,
          externalUserHash: sourceHash,
        },
      },
      create: {
        clientId: supportTenant.client.id,
        contactId: contact.id,
        channel: SUPPORT_CHANNEL,
        provider: SUPPORT_PROVIDER,
        channelAccountId: SUPPORT_CHANNEL_ACCOUNT_ID,
        externalUserHash: sourceHash,
        displayName: requesterLabel,
        firstSeenAt: now,
        lastSeenAt: now,
      },
      update: {
        contactId: contact.id,
        displayName: requesterLabel,
        lastSeenAt: now,
      },
      select: { id: true },
    });
    const existingLead = await tx.lead.findFirst({
      where: {
        tenantId: supportTenant.client.id,
        channel: SUPPORT_CHANNEL,
        provider: SUPPORT_PROVIDER,
        channelAccountId: SUPPORT_CHANNEL_ACCOUNT_ID,
        externalUserHash: sourceHash,
      },
      select: { id: true },
    });
    if (existingLead) {
      await tx.lead.update({
        where: { id: existingLead.id },
        data: {
          waId,
          waIdCanonical: waId,
          name: requesterLabel,
          status: "NEW",
          contactChannelIdentityId: identity.id,
        },
      });
    } else {
      await tx.lead.create({
        data: {
          tenantId: supportTenant.client.id,
          waId,
          waIdCanonical: waId,
          name: requesterLabel,
          status: "NEW",
          channel: SUPPORT_CHANNEL,
          provider: SUPPORT_PROVIDER,
          channelAccountId: SUPPORT_CHANNEL_ACCOUNT_ID,
          externalUserHash: sourceHash,
          contactChannelIdentityId: identity.id,
        },
      });
    }
    const created = await tx.conversation.create({
      data: {
        clientId: supportTenant.client.id,
        waId,
        waIdCanonical: waId,
        phoneNumberId: null,
        channel: SUPPORT_CHANNEL,
        provider: SUPPORT_PROVIDER,
        channelAccountId: SUPPORT_CHANNEL_ACCOUNT_ID,
        externalUserHash: conversationHash,
        externalUserRef: sourceHash,
        departmentId: defaults.department.id,
        windowIsOpen: true,
        lastInboundAt: now,
      },
      select: {
        id: true,
        waId: true,
        waIdCanonical: true,
        createdAt: true,
        updatedAt: true,
        lastInboundAt: true,
        lastOutboundAt: true,
        closedAt: true,
      },
    });
    const conversationKey = buildConversationKey(created.id, sourceHash);
    await tx.conversationRuntimeState.create({
      data: {
        clientId: supportTenant.client.id,
        waId,
        waIdCanonical: waId,
        conversationKey,
        channel: SUPPORT_CHANNEL,
        provider: SUPPORT_PROVIDER,
        channelAccountId: SUPPORT_CHANNEL_ACCOUNT_ID,
        externalUserHash: conversationHash,
        externalUserRef: sourceHash,
        firstSeenAt: now,
        windowIsOpen: true,
        lastInboundAt: now,
        handoffStatus: HandoffStatus.NONE,
        mode: startsInAutomation ? "BOT" : "HUMAN",
        status: startsInAutomation ? ConversationOperationalStatus.WAITING_USER : ConversationOperationalStatus.WAITING,
        departmentId: defaults.department.id,
        queueId: defaults.queue.id,
        answers: {
          supportHub: {
            sourceTenantHash: shortHash(params.requester.clientId, 16),
            requesterHash: shortHash(params.requester.userId, 16),
            requesterRole: params.requester.role,
          },
        } satisfies Prisma.InputJsonValue,
      },
    });
    await tx.event.create({
      data: {
        clientId: supportTenant.client.id,
        conversationId: created.id,
        waId,
        waIdCanonical: waId,
        requestId: params.requestId,
        eventName: "support.conversation.opened",
        payloadJson: {
          source: "support_hub",
          supportRef: buildSupportRef(conversationKey),
          sourceTenantHash: shortHash(params.requester.clientId, 16),
          requesterHash: shortHash(params.requester.userId, 16),
          requesterRole: params.requester.role,
        } satisfies Prisma.InputJsonValue,
      },
    });
    return created;
  });
  await persistSupportInboundMessage(params.prisma, {
    requestId: params.requestId,
    supportClient: supportTenant.client,
    requester: params.requester,
    conversation,
    text,
  });
  return {
    ok: true,
    resumed: false,
    conversation: await serializeSupportConversation(params.prisma, {
      supportClientId: supportTenant.client.id,
      sourceHash,
      conversation,
    }),
  };
}

export async function getSupportConversation(params: {
  prisma: PrismaClient;
  supportTenantKey: string;
  requester: SupportRequester;
  supportRef: string;
}): Promise<SupportGatewayResult<{ conversation: Awaited<ReturnType<typeof serializeSupportConversation>>; messages: SupportMessage[] }>> {
  if (!isAllowedRequesterRole(params.requester.role)) {
    return { ok: false, status: 403, error: "forbidden", message: "Apenas administradores e supervisores podem abrir suporte." };
  }
  const supportTenant = await resolveSupportTenant(params.prisma, params.supportTenantKey);
  if (!supportTenant.ok) return supportTenant;
  const sourceHash = buildSourceHash(params.requester);
  const conversation = await resolveSupportConversationByRef(params.prisma, {
    supportClientId: supportTenant.client.id,
    sourceHash,
    supportRef: params.supportRef,
  });
  if (!conversation) {
    return { ok: false, status: 404, error: "support_conversation_not_found", message: "Chamado nao encontrado." };
  }
  return {
    ok: true,
    conversation: await serializeSupportConversation(params.prisma, {
      supportClientId: supportTenant.client.id,
      sourceHash,
      conversation,
    }),
    messages: await listSupportMessages(params.prisma, supportTenant.client.id, conversation.waId),
  };
}

export type SupportMessage = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  bodyText: string | null;
  createdAt: string;
  status: string;
  actorName: string | null;
};

async function listSupportMessages(
  prisma: PrismaClient,
  supportClientId: string,
  waId: string
): Promise<SupportMessage[]> {
  const [inbound, outbound] = await Promise.all([
    prisma.inboundMessage.findMany({
      where: { clientId: supportClientId, waId, channel: SUPPORT_CHANNEL },
      orderBy: { createdAt: "asc" },
      select: { id: true, messageId: true, bodyText: true, createdAt: true },
    }),
    prisma.outboundMessage.findMany({
      where: { clientId: supportClientId, waId, channel: SUPPORT_CHANNEL },
      orderBy: { createdAt: "asc" },
      select: { id: true, messageId: true, bodyText: true, status: true, createdAt: true, rawPayload: true },
    }),
  ]);
  const actorIds = Array.from(
    new Set(
      outbound
        .map((item) => {
          const raw = item.rawPayload;
          if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
          const actor = (raw as Record<string, unknown>).actor;
          if (!actor || typeof actor !== "object" || Array.isArray(actor)) return null;
          const userId = (actor as Record<string, unknown>).userId;
          return typeof userId === "string" ? userId : null;
        })
        .filter((value): value is string => Boolean(value))
    )
  );
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { clientId: supportClientId, id: { in: actorIds } },
        select: { id: true, name: true },
      })
    : [];
  const actorNameById = new Map(actors.map((item) => [item.id, item.name]));
  return [
    ...inbound.map((item) => ({
      id: item.id,
      direction: "INBOUND" as const,
      bodyText: item.bodyText,
      createdAt: item.createdAt.toISOString(),
      status: "RECEIVED",
      actorName: null,
    })),
    ...outbound.map((item) => {
      const raw = item.rawPayload;
      const actor = raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>).actor
        : null;
      const userId = actor && typeof actor === "object" && !Array.isArray(actor)
        ? (actor as Record<string, unknown>).userId
        : null;
      return {
        id: item.id,
        direction: "OUTBOUND" as const,
        bodyText: item.bodyText,
        createdAt: item.createdAt.toISOString(),
        status: item.status,
        actorName: typeof userId === "string" ? actorNameById.get(userId) ?? null : null,
      };
    }),
  ].sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
}

export async function sendSupportConversationMessage(params: {
  prisma: PrismaClient;
  supportTenantKey: string;
  requestId: string;
  requester: SupportRequester;
  supportRef: string;
  text: unknown;
}): Promise<SupportGatewayResult<{ conversation: Awaited<ReturnType<typeof serializeSupportConversation>>; messages: SupportMessage[] }>> {
  const textRaw = typeof params.text === "string" ? params.text : "";
  const text = normalizeText(textRaw);
  if (!text) return { ok: false, status: 400, error: "support_message_required", message: "Digite uma mensagem." };
  if (textRaw.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, status: 400, error: "support_message_too_long", message: "Mensagem muito longa." };
  }
  const supportTenant = await resolveSupportTenant(params.prisma, params.supportTenantKey);
  if (!supportTenant.ok) return supportTenant;
  const sourceHash = buildSourceHash(params.requester);
  const conversation = await resolveSupportConversationByRef(params.prisma, {
    supportClientId: supportTenant.client.id,
    sourceHash,
    supportRef: params.supportRef,
  });
  if (!conversation) {
    return { ok: false, status: 404, error: "support_conversation_not_found", message: "Chamado nao encontrado." };
  }
  if (conversation.closedAt) {
    return { ok: false, status: 409, error: "support_conversation_closed", message: "Este chamado foi encerrado. Abra um novo chamado." };
  }
  await persistSupportInboundMessage(params.prisma, {
    requestId: params.requestId,
    supportClient: supportTenant.client,
    requester: params.requester,
    conversation,
    text,
  });
  return getSupportConversation(params);
}

export async function createSupportAgentOutboundMessage(params: {
  prisma: PrismaClient;
  clientId: string;
  clientKey: string;
  waId: string;
  text: string;
  requestId: string;
  actorUserId: string;
}) {
  const textRaw = String(params.text ?? "");
  const text = normalizeText(textRaw);
  if (!text) return { ok: false as const, statusCode: 400, error: "support_message_required", message: "Digite uma mensagem." };
  if (textRaw.length > MAX_MESSAGE_LENGTH) {
    return { ok: false as const, statusCode: 400, error: "support_message_too_long", message: "Mensagem muito longa." };
  }
  const conversation = await params.prisma.conversation.findFirst({
    where: {
      clientId: params.clientId,
      waId: params.waId,
      channel: SUPPORT_CHANNEL,
      provider: SUPPORT_PROVIDER,
      deletedAt: null,
      anonymizedAt: null,
    },
    select: { id: true, waId: true, waIdCanonical: true, externalUserHash: true, externalUserRef: true },
  });
  if (!conversation) {
    return { ok: false as const, statusCode: 404, error: "conversation_not_found", message: "Conversa nao encontrada." };
  }
  const createdAt = new Date();
  const messageId = `support.outbound.${params.requestId}.${shortHash(`${params.waId}:${createdAt.toISOString()}`, 12)}`;
  const outbound = await params.prisma.outboundMessage.upsert({
    where: { clientId_messageId: { clientId: params.clientId, messageId } },
    create: {
      clientId: params.clientId,
      phoneNumberId: null,
      waId: params.waId,
      waIdCanonical: conversation.waIdCanonical ?? params.waId,
      messageId,
      channel: SUPPORT_CHANNEL,
      provider: SUPPORT_PROVIDER,
      channelAccountId: SUPPORT_CHANNEL_ACCOUNT_ID,
      externalUserHash: conversation.externalUserRef ?? conversation.externalUserHash,
      externalUserRef: conversation.externalUserRef ?? null,
      externalMessageId: messageId,
      legacyWaId: null,
      type: MessageType.TEXT,
      status: MessageStatus.SENT,
      bodyText: text,
      requestId: params.requestId,
      metaMessageId: null,
      errorBody: null,
      rawPayload: {
        source: "support_inbox",
        actor: {
          source: "human_inbox",
          userId: params.actorUserId,
        },
        messageLength: text.length,
      } satisfies Prisma.InputJsonValue,
    },
    update: {
      status: MessageStatus.SENT,
      bodyText: text,
    },
    select: { id: true },
  });
  await Promise.all([
    params.prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastOutboundAt: createdAt, updatedAt: createdAt },
    }),
    params.prisma.conversationRuntimeState.updateMany({
      where: { clientId: params.clientId, waId: params.waId, channel: SUPPORT_CHANNEL },
      data: {
        lastOutboundAt: createdAt,
        lastOutboundMessageId: messageId,
        status: ConversationOperationalStatus.IN_PROGRESS,
      },
    }),
    params.prisma.event.create({
      data: {
        clientId: params.clientId,
        conversationId: conversation.id,
        waId: params.waId,
        waIdCanonical: conversation.waIdCanonical ?? params.waId,
        messageId,
        requestId: params.requestId,
        eventName: "support.message.sent",
        payloadJson: {
          source: "support_inbox",
          actorUserHash: shortHash(params.actorUserId, 16),
          messageLength: text.length,
        } satisfies Prisma.InputJsonValue,
      },
    }),
  ]);
  return {
    ok: true as const,
    status: MessageStatus.SENT,
    messageId,
    internalMessageId: outbound.id,
    metaMessageId: null,
    createdAt: createdAt.toISOString(),
    bodyText: text,
    agentSignatureApplied: false,
    agentSignatureFormat: null,
  };
}
