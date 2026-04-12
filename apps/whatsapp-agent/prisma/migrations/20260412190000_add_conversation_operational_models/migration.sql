CREATE TYPE "ConversationOperationalStatus" AS ENUM ('WAITING', 'IN_PROGRESS', 'WAITING_USER', 'CLOSED');

CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Queue" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Queue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversationAssignment" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "fromUserId" TEXT,
    "toUserId" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationAssignment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ConversationRuntimeState"
ADD COLUMN "departmentId" TEXT,
ADD COLUMN "queueId" TEXT,
ADD COLUMN "status" "ConversationOperationalStatus",
ADD COLUMN "closedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Department_clientId_name_key" ON "Department"("clientId", "name");
CREATE INDEX "Department_clientId_createdAt_idx" ON "Department"("clientId", "createdAt");

CREATE UNIQUE INDEX "Queue_clientId_departmentId_name_key" ON "Queue"("clientId", "departmentId", "name");
CREATE INDEX "Queue_clientId_createdAt_idx" ON "Queue"("clientId", "createdAt");
CREATE INDEX "Queue_departmentId_createdAt_idx" ON "Queue"("departmentId", "createdAt");

CREATE INDEX "ConversationAssignment_conversationId_assignedAt_idx" ON "ConversationAssignment"("conversationId", "assignedAt");

CREATE INDEX "ConversationRuntimeState_clientId_status_idx" ON "ConversationRuntimeState"("clientId", "status");
CREATE INDEX "ConversationRuntimeState_clientId_assignedUserId_status_idx" ON "ConversationRuntimeState"("clientId", "assignedUserId", "status");
CREATE INDEX "ConversationRuntimeState_clientId_queueId_status_idx" ON "ConversationRuntimeState"("clientId", "queueId", "status");

ALTER TABLE "Department"
ADD CONSTRAINT "Department_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Queue"
ADD CONSTRAINT "Queue_departmentId_fkey"
FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Queue"
ADD CONSTRAINT "Queue_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConversationAssignment"
ADD CONSTRAINT "ConversationAssignment_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "ConversationRuntimeState"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConversationRuntimeState"
ADD CONSTRAINT "ConversationRuntimeState_departmentId_fkey"
FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ConversationRuntimeState"
ADD CONSTRAINT "ConversationRuntimeState_queueId_fkey"
FOREIGN KEY ("queueId") REFERENCES "Queue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "Department" ("id", "name", "clientId", "createdAt")
SELECT 'dept-default-' || replace("id"::text, '-', ''), 'Atendimento', "id", CURRENT_TIMESTAMP
FROM "Client"
ON CONFLICT ("clientId", "name") DO NOTHING;

INSERT INTO "Queue" ("id", "name", "departmentId", "clientId", "createdAt")
SELECT
  'queue-default-' || replace(d."clientId"::text, '-', ''),
  'Fila Geral',
  d."id",
  d."clientId",
  CURRENT_TIMESTAMP
FROM "Department" d
WHERE d."name" = 'Atendimento'
  AND NOT EXISTS (
    SELECT 1
    FROM "Queue" q
    WHERE q."clientId" = d."clientId"
      AND q."departmentId" = d."id"
      AND q."name" = 'Fila Geral'
  );
