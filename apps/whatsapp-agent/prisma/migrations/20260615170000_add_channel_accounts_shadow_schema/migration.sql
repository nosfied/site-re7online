-- Additive schema for future DB-first channel account migration.
-- Runtime remains JSON-first until an explicit later sprint enables DB reads.

CREATE TABLE "ChannelAccount" (
    "id" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "displayName" TEXT,
    "channelAccountId" TEXT NOT NULL,
    "externalAccountIds" JSONB,
    "externalBusinessId" TEXT,
    "metadata" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "automationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "runtimeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "inboundPersistenceEnabled" BOOLEAN NOT NULL DEFAULT false,
    "outboundEnabled" BOOLEAN NOT NULL DEFAULT false,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "handoffEnabled" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "tokenStatus" TEXT NOT NULL DEFAULT 'missing',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChannelAccountAlias" (
    "id" TEXT NOT NULL,
    "channelAccountId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "aliasType" TEXT NOT NULL DEFAULT 'externalAccountId',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelAccountAlias_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChannelAccountSecret" (
    "id" TEXT NOT NULL,
    "channelAccountId" TEXT NOT NULL,
    "secretKind" TEXT NOT NULL,
    "secretHash" TEXT,
    "secretCiphertext" TEXT,
    "encryptionKeyRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'missing',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelAccountSecret_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChannelAccount_clientId_provider_channel_channelAccountId_key"
ON "ChannelAccount"("clientId", "provider", "channel", "channelAccountId");

CREATE INDEX "ChannelAccount_clientId_channel_provider_idx"
ON "ChannelAccount"("clientId", "channel", "provider");

CREATE INDEX "ChannelAccount_channel_provider_channelAccountId_idx"
ON "ChannelAccount"("channel", "provider", "channelAccountId");

CREATE INDEX "ChannelAccount_status_idx"
ON "ChannelAccount"("status");

CREATE UNIQUE INDEX "ChannelAccountAlias_channelAccountId_alias_key"
ON "ChannelAccountAlias"("channelAccountId", "alias");

CREATE INDEX "ChannelAccountAlias_alias_idx"
ON "ChannelAccountAlias"("alias");

CREATE INDEX "ChannelAccountAlias_aliasType_idx"
ON "ChannelAccountAlias"("aliasType");

CREATE UNIQUE INDEX "ChannelAccountSecret_channelAccountId_secretKind_key"
ON "ChannelAccountSecret"("channelAccountId", "secretKind");

CREATE INDEX "ChannelAccountSecret_secretKind_status_idx"
ON "ChannelAccountSecret"("secretKind", "status");

CREATE INDEX "ChannelAccountSecret_secretHash_idx"
ON "ChannelAccountSecret"("secretHash");

ALTER TABLE "ChannelAccount"
ADD CONSTRAINT "ChannelAccount_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChannelAccountAlias"
ADD CONSTRAINT "ChannelAccountAlias_channelAccountId_fkey"
FOREIGN KEY ("channelAccountId") REFERENCES "ChannelAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChannelAccountSecret"
ADD CONSTRAINT "ChannelAccountSecret_channelAccountId_fkey"
FOREIGN KEY ("channelAccountId") REFERENCES "ChannelAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
