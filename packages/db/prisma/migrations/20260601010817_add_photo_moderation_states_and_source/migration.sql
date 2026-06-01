-- CreateEnum
CREATE TYPE "PhotoSource" AS ENUM ('STAFF', 'VISITOR');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PhotoModerationStatus" ADD VALUE 'PROCESSING';
ALTER TYPE "PhotoModerationStatus" ADD VALUE 'HUMAN_REVIEW';
ALTER TYPE "PhotoModerationStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "VehiclePhoto" ADD COLUMN     "source" "PhotoSource" NOT NULL DEFAULT 'STAFF';

-- CreateIndex
CREATE INDEX "VehiclePhoto_source_idx" ON "VehiclePhoto"("source");
