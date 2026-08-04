import { ConversationOperationalStatus, type PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { ensureDefaultOperationalDepartmentAndQueue } from "../bootstrap/defaultOperationalDepartment.js";
import { persistEvent } from "../db/persist.js";
import { makeConversationKey } from "../storage/conversationKey.js";
import { canonicalizeBrazilWaId } from "../utils/waid.js";

function buildOutboundContactDisplayName(waId: string) {
  const last4 = waId.slice(-4) || "----";
  return `Contato WhatsApp • ****${last4}`;
}

function buildWhatsAppExternalUserHash(waIdCanonical: string) {
  return `whatsapp:${crypto.createHash("sha256").update(waIdCanonical).digest("hex").slice(0, 32)}`;
}

async function recordCampaignOutboundConversationReactivated(
  params: {
    clientId: string;
    conversationId: string;
    waId: string;
    waIdCanonical: string;
    messageId: string;
    campaignId: string;
    campaignRunId: string;
    templateName: string;
    source: "campaign" | "manual" | "bot";
  }
) {
  await persistEvent({
    clientId: params.clientId,
    conversationId: params.conversationId,
    waId: params.waId,
    waIdCanonical: params.waIdCanonical,
    messageId: params.messageId,
    requestId: `campaign-conversation-reactivated:${params.campaignId}:${params.messageId}`,
    eventName: "campaign.recipient.conversation_reactivated",
    payloadJson: {
      campaignId: params.campaignId,
      campaignRunId: params.campaignRunId,
      conversationId: params.conversationId,
      source: params.source,
      reason: "outbound_template_sent",
      templateName: params.templateName,
      waIdLast4: params.waId.slice(-4),
      waIdLength: params.waId.length,
    },
  });
}

async function ensureCampaignOutboundCrmBootstrap(
  prisma: PrismaClient,
  params: {
    clientId: string;
    waId: string;
    waIdCanonical: string;
    phoneNumberId?: string | null;
    conversationId: string;
    campaignId: string;
    campaignRunId: string;
    messageId: string;
    templateName: string;
    source: "campaign" | "manual" | "bot";
  }
) {
  const displayName = buildOutboundContactDisplayName(params.waId);
  const channelAccountId = params.phoneNumberId ?? "whatsapp";
  const identityHash = buildWhatsAppExternalUserHash(params.waIdCanonical);

  const contact = await prisma.contact.upsert({
    where: {
      clientId_waId: {
        clientId: params.clientId,
        waId: params.waId,
      },
    },
    update: {
      channel: "whatsapp",
      provider: "meta",
      channelAccountId,
      externalUserHash: identityHash,
    },
    create: {
      clientId: params.clientId,
      waId: params.waId,
      name: displayName,
      channel: "whatsapp",
      provider: "meta",
      channelAccountId,
      externalUserHash: identityHash,
    },
    select: { id: true, name: true },
  });

  const identity = await prisma.contactChannelIdentity.upsert({
    where: {
      clientId_channel_provider_channelAccountId_externalUserHash: {
        clientId: params.clientId,
        channel: "whatsapp",
        provider: "meta",
        channelAccountId,
        externalUserHash: identityHash,
      },
    },
    update: {
      contactId: contact.id,
      legacyWaId: params.waId,
      displayName: contact.name ?? displayName,
      lastSeenAt: params.source === "campaign" ? undefined : new Date(),
    },
    create: {
      clientId: params.clientId,
      contactId: contact.id,
      channel: "whatsapp",
      provider: "meta",
      channelAccountId,
      externalUserHash: identityHash,
      legacyWaId: params.waId,
      displayName: contact.name ?? displayName,
    },
    select: { id: true },
  });

  const existingLead = await prisma.lead.findUnique({
    where: {
      tenantId_waId: {
        tenantId: params.clientId,
        waId: params.waId,
      },
    },
    select: { id: true, name: true, phone: true, contactChannelIdentityId: true },
  });

  const lead = existingLead
    ? await prisma.lead.update({
        where: { id: existingLead.id },
        data: {
          waIdCanonical: params.waIdCanonical,
          channel: "whatsapp",
          provider: "meta",
          channelAccountId,
          externalUserHash: identityHash,
          contactChannelIdentityId: existingLead.contactChannelIdentityId ?? identity.id,
          phone: existingLead.phone ?? params.waId,
          name: existingLead.name ?? contact.name ?? displayName,
        },
        select: { id: true },
      })
    : await prisma.lead.create({
        data: {
          tenantId: params.clientId,
          waId: params.waId,
          waIdCanonical: params.waIdCanonical,
          channel: "whatsapp",
          provider: "meta",
          channelAccountId,
          externalUserHash: identityHash,
          contactChannelIdentityId: identity.id,
          name: contact.name ?? displayName,
          phone: params.waId,
          status: "NEW",
        },
        select: { id: true },
      });

  await persistEvent({
    clientId: params.clientId,
    conversationId: params.conversationId,
    waId: params.waId,
    waIdCanonical: params.waIdCanonical,
    messageId: params.messageId,
    requestId: `campaign-contact-bootstrap:${params.campaignId}:${params.messageId}`,
    eventName: "campaign.recipient.contact_bootstrap_ready",
    payloadJson: {
      campaignId: params.campaignId,
      campaignRunId: params.campaignRunId,
      conversationId: params.conversationId,
      contactId: contact.id,
      leadId: lead.id,
      source: params.source,
      templateName: params.templateName,
      waIdLast4: params.waId.slice(-4),
      waIdLength: params.waId.length,
    },
  });

  return { contactId: contact.id, leadId: lead.id };
}

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
          anonymizedAt: null,
        },
        select: { id: true, deletedAt: true },
      })
    : await prisma.conversation.findFirst({
        where: {
          clientId: params.clientId,
          anonymizedAt: null,
          OR: [{ waId: params.waId }, { waIdCanonical }],
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: { id: true, deletedAt: true },
      });
  const anonymizedExisting = existing
    ? null
    : params.conversationId
      ? await prisma.conversation.findFirst({
          where: {
            id: params.conversationId,
            clientId: params.clientId,
            anonymizedAt: { not: null },
          },
          select: { id: true },
        })
      : await prisma.conversation.findFirst({
          where: {
            clientId: params.clientId,
            anonymizedAt: { not: null },
            OR: [{ waId: params.waId }, { waIdCanonical }],
          },
          select: { id: true },
        });
  if (anonymizedExisting) {
    return { conversationId: null, created: false, contactId: null, leadId: null, skipped: "anonymized" as const };
  }

  if (existing) {
    const wasSoftDeleted = Boolean(existing.deletedAt);
    await prisma.conversation.updateMany({
      where: { id: existing.id, clientId: params.clientId },
      data: {
        deletedAt: null,
        lastOutboundAt: params.sentAt,
      },
    });
    const runtimeUpdate = await prisma.conversationRuntimeState.updateMany({
      where: {
        clientId: params.clientId,
        OR: [{ waId: params.waId }, { waIdCanonical }],
      },
      data: {
        lastOutboundAt: params.sentAt,
        lastOutboundMessageId: params.messageId,
        ...(wasSoftDeleted
          ? {
              mode: "HUMAN",
              status: ConversationOperationalStatus.WAITING,
              closedAt: null,
              chatbotActive: false,
            }
          : {}),
      },
    });
    if (runtimeUpdate.count === 0) {
      await prisma.conversationRuntimeState.create({
        data: {
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
    }
    if (wasSoftDeleted) {
      await recordCampaignOutboundConversationReactivated({
        clientId: params.clientId,
        conversationId: existing.id,
        waId: params.waId,
        waIdCanonical,
        messageId: params.messageId,
        campaignId: params.campaignId,
        campaignRunId: params.campaignRunId,
        templateName: params.templateName,
        source: params.source,
      });
    }
    const crm = await ensureCampaignOutboundCrmBootstrap(prisma, {
      clientId: params.clientId,
      waId: params.waId,
      waIdCanonical,
      phoneNumberId: params.phoneNumberId,
      conversationId: existing.id,
      campaignId: params.campaignId,
      campaignRunId: params.campaignRunId,
      messageId: params.messageId,
      templateName: params.templateName,
      source: params.source,
    });
    return { conversationId: existing.id, created: false, ...crm };
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

  const crm = await ensureCampaignOutboundCrmBootstrap(prisma, {
    clientId: params.clientId,
    waId: params.waId,
    waIdCanonical,
    phoneNumberId: params.phoneNumberId,
    conversationId: created.id,
    campaignId: params.campaignId,
    campaignRunId: params.campaignRunId,
    messageId: params.messageId,
    templateName: params.templateName,
    source: params.source,
  });

  return { conversationId: created.id, created: true, ...crm };
}
