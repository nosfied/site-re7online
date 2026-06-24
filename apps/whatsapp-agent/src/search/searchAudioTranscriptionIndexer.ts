import crypto from "node:crypto";
import { type Prisma, type PrismaClient } from "@prisma/client";
import { hasFeature } from "../features/clientFeatures.js";
import { logger } from "../logger/logger.js";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const ENTITY_TYPE = "audio_transcription";
const SOURCE = "audio_transcription";

type ClientRow = {
  id: string;
  clientKey: string;
  profile: string | null;
  features: Prisma.JsonValue | null;
};

type AudioTranscriptionRow = {
  id: string;
  messageId: string;
  conversationId: string | null;
  channel: string;
  language: string | null;
  transcript: string | null;
  confidence: number | null;
  provider: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type AudioSearchCandidate = {
  clientId: string;
  clientKey: string;
  entityType: typeof ENTITY_TYPE;
  entityId: string;
  title: string;
  body: string;
  source: typeof SOURCE;
  channel: string;
  language: string | null;
  reason: "eligible";
};

type AudioSearchSkipped = {
  clientId: string;
  clientKey: string;
  entityType: typeof ENTITY_TYPE | null;
  entityId: string | null;
  source: typeof SOURCE | null;
  reason:
    | "tenant_feature_disabled"
    | "advanced_search_runtime_disabled"
    | "audio_transcription_feature_disabled"
    | "not_completed"
    | "empty_transcript"
    | "existing_index";
};

export type SearchAudioIndexReport = {
  ok: true;
  dryRun: boolean;
  recorded: boolean;
  runId: string;
  tenant: string;
  checkedTenants: number;
  scanned: number;
  eligible: number;
  skipped: number;
  recordsCreated: number;
  eventWrites: number;
  candidates: AudioSearchCandidate[];
  skippedItems: AudioSearchSkipped[];
};

export type SearchAudioIndexParams = {
  prisma: PrismaClient;
  tenant: string;
  limit?: number;
  transcriptionId?: string | null;
  record?: boolean;
  runId?: string;
};

function buildRunId() {
  return `search-audio:${Date.now().toString(36)}:${crypto.randomUUID().slice(0, 8)}`;
}

function normalizeLimit(value: number | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(value ?? DEFAULT_LIMIT)));
}

function normalizeText(value: string | null | undefined, max = 4000) {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > max ? `${normalized.slice(0, max - 3)}...` : normalized;
}

function buildTranscriptionFilter(transcriptionId: string | null | undefined) {
  const value = transcriptionId?.trim();
  return value ? { id: value } : {};
}

function buildSkipped(
  client: ClientRow,
  params: Omit<AudioSearchSkipped, "clientId" | "clientKey">
): AudioSearchSkipped {
  return {
    clientId: client.id,
    clientKey: client.clientKey,
    ...params,
  };
}

function toCandidate(client: ClientRow, row: AudioTranscriptionRow): AudioSearchCandidate | AudioSearchSkipped {
  if (row.status !== "completed") {
    return buildSkipped(client, {
      entityType: ENTITY_TYPE,
      entityId: row.id,
      source: SOURCE,
      reason: "not_completed",
    });
  }
  const body = normalizeText(row.transcript);
  if (!body) {
    return buildSkipped(client, {
      entityType: ENTITY_TYPE,
      entityId: row.id,
      source: SOURCE,
      reason: "empty_transcript",
    });
  }
  return {
    clientId: client.id,
    clientKey: client.clientKey,
    entityType: ENTITY_TYPE,
    entityId: row.id,
    title: `Transcricao de audio ${row.channel}`,
    body,
    source: SOURCE,
    channel: row.channel,
    language: row.language,
    reason: "eligible",
  };
}

async function persistEvent(params: {
  prisma: PrismaClient;
  clientId: string;
  requestId: string;
  eventName: "search.audio.shadow_run" | "search.audio.indexed" | "search.audio.skipped";
  payload: Record<string, unknown>;
}) {
  await params.prisma.event
    .create({
      data: {
        clientId: params.clientId,
        requestId: params.requestId,
        eventName: params.eventName,
        payloadJson: params.payload as Prisma.InputJsonValue,
      },
    })
    .catch((error: unknown) => {
      logger.warn({
        event: "search.audio.audit_failed",
        clientId: params.clientId,
        eventName: params.eventName,
        requestId: params.requestId,
        message: (error as Error).message,
      });
    });
}

async function persistSearchIndex(params: {
  prisma: PrismaClient;
  candidate: AudioSearchCandidate;
}) {
  const existing = await params.prisma.searchIndex.findUnique({
    where: {
      clientId_entityType_entityId: {
        clientId: params.candidate.clientId,
        entityType: params.candidate.entityType,
        entityId: params.candidate.entityId,
      },
    },
    select: { id: true },
  });
  if (existing) return { created: false as const };
  await params.prisma.searchIndex.create({
    data: {
      clientId: params.candidate.clientId,
      entityType: params.candidate.entityType,
      entityId: params.candidate.entityId,
      title: params.candidate.title,
      body: params.candidate.body,
      source: params.candidate.source,
      channel: params.candidate.channel,
      language: params.candidate.language,
    },
  });
  return { created: true as const };
}

export async function indexAudioTranscriptionsForSearch(
  params: SearchAudioIndexParams
): Promise<SearchAudioIndexReport> {
  const runId = params.runId ?? buildRunId();
  const record = params.record === true;
  const limit = normalizeLimit(params.limit);
  const client = await params.prisma.client.findUnique({
    where: { clientKey: params.tenant },
    select: { id: true, clientKey: true, profile: true, features: true, status: true },
  });
  if (!client || client.status !== "ACTIVE") {
    throw new Error(`tenant_not_found:${params.tenant}`);
  }

  const report: SearchAudioIndexReport = {
    ok: true,
    dryRun: !record,
    recorded: record,
    runId,
    tenant: client.clientKey,
    checkedTenants: 1,
    scanned: 0,
    eligible: 0,
    skipped: 0,
    recordsCreated: 0,
    eventWrites: 0,
    candidates: [],
    skippedItems: [],
  };

  const advancedSearchEnabled = hasFeature(client, "advancedSearch");
  const advancedSearchRuntimeEnabled = hasFeature(client, "advancedSearchRuntime");
  const audioTranscriptionEnabled = hasFeature(client, "audioTranscription");

  if (!advancedSearchEnabled || !advancedSearchRuntimeEnabled || !audioTranscriptionEnabled) {
    const reason = !advancedSearchEnabled
      ? "tenant_feature_disabled"
      : !advancedSearchRuntimeEnabled
        ? "advanced_search_runtime_disabled"
        : "audio_transcription_feature_disabled";
    report.skipped = 1;
    report.skippedItems.push(buildSkipped(client, { entityType: null, entityId: null, source: null, reason }));
    logger.info({ event: "search.audio.skipped", runId, tenant: client.clientKey, reason });
    return report;
  }

  const rows = (await params.prisma.audioTranscription.findMany({
    where: {
      clientId: client.id,
      ...buildTranscriptionFilter(params.transcriptionId),
    },
    orderBy: [{ createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      messageId: true,
      conversationId: true,
      channel: true,
      language: true,
      transcript: true,
      confidence: true,
      provider: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  })) as AudioTranscriptionRow[];

  report.scanned = rows.length;
  await persistEvent({
    prisma: params.prisma,
    clientId: client.id,
    requestId: `${runId}:run`,
    eventName: "search.audio.shadow_run",
    payload: {
      record,
      limit,
      transcriptionId: params.transcriptionId ?? null,
      scanned: rows.length,
    },
  });
  report.eventWrites += 1;

  for (const row of rows) {
    const candidate = toCandidate(client, row);
    if (candidate.reason !== "eligible") {
      report.skipped += 1;
      report.skippedItems.push(candidate);
      logger.info({
        event: "search.audio.skipped",
        runId,
        source: candidate.source,
        entityType: candidate.entityType,
        reason: candidate.reason,
      });
      if (record) {
        await persistEvent({
          prisma: params.prisma,
          clientId: client.id,
          requestId: `${runId}:skipped:${candidate.entityId ?? "tenant"}`,
          eventName: "search.audio.skipped",
          payload: {
            entityType: candidate.entityType,
            source: candidate.source,
            reason: candidate.reason,
          },
        });
        report.eventWrites += 1;
      }
      continue;
    }

    const existing = await params.prisma.searchIndex.findUnique({
      where: {
        clientId_entityType_entityId: {
          clientId: candidate.clientId,
          entityType: candidate.entityType,
          entityId: candidate.entityId,
        },
      },
      select: { id: true },
    });
    if (existing) {
      report.skipped += 1;
      report.skippedItems.push({
        clientId: candidate.clientId,
        clientKey: candidate.clientKey,
        entityType: candidate.entityType,
        entityId: candidate.entityId,
        source: candidate.source,
        reason: "existing_index",
      });
      continue;
    }

    report.eligible += 1;
    report.candidates.push(candidate);
    logger.info({
      event: "search.audio.candidate",
      runId,
      entityType: candidate.entityType,
      source: candidate.source,
      channel: candidate.channel,
    });

    if (!record) continue;
    const result = await persistSearchIndex({ prisma: params.prisma, candidate });
    if (result.created) {
      report.recordsCreated += 1;
      await persistEvent({
        prisma: params.prisma,
        clientId: candidate.clientId,
        requestId: `${runId}:indexed:${candidate.entityId}`,
        eventName: "search.audio.indexed",
        payload: {
          entityType: candidate.entityType,
          source: candidate.source,
          channel: candidate.channel,
          language: candidate.language,
        },
      });
      report.eventWrites += 1;
    }
  }

  logger.info({
    event: "search.audio.shadow_run",
    runId,
    tenant: client.clientKey,
    scanned: report.scanned,
    eligible: report.eligible,
    skipped: report.skipped,
    recorded: report.recorded,
    recordsCreated: report.recordsCreated,
  });

  return report;
}
