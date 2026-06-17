-- Seed the default admin team mapping required for staff to sign in via Planning
-- Center. Members of the "carshow" PCO team get ADMIN. This must exist in every
-- environment, so it ships as a data migration rather than the test-only seed.
-- The team name matches the PCO_TEAM_NAME config default; adjust here if an
-- environment uses a different Planning Center team name.
INSERT INTO "PcoTeamRole" ("id", "pcoTeamName", "positionName", "role", "active", "createdAt", "updatedAt")
SELECT 'default-admin-team', 'carshow', NULL, 'ADMIN', true, NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "PcoTeamRole" WHERE "pcoTeamName" = 'carshow' AND "positionName" IS NULL
);
