CREATE TABLE "WebhookEndpoint" (
  "id" TEXT NOT NULL,
  "clientId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "signingSecretHash" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebhookDelivery" (
  "id" TEXT NOT NULL,
  "clientId" UUID NOT NULL,
  "endpointId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebhookAttempt" (
  "id" TEXT NOT NULL,
  "clientId" UUID NOT NULL,
  "deliveryId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "responseCode" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WebhookAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebhookEndpoint_clientId_active_idx" ON "WebhookEndpoint"("clientId", "active");
CREATE INDEX "WebhookEndpoint_clientId_createdAt_idx" ON "WebhookEndpoint"("clientId", "createdAt");

CREATE INDEX "WebhookDelivery_clientId_status_createdAt_idx" ON "WebhookDelivery"("clientId", "status", "createdAt");
CREATE INDEX "WebhookDelivery_endpointId_status_createdAt_idx" ON "WebhookDelivery"("endpointId", "status", "createdAt");
CREATE INDEX "WebhookDelivery_eventType_createdAt_idx" ON "WebhookDelivery"("eventType", "createdAt");

CREATE UNIQUE INDEX "WebhookAttempt_deliveryId_attemptNumber_key" ON "WebhookAttempt"("deliveryId", "attemptNumber");
CREATE INDEX "WebhookAttempt_clientId_status_createdAt_idx" ON "WebhookAttempt"("clientId", "status", "createdAt");
CREATE INDEX "WebhookAttempt_deliveryId_createdAt_idx" ON "WebhookAttempt"("deliveryId", "createdAt");

ALTER TABLE "WebhookEndpoint"
  ADD CONSTRAINT "WebhookEndpoint_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WebhookDelivery"
  ADD CONSTRAINT "WebhookDelivery_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WebhookDelivery"
  ADD CONSTRAINT "WebhookDelivery_endpointId_fkey"
  FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WebhookAttempt"
  ADD CONSTRAINT "WebhookAttempt_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WebhookAttempt"
  ADD CONSTRAINT "WebhookAttempt_deliveryId_fkey"
  FOREIGN KEY ("deliveryId") REFERENCES "WebhookDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
