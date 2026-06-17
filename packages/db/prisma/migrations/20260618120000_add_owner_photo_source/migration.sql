-- Add OWNER variant to PhotoSource enum
ALTER TYPE "PhotoSource" ADD VALUE 'OWNER';

-- Backfill: photos uploaded via the owner portal on June 17-18 were incorrectly
-- tagged VISITOR. Identify them by uploadedBy prefix 'owner:' and creation date.
UPDATE "VehiclePhoto"
SET source = 'OWNER'
WHERE source = 'VISITOR'
  AND "uploadedBy" LIKE 'owner:%'
  AND "createdAt" >= '2026-06-17 00:00:00 UTC'
  AND "createdAt" <  '2026-06-19 00:00:00 UTC';
