import { PrismaClient, StaffRole } from "@prisma/client";

const prisma = new PrismaClient();

const eventId = "event-2026-fathers-day";

const categories = [
  "Classic Car",
  "Modern Car",
  "Truck",
  "Motorbike",
  "Custom",
];

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function tokenFor(index: number) {
  return `fd2026-${index.toString().padStart(4, "0")}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

async function main() {
  await prisma.event.upsert({
    where: { id: eventId },
    update: {},
    create: {
      id: eventId,
      name: "Father's Day Car Show / Show & Shine",
      eventDate: new Date("2026-06-21T16:00:00.000Z"),
      venueName: "Celebration Church",
      venueAddress: "7215 Argyll Road, Edmonton, AB",
      registrationOpen: true,
      peopleChoiceCutoff: new Date("2026-06-21T21:00:00.000Z"),
    },
  });

  for (const [index, name] of categories.entries()) {
    await prisma.category.upsert({
      where: {
        eventId_slug: {
          eventId,
          slug: slugify(name),
        },
      },
      update: {
        name,
        active: true,
        sortOrder: index + 1,
      },
      create: {
        eventId,
        name,
        slug: slugify(name),
        active: true,
        sortOrder: index + 1,
      },
    });
  }

  const staff = [
    ["admin@carshow.local", "Admin User", StaffRole.ADMIN],
    ["registrar1@carshow.local", "Registrar One", StaffRole.REGISTRAR],
    ["registrar2@carshow.local", "Registrar Two", StaffRole.REGISTRAR],
  ] as const;

  for (const [email, displayName, role] of staff) {
    await prisma.staffUser.upsert({
      where: { email },
      update: { displayName, role, devLogin: true, active: true },
      create: { email, displayName, role, devLogin: true, active: true },
    });
  }

  for (let index = 1; index <= 150; index += 1) {
    const visibleCode = `C-${index.toString().padStart(3, "0")}`;
    await prisma.qrCard.upsert({
      where: {
        eventId_visibleCode: {
          eventId,
          visibleCode,
        },
      },
      update: {},
      create: {
        eventId,
        visibleCode,
        publicToken: tokenFor(index),
        printedAt: new Date(),
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
