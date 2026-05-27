-- Add LGPD soft-delete/anonymization flags without changing historical records.
ALTER TABLE "Conversation" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Conversation" ADD COLUMN "anonymizedAt" TIMESTAMP(3);

CREATE INDEX "Conversation_clientId_deletedAt_idx" ON "Conversation"("clientId", "deletedAt");
