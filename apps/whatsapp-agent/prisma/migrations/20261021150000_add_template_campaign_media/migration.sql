-- Additive persistence for tenant-scoped WhatsApp template/campaign media.
ALTER TABLE "Template"
  ADD COLUMN "components" JSONB,
  ADD COLUMN "headerType" TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN "exampleMediaId" TEXT;

ALTER TABLE "TemplateRequest"
  ADD COLUMN "components" JSONB,
  ADD COLUMN "headerType" TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN "exampleMediaId" TEXT;

ALTER TABLE "Campaign"
  ADD COLUMN "templateMediaAssetId" TEXT,
  ADD COLUMN "templateMediaSnapshot" JSONB;

CREATE TABLE "TemplateMediaAsset" (
  "id" TEXT NOT NULL,
  "clientId" UUID NOT NULL,
  "purpose" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "originalFilename" TEXT,
  "state" TEXT NOT NULL DEFAULT 'stored',
  "metaHandle" TEXT,
  "metaHandleCreatedAt" TIMESTAMP(3),
  "metaMediaId" TEXT,
  "metaMediaUploadedAt" TIMESTAMP(3),
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TemplateMediaAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TemplateMediaAsset_storageKey_key" ON "TemplateMediaAsset"("storageKey");
CREATE UNIQUE INDEX "TemplateMediaAsset_clientId_id_key" ON "TemplateMediaAsset"("clientId", "id");
CREATE INDEX "TemplateMediaAsset_clientId_purpose_createdAt_idx" ON "TemplateMediaAsset"("clientId", "purpose", "createdAt");
CREATE INDEX "TemplateMediaAsset_clientId_sha256_idx" ON "TemplateMediaAsset"("clientId", "sha256");
CREATE INDEX "TemplateMediaAsset_state_updatedAt_idx" ON "TemplateMediaAsset"("state", "updatedAt");
CREATE INDEX "Template_clientId_exampleMediaId_idx" ON "Template"("clientId", "exampleMediaId");
CREATE INDEX "TemplateRequest_clientId_exampleMediaId_idx" ON "TemplateRequest"("clientId", "exampleMediaId");
CREATE INDEX "Campaign_clientId_templateMediaAssetId_idx" ON "Campaign"("clientId", "templateMediaAssetId");

ALTER TABLE "TemplateMediaAsset" ADD CONSTRAINT "TemplateMediaAsset_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Template" ADD CONSTRAINT "Template_clientId_exampleMediaId_fkey"
  FOREIGN KEY ("clientId", "exampleMediaId") REFERENCES "TemplateMediaAsset"("clientId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TemplateRequest" ADD CONSTRAINT "TemplateRequest_clientId_exampleMediaId_fkey"
  FOREIGN KEY ("clientId", "exampleMediaId") REFERENCES "TemplateMediaAsset"("clientId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_clientId_templateMediaAssetId_fkey"
  FOREIGN KEY ("clientId", "templateMediaAssetId") REFERENCES "TemplateMediaAsset"("clientId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
