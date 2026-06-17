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

const vehiclesByCategory: Record<string, Array<[number, string, string, string, string]>> = {
  "Classic Car": [
    [1967, "Chevrolet", "Camaro", "Crimson Rocket", "Frame-off restoration completed over three winters in a two-car garage. Numbers-matching 327 small-block rebuilt to factory spec, paired with a Muncie four-speed and a freshly rebuilt Posi rear end. The Fathom Green respray came out so deep it almost looks black under clouds."],
    [1969, "Ford", "Mustang", "Blue Streak", "Bought sight-unseen off a farm in rural Saskatchewan — ran, but just barely. The Mach 1 shaker hood and original 351 Windsor were both there and salvageable, which made the decision easy. Two years of weekends later it came out Wimbledon White with a black stripe and a stainless exhaust that rattles the neighbours' windows."],
    [1957, "Chevrolet", "Bel Air", "Sunday Cruiser", "This tri-five spent thirty years under a tarp in a leaky shed before finding its way to our driveway. The factory two-tone Surf Green and India Ivory was so faded it looked grey, but the sheetmetal underneath was surprisingly solid. Now it only comes out on dry days — call it superstition, call it respect."],
    [1970, "Dodge", "Challenger", "Orange Crush", "440 Six-Pack, Pistol Grip four-speed, and the loudest shade of Hemi Orange Chrysler ever put in a spray gun. This one left the St. Louis assembly plant as a T/A tribute spec and has been turning heads — and occasionally necks — ever since. The Rallye dash is all original and every gauge still works."],
    [1965, "Pontiac", "GTO", "Goat", "The original muscle car, and this one backs it up with a tri-power 389 and a close-ratio four-speed. Found it as a tired driver with a tired Craigslist ad and spent the better part of a year sorting the suspension, freshening the engine, and tracking down NOS trim pieces. The Montero Red paint is new but mixed to the original formula."],
  ],
  "Modern Car": [
    [2023, "Chevrolet", "Corvette", "Rapid Red", "The C8 mid-engine layout still turns heads at every Cars and Coffee, and this one earns extra looks with the Z51 aero package and Adrenaline Red two-tone interior. Fully optioned from the factory — no aftermarket needed when the engineers already did the work. The DCT launch control has not gotten old yet."],
    [2022, "Ford", "Mustang GT", "Track Pack", "Coyote 5.0 with the Performance Pack Level 2 — MagneRide dampers, Brembo brakes, and a limited-slip that actually puts the power down. This one does double duty as a weekend canyon carver and an occasional track-day weapon at Castrol Raceway. The Recaro seats make long stints surprisingly comfortable."],
    [2024, "Toyota", "GR Supra", "White Lightning", "The A90 collaboration with BMW is more sorted every model year, and the 3.0 inline-six in this one pulls hard all the way to redline. Optioned in Refraction — a pearl white that shifts colour in sunlight — with the carbon fibre roof and the Performance Pack. Still on stock tune but the intake note alone is worth it."],
    [2021, "Dodge", "Charger", "Night Run", "Widebody Scat Pack with the 392 HEMI — the sleeper look of a family sedan combined with the soundtrack of something much angrier. The Pitch Black paint is the full stealth spec: black wheels, black badges, tinted glass all around. It has four doors and a back seat, which somehow makes it more menacing."],
    [2023, "BMW", "M4", "Alpine", "Competition xDrive in Alpine White over a full Merino leather interior — optioned the way Munich intended, not the way the internet argues about. The S58 twin-turbo inline-six is one of the best engines in production right now and this car proves it every time the traction control gets switched off. Carbon ceramic brakes are worth every penny."],
  ],
  Truck: [
    [1972, "Chevrolet", "C10", "Shop Truck", "Started as a dead-straight shortbed with a seized 307 and the best original patina you have ever seen — we kept every bit of it. LS3 swap with a 4L80 automatic sits under the hood now, hidden behind the stock grille so it still looks like grandpa's truck from the outside. Bagged on air, rolling on 20-inch smoothies."],
    [1979, "Ford", "F-150", "Highboy", "The last year of the Dana 60 front axle Highboy, and this one has both the front and rear Dana 60s still turning. Lifted three inches, shod in 35-inch BFGs, and powered by a freshly rebuilt 460 big-block with headers that exit in front of the rear tires. It weighs as much as a small planet but climbs like it doesn't know that."],
    [1985, "GMC", "Sierra", "Squarebody", "The squarebody generation deserves more respect than it gets, and hopefully this one makes the case. Full frame-off with a Duramax LBZ and Allison 1000 swap — the diesel torque through the original body is absolutely absurd. Candy Apple Red and tan interior, every chrome piece replated, and a bed you could actually put things in."],
    [2022, "Ram", "1500", "Big Horn", "Leveled two inches up front, Bilstein 5100 all around, and sitting on 35-inch Nitto Ridge Grapplers that fill the wells without rubbing. The 5.7 HEMI still sounds great at WOT even with 40,000 km on it. This one gets used — towing the sled trailer in winter and the camping setup all summer — and still cleans up nicely for a show."],
    [2021, "Toyota", "Tacoma", "Trail Rig", "Full overlanding build on a TRD Off-Road base: Old Man Emu suspension, ARB front bumper, dual ARB compressor mounted under the hood, and a rooftop tent on an Alu-Cab rack. The bed rack carries a 40L fridge and a full tool roll for backcountry self-sufficiency. It has been to the Yukon twice and the Rockies more times than I can count."],
  ],
  Motorbike: [
    [2020, "Harley-Davidson", "Street Bob", "Blackline", "Full black-out build starting from the factory Vivid Black — every chrome piece swapped for powder-coated black steel or bare machined aluminum. Vance and Hines short shots replace the stock exhaust, and the Stage 1 tune woke up the Milwaukee-Eight 114 considerably. Ape hangers, solo seat, and a mini-fairing keep the silhouette clean and mean."],
    [2018, "Indian", "Scout", "Copper Scout", "Bobber conversion on the 1133cc Scout platform — solo seat, chopped fenders front and rear, and polished Thunderstroke cases catching the light. The Copper Smoke paint is factory but it photographs like a custom job every time. Spoke wheels replace the cast originals and the clip-on bars bring the riding position forward just enough."],
    [2022, "Triumph", "Bonneville", "Cafe Sunday", "Scrambler 1200 engine in a Thruxton-inspired café racer build — this one started as a stock Bonneville T120 and got the full treatment over two winters. Clip-ons, rear sets, a single seat unit, and a tucked Zard exhaust system that is somehow road-legal and very much track-spirited. The British Racing Green is original; nothing else is."],
    [2019, "Ducati", "Scrambler", "Redline", "Desert Sled base transformed into a flat-tracker replica with a number board front and rear and a high scrambler exhaust wrapped in heat tape. The Termignoni slip-on adds a few horsepower and a lot of theatre. Wide bars, Pirelli Scorpion Rally tires, and a headlight grille complete the off-road aesthetic that will never actually go off-road."],
    [2021, "Yamaha", "Bolt", "Midnight", "Bobber build on the 942cc V-twin, stripped back to the essentials: solo saddle, teardrop tank, peanut fender, and a drag bar with minimal controls. Midnight Black from the factory became the canvas for a full pinstripe treatment done by hand. The air-cooled twin runs cool enough for Edmonton summers and sounds better than anything twice the price."],
  ],
  Custom: [
    [1932, "Ford", "Roadster", "Hot Rod", "Traditional hot rod built over twelve years in a one-car garage — channeled four inches over the frame rails and chopped two at the top of the windshield. Early Hemi from a 1955 DeSoto sits between the frame rails with a Potvin cam and Edmunds intake wearing three carbs. No power steering, no power brakes, no second thoughts."],
    [1964, "Chevrolet", "Impala", "Low Glow", "Lowrider built to full show spec over eight years — hydraulic four-corner setup with switched front, rear, and side pumps in the trunk. The custom cobalt blue metalflake paintwork was sprayed by a retired body man in his eighties who still has the steadiest hands in the city. Full wire-tucked interior with embroidered velour and a Pioneer head unit from 1987."],
    [1976, "Volkswagen", "Beetle", "Bug Out", "Cal-look build on a late Super Beetle — lowered to the bump stops on stock torsion bars and spring plates, running a built 1776cc on dual 40mm Webers. The Sahara Beige is correct for the year but the colour was resprayed with a modern urethane clear that you could use as a mirror. Empi five-spoke wheels, chrome bumpers deleted, and nothing inside that wasn't there in 1976."],
    [1991, "Mazda", "Miata", "Corner Carver", "Dedicated time-attack build on a first-generation NA platform — roll bar, harnesses, and a full cage make it CASC-legal for track days. The 1.6 breathes through a Flyin' Miata header and a custom 2.5-inch exhaust and revs to the moon. Suspension is full Koni Yellow with Ground Control coilover sleeves on all four corners, corner-balanced at the shop."],
    [1988, "Jeep", "Wagoneer", "Woodgrain", "The full-size Wagoneer is the original luxury SUV and this one was restored to make that argument to people who forgot. The real wood panelling on the doors was stripped, re-stained, and re-varnished panel by panel. A freshly rebuilt AMC 360 replaced the tired original, and the Selec-Trac transfer case was rebuilt with all new seals so it actually works in four-wheel drive now."],
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

  // Default admin team: members of the configured PCO team get ADMIN.
  const defaultAdminTeamName = process.env.PCO_TEAM_NAME ?? "carshow";
  const existingAdminTeam = await prisma.pcoTeamRole.findFirst({
    where: { pcoTeamName: defaultAdminTeamName, positionName: null },
  });
  if (existingAdminTeam) {
    await prisma.pcoTeamRole.update({
      where: { id: existingAdminTeam.id },
      data: { role: StaffRole.ADMIN, active: true },
    });
  } else {
    await prisma.pcoTeamRole.create({
      data: { pcoTeamName: defaultAdminTeamName, positionName: null, role: StaffRole.ADMIN },
    });
  }

  for (let index = 1; index <= 150; index += 1) {
    const visibleCode = index.toString().padStart(4, "0");
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
      const [year, make, model, nickname, buildStory] = template;
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
          buildStory,
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
          buildStory,
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
