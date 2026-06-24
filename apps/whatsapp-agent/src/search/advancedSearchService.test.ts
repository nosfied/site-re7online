import test from "node:test";
import assert from "node:assert/strict";
import {
  AdvancedSearchRuntimeDisabledError,
  listSearchIndexes,
} from "./advancedSearchService.js";

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
    runtimeEnabled: true,
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
  const or = where.OR as Array<Record<string, unknown>>;
  assert.equal(or.length, 2);
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

test("listSearchIndexes blocks text search when runtime flag is disabled", async () => {
  const prisma = {
    searchIndex: {
      findMany: async () => {
        throw new Error("should_not_query");
      },
    },
  };

  await assert.rejects(
    () =>
      listSearchIndexes({
        prisma: prisma as never,
        clientId: "tenant-1",
        runtimeEnabled: false,
        query: "protocolo",
      }),
    AdvancedSearchRuntimeDisabledError
  );
});

test("listSearchIndexes allows diagnostic listing when runtime flag is disabled", async () => {
  const prisma = {
    searchIndex: {
      findMany: async () => [],
    },
  };

  const result = await listSearchIndexes({
    prisma: prisma as never,
    clientId: "tenant-1",
    runtimeEnabled: false,
  });

  assert.equal(result.mode, "diagnostic");
  assert.equal(result.runtimeEnabled, false);
  assert.equal(result.indexes.length, 0);
});

test("listSearchIndexes returns limited snippets instead of full body", async () => {
  const longBody = `${"texto ".repeat(100)}final sensivel`;
  const prisma = {
    searchIndex: {
      findMany: async () => [
        {
          id: "idx-1",
          entityType: "message",
          entityId: "msg-1",
          title: "Atendimento",
          body: longBody,
          channel: "whatsapp",
          source: "inbound_message",
          language: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
    },
  };

  const result = await listSearchIndexes({
    prisma: prisma as never,
    clientId: "tenant-1",
    runtimeEnabled: true,
    query: "texto",
  });

  assert.equal(result.mode, "runtime");
  assert.equal(result.runtimeEnabled, true);
  assert.ok((result.indexes[0]?.body?.length ?? 0) <= 280);
  assert.equal(result.indexes[0]?.body?.endsWith("..."), true);
  assert.equal(result.indexes[0]?.snippet, result.indexes[0]?.body);
});
