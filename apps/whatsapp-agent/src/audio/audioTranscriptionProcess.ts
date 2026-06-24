import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import { MessageType, type Prisma, type PrismaClient } from "@prisma/client";
import { hasFeature } from "../features/clientFeatures.js";
import { logger } from "../logger/logger.js";
import { fetchMediaContent } from "../whatsapp/whatsapp.client.js";
import { resolveTenantOutboundCredentials } from "../whatsapp/tenantCredentials.js";

const DEFAULT_DRY_RUN_LIMIT = 10;
const DEFAULT_EXECUTE_LIMIT = 1;
const MAX_DRY_RUN_LIMIT = 25;
const MAX_EXECUTE_LIMIT = 5;
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const MVP_CHANNELS = new Set(["whatsapp"]);
const DEFAULT_PROVIDER = "openai";
const OPENAI_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";

type ClientRow = {
  id: string;
  clientKey: string;
  profile: string | null;
  features: Prisma.JsonValue | null;
  status: string;
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

type TranscriptionRow = {
  id: string;
  status: string;
  metadata: Prisma.JsonValue | null;
};

export type AudioTranscriptionProcessReason =
  | "eligible"
  | "tenant_feature_disabled"
  | "runtime_feature_disabled"
  | "provider_key_missing"
  | "channel_not_supported"
  | "missing_media_metadata"
  | "existing_completed"
  | "already_processing"
  | "media_download_failed"
  | "media_too_large"
  | "provider_failed";

export type AudioTranscriptionProcessItem = {
  clientId: string;
  clientKey: string;
  inboundMessageId: string;
  messageId: string;
  channel: string;
  action: "would_process" | "completed" | "failed" | "skipped";
  reason: AudioTranscriptionProcessReason;
  transcriptionId?: string;
  jobId?: string;
  bytes?: number;
  provider?: string;
  transcriptLength?: number;
};

export type AudioTranscriptionProcessReport = {
  ok: boolean;
  dryRun: boolean;
  execute: boolean;
  runId: string;
  tenant: string | null;
  checkedTenants: number;
  scanned: number;
  wouldProcess: number;
  completed: number;
  failed: number;
  skipped: number;
  items: AudioTranscriptionProcessItem[];
  error?: "tenant_required" | "tenant_not_found" | "provider_key_missing";
};

export type MediaDownloadResult =
  | {
      ok: true;
      filePath: string;
      mimeType: string | null;
      bytes: number;
    }
  | {
      ok: false;
      reason: "media_download_failed" | "media_too_large";
      status?: number;
      error?: string;
      bytes?: number;
    };

export type AudioTranscriptionProviderResult =
  | {
      ok: true;
      transcript: string;
      language?: string | null;
      confidence?: number | null;
      providerRequestId?: string | null;
    }
  | {
      ok: false;
      error: string;
      providerRequestId?: string | null;
    };

export type AudioMediaDownloader = (params: {
  client: ClientRow;
  message: AudioMessageRow;
  mediaId: string;
  destinationPath: string;
  maxBytes: number;
}) => Promise<MediaDownloadResult>;

export type AudioTranscriptionProvider = (params: {
  filePath: string;
  mimeType: string | null;
  apiKey: string;
}) => Promise<AudioTranscriptionProviderResult>;

export function buildAudioTranscriptionProcessRunId() {
  return `audio-transcriptions-process:${Date.now().toString(36)}:${crypto.randomUUID().slice(0, 8)}`;
}

function normalizeLimit(value: number | undefined, execute: boolean) {
  const fallback = execute ? DEFAULT_EXECUTE_LIMIT : DEFAULT_DRY_RUN_LIMIT;
  const max = execute ? MAX_EXECUTE_LIMIT : MAX_DRY_RUN_LIMIT;
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(1, Math.trunc(value ?? fallback)));
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function buildMessageFilter(messageId: string | undefined) {
  if (!messageId) return {};
  return isUuidLike(messageId) ? { OR: [{ id: messageId }, { messageId }] } : { messageId };
}

function getObject(input: unknown): Record<string, unknown> | null {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : null;
}

function getAudioMetadata(rawPayload: Prisma.JsonValue | null) {
  const root = getObject(rawPayload);
  const audio =
    getObject(root?.audio) ??
    getObject(getObject(root?.message)?.audio) ??
    getObject(root?.media);
  const audioId =
    typeof audio?.id === "string" && audio.id.trim()
      ? audio.id.trim()
      : typeof audio?.mediaId === "string" && audio.mediaId.trim()
        ? audio.mediaId.trim()
        : null;
  const mimeType =
    typeof audio?.mime_type === "string" && audio.mime_type.trim()
      ? audio.mime_type.trim()
      : typeof audio?.mimeType === "string" && audio.mimeType.trim()
        ? audio.mimeType.trim()
        : null;
  const sha256 =
    typeof audio?.sha256 === "string" && audio.sha256.trim()
      ? audio.sha256.trim()
      : typeof audio?.sha_256 === "string" && audio.sha_256.trim()
        ? audio.sha_256.trim()
        : null;
  return {
    audioId,
    mimeType,
    sha256,
    hasRequiredMetadata: Boolean(audioId || sha256 || mimeType),
  };
}

function metadataObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? ({ ...(value as Record<string, unknown>) } as Record<string, unknown>)
    : {};
}

function redactProviderError(value: string | null | undefined) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "provider_failed";
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, "Bearer ***")
    .replace(/sk-[A-Za-z0-9._-]+/g, "sk-***")
    .slice(0, 500);
}

function buildItem(params: {
  client: ClientRow;
  message: AudioMessageRow;
  action: AudioTranscriptionProcessItem["action"];
  reason: AudioTranscriptionProcessReason;
  transcriptionId?: string;
  jobId?: string;
  bytes?: number;
  provider?: string;
  transcriptLength?: number;
}): AudioTranscriptionProcessItem {
  return {
    clientId: params.client.id,
    clientKey: params.client.clientKey,
    inboundMessageId: params.message.id,
    messageId: params.message.messageId,
    channel: params.message.channel ?? "whatsapp",
    action: params.action,
    reason: params.reason,
    ...(params.transcriptionId ? { transcriptionId: params.transcriptionId } : {}),
    ...(params.jobId ? { jobId: params.jobId } : {}),
    ...(params.bytes !== undefined ? { bytes: params.bytes } : {}),
    ...(params.provider ? { provider: params.provider } : {}),
    ...(params.transcriptLength !== undefined ? { transcriptLength: params.transcriptLength } : {}),
  };
}

async function recordProcessEvent(params: {
  prisma: PrismaClient;
  clientId: string;
  runId: string;
  eventName:
    | "audio.transcription.process_dry_run"
    | "audio.transcription.process_started"
    | "audio.transcription.download_started"
    | "audio.transcription.download_succeeded"
    | "audio.transcription.download_failed"
    | "audio.transcription.provider_started"
    | "audio.transcription.provider_succeeded"
    | "audio.transcription.provider_failed"
    | "audio.transcription.completed"
    | "audio.transcription.failed"
    | "audio.transcription.skipped";
  messageId: string;
  payload: Record<string, unknown>;
}) {
  await params.prisma.event
    .create({
      data: {
        clientId: params.clientId,
        eventName: params.eventName,
        requestId: `${params.runId}:${params.eventName}:${params.messageId}`,
        payloadJson: {
          action: params.eventName,
          controlledRuntime: true,
          messageId: params.messageId,
          ...params.payload,
        },
      },
    })
    .catch((error: unknown) => {
      logger.warn({
        event: "audio.transcription.process_audit_failed",
        clientId: params.clientId,
        eventName: params.eventName,
        runId: params.runId,
        messageId: params.messageId,
        message: (error as Error).message,
      });
    });
}

async function ensureTempDir(baseDir: string, clientId: string, runId: string, messageId: string) {
  const safeRun = runId.replace(/[^a-zA-Z0-9:_-]/g, "_");
  const safeMessage = crypto.createHash("sha256").update(messageId).digest("hex").slice(0, 16);
  const dir = path.join(baseDir, clientId, `${safeRun}-${safeMessage}`);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  return dir;
}

async function removeDirSafe(dir: string | null) {
  if (!dir) return;
  await fs.rm(dir, { recursive: true, force: true }).catch((error: unknown) => {
    logger.warn({
      event: "audio.transcription.temp_cleanup_failed",
      tempDirHash: crypto.createHash("sha256").update(dir).digest("hex").slice(0, 16),
      message: (error as Error).message,
    });
  });
}

export async function downloadWhatsAppAudioToTemp(params: {
  client: ClientRow;
  message: AudioMessageRow;
  mediaId: string;
  destinationPath: string;
  maxBytes: number;
}): Promise<MediaDownloadResult> {
  const credentials = await resolveTenantOutboundCredentials({
    clientId: params.client.id,
    clientKey: params.client.clientKey,
  });
  if (!credentials) {
    return { ok: false, reason: "media_download_failed", error: "tenant_media_credentials_missing" };
  }
  const media = await fetchMediaContent(params.mediaId, { accessToken: credentials.accessToken });
  if (!media.ok) {
    return {
      ok: false,
      reason: "media_download_failed",
      status: media.status,
      error: media.errorBody ?? "media_fetch_failed",
    };
  }
  const declaredLength = Number(media.contentLength ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > params.maxBytes) {
    return { ok: false, reason: "media_too_large", bytes: declaredLength };
  }
  if (!media.response.body) {
    return { ok: false, reason: "media_download_failed", error: "media_body_missing" };
  }

  let bytes = 0;
  const source = Readable.fromWeb(media.response.body as never);
  const sink = createWriteStream(params.destinationPath, { mode: 0o600 });
  source.on("data", (chunk: Buffer) => {
    bytes += chunk.length;
    if (bytes > params.maxBytes) {
      source.destroy(new Error("media_too_large"));
    }
  });
  try {
    source.pipe(sink);
    await finished(sink);
  } catch (error) {
    await fs.rm(params.destinationPath, { force: true }).catch(() => undefined);
    if ((error as Error).message === "media_too_large") {
      return { ok: false, reason: "media_too_large", bytes };
    }
    return { ok: false, reason: "media_download_failed", error: (error as Error).message };
  }
  return {
    ok: true,
    filePath: params.destinationPath,
    mimeType: media.contentType,
    bytes,
  };
}

export async function transcribeWithOpenAi(params: {
  filePath: string;
  mimeType: string | null;
  apiKey: string;
}): Promise<AudioTranscriptionProviderResult> {
  const audio = await fs.readFile(params.filePath);
  const form = new FormData();
  form.set("model", OPENAI_TRANSCRIPTION_MODEL);
  form.set("language", "pt");
  form.set(
    "file",
    new Blob([audio], { type: params.mimeType || "application/octet-stream" }),
    path.basename(params.filePath)
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: form,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const requestId = response.headers.get("x-request-id");
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return {
        ok: false,
        error: redactProviderError(errorText || `provider_status_${response.status}`),
        providerRequestId: requestId,
      };
    }
    const json = (await response.json()) as { text?: unknown; language?: unknown; duration?: unknown };
    const transcript = typeof json.text === "string" ? json.text.trim() : "";
    if (!transcript) {
      return { ok: false, error: "provider_empty_transcript", providerRequestId: requestId };
    }
    return {
      ok: true,
      transcript,
      language: typeof json.language === "string" ? json.language : null,
      confidence: null,
      providerRequestId: requestId,
    };
  } catch (error) {
    clearTimeout(timeout);
    return { ok: false, error: redactProviderError((error as Error).message) };
  }
}

function evaluateMessage(params: {
  client: ClientRow;
  message: AudioMessageRow;
  transcription: TranscriptionRow | null;
  runtimeEnabled: boolean;
  providerKeyConfigured: boolean;
  execute: boolean;
}): { ok: true; mediaId: string } | { ok: false; reason: AudioTranscriptionProcessReason } {
  const channel = params.message.channel ?? "whatsapp";
  const media = getAudioMetadata(params.message.rawPayload);
  if (!hasFeature(params.client, "audioTranscription")) return { ok: false, reason: "tenant_feature_disabled" };
  if (params.execute && !params.runtimeEnabled) return { ok: false, reason: "runtime_feature_disabled" };
  if (params.execute && !params.providerKeyConfigured) return { ok: false, reason: "provider_key_missing" };
  if (!MVP_CHANNELS.has(channel)) return { ok: false, reason: "channel_not_supported" };
  if (!media.audioId || !media.hasRequiredMetadata) return { ok: false, reason: "missing_media_metadata" };
  if (params.transcription?.status === "completed") return { ok: false, reason: "existing_completed" };
  if (params.transcription?.status === "processing") return { ok: false, reason: "already_processing" };
  return { ok: true, mediaId: media.audioId };
}

async function markFailed(params: {
  prisma: PrismaClient;
  transcriptionId: string;
  jobId: string;
  now: Date;
  runId: string;
  reason: AudioTranscriptionProcessReason;
  error: string;
  metadata?: Record<string, unknown>;
}) {
  await params.prisma.audioTranscription.update({
    where: { id: params.transcriptionId },
    data: {
      status: "failed",
      provider: DEFAULT_PROVIDER,
      metadata: {
        runId: params.runId,
        failureReason: params.reason,
        error: params.error,
        ...(params.metadata ?? {}),
      },
    },
  });
  await params.prisma.audioTranscriptionJob.update({
    where: { id: params.jobId },
    data: {
      status: "failed",
      finishedAt: params.now,
      error: params.error,
      metadata: {
        runId: params.runId,
        reason: params.reason,
        ...(params.metadata ?? {}),
      },
    },
  });
}

export async function processAudioTranscriptionsControlled(params: {
  prisma: PrismaClient;
  tenant?: string;
  messageId?: string;
  limit?: number;
  execute?: boolean;
  now?: Date;
  runId?: string;
  openAiApiKey?: string;
  tempRoot?: string;
  maxBytes?: number;
  downloader?: AudioMediaDownloader;
  provider?: AudioTranscriptionProvider;
}): Promise<AudioTranscriptionProcessReport> {
  const now = params.now ?? new Date();
  const execute = params.execute === true;
  const dryRun = !execute;
  const limit = normalizeLimit(params.limit, execute);
  const runId = params.runId ?? buildAudioTranscriptionProcessRunId();
  const tenant = params.tenant?.trim() || null;
  const items: AudioTranscriptionProcessItem[] = [];
  const apiKey = params.openAiApiKey ?? process.env.OPENAI_API_KEY ?? "";
  if (!tenant) {
    return {
      ok: false,
      dryRun,
      execute,
      runId,
      tenant,
      checkedTenants: 0,
      scanned: 0,
      wouldProcess: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      items,
      error: "tenant_required",
    };
  }

  const client = await params.prisma.client.findUnique({
    where: { clientKey: tenant },
    select: { id: true, clientKey: true, profile: true, features: true, status: true },
  });
  if (!client || client.status !== "ACTIVE") {
    return {
      ok: false,
      dryRun,
      execute,
      runId,
      tenant,
      checkedTenants: 0,
      scanned: 0,
      wouldProcess: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      items,
      error: "tenant_not_found",
    };
  }

  if (execute && !apiKey.trim()) {
    return {
      ok: false,
      dryRun,
      execute,
      runId,
      tenant,
      checkedTenants: 1,
      scanned: 0,
      wouldProcess: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      items,
      error: "provider_key_missing",
    };
  }

  const messages = (await params.prisma.inboundMessage.findMany({
    where: {
      clientId: client.id,
      type: MessageType.AUDIO,
      ...buildMessageFilter(params.messageId),
    },
    orderBy: [{ createdAt: "desc" }],
    take: limit,
  })) as AudioMessageRow[];

  let wouldProcess = 0;
  let completed = 0;
  let failed = 0;
  let skipped = 0;
  const runtimeEnabled = hasFeature(client, "audioTranscriptionRuntime");
  const downloader = params.downloader ?? downloadWhatsAppAudioToTemp;
  const provider = params.provider ?? transcribeWithOpenAi;
  const tempRoot = params.tempRoot ?? path.join(os.tmpdir(), "converta", "audio-transcriptions");
  const maxBytes = params.maxBytes ?? MAX_AUDIO_BYTES;

  for (const message of messages) {
    const transcription = (await params.prisma.audioTranscription.findUnique({
      where: { clientId_messageId: { clientId: client.id, messageId: message.messageId } },
      select: { id: true, status: true, metadata: true },
    })) as TranscriptionRow | null;
    const eligibility = evaluateMessage({
      client,
      message,
      transcription,
      runtimeEnabled,
      providerKeyConfigured: Boolean(apiKey.trim()),
      execute,
    });
    if (!eligibility.ok) {
      items.push(buildItem({ client, message, action: "skipped", reason: eligibility.reason }));
      skipped += 1;
      if (execute) {
        await recordProcessEvent({
          prisma: params.prisma,
          clientId: client.id,
          runId,
          eventName: "audio.transcription.skipped",
          messageId: message.messageId,
          payload: { reason: eligibility.reason },
        });
      }
      continue;
    }

    if (dryRun) {
      items.push(buildItem({ client, message, action: "would_process", reason: "eligible", provider: DEFAULT_PROVIDER }));
      wouldProcess += 1;
      continue;
    }

    const baseMetadata = metadataObject(transcription?.metadata);
    const nextTranscription = transcription
      ? await params.prisma.audioTranscription.update({
          where: { id: transcription.id },
          data: {
            status: "processing",
            provider: DEFAULT_PROVIDER,
            metadata: {
              ...baseMetadata,
              runId,
              inboundMessageId: message.id,
              processingStartedAt: now.toISOString(),
            },
          },
        })
      : await params.prisma.audioTranscription.create({
          data: {
            clientId: client.id,
            messageId: message.messageId,
            conversationId: null,
            channel: message.channel ?? "whatsapp",
            language: null,
            transcript: null,
            confidence: null,
            provider: DEFAULT_PROVIDER,
            status: "processing",
            metadata: {
              runId,
              inboundMessageId: message.id,
              processingStartedAt: now.toISOString(),
            },
          },
        });
    const job = await params.prisma.audioTranscriptionJob.create({
      data: {
        clientId: client.id,
        transcriptionId: nextTranscription.id,
        provider: DEFAULT_PROVIDER,
        status: "processing",
        startedAt: now,
        metadata: { runId, messageId: message.messageId },
      },
    });

    await recordProcessEvent({
      prisma: params.prisma,
      clientId: client.id,
      runId,
      eventName: "audio.transcription.process_started",
      messageId: message.messageId,
      payload: { transcriptionId: nextTranscription.id, jobId: job.id },
    });

    let tempDir: string | null = null;
    try {
      tempDir = await ensureTempDir(tempRoot, client.id, runId, message.messageId);
      const tempPath = path.join(tempDir, "audio-input");
      await recordProcessEvent({
        prisma: params.prisma,
        clientId: client.id,
        runId,
        eventName: "audio.transcription.download_started",
        messageId: message.messageId,
        payload: { transcriptionId: nextTranscription.id },
      });
      const download = await downloader({
        client: client as ClientRow,
        message,
        mediaId: eligibility.mediaId,
        destinationPath: tempPath,
        maxBytes,
      });
      if (!download.ok) {
        const error = redactProviderError(download.error ?? download.reason);
        await markFailed({
          prisma: params.prisma,
          transcriptionId: nextTranscription.id,
          jobId: job.id,
          now,
          runId,
          reason: download.reason,
          error,
          metadata: { bytes: download.bytes ?? null, provider: DEFAULT_PROVIDER },
        });
        await recordProcessEvent({
          prisma: params.prisma,
          clientId: client.id,
          runId,
          eventName: "audio.transcription.download_failed",
          messageId: message.messageId,
          payload: { reason: download.reason, status: download.status ?? null },
        });
        items.push(
          buildItem({
            client,
            message,
            action: "failed",
            reason: download.reason,
            transcriptionId: nextTranscription.id,
            jobId: job.id,
            bytes: download.bytes,
            provider: DEFAULT_PROVIDER,
          })
        );
        failed += 1;
        continue;
      }
      await recordProcessEvent({
        prisma: params.prisma,
        clientId: client.id,
        runId,
        eventName: "audio.transcription.download_succeeded",
        messageId: message.messageId,
        payload: { bytes: download.bytes, mimeType: download.mimeType ?? null },
      });
      await recordProcessEvent({
        prisma: params.prisma,
        clientId: client.id,
        runId,
        eventName: "audio.transcription.provider_started",
        messageId: message.messageId,
        payload: { provider: DEFAULT_PROVIDER },
      });
      const result = await provider({
        filePath: download.filePath,
        mimeType: download.mimeType,
        apiKey,
      });
      if (!result.ok) {
        const error = redactProviderError(result.error);
        await markFailed({
          prisma: params.prisma,
          transcriptionId: nextTranscription.id,
          jobId: job.id,
          now,
          runId,
          reason: "provider_failed",
          error,
          metadata: { providerRequestId: result.providerRequestId ?? null, bytes: download.bytes },
        });
        await recordProcessEvent({
          prisma: params.prisma,
          clientId: client.id,
          runId,
          eventName: "audio.transcription.provider_failed",
          messageId: message.messageId,
          payload: { provider: DEFAULT_PROVIDER, providerRequestId: result.providerRequestId ?? null },
        });
        items.push(
          buildItem({
            client,
            message,
            action: "failed",
            reason: "provider_failed",
            transcriptionId: nextTranscription.id,
            jobId: job.id,
            bytes: download.bytes,
            provider: DEFAULT_PROVIDER,
          })
        );
        failed += 1;
        continue;
      }

      await params.prisma.audioTranscription.update({
        where: { id: nextTranscription.id },
        data: {
          status: "completed",
          provider: DEFAULT_PROVIDER,
          transcript: result.transcript,
          language: result.language ?? "pt",
          confidence: result.confidence ?? null,
          metadata: {
            ...baseMetadata,
            runId,
            inboundMessageId: message.id,
            completedAt: now.toISOString(),
            bytes: download.bytes,
            mimeType: download.mimeType,
            providerRequestId: result.providerRequestId ?? null,
          },
        },
      });
      await params.prisma.audioTranscriptionJob.update({
        where: { id: job.id },
        data: {
          status: "completed",
          finishedAt: now,
          error: null,
          metadata: {
            runId,
            providerRequestId: result.providerRequestId ?? null,
            bytes: download.bytes,
          },
        },
      });
      await recordProcessEvent({
        prisma: params.prisma,
        clientId: client.id,
        runId,
        eventName: "audio.transcription.provider_succeeded",
        messageId: message.messageId,
        payload: { provider: DEFAULT_PROVIDER, providerRequestId: result.providerRequestId ?? null },
      });
      await recordProcessEvent({
        prisma: params.prisma,
        clientId: client.id,
        runId,
        eventName: "audio.transcription.completed",
        messageId: message.messageId,
        payload: {
          provider: DEFAULT_PROVIDER,
          transcriptionId: nextTranscription.id,
          transcriptLength: result.transcript.length,
        },
      });
      items.push(
        buildItem({
          client,
          message,
          action: "completed",
          reason: "eligible",
          transcriptionId: nextTranscription.id,
          jobId: job.id,
          bytes: download.bytes,
          provider: DEFAULT_PROVIDER,
          transcriptLength: result.transcript.length,
        })
      );
      completed += 1;
    } catch (error) {
      const safeError = redactProviderError((error as Error).message);
      await markFailed({
        prisma: params.prisma,
        transcriptionId: nextTranscription.id,
        jobId: job.id,
        now,
        runId,
        reason: "provider_failed",
        error: safeError,
      });
      await recordProcessEvent({
        prisma: params.prisma,
        clientId: client.id,
        runId,
        eventName: "audio.transcription.failed",
        messageId: message.messageId,
        payload: { reason: "provider_failed" },
      });
      items.push(
        buildItem({
          client,
          message,
          action: "failed",
          reason: "provider_failed",
          transcriptionId: nextTranscription.id,
          jobId: job.id,
          provider: DEFAULT_PROVIDER,
        })
      );
      failed += 1;
    } finally {
      await removeDirSafe(tempDir);
    }
  }

  logger.info({
    event: "audio.transcription.process_run",
    runId,
    tenant,
    scanned: messages.length,
    execute,
    wouldProcess,
    completed,
    failed,
    skipped,
  });

  return {
    ok: true,
    dryRun,
    execute,
    runId,
    tenant,
    checkedTenants: 1,
    scanned: messages.length,
    wouldProcess,
    completed,
    failed,
    skipped,
    items,
  };
}
