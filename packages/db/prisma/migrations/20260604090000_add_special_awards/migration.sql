CREATE TABLE "SpecialAward" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpecialAward_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SpecialAwardVote" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "specialAwardId" TEXT NOT NULL,
    "vehicleEntryId" TEXT NOT NULL,
    "voterKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpecialAwardVote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SpecialAward_eventId_name_key" ON "SpecialAward"("eventId", "name");
CREATE INDEX "SpecialAward_eventId_active_idx" ON "SpecialAward"("eventId", "active");

CREATE UNIQUE INDEX "SpecialAwardVote_eventId_specialAwardId_voterKey_key" ON "SpecialAwardVote"("eventId", "specialAwardId", "voterKey");
CREATE INDEX "SpecialAwardVote_eventId_specialAwardId_idx" ON "SpecialAwardVote"("eventId", "specialAwardId");
CREATE INDEX "SpecialAwardVote_eventId_vehicleEntryId_idx" ON "SpecialAwardVote"("eventId", "vehicleEntryId");

ALTER TABLE "SpecialAward" ADD CONSTRAINT "SpecialAward_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SpecialAwardVote" ADD CONSTRAINT "SpecialAwardVote_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SpecialAwardVote" ADD CONSTRAINT "SpecialAwardVote_specialAwardId_fkey" FOREIGN KEY ("specialAwardId") REFERENCES "SpecialAward"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SpecialAwardVote" ADD CONSTRAINT "SpecialAwardVote_vehicleEntryId_fkey" FOREIGN KEY ("vehicleEntryId") REFERENCES "VehicleEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
