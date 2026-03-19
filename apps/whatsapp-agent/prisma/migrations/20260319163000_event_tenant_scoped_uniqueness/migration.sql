-- Make Event uniqueness tenant-scoped to avoid cross-tenant requestId collisions.
DROP INDEX IF EXISTS "Event_eventName_requestId_key";

CREATE INDEX "Event_clientId_eventName_createdAt_idx"
ON "Event"("clientId", "eventName", "createdAt");

CREATE UNIQUE INDEX "Event_clientId_eventName_requestId_key"
ON "Event"("clientId", "eventName", "requestId");
