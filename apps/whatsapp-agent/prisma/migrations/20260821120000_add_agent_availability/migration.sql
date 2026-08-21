CREATE TABLE "AgentAvailability" (
  "id" TEXT NOT NULL,
  "clientId" UUID NOT NULL,
  "userId" TEXT NOT NULL,
  "available" BOOLEAN NOT NULL DEFAULT false,
  "lastHeartbeatAt" TIMESTAMP(3),
  "availabilityChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AgentAvailability_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentAvailability_clientId_userId_key" ON "AgentAvailability"("clientId", "userId");
CREATE INDEX "AgentAvailability_clientId_available_lastHeartbeatAt_idx" ON "AgentAvailability"("clientId", "available", "lastHeartbeatAt");
CREATE INDEX "AgentAvailability_userId_idx" ON "AgentAvailability"("userId");

ALTER TABLE "AgentAvailability"
  ADD CONSTRAINT "AgentAvailability_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentAvailability"
  ADD CONSTRAINT "AgentAvailability_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
