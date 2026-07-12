import { ConversationOperationalStatus, type Prisma, type PrismaClient } from "@prisma/client";
import { buildConversationOperationalTimingFields } from "../inbox/conversationOperationalTiming.js";
import { buildConversationProtocol, normalizeConversationProtocol } from "../inbox/conversationProtocol.js";

export const OPERATIONS_BOARD_STATUSES = [
  ConversationOperationalStatus.WAITING,
  ConversationOperationalStatus.IN_PROGRESS,
  ConversationOperationalStatus.WAITING_USER,
  ConversationOperationalStatus.CLOSED,
] as const;

export type OperationsBoardStatus = (typeof OPERATIONS_BOARD_STATUSES)[number];

export type OperationsBoardCursor = {
  sortAt: string;
  id: string;
};

export type OperationsBoardColumnInput = {
  limit: number;
  cursor: OperationsBoardCursor | null;
};

export type OperationsBoardPeriod = {
  from: Date;
  to: Date;
};

export type OperationsBoardFilters = {
  period: OperationsBoardPeriod;
  departmentId: string | null;
  queueId: string | null;
  assignedUserId: string | null;
  columns: Record<OperationsBoardStatus, OperationsBoardColumnInput>;
};

export type OperationsBoardCard = {
  conversationId: string;
  conversationIdentity: string;
  protocol: string;
  status: OperationsBoardStatus;
  contactName: string | null;
  company: string | null;
  channel: string | null;
  lastMessage: {
    direction: "INBOUND" | "OUTBOUND";
    type: string | null;
    bodyText: string | null;
    createdAt: string;
  } | null;
  updatedAt: string;
  departmentId: string | null;
  departmentName: string | null;
  queueId: string | null;
  queueName: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  waitingFirstResponseSec: number | null;
  activeDurationSec: number | null;
  continuation: {
    protocol: string;
    originalConversationId: string;
    linkedAt: string;
    reason: "protocol_lookup";
  } | null;
  tags: string[];
};

export type OperationsBoardColumn = {
  status: OperationsBoardStatus;
  count: number;
  limit: number;
  items: OperationsBoardCard[];
  nextCursor: OperationsBoardCursor | null;
};

export type OperationsBoardPayload = {
  ok: true;
  period: {
    from: string;
    to: string;
  };
  filters: {
    departmentId: string | null;
    queueId: string | null;
    assignedUserId: string | null;
  };
  columns: Record<OperationsBoardStatus, OperationsBoardColumn>;
  generatedAt: string;
};

type RuntimeStateRecord = {
  id: string;
  clientId: string;
  waId: string;
  waIdCanonical: string | null;
  channel: string | null;
  provider: string | null;
  channelAccountId: string | null;
  assignedUserId: string | null;
  assignedAt: Date | null;
  departmentId: string | null;
  queueId: string | null;
  status: ConversationOperationalStatus | null;
  closedAt: Date | null;
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
  answers: Prisma.JsonValue;
  updatedAt: Date;
};

function getGroupKey(waId: string, waIdCanonical?: string | null) {
  return waIdCanonical || waId;
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function parseCursorDate(cursor: OperationsBoardCursor | null) {
  if (!cursor) return null;
  const date = new Date(cursor.sortAt);
  if (!Number.isFinite(date.getTime()) || !cursor.id) return null;
  return date;
}

function buildRuntimeCursorWhere(
  status: OperationsBoardStatus,
  cursor: OperationsBoardCursor | null
): Prisma.ConversationRuntimeStateWhereInput {
  const sortAt = parseCursorDate(cursor);
  if (!sortAt || !cursor) return {};
  if (status === ConversationOperationalStatus.CLOSED) {
    return {
      OR: [
        { closedAt: { lt: sortAt } },
        { closedAt: sortAt, id: { gt: cursor.id } },
      ],
    };
  }
  return {
    OR: [
      { updatedAt: { lt: sortAt } },
      { updatedAt: sortAt, id: { gt: cursor.id } },
    ],
  };
}

function buildRuntimeWhere(
  status: OperationsBoardStatus,
  params: {
    clientId: string;
    filters: OperationsBoardFilters;
  }
): Prisma.ConversationRuntimeStateWhereInput {
  return {
    clientId: params.clientId,
    status,
    ...(params.filters.departmentId ? { departmentId: params.filters.departmentId } : {}),
    ...(params.filters.queueId ? { queueId: params.filters.queueId } : {}),
    ...(params.filters.assignedUserId ? { assignedUserId: params.filters.assignedUserId } : {}),
    ...(status === ConversationOperationalStatus.CLOSED
      ? {
          closedAt: {
            gte: params.filters.period.from,
            lte: params.filters.period.to,
          },
        }
      : {}),
    ...buildRuntimeCursorWhere(status, params.filters.columns[status].cursor),
  };
}

function getStateSortAt(state: RuntimeStateRecord, status: OperationsBoardStatus) {
  return status === ConversationOperationalStatus.CLOSED
    ? state.closedAt ?? state.updatedAt
    : state.updatedAt;
}

function encodeNextCursor(state: RuntimeStateRecord, status: OperationsBoardStatus): OperationsBoardCursor {
  return {
    sortAt: getStateSortAt(state, status).toISOString(),
    id: state.id,
  };
}

function sanitizeTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function sanitizeProtocolContinuation(value: unknown): OperationsBoardCard["continuation"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const protocol = typeof source.protocol === "string" ? normalizeConversationProtocol(source.protocol) : null;
  const originalConversationId =
    typeof source.originalConversationId === "string" && /^[0-9a-f-]{36}$/i.test(source.originalConversationId)
      ? source.originalConversationId
      : null;
  const linkedAt =
    typeof source.linkedAt === "string" && Number.isFinite(new Date(source.linkedAt).getTime())
      ? source.linkedAt
      : null;
  const reason = source.reason === "protocol_lookup" ? "protocol_lookup" : null;
  if (!protocol || !originalConversationId || !linkedAt || !reason) return null;
  return { protocol, originalConversationId, linkedAt, reason };
}

function getAnswersObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function pickLatestLead<T extends { updatedAt: Date; createdAt: Date; waId: string; waIdCanonical: string | null }>(
  leads: T[]
) {
  const byKey = new Map<string, T>();
  for (const lead of leads) {
    const key = getGroupKey(lead.waId, lead.waIdCanonical);
    const current = byKey.get(key);
    if (!current || lead.updatedAt.getTime() > current.updatedAt.getTime()) {
      byKey.set(key, lead);
    }
  }
  return byKey;
}

function buildLatestMessageMaps<
  T extends { waId: string; waIdCanonical: string | null; createdAt: Date; type: string; bodyText: string | null }
>(items: T[]) {
  const byKey = new Map<string, T>();
  for (const item of items) {
    const key = getGroupKey(item.waId, item.waIdCanonical);
    const current = byKey.get(key);
    if (!current || item.createdAt.getTime() > current.createdAt.getTime()) {
      byKey.set(key, item);
    }
  }
  return byKey;
}

function chooseLastMessage(params: {
  inbound?: { type: string; bodyText: string | null; createdAt: Date } | null;
  outbound?: { type: string; bodyText: string | null; createdAt: Date } | null;
}): OperationsBoardCard["lastMessage"] {
  if (!params.inbound && !params.outbound) return null;
  if (params.inbound && (!params.outbound || params.inbound.createdAt >= params.outbound.createdAt)) {
    return {
      direction: "INBOUND",
      type: params.inbound.type,
      bodyText: params.inbound.bodyText ? params.inbound.bodyText.slice(0, 240) : null,
      createdAt: params.inbound.createdAt.toISOString(),
    };
  }
  if (!params.outbound) return null;
  return {
    direction: "OUTBOUND",
    type: params.outbound.type,
    bodyText: params.outbound.bodyText ? params.outbound.bodyText.slice(0, 240) : null,
    createdAt: params.outbound.createdAt.toISOString(),
  };
}

export function defaultOperationsBoardPeriod(now = new Date()): OperationsBoardPeriod {
  const to = new Date(now);
  const from = new Date(to);
  from.setDate(from.getDate() - 30);
  return { from, to };
}

export function normalizeOperationsBoardLimit(value: unknown) {
  const parsed = Number(value ?? 20);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.floor(parsed), 1), 50) : 20;
}

export async function buildOperationsBoardPayload(
  prisma: PrismaClient,
  params: {
    clientId: string;
    filters: OperationsBoardFilters;
    now?: Date;
  }
): Promise<OperationsBoardPayload> {
  const statesByStatusEntries = await Promise.all(
    OPERATIONS_BOARD_STATUSES.map(async (status) => {
      const column = params.filters.columns[status];
      const states = await prisma.conversationRuntimeState.findMany({
        where: buildRuntimeWhere(status, { clientId: params.clientId, filters: params.filters }),
        orderBy:
          status === ConversationOperationalStatus.CLOSED
            ? [{ closedAt: "desc" }, { id: "asc" }]
            : [{ updatedAt: "desc" }, { id: "asc" }],
        take: column.limit + 1,
        select: {
          id: true,
          clientId: true,
          waId: true,
          waIdCanonical: true,
          channel: true,
          provider: true,
          channelAccountId: true,
          assignedUserId: true,
          assignedAt: true,
          departmentId: true,
          queueId: true,
          status: true,
          closedAt: true,
          lastInboundAt: true,
          lastOutboundAt: true,
          answers: true,
          updatedAt: true,
        },
      });
      return [status, states] as const;
    })
  );
  const statesByStatus = new Map<OperationsBoardStatus, RuntimeStateRecord[]>(statesByStatusEntries);
  const allStates = statesByStatusEntries.flatMap(([status, states]) =>
    states.slice(0, params.filters.columns[status].limit)
  );
  if (allStates.length === 0) {
    const emptyColumns = {} as Record<OperationsBoardStatus, OperationsBoardColumn>;
    for (const status of OPERATIONS_BOARD_STATUSES) {
      emptyColumns[status] = {
        status,
        count: 0,
        limit: params.filters.columns[status].limit,
        items: [],
        nextCursor: null,
      };
    }
    return {
      ok: true,
      period: {
        from: params.filters.period.from.toISOString(),
        to: params.filters.period.to.toISOString(),
      },
      filters: {
        departmentId: params.filters.departmentId,
        queueId: params.filters.queueId,
        assignedUserId: params.filters.assignedUserId,
      },
      columns: emptyColumns,
      generatedAt: (params.now ?? new Date()).toISOString(),
    };
  }

  const waIds = Array.from(new Set(allStates.map((item) => item.waId)));
  const canonicalWaIds = Array.from(new Set(allStates.map((item) => item.waIdCanonical ?? item.waId)));
  const identityWhere = { OR: [{ waId: { in: waIds } }, { waIdCanonical: { in: canonicalWaIds } }] };
  const [conversations, leads, inbound, outbound] = await Promise.all([
    prisma.conversation.findMany({
      where: {
        clientId: params.clientId,
        deletedAt: null,
        anonymizedAt: null,
        ...identityWhere,
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        waId: true,
        waIdCanonical: true,
        channel: true,
        provider: true,
        departmentId: true,
        createdAt: true,
        updatedAt: true,
        firstResponseAt: true,
        lastInboundAt: true,
        lastOutboundAt: true,
      },
    }),
    prisma.lead.findMany({
      where: {
        tenantId: params.clientId,
        OR: [{ waId: { in: waIds } }, { waIdCanonical: { in: canonicalWaIds } }],
      },
      select: {
        waId: true,
        waIdCanonical: true,
        name: true,
        phone: true,
        company: true,
        status: true,
        updatedAt: true,
        createdAt: true,
      },
    }),
    prisma.inboundMessage.findMany({
      where: {
        clientId: params.clientId,
        OR: [{ waId: { in: waIds } }, { waIdCanonical: { in: canonicalWaIds } }],
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(allStates.length * 4, 800),
      select: {
        waId: true,
        waIdCanonical: true,
        type: true,
        bodyText: true,
        createdAt: true,
      },
    }),
    prisma.outboundMessage.findMany({
      where: {
        clientId: params.clientId,
        OR: [{ waId: { in: waIds } }, { waIdCanonical: { in: canonicalWaIds } }],
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(allStates.length * 4, 800),
      select: {
        waId: true,
        waIdCanonical: true,
        type: true,
        bodyText: true,
        createdAt: true,
      },
    }),
  ]);

  const conversationByKey = new Map<string, (typeof conversations)[number]>();
  for (const conversation of conversations) {
    const key = getGroupKey(conversation.waId, conversation.waIdCanonical);
    if (!conversationByKey.has(key)) {
      conversationByKey.set(key, conversation);
    }
  }
  const leadByKey = pickLatestLead(leads);
  const inboundByKey = buildLatestMessageMaps(inbound);
  const outboundByKey = buildLatestMessageMaps(outbound);

  const departmentIds = Array.from(
    new Set(allStates.map((item) => item.departmentId).filter((value): value is string => Boolean(value)))
  );
  const queueIds = Array.from(
    new Set(allStates.map((item) => item.queueId).filter((value): value is string => Boolean(value)))
  );
  const assignedUserIds = Array.from(
    new Set(allStates.map((item) => item.assignedUserId).filter((value): value is string => Boolean(value)))
  );
  const [departments, queues, users] = await Promise.all([
    departmentIds.length
      ? prisma.department.findMany({
          where: { clientId: params.clientId, id: { in: departmentIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    queueIds.length
      ? prisma.queue.findMany({
          where: { clientId: params.clientId, id: { in: queueIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    assignedUserIds.length
      ? prisma.user.findMany({
          where: { clientId: params.clientId, id: { in: assignedUserIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  const departmentNameById = new Map(departments.map((item) => [item.id, item.name]));
  const queueNameById = new Map(queues.map((item) => [item.id, item.name]));
  const userNameById = new Map(users.map((item) => [item.id, item.name]));

  const columns = Object.fromEntries(
    OPERATIONS_BOARD_STATUSES.map((status) => {
      const column = params.filters.columns[status];
      const rawStates = statesByStatus.get(status) ?? [];
      const visibleStates = rawStates.slice(0, column.limit);
      const items = visibleStates
        .map((state): OperationsBoardCard | null => {
          const key = getGroupKey(state.waId, state.waIdCanonical);
          const conversation = conversationByKey.get(key);
          if (!conversation) return null;
          const lead = leadByKey.get(key);
          const answers = getAnswersObject(state.answers);
          const tags = sanitizeTags(answers.flowTags);
          return {
            conversationId: conversation.id,
            conversationIdentity: key,
            protocol: buildConversationProtocol(conversation),
            status,
            contactName: lead?.name ?? lead?.phone ?? null,
            company: lead?.company ?? null,
            channel: state.channel ?? conversation.channel ?? null,
            lastMessage: chooseLastMessage({
              inbound: inboundByKey.get(key),
              outbound: outboundByKey.get(key),
            }),
            updatedAt: toIso(state.updatedAt) ?? conversation.updatedAt.toISOString(),
            departmentId: state.departmentId ?? conversation.departmentId ?? null,
            departmentName: state.departmentId ? departmentNameById.get(state.departmentId) ?? null : null,
            queueId: state.queueId ?? null,
            queueName: state.queueId ? queueNameById.get(state.queueId) ?? null : null,
            assignedUserId: state.assignedUserId ?? null,
            assignedUserName: state.assignedUserId ? userNameById.get(state.assignedUserId) ?? null : null,
            ...buildConversationOperationalTimingFields({
              source: conversation,
              operational: {
                assignedAt: toIso(state.assignedAt),
                closedAt: toIso(state.closedAt),
                status,
              },
              now: params.now ?? new Date(),
            }),
            continuation: sanitizeProtocolContinuation(answers.protocolContinuation),
            tags,
          };
        })
        .filter((item): item is OperationsBoardCard => Boolean(item));
      return [
        status,
        {
          status,
          count: items.length,
          limit: column.limit,
          items,
          nextCursor:
            rawStates.length > column.limit && visibleStates.length > 0
              ? encodeNextCursor(visibleStates[visibleStates.length - 1], status)
              : null,
        },
      ];
    })
  ) as Record<OperationsBoardStatus, OperationsBoardColumn>;

  return {
    ok: true,
    period: {
      from: params.filters.period.from.toISOString(),
      to: params.filters.period.to.toISOString(),
    },
    filters: {
      departmentId: params.filters.departmentId,
      queueId: params.filters.queueId,
      assignedUserId: params.filters.assignedUserId,
    },
    columns,
    generatedAt: (params.now ?? new Date()).toISOString(),
  };
}
