-- Web Push subscriptions for Converta PWA.
-- Stores only browser subscription keys scoped to tenant/user; no message content.
CREATE TABLE "PushSubscription" (
  "id" TEXT NOT NULL,
  "clientId" UUID NOT NULL,
  "userId" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "userAgent" TEXT,
  "deviceLabel" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),

  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_clientId_userId_revokedAt_idx" ON "PushSubscription"("clientId", "userId", "revokedAt");
CREATE INDEX "PushSubscription_clientId_revokedAt_idx" ON "PushSubscription"("clientId", "revokedAt");
CREATE INDEX "PushSubscription_updatedAt_idx" ON "PushSubscription"("updatedAt");

ALTER TABLE "PushSubscription"
  ADD CONSTRAINT "PushSubscription_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PushSubscription"
  ADD CONSTRAINT "PushSubscription_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
