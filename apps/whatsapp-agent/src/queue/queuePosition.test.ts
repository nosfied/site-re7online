import test from "node:test";
import assert from "node:assert/strict";
import {
  compareCanonicalQueueItems,
  getCanonicalQueueOrderBy,
  getQueuePosition,
} from "./queuePosition.js";

type QueueRow = {
  id: string;
  clientId: string;
  queueId: string;
  status: string;
  assignedUserId: string | null;
  closedAt: Date | null;
  handoffActivatedAt: Date | null;
  createdAt: Date;
};

function makePrisma(rows: QueueRow[]) {
  return {
    conversationRuntimeState: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        rows
          .filter((row) => row.clientId === where.clientId)
          .filter((row) => row.queueId === where.queueId)
          .filter((row) => row.status === where.status)
          .filter((row) => row.assignedUserId === where.assignedUserId)
          .filter((row) => row.closedAt === where.closedAt)
          .sort(compareCanonicalQueueItems)
          .map((row) => ({ id: row.id })),
    },
  };
}

const baseRows: QueueRow[] = [
  {
    id: "a",
    clientId: "client-1",
    queueId: "queue-1",
    status: "WAITING",
    assignedUserId: null,
    closedAt: null,
    handoffActivatedAt: new Date("2026-08-15T10:00:00.000Z"),
    createdAt: new Date("2026-08-15T09:59:00.000Z"),
  },
  {
    id: "b",
    clientId: "client-1",
    queueId: "queue-1",
    status: "WAITING",
    assignedUserId: null,
    closedAt: null,
    handoffActivatedAt: new Date("2026-08-15T10:01:00.000Z"),
    createdAt: new Date("2026-08-15T09:59:10.000Z"),
  },
  {
    id: "c",
    clientId: "client-1",
    queueId: "queue-1",
    status: "WAITING",
    assignedUserId: null,
    closedAt: null,
    handoffActivatedAt: new Date("2026-08-15T10:02:00.000Z"),
    createdAt: new Date("2026-08-15T09:59:20.000Z"),
  },
];

test("getQueuePosition uses the canonical FIFO order", async () => {
  const prisma = makePrisma([...baseRows].reverse());

  assert.equal(await getQueuePosition({ prisma: prisma as never, clientId: "client-1", runtimeStateId: "a", queueId: "queue-1" }), 1);
  assert.equal(await getQueuePosition({ prisma: prisma as never, clientId: "client-1", runtimeStateId: "b", queueId: "queue-1" }), 2);
  assert.equal(await getQueuePosition({ prisma: prisma as never, clientId: "client-1", runtimeStateId: "c", queueId: "queue-1" }), 3);
});

test("getQueuePosition scopes tenant and queue independently", async () => {
  const prisma = makePrisma([
    {
      ...baseRows[0],
      id: "other-tenant",
      clientId: "client-2",
      handoffActivatedAt: new Date("2026-08-15T09:00:00.000Z"),
    },
    {
      ...baseRows[0],
      id: "other-queue",
      queueId: "queue-2",
      handoffActivatedAt: new Date("2026-08-15T09:00:00.000Z"),
    },
    ...baseRows,
  ]);

  assert.equal(await getQueuePosition({ prisma: prisma as never, clientId: "client-1", runtimeStateId: "a", queueId: "queue-1" }), 1);
});

test("getQueuePosition recalculates after claim removes an item from waiting", async () => {
  const prisma = makePrisma([
    { ...baseRows[0], status: "IN_PROGRESS", assignedUserId: "agent-1" },
    baseRows[1],
    baseRows[2],
  ]);

  assert.equal(await getQueuePosition({ prisma: prisma as never, clientId: "client-1", runtimeStateId: "b", queueId: "queue-1" }), 1);
  assert.equal(await getQueuePosition({ prisma: prisma as never, clientId: "client-1", runtimeStateId: "c", queueId: "queue-1" }), 2);
});

test("getQueuePosition recalculates independently after transfer to another queue", async () => {
  const prisma = makePrisma([
    baseRows[0],
    { ...baseRows[1], queueId: "queue-2", handoffActivatedAt: new Date("2026-08-15T11:00:00.000Z") },
    { ...baseRows[2], queueId: "queue-2", handoffActivatedAt: new Date("2026-08-15T10:30:00.000Z") },
  ]);

  assert.equal(await getQueuePosition({ prisma: prisma as never, clientId: "client-1", runtimeStateId: "a", queueId: "queue-1" }), 1);
  assert.equal(await getQueuePosition({ prisma: prisma as never, clientId: "client-1", runtimeStateId: "c", queueId: "queue-2" }), 1);
  assert.equal(await getQueuePosition({ prisma: prisma as never, clientId: "client-1", runtimeStateId: "b", queueId: "queue-2" }), 2);
});

test("canonical queue order is deterministic for equal timestamps", () => {
  assert.deepEqual(getCanonicalQueueOrderBy(), [
    { handoffActivatedAt: "asc" },
    { createdAt: "asc" },
    { id: "asc" },
  ]);

  const rows = [
    { id: "b", handoffActivatedAt: new Date("2026-08-15T10:00:00.000Z"), createdAt: new Date("2026-08-15T09:00:00.000Z") },
    { id: "a", handoffActivatedAt: new Date("2026-08-15T10:00:00.000Z"), createdAt: new Date("2026-08-15T09:00:00.000Z") },
  ].sort(compareCanonicalQueueItems);

  assert.deepEqual(rows.map((row) => row.id), ["a", "b"]);
});

test("getQueuePosition returns null without queue", async () => {
  const position = await getQueuePosition({
    prisma: {} as never,
    clientId: "client-1",
    runtimeStateId: "target",
    queueId: null,
  });

  assert.equal(position, null);
});
