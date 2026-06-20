-- Backfill the Planning Center team ID onto the seeded carshow admin mapping so role
-- resolution matches by stable team ID (not just the team name, which can collide).
-- The carshow Services team ID is consistent across environments because they share one
-- Celebration Church Planning Center organization. Adjust the ID here if that changes.

-- Ensure the fallback row exists (mirrors the original seed), now with the team ID set.
INSERT INTO "PcoTeamRole" ("id", "pcoTeamId", "pcoTeamName", "positionName", "role", "active", "createdAt", "updatedAt")
SELECT 'default-admin-team', '7352056', 'carshow', NULL, 'ADMIN', true, NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "PcoTeamRole" WHERE "id" = 'default-admin-team'
);

-- Upgrade any pre-existing name-only fallback row to the ID-based mapping.
UPDATE "PcoTeamRole"
SET "pcoTeamId" = '7352056', "updatedAt" = NOW()
WHERE "id" = 'default-admin-team' AND ("pcoTeamId" IS DISTINCT FROM '7352056');
