import test from "node:test";
import assert from "node:assert/strict";
import { indexAudioTranscriptionsForSearch } from "./searchAudioTranscriptionIndexer.js";

const now = new Date("2026-06-24T15:00:00.000Z");

function makeClient(features: Record<string, boolean>) {
  return {
    id: "tenant-1",
    clientKey: "demo-prefeitura",
    profile: "government",
    status: "ACTIVE",
    features,
  };
}

function makePrisma(params: {
  features?: Record<string, boolean>;
  existing?: boolean;
  status?: string;
  transcript?: string | null;
}) {
  const state = {
    createdIndexes: [] as unknown[],
    events: [] as unknown[],
    findManyArgs: [] as unknown[],
  };
  const client = makeClient(
    params.features ?? {
      advancedSearch: true,
      advancedSearchRuntime: true,
      audioTranscription: true,
    }
  );
  const prisma = {
    client: {
      findUnique: async () => client,
    },
    audioTranscription: {
      findMany: async (args: unknown) => {
        state.findManyArgs.push(args);
        return [
          {
            id: "transcription-1",
            messageId: "wamid-audio-1",
            conversationId: "conversation-1",
            channel: "whatsapp",
            language: "pt-BR",
            transcript: params.transcript !== undefined ? params.transcript : "Transcricao concluida",
            confidence: 0.91,
            provider: "openai",
            status: params.status ?? "completed",
            createdAt: now,
            updatedAt: now,
          },
        ];
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

test("search audio blocks when advanced search feature is disabled", async () => {
  const { prisma, state } = makePrisma({
    features: { advancedSearch: false, advancedSearchRuntime: true, audioTranscription: true },
  });

  const report = await indexAudioTranscriptionsForSearch({
    prisma,
    tenant: "demo-prefeitura",
    record: true,
  });

  assert.equal(report.scanned, 0);
  assert.equal(report.skippedItems[0]?.reason, "tenant_feature_disabled");
  assert.equal(state.createdIndexes.length, 0);
});

test("search audio blocks when search runtime is disabled", async () => {
  const { prisma, state } = makePrisma({
    features: { advancedSearch: true, advancedSearchRuntime: false, audioTranscription: true },
  });

  const report = await indexAudioTranscriptionsForSearch({
    prisma,
    tenant: "demo-prefeitura",
    record: true,
  });

  assert.equal(report.scanned, 0);
  assert.equal(report.skippedItems[0]?.reason, "advanced_search_runtime_disabled");
  assert.equal(state.createdIndexes.length, 0);
});

test("search audio blocks when audio transcription feature is disabled", async () => {
  const { prisma, state } = makePrisma({
    features: { advancedSearch: true, advancedSearchRuntime: true, audioTranscription: false },
  });

  const report = await indexAudioTranscriptionsForSearch({
    prisma,
    tenant: "demo-prefeitura",
    record: true,
  });

  assert.equal(report.skippedItems[0]?.reason, "audio_transcription_feature_disabled");
  assert.equal(state.createdIndexes.length, 0);
});

test("search audio dry-run reports completed transcript without creating SearchIndex", async () => {
  const { prisma, state } = makePrisma({});

  const report = await indexAudioTranscriptionsForSearch({
    prisma,
    tenant: "demo-prefeitura",
  });

  assert.equal(report.dryRun, true);
  assert.equal(report.scanned, 1);
  assert.equal(report.eligible, 1);
  assert.equal(report.recordsCreated, 0);
  assert.equal(state.createdIndexes.length, 0);
  assert.equal(report.candidates[0]?.entityType, "audio_transcription");
  assert.equal(report.candidates[0]?.source, "audio_transcription");
  assert.equal(report.candidates[0]?.body, "Transcricao concluida");
});

test("search audio record creates SearchIndex for completed transcript", async () => {
  const { prisma, state } = makePrisma({});

  const report = await indexAudioTranscriptionsForSearch({
    prisma,
    tenant: "demo-prefeitura",
    record: true,
  });

  assert.equal(report.recordsCreated, 1);
  const data = (state.createdIndexes[0] as { data: Record<string, unknown> }).data;
  assert.equal(data.clientId, "tenant-1");
  assert.equal(data.entityType, "audio_transcription");
  assert.equal(data.entityId, "transcription-1");
  assert.equal(data.source, "audio_transcription");
  assert.equal(data.channel, "whatsapp");
  assert.equal(data.language, "pt-BR");
  assert.equal(data.body, "Transcricao concluida");
  assert.equal(state.events.length, 2);
});

test("search audio skips non-completed transcripts", async () => {
  const { prisma, state } = makePrisma({ status: "failed" });

  const report = await indexAudioTranscriptionsForSearch({
    prisma,
    tenant: "demo-prefeitura",
    record: true,
  });

  assert.equal(report.eligible, 0);
  assert.equal(report.skippedItems[0]?.reason, "not_completed");
  assert.equal(state.createdIndexes.length, 0);
});

test("search audio skips empty transcript", async () => {
  const { prisma, state } = makePrisma({ transcript: null });

  const report = await indexAudioTranscriptionsForSearch({
    prisma,
    tenant: "demo-prefeitura",
    record: true,
  });

  assert.equal(report.eligible, 0);
  assert.equal(report.skippedItems[0]?.reason, "empty_transcript");
  assert.equal(state.createdIndexes.length, 0);
});

test("search audio record is idempotent when SearchIndex already exists", async () => {
  const { prisma, state } = makePrisma({ existing: true });

  const report = await indexAudioTranscriptionsForSearch({
    prisma,
    tenant: "demo-prefeitura",
    record: true,
  });

  assert.equal(report.recordsCreated, 0);
  assert.equal(report.skippedItems[0]?.reason, "existing_index");
  assert.equal(state.createdIndexes.length, 0);
});

test("search audio applies tenant and transcription filters", async () => {
  const { prisma, state } = makePrisma({});

  await indexAudioTranscriptionsForSearch({
    prisma,
    tenant: "demo-prefeitura",
    transcriptionId: "transcription-1",
    limit: 25,
  });

  const call = state.findManyArgs[0] as { where: Record<string, unknown>; take: number };
  assert.equal(call.where.clientId, "tenant-1");
  assert.equal(call.where.id, "transcription-1");
  assert.equal(call.take, 25);
});
