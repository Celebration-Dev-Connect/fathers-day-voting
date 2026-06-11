CREATE TYPE "RegistrationImportJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');
CREATE TYPE "RegistrationImportItemStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'SKIPPED', 'FAILED');

CREATE TABLE "RegistrationImportJob" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "createdByStaffId" TEXT NOT NULL,
  "status" "RegistrationImportJobStatus" NOT NULL DEFAULT 'PENDING',
  "sourceFileName" TEXT,
  "totalItems" INTEGER NOT NULL,
  "processingStartedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RegistrationImportJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RegistrationImportItem" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "entryNumber" INTEGER NOT NULL,
  "rowData" JSONB NOT NULL,
  "categoryId" TEXT NOT NULL,
  "ownerGroup" TEXT NOT NULL,
  "vehicleEntryId" TEXT,
  "registrationStatus" "RegistrationImportItemStatus" NOT NULL DEFAULT 'PENDING',
  "photoStatus" "RegistrationImportItemStatus" NOT NULL DEFAULT 'PENDING',
  "registrationMessage" TEXT,
  "photoMessage" TEXT,
  "processingStartedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RegistrationImportItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RegistrationImportItem_jobId_entryNumber_key" ON "RegistrationImportItem"("jobId", "entryNumber");
CREATE INDEX "RegistrationImportJob_eventId_createdAt_idx" ON "RegistrationImportJob"("eventId", "createdAt");
CREATE INDEX "RegistrationImportJob_status_processingStartedAt_idx" ON "RegistrationImportJob"("status", "processingStartedAt");
CREATE INDEX "RegistrationImportItem_jobId_registrationStatus_idx" ON "RegistrationImportItem"("jobId", "registrationStatus");
CREATE INDEX "RegistrationImportItem_jobId_photoStatus_idx" ON "RegistrationImportItem"("jobId", "photoStatus");

ALTER TABLE "RegistrationImportJob" ADD CONSTRAINT "RegistrationImportJob_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RegistrationImportJob" ADD CONSTRAINT "RegistrationImportJob_createdByStaffId_fkey"
  FOREIGN KEY ("createdByStaffId") REFERENCES "StaffUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RegistrationImportItem" ADD CONSTRAINT "RegistrationImportItem_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "RegistrationImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
