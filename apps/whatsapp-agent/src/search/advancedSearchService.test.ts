import test from "node:test";
import assert from "node:assert/strict";
import { listSearchIndexes } from "./advancedSearchService.js";

const now = new Date("2026-06-24T12:00:00.000Z");

test("listSearchIndexes scopes reads by clientId and applies safe filters", async () => {
  const calls: unknown[] = [];
  const prisma = {
    searchIndex: {
      findMany: async (args: unknown) => {
        calls.push(args);
        return [
          {
            id: "idx-1",
            entityType: "message",
            entityId: "msg-1",
            title: "Atendimento",
            body: "Texto indexado",
            channel: "whatsapp",
            source: "inbound_message",
            language: "pt-BR",
            createdAt: now,
            updatedAt: now,
          },
        ];
      },
    },
  };

  const result = await listSearchIndexes({
    prisma: prisma as never,
    clientId: "tenant-1",
    query: "texto",
    entityType: "message",
    channel: "whatsapp",
    source: "inbound_message",
    language: "pt-BR",
    limit: 25,
  });

  assert.equal(result.indexes.length, 1);
  assert.equal(result.indexes[0]?.createdAt, "2026-06-24T12:00:00.000Z");
  const where = (calls[0] as { where: Record<string, unknown> }).where;
  assert.equal(where.clientId, "tenant-1");
  assert.equal(where.entityType, "message");
  assert.equal(where.channel, "whatsapp");
  assert.equal(where.source, "inbound_message");
  assert.equal(where.language, "pt-BR");
  assert.ok(Array.isArray(where.OR));
});

test("listSearchIndexes caps limit and uses cursor without cross-tenant access", async () => {
  const calls: unknown[] = [];
  const prisma = {
    searchIndex: {
      findMany: async (args: unknown) => {
        calls.push(args);
        return [];
      },
    },
  };

  const result = await listSearchIndexes({
    prisma: prisma as never,
    clientId: "tenant-2",
    cursor: "idx-cursor",
    limit: 1000,
  });

  assert.equal(result.pageInfo.limit, 100);
  const call = calls[0] as { where: Record<string, unknown>; cursor: { id: string }; skip: number; take: number };
  assert.deepEqual(call.where, { clientId: "tenant-2" });
  assert.deepEqual(call.cursor, { id: "idx-cursor" });
  assert.equal(call.skip, 1);
  assert.equal(call.take, 101);
});
