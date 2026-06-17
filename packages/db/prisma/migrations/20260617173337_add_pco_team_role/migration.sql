-- CreateTable
CREATE TABLE "PcoTeamRole" (
    "id" TEXT NOT NULL,
    "pcoTeamName" TEXT NOT NULL,
    "positionName" TEXT,
    "role" "StaffRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PcoTeamRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PcoTeamRole_pcoTeamName_positionName_key" ON "PcoTeamRole"("pcoTeamName", "positionName");
