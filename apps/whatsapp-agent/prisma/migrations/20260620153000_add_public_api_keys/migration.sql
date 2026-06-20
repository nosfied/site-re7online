CREATE TABLE "PublicApiKey" (
  "id" TEXT NOT NULL,
  "clientId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "keyPrefix" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "scopes" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "rateLimitPerMinute" INTEGER,
  "lastUsedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "revokedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PublicApiKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PublicApiKey_keyHash_key" ON "PublicApiKey"("keyHash");
CREATE INDEX "PublicApiKey_clientId_status_idx" ON "PublicApiKey"("clientId", "status");
CREATE INDEX "PublicApiKey_clientId_createdAt_idx" ON "PublicApiKey"("clientId", "createdAt");
CREATE INDEX "PublicApiKey_keyPrefix_idx" ON "PublicApiKey"("keyPrefix");
CREATE INDEX "PublicApiKey_expiresAt_idx" ON "PublicApiKey"("expiresAt");

ALTER TABLE "PublicApiKey"
  ADD CONSTRAINT "PublicApiKey_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
