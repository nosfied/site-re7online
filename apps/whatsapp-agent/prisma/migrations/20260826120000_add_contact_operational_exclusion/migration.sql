ALTER TABLE "Contact" ADD COLUMN "operationallyExcludedAt" TIMESTAMP(3);

CREATE INDEX "Contact_clientId_operationallyExcludedAt_idx" ON "Contact"("clientId", "operationallyExcludedAt");
