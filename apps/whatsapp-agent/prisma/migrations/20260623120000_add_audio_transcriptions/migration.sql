CREATE TABLE "AudioTranscription" (
  "id" TEXT NOT NULL,
  "clientId" UUID NOT NULL,
  "messageId" TEXT NOT NULL,
  "conversationId" TEXT,
  "channel" TEXT NOT NULL,
  "language" TEXT,
  "transcript" TEXT,
  "confidence" DOUBLE PRECISION,
  "provider" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AudioTranscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AudioTranscriptionJob" (
  "id" TEXT NOT NULL,
  "clientId" UUID NOT NULL,
  "transcriptionId" TEXT NOT NULL,
  "provider" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "error" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AudioTranscriptionJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AudioTranscription_clientId_messageId_key" ON "AudioTranscription"("clientId", "messageId");
CREATE INDEX "AudioTranscription_clientId_status_createdAt_idx" ON "AudioTranscription"("clientId", "status", "createdAt");
CREATE INDEX "AudioTranscription_clientId_channel_createdAt_idx" ON "AudioTranscription"("clientId", "channel", "createdAt");
CREATE INDEX "AudioTranscription_clientId_conversationId_idx" ON "AudioTranscription"("clientId", "conversationId");
CREATE INDEX "AudioTranscription_clientId_provider_createdAt_idx" ON "AudioTranscription"("clientId", "provider", "createdAt");

CREATE INDEX "AudioTranscriptionJob_clientId_status_createdAt_idx" ON "AudioTranscriptionJob"("clientId", "status", "createdAt");
CREATE INDEX "AudioTranscriptionJob_clientId_transcriptionId_idx" ON "AudioTranscriptionJob"("clientId", "transcriptionId");
CREATE INDEX "AudioTranscriptionJob_clientId_provider_createdAt_idx" ON "AudioTranscriptionJob"("clientId", "provider", "createdAt");

ALTER TABLE "AudioTranscription"
  ADD CONSTRAINT "AudioTranscription_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AudioTranscriptionJob"
  ADD CONSTRAINT "AudioTranscriptionJob_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AudioTranscriptionJob"
  ADD CONSTRAINT "AudioTranscriptionJob_transcriptionId_fkey"
  FOREIGN KEY ("transcriptionId") REFERENCES "AudioTranscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
