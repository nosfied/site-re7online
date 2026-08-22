import assert from "node:assert/strict";
import test from "node:test";
import { HandoffStatus } from "@prisma/client";
import {
  claimChatbotInactivityHandoff,
  resolveInactivityHandoffDestination,
} from "./chatbotInactivityProcessor.js";

type RuntimeRow = {
  id: string;
  chatbotActive: boolean;
  mode: string;
  handoffStatus: HandoffStatus;
  assignedUserId: string | null;
  closedAt: Date | null;
  answers: Record<string, unknown>;
  handoffActivatedAt: Date | null;
  departmentId: string | null;
  queueId: string | null;
  status: string | null;
};

function deepEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function makePrisma(row: RuntimeRow) {
  return {
    conversationRuntimeState: {
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<RuntimeRow> }) => {
        const answersFilter = where.answers as { equals?: unknown } | undefined;
        const matches =
          row.id === where.id &&
          row.chatbotActive === where.chatbotActive &&
          row.mode === where.mode &&
          row.handoffStatus === where.handoffStatus &&
          row.assignedUserId === where.assignedUserId &&
          row.closedAt === where.closedAt &&
          deepEqual(row.answers, answersFilter?.equals);
        if (!matches) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
  };
}

function makeRow(overrides: Partial<RuntimeRow> = {}): RuntimeRow {
  return {
    id: "runtime-1",
    chatbotActive: true,
    mode: "BOT",
    handoffStatus: HandoffStatus.NONE,
    assignedUserId: null,
    closedAt: null,
    answers: {
      chatbotRuntime: {
        lastInteractionAt: "2026-08-15T10:00:00.000Z",
      },
    },
    handoffActivatedAt: null,
    departmentId: "department-1",
    queueId: "queue-1",
    status: null,
    ...overrides,
  };
}

test("claimChatbotInactivityHandoff skips when a new inbound changed last interaction", async () => {
  const expectedAnswers = {
    chatbotRuntime: {
      lastInteractionAt: "2026-08-15T10:00:00.000Z",
    },
  };
  const row = makeRow({
    answers: {
      chatbotRuntime: {
        lastInteractionAt: "2026-08-15T10:04:00.000Z",
      },
    },
  });

  const result = await claimChatbotInactivityHandoff({
    prisma: makePrisma(row) as never,
    runtimeStateId: row.id,
    expectedAnswers,
    nextAnswers: {
      chatbotRuntime: {
        lastInteractionAt: "2026-08-15T10:00:00.000Z",
        inactivityHandoffTriggeredAt: "2026-08-15T10:05:00.000Z",
      },
    },
    now: new Date("2026-08-15T10:05:00.000Z"),
    departmentId: "department-1",
    queueId: "queue-1",
  });

  assert.equal(result.count, 0);
  assert.equal(row.mode, "BOT");
  assert.equal(row.handoffStatus, HandoffStatus.NONE);
});

test("claimChatbotInactivityHandoff allows only one concurrent processor winner", async () => {
  const row = makeRow();
  const expectedAnswers = row.answers;
  const prisma = makePrisma(row);
  const nextAnswers = {
    chatbotRuntime: {
      lastInteractionAt: "2026-08-15T10:00:00.000Z",
      inactivityHandoffTriggeredAt: "2026-08-15T10:05:00.000Z",
    },
  };

  const first = await claimChatbotInactivityHandoff({
    prisma: prisma as never,
    runtimeStateId: row.id,
    expectedAnswers,
    nextAnswers,
    now: new Date("2026-08-15T10:05:00.000Z"),
    departmentId: "department-1",
    queueId: "queue-1",
  });
  const second = await claimChatbotInactivityHandoff({
    prisma: prisma as never,
    runtimeStateId: row.id,
    expectedAnswers,
    nextAnswers,
    now: new Date("2026-08-15T10:05:00.000Z"),
    departmentId: "department-1",
    queueId: "queue-1",
  });

  assert.equal(first.count, 1);
  assert.equal(second.count, 0);
  assert.equal(row.mode, "HUMAN");
  assert.equal(row.status, "WAITING");
  assert.equal(row.handoffStatus, HandoffStatus.ACTIVE);
});

test("claimChatbotInactivityHandoff refuses to create human handoff without department and queue", async () => {
  const row = makeRow({ departmentId: null, queueId: null });
  const expectedAnswers = row.answers;

  const result = await claimChatbotInactivityHandoff({
    prisma: makePrisma(row) as never,
    runtimeStateId: row.id,
    expectedAnswers,
    nextAnswers: {
      chatbotRuntime: {
        lastInteractionAt: "2026-08-15T10:00:00.000Z",
        inactivityHandoffTriggeredAt: "2026-08-15T10:05:00.000Z",
      },
    },
    now: new Date("2026-08-15T10:05:00.000Z"),
    departmentId: null,
    queueId: null,
  });

  assert.equal(result.count, 0);
  assert.equal(row.mode, "BOT");
  assert.equal(row.status, null);
  assert.equal(row.handoffStatus, HandoffStatus.NONE);
  assert.equal(row.departmentId, null);
  assert.equal(row.queueId, null);
});

test("resolveInactivityHandoffDestination requires both department and queue", () => {
  assert.deepEqual(
    resolveInactivityHandoffDestination({ departmentId: " department-1 ", queueId: " queue-1 " }),
    { departmentId: "department-1", queueId: "queue-1" }
  );
  assert.equal(resolveInactivityHandoffDestination({ departmentId: "department-1", queueId: null }), null);
  assert.equal(resolveInactivityHandoffDestination({ departmentId: null, queueId: "queue-1" }), null);
  assert.equal(resolveInactivityHandoffDestination({ departmentId: null, queueId: null }), null);
});

test("claimChatbotInactivityHandoff can process a due persisted row after restart once", async () => {
  const row = makeRow();
  const expectedAnswers = row.answers;
  const result = await claimChatbotInactivityHandoff({
    prisma: makePrisma(row) as never,
    runtimeStateId: row.id,
    expectedAnswers,
    nextAnswers: {
      chatbotRuntime: {
        lastInteractionAt: "2026-08-15T10:00:00.000Z",
        inactivityHandoffTriggeredAt: "2026-08-15T10:05:00.000Z",
      },
    },
    now: new Date("2026-08-15T10:05:00.000Z"),
    departmentId: "department-1",
    queueId: "queue-1",
  });

  assert.equal(result.count, 1);
  assert.equal(row.handoffActivatedAt?.toISOString(), "2026-08-15T10:05:00.000Z");
});
