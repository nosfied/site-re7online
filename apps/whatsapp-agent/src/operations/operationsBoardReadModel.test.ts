import assert from "node:assert/strict";
import test from "node:test";
import { ConversationOperationalStatus, type PrismaClient } from "@prisma/client";
import {
  buildOperationsBoardPayload,
  normalizeOperationsBoardLimit,
  OPERATIONS_BOARD_STATUSES,
  type OperationsBoardFilters,
} from "./operationsBoardReadModel.js";

function date(value: string) {
  return new Date(value);
}

function buildFilters(overrides?: Partial<OperationsBoardFilters>): OperationsBoardFilters {
  const columns = Object.fromEntries(
    OPERATIONS_BOARD_STATUSES.map((status) => [status, { limit: 1, cursor: null }])
  ) as OperationsBoardFilters["columns"];
  return {
    period: {
      from: date("2026-07-01T00:00:00.000Z"),
      to: date("2026-07-31T23:59:59.000Z"),
    },
    departmentId: "dep-support",
    queueId: null,
    assignedUserId: null,
    columns,
    ...overrides,
  };
}

function createFakePrisma() {
  const runtimeWhereCalls: unknown[] = [];
  const runtimeStates = [
    {
      id: "state-waiting-1",
      clientId: "client-a",
      waId: "webchat-1",
      waIdCanonical: "webchat-1",
      channel: "webchat",
      provider: "webchat",
      channelAccountId: null,
      assignedUserId: null,
      assignedAt: null,
      departmentId: "dep-support",
      queueId: "queue-support",
      status: ConversationOperationalStatus.WAITING,
      closedAt: null,
      lastInboundAt: date("2026-07-12T10:00:00.000Z"),
      lastOutboundAt: null,
      answers: { flowTags: ["suporte"], protocolContinuation: null },
      updatedAt: date("2026-07-12T10:01:00.000Z"),
    },
    {
      id: "state-waiting-2",
      clientId: "client-a",
      waId: "webchat-2",
      waIdCanonical: "webchat-2",
      channel: "webchat",
      provider: "webchat",
      channelAccountId: null,
      assignedUserId: null,
      assignedAt: null,
      departmentId: "dep-support",
      queueId: "queue-support",
      status: ConversationOperationalStatus.WAITING,
      closedAt: null,
      lastInboundAt: date("2026-07-12T09:00:00.000Z"),
      lastOutboundAt: null,
      answers: {},
      updatedAt: date("2026-07-12T09:01:00.000Z"),
    },
    {
      id: "state-progress",
      clientId: "client-a",
      waId: "webchat-3",
      waIdCanonical: "webchat-3",
      channel: "webchat",
      provider: "webchat",
      channelAccountId: null,
      assignedUserId: "user-1",
      assignedAt: date("2026-07-12T08:00:00.000Z"),
      departmentId: "dep-other",
      queueId: "queue-other",
      status: ConversationOperationalStatus.IN_PROGRESS,
      closedAt: null,
      lastInboundAt: date("2026-07-12T08:00:00.000Z"),
      lastOutboundAt: date("2026-07-12T08:15:00.000Z"),
      answers: {},
      updatedAt: date("2026-07-12T08:15:00.000Z"),
    },
    {
      id: "state-closed-current",
      clientId: "client-a",
      waId: "webchat-4",
      waIdCanonical: "webchat-4",
      channel: "webchat",
      provider: "webchat",
      channelAccountId: null,
      assignedUserId: "user-1",
      assignedAt: date("2026-07-10T08:00:00.000Z"),
      departmentId: "dep-support",
      queueId: "queue-support",
      status: ConversationOperationalStatus.CLOSED,
      closedAt: date("2026-07-10T09:00:00.000Z"),
      lastInboundAt: date("2026-07-10T08:00:00.000Z"),
      lastOutboundAt: date("2026-07-10T09:00:00.000Z"),
      answers: {
        protocolContinuation: {
          protocol: "CVT-123E4567E89B",
          originalConversationId: "123e4567-e89b-12d3-a456-426614174000",
          linkedAt: "2026-07-10T08:30:00.000Z",
          reason: "protocol_lookup",
        },
      },
      updatedAt: date("2026-07-10T09:00:00.000Z"),
    },
    {
      id: "state-closed-old",
      clientId: "client-a",
      waId: "webchat-5",
      waIdCanonical: "webchat-5",
      channel: "webchat",
      provider: "webchat",
      channelAccountId: null,
      assignedUserId: null,
      assignedAt: null,
      departmentId: "dep-support",
      queueId: "queue-support",
      status: ConversationOperationalStatus.CLOSED,
      closedAt: date("2026-06-01T09:00:00.000Z"),
      lastInboundAt: date("2026-06-01T08:00:00.000Z"),
      lastOutboundAt: date("2026-06-01T09:00:00.000Z"),
      answers: {},
      updatedAt: date("2026-06-01T09:00:00.000Z"),
    },
    {
      id: "state-other-tenant",
      clientId: "client-b",
      waId: "webchat-other",
      waIdCanonical: "webchat-other",
      channel: "webchat",
      provider: "webchat",
      channelAccountId: null,
      assignedUserId: null,
      assignedAt: null,
      departmentId: "dep-support",
      queueId: "queue-support",
      status: ConversationOperationalStatus.WAITING,
      closedAt: null,
      lastInboundAt: date("2026-07-12T10:00:00.000Z"),
      lastOutboundAt: null,
      answers: {},
      updatedAt: date("2026-07-12T10:01:00.000Z"),
    },
  ];

  const conversations = runtimeStates.map((state) => ({
    id:
      state.waId === "webchat-1"
        ? "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
        : state.waId === "webchat-4"
          ? "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"
          : `${state.id}-conversation`,
    clientId: state.clientId,
    waId: state.waId,
    waIdCanonical: state.waIdCanonical,
    channel: state.channel,
    provider: state.provider,
    departmentId: state.departmentId,
    createdAt: date("2026-07-01T00:00:00.000Z"),
    updatedAt: state.updatedAt,
    firstResponseAt: state.status === ConversationOperationalStatus.WAITING ? null : date("2026-07-12T08:05:00.000Z"),
    lastInboundAt: state.lastInboundAt,
    lastOutboundAt: state.lastOutboundAt,
    deletedAt: null,
    anonymizedAt: null,
  }));

  const prisma = {
    conversationRuntimeState: {
      async findMany(args: any) {
        runtimeWhereCalls.push(args.where);
        const where = args.where;
        return runtimeStates
          .filter((state) => state.clientId === where.clientId)
          .filter((state) => state.status === where.status)
          .filter((state) => !where.departmentId || state.departmentId === where.departmentId)
          .filter((state) => !where.queueId || state.queueId === where.queueId)
          .filter((state) => !where.assignedUserId || state.assignedUserId === where.assignedUserId)
          .filter((state) => {
            if (!where.closedAt) return true;
            return Boolean(
              state.closedAt &&
                state.closedAt >= where.closedAt.gte &&
                state.closedAt <= where.closedAt.lte
            );
          })
          .sort((left, right) => {
            const leftDate = where.status === ConversationOperationalStatus.CLOSED ? left.closedAt ?? left.updatedAt : left.updatedAt;
            const rightDate = where.status === ConversationOperationalStatus.CLOSED ? right.closedAt ?? right.updatedAt : right.updatedAt;
            return rightDate.getTime() - leftDate.getTime() || left.id.localeCompare(right.id);
          })
          .slice(0, args.take);
      },
    },
    conversation: {
      async findMany(args: any) {
        assert.equal(args.where.clientId, "client-a");
        return conversations.filter((conversation) => conversation.clientId === "client-a");
      },
    },
    lead: {
      async findMany(args: any) {
        assert.equal(args.where.tenantId, "client-a");
        return [
          {
            waId: "webchat-1",
            waIdCanonical: "webchat-1",
            name: "Cliente Suporte",
            phone: null,
            company: "Empresa A",
            status: "novo",
            updatedAt: date("2026-07-12T10:02:00.000Z"),
            createdAt: date("2026-07-12T10:00:00.000Z"),
          },
        ];
      },
    },
    inboundMessage: {
      async findMany(args: any) {
        assert.equal(args.where.clientId, "client-a");
        return [
          {
            waId: "webchat-1",
            waIdCanonical: "webchat-1",
            type: "TEXT",
            bodyText: "Preciso de suporte",
            createdAt: date("2026-07-12T10:00:00.000Z"),
          },
        ];
      },
    },
    outboundMessage: {
      async findMany(args: any) {
        assert.equal(args.where.clientId, "client-a");
        return [];
      },
    },
    department: {
      async findMany(args: any) {
        assert.equal(args.where.clientId, "client-a");
        return [{ id: "dep-support", name: "Suporte" }];
      },
    },
    queue: {
      async findMany(args: any) {
        assert.equal(args.where.clientId, "client-a");
        return [{ id: "queue-support", name: "Fila Suporte" }];
      },
    },
    user: {
      async findMany(args: any) {
        assert.equal(args.where.clientId, "client-a");
        return [{ id: "user-1", name: "Atendente" }];
      },
    },
  };
  return { prisma: prisma as unknown as PrismaClient, runtimeWhereCalls };
}

test("normalizeOperationsBoardLimit clamps per-column limits", () => {
  assert.equal(normalizeOperationsBoardLimit("0"), 1);
  assert.equal(normalizeOperationsBoardLimit("999"), 50);
  assert.equal(normalizeOperationsBoardLimit("invalid"), 20);
});

test("buildOperationsBoardPayload preserves tenant scope, department filter and closed period", async () => {
  const { prisma, runtimeWhereCalls } = createFakePrisma();
  const payload = await buildOperationsBoardPayload(prisma, {
    clientId: "client-a",
    filters: buildFilters(),
    now: date("2026-07-12T12:00:00.000Z"),
  });

  assert.equal(payload.columns.WAITING.count, 1);
  assert.equal(payload.columns.WAITING.nextCursor?.id, "state-waiting-1");
  assert.equal(payload.columns.WAITING.items[0].contactName, "Cliente Suporte");
  assert.equal(payload.columns.WAITING.items[0].company, "Empresa A");
  assert.equal(payload.columns.WAITING.items[0].departmentName, "Suporte");
  assert.equal(payload.columns.WAITING.items[0].queueName, "Fila Suporte");
  assert.equal(payload.columns.WAITING.items[0].lastMessage?.bodyText, "Preciso de suporte");
  assert.equal(payload.columns.IN_PROGRESS.count, 0);
  assert.equal(payload.columns.CLOSED.count, 1);
  assert.equal(payload.columns.CLOSED.items[0].continuation?.protocol, "CVT-123E4567E89B");
  assert.equal(payload.columns.CLOSED.items[0].assignedUserName, "Atendente");

  assert.equal(runtimeWhereCalls.length, 4);
  assert.ok(runtimeWhereCalls.every((where: any) => where.clientId === "client-a"));
  assert.ok(runtimeWhereCalls.every((where: any) => where.departmentId === "dep-support"));
  const closedWhere = runtimeWhereCalls.find((where: any) => where.status === ConversationOperationalStatus.CLOSED) as any;
  assert.deepEqual(closedWhere.closedAt, {
    gte: date("2026-07-01T00:00:00.000Z"),
    lte: date("2026-07-31T23:59:59.000Z"),
  });
});
