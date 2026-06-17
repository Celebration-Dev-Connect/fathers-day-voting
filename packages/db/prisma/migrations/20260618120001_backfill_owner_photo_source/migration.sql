-- Backfill: photos uploaded via the owner portal on June 17-18 were incorrectly
-- tagged VISITOR because of a bug in the upload handler. Correct them by
-- matching on the uploadedBy prefix — visitor uploads use 'visitor:' not 'owner:'.
UPDATE "VehiclePhoto"
SET source = 'OWNER'
WHERE source = 'VISITOR'
  AND "uploadedBy" LIKE 'owner:%'
  AND "createdAt" >= '2026-06-17 00:00:00 UTC'
  AND "createdAt" <  '2026-06-19 00:00:00 UTC';
