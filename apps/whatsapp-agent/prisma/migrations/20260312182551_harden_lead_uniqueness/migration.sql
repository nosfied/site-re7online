-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Lead_tenantId_waId_key" ON "Lead"("tenantId", "waId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Lead_tenantId_createdAt_idx" ON "Lead"("tenantId", "createdAt");
