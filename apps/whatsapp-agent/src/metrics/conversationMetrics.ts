import { Prisma, PrismaClient } from "@prisma/client";
import { logger } from "../logger/logger.js";
import { canonicalizeBrazilWaId } from "../utils/waid.js";

type DbClient = PrismaClient | Prisma.TransactionClient;

function toNonNegativeSeconds(from: Date, to: Date) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));
}

async function getSlaLimits(prisma: DbClient, clientId: string) {
  const config = await prisma.sLAConfig.findUnique({
    where: { clientId },
    select: {
      firstResponseLimitSec: true,
      resolutionTimeLimitSec: true,
    },
  });
  if (!config) return null;
  return {
    firstResponseLimitSec:
      config.firstResponseLimitSec > 0 ? config.firstResponseLimitSec : null,
    resolutionTimeLimitSec:
      config.resolutionTimeLimitSec > 0 ? config.resolutionTimeLimitSec : null,
  };
}

async function ensureConversationRecord(
  prisma: DbClient,
  params: { clientId: string; waId: string }
) {
  const existing = await prisma.conversation.findUnique({
    where: {
      clientId_waId: {
        clientId: params.clientId,
        waId: params.waId,
      },
    },
  });
  if (existing) return existing;
  return prisma.conversation.create({
    data: {
      clientId: params.clientId,
      waId: params.waId,
      waIdCanonical: canonicalizeBrazilWaId(params.waId),
    },
  });
}

export async function recordConversationInboundMetrics(params: {
  prisma: PrismaClient;
  clientId: string;
  waId: string;
  occurredAt: Date;
  wasInserted: boolean;
}) {
  if (!params.wasInserted) return;

  await params.prisma.$transaction(async (tx) => {
    const conversation = await ensureConversationRecord(tx, {
      clientId: params.clientId,
      waId: params.waId,
    });
    const existing = await tx.conversationMetrics.findUnique({
      where: { conversationId: conversation.id },
    });
    const startedAt = existing?.startedAt ?? params.occurredAt;

    if (!existing) {
      await tx.conversationMetrics.create({
        data: {
          conversationId: conversation.id,
          clientId: params.clientId,
          startedAt,
          totalMessages: 1, // inbound + outbound
        },
      });
      return;
    }

    await tx.conversationMetrics.update({
      where: { conversationId: conversation.id },
      data: {
        startedAt,
        totalMessages: {
          increment: 1,
        },
      },
    });
  });
}

export async function recordConversationAgentOutboundMetrics(params: {
  prisma: PrismaClient;
  clientId: string;
  waId: string;
  occurredAt: Date;
  wasInserted: boolean;
  assignedAt?: string | null;
  assignedUserId?: string | null;
  requestId?: string | null;
}) {
  if (!params.wasInserted) return;

  const breach = await params.prisma.$transaction<
    { conversationId: string; firstResponseTimeSec: number; limitSec: number } | null
  >(async (tx) => {
    const conversation = await ensureConversationRecord(tx, {
      clientId: params.clientId,
      waId: params.waId,
    });

    const shouldCountResponse =
      !!conversation.lastInboundAt &&
      (!conversation.lastResponseAt || conversation.lastInboundAt > conversation.lastResponseAt);
    const responseTimeSec =
      shouldCountResponse && conversation.lastInboundAt
        ? toNonNegativeSeconds(conversation.lastInboundAt, params.occurredAt)
        : null;
    const firstAssignedAt =
      !conversation.firstAssignedAt && params.assignedAt ? new Date(params.assignedAt) : null;

    await tx.conversation.update({
      where: { id: conversation.id },
      data: {
        firstResponseAt:
          !conversation.firstResponseAt && responseTimeSec !== null ? params.occurredAt : undefined,
        lastResponseAt: params.occurredAt,
        firstAssignedAt: firstAssignedAt ?? undefined,
      },
    });

    const existing = await tx.conversationMetrics.findUnique({
      where: { conversationId: conversation.id },
    });
    const startedAt = existing?.startedAt ?? conversation.lastInboundAt ?? params.occurredAt;
    const totalResponseTimeSec = (existing?.totalResponseTimeSec ?? 0) + (responseTimeSec ?? 0);
    const responseCount = (existing?.responseCount ?? 0) + (responseTimeSec !== null ? 1 : 0);
    const avgResponseTimeSec =
      responseCount > 0 ? Math.round(totalResponseTimeSec / responseCount) : null;
    const firstResponseTimeSec = existing?.firstResponseTimeSec ?? responseTimeSec ?? null;
    const persistedTotalResponseTimeSec = responseCount > 0 ? totalResponseTimeSec : null;
    const slaLimits = responseTimeSec !== null ? await getSlaLimits(tx, params.clientId) : null;
    const isFirstResponseRecorded = existing?.firstResponseTimeSec == null && responseTimeSec !== null;

    if (!existing) {
      await tx.conversationMetrics.create({
        data: {
          conversationId: conversation.id,
          clientId: params.clientId,
          startedAt,
          firstResponseTimeSec,
          totalResponseTimeSec: persistedTotalResponseTimeSec,
          responseCount,
          avgResponseTimeSec,
          totalMessages: 1, // inbound + outbound
          totalAgentMessages: 1,
        },
      });
      const shouldLogBreach =
        isFirstResponseRecorded &&
        responseTimeSec !== null &&
        slaLimits?.firstResponseLimitSec != null &&
        responseTimeSec > slaLimits.firstResponseLimitSec;
      if (!shouldLogBreach) return null;
      return {
        conversationId: conversation.id,
        firstResponseTimeSec: responseTimeSec,
        limitSec: slaLimits.firstResponseLimitSec as number,
      };
    }

    await tx.conversationMetrics.update({
      where: { conversationId: conversation.id },
      data: {
        startedAt,
        firstResponseTimeSec,
        totalResponseTimeSec: persistedTotalResponseTimeSec,
        responseCount,
        avgResponseTimeSec,
        totalMessages: {
          increment: 1,
        },
        totalAgentMessages: {
          increment: 1,
        },
      },
    });
    const shouldLogBreach =
      isFirstResponseRecorded &&
      responseTimeSec !== null &&
      slaLimits?.firstResponseLimitSec != null &&
      responseTimeSec > slaLimits.firstResponseLimitSec;
    if (!shouldLogBreach) return null;
    return {
      conversationId: conversation.id,
      firstResponseTimeSec: responseTimeSec,
      limitSec: slaLimits.firstResponseLimitSec as number,
    };
  });

  if (breach) {
    logger.warn({
      event: "sla.first_response_breached",
      clientId: params.clientId,
      conversationId: breach.conversationId,
      waId: params.waId,
      assignedUserId: params.assignedUserId ?? null,
      firstResponseTimeSec: breach.firstResponseTimeSec,
      limitSec: breach.limitSec,
      requestId: params.requestId ?? undefined,
    });
  }
}

export async function recordConversationClosedMetrics(params: {
  prisma: PrismaClient;
  clientId: string;
  waId: string;
  closedAt: Date;
  assignedUserId?: string | null;
  requestId?: string | null;
}) {
  const breach = await params.prisma.$transaction<
    { conversationId: string; resolutionTimeSec: number; limitSec: number } | null
  >(async (tx) => {
    const conversation = await ensureConversationRecord(tx, {
      clientId: params.clientId,
      waId: params.waId,
    });

    if (!conversation.closedAt || conversation.closedAt.getTime() !== params.closedAt.getTime()) {
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { closedAt: params.closedAt },
      });
    }

    const existing = await tx.conversationMetrics.findUnique({
      where: { conversationId: conversation.id },
    });
    const startedAt = existing?.startedAt ?? conversation.lastInboundAt ?? null;
    const persistedStartedAt = startedAt ?? conversation.createdAt;
    const resolutionTimeSec = startedAt ? toNonNegativeSeconds(startedAt, params.closedAt) : null;
    const slaLimits = resolutionTimeSec !== null ? await getSlaLimits(tx, params.clientId) : null;

    if (!existing) {
      await tx.conversationMetrics.create({
        data: {
          conversationId: conversation.id,
          clientId: params.clientId,
          startedAt: persistedStartedAt,
          closedAt: params.closedAt,
          resolutionTimeSec,
        },
      });
      const shouldLogBreach =
        resolutionTimeSec !== null &&
        slaLimits?.resolutionTimeLimitSec != null &&
        resolutionTimeSec > slaLimits.resolutionTimeLimitSec;
      if (!shouldLogBreach) return null;
      return {
        conversationId: conversation.id,
        resolutionTimeSec,
        limitSec: slaLimits.resolutionTimeLimitSec as number,
      };
    }

    await tx.conversationMetrics.update({
      where: { conversationId: conversation.id },
      data: {
        startedAt: persistedStartedAt,
        closedAt: params.closedAt,
        resolutionTimeSec,
      },
    });
    const shouldLogBreach =
      resolutionTimeSec !== null &&
      slaLimits?.resolutionTimeLimitSec != null &&
      resolutionTimeSec > slaLimits.resolutionTimeLimitSec;
    if (!shouldLogBreach) return null;
    return {
      conversationId: conversation.id,
      resolutionTimeSec,
      limitSec: slaLimits.resolutionTimeLimitSec as number,
    };
  });

  if (breach) {
    logger.warn({
      event: "sla.resolution_breached",
      clientId: params.clientId,
      conversationId: breach.conversationId,
      waId: params.waId,
      assignedUserId: params.assignedUserId ?? null,
      resolutionTimeSec: breach.resolutionTimeSec,
      limitSec: breach.limitSec,
      requestId: params.requestId ?? undefined,
    });
  }
}
