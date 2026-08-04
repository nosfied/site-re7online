import test from "node:test";
import assert from "node:assert/strict";
import {
  decodePublicConversationsCursor,
  encodePublicConversationsCursor,
  getPublicConversation,
  listPublicConversations,
  normalizePublicConversationsLimit,
} from "./publicApiConversationsService.js";

const now = new Date("2026-06-20T12:00:00.000Z");

function conversation(overrides: Record<string, unknown> = {}) {
  return {
    id: "conversation_1",
    clientId: "client_a",
    departmentId: "dept_1",
    waId: "558499999999",
    waIdCanonical: "558499999999",
    channel: "whatsapp",
    windowIsOpen: true,
    firstAssignedAt: null,
    firstResponseAt: null,
    lastResponseAt: null,
    closedAt: null,
    lastInboundAt: now,
    lastOutboundAt: null,
    createdAt: now,
    updatedAt: now,
    department: { id: "dept_1", name: "Atendimento Geral", slug: "atendimento-geral" },
    metrics: {
      firstResponseTimeSec: 60,
      avgResponseTimeSec: 45,
      resolutionTimeSec: null,
      totalMessages: 5,
      totalAgentMessages: 2,
      responseCount: 2,
      startedAt: now,
      closedAt: null,
    },
    ...overrides,
  };
}

test("normalizePublicConversationsLimit clamps public limits", () => {
  assert.equal(normalizePublicConversationsLimit(null), 50);
  assert.equal(normalizePublicConversationsLimit("0"), 1);
  assert.equal(normalizePublicConversationsLimit("200"), 100);
  assert.equal(normalizePublicConversationsLimit("abc"), 50);
});

test("public conversations cursor roundtrips", () => {
  const encoded = encodePublicConversationsCursor(now, "conversation_1");
  assert.deepEqual(decodePublicConversationsCursor(encoded), { updatedAt: now, id: "conversation_1" });
  assert.equal(decodePublicConversationsCursor("invalid"), null);
});

test("listPublicConversations scopes all queries by tenant and excludes message bodies", async () => {
  const calls: Array<{ model: string; where: unknown }> = [];
  const prisma = {
    conversation: {
      findMany: async (args: { where: unknown }) => {
        calls.push({ model: "conversation", where: args.where });
        return [conversation()];
      },
    },
    conversationRuntimeState: {
      findMany: async (args: { where: unknown }) => {
        calls.push({ model: "runtime", where: args.where });
        return [
          {
            waId: "558499999999",
            waIdCanonical: "558499999999",
            channel: "whatsapp",
            assignedUserId: "user_1",
            departmentId: "dept_1",
            status: "IN_PROGRESS",
            mode: "HUMAN",
            handoffStatus: "ACTIVE",
            lastInboundAt: now,
            lastOutboundAt: null,
            closedAt: null,
          },
        ];
      },
    },
    contact: {
      findMany: async (args: { where: unknown }) => {
        calls.push({ model: "contact", where: args.where });
        return [{ id: "contact_1", waId: "558499999999" }];
      },
    },
    user: {
      findMany: async (args: { where: unknown }) => {
        calls.push({ model: "user", where: args.where });
        return [{ id: "user_1", name: "Ana" }];
      },
    },
  };

  const result = await listPublicConversations({
    prisma: prisma as never,
    clientId: "client_a",
    query: { limit: "10" },
  });

  assert.equal(result.data.length, 1);
  assert.equal(result.data[0]?.id, "conversation_1");
  assert.equal(result.data[0]?.status, "IN_PROGRESS");
  assert.equal(result.data[0]?.contactId, "contact_1");
  assert.equal(result.data[0]?.assignedUser?.name, "Ana");
  assert.equal("waId" in (result.data[0] as Record<string, unknown>), false);
  assert.equal("messages" in (result.data[0] as Record<string, unknown>), false);
  assert.equal((calls[0]?.where as { clientId?: string }).clientId, "client_a");
  assert.equal((calls[0]?.where as { deletedAt?: null }).deletedAt, null);
  assert.equal((calls[0]?.where as { anonymizedAt?: null }).anonymizedAt, null);
  assert.equal((calls[1]?.where as { clientId?: string }).clientId, "client_a");
  assert.equal((calls[2]?.where as { clientId?: string }).clientId, "client_a");
  assert.equal((calls[3]?.where as { clientId?: string }).clientId, "client_a");
});

test("getPublicConversation returns null for conversation outside tenant", async () => {
  const prisma = {
    conversation: {
      findFirst: async (args: { where: { id: string; clientId: string } }) =>
        args.where.clientId === "client_a" && args.where.id === "conversation_a"
          ? conversation({ id: "conversation_a" })
          : null,
    },
    conversationRuntimeState: {
      findMany: async () => [],
    },
    contact: {
      findMany: async () => [],
    },
    user: {
      findMany: async () => [],
    },
  };

  assert.equal(
    await getPublicConversation({
      prisma: prisma as never,
      clientId: "client_a",
      conversationId: "conversation_b",
    }),
    null
  );
  const result = await getPublicConversation({
    prisma: prisma as never,
    clientId: "client_a",
    conversationId: "conversation_a",
  });
  assert.equal(result?.id, "conversation_a");
});
