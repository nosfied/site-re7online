import crypto from "node:crypto";
import { MessageType, type Prisma, type PrismaClient } from "@prisma/client";
import { hasFeature } from "../features/clientFeatures.js";
import { logger } from "../logger/logger.js";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const MVP_CHANNELS = new Set(["whatsapp"]);

type ClientRow = {
  id: string;
  clientKey: string;
  profile: string | null;
  features: Prisma.JsonValue | null;
};

type AudioMessageRow = {
  id: string;
  clientId: string;
  messageId: string;
  channel: string | null;
  provider: string | null;
  channelAccountId: string | null;
  externalMessageId: string | null;
  waId: string;
  type: MessageType;
  rawPayload: Prisma.JsonValue | null;
  createdAt: Date;
};

export type AudioTranscriptionShadowCandidate = {
  clientId: string;
  clientKey: string;
  inboundMessageId: string;
  messageId: string;
  channel: string;
  provider: string | null;
  channelAccountIdHash: string | null;
  externalMessageIdHash: string | null;
  createdAt: string;
  media: {
    hasAudioId: boolean;
    hasMimeType: boolean;
    hasSha256: boolean;
  };
  reason: "eligible";
};

export type AudioTranscriptionShadowSkipped = {
  clientId: string;
  clientKey: string;
  inboundMessageId: string;
  messageId: string;
  channel: string | null;
  reason:
    | "tenant_feature_disabled"
    | "runtime_enabled"
    | "channel_not_supported"
    | "missing_media_metadata"
    | "existing_transcription";
};

export type AudioTranscriptionShadowReport = {
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
  candidates: AudioTranscriptionShadowCandidate[];
  skippedItems: AudioTranscriptionShadowSkipped[];
};

export function buildAudioTranscriptionShadowRunId() {
  return `audio-transcriptions-shadow:${Date.now().toString(36)}:${crypto.randomUUID().slice(0, 8)}`;
}

function normalizeLimit(value: number | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(value ?? DEFAULT_LIMIT)));
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function buildMessageFilter(messageId: string | undefined) {
  if (!messageId) return {};
  return isUuidLike(messageId) ? { OR: [{ id: messageId }, { messageId }] } : { messageId };
}

function hashValue(value: string | null | undefined) {
  if (!value) return null;
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function getObject(input: unknown): Record<string, unknown> | null {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : null;
}

function getAudioMetadata(rawPayload: Prisma.JsonValue | null) {
  const root = getObject(rawPayload);
  const audio = getObject(root?.audio) ?? getObject(getObject(root?.message)?.audio);
  const audioId = typeof audio?.id === "string" && audio.id.trim() ? audio.id : null;
  const mimeType =
    typeof audio?.mime_type === "string" && audio.mime_type.trim()
      ? audio.mime_type
      : typeof audio?.mimeType === "string" && audio.mimeType.trim()
        ? audio.mimeType
        : null;
  const sha256 =
    typeof audio?.sha256 === "string" && audio.sha256.trim()
      ? audio.sha256
      : typeof audio?.sha_256 === "string" && audio.sha_256.trim()
        ? audio.sha_256
        : null;
  return {
    audioId,
    mimeType,
    sha256,
    hasRequiredMetadata: Boolean(audioId || sha256 || mimeType),
  };
}

function toCandidate(client: ClientRow, message: AudioMessageRow): AudioTranscriptionShadowCandidate {
  const media = getAudioMetadata(message.rawPayload);
  return {
    clientId: client.id,
    clientKey: client.clientKey,
    inboundMessageId: message.id,
    messageId: message.messageId,
    channel: message.channel ?? "whatsapp",
    provider: message.provider,
    channelAccountIdHash: hashValue(message.channelAccountId),
    externalMessageIdHash: hashValue(message.externalMessageId),
    createdAt: message.createdAt.toISOString(),
    media: {
      hasAudioId: Boolean(media.audioId),
      hasMimeType: Boolean(media.mimeType),
      hasSha256: Boolean(media.sha256),
    },
    reason: "eligible",
  };
}

function toSkipped(
  client: ClientRow,
  message: AudioMessageRow,
  reason: AudioTranscriptionShadowSkipped["reason"]
): AudioTranscriptionShadowSkipped {
  return {
    clientId: client.id,
    clientKey: client.clientKey,
    inboundMessageId: message.id,
    messageId: message.messageId,
    channel: message.channel,
    reason,
  };
}

async function recordShadowEvent(params: {
  prisma: PrismaClient;
  clientId: string;
  runId: string;
  eventName:
    | "audio.transcription.shadow_run"
    | "audio.transcription.shadow_candidate"
    | "audio.transcription.shadow_recorded"
    | "audio.transcription.shadow_skipped";
  payload: Record<string, unknown>;
}) {
  await params.prisma.event
    .create({
      data: {
        clientId: params.clientId,
        eventName: params.eventName,
        requestId: `${params.runId}:${params.eventName}:${String(params.payload.messageId ?? "summary")}`,
        payloadJson: {
          action: params.eventName,
          shadow: true,
          ...params.payload,
        },
      },
    })
    .catch((error: unknown) => {
      logger.warn({
        event: "audio.transcription.shadow_audit_failed",
        clientId: params.clientId,
        eventName: params.eventName,
        runId: params.runId,
        message: (error as Error).message,
      });
    });
}

export async function findAudioTranscriptionShadowCandidates(params: {
  prisma: PrismaClient;
  tenant: string;
  limit?: number;
  messageId?: string;
  record?: boolean;
  runId?: string;
}): Promise<AudioTranscriptionShadowReport> {
  const runId = params.runId ?? buildAudioTranscriptionShadowRunId();
  const limit = normalizeLimit(params.limit);
  const client = await params.prisma.client.findUnique({
    where: { clientKey: params.tenant },
    select: { id: true, clientKey: true, profile: true, features: true, status: true },
  });
  if (!client || client.status !== "ACTIVE") {
    throw new Error(`tenant_not_found:${params.tenant}`);
  }

  const messages = await params.prisma.inboundMessage.findMany({
    where: {
      clientId: client.id,
      type: MessageType.AUDIO,
      ...buildMessageFilter(params.messageId),
    },
    orderBy: [{ createdAt: "desc" }],
    take: limit,
  });

  const candidates: AudioTranscriptionShadowCandidate[] = [];
  const skippedItems: AudioTranscriptionShadowSkipped[] = [];
  let recordsCreated = 0;
  let eventWrites = 0;

  const enabled = hasFeature(client, "audioTranscription");
  const runtimeEnabled = hasFeature(client, "audioTranscriptionRuntime");

  for (const message of messages as AudioMessageRow[]) {
    const normalizedChannel = message.channel ?? "whatsapp";
    const existing = await params.prisma.audioTranscription.findFirst({
      where: { clientId: client.id, messageId: message.messageId },
      select: { id: true },
    });
    let skippedReason: AudioTranscriptionShadowSkipped["reason"] | null = null;
    if (!enabled) skippedReason = "tenant_feature_disabled";
    else if (runtimeEnabled) skippedReason = "runtime_enabled";
    else if (!MVP_CHANNELS.has(normalizedChannel)) skippedReason = "channel_not_supported";
    else if (!getAudioMetadata(message.rawPayload).hasRequiredMetadata) skippedReason = "missing_media_metadata";
    else if (existing) skippedReason = "existing_transcription";

    if (skippedReason) {
      const skipped = toSkipped(client, message, skippedReason);
      skippedItems.push(skipped);
      logger.info({
        event: "audio.transcription.shadow_skipped",
        runId,
        clientId: client.id,
        clientKey: client.clientKey,
        messageId: message.messageId,
        reason: skippedReason,
      });
      if (params.record) {
        await recordShadowEvent({
          prisma: params.prisma,
          clientId: client.id,
          runId,
          eventName: "audio.transcription.shadow_skipped",
          payload: {
            messageId: message.messageId,
            channel: normalizedChannel,
            reason: skippedReason,
          },
        });
        eventWrites += 1;
      }
      continue;
    }

    const candidate = toCandidate(client, message);
    candidates.push(candidate);
    logger.info({
      event: "audio.transcription.shadow_candidate",
      runId,
      clientId: client.id,
      clientKey: client.clientKey,
      messageId: candidate.messageId,
      channel: candidate.channel,
      hasAudioId: candidate.media.hasAudioId,
      hasMimeType: candidate.media.hasMimeType,
      hasSha256: candidate.media.hasSha256,
    });
    if (params.record) {
      await recordShadowEvent({
        prisma: params.prisma,
        clientId: client.id,
        runId,
        eventName: "audio.transcription.shadow_candidate",
        payload: {
          messageId: candidate.messageId,
          channel: candidate.channel,
          hasAudioId: candidate.media.hasAudioId,
          hasMimeType: candidate.media.hasMimeType,
          hasSha256: candidate.media.hasSha256,
        },
      });
      eventWrites += 1;
      const transcription = await params.prisma.audioTranscription.create({
        data: {
          clientId: client.id,
          messageId: message.messageId,
          conversationId: null,
          channel: candidate.channel,
          language: null,
          transcript: null,
          confidence: null,
          provider: "shadow",
          status: "shadow",
          metadata: {
            runId,
            inboundMessageId: message.id,
            media: candidate.media,
          },
        },
      });
      await params.prisma.audioTranscriptionJob.create({
        data: {
          clientId: client.id,
          transcriptionId: transcription.id,
          provider: "shadow",
          status: "skipped",
          error: null,
          metadata: {
            runId,
            reason: "shadow_only_no_download_no_provider",
          },
        },
      });
      recordsCreated += 1;
      await recordShadowEvent({
        prisma: params.prisma,
        clientId: client.id,
        runId,
        eventName: "audio.transcription.shadow_recorded",
        payload: {
          messageId: candidate.messageId,
          channel: candidate.channel,
          transcriptionId: transcription.id,
        },
      });
      eventWrites += 1;
    }
  }

  const report: AudioTranscriptionShadowReport = {
    ok: true,
    dryRun: params.record !== true,
    recorded: params.record === true,
    runId,
    tenant: client.clientKey,
    checkedTenants: 1,
    scanned: messages.length,
    eligible: candidates.length,
    skipped: skippedItems.length,
    recordsCreated,
    eventWrites,
    candidates,
    skippedItems,
  };

  logger.info({
    event: "audio.transcription.shadow_run",
    runId,
    tenant: client.clientKey,
    scanned: report.scanned,
    eligible: report.eligible,
    skipped: report.skipped,
    recorded: report.recorded,
  });

  if (params.record) {
    await recordShadowEvent({
      prisma: params.prisma,
      clientId: client.id,
      runId,
      eventName: "audio.transcription.shadow_run",
      payload: {
        tenant: client.clientKey,
        scanned: report.scanned,
        eligible: report.eligible,
        skipped: report.skipped,
        recordsCreated: report.recordsCreated,
      },
    });
    report.eventWrites += 1;
  }

  return report;
}
