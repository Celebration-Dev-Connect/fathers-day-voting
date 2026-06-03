ALTER TABLE "VehicleEntry" ADD COLUMN "primaryPhotoId" TEXT;

CREATE UNIQUE INDEX "VehicleEntry_primaryPhotoId_key" ON "VehicleEntry"("primaryPhotoId");

ALTER TABLE "VehicleEntry"
  ADD CONSTRAINT "VehicleEntry_primaryPhotoId_fkey"
  FOREIGN KEY ("primaryPhotoId")
  REFERENCES "VehiclePhoto"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
