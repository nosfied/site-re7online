import test from "node:test";
import assert from "node:assert/strict";
import { getQueuePosition } from "./queuePosition.js";

test("getQueuePosition counts only waiting unassigned items from the same tenant queue", async () => {
  const calls: unknown[] = [];
  const prisma = {
    conversationRuntimeState: {
      findMany: async (query: unknown) => {
        calls.push(query);
        return [
          { id: "older" },
          { id: "target" },
          { id: "newer" },
        ];
      },
    },
  };

  const position = await getQueuePosition({
    prisma: prisma as never,
    clientId: "client-1",
    runtimeStateId: "target",
    queueId: "queue-1",
  });

  assert.equal(position, 2);
  assert.deepEqual(calls[0], {
    where: {
      clientId: "client-1",
      queueId: "queue-1",
      status: "WAITING",
      assignedUserId: null,
      closedAt: null,
    },
    orderBy: [
      { handoffActivatedAt: "asc" },
      { updatedAt: "asc" },
      { createdAt: "asc" },
      { id: "asc" },
    ],
    select: { id: true },
    take: 500,
  });
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
