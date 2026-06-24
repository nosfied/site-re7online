import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MessageType } from "@prisma/client";
import {
  processAudioTranscriptionsControlled,
  type AudioMediaDownloader,
  type AudioTranscriptionProvider,
} from "./audioTranscriptionProcess.js";

const now = new Date("2026-06-23T15:00:00.000Z");

function makeClient(features: Record<string, boolean> = { audioTranscription: true, audioTranscriptionRuntime: true }) {
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
    provider: "whatsapp",
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
  existing?: Record<string, unknown> | null;
} = {}) {
  const writes: {
    transcriptions: Array<Record<string, unknown>>;
    jobs: Array<Record<string, unknown>>;
    events: Array<Record<string, unknown>>;
    transcriptionUpdates: Array<Record<string, unknown>>;
    jobUpdates: Array<Record<string, unknown>>;
  } = {
    transcriptions: [],
    jobs: [],
    events: [],
    transcriptionUpdates: [],
    jobUpdates: [],
  };
  const client = options.client === undefined ? makeClient() : options.client;
  const messages = options.messages ?? [makeAudioMessage()];
  let existing = options.existing ?? null;
  const prisma = {
    client: {
      findUnique: async () => client,
    },
    inboundMessage: {
      findMany: async () => messages,
    },
    audioTranscription: {
      findUnique: async () => existing,
      create: async (args: { data: Record<string, unknown> }) => {
        const row = { id: "transcription-1", ...args.data };
        existing = row;
        writes.transcriptions.push(args.data);
        return row;
      },
      update: async (args: { data: Record<string, unknown> }) => {
        const row = { id: (existing?.id as string) ?? "transcription-1", ...(existing ?? {}), ...args.data };
        existing = row;
        writes.transcriptionUpdates.push(args.data);
        return row;
      },
    },
    audioTranscriptionJob: {
      create: async (args: { data: Record<string, unknown> }) => {
        const row = { id: "job-1", ...args.data };
        writes.jobs.push(args.data);
        return row;
      },
      update: async (args: { data: Record<string, unknown> }) => {
        writes.jobUpdates.push(args.data);
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

async function countFiles(dir: string): Promise<number> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  let total = 0;
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await countFiles(fullPath);
    } else {
      total += 1;
    }
  }
  return total;
}

test("dry-run does not download, call provider, or persist", async () => {
  const { prisma, writes } = makePrisma({
    client: makeClient({ audioTranscription: true, audioTranscriptionRuntime: false }),
  });
  let downloadCalled = false;
  let providerCalled = false;
  const report = await processAudioTranscriptionsControlled({
    prisma,
    tenant: "demo-prefeitura",
    now,
    downloader: (async () => {
      downloadCalled = true;
      throw new Error("unexpected_download");
    }) as AudioMediaDownloader,
    provider: (async () => {
      providerCalled = true;
      throw new Error("unexpected_provider");
    }) as AudioTranscriptionProvider,
  });

  assert.equal(report.ok, true);
  assert.equal(report.dryRun, true);
  assert.equal(report.wouldProcess, 1);
  assert.equal(downloadCalled, false);
  assert.equal(providerCalled, false);
  assert.equal(writes.transcriptions.length, 0);
  assert.equal(writes.jobs.length, 0);
  assert.equal(writes.events.length, 0);
});

test("execute without OpenAI API key is blocked before download", async () => {
  const { prisma, writes } = makePrisma();
  let downloadCalled = false;
  const report = await processAudioTranscriptionsControlled({
    prisma,
    tenant: "demo-prefeitura",
    execute: true,
    now,
    openAiApiKey: "",
    downloader: (async () => {
      downloadCalled = true;
      throw new Error("unexpected_download");
    }) as AudioMediaDownloader,
  });

  assert.equal(report.ok, false);
  assert.equal(report.error, "provider_key_missing");
  assert.equal(downloadCalled, false);
  assert.equal(writes.transcriptions.length, 0);
});

test("execute with runtime disabled skips without persistence", async () => {
  const { prisma, writes } = makePrisma({
    client: makeClient({ audioTranscription: true, audioTranscriptionRuntime: false }),
  });
  const report = await processAudioTranscriptionsControlled({
    prisma,
    tenant: "demo-prefeitura",
    execute: true,
    now,
    openAiApiKey: "test-key",
  });

  assert.equal(report.ok, true);
  assert.equal(report.skipped, 1);
  assert.equal(report.items[0]?.reason, "runtime_feature_disabled");
  assert.equal(writes.transcriptions.length, 0);
  assert.equal(writes.jobs.length, 0);
});

test("execute completes transcript with mocked provider and removes temporary file", async () => {
  const { prisma, writes } = makePrisma();
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "audio-process-test-"));
  let providerSawFile = false;
  try {
    const report = await processAudioTranscriptionsControlled({
      prisma,
      tenant: "demo-prefeitura",
      execute: true,
      now,
      openAiApiKey: "test-key",
      tempRoot,
      downloader: async (params) => {
        await fs.writeFile(params.destinationPath, "audio-bytes");
        return { ok: true, filePath: params.destinationPath, mimeType: "audio/ogg", bytes: 11 };
      },
      provider: async (params) => {
        const stat = await fs.stat(params.filePath);
        providerSawFile = stat.size === 11;
        return {
          ok: true,
          transcript: "Texto transcrito de teste.",
          language: "pt",
          confidence: null,
          providerRequestId: "req-test",
        };
      },
    });

    assert.equal(report.ok, true);
    assert.equal(report.completed, 1);
    assert.equal(providerSawFile, true);
    assert.equal(writes.transcriptions.length, 1);
    assert.equal(writes.jobs.length, 1);
    const lastTranscriptionUpdate = writes.transcriptionUpdates[writes.transcriptionUpdates.length - 1];
    const lastJobUpdate = writes.jobUpdates[writes.jobUpdates.length - 1];
    assert.equal(lastTranscriptionUpdate?.status, "completed");
    assert.equal(lastTranscriptionUpdate?.transcript, "Texto transcrito de teste.");
    assert.equal(lastJobUpdate?.status, "completed");
    assert.ok(writes.events.some((event) => event.eventName === "audio.transcription.completed"));
    assert.equal(await countFiles(tempRoot), 0);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("provider failure marks transcription and job failed and cleans temp", async () => {
  const { prisma, writes } = makePrisma();
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "audio-process-test-"));
  try {
    const report = await processAudioTranscriptionsControlled({
      prisma,
      tenant: "demo-prefeitura",
      execute: true,
      now,
      openAiApiKey: "test-key",
      tempRoot,
      downloader: async (params) => {
        await fs.writeFile(params.destinationPath, "audio-bytes");
        return { ok: true, filePath: params.destinationPath, mimeType: "audio/ogg", bytes: 11 };
      },
      provider: async () => ({ ok: false, error: "provider exploded with sk-secret" }),
    });

    assert.equal(report.ok, true);
    assert.equal(report.failed, 1);
    const lastTranscriptionUpdate = writes.transcriptionUpdates[writes.transcriptionUpdates.length - 1];
    const lastJobUpdate = writes.jobUpdates[writes.jobUpdates.length - 1];
    assert.equal(lastTranscriptionUpdate?.status, "failed");
    assert.equal(lastJobUpdate?.status, "failed");
    assert.match(String(lastJobUpdate?.error), /sk-\*\*\*/);
    assert.equal(await countFiles(tempRoot), 0);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("completed transcription is idempotently skipped", async () => {
  const { prisma } = makePrisma({
    existing: { id: "transcription-existing", status: "completed", metadata: null },
  });
  const report = await processAudioTranscriptionsControlled({
    prisma,
    tenant: "demo-prefeitura",
    execute: true,
    now,
    openAiApiKey: "test-key",
  });

  assert.equal(report.skipped, 1);
  assert.equal(report.items[0]?.reason, "existing_completed");
});

test("tenant isolation filters by active tenant key", async () => {
  const { prisma } = makePrisma({ client: null });
  const report = await processAudioTranscriptionsControlled({
    prisma,
    tenant: "missing",
    execute: true,
    now,
    openAiApiKey: "test-key",
  });

  assert.equal(report.ok, false);
  assert.equal(report.error, "tenant_not_found");
  assert.equal(report.checkedTenants, 0);
});
