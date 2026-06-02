ALTER TABLE "VehicleEntry" ADD COLUMN "ownerAccessCode" TEXT;

UPDATE "VehicleEntry"
SET "ownerAccessCode" = lpad(("entryNumber" % 100000)::text, 5, '0')
WHERE "ownerAccessCode" IS NULL;

ALTER TABLE "VehicleEntry" ALTER COLUMN "ownerAccessCode" SET NOT NULL;

CREATE UNIQUE INDEX "VehicleEntry_eventId_ownerAccessCode_key" ON "VehicleEntry"("eventId", "ownerAccessCode");
CREATE INDEX "VehicleEntry_ownerId_idx" ON "VehicleEntry"("ownerId");
