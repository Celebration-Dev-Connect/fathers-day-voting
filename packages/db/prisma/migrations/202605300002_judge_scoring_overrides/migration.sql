ALTER TABLE "JudgeCategoryPick" ADD COLUMN "judgeKey" TEXT NOT NULL DEFAULT 'panel';

DROP INDEX "JudgeCategoryPick_eventId_categoryId_rank_key";

CREATE UNIQUE INDEX "JudgeCategoryPick_eventId_categoryId_judgeKey_rank_key" ON "JudgeCategoryPick"("eventId", "categoryId", "judgeKey", "rank");
CREATE UNIQUE INDEX "JudgeCategoryPick_eventId_categoryId_judgeKey_vehicleEntryId_key" ON "JudgeCategoryPick"("eventId", "categoryId", "judgeKey", "vehicleEntryId");

CREATE TABLE "CategoryWinnerOverride" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "vehicleEntryId" TEXT NOT NULL,
  "rank" INTEGER NOT NULL,
  "reason" TEXT,
  "adminStaffUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CategoryWinnerOverride_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CategoryWinnerOverride_eventId_categoryId_idx" ON "CategoryWinnerOverride"("eventId", "categoryId");
CREATE UNIQUE INDEX "CategoryWinnerOverride_eventId_categoryId_rank_key" ON "CategoryWinnerOverride"("eventId", "categoryId", "rank");

ALTER TABLE "CategoryWinnerOverride" ADD CONSTRAINT "CategoryWinnerOverride_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CategoryWinnerOverride" ADD CONSTRAINT "CategoryWinnerOverride_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CategoryWinnerOverride" ADD CONSTRAINT "CategoryWinnerOverride_vehicleEntryId_fkey" FOREIGN KEY ("vehicleEntryId") REFERENCES "VehicleEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CategoryWinnerOverride" ADD CONSTRAINT "CategoryWinnerOverride_adminStaffUserId_fkey" FOREIGN KEY ("adminStaffUserId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
