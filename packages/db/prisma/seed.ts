import { PrismaClient, StaffRole, VehicleStatus } from "@prisma/client";

const prisma = new PrismaClient();

const eventId = "event-2026-fathers-day";

const categories = [
  "Classic Car",
  "Modern Car",
  "Truck",
  "Motorbike",
  "Custom",
];

const firstNames = [
  "Alex",
  "Jordan",
  "Taylor",
  "Morgan",
  "Casey",
  "Riley",
  "Jamie",
  "Drew",
  "Avery",
  "Sam",
];

const lastNames = [
  "Miller",
  "Johnson",
  "Patel",
  "Nguyen",
  "Anderson",
  "Brown",
  "Wilson",
  "Singh",
  "Martin",
  "Clark",
];

const vehiclesByCategory: Record<string, Array<[number, string, string, string]>> = {
  "Classic Car": [
    [1967, "Chevrolet", "Camaro", "Crimson Rocket"],
    [1969, "Ford", "Mustang", "Blue Streak"],
    [1957, "Chevrolet", "Bel Air", "Sunday Cruiser"],
    [1970, "Dodge", "Challenger", "Orange Crush"],
    [1965, "Pontiac", "GTO", "Goat"],
  ],
  "Modern Car": [
    [2023, "Chevrolet", "Corvette", "Rapid Red"],
    [2022, "Ford", "Mustang GT", "Track Pack"],
    [2024, "Toyota", "GR Supra", "White Lightning"],
    [2021, "Dodge", "Charger", "Night Run"],
    [2023, "BMW", "M4", "Alpine"],
  ],
  Truck: [
    [1972, "Chevrolet", "C10", "Shop Truck"],
    [1979, "Ford", "F-150", "Highboy"],
    [1985, "GMC", "Sierra", "Squarebody"],
    [2022, "Ram", "1500", "Big Horn"],
    [2021, "Toyota", "Tacoma", "Trail Rig"],
  ],
  Motorbike: [
    [2020, "Harley-Davidson", "Street Bob", "Blackline"],
    [2018, "Indian", "Scout", "Copper Scout"],
    [2022, "Triumph", "Bonneville", "Cafe Sunday"],
    [2019, "Ducati", "Scrambler", "Redline"],
    [2021, "Yamaha", "Bolt", "Midnight"],
  ],
  Custom: [
    [1932, "Ford", "Roadster", "Hot Rod"],
    [1964, "Chevrolet", "Impala", "Low Glow"],
    [1976, "Volkswagen", "Beetle", "Bug Out"],
    [1991, "Mazda", "Miata", "Corner Carver"],
    [1988, "Jeep", "Wagoneer", "Woodgrain"],
  ],
};

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function tokenFor(index: number) {
  return `fd2026-${index.toString().padStart(4, "0")}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function demoPhotoUrl(
  categoryName: string,
  make: string,
  model: string,
  categoryIndex: number,
  vehicleIndex: number,
  photoIndex: number,
) {
  const imageId = 1000 + categoryIndex * 100 + vehicleIndex * 3 + photoIndex;
  const categoryTags =
    categoryName === "Motorbike"
      ? ["motorcycle"]
      : categoryName === "Truck"
        ? ["truck"]
        : ["car"];
  const tags = [make, model, ...categoryTags]
    .join(",")
    .toLowerCase()
    .replace(/[^a-z0-9,]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `https://loremflickr.com/900/600/${tags}/all?lock=${imageId}`;
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
    ["judge1@carshow.local", "Judge One", StaffRole.JUDGE],
    ["judge2@carshow.local", "Judge Two", StaffRole.JUDGE],
    ["judge3@carshow.local", "Judge Three", StaffRole.JUDGE],
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

  const seededCategories = await prisma.category.findMany({
    where: { eventId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const realRegistrationCount = await prisma.vehicleEntry.count({
    where: {
      eventId,
      id: { not: { startsWith: "seed-vehicle-" } },
    },
  });

  if (realRegistrationCount > 0) {
    console.log(`Skipping demo vehicle seed because ${realRegistrationCount} imported/real registrations exist.`);
    return;
  }

  const bestPaintAward = await prisma.specialAward.upsert({
    where: {
      eventId_name: {
        eventId,
        name: "Best Paint Job",
      },
    },
    update: {
      description: "Event-wide special award across every vehicle category.",
      active: true,
      sortOrder: 1,
    },
    create: {
      eventId,
      name: "Best Paint Job",
      description: "Event-wide special award across every vehicle category.",
      active: true,
      sortOrder: 1,
    },
  });

  for (const [categoryIndex, category] of seededCategories.entries()) {
    const categoryVehicles = vehiclesByCategory[category.name] ?? vehiclesByCategory.Custom;
    const demoVehicleIds: string[] = [];

    for (let index = 1; index <= 20; index += 1) {
      const template = categoryVehicles[(index - 1) % categoryVehicles.length];
      const [year, make, model, nickname] = template;
      const ownerId = `seed-owner-${category.slug}-${index}`;
      const vehicleId = `seed-vehicle-${category.slug}-${index}`;
      const entryNumber = 1000 + categoryIndex * 100 + index;
      const ownerFirstName = firstNames[(categoryIndex + index) % firstNames.length];
      const ownerLastName = lastNames[(categoryIndex * 3 + index) % lastNames.length];

      await prisma.owner.upsert({
        where: { id: ownerId },
        update: {
          firstName: ownerFirstName,
          lastName: ownerLastName,
          phone: `780-555-${(1000 + categoryIndex * 100 + index).toString().slice(-4)}`,
          email: `${category.slug}${index}@carshow.local`,
          publicName: `${ownerFirstName} ${ownerLastName}`,
          publicNameOptIn: true,
          waiverAccepted: true,
        },
        create: {
          id: ownerId,
          firstName: ownerFirstName,
          lastName: ownerLastName,
          phone: `780-555-${(1000 + categoryIndex * 100 + index).toString().slice(-4)}`,
          email: `${category.slug}${index}@carshow.local`,
          publicName: `${ownerFirstName} ${ownerLastName}`,
          publicNameOptIn: true,
          waiverAccepted: true,
        },
      });

      await prisma.vehicleEntry.upsert({
        where: { id: vehicleId },
        update: {
          ownerId,
          categoryId: category.id,
          entryNumber,
          year,
          make,
          model,
          nickname: `${nickname} ${index}`,
          plateNumber: `FD${categoryIndex + 1}${index.toString().padStart(2, "0")}`,
          exteriorColor: ["Red", "Blue", "Black", "White", "Silver"][index % 5],
          internalNotes: "Seeded demo vehicle for voting tally review.",
          ownerAccessCode: entryNumber.toString().padStart(5, "0"),
          status: VehicleStatus.CHECKED_IN,
          checkedInAt: new Date("2026-06-21T17:00:00.000Z"),
        },
        create: {
          id: vehicleId,
          eventId,
          ownerId,
          categoryId: category.id,
          entryNumber,
          year,
          make,
          model,
          nickname: `${nickname} ${index}`,
          plateNumber: `FD${categoryIndex + 1}${index.toString().padStart(2, "0")}`,
          exteriorColor: ["Red", "Blue", "Black", "White", "Silver"][index % 5],
          internalNotes: "Seeded demo vehicle for voting tally review.",
          ownerAccessCode: entryNumber.toString().padStart(5, "0"),
          status: VehicleStatus.CHECKED_IN,
          checkedInAt: new Date("2026-06-21T17:00:00.000Z"),
        },
      });

      demoVehicleIds.push(vehicleId);
      for (let photoIndex = 1; photoIndex <= 3; photoIndex += 1) {
        await prisma.vehiclePhoto.upsert({
          where: {
            vehicleEntryId_sortOrder: {
              vehicleEntryId: vehicleId,
              sortOrder: photoIndex,
            },
          },
          update: {
            url: demoPhotoUrl(category.name, make, model, categoryIndex, index, photoIndex),
            altText: `${year} ${make} ${model} photo ${photoIndex}`,
            moderationStatus: "APPROVED",
          },
          create: {
            vehicleEntryId: vehicleId,
            sortOrder: photoIndex,
            url: demoPhotoUrl(category.name, make, model, categoryIndex, index, photoIndex),
            altText: `${year} ${make} ${model} photo ${photoIndex}`,
            moderationStatus: "APPROVED",
          },
        });
      }

      await prisma.peopleChoiceVote.createMany({
        data: Array.from({ length: Math.max(1, 24 - index) }, (_, voteIndex) => ({
          eventId,
          vehicleEntryId: vehicleId,
          categoryId: category.id,
          voterKey: `seed-voter-${category.slug}-${index}-${voteIndex + 1}`,
          createdAt: new Date(`2026-06-21T18:${(voteIndex % 50).toString().padStart(2, "0")}:00.000Z`),
        })),
        skipDuplicates: true,
      });
    }

    await prisma.judgeCategoryPick.deleteMany({
      where: {
        eventId,
        categoryId: category.id,
        judgeName: { startsWith: "Demo Judge" },
      },
    });

    const judgeOrders = [
      ["judge-a", "Demo Judge A", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]],
      ["judge-b", "Demo Judge B", [2, 1, 4, 3, 6, 5, 8, 7, 10, 9]],
      ["judge-c", "Demo Judge C", [3, 1, 2, 5, 4, 7, 6, 9, 8, 10]],
    ] as const;

    for (const [judgeKey, judgeName, order] of judgeOrders) {
      for (const [orderIndex, vehicleIndex] of order.entries()) {
        const rank = orderIndex + 1;
        await prisma.judgeCategoryPick.create({
          data: {
            eventId,
            categoryId: category.id,
            vehicleEntryId: demoVehicleIds[vehicleIndex - 1],
            judgeKey,
            rank,
            judgeName,
            notes: `Seeded rank ${rank} ballot pick.`,
          },
        });
      }
    }
  }

  const bestPaintVehicleIds = seededCategories.flatMap((category) =>
    Array.from({ length: 4 }, (_, index) => `seed-vehicle-${category.slug}-${index + 1}`),
  );

  await prisma.specialAwardVote.createMany({
    data: bestPaintVehicleIds.flatMap((vehicleId, vehicleIndex) =>
      Array.from({ length: Math.max(1, 32 - vehicleIndex * 2) }, (_, voteIndex) => ({
        eventId,
        specialAwardId: bestPaintAward.id,
        vehicleEntryId: vehicleId,
        voterKey: `seed-special-best-paint-${vehicleIndex + 1}-${voteIndex + 1}`,
        createdAt: new Date(`2026-06-21T19:${(voteIndex % 50).toString().padStart(2, "0")}:00.000Z`),
      })),
    ),
    skipDuplicates: true,
  });
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
