CREATE TABLE "CampaignExecutionBatch" (
  "id" TEXT NOT NULL,
  "clientId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "sourceMode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "requestedAt" TIMESTAMP(3),
  "eligibleAt" TIMESTAMP(3),
  "effectiveStartedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "totalRecipients" INTEGER NOT NULL DEFAULT 0,
  "blockedCount" INTEGER NOT NULL DEFAULT 0,
  "chunkCount" INTEGER NOT NULL DEFAULT 0,
  "currentChunkIndex" INTEGER,
  "snapshotEventId" TEXT,
  "snapshotHash" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "failureReason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CampaignExecutionBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignExecutionBatchCampaign" (
  "id" TEXT NOT NULL,
  "clientId" UUID NOT NULL,
  "batchId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "chunkIndex" INTEGER NOT NULL,
  "recipientCount" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CampaignExecutionBatchCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignExecutionJob" (
  "id" TEXT NOT NULL,
  "clientId" UUID NOT NULL,
  "campaignId" TEXT,
  "batchId" TEXT,
  "chunkIndex" INTEGER,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "eligibleAt" TIMESTAMP(3) NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sequence" INTEGER NOT NULL DEFAULT 0,
  "leaseToken" TEXT,
  "leaseOwner" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "failureReason" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CampaignExecutionJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TenantCampaignExecutionLease" (
  "id" TEXT NOT NULL,
  "clientId" UUID NOT NULL,
  "jobId" TEXT,
  "leaseToken" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantCampaignExecutionLease_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CampaignExecutionBatch_clientId_idempotencyKey_key" ON "CampaignExecutionBatch"("clientId", "idempotencyKey");
CREATE INDEX "CampaignExecutionBatch_clientId_status_eligibleAt_idx" ON "CampaignExecutionBatch"("clientId", "status", "eligibleAt");
CREATE INDEX "CampaignExecutionBatch_clientId_createdAt_idx" ON "CampaignExecutionBatch"("clientId", "createdAt");

CREATE UNIQUE INDEX "CampaignExecutionBatchCampaign_batchId_chunkIndex_key" ON "CampaignExecutionBatchCampaign"("batchId", "chunkIndex");
CREATE UNIQUE INDEX "CampaignExecutionBatchCampaign_clientId_campaignId_key" ON "CampaignExecutionBatchCampaign"("clientId", "campaignId");
CREATE INDEX "CampaignExecutionBatchCampaign_clientId_batchId_chunkIndex_idx" ON "CampaignExecutionBatchCampaign"("clientId", "batchId", "chunkIndex");

CREATE UNIQUE INDEX "CampaignExecutionJob_clientId_idempotencyKey_key" ON "CampaignExecutionJob"("clientId", "idempotencyKey");
CREATE INDEX "CampaignExecutionJob_clientId_status_eligibleAt_sequence_idx" ON "CampaignExecutionJob"("clientId", "status", "eligibleAt", "sequence");
CREATE INDEX "CampaignExecutionJob_clientId_campaignId_idx" ON "CampaignExecutionJob"("clientId", "campaignId");
CREATE INDEX "CampaignExecutionJob_batchId_chunkIndex_idx" ON "CampaignExecutionJob"("batchId", "chunkIndex");
CREATE INDEX "CampaignExecutionJob_leaseExpiresAt_idx" ON "CampaignExecutionJob"("leaseExpiresAt");

CREATE UNIQUE INDEX "TenantCampaignExecutionLease_clientId_key" ON "TenantCampaignExecutionLease"("clientId");
CREATE INDEX "TenantCampaignExecutionLease_expiresAt_idx" ON "TenantCampaignExecutionLease"("expiresAt");

ALTER TABLE "CampaignExecutionBatch" ADD CONSTRAINT "CampaignExecutionBatch_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CampaignExecutionBatchCampaign" ADD CONSTRAINT "CampaignExecutionBatchCampaign_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignExecutionBatchCampaign" ADD CONSTRAINT "CampaignExecutionBatchCampaign_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "CampaignExecutionBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignExecutionBatchCampaign" ADD CONSTRAINT "CampaignExecutionBatchCampaign_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CampaignExecutionJob" ADD CONSTRAINT "CampaignExecutionJob_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignExecutionJob" ADD CONSTRAINT "CampaignExecutionJob_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignExecutionJob" ADD CONSTRAINT "CampaignExecutionJob_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "CampaignExecutionBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TenantCampaignExecutionLease" ADD CONSTRAINT "TenantCampaignExecutionLease_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
