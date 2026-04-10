ALTER TABLE "Template"
ADD COLUMN "submittedCategory" TEXT,
ADD COLUMN "wasRecategorized" BOOLEAN NOT NULL DEFAULT false;
