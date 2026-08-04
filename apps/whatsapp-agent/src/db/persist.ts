import { Prisma, MessageStatus, MessageType } from "@prisma/client";
import {
  getDefaultOperationalDepartment,
  resolveOperationalDepartmentId,
} from "../bootstrap/defaultOperationalDepartment.js";
import { getPrisma } from "../db.js";
import { logger } from "../logger/logger.js";
import { runtimeStorage } from "../storage/runtimeStorage.js";
import { makeConversationKey } from "../storage/conversationKey.js";
import { canonicalizeBrazilWaId } from "../utils/waid.js";
import { guardAgainstAnonymizedIdentityRehydration } from "../privacy/anonymizedIdentityGuard.js";
import {
  isWhatsAppMultichannelShadowWriteEnabled,
  safeApplyWhatsAppMultichannelShadow,
} from "../channels/whatsappMultichannelShadowWrite.js";

function maskWaIdForLog(value: string) {
  const raw = String(value ?? "").trim();
  if (raw.length <= 4) return "***";
  return `***${raw.slice(-4)}`;
}

export async function getDefaultDepartment(
  clientId: string,
  prisma = getPrisma()
) {
  if (!clientId) return null;
  return getDefaultOperationalDepartment(prisma, clientId);
}

export async function persistInboundMessage(params: {
  clientId: string;
  phoneNumberId?: string;
  waId: string;
  waIdCanonical?: string | null;
  messageId: string;
  type: MessageType;
  bodyText?: string | null;
  allowlistHit: boolean;
  requestId?: string;
  rawPayload?: Prisma.InputJsonValue;
}) {
  if (!params.clientId) return false;
  try {
    const prisma = getPrisma();
    const anonymizedGuard = await guardAgainstAnonymizedIdentityRehydration({
      prisma,
      clientId: params.clientId,
      channel: "whatsapp",
      provider: "meta",
      channelAccountId: params.phoneNumberId ?? null,
      waId: params.waId,
      requestId: params.requestId ?? `whatsapp-inbound:${params.messageId}`,
      source: "whatsapp.inbound_message",
    });
    if (anonymizedGuard.blocked) return false;

    const existing = await prisma.inboundMessage.findUnique({
      where: {
        clientId_messageId: {
          clientId: params.clientId,
          messageId: params.messageId,
        },
      },
      select: { id: true },
    });
    if (existing) return false;
    const created = await prisma.inboundMessage.create({
      data: {
        clientId: params.clientId,
        phoneNumberId: params.phoneNumberId,
        waId: params.waId,
        waIdCanonical: params.waIdCanonical ?? canonicalizeBrazilWaId(params.waId),
        messageId: params.messageId,
        type: params.type,
        bodyText: params.bodyText ?? undefined,
        allowlistHit: params.allowlistHit,
        requestId: params.requestId,
        rawPayload: params.rawPayload,
      },
      select: { id: true },
    });
    if (isWhatsAppMultichannelShadowWriteEnabled()) {
      await safeApplyWhatsAppMultichannelShadow({
        prisma,
        model: "InboundMessage",
        recordId: created.id,
        clientId: params.clientId,
        waId: params.waId,
        phoneNumberId: params.phoneNumberId,
      });
    }
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") return false;
    }
    throw error;
  }
}

export async function persistConversationWindow(params: {
  clientId: string;
  waId: string;
  waIdCanonical?: string | null;
  phoneNumberId?: string;
  departmentId?: string | null;
  windowIsOpen: boolean;
  windowExpiresAt?: Date | null;
  lastInboundAt?: Date | null;
  lastOutboundAt?: Date | null;
  reopenClosed?: boolean;
  requestId?: string;
}) {
  if (!params.clientId) return;
  const prisma = getPrisma();
  const waIdCanonical = params.waIdCanonical ?? canonicalizeBrazilWaId(params.waId);
  const existing = await prisma.conversation.findUnique({
    where: {
      clientId_waId: {
        clientId: params.clientId,
        waId: params.waId,
      },
    },
    select: {
      id: true,
      departmentId: true,
      deletedAt: true,
      anonymizedAt: true,
      closedAt: true,
    },
  });
  if (existing?.anonymizedAt) {
    await guardAgainstAnonymizedIdentityRehydration({
      prisma,
      clientId: params.clientId,
      channel: "whatsapp",
      provider: "meta",
      channelAccountId: params.phoneNumberId ?? null,
      waId: params.waId,
      requestId: params.requestId ?? "whatsapp-conversation-window",
      source: "whatsapp.conversation_window",
    });
    return;
  }
  const isInboundAfterSoftDelete = Boolean(existing?.deletedAt && params.lastInboundAt);
  const isInboundAfterClosed = Boolean(
    existing?.closedAt &&
      params.lastInboundAt &&
      params.lastInboundAt.getTime() > existing.closedAt.getTime()
  );
  const existingDepartmentId = existing?.deletedAt ? null : existing?.departmentId ?? null;
  const requestedDepartmentId = existing?.deletedAt
    ? params.departmentId ?? null
    : params.departmentId ?? existingDepartmentId;
  const shouldLeaveInboundUnassigned = Boolean(params.lastInboundAt && !requestedDepartmentId);
  const resolvedDepartmentId = isInboundAfterSoftDelete || shouldLeaveInboundUnassigned
    ? null
    : await resolveOperationalDepartmentId(
        prisma,
        params.clientId,
        requestedDepartmentId
      );
  const shouldRewriteDepartment = existingDepartmentId !== resolvedDepartmentId;
  const conversation = await prisma.conversation.upsert({
    where: {
      clientId_waId: {
        clientId: params.clientId,
        waId: params.waId,
      },
    },
    update: {
      waIdCanonical,
      phoneNumberId: params.phoneNumberId,
      windowIsOpen: params.windowIsOpen,
      windowExpiresAt: params.windowExpiresAt ?? undefined,
      lastInboundAt: params.lastInboundAt ?? undefined,
      lastOutboundAt: params.lastOutboundAt ?? undefined,
      ...(existing?.deletedAt && params.lastInboundAt
        ? {
            deletedAt: null,
            closedAt: null,
            historyVisibleAfter: null,
          }
        : {}),
      ...(params.reopenClosed || isInboundAfterClosed ? { closedAt: null } : {}),
      departmentId: isInboundAfterSoftDelete
        ? null
        : shouldRewriteDepartment
          ? resolvedDepartmentId
          : undefined,
    },
    create: {
      clientId: params.clientId,
      waId: params.waId,
      waIdCanonical,
      phoneNumberId: params.phoneNumberId,
      windowIsOpen: params.windowIsOpen,
      windowExpiresAt: params.windowExpiresAt ?? undefined,
      lastInboundAt: params.lastInboundAt ?? undefined,
      lastOutboundAt: params.lastOutboundAt ?? undefined,
      departmentId: resolvedDepartmentId ?? undefined,
    },
    select: { id: true },
  });
  if (isWhatsAppMultichannelShadowWriteEnabled()) {
    await safeApplyWhatsAppMultichannelShadow({
      prisma,
      model: "Conversation",
      recordId: conversation.id,
      clientId: params.clientId,
      waId: params.waId,
      phoneNumberId: params.phoneNumberId,
    });
  }
  if (isInboundAfterSoftDelete && existing && params.lastInboundAt) {
    const client = await prisma.client.findUnique({
      where: { id: params.clientId },
      select: { clientKey: true },
    });
    if (client?.clientKey) {
      const lastInboundAtIso = params.lastInboundAt.toISOString();
      const currentRuntime = await runtimeStorage.getConversation(params.waId, client.clientKey);
      await runtimeStorage.upsertConversation({
        ...(currentRuntime ?? {
          clientKey: client.clientKey,
          conversationKey: makeConversationKey(client.clientKey, params.waId),
          waId: params.waId,
          waIdCanonical,
          firstSeenAt: lastInboundAtIso,
          lastInboundAt: lastInboundAtIso,
          window: {
            isOpen: params.windowIsOpen,
            expiresAt: params.windowExpiresAt?.toISOString(),
          },
          intent: "unknown",
          handoff: { status: "none" },
        }),
        clientKey: client.clientKey,
        conversationKey:
          currentRuntime?.conversationKey ?? makeConversationKey(client.clientKey, params.waId),
        waId: currentRuntime?.waId ?? params.waId,
        waIdCanonical: currentRuntime?.waIdCanonical ?? waIdCanonical,
        lastInboundAt: lastInboundAtIso,
        window: {
          isOpen: params.windowIsOpen,
          expiresAt: params.windowExpiresAt?.toISOString() ?? currentRuntime?.window.expiresAt,
        },
        mode: "BOT",
        handoff: { status: "none" },
        assignedUserId: null,
        assignedTo: null,
        assignedAt: null,
        departmentId: null,
        queueId: null,
        status: null,
        closedAt: null,
        flow: undefined,
        flowStep: undefined,
        chatbotNodeId: undefined,
        chatbotActive: false,
        answers: {},
      });
    }
    await prisma.conversationRuntimeState.updateMany({
      where: {
        clientId: params.clientId,
        OR: [{ waId: params.waId }, { waIdCanonical }],
      },
      data: {
        mode: "BOT",
        handoffStatus: "NONE",
        handoffRequestedAt: null,
        handoffActivatedAt: null,
        handoffReleasedAt: null,
        assignedUserId: null,
        assignedTo: null,
        assignedAt: null,
        departmentId: null,
        queueId: null,
        status: null,
        closedAt: null,
        flow: null,
        flowStep: null,
        chatbotNodeId: null,
        chatbotActive: false,
        answers: {},
      },
    });
    const payload = {
      userId: "system",
      clientId: params.clientId,
      conversationId: existing.id,
      timestamp: new Date().toISOString(),
      action: "conversation.reactivated_after_retention",
      details: {
        reason: "inbound_after_soft_delete",
        waId: maskWaIdForLog(params.waId),
      },
    };
    try {
      await prisma.event.create({
        data: {
          clientId: params.clientId,
          conversationId: existing.id,
          waId: params.waId,
          waIdCanonical,
          requestId: `reactivation:${existing.id}:${params.lastInboundAt.toISOString()}`,
          eventName: "conversation.reactivated_after_retention",
          payloadJson: payload,
        },
      });
    } catch (error) {
      if (
        !(
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        )
      ) {
        logger.warn({
          event: "conversation.reactivated_after_retention.audit_failed",
          clientId: params.clientId,
          conversationId: existing.id,
          message: (error as Error).message,
        });
      }
    }
    logger.info({
      event: "conversation.reactivated_after_retention",
      clientId: params.clientId,
      waId: maskWaIdForLog(params.waId),
      conversationId: existing.id,
      reason: "inbound_after_soft_delete",
    });
  }
}

export async function persistOutboundMessage(params: {
  clientId: string;
  phoneNumberId?: string;
  waId: string;
  waIdCanonical?: string | null;
  messageId?: string | null;
  type: MessageType;
  status: MessageStatus;
  bodyText?: string | null;
  templateName?: string | null;
  templateLang?: string | null;
  requestId?: string;
  metaMessageId?: string | null;
  errorBody?: string | null;
  rawPayload?: Prisma.InputJsonValue;
}) {
  if (!params.clientId) return false;
  try {
    const prisma = getPrisma();
    const data = {
      clientId: params.clientId,
      phoneNumberId: params.phoneNumberId,
      waId: params.waId,
      waIdCanonical: params.waIdCanonical ?? canonicalizeBrazilWaId(params.waId),
      messageId: params.messageId ?? undefined,
      type: params.type,
      status: params.status,
      bodyText: params.bodyText ?? undefined,
      templateName: params.templateName ?? undefined,
      templateLang: params.templateLang ?? undefined,
      requestId: params.requestId,
      metaMessageId: params.metaMessageId ?? undefined,
      errorBody: params.errorBody ?? undefined,
      rawPayload: params.rawPayload,
    };
    if (params.messageId) {
      const existing = await prisma.outboundMessage.findUnique({
        where: {
          clientId_messageId: {
            clientId: params.clientId,
            messageId: params.messageId,
          },
        },
        select: { id: true },
      });
      if (existing) {
        const updated = await prisma.outboundMessage.update({
          where: {
            clientId_messageId: {
              clientId: params.clientId,
              messageId: params.messageId,
            },
          },
          data,
          select: { id: true },
        });
        if (isWhatsAppMultichannelShadowWriteEnabled()) {
          await safeApplyWhatsAppMultichannelShadow({
            prisma,
            model: "OutboundMessage",
            recordId: updated.id,
            clientId: params.clientId,
            waId: params.waId,
            phoneNumberId: params.phoneNumberId,
          });
        }
        return false;
      }
      const created = await prisma.outboundMessage.create({ data, select: { id: true } });
      if (isWhatsAppMultichannelShadowWriteEnabled()) {
        await safeApplyWhatsAppMultichannelShadow({
          prisma,
          model: "OutboundMessage",
          recordId: created.id,
          clientId: params.clientId,
          waId: params.waId,
          phoneNumberId: params.phoneNumberId,
        });
      }
      return true;
    } else {
      const created = await prisma.outboundMessage.create({ data, select: { id: true } });
      if (isWhatsAppMultichannelShadowWriteEnabled()) {
        await safeApplyWhatsAppMultichannelShadow({
          prisma,
          model: "OutboundMessage",
          recordId: created.id,
          clientId: params.clientId,
          waId: params.waId,
          phoneNumberId: params.phoneNumberId,
        });
      }
      return true;
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") return false;
    }
    throw error;
  }
}

export async function persistEvent(params: {
  clientId: string;
  conversationId?: string | null;
  waId?: string | null;
  waIdCanonical?: string | null;
  messageId?: string | null;
  requestId?: string | null;
  eventName: string;
  payloadJson: Prisma.InputJsonValue;
}) {
  if (!params.clientId) return;
  const requestId = params.requestId ?? params.messageId ?? null;
  try {
    const prisma = getPrisma();
    await prisma.event.create({
      data: {
        clientId: params.clientId,
        conversationId: params.conversationId ?? undefined,
        waId: params.waId ?? undefined,
        waIdCanonical:
          params.waIdCanonical ?? (params.waId ? canonicalizeBrazilWaId(params.waId) : undefined),
        messageId: params.messageId ?? undefined,
        requestId: requestId ?? undefined,
        eventName: params.eventName,
        payloadJson: params.payloadJson,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") return;
    }
    throw error;
  }
}
