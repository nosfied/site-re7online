CREATE TABLE "RetentionConfig" (
    "id" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "retentionDays" INTEGER NOT NULL DEFAULT 90,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetentionConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RetentionConfig_clientId_key" ON "RetentionConfig"("clientId");

ALTER TABLE "RetentionConfig" ADD CONSTRAINT "RetentionConfig_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
