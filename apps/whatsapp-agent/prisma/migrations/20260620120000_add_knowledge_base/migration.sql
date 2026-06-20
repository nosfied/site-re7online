CREATE TABLE "KnowledgeBaseCollection" (
  "id" TEXT NOT NULL,
  "clientId" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "visibility" TEXT NOT NULL DEFAULT 'internal',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "KnowledgeBaseCollection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnowledgeBaseArticle" (
  "id" TEXT NOT NULL,
  "clientId" UUID NOT NULL,
  "collectionId" TEXT,
  "key" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "question" TEXT,
  "body" TEXT NOT NULL,
  "tags" JSONB,
  "intentKeys" JSONB,
  "sourceType" TEXT NOT NULL DEFAULT 'manual',
  "sourceNote" TEXT,
  "sourceUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "visibility" TEXT NOT NULL DEFAULT 'internal',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  "publishedByUserId" TEXT,
  "publishedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "KnowledgeBaseArticle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KnowledgeBaseCollection_clientId_key_key" ON "KnowledgeBaseCollection"("clientId", "key");
CREATE INDEX "KnowledgeBaseCollection_clientId_status_idx" ON "KnowledgeBaseCollection"("clientId", "status");
CREATE INDEX "KnowledgeBaseCollection_clientId_updatedAt_idx" ON "KnowledgeBaseCollection"("clientId", "updatedAt");

CREATE UNIQUE INDEX "KnowledgeBaseArticle_clientId_key_key" ON "KnowledgeBaseArticle"("clientId", "key");
CREATE INDEX "KnowledgeBaseArticle_clientId_status_idx" ON "KnowledgeBaseArticle"("clientId", "status");
CREATE INDEX "KnowledgeBaseArticle_clientId_collectionId_idx" ON "KnowledgeBaseArticle"("clientId", "collectionId");
CREATE INDEX "KnowledgeBaseArticle_clientId_updatedAt_idx" ON "KnowledgeBaseArticle"("clientId", "updatedAt");

ALTER TABLE "KnowledgeBaseCollection"
  ADD CONSTRAINT "KnowledgeBaseCollection_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KnowledgeBaseArticle"
  ADD CONSTRAINT "KnowledgeBaseArticle_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KnowledgeBaseArticle"
  ADD CONSTRAINT "KnowledgeBaseArticle_collectionId_fkey"
  FOREIGN KEY ("collectionId") REFERENCES "KnowledgeBaseCollection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
