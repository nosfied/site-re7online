CREATE TABLE "CompletedServiceSnapshot" (
  "id" TEXT NOT NULL,
  "clientId" UUID NOT NULL,
  "conversationId" TEXT,
  "cycleId" TEXT NOT NULL,
  "protocol" TEXT NOT NULL,
  "closedAt" TIMESTAMP(3) NOT NULL,
  "assignedUserId" TEXT,
  "departmentId" TEXT,
  "queueId" TEXT,
  "closedByUserId" TEXT,
  "closeReason" TEXT,
  "closeSource" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CompletedServiceSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompletedServiceSnapshot_clientId_cycleId_key"
  ON "CompletedServiceSnapshot"("clientId", "cycleId");

CREATE INDEX "CompletedServiceSnapshot_clientId_closedAt_idx"
  ON "CompletedServiceSnapshot"("clientId", "closedAt");

CREATE INDEX "CompletedServiceSnapshot_clientId_assignedUserId_closedAt_idx"
  ON "CompletedServiceSnapshot"("clientId", "assignedUserId", "closedAt");

CREATE INDEX "CompletedServiceSnapshot_clientId_departmentId_closedAt_idx"
  ON "CompletedServiceSnapshot"("clientId", "departmentId", "closedAt");

CREATE INDEX "CompletedServiceSnapshot_clientId_departmentId_assignedUserId_closedAt_idx"
  ON "CompletedServiceSnapshot"("clientId", "departmentId", "assignedUserId", "closedAt");

ALTER TABLE "CompletedServiceSnapshot"
  ADD CONSTRAINT "CompletedServiceSnapshot_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
