-- SPRINT 65X - DRAFT ONLY / DO NOT APPLY
--
-- Purpose:
--   Draft SQL generated from the Prisma schema proposal for multichannel
--   persistence. This file is intentionally outside prisma/migrations.
--
-- Safety:
--   DO NOT run this in production.
--   DO NOT run prisma migrate deploy for this sprint.
--   Review with architecture/DB owner before creating an official migration.
--
-- Generated with:
--   npx prisma migrate diff \
--     --from-schema-datamodel /tmp/re7-wa-schema-before-65x.prisma \
--     --to-schema-datamodel prisma/schema.prisma \
--     --script
--
-- Review adjustment in 65Y:
--   Nullable multichannel uniqueness is represented as partial unique indexes
--   in SQL, not as Prisma @@unique. This avoids misleading nullable unique
--   behavior and keeps legacy WhatsApp rows with null channel fields safe.

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN "channel" TEXT,
ADD COLUMN "channelAccountId" TEXT,
ADD COLUMN "externalUserHash" TEXT,
ADD COLUMN "externalUserRef" TEXT,
ADD COLUMN "legacyWaId" TEXT,
ADD COLUMN "provider" TEXT;

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "channel" TEXT,
ADD COLUMN "channelAccountId" TEXT,
ADD COLUMN "externalUserHash" TEXT,
ADD COLUMN "externalUserRef" TEXT,
ADD COLUMN "legacyWaId" TEXT,
ADD COLUMN "provider" TEXT;

-- AlterTable
ALTER TABLE "InboundMessage" ADD COLUMN "channel" TEXT,
ADD COLUMN "channelAccountId" TEXT,
ADD COLUMN "externalMessageId" TEXT,
ADD COLUMN "externalUserHash" TEXT,
ADD COLUMN "externalUserRef" TEXT,
ADD COLUMN "legacyWaId" TEXT,
ADD COLUMN "provider" TEXT;

-- AlterTable
ALTER TABLE "OutboundMessage" ADD COLUMN "channel" TEXT,
ADD COLUMN "channelAccountId" TEXT,
ADD COLUMN "externalMessageId" TEXT,
ADD COLUMN "externalUserHash" TEXT,
ADD COLUMN "externalUserRef" TEXT,
ADD COLUMN "legacyWaId" TEXT,
ADD COLUMN "provider" TEXT;

-- AlterTable
ALTER TABLE "ConversationRuntimeState" ADD COLUMN "channel" TEXT,
ADD COLUMN "channelAccountId" TEXT,
ADD COLUMN "externalUserHash" TEXT,
ADD COLUMN "externalUserRef" TEXT,
ADD COLUMN "legacyWaId" TEXT,
ADD COLUMN "provider" TEXT;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "channel" TEXT,
ADD COLUMN "channelAccountId" TEXT,
ADD COLUMN "contactChannelIdentityId" TEXT,
ADD COLUMN "externalUserHash" TEXT,
ADD COLUMN "externalUserRef" TEXT,
ADD COLUMN "legacyWaId" TEXT,
ADD COLUMN "provider" TEXT;

-- CreateTable
CREATE TABLE "ContactChannelIdentity" (
    "id" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "contactId" UUID,
    "channel" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "channelAccountId" TEXT NOT NULL,
    "externalUserHash" TEXT NOT NULL,
    "externalUserRef" TEXT,
    "legacyWaId" TEXT,
    "displayName" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactChannelIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactChannelIdentity_clientId_contactId_idx" ON "ContactChannelIdentity"("clientId", "contactId");

-- CreateIndex
CREATE INDEX "ContactChannelIdentity_clientId_channel_provider_channelAcc_idx" ON "ContactChannelIdentity"("clientId", "channel", "provider", "channelAccountId");

-- CreateIndex
CREATE INDEX "ContactChannelIdentity_clientId_lastSeenAt_idx" ON "ContactChannelIdentity"("clientId", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContactChannelIdentity_clientId_channel_provider_channelAcc_key" ON "ContactChannelIdentity"("clientId", "channel", "provider", "channelAccountId", "externalUserHash");

-- CreateIndex
CREATE INDEX "Contact_clientId_channel_provider_channelAccountId_idx" ON "Contact"("clientId", "channel", "provider", "channelAccountId");

-- CreatePartialUniqueIndex
-- Prisma schema cannot represent this partial unique index. Keep it as reviewed SQL.
CREATE UNIQUE INDEX "Contact_multichannel_identity_uniq"
ON "Contact"("clientId", "channel", "provider", "channelAccountId", "externalUserHash")
WHERE "channel" IS NOT NULL
  AND "provider" IS NOT NULL
  AND "channelAccountId" IS NOT NULL
  AND "externalUserHash" IS NOT NULL;

-- CreateIndex
CREATE INDEX "Conversation_clientId_channel_provider_channelAccountId_ext_idx" ON "Conversation"("clientId", "channel", "provider", "channelAccountId", "externalUserHash");

-- CreateIndex
CREATE INDEX "Conversation_clientId_channel_updatedAt_idx" ON "Conversation"("clientId", "channel", "updatedAt");

-- CreateIndex
CREATE INDEX "Conversation_clientId_channel_closedAt_idx" ON "Conversation"("clientId", "channel", "closedAt");

-- CreateIndex
CREATE INDEX "Conversation_clientId_channel_deletedAt_idx" ON "Conversation"("clientId", "channel", "deletedAt");

-- CreatePartialUniqueIndex
-- Prisma schema cannot represent this partial unique index. Keep it as reviewed SQL.
CREATE UNIQUE INDEX "Conversation_multichannel_identity_uniq"
ON "Conversation"("clientId", "channel", "provider", "channelAccountId", "externalUserHash")
WHERE "channel" IS NOT NULL
  AND "provider" IS NOT NULL
  AND "channelAccountId" IS NOT NULL
  AND "externalUserHash" IS NOT NULL;

-- CreateIndex
CREATE INDEX "InboundMessage_clientId_channel_provider_channelAccountId_e_idx" ON "InboundMessage"("clientId", "channel", "provider", "channelAccountId", "externalUserHash", "createdAt");

-- CreateIndex
CREATE INDEX "InboundMessage_clientId_channel_externalMessageId_idx" ON "InboundMessage"("clientId", "channel", "externalMessageId");

-- CreatePartialUniqueIndex
-- Prisma schema cannot represent this partial unique index. Keep it as reviewed SQL.
CREATE UNIQUE INDEX "InboundMessage_multichannel_message_uniq"
ON "InboundMessage"("clientId", "provider", "channel", "channelAccountId", "externalMessageId")
WHERE "provider" IS NOT NULL
  AND "channel" IS NOT NULL
  AND "channelAccountId" IS NOT NULL
  AND "externalMessageId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "OutboundMessage_clientId_channel_provider_channelAccountId__idx" ON "OutboundMessage"("clientId", "channel", "provider", "channelAccountId", "externalUserHash", "createdAt");

-- CreateIndex
CREATE INDEX "OutboundMessage_clientId_channel_externalMessageId_idx" ON "OutboundMessage"("clientId", "channel", "externalMessageId");

-- CreateIndex
CREATE INDEX "OutboundMessage_clientId_channel_status_createdAt_idx" ON "OutboundMessage"("clientId", "channel", "status", "createdAt");

-- CreatePartialUniqueIndex
-- Prisma schema cannot represent this partial unique index. Keep it as reviewed SQL.
CREATE UNIQUE INDEX "OutboundMessage_multichannel_message_uniq"
ON "OutboundMessage"("clientId", "provider", "channel", "channelAccountId", "externalMessageId")
WHERE "provider" IS NOT NULL
  AND "channel" IS NOT NULL
  AND "channelAccountId" IS NOT NULL
  AND "externalMessageId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "ConversationRuntimeState_clientId_channel_provider_channelA_idx" ON "ConversationRuntimeState"("clientId", "channel", "provider", "channelAccountId", "externalUserHash");

-- CreateIndex
CREATE INDEX "ConversationRuntimeState_clientId_channel_status_idx" ON "ConversationRuntimeState"("clientId", "channel", "status");

-- CreateIndex
CREATE INDEX "ConversationRuntimeState_clientId_channel_assignedUserId_st_idx" ON "ConversationRuntimeState"("clientId", "channel", "assignedUserId", "status");

-- CreateIndex
CREATE INDEX "ConversationRuntimeState_clientId_channel_queueId_status_idx" ON "ConversationRuntimeState"("clientId", "channel", "queueId", "status");

-- CreatePartialUniqueIndex
-- Prisma schema cannot represent this partial unique index. Keep it as reviewed SQL.
CREATE UNIQUE INDEX "ConversationRuntimeState_multichannel_identity_uniq"
ON "ConversationRuntimeState"("clientId", "channel", "provider", "channelAccountId", "externalUserHash")
WHERE "channel" IS NOT NULL
  AND "provider" IS NOT NULL
  AND "channelAccountId" IS NOT NULL
  AND "externalUserHash" IS NOT NULL;

-- CreateIndex
CREATE INDEX "Lead_tenantId_channel_provider_channelAccountId_externalUse_idx" ON "Lead"("tenantId", "channel", "provider", "channelAccountId", "externalUserHash");

-- CreateIndex
CREATE INDEX "Lead_tenantId_channel_createdAt_idx" ON "Lead"("tenantId", "channel", "createdAt");

-- CreateIndex
CREATE INDEX "Lead_tenantId_contactChannelIdentityId_idx" ON "Lead"("tenantId", "contactChannelIdentityId");

-- CreatePartialUniqueIndex
-- Prisma schema cannot represent this partial unique index. Keep it as reviewed SQL.
CREATE UNIQUE INDEX "Lead_multichannel_identity_uniq"
ON "Lead"("tenantId", "channel", "provider", "channelAccountId", "externalUserHash")
WHERE "channel" IS NOT NULL
  AND "provider" IS NOT NULL
  AND "channelAccountId" IS NOT NULL
  AND "externalUserHash" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "ContactChannelIdentity" ADD CONSTRAINT "ContactChannelIdentity_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactChannelIdentity" ADD CONSTRAINT "ContactChannelIdentity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_contactChannelIdentityId_fkey" FOREIGN KEY ("contactChannelIdentityId") REFERENCES "ContactChannelIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Rollback sketch for review only:
--   1. Drop foreign keys added above.
--   2. Drop indexes added above.
--   3. Drop "ContactChannelIdentity".
--   4. Drop nullable multichannel columns.
-- This rollback must be converted into an explicit reviewed SQL rollback before any real migration.
