CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "variables" JSONB,
    "metaTemplateId" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TemplateRequest" (
    "id" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "variables" JSONB,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Template_clientId_status_idx" ON "Template"("clientId", "status");
CREATE INDEX "Template_clientId_name_idx" ON "Template"("clientId", "name");
CREATE UNIQUE INDEX "Template_clientId_name_key" ON "Template"("clientId", "name");
CREATE INDEX "TemplateRequest_clientId_status_idx" ON "TemplateRequest"("clientId", "status");

ALTER TABLE "Template"
ADD CONSTRAINT "Template_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TemplateRequest"
ADD CONSTRAINT "TemplateRequest_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
