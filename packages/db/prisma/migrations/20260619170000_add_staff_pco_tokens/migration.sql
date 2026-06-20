ALTER TABLE "StaffUser"
  ADD COLUMN "pcoAccessToken" TEXT,
  ADD COLUMN "pcoRefreshToken" TEXT,
  ADD COLUMN "pcoTokenExpiresAt" TIMESTAMP(3);
