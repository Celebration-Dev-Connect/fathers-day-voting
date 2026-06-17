-- Add OWNER variant to PhotoSource enum.
-- Must be committed alone before any DML uses the new value (PostgreSQL 55P04).
-- The backfill UPDATE lives in the next migration (20260618120001).
ALTER TYPE "PhotoSource" ADD VALUE 'OWNER';
