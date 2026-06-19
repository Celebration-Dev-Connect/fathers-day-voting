ALTER TABLE "PcoTeamRole"
  ADD COLUMN "pcoTeamId" TEXT,
  ADD COLUMN "pcoServiceTypeName" TEXT;

DROP INDEX IF EXISTS "PcoTeamRole_pcoTeamName_positionName_key";

-- Name-only mappings were ambiguous when Planning Center had duplicate team
-- names. Keep only the seeded emergency admin fallback; new mappings use IDs.
DELETE FROM "PcoTeamRole"
WHERE "pcoTeamId" IS NULL
  AND NOT ("id" = 'default-admin-team' AND "pcoTeamName" = 'carshow' AND "positionName" IS NULL AND "role" = 'ADMIN');

CREATE INDEX "PcoTeamRole_pcoTeamId_idx" ON "PcoTeamRole"("pcoTeamId");

CREATE UNIQUE INDEX "PcoTeamRole_pcoTeamId_whole_team_key"
  ON "PcoTeamRole"("pcoTeamId")
  WHERE "pcoTeamId" IS NOT NULL AND "positionName" IS NULL;

CREATE UNIQUE INDEX "PcoTeamRole_pcoTeamId_positionName_key"
  ON "PcoTeamRole"("pcoTeamId", "positionName")
  WHERE "pcoTeamId" IS NOT NULL AND "positionName" IS NOT NULL;
