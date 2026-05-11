import { ConversationOperationalStatus, Prisma } from "@prisma/client";
import { normalizeWaId } from "../config/env.js";
import { getPrisma } from "../db.js";
import { logger } from "../logger/logger.js";
import { runtimeStorage } from "../storage/runtimeStorage.js";
import { canonicalizeBrazilWaId } from "../utils/waid.js";

export const IMMUTABLE_PRIVACY_AUDIT_EVENTS = [
  "conversation.deleted",
  "conversation.anonymized",
  "retention.executed",
  "conversation.reactivated_after_retention",
] as const;

export type PrivacyRetentionAction = "conversation_delete" | "conversation_anonymize" | "retention";

export type PrivacyConversationTarget = {
  id: string;
  waId: string;
  waIdCanonical: string | null;
  deletedAt?: Date | null;
  anonymizedAt?: Date | null;
};

type PrismaClientLike = ReturnType<typeof getPrisma>;

type ExecutePrivacyRetentionParams = {
  prisma: PrismaClientLike;
  clientId: string;
  clientKey: string;
  actorId: string;
  requestId: string;
  action: PrivacyRetentionAction;
  rawConversationId?: string;
  reason?: string;
  dryRun?: boolean;
};

export function normalizeRetentionDays(value: unknown) {
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > 3650) return null;
  return days;
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function maskPersonalWaId(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 8) {
    return `${digits.slice(0, 4)}******${digits.slice(-4)}`;
  }
  if (raw.length <= 4) return "******";
  return `${raw.slice(0, 2)}******${raw.slice(-2)}`;
}

function buildAnonymizedWaId(target: PrivacyConversationTarget) {
  const masked = maskPersonalWaId(target.waId);
  return masked.includes("*") ? `${masked}:${target.id.slice(0, 8)}` : `anon:${target.id.slice(0, 12)}`;
}

function buildPrivacyAuditPayload(params: {
  userId: string;
  clientId: string;
  conversationId?: string | null;
  action: string;
  details?: Record<string, unknown>;
}) {
  return {
    userId: params.userId,
    clientId: params.clientId,
    conversationId: params.conversationId ?? null,
    timestamp: new Date().toISOString(),
    action: params.action,
    ...(params.details ? { details: params.details } : {}),
  };
}

async function persistPrivacyAuditEvent(
  prisma: PrismaClientLike,
  params: {
    clientId: string;
    conversationId?: string | null;
    waId?: string | null;
    waIdCanonical?: string | null;
    requestId: string;
    eventName: "conversation.deleted" | "conversation.anonymized" | "retention.executed";
    payload: Prisma.InputJsonValue;
  }
) {
  await prisma.event.create({
    data: {
      clientId: params.clientId,
      conversationId: params.conversationId ?? null,
      waId: params.waId ?? null,
      waIdCanonical: params.waIdCanonical ?? null,
      requestId: `${params.requestId}:${params.eventName}`,
      eventName: params.eventName,
      payloadJson: params.payload,
    },
  });
}

export async function getOrCreateRetentionConfig(prisma: PrismaClientLike, clientId: string) {
  return prisma.retentionConfig.upsert({
    where: { clientId },
    update: {},
    create: { clientId, retentionDays: 90 },
  });
}

export async function findPrivacyConversationTarget(
  prisma: PrismaClientLike,
  clientId: string,
  rawConversationId: string
): Promise<PrivacyConversationTarget | null> {
  if (!rawConversationId) return null;
  const normalizedWaId = normalizeWaId(rawConversationId);
  const idLookup = isUuidLike(rawConversationId) ? [{ id: rawConversationId }] : [];
  const waIdLookup = normalizedWaId
    ? [
        { waId: normalizedWaId },
        { waIdCanonical: canonicalizeBrazilWaId(normalizedWaId) },
      ]
    : [];
  if (idLookup.length === 0 && waIdLookup.length === 0) return null;
  return prisma.conversation.findFirst({
    where: {
      clientId,
      OR: [...idLookup, ...waIdLookup],
    },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    select: { id: true, waId: true, waIdCanonical: true, deletedAt: true, anonymizedAt: true },
  });
}

function buildConversationPrivacyWhere(target: PrivacyConversationTarget) {
  const values = Array.from(new Set([target.waId, target.waIdCanonical].filter(Boolean))) as string[];
  return {
    OR: [
      { waId: { in: values } },
      { waIdCanonical: { in: values } },
    ],
  };
}

async function deleteConversationPrivacyData(
  prisma: PrismaClientLike,
  params: {
    clientId: string;
    clientKey: string;
    conversation: PrivacyConversationTarget;
    userId: string;
    requestId: string;
    audit: boolean;
    dryRun?: boolean;
  }
) {
  const target = params.conversation;
  const scopedWaWhere = buildConversationPrivacyWhere(target);
  const matchingConversations = await prisma.conversation.findMany({
    where: {
      clientId: params.clientId,
      OR: [{ id: target.id }, ...scopedWaWhere.OR],
    },
    select: { id: true, waId: true, waIdCanonical: true, deletedAt: true },
  });
  const conversationIds = matchingConversations.map((item) => item.id);
  const waIds = Array.from(
    new Set(matchingConversations.flatMap((item) => [item.waId, item.waIdCanonical].filter(Boolean) as string[]))
  );

  if (params.dryRun) {
    return {
      deleted: {
        action: "soft_delete",
        conversations: conversationIds.length,
        softDeletedConversations: conversationIds.length,
        metrics: 0,
        messages: 0,
        inboundMessages: 0,
        outboundMessages: 0,
        runtimeStates: waIds.length,
        events: 0,
        contacts: 0,
        leads: 0,
        leadNotes: 0,
      },
      dryRun: true,
    };
  }

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const conversations = await tx.conversation.updateMany({
      where: { clientId: params.clientId, id: { in: conversationIds }, deletedAt: null },
      data: {
        deletedAt: now,
        closedAt: now,
        departmentId: null,
      },
    });
    const runtimeStates = await tx.conversationRuntimeState.updateMany({
      where: { clientId: params.clientId, OR: [{ waId: { in: waIds } }, { waIdCanonical: { in: waIds } }] },
      data: {
        status: ConversationOperationalStatus.CLOSED,
        closedAt: now,
        assignedUserId: null,
        assignedTo: null,
        assignedAt: null,
        departmentId: null,
        queueId: null,
        handoffStatus: "NONE",
        handoffReleasedAt: now,
        mode: "BOT",
      },
    });
    return { conversations, runtimeStates };
  });

  for (const waId of waIds) {
    await runtimeStorage.deleteConversation(waId, params.clientKey);
  }

  if (params.audit) {
    const payload = buildPrivacyAuditPayload({
      userId: params.userId,
      clientId: params.clientId,
      conversationId: target.id,
      action: "conversation.deleted",
      details: {
        action: "soft_delete",
        softDeletedConversations: result.conversations.count,
        preservedIdentity: true,
        preservedHistory: true,
      },
    });
    await persistPrivacyAuditEvent(prisma, {
      clientId: params.clientId,
      conversationId: null,
      waId: null,
      waIdCanonical: null,
      requestId: params.requestId,
      eventName: "conversation.deleted",
      payload: payload as Prisma.InputJsonValue,
    });
    logger.info({ event: "conversation.deleted", ...payload });
  }

  return {
    deleted: {
      action: "soft_delete",
      conversations: result.conversations.count,
      softDeletedConversations: result.conversations.count,
      metrics: 0,
      messages: 0,
      inboundMessages: 0,
      outboundMessages: 0,
      runtimeStates: result.runtimeStates.count,
      events: 0,
      contacts: 0,
      leads: 0,
      leadNotes: 0,
    },
  };
}

async function anonymizeConversationPrivacyData(
  prisma: PrismaClientLike,
  params: {
    clientId: string;
    clientKey: string;
    conversation: PrivacyConversationTarget;
    userId: string;
    requestId: string;
    dryRun?: boolean;
  }
) {
  const target = params.conversation;
  const anonymizedWaId = buildAnonymizedWaId(target);
  const anonymizedName = "Usuario Anonimizado";
  const scopedWaWhere = buildConversationPrivacyWhere(target);
  const waIds = Array.from(new Set([target.waId, target.waIdCanonical].filter(Boolean))) as string[];
  const now = new Date();

  if (params.dryRun) {
    return {
      anonymized: {
        conversation: 1,
        runtimeStates: 0,
        inboundMessages: 0,
        outboundMessages: 0,
        contacts: 0,
        leads: 0,
        leadNotes: 0,
        events: 0,
      },
      waId: anonymizedWaId,
      dryRun: true,
    };
  }

  const [conversation, runtimeStates, inbound, outbound, contacts, leads, leadNotes, events] = await prisma.$transaction([
    prisma.conversation.updateMany({
      where: { clientId: params.clientId, id: target.id },
      data: {
        waId: anonymizedWaId,
        waIdCanonical: anonymizedWaId,
        anonymizedAt: now,
        deletedAt: now,
        closedAt: now,
        historyVisibleAfter: now,
        departmentId: null,
      },
    }),
    prisma.conversationRuntimeState.updateMany({
      where: { clientId: params.clientId, ...scopedWaWhere },
      data: {
        waId: anonymizedWaId,
        waIdCanonical: anonymizedWaId,
        conversationKey: `${params.clientKey}:${anonymizedWaId}`,
        answers: {},
        status: "CLOSED",
        closedAt: now,
        assignedUserId: null,
        assignedTo: null,
        assignedAt: null,
        departmentId: null,
        queueId: null,
        handoffStatus: "NONE",
        handoffReleasedAt: now,
        mode: "BOT",
      },
    }),
    prisma.inboundMessage.updateMany({
      where: { clientId: params.clientId, OR: [{ waId: { in: waIds } }, { waIdCanonical: { in: waIds } }] },
      data: {
        waId: anonymizedWaId,
        waIdCanonical: anonymizedWaId,
        bodyText: "[mensagem anonimizada]",
        rawPayload: Prisma.JsonNull,
      },
    }),
    prisma.outboundMessage.updateMany({
      where: { clientId: params.clientId, OR: [{ waId: { in: waIds } }, { waIdCanonical: { in: waIds } }] },
      data: {
        waId: anonymizedWaId,
        waIdCanonical: anonymizedWaId,
        bodyText: "[mensagem anonimizada]",
        errorBody: null,
        rawPayload: Prisma.JsonNull,
      },
    }),
    prisma.contact.updateMany({
      where: { clientId: params.clientId, waId: { in: waIds } },
      data: { waId: anonymizedWaId, name: anonymizedName },
    }),
    prisma.lead.updateMany({
      where: { tenantId: params.clientId, OR: [{ waId: { in: waIds } }, { waIdCanonical: { in: waIds } }] },
      data: {
        waId: anonymizedWaId,
        waIdCanonical: anonymizedWaId,
        name: anonymizedName,
        phone: anonymizedWaId,
        city: null,
        service: null,
        email: null,
        company: null,
      },
    }),
    prisma.leadNote.updateMany({
      where: {
        tenantId: params.clientId,
        lead: {
          OR: [{ waId: { in: waIds } }, { waIdCanonical: { in: waIds } }],
        },
      },
      data: { body: "[nota anonimizada]" },
    }),
    prisma.event.updateMany({
      where: {
        clientId: params.clientId,
        eventName: { notIn: [...IMMUTABLE_PRIVACY_AUDIT_EVENTS] },
        OR: [{ conversationId: target.id }, { waId: { in: waIds } }, { waIdCanonical: { in: waIds } }],
      },
      data: {
        waId: anonymizedWaId,
        waIdCanonical: anonymizedWaId,
      },
    }),
  ]);

  for (const waId of Array.from(new Set([...waIds, anonymizedWaId]))) {
    await runtimeStorage.deleteConversation(waId, params.clientKey);
  }

  const payload = buildPrivacyAuditPayload({
    userId: params.userId,
    clientId: params.clientId,
    conversationId: target.id,
    action: "conversation.anonymized",
    details: { anonymizedWaId: maskPersonalWaId(target.waId) },
  });
  await persistPrivacyAuditEvent(prisma, {
    clientId: params.clientId,
    conversationId: target.id,
    waId: anonymizedWaId,
    waIdCanonical: anonymizedWaId,
    requestId: params.requestId,
    eventName: "conversation.anonymized",
    payload: payload as Prisma.InputJsonValue,
  });
  logger.info({ event: "conversation.anonymized", ...payload });
  logger.info({
    event: "ai.memory.cleared",
    clientId: params.clientId,
    clientKey: params.clientKey,
    conversationId: target.id,
    runtimeStates: runtimeStates.count,
    reason: "conversation_anonymized",
  });

  return {
    anonymized: {
      conversation: conversation.count,
      runtimeStates: runtimeStates.count,
      inboundMessages: inbound.count,
      outboundMessages: outbound.count,
      contacts: contacts.count,
      leads: leads.count,
      leadNotes: leadNotes.count,
      events: events.count,
    },
    waId: anonymizedWaId,
  };
}

async function executeRetentionForClient(
  prisma: PrismaClientLike,
  params: {
    clientId: string;
    clientKey: string;
    userId: string;
    requestId: string;
    dryRun?: boolean;
  }
) {
  const retention = await getOrCreateRetentionConfig(prisma, params.clientId);
  const cutoff = new Date(Date.now() - retention.retentionDays * 24 * 60 * 60 * 1000);
  const conversations = await prisma.conversation.findMany({
    where: {
      clientId: params.clientId,
      deletedAt: null,
      createdAt: { lt: cutoff },
      updatedAt: { lt: cutoff },
      OR: [{ lastInboundAt: null }, { lastInboundAt: { lt: cutoff } }],
      AND: [{ OR: [{ lastOutboundAt: null }, { lastOutboundAt: { lt: cutoff } }] }],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, waId: true, waIdCanonical: true, deletedAt: true, anonymizedAt: true },
  });

  if (params.dryRun) {
    return {
      retentionDays: retention.retentionDays,
      cutoff: cutoff.toISOString(),
      deletedConversations: conversations.length,
      softDeletedConversations: conversations.length,
      anonymizedConversations: conversations.length,
      dryRun: true,
    };
  }

  let softDeletedConversations = 0;
  let anonymizedConversations = 0;
  for (const conversation of conversations) {
    try {
      const anonymized = await anonymizeConversationPrivacyData(prisma, {
        clientId: params.clientId,
        clientKey: params.clientKey,
        conversation,
        userId: params.userId,
        requestId: `${params.requestId}:retention:anonymize:${conversation.id}`,
      });
      anonymizedConversations += anonymized.anonymized.conversation;
      const softDeleted = await deleteConversationPrivacyData(prisma, {
        clientId: params.clientId,
        clientKey: params.clientKey,
        conversation,
        userId: params.userId,
        requestId: `${params.requestId}:retention:${conversation.id}`,
        audit: false,
      });
      softDeletedConversations += Math.max(
        softDeleted.deleted.softDeletedConversations,
        anonymized.anonymized.conversation
      );
      logger.info({
        event: "privacy.retention.item_anonymized",
        clientId: params.clientId,
        conversationId: conversation.id,
      });
    } catch (error) {
      logger.error({
        event: "privacy.retention.failed",
        clientId: params.clientId,
        conversationId: conversation.id,
        message: (error as Error).message,
      });
      throw error;
    }
  }
  const payload = buildPrivacyAuditPayload({
    userId: params.userId,
    clientId: params.clientId,
    conversationId: null,
    action: "retention.executed",
    details: {
      retentionDays: retention.retentionDays,
      cutoff: cutoff.toISOString(),
      action: "soft_delete_anonymize",
      anonymizedConversations,
      softDeletedConversations,
    },
  });
  await persistPrivacyAuditEvent(prisma, {
    clientId: params.clientId,
    requestId: params.requestId,
    eventName: "retention.executed",
    payload: payload as Prisma.InputJsonValue,
  });
  logger.info({ event: "retention.executed", ...payload });
  return {
    retentionDays: retention.retentionDays,
    cutoff: cutoff.toISOString(),
    deletedConversations: softDeletedConversations,
    softDeletedConversations,
    anonymizedConversations,
  };
}

export async function executePrivacyRetention(params: ExecutePrivacyRetentionParams) {
  logger.info({
    event: "privacy.retention.started",
    clientId: params.clientId,
    action: params.action,
    actorId: params.actorId,
    reason: params.reason ?? null,
    dryRun: params.dryRun === true,
    requestId: params.requestId,
  });

  try {
    let result: Record<string, unknown>;
    if (params.action === "retention") {
      result = await executeRetentionForClient(params.prisma, {
        clientId: params.clientId,
        clientKey: params.clientKey,
        userId: params.actorId,
        requestId: params.requestId,
        dryRun: params.dryRun,
      });
    } else {
      const target = await findPrivacyConversationTarget(params.prisma, params.clientId, params.rawConversationId ?? "");
      if (!target) {
        logger.info({
          event: "privacy.retention.skipped",
          clientId: params.clientId,
          action: params.action,
          reason: "conversation_not_found",
          requestId: params.requestId,
        });
        return { skipped: true, reason: "conversation_not_found" };
      }
      result =
        params.action === "conversation_delete"
          ? await deleteConversationPrivacyData(params.prisma, {
              clientId: params.clientId,
              clientKey: params.clientKey,
              conversation: target,
              userId: params.actorId,
              requestId: params.requestId,
              audit: true,
              dryRun: params.dryRun,
            })
          : await anonymizeConversationPrivacyData(params.prisma, {
              clientId: params.clientId,
              clientKey: params.clientKey,
              conversation: target,
              userId: params.actorId,
              requestId: params.requestId,
              dryRun: params.dryRun,
            });
    }

    logger.info({
      event: "privacy.retention.completed",
      clientId: params.clientId,
      action: params.action,
      dryRun: params.dryRun === true,
      requestId: params.requestId,
    });
    return result;
  } catch (error) {
    logger.error({
      event: "privacy.retention.failed",
      clientId: params.clientId,
      action: params.action,
      requestId: params.requestId,
      message: (error as Error).message,
    });
    throw error;
  }
}
