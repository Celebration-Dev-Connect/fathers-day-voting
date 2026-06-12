ALTER TABLE "Event"
ADD COLUMN "resultsPublishedAt" TIMESTAMP(3),
ADD COLUMN "resultsPublishedById" TEXT,
ADD COLUMN "resultsSnapshot" JSONB;

UPDATE "Event"
SET "resultsPublished" = false
WHERE "resultsSnapshot" IS NULL;
