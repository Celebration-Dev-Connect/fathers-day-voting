-- Add vote metadata and soft-exclusion fields for admin winner review.
ALTER TABLE "PeopleChoiceVote"
  ADD COLUMN "ipAddress" TEXT,
  ADD COLUMN "userAgent" TEXT,
  ADD COLUMN "excludedAt" TIMESTAMP(3),
  ADD COLUMN "excludedReason" TEXT,
  ADD COLUMN "excludedByStaffId" TEXT;

ALTER TABLE "SpecialAwardVote"
  ADD COLUMN "ipAddress" TEXT,
  ADD COLUMN "userAgent" TEXT,
  ADD COLUMN "excludedAt" TIMESTAMP(3),
  ADD COLUMN "excludedReason" TEXT,
  ADD COLUMN "excludedByStaffId" TEXT;

ALTER TABLE "PeopleChoiceVote"
  ADD CONSTRAINT "PeopleChoiceVote_excludedByStaffId_fkey"
  FOREIGN KEY ("excludedByStaffId") REFERENCES "StaffUser"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SpecialAwardVote"
  ADD CONSTRAINT "SpecialAwardVote_excludedByStaffId_fkey"
  FOREIGN KEY ("excludedByStaffId") REFERENCES "StaffUser"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "PeopleChoiceVote_eventId_excludedAt_idx" ON "PeopleChoiceVote"("eventId", "excludedAt");
CREATE INDEX "PeopleChoiceVote_eventId_ipAddress_idx" ON "PeopleChoiceVote"("eventId", "ipAddress");
CREATE INDEX "PeopleChoiceVote_eventId_voterKey_idx" ON "PeopleChoiceVote"("eventId", "voterKey");

CREATE INDEX "SpecialAwardVote_eventId_createdAt_idx" ON "SpecialAwardVote"("eventId", "createdAt");
CREATE INDEX "SpecialAwardVote_eventId_excludedAt_idx" ON "SpecialAwardVote"("eventId", "excludedAt");
CREATE INDEX "SpecialAwardVote_eventId_ipAddress_idx" ON "SpecialAwardVote"("eventId", "ipAddress");
CREATE INDEX "SpecialAwardVote_eventId_voterKey_idx" ON "SpecialAwardVote"("eventId", "voterKey");
