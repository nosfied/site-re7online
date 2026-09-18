-- Phase 1: nullable explicit Department -> operational Queue relationship.
ALTER TABLE "Department" ADD COLUMN "operationalQueueId" TEXT;

CREATE UNIQUE INDEX "Queue_clientId_departmentId_id_key"
ON "Queue"("clientId", "departmentId", "id");

CREATE INDEX "Department_operationalQueueId_idx"
ON "Department"("operationalQueueId");

ALTER TABLE "Department"
ADD CONSTRAINT "Department_operationalQueue_fkey"
FOREIGN KEY ("clientId", "id", "operationalQueueId")
REFERENCES "Queue"("clientId", "departmentId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
