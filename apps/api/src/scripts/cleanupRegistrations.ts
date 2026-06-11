import { prisma } from "@carshow/db";

async function main() {
  const before = await prisma.$transaction(async (tx) => ({
    registrations: await tx.vehicleEntry.count(),
    owners: await tx.owner.count(),
    photos: await tx.vehiclePhoto.count(),
    assignedQrCards: await tx.qrCard.count({ where: { vehicleEntryId: { not: null } } }),
    importJobs: await tx.registrationImportJob.count(),
  }));

  await prisma.$transaction(async (tx) => {
    await tx.qrAssignmentAuditLog.updateMany({
      where: { vehicleEntryId: { not: null } },
      data: { vehicleEntryId: null },
    });
    await tx.qrCard.updateMany({
      where: { vehicleEntryId: { not: null } },
      data: { vehicleEntryId: null, status: "PRINTED", assignedAt: null },
    });
    await tx.vehicleEntry.updateMany({
      where: { primaryPhotoId: { not: null } },
      data: { primaryPhotoId: null },
    });
    await tx.vehiclePhoto.deleteMany();
    await tx.vehicleEntry.deleteMany();
    await tx.owner.deleteMany({ where: { vehicleEntries: { none: {} } } });
    await tx.registrationImportJob.deleteMany();
  });

  const after = await prisma.$transaction(async (tx) => ({
    registrations: await tx.vehicleEntry.count(),
    owners: await tx.owner.count(),
    photos: await tx.vehiclePhoto.count(),
    assignedQrCards: await tx.qrCard.count({ where: { vehicleEntryId: { not: null } } }),
    importJobs: await tx.registrationImportJob.count(),
  }));

  console.log(JSON.stringify({ before, after }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
