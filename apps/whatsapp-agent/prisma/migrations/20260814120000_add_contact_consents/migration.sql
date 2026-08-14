-- CreateTable
CREATE TABLE "ContactConsent" (
    "id" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "contactId" UUID,
    "leadId" TEXT,
    "purpose" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sourceChannel" TEXT,
    "sourceProvider" TEXT,
    "source" TEXT,
    "textVersion" TEXT,
    "textHash" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactConsent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactConsent_clientId_purpose_status_idx" ON "ContactConsent"("clientId", "purpose", "status");

-- CreateIndex
CREATE INDEX "ContactConsent_clientId_contactId_purpose_status_idx" ON "ContactConsent"("clientId", "contactId", "purpose", "status");

-- CreateIndex
CREATE INDEX "ContactConsent_clientId_leadId_purpose_status_idx" ON "ContactConsent"("clientId", "leadId", "purpose", "status");

-- CreateIndex
CREATE INDEX "ContactConsent_clientId_updatedAt_idx" ON "ContactConsent"("clientId", "updatedAt");

-- AddForeignKey
ALTER TABLE "ContactConsent" ADD CONSTRAINT "ContactConsent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactConsent" ADD CONSTRAINT "ContactConsent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactConsent" ADD CONSTRAINT "ContactConsent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
