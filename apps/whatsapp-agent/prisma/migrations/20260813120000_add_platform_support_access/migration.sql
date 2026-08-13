-- CreateTable
CREATE TABLE "PlatformSupportAccessGrant" (
    "id" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "grantedByUserId" TEXT NOT NULL,
    "reason" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "revokeReason" TEXT,

    CONSTRAINT "PlatformSupportAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSupportSession" (
    "id" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "actingClientId" UUID NOT NULL,
    "supportClientId" UUID NOT NULL,
    "supportUserId" TEXT NOT NULL,
    "sourceAppSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,

    CONSTRAINT "PlatformSupportSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformSupportAccessGrant_clientId_expiresAt_revokedAt_idx" ON "PlatformSupportAccessGrant"("clientId", "expiresAt", "revokedAt");

-- CreateIndex
CREATE INDEX "PlatformSupportAccessGrant_clientId_createdAt_idx" ON "PlatformSupportAccessGrant"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformSupportAccessGrant_grantedByUserId_createdAt_idx" ON "PlatformSupportAccessGrant"("grantedByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformSupportSession_actingClientId_supportUserId_endedAt_idx" ON "PlatformSupportSession"("actingClientId", "supportUserId", "endedAt");

-- CreateIndex
CREATE INDEX "PlatformSupportSession_grantId_endedAt_idx" ON "PlatformSupportSession"("grantId", "endedAt");

-- CreateIndex
CREATE INDEX "PlatformSupportSession_supportUserId_createdAt_idx" ON "PlatformSupportSession"("supportUserId", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformSupportSession_expiresAt_idx" ON "PlatformSupportSession"("expiresAt");

-- AddForeignKey
ALTER TABLE "PlatformSupportAccessGrant" ADD CONSTRAINT "PlatformSupportAccessGrant_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformSupportAccessGrant" ADD CONSTRAINT "PlatformSupportAccessGrant_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformSupportAccessGrant" ADD CONSTRAINT "PlatformSupportAccessGrant_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformSupportSession" ADD CONSTRAINT "PlatformSupportSession_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "PlatformSupportAccessGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformSupportSession" ADD CONSTRAINT "PlatformSupportSession_actingClientId_fkey" FOREIGN KEY ("actingClientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformSupportSession" ADD CONSTRAINT "PlatformSupportSession_supportUserId_fkey" FOREIGN KEY ("supportUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
