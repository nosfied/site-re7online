import type { PrismaClient } from "@prisma/client";

function serializeDate(date: Date | null | undefined) {
  return date ? date.toISOString() : null;
}

function serializeTranscription(item: {
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
}) {
  return {
    id: item.id,
    messageId: item.messageId,
    conversationId: item.conversationId,
    channel: item.channel,
    language: item.language,
    transcript: item.transcript,
    confidence: item.confidence,
    provider: item.provider,
    status: item.status,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function serializeJob(item: {
  id: string;
  transcriptionId: string;
  provider: string | null;
  status: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: item.id,
    transcriptionId: item.transcriptionId,
    provider: item.provider,
    status: item.status,
    startedAt: serializeDate(item.startedAt),
    finishedAt: serializeDate(item.finishedAt),
    error: item.error,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export async function listAudioTranscriptions(params: { prisma: PrismaClient; clientId: string }) {
  const [transcriptions, jobs] = await Promise.all([
    params.prisma.audioTranscription.findMany({
      where: { clientId: params.clientId },
      orderBy: [{ createdAt: "desc" }],
      take: 200,
    }),
    params.prisma.audioTranscriptionJob.findMany({
      where: { clientId: params.clientId },
      orderBy: [{ createdAt: "desc" }],
      take: 200,
    }),
  ]);
  return {
    transcriptions: transcriptions.map(serializeTranscription),
    jobs: jobs.map(serializeJob),
  };
}
