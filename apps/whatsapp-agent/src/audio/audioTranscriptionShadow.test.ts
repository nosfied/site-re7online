import test from "node:test";
import assert from "node:assert/strict";
import { MessageType } from "@prisma/client";
import { findAudioTranscriptionShadowCandidates } from "./audioTranscriptionShadow.js";

const now = new Date("2026-06-23T12:00:00.000Z");

function makeClient(features: Record<string, boolean> = { audioTranscription: true }) {
  return {
    id: "tenant-1",
    clientKey: "demo-prefeitura",
    profile: "government",
    status: "ACTIVE",
    features,
  };
}

function makeAudioMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: "inbound-1",
    clientId: "tenant-1",
    phoneNumberId: "phone-1",
    waId: "wa-1",
    messageId: "message-1",
    channel: "whatsapp",
    provider: "whatsapp_cloud",
    channelAccountId: "account-1",
    externalMessageId: "external-1",
    type: MessageType.AUDIO,
    rawPayload: { audio: { id: "media-1", mime_type: "audio/ogg", sha256: "sha" } },
    createdAt: now,
    ...overrides,
  };
}

function makePrisma(options: {
  client?: Record<string, unknown> | null;
  messages?: Array<Record<string, unknown>>;
  existing?: boolean;
} = {}) {
  const writes: { transcriptions: unknown[]; jobs: unknown[]; events: unknown[]; messageWhere: unknown[] } = {
    transcriptions: [],
    jobs: [],
    events: [],
    messageWhere: [],
  };
  const client = options.client === undefined ? makeClient() : options.client;
  const messages = options.messages ?? [makeAudioMessage()];
  const prisma = {
    client: {
      findUnique: async () => client,
    },
    inboundMessage: {
      findMany: async (args: { where: unknown }) => {
        writes.messageWhere.push(args.where);
        return messages;
      },
    },
    audioTranscription: {
      findFirst: async () => (options.existing ? { id: "transcription-existing" } : null),
      create: async (args: { data: Record<string, unknown> }) => {
        writes.transcriptions.push(args.data);
        return { id: "transcription-1", ...args.data };
      },
    },
    audioTranscriptionJob: {
      create: async (args: { data: Record<string, unknown> }) => {
        writes.jobs.push(args.data);
        return { id: "job-1", ...args.data };
      },
    },
    event: {
      create: async (args: { data: Record<string, unknown> }) => {
        writes.events.push(args.data);
        return { id: `event-${writes.events.length}`, ...args.data };
      },
    },
  };
  return { prisma: prisma as never, writes };
}

test("dry-run finds eligible audio without persisting records", async () => {
  const { prisma, writes } = makePrisma();
  const report = await findAudioTranscriptionShadowCandidates({
    prisma,
    tenant: "demo-prefeitura",
    runId: "run-1",
  });

  assert.equal(report.ok, true);
  assert.equal(report.dryRun, true);
  assert.equal(report.eligible, 1);
  assert.equal(report.recordsCreated, 0);
  assert.equal(writes.transcriptions.length, 0);
  assert.equal(writes.jobs.length, 0);
  assert.equal(writes.events.length, 0);
  assert.equal(report.candidates[0]?.channelAccountIdHash?.length, 16);
});

test("record creates shadow transcription and skipped job without transcript", async () => {
  const { prisma, writes } = makePrisma();
  const report = await findAudioTranscriptionShadowCandidates({
    prisma,
    tenant: "demo-prefeitura",
    record: true,
    runId: "run-1",
  });

  assert.equal(report.recorded, true);
  assert.equal(report.recordsCreated, 1);
  assert.equal(writes.transcriptions.length, 1);
  assert.equal(writes.jobs.length, 1);
  assert.equal((writes.transcriptions[0] as { status: string; provider: string; transcript: string | null }).status, "shadow");
  assert.equal((writes.transcriptions[0] as { status: string; provider: string; transcript: string | null }).provider, "shadow");
  assert.equal((writes.transcriptions[0] as { status: string; provider: string; transcript: string | null }).transcript, null);
  assert.equal((writes.jobs[0] as { status: string; provider: string }).status, "skipped");
  assert.equal((writes.jobs[0] as { status: string; provider: string }).provider, "shadow");
  assert.ok(writes.events.length >= 3);
});

test("feature disabled blocks candidates", async () => {
  const { prisma } = makePrisma({ client: makeClient({ audioTranscription: false }) });
  const report = await findAudioTranscriptionShadowCandidates({
    prisma,
    tenant: "demo-prefeitura",
    runId: "run-1",
  });

  assert.equal(report.eligible, 0);
  assert.equal(report.skippedItems[0]?.reason, "tenant_feature_disabled");
});

test("runtime enabled blocks shadow pipeline in this sprint", async () => {
  const { prisma } = makePrisma({
    client: makeClient({ audioTranscription: true, audioTranscriptionRuntime: true }),
  });
  const report = await findAudioTranscriptionShadowCandidates({
    prisma,
    tenant: "demo-prefeitura",
    runId: "run-1",
  });

  assert.equal(report.eligible, 0);
  assert.equal(report.skippedItems[0]?.reason, "runtime_enabled");
});

test("existing transcription is not duplicated", async () => {
  const { prisma, writes } = makePrisma({ existing: true });
  const report = await findAudioTranscriptionShadowCandidates({
    prisma,
    tenant: "demo-prefeitura",
    record: true,
    runId: "run-1",
  });

  assert.equal(report.recordsCreated, 0);
  assert.equal(report.skippedItems[0]?.reason, "existing_transcription");
  assert.equal(writes.transcriptions.length, 0);
});

test("unsupported channel is skipped", async () => {
  const { prisma } = makePrisma({ messages: [makeAudioMessage({ channel: "telegram" })] });
  const report = await findAudioTranscriptionShadowCandidates({
    prisma,
    tenant: "demo-prefeitura",
    runId: "run-1",
  });

  assert.equal(report.eligible, 0);
  assert.equal(report.skippedItems[0]?.reason, "channel_not_supported");
});

test("query only scans inbound audio messages by messageId when filter is not uuid", async () => {
  const { prisma, writes } = makePrisma({ messages: [] });
  await findAudioTranscriptionShadowCandidates({
    prisma,
    tenant: "demo-prefeitura",
    messageId: "message-1",
    runId: "run-1",
  });

  assert.deepEqual(writes.messageWhere[0], {
    clientId: "tenant-1",
    type: MessageType.AUDIO,
    messageId: "message-1",
  });
});

test("query allows id lookup when message filter is uuid", async () => {
  const { prisma, writes } = makePrisma({ messages: [] });
  const id = "b9a563f8-6a4d-4cf4-8e16-a5c9c356b34a";
  await findAudioTranscriptionShadowCandidates({
    prisma,
    tenant: "demo-prefeitura",
    messageId: id,
    runId: "run-1",
  });

  assert.deepEqual(writes.messageWhere[0], {
    clientId: "tenant-1",
    type: MessageType.AUDIO,
    OR: [{ id }, { messageId: id }],
  });
});
