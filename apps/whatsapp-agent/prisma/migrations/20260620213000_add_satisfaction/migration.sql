CREATE TABLE "SatisfactionQuestion" (
  "id" TEXT NOT NULL,
  "clientId" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'csat',
  "title" TEXT NOT NULL,
  "questionText" TEXT NOT NULL,
  "commentPrompt" TEXT,
  "commentEnabled" BOOLEAN NOT NULL DEFAULT true,
  "status" TEXT NOT NULL DEFAULT 'active',
  "metadata" JSONB,
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SatisfactionQuestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SatisfactionSurvey" (
  "id" TEXT NOT NULL,
  "clientId" UUID NOT NULL,
  "questionId" TEXT,
  "conversationId" UUID,
  "contactId" UUID,
  "leadId" TEXT,
  "departmentId" TEXT,
  "assignedUserId" TEXT,
  "channel" TEXT,
  "type" TEXT NOT NULL DEFAULT 'csat',
  "status" TEXT NOT NULL DEFAULT 'draft',
  "questionText" TEXT NOT NULL,
  "commentEnabled" BOOLEAN NOT NULL DEFAULT true,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "templateName" TEXT,
  "templateLang" TEXT,
  "requestId" TEXT,
  "sentAt" TIMESTAMP(3),
  "answeredAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SatisfactionSurvey_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SatisfactionResponse" (
  "id" TEXT NOT NULL,
  "clientId" UUID NOT NULL,
  "surveyId" TEXT NOT NULL,
  "conversationId" UUID,
  "contactId" UUID,
  "leadId" TEXT,
  "score" INTEGER NOT NULL,
  "comment" TEXT,
  "category" TEXT,
  "source" TEXT NOT NULL DEFAULT 'app',
  "respondedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SatisfactionResponse_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SatisfactionQuestion_clientId_key_key" ON "SatisfactionQuestion"("clientId", "key");
CREATE INDEX "SatisfactionQuestion_clientId_status_idx" ON "SatisfactionQuestion"("clientId", "status");
CREATE INDEX "SatisfactionQuestion_clientId_type_idx" ON "SatisfactionQuestion"("clientId", "type");
CREATE INDEX "SatisfactionQuestion_clientId_updatedAt_idx" ON "SatisfactionQuestion"("clientId", "updatedAt");

CREATE INDEX "SatisfactionSurvey_clientId_status_createdAt_idx" ON "SatisfactionSurvey"("clientId", "status", "createdAt");
CREATE INDEX "SatisfactionSurvey_clientId_type_createdAt_idx" ON "SatisfactionSurvey"("clientId", "type", "createdAt");
CREATE INDEX "SatisfactionSurvey_clientId_conversationId_idx" ON "SatisfactionSurvey"("clientId", "conversationId");
CREATE INDEX "SatisfactionSurvey_clientId_contactId_idx" ON "SatisfactionSurvey"("clientId", "contactId");
CREATE INDEX "SatisfactionSurvey_clientId_leadId_idx" ON "SatisfactionSurvey"("clientId", "leadId");
CREATE INDEX "SatisfactionSurvey_clientId_departmentId_createdAt_idx" ON "SatisfactionSurvey"("clientId", "departmentId", "createdAt");
CREATE INDEX "SatisfactionSurvey_clientId_assignedUserId_createdAt_idx" ON "SatisfactionSurvey"("clientId", "assignedUserId", "createdAt");

CREATE UNIQUE INDEX "SatisfactionResponse_surveyId_key" ON "SatisfactionResponse"("surveyId");
CREATE INDEX "SatisfactionResponse_clientId_respondedAt_idx" ON "SatisfactionResponse"("clientId", "respondedAt");
CREATE INDEX "SatisfactionResponse_clientId_score_respondedAt_idx" ON "SatisfactionResponse"("clientId", "score", "respondedAt");
CREATE INDEX "SatisfactionResponse_clientId_conversationId_idx" ON "SatisfactionResponse"("clientId", "conversationId");
CREATE INDEX "SatisfactionResponse_clientId_contactId_idx" ON "SatisfactionResponse"("clientId", "contactId");
CREATE INDEX "SatisfactionResponse_clientId_leadId_idx" ON "SatisfactionResponse"("clientId", "leadId");

ALTER TABLE "SatisfactionQuestion" ADD CONSTRAINT "SatisfactionQuestion_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SatisfactionQuestion" ADD CONSTRAINT "SatisfactionQuestion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SatisfactionQuestion" ADD CONSTRAINT "SatisfactionQuestion_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SatisfactionSurvey" ADD CONSTRAINT "SatisfactionSurvey_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SatisfactionSurvey" ADD CONSTRAINT "SatisfactionSurvey_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "SatisfactionQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SatisfactionSurvey" ADD CONSTRAINT "SatisfactionSurvey_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SatisfactionSurvey" ADD CONSTRAINT "SatisfactionSurvey_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SatisfactionSurvey" ADD CONSTRAINT "SatisfactionSurvey_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SatisfactionSurvey" ADD CONSTRAINT "SatisfactionSurvey_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SatisfactionSurvey" ADD CONSTRAINT "SatisfactionSurvey_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SatisfactionResponse" ADD CONSTRAINT "SatisfactionResponse_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SatisfactionResponse" ADD CONSTRAINT "SatisfactionResponse_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "SatisfactionSurvey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SatisfactionResponse" ADD CONSTRAINT "SatisfactionResponse_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SatisfactionResponse" ADD CONSTRAINT "SatisfactionResponse_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SatisfactionResponse" ADD CONSTRAINT "SatisfactionResponse_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
