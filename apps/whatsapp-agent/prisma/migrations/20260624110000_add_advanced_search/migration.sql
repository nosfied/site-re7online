-- CreateTable
CREATE TABLE "SearchIndex" (
    "id" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT,
    "channel" TEXT,
    "source" TEXT,
    "language" TEXT,
    "searchVector" tsvector,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchIndex_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SearchIndex_clientId_entityType_entityId_key" ON "SearchIndex"("clientId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "SearchIndex_clientId_entityType_createdAt_idx" ON "SearchIndex"("clientId", "entityType", "createdAt");

-- CreateIndex
CREATE INDEX "SearchIndex_clientId_channel_createdAt_idx" ON "SearchIndex"("clientId", "channel", "createdAt");

-- CreateIndex
CREATE INDEX "SearchIndex_clientId_source_createdAt_idx" ON "SearchIndex"("clientId", "source", "createdAt");

-- CreateIndex
CREATE INDEX "SearchIndex_clientId_language_idx" ON "SearchIndex"("clientId", "language");

-- CreateIndex
CREATE INDEX "SearchIndex_clientId_createdAt_idx" ON "SearchIndex"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "SearchIndex_searchVector_idx" ON "SearchIndex" USING GIN ("searchVector");

-- AddForeignKey
ALTER TABLE "SearchIndex" ADD CONSTRAINT "SearchIndex_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
