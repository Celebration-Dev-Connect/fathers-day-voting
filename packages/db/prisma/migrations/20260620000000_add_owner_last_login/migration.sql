ALTER TABLE "Owner" ADD COLUMN "lastLoginAt" TIMESTAMP(3);

-- Backfill a login timestamp for owners who clearly already used the portal: anyone who
-- uploaded their own photo or wrote a build story must have signed in at least once. We
-- don't know the real time, so use now() as a best-effort "has logged in" marker.
UPDATE "Owner" o
SET "lastLoginAt" = NOW()
WHERE o."lastLoginAt" IS NULL
  AND EXISTS (
    SELECT 1 FROM "VehicleEntry" ve
    WHERE ve."ownerId" = o."id"
      AND (
        (ve."buildStory" IS NOT NULL AND length(btrim(ve."buildStory")) > 0)
        OR EXISTS (
          SELECT 1 FROM "VehiclePhoto" vp
          WHERE vp."vehicleEntryId" = ve."id" AND vp."source" = 'OWNER'
        )
      )
  );
