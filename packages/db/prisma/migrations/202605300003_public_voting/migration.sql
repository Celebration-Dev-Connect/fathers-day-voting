-- Add categoryId to PeopleChoiceVote for per-category unique vote enforcement

-- Step 1: add nullable column
ALTER TABLE "PeopleChoiceVote" ADD COLUMN "categoryId" TEXT;

-- Step 2: backfill from VehicleEntry
UPDATE "PeopleChoiceVote" v
SET "categoryId" = e."categoryId"
FROM "VehicleEntry" e
WHERE e.id = v."vehicleEntryId";

-- Step 3: set NOT NULL
ALTER TABLE "PeopleChoiceVote" ALTER COLUMN "categoryId" SET NOT NULL;

-- Step 4: add FK
ALTER TABLE "PeopleChoiceVote" ADD CONSTRAINT "PeopleChoiceVote_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 5: drop old unique index
DROP INDEX IF EXISTS "PeopleChoiceVote_eventId_vehicleEntryId_voterKey_key";

-- Step 6: add new per-category unique index
CREATE UNIQUE INDEX "PeopleChoiceVote_eventId_categoryId_voterKey_key"
  ON "PeopleChoiceVote"("eventId", "categoryId", "voterKey");
