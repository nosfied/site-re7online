import { ConversationOperationalStatus, type PrismaClient } from "@prisma/client";
import { ensureDefaultOperationalDepartmentAndQueue } from "../bootstrap/defaultOperationalDepartment.js";
import { persistEvent } from "../db/persist.js";
import { makeConversationKey } from "../storage/conversationKey.js";
import { canonicalizeBrazilWaId } from "../utils/waid.js";

export async function ensureCampaignOutboundConversation(
  prisma: PrismaClient,
  params: {
    clientId: string;
    clientKey: string;
    waId: string;
    waIdCanonical?: string | null;
    phoneNumberId?: string | null;
    messageId: string;
    campaignId: string;
    campaignRunId: string;
    templateName: string;
    sentAt: Date;
    source: "campaign" | "manual" | "bot";
    conversationId?: string | null;
  }
) {
  const waIdCanonical = params.waIdCanonical ?? canonicalizeBrazilWaId(params.waId);
  const defaults = await ensureDefaultOperationalDepartmentAndQueue(prisma, params.clientId);
  const existing = params.conversationId
    ? await prisma.conversation.findFirst({
        where: {
          id: params.conversationId,
          clientId: params.clientId,
          deletedAt: null,
          anonymizedAt: null,
        },
        select: { id: true },
      })
    : await prisma.conversation.findFirst({
        where: {
          clientId: params.clientId,
          deletedAt: null,
          anonymizedAt: null,
          OR: [{ waId: params.waId }, { waIdCanonical }],
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: { id: true },
      });

  if (existing) {
    await prisma.conversation.updateMany({
      where: { id: existing.id, clientId: params.clientId },
      data: { lastOutboundAt: params.sentAt },
    });
    await prisma.conversationRuntimeState.updateMany({
      where: {
        clientId: params.clientId,
        OR: [{ waId: params.waId }, { waIdCanonical }],
      },
      data: {
        lastOutboundAt: params.sentAt,
        lastOutboundMessageId: params.messageId,
      },
    });
    return { conversationId: existing.id, created: false };
  }

  const created = await prisma.conversation.upsert({
    where: {
      clientId_waId: {
        clientId: params.clientId,
        waId: params.waId,
      },
    },
    update: {
      lastOutboundAt: params.sentAt,
      channel: "whatsapp",
      provider: "meta",
      phoneNumberId: params.phoneNumberId ?? undefined,
      departmentId: defaults.department.id,
    },
    create: {
      clientId: params.clientId,
      waId: params.waId,
      waIdCanonical,
      phoneNumberId: params.phoneNumberId ?? undefined,
      channel: "whatsapp",
      provider: "meta",
      departmentId: defaults.department.id,
      lastOutboundAt: params.sentAt,
      windowIsOpen: false,
      windowExpiresAt: null,
    },
    select: { id: true },
  });

  await prisma.conversationRuntimeState.upsert({
    where: {
      clientId_waId: {
        clientId: params.clientId,
        waId: params.waId,
      },
    },
    update: {
      waIdCanonical,
      conversationKey: makeConversationKey(params.clientKey, params.waId),
      channel: "whatsapp",
      provider: "meta",
      lastOutboundAt: params.sentAt,
      lastOutboundMessageId: params.messageId,
      mode: "HUMAN",
      status: ConversationOperationalStatus.WAITING,
      departmentId: defaults.department.id,
      queueId: defaults.queue.id,
      closedAt: null,
      chatbotActive: false,
    },
    create: {
      clientId: params.clientId,
      waId: params.waId,
      waIdCanonical,
      conversationKey: makeConversationKey(params.clientKey, params.waId),
      channel: "whatsapp",
      provider: "meta",
      firstSeenAt: params.sentAt,
      lastOutboundAt: params.sentAt,
      lastOutboundMessageId: params.messageId,
      mode: "HUMAN",
      status: ConversationOperationalStatus.WAITING,
      departmentId: defaults.department.id,
      queueId: defaults.queue.id,
      chatbotActive: false,
      answers: {},
    },
  });

  await persistEvent({
    clientId: params.clientId,
    conversationId: created.id,
    waId: params.waId,
    waIdCanonical,
    messageId: params.messageId,
    requestId: `campaign-conversation-created:${params.campaignId}:${params.messageId}`,
    eventName: "campaign.recipient.conversation_created",
    payloadJson: {
      campaignId: params.campaignId,
      campaignRunId: params.campaignRunId,
      conversationId: created.id,
      matchedBy: "new_recipient",
      source: params.source,
      templateName: params.templateName,
      waIdLast4: params.waId.slice(-4),
      waIdLength: params.waId.length,
    },
  });

  return { conversationId: created.id, created: true };
}
