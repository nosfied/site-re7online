import { Prisma, MessageStatus, MessageType } from "@prisma/client";
import { getPrisma } from "../db.js";
import { logger } from "../logger/logger.js";
import { canonicalizeBrazilWaId } from "../utils/waid.js";

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
  return prisma.department.findFirst({
    where: {
      clientId,
      isActive: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
    },
  });
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
    await prisma.inboundMessage.create({
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
    });
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
}) {
  if (!params.clientId) return;
  const prisma = getPrisma();
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
    },
  });
  const resolvedDepartmentId =
    params.departmentId ??
    existing?.departmentId ??
    (await getDefaultDepartment(params.clientId, prisma))?.id ??
    null;
  await prisma.conversation.upsert({
    where: {
      clientId_waId: {
        clientId: params.clientId,
        waId: params.waId,
      },
    },
    update: {
      waIdCanonical: params.waIdCanonical ?? canonicalizeBrazilWaId(params.waId),
      phoneNumberId: params.phoneNumberId,
      windowIsOpen: params.windowIsOpen,
      windowExpiresAt: params.windowExpiresAt ?? undefined,
      lastInboundAt: params.lastInboundAt ?? undefined,
      lastOutboundAt: params.lastOutboundAt ?? undefined,
      ...(existing?.deletedAt && params.lastInboundAt
        ? {
            deletedAt: null,
            closedAt: null,
          }
        : {}),
      departmentId: existing?.departmentId ? undefined : resolvedDepartmentId ?? undefined,
    },
    create: {
      clientId: params.clientId,
      waId: params.waId,
      waIdCanonical: params.waIdCanonical ?? canonicalizeBrazilWaId(params.waId),
      phoneNumberId: params.phoneNumberId,
      windowIsOpen: params.windowIsOpen,
      windowExpiresAt: params.windowExpiresAt ?? undefined,
      lastInboundAt: params.lastInboundAt ?? undefined,
      lastOutboundAt: params.lastOutboundAt ?? undefined,
      departmentId: resolvedDepartmentId ?? undefined,
    },
  });
  if (existing?.deletedAt && params.lastInboundAt) {
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
        await prisma.outboundMessage.update({
          where: {
            clientId_messageId: {
              clientId: params.clientId,
              messageId: params.messageId,
            },
          },
          data,
        });
        return false;
      }
      await prisma.outboundMessage.create({ data });
      return true;
    } else {
      await prisma.outboundMessage.create({ data });
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
