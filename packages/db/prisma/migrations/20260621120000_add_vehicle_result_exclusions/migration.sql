-- CreateEnum
CREATE TYPE "ResultExclusionContextType" AS ENUM ('PEOPLE_CHOICE_CATEGORY', 'SPECIAL_AWARD');

-- CreateTable
CREATE TABLE "VehicleResultExclusion" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "vehicleEntryId" TEXT NOT NULL,
    "contextType" "ResultExclusionContextType" NOT NULL,
    "contextId" TEXT NOT NULL,
    "reason" TEXT,
    "excludedByStaffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleResultExclusion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VehicleResultExclusion_eventId_contextType_contextId_vehicleEntryId_key" ON "VehicleResultExclusion"("eventId", "contextType", "contextId", "vehicleEntryId");

-- CreateIndex
CREATE INDEX "VehicleResultExclusion_eventId_vehicleEntryId_idx" ON "VehicleResultExclusion"("eventId", "vehicleEntryId");

-- CreateIndex
CREATE INDEX "VehicleResultExclusion_eventId_contextType_contextId_idx" ON "VehicleResultExclusion"("eventId", "contextType", "contextId");

-- AddForeignKey
ALTER TABLE "VehicleResultExclusion" ADD CONSTRAINT "VehicleResultExclusion_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleResultExclusion" ADD CONSTRAINT "VehicleResultExclusion_vehicleEntryId_fkey" FOREIGN KEY ("vehicleEntryId") REFERENCES "VehicleEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleResultExclusion" ADD CONSTRAINT "VehicleResultExclusion_excludedByStaffId_fkey" FOREIGN KEY ("excludedByStaffId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
