CREATE TYPE "StaffRole" AS ENUM ('ADMIN', 'REGISTRAR');
CREATE TYPE "VehicleStatus" AS ENUM ('DRAFT', 'REGISTERED', 'CHECKED_IN');
CREATE TYPE "RegistrationSource" AS ENUM ('ONSITE', 'ONLINE_IMPORT');
CREATE TYPE "QrCardStatus" AS ENUM ('PRINTED', 'ASSIGNED', 'REASSIGNED', 'RETIRED', 'REPRINTED');
CREATE TYPE "QrAuditAction" AS ENUM ('ASSIGNED', 'REASSIGNED', 'REPRINTED', 'RETIRED');

CREATE TABLE "Event" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "eventDate" TIMESTAMP(3) NOT NULL,
  "venueName" TEXT NOT NULL,
  "venueAddress" TEXT NOT NULL,
  "registrationOpen" BOOLEAN NOT NULL DEFAULT true,
  "votingOpen" BOOLEAN NOT NULL DEFAULT false,
  "judgingOpen" BOOLEAN NOT NULL DEFAULT false,
  "resultsPublished" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StaffUser" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "role" "StaffRole" NOT NULL,
  "planningCenterId" TEXT,
  "devLogin" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StaffUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Category" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Owner" (
  "id" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "email" TEXT,
  "publicName" TEXT,
  "publicNameOptIn" BOOLEAN NOT NULL DEFAULT false,
  "waiverAccepted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Owner_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VehicleEntry" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "entryNumber" INTEGER NOT NULL,
  "year" INTEGER NOT NULL,
  "make" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "nickname" TEXT,
  "plateNumber" TEXT,
  "exteriorColor" TEXT,
  "internalNotes" TEXT,
  "status" "VehicleStatus" NOT NULL DEFAULT 'REGISTERED',
  "source" "RegistrationSource" NOT NULL DEFAULT 'ONSITE',
  "checkedInAt" TIMESTAMP(3),
  "registeredByStaffId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VehicleEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QrCard" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "visibleCode" TEXT NOT NULL,
  "publicToken" TEXT NOT NULL,
  "status" "QrCardStatus" NOT NULL DEFAULT 'PRINTED',
  "vehicleEntryId" TEXT,
  "printedAt" TIMESTAMP(3),
  "assignedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QrCard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QrAssignmentAuditLog" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "qrCardId" TEXT NOT NULL,
  "vehicleEntryId" TEXT,
  "staffUserId" TEXT NOT NULL,
  "action" "QrAuditAction" NOT NULL,
  "reason" TEXT,
  "previousVehicleEntryId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QrAssignmentAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StaffUser_email_key" ON "StaffUser"("email");
CREATE UNIQUE INDEX "StaffUser_planningCenterId_key" ON "StaffUser"("planningCenterId");
CREATE UNIQUE INDEX "Category_eventId_slug_key" ON "Category"("eventId", "slug");
CREATE UNIQUE INDEX "VehicleEntry_eventId_entryNumber_key" ON "VehicleEntry"("eventId", "entryNumber");
CREATE INDEX "VehicleEntry_eventId_status_idx" ON "VehicleEntry"("eventId", "status");
CREATE INDEX "VehicleEntry_eventId_categoryId_idx" ON "VehicleEntry"("eventId", "categoryId");
CREATE UNIQUE INDEX "QrCard_publicToken_key" ON "QrCard"("publicToken");
CREATE UNIQUE INDEX "QrCard_vehicleEntryId_key" ON "QrCard"("vehicleEntryId");
CREATE UNIQUE INDEX "QrCard_eventId_visibleCode_key" ON "QrCard"("eventId", "visibleCode");
CREATE INDEX "QrCard_eventId_status_idx" ON "QrCard"("eventId", "status");
CREATE INDEX "QrAssignmentAuditLog_eventId_qrCardId_idx" ON "QrAssignmentAuditLog"("eventId", "qrCardId");
CREATE INDEX "QrAssignmentAuditLog_eventId_vehicleEntryId_idx" ON "QrAssignmentAuditLog"("eventId", "vehicleEntryId");

ALTER TABLE "Category" ADD CONSTRAINT "Category_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VehicleEntry" ADD CONSTRAINT "VehicleEntry_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VehicleEntry" ADD CONSTRAINT "VehicleEntry_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VehicleEntry" ADD CONSTRAINT "VehicleEntry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VehicleEntry" ADD CONSTRAINT "VehicleEntry_registeredByStaffId_fkey" FOREIGN KEY ("registeredByStaffId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QrCard" ADD CONSTRAINT "QrCard_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QrCard" ADD CONSTRAINT "QrCard_vehicleEntryId_fkey" FOREIGN KEY ("vehicleEntryId") REFERENCES "VehicleEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QrAssignmentAuditLog" ADD CONSTRAINT "QrAssignmentAuditLog_qrCardId_fkey" FOREIGN KEY ("qrCardId") REFERENCES "QrCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QrAssignmentAuditLog" ADD CONSTRAINT "QrAssignmentAuditLog_vehicleEntryId_fkey" FOREIGN KEY ("vehicleEntryId") REFERENCES "VehicleEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QrAssignmentAuditLog" ADD CONSTRAINT "QrAssignmentAuditLog_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "StaffUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
