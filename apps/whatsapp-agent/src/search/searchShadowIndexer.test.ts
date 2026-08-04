import test from "node:test";
import assert from "node:assert/strict";
import { MessageType } from "@prisma/client";
import { runSearchShadowIndexer } from "./searchShadowIndexer.js";

const now = new Date("2026-06-24T14:00:00.000Z");

function makeClient(features: Record<string, boolean>) {
  return {
    id: "tenant-1",
    clientKey: "demo-prefeitura",
    profile: "government",
    features,
  };
}

function makePrisma(params: {
  features?: Record<string, boolean>;
  existing?: boolean;
  inboundBody?: string | null;
  conversationRows?: unknown[];
  outboundRows?: unknown[];
}) {
  const state = {
    createdIndexes: [] as unknown[],
    events: [] as unknown[],
    findManyCalls: [] as string[],
    conversationFindManyArgs: null as unknown,
  };
  const client = makeClient(params.features ?? { advancedSearch: true, advancedSearchRuntime: false });
  const prisma = {
    client: {
      findUnique: async () => client,
    },
    conversation: {
      findMany: async (args: unknown) => {
        state.findManyCalls.push("conversation");
        state.conversationFindManyArgs = args;
        return params.conversationRows ?? [];
      },
    },
    inboundMessage: {
      findMany: async () => {
        state.findManyCalls.push("inbound_message");
        return [
          {
            id: "inbound-1",
            messageId: "wamid-1",
            type: MessageType.TEXT,
            bodyText: params.inboundBody !== undefined ? params.inboundBody : "Preciso de segunda via",
            channel: "whatsapp",
            createdAt: now,
          },
        ];
      },
    },
    outboundMessage: {
      findMany: async () => {
        state.findManyCalls.push("outbound_message");
        return params.outboundRows ?? [];
      },
    },
    searchIndex: {
      findUnique: async () => (params.existing ? { id: "idx-existing" } : null),
      create: async (args: unknown) => {
        state.createdIndexes.push(args);
        return { id: "idx-1" };
      },
    },
    event: {
      create: async (args: unknown) => {
        state.events.push(args);
        return { id: "event-1" };
      },
    },
  };
  return { prisma: prisma as never, state };
}

test("search shadow blocks disabled feature without scanning or persisting", async () => {
  const { prisma, state } = makePrisma({ features: { advancedSearch: false, advancedSearchRuntime: false } });

  const report = await runSearchShadowIndexer({
    prisma,
    tenant: "demo-prefeitura",
    source: "inbound_message",
    record: true,
  });

  assert.equal(report.scanned, 0);
  assert.equal(report.skippedItems[0]?.reason, "tenant_feature_disabled");
  assert.equal(state.findManyCalls.length, 0);
  assert.equal(state.createdIndexes.length, 0);
});

test("search shadow blocks when runtime flag is enabled", async () => {
  const { prisma, state } = makePrisma({ features: { advancedSearch: true, advancedSearchRuntime: true } });

  const report = await runSearchShadowIndexer({
    prisma,
    tenant: "demo-prefeitura",
    source: "inbound_message",
    record: true,
  });

  assert.equal(report.skippedItems[0]?.reason, "runtime_enabled");
  assert.equal(state.findManyCalls.length, 0);
  assert.equal(state.createdIndexes.length, 0);
});

test("search shadow dry-run reports candidates without creating SearchIndex", async () => {
  const { prisma, state } = makePrisma({});

  const report = await runSearchShadowIndexer({
    prisma,
    tenant: "demo-prefeitura",
    source: "inbound_message",
  });

  assert.equal(report.dryRun, true);
  assert.equal(report.scanned, 1);
  assert.equal(report.eligible, 1);
  assert.equal(report.recordsCreated, 0);
  assert.equal(state.createdIndexes.length, 0);
  assert.equal(report.candidates[0]?.body, "Preciso de segunda via");
  assert.equal(report.candidates[0]?.source, "inbound_message");
});

test("search shadow record persists tenant-scoped SearchIndex", async () => {
  const { prisma, state } = makePrisma({});

  const report = await runSearchShadowIndexer({
    prisma,
    tenant: "demo-prefeitura",
    source: "inbound_message",
    record: true,
  });

  assert.equal(report.recorded, true);
  assert.equal(report.recordsCreated, 1);
  assert.equal(state.createdIndexes.length, 1);
  const data = (state.createdIndexes[0] as { data: Record<string, unknown> }).data;
  assert.equal(data.clientId, "tenant-1");
  assert.equal(data.entityType, "message");
  assert.equal(data.entityId, "inbound-1");
  assert.equal(data.source, "inbound_message");
  assert.equal(data.body, "Preciso de segunda via");
  assert.equal(state.events.length, 2);
});

test("search shadow record is idempotent when SearchIndex already exists", async () => {
  const { prisma, state } = makePrisma({ existing: true });

  const report = await runSearchShadowIndexer({
    prisma,
    tenant: "demo-prefeitura",
    source: "inbound_message",
    record: true,
  });

  assert.equal(report.recordsCreated, 0);
  assert.equal(report.skippedItems[0]?.reason, "existing_index");
  assert.equal(state.createdIndexes.length, 0);
});

test("search shadow skips empty message content", async () => {
  const { prisma, state } = makePrisma({ inboundBody: null });

  const report = await runSearchShadowIndexer({
    prisma,
    tenant: "demo-prefeitura",
    source: "inbound_message",
    record: true,
  });

  assert.equal(report.eligible, 0);
  assert.equal(report.skippedItems[0]?.reason, "empty_index_content");
  assert.equal(state.createdIndexes.length, 0);
});

test("search shadow conversation source excludes anonymized conversations explicitly", async () => {
  const { prisma, state } = makePrisma({ conversationRows: [] });

  await runSearchShadowIndexer({
    prisma,
    tenant: "demo-prefeitura",
    source: "conversation",
  });

  const where = (state.conversationFindManyArgs as { where: Record<string, unknown> }).where;
  assert.equal(where.clientId, "tenant-1");
  assert.equal(where.deletedAt, null);
  assert.equal(where.anonymizedAt, null);
});
