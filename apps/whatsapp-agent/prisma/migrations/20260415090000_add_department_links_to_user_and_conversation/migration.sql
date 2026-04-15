ALTER TABLE "Department"
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "User"
ADD COLUMN "departmentId" TEXT;

ALTER TABLE "Conversation"
ADD COLUMN "departmentId" TEXT;

CREATE INDEX "User_clientId_departmentId_idx" ON "User"("clientId", "departmentId");
CREATE INDEX "Conversation_clientId_departmentId_idx" ON "Conversation"("clientId", "departmentId");

ALTER TABLE "User"
ADD CONSTRAINT "User_departmentId_fkey"
FOREIGN KEY ("departmentId") REFERENCES "Department"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Conversation"
ADD CONSTRAINT "Conversation_departmentId_fkey"
FOREIGN KEY ("departmentId") REFERENCES "Department"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
