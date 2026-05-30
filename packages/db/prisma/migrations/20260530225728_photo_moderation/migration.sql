-- CreateEnum
CREATE TYPE "PhotoModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'FAILED');

-- AlterTable
ALTER TABLE "VehiclePhoto" ADD COLUMN     "contentType" TEXT,
ADD COLUMN     "moderationLabels" JSONB,
ADD COLUMN     "moderationStatus" "PhotoModerationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "processedAt" TIMESTAMP(3),
ADD COLUMN     "processingStartedAt" TIMESTAMP(3),
ADD COLUMN     "storageKey" TEXT,
ADD COLUMN     "uploadedBy" TEXT,
ALTER COLUMN "url" DROP NOT NULL;

-- Back-fill: existing photos predate moderation and are known-good demo/seed data.
UPDATE "VehiclePhoto" SET "moderationStatus" = 'APPROVED';

-- CreateIndex
CREATE INDEX "VehiclePhoto_moderationStatus_idx" ON "VehiclePhoto"("moderationStatus");

-- RenameIndex
ALTER INDEX "JudgeCategoryPick_eventId_categoryId_judgeKey_vehicleEntryId_ke" RENAME TO "JudgeCategoryPick_eventId_categoryId_judgeKey_vehicleEntryI_key";
