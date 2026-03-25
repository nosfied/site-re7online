CREATE TABLE "TenantMetaConfig" (
    "id" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "businessToken" TEXT,
    "businessId" TEXT,
    "businessPortfolioId" TEXT,
    "wabaId" TEXT,
    "phoneNumberId" TEXT,
    "rawPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantMetaConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantMetaConfig_clientId_key" ON "TenantMetaConfig"("clientId");
CREATE INDEX "TenantMetaConfig_phoneNumberId_idx" ON "TenantMetaConfig"("phoneNumberId");
CREATE INDEX "TenantMetaConfig_wabaId_idx" ON "TenantMetaConfig"("wabaId");

ALTER TABLE "TenantMetaConfig"
ADD CONSTRAINT "TenantMetaConfig_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
