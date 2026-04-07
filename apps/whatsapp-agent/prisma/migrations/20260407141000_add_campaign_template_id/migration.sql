ALTER TABLE "Campaign"
ADD COLUMN "templateId" TEXT;

CREATE INDEX "Campaign_templateId_idx" ON "Campaign"("templateId");

ALTER TABLE "Campaign"
ADD CONSTRAINT "Campaign_templateId_fkey"
FOREIGN KEY ("templateId") REFERENCES "Template"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
