-- CreateTable
CREATE TABLE "TenantOperationalConfig" (
    "id" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "config" JSONB NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantOperationalConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantOperationalConfig_clientId_key" ON "TenantOperationalConfig"("clientId");

-- AddForeignKey
ALTER TABLE "TenantOperationalConfig"
ADD CONSTRAINT "TenantOperationalConfig_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
