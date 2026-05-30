ALTER TABLE "Event" ADD COLUMN "peopleChoiceCutoff" TIMESTAMP(3);

CREATE TABLE "PeopleChoiceVote" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "vehicleEntryId" TEXT NOT NULL,
  "voterKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PeopleChoiceVote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JudgeCategoryPick" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "vehicleEntryId" TEXT NOT NULL,
  "rank" INTEGER NOT NULL,
  "judgeName" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JudgeCategoryPick_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PeopleChoiceVote_eventId_vehicleEntryId_idx" ON "PeopleChoiceVote"("eventId", "vehicleEntryId");
CREATE INDEX "PeopleChoiceVote_eventId_createdAt_idx" ON "PeopleChoiceVote"("eventId", "createdAt");
CREATE UNIQUE INDEX "PeopleChoiceVote_eventId_vehicleEntryId_voterKey_key" ON "PeopleChoiceVote"("eventId", "vehicleEntryId", "voterKey");
CREATE INDEX "JudgeCategoryPick_eventId_categoryId_idx" ON "JudgeCategoryPick"("eventId", "categoryId");
CREATE INDEX "JudgeCategoryPick_eventId_vehicleEntryId_idx" ON "JudgeCategoryPick"("eventId", "vehicleEntryId");
CREATE UNIQUE INDEX "JudgeCategoryPick_eventId_categoryId_rank_key" ON "JudgeCategoryPick"("eventId", "categoryId", "rank");

ALTER TABLE "PeopleChoiceVote" ADD CONSTRAINT "PeopleChoiceVote_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PeopleChoiceVote" ADD CONSTRAINT "PeopleChoiceVote_vehicleEntryId_fkey" FOREIGN KEY ("vehicleEntryId") REFERENCES "VehicleEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JudgeCategoryPick" ADD CONSTRAINT "JudgeCategoryPick_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JudgeCategoryPick" ADD CONSTRAINT "JudgeCategoryPick_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JudgeCategoryPick" ADD CONSTRAINT "JudgeCategoryPick_vehicleEntryId_fkey" FOREIGN KEY ("vehicleEntryId") REFERENCES "VehicleEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
