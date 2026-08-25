CREATE TYPE "ContactLifecycleStatus" AS ENUM ('PROVISIONAL', 'ACTIVE');

ALTER TABLE "Contact"
ADD COLUMN "lifecycle" "ContactLifecycleStatus" NOT NULL DEFAULT 'ACTIVE';

CREATE INDEX "Contact_clientId_lifecycle_idx" ON "Contact"("clientId", "lifecycle");
