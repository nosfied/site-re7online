CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "blockedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Campaign_clientId_createdAt_idx" ON "Campaign"("clientId", "createdAt");
CREATE INDEX "Campaign_clientId_status_createdAt_idx" ON "Campaign"("clientId", "status", "createdAt");

ALTER TABLE "Campaign"
ADD CONSTRAINT "Campaign_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
