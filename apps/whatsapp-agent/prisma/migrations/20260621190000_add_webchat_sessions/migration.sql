-- CreateTable
CREATE TABLE "WebchatVisitor" (
    "id" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "siteId" TEXT NOT NULL,
    "visitorIdHash" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "metadata" JSONB,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebchatVisitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebchatSession" (
    "id" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "siteId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "originDomain" TEXT NOT NULL,
    "ipHash" TEXT,
    "userAgentHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebchatSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebchatVisitor_siteId_visitorIdHash_key" ON "WebchatVisitor"("siteId", "visitorIdHash");

-- CreateIndex
CREATE INDEX "WebchatVisitor_clientId_siteId_idx" ON "WebchatVisitor"("clientId", "siteId");

-- CreateIndex
CREATE INDEX "WebchatVisitor_clientId_updatedAt_idx" ON "WebchatVisitor"("clientId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebchatSession_tokenHash_key" ON "WebchatSession"("tokenHash");

-- CreateIndex
CREATE INDEX "WebchatSession_clientId_siteId_status_idx" ON "WebchatSession"("clientId", "siteId", "status");

-- CreateIndex
CREATE INDEX "WebchatSession_clientId_expiresAt_idx" ON "WebchatSession"("clientId", "expiresAt");

-- CreateIndex
CREATE INDEX "WebchatSession_visitorId_status_idx" ON "WebchatSession"("visitorId", "status");

-- AddForeignKey
ALTER TABLE "WebchatVisitor" ADD CONSTRAINT "WebchatVisitor_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebchatVisitor" ADD CONSTRAINT "WebchatVisitor_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "WebchatSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebchatSession" ADD CONSTRAINT "WebchatSession_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebchatSession" ADD CONSTRAINT "WebchatSession_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "WebchatSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebchatSession" ADD CONSTRAINT "WebchatSession_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "WebchatVisitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
