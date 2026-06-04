-- Public category listing: covers eventId + categoryId + status + order by entryNumber.
-- Eliminates post-index status filtering and in-memory sort on the hot public browse path.
CREATE INDEX "VehicleEntry_eventId_categoryId_status_entryNumber_idx"
  ON "VehicleEntry"("eventId", "categoryId", "status", "entryNumber");

-- Photo fetching per vehicle: covers vehicleEntryId + moderationStatus + sortOrder.
-- Eliminates fetching rejected/pending photos when loading approved photos for a vehicle.
CREATE INDEX "VehiclePhoto_vehicleEntryId_moderationStatus_sortOrder_idx"
  ON "VehiclePhoto"("vehicleEntryId", "moderationStatus", "sortOrder");

-- Moderation worker sweep: covers status + processingStartedAt for stale-row reclaim.
CREATE INDEX "VehiclePhoto_moderationStatus_processingStartedAt_idx"
  ON "VehiclePhoto"("moderationStatus", "processingStartedAt");

-- Drop redundant index: source is never filtered in isolation by any query.
DROP INDEX "VehiclePhoto_source_idx";
