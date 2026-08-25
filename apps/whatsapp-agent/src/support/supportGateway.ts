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
import { CONTACT_LIFECYCLE_ACTIVE } from "../contacts/contactLifecycle.js";
import { getFeatures } from "../features/clientFeatures.js";
import { runWebchatChatbotFlow } from "../webchat/webchatInboundService.js";
import {
  extractSupportAttachmentMetadata,
  removeSupportAttachmentFile,
  resolveSupportAttachmentFile,
  storeSupportImageAttachment,
  supportAttachmentToJson,
  type SupportAttachmentMetadata,
  type SupportAttachmentUpload,
} from "./supportAttachments.js";

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

type SupportRouting = {
  department: { id: string; name: string };
  queue: { id: string; name: string; departmentId: string };
  chatbotFlowId: string | null;
};

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

function readSupportChannelConfig(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return {};
  const supportChannel = (config as { supportChannel?: unknown }).supportChannel;
  if (!supportChannel || typeof supportChannel !== "object" || Array.isArray(supportChannel)) return {};
  const raw = supportChannel as Record<string, unknown>;
  return {
    chatbotFlowId: typeof raw.chatbotFlowId === "string" ? normalizeText(raw.chatbotFlowId, 160) : null,
    departmentId: typeof raw.departmentId === "string" ? normalizeText(raw.departmentId, 160) : null,
    queueId: typeof raw.queueId === "string" ? normalizeText(raw.queueId, 160) : null,
    useEntryPointFallback: raw.useEntryPointFallback === true,
  };
}

async function resolveSupportRouting(
  prisma: PrismaClient,
  params: {
    clientId: string;
    client: { features: unknown };
  }
): Promise<SupportRouting> {
  const defaults = await ensureDefaultOperationalDepartmentAndQueue(prisma, params.clientId);
  const operationalConfig = await prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const supportChannel = readSupportChannelConfig(operationalConfig?.config);
  const configuredDepartment = supportChannel.departmentId
    ? await prisma.department.findFirst({
        where: { id: supportChannel.departmentId, clientId: params.clientId, isActive: true },
        select: { id: true, name: true },
      })
    : null;
  const department = configuredDepartment ?? defaults.department;
  const configuredQueue = supportChannel.queueId
    ? await prisma.queue.findFirst({
        where: {
          id: supportChannel.queueId,
          clientId: params.clientId,
          departmentId: department.id,
        },
        select: { id: true, name: true, departmentId: true },
      })
    : null;
  const queue = configuredQueue ?? (
    configuredDepartment
      ? await prisma.queue.findFirst({
          where: { clientId: params.clientId, departmentId: configuredDepartment.id },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { id: true, name: true, departmentId: true },
        })
      : null
  ) ?? defaults.queue;

  const chatbotEnabled = getFeatures(params.client).chatbot;
  if (!chatbotEnabled) return { department, queue, chatbotFlowId: null };

  const configuredFlow = supportChannel.chatbotFlowId
    ? await prisma.chatbotFlow.findFirst({
        where: { id: supportChannel.chatbotFlowId, clientId: params.clientId, isActive: true },
        select: { id: true },
      })
    : null;
  if (configuredFlow) return { department, queue, chatbotFlowId: configuredFlow.id };

  if (supportChannel.useEntryPointFallback) {
    const entryPointFlow = await prisma.chatbotFlow.findFirst({
      where: { clientId: params.clientId, isActive: true, entryPoint: true },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true },
    });
    if (entryPointFlow) return { department, queue, chatbotFlowId: entryPointFlow.id };
  }

  return { department, queue, chatbotFlowId: null };
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
    mode?: "BOT" | "HUMAN";
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
    mode: params.mode ?? "HUMAN",
    handoffStatus: "none",
    humanInboxVisible: true,
    assignedUserId: null,
    departmentId: null,
    message: {
      inboxVisibility: "human_timeline",
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

async function persistSupportInboundAttachmentMessage(
  prisma: PrismaClient,
  params: {
    requestId: string;
    supportClient: { id: string; clientKey: string; features: unknown; profile: unknown };
    requester: SupportRequester;
    conversation: { id: string; waId: string };
    caption: string | null;
    attachment: SupportAttachmentMetadata;
    mode?: "BOT" | "HUMAN";
  }
) {
  const now = new Date();
  const sourceHash = buildSourceHash(params.requester);
  const messageId = `support.inbound.image.${params.requestId}.${shortHash(`${params.conversation.waId}:${now.toISOString()}`, 12)}`;
  const mediaPayload = {
    mediaId: params.attachment.attachmentRef,
    mimeType: params.attachment.mimeType,
    fileName: params.attachment.originalFilename,
    caption: params.caption,
    sizeBytes: params.attachment.sizeBytes,
    width: params.attachment.width,
    height: params.attachment.height,
    source: "support_attachment",
  } satisfies Prisma.InputJsonValue;
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
        type: MessageType.IMAGE,
        bodyText: params.caption,
        allowlistHit: false,
        requestId: params.requestId,
        createdAt: now,
        rawPayload: {
          source: "support_hub",
          requesterRole: params.requester.role,
          sourceTenantHash: shortHash(params.requester.clientId, 16),
          requesterHash: shortHash(params.requester.userId, 16),
          messageLength: params.caption?.length ?? 0,
          media: mediaPayload,
          supportAttachment: supportAttachmentToJson(params.attachment, params.caption),
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
        eventName: "support.attachment.sent",
        payloadJson: {
          source: "support_hub",
          type: "image",
          mimeType: params.attachment.mimeType,
          sizeBytes: params.attachment.sizeBytes,
          sourceTenantHash: shortHash(params.requester.clientId, 16),
          requesterHash: shortHash(params.requester.userId, 16),
          conversationHash: shortHash(params.conversation.id, 16),
        } satisfies Prisma.InputJsonValue,
      },
    });
  });
  publishRealtimeEvent({
    type: "message.created",
    clientId: params.supportClient.id,
    waId: params.conversation.waId,
    waIdCanonical: params.conversation.waId,
    mode: params.mode ?? "HUMAN",
    handoffStatus: "none",
    humanInboxVisible: true,
    assignedUserId: null,
    departmentId: null,
    message: {
      inboxVisibility: "human_timeline",
      direction: "INBOUND",
      type: MessageType.IMAGE,
      status: "RECEIVED",
      intent: null,
      bodyText: params.caption,
      templateName: null,
      templateLang: null,
      requestId: params.requestId,
      messageId,
      metaMessageId: null,
      errorBody: null,
      createdAt: now.toISOString(),
    },
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
  const routing = await resolveSupportRouting(params.prisma, {
    clientId: supportTenant.client.id,
    client: supportTenant.client,
  });
  const startsInAutomation = Boolean(routing.chatbotFlowId);
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
            lifecycle: CONTACT_LIFECYCLE_ACTIVE,
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
        departmentId: routing.department.id,
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
        departmentId: routing.department.id,
        queueId: routing.queue.id,
        flow: routing.chatbotFlowId ? `chatbot:${routing.chatbotFlowId}` : null,
        chatbotActive: startsInAutomation,
        answers: {
          supportHub: {
            sourceTenantHash: shortHash(params.requester.clientId, 16),
            requesterHash: shortHash(params.requester.userId, 16),
            requesterRole: params.requester.role,
            routing: {
              mode: startsInAutomation ? "dedicated_chatbot" : "human",
              departmentId: shortHash(routing.department.id, 16),
              queueId: shortHash(routing.queue.id, 16),
              chatbotFlowId: routing.chatbotFlowId ? shortHash(routing.chatbotFlowId, 16) : null,
            },
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
    mode: startsInAutomation ? "BOT" : "HUMAN",
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
  type: "TEXT" | "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT" | "LOCATION" | "TEMPLATE" | "UNKNOWN" | string;
  bodyText: string | null;
  createdAt: string;
  status: string;
  actorName: string | null;
  media: {
    kind: "image";
    ref: string;
    mimeType: string;
    fileName: string | null;
    caption: string | null;
    sizeBytes: number;
    width: number | null;
    height: number | null;
    url: string;
  } | null;
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
      select: { id: true, messageId: true, type: true, bodyText: true, createdAt: true, rawPayload: true },
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
      type: item.type,
      bodyText: item.bodyText,
      createdAt: item.createdAt.toISOString(),
      status: "RECEIVED",
      actorName: null,
      media: serializeSupportAttachmentForClient(item.rawPayload),
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
        type: "TEXT",
        bodyText: item.bodyText,
        createdAt: item.createdAt.toISOString(),
        status: item.status,
        actorName: typeof userId === "string" ? actorNameById.get(userId) ?? null : null,
        media: null,
      };
    }),
  ].sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
}

function serializeSupportAttachmentForClient(rawPayload: unknown): SupportMessage["media"] {
  const attachment = extractSupportAttachmentMetadata(rawPayload);
  if (!attachment) return null;
  return {
    kind: "image",
    ref: attachment.attachmentRef,
    mimeType: attachment.mimeType,
    fileName: attachment.originalFilename,
    caption: attachment.caption,
    sizeBytes: attachment.sizeBytes,
    width: attachment.width,
    height: attachment.height,
    url: "",
  };
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

export async function sendSupportConversationAttachment(params: {
  prisma: PrismaClient;
  supportTenantKey: string;
  requestId: string;
  requester: SupportRequester;
  supportRef: string;
  caption: unknown;
  file: SupportAttachmentUpload;
  attachmentRoot: string;
}): Promise<SupportGatewayResult<{ conversation: Awaited<ReturnType<typeof serializeSupportConversation>>; messages: SupportMessage[] }>> {
  if (!isAllowedRequesterRole(params.requester.role)) {
    return { ok: false, status: 403, error: "forbidden", message: "Apenas administradores e supervisores podem abrir suporte." };
  }
  const captionRaw = typeof params.caption === "string" ? params.caption : "";
  const caption = normalizeText(captionRaw);
  if (captionRaw.length > MAX_MESSAGE_LENGTH) {
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
  const attachment = await storeSupportImageAttachment({
    root: params.attachmentRoot,
    clientId: supportTenant.client.id,
    conversationId: conversation.id,
    file: params.file,
  });
  try {
    await persistSupportInboundAttachmentMessage(params.prisma, {
      requestId: params.requestId,
      supportClient: supportTenant.client,
      requester: params.requester,
      conversation,
      caption: caption || null,
      attachment,
    });
  } catch (error) {
    await removeSupportAttachmentFile({
      root: params.attachmentRoot,
      clientId: supportTenant.client.id,
      conversationId: conversation.id,
      storageKey: attachment.storageKey,
    });
    throw error;
  }
  return getSupportConversation(params);
}

export async function resolveSupportConversationAttachment(params: {
  prisma: PrismaClient;
  supportTenantKey: string;
  requester: SupportRequester;
  supportRef: string;
  attachmentRef: string;
  attachmentRoot: string;
}) {
  if (!isAllowedRequesterRole(params.requester.role)) {
    return { ok: false as const, status: 403 as const, error: "forbidden", message: "Apenas administradores e supervisores podem abrir suporte." };
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
    return { ok: false as const, status: 404 as const, error: "support_conversation_not_found", message: "Chamado nao encontrado." };
  }
  const message = await params.prisma.inboundMessage.findFirst({
    where: {
      clientId: supportTenant.client.id,
      waId: conversation.waId,
      channel: SUPPORT_CHANNEL,
      provider: SUPPORT_PROVIDER,
      type: MessageType.IMAGE,
      rawPayload: {
        path: ["supportAttachment", "attachmentRef"],
        equals: params.attachmentRef,
      },
    },
    select: { rawPayload: true },
  });
  const metadata = extractSupportAttachmentMetadata(message?.rawPayload);
  if (!metadata || metadata.attachmentRef !== params.attachmentRef) {
    return { ok: false as const, status: 404 as const, error: "support_attachment_not_found", message: "Imagem nao encontrada." };
  }
  const file = await resolveSupportAttachmentFile({
    root: params.attachmentRoot,
    clientId: supportTenant.client.id,
    conversationId: conversation.id,
    metadata,
  });
  return { ok: true as const, metadata, file };
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
