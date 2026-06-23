import test from "node:test";
import assert from "node:assert/strict";
import { listAudioTranscriptions } from "./audioTranscriptionService.js";

const now = new Date("2026-06-23T12:00:00.000Z");

test("listAudioTranscriptions scopes all reads by clientId", async () => {
  const calls: unknown[] = [];
  const prisma = {
    audioTranscription: {
      findMany: async (args: unknown) => {
        calls.push(args);
        return [
          {
            id: "transcription-1",
            messageId: "message-1",
            conversationId: "conversation-1",
            channel: "whatsapp",
            language: "pt-BR",
            transcript: "Texto transcrito",
            confidence: 0.92,
            provider: "shadow",
            status: "completed",
            createdAt: now,
            updatedAt: now,
          },
        ];
      },
    },
    audioTranscriptionJob: {
      findMany: async (args: unknown) => {
        calls.push(args);
        return [
          {
            id: "job-1",
            transcriptionId: "transcription-1",
            provider: "shadow",
            status: "completed",
            startedAt: now,
            finishedAt: now,
            error: null,
            createdAt: now,
            updatedAt: now,
          },
        ];
      },
    },
  };

  const result = await listAudioTranscriptions({ prisma: prisma as never, clientId: "tenant-1" });

  assert.equal(result.transcriptions.length, 1);
  assert.equal(result.jobs.length, 1);
  assert.deepEqual(calls.map((call) => (call as { where: { clientId: string } }).where.clientId), [
    "tenant-1",
    "tenant-1",
  ]);
  assert.equal(result.transcriptions[0]?.createdAt, "2026-06-23T12:00:00.000Z");
  assert.equal(result.jobs[0]?.startedAt, "2026-06-23T12:00:00.000Z");
});
