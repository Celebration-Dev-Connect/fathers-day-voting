CREATE TABLE "VehiclePhoto" (
  "id" TEXT NOT NULL,
  "vehicleEntryId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "altText" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "VehiclePhoto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VehiclePhoto_vehicleEntryId_sortOrder_key" ON "VehiclePhoto"("vehicleEntryId", "sortOrder");
CREATE INDEX "VehiclePhoto_vehicleEntryId_idx" ON "VehiclePhoto"("vehicleEntryId");

ALTER TABLE "VehiclePhoto" ADD CONSTRAINT "VehiclePhoto_vehicleEntryId_fkey" FOREIGN KEY ("vehicleEntryId") REFERENCES "VehicleEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
