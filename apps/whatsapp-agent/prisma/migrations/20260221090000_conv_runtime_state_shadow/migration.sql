-- CreateEnum
CREATE TYPE "HandoffStatus" AS ENUM ('NONE', 'PENDING', 'ACTIVE');

-- CreateTable
CREATE TABLE "ConversationRuntimeState" (
    "id" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "waId" TEXT NOT NULL,
    "windowIsOpen" BOOLEAN NOT NULL DEFAULT true,
    "windowExpiresAt" TIMESTAMP(3),
    "lastInboundAt" TIMESTAMP(3),
    "lastOutboundAt" TIMESTAMP(3),
    "intent" TEXT,
    "handoffStatus" "HandoffStatus" NOT NULL DEFAULT 'NONE',
    "handoffRequestedAt" TIMESTAMP(3),
    "handoffActivatedAt" TIMESTAMP(3),
    "handoffReleasedAt" TIMESTAMP(3),
    "leadRequestedAt" TIMESTAMP(3),
    "leadCapturedAt" TIMESTAMP(3),
    "demoStatus" TEXT,
    "lastDemoRequestedAt" TIMESTAMP(3),
    "lastDemoScheduledAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationRuntimeState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConversationRuntimeState_clientId_waId_idx" ON "ConversationRuntimeState"("clientId", "waId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationRuntimeState_clientId_waId_key" ON "ConversationRuntimeState"("clientId", "waId");

-- AddForeignKey
ALTER TABLE "ConversationRuntimeState" ADD CONSTRAINT "ConversationRuntimeState_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
