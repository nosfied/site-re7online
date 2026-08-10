-- CreateEnum
CREATE TYPE "TrainingContentType" AS ENUM ('VIDEO', 'PDF');

-- CreateEnum
CREATE TYPE "TrainingContentStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "TrainingContent" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "type" "TrainingContentType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "TrainingContentStatus" NOT NULL DEFAULT 'DRAFT',
    "storageKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "downloadable" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingContent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrainingContent_contentId_key" ON "TrainingContent"("contentId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingContent_storageKey_key" ON "TrainingContent"("storageKey");

-- CreateIndex
CREATE INDEX "TrainingContent_status_idx" ON "TrainingContent"("status");

-- CreateIndex
CREATE INDEX "TrainingContent_category_sortOrder_idx" ON "TrainingContent"("category", "sortOrder");
