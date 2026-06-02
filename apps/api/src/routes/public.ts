import { Prisma, VehicleStatus, prisma } from "@carshow/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eventId } from "../config.js";

const PAGE_SIZE = 12;

function toPublicVehicle(
  vehicle: Prisma.VehicleEntryGetPayload<{
    include: { owner: true; category: true; photos: true };
  }>,
) {
  return {
    id: vehicle.id,
    entryNumber: vehicle.entryNumber,
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    nickname: vehicle.nickname ?? null,
    exteriorColor: vehicle.exteriorColor ?? null,
    category: {
      id: vehicle.category.id,
      name: vehicle.category.name,
      slug: vehicle.category.slug,
    },
    ownerName: vehicle.owner.publicNameOptIn
      ? vehicle.owner.publicName || `${vehicle.owner.firstName} ${vehicle.owner.lastName}`
      : null,
    photos: vehicle.photos.map((p) => ({ id: p.id, url: p.url, altText: p.altText ?? null, sortOrder: p.sortOrder })),
  };
}

export async function registerPublicRoutes(app: FastifyInstance) {
  app.get("/public/hero-photos", async () => {
    const photos = await prisma.$queryRaw<
      Array<{ url: string; altText: string | null; year: number; make: string; model: string; nickname: string | null }>
    >`
      SELECT p.url, p."altText", e.year, e.make, e.model, e.nickname
      FROM "VehiclePhoto" p
      JOIN "VehicleEntry" e ON e.id = p."vehicleEntryId"
      WHERE e."eventId" = ${eventId}
        AND e.status = 'CHECKED_IN'
        AND p."moderationStatus" = 'APPROVED'
        AND p.url IS NOT NULL
        AND p."sortOrder" = 1
      ORDER BY RANDOM()
      LIMIT 10
    `;
    return { photos };
  });

  app.get("/public/event", async () => {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        name: true,
        eventDate: true,
        venueName: true,
        votingOpen: true,
        peopleChoiceCutoff: true,
        resultsPublished: true,
      },
    });
    if (!event) throw app.httpErrors.notFound("Event not found");

    const categories = await prisma.category.findMany({
      where: { eventId, active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true },
    });

    return { event, categories };
  });

  app.get("/public/vehicles/:token", async (request) => {
    const params = z.object({ token: z.string().trim().min(1) }).parse(request.params);
    const query = z.object({ voterKey: z.string().optional() }).parse(request.query);

    const qrCard = await prisma.qrCard.findUnique({
      where: { publicToken: params.token },
      include: {
        vehicleEntry: {
          include: {
            owner: true,
            category: true,
            photos: { where: { moderationStatus: "APPROVED" }, orderBy: { sortOrder: "asc" } },
          },
        },
      },
    });

    if (!qrCard) throw app.httpErrors.notFound("QR code not found");
    if (!qrCard.vehicleEntry) return { assigned: false as const };

    const vehicle = qrCard.vehicleEntry;
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { votingOpen: true, peopleChoiceCutoff: true },
    });

    const cutoffPassed = event?.peopleChoiceCutoff ? new Date() > event.peopleChoiceCutoff : false;

    let alreadyVotedInCategory = false;
    if (query.voterKey && event?.votingOpen && !cutoffPassed) {
      const existing = await prisma.peopleChoiceVote.findUnique({
        where: {
          eventId_categoryId_voterKey: {
            eventId,
            categoryId: vehicle.categoryId,
            voterKey: query.voterKey,
          },
        },
      });
      alreadyVotedInCategory = existing !== null;
    }

    return {
      assigned: true as const,
      vehicle: toPublicVehicle(vehicle),
      votingOpen: event?.votingOpen ?? false,
      cutoffPassed,
      alreadyVotedInCategory,
    };
  });

  app.post("/public/vehicles/:token/vote", async (request) => {
    const params = z.object({ token: z.string().trim().min(1) }).parse(request.params);
    const body = z.object({ voterKey: z.string().trim().min(1) }).parse(request.body);

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { votingOpen: true, peopleChoiceCutoff: true },
    });

    if (!event?.votingOpen) throw app.httpErrors.forbidden("Voting is not currently open");
    if (event.peopleChoiceCutoff && new Date() > event.peopleChoiceCutoff) {
      throw app.httpErrors.forbidden("Voting has closed");
    }

    const qrCard = await prisma.qrCard.findUnique({
      where: { publicToken: params.token },
      include: { vehicleEntry: { include: { category: true } } },
    });
    if (!qrCard?.vehicleEntry) throw app.httpErrors.notFound("Vehicle not found");
    const vehicle = qrCard.vehicleEntry;

    try {
      await prisma.peopleChoiceVote.create({
        data: { eventId, vehicleEntryId: vehicle.id, categoryId: vehicle.categoryId, voterKey: body.voterKey },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw app.httpErrors.conflict(`You've already voted in the ${vehicle.category.name} category`);
      }
      throw err;
    }

    return { ok: true, categoryName: vehicle.category.name };
  });

  app.get("/public/entries/:entryNumber", async (request) => {
    const params = z.object({ entryNumber: z.coerce.number().int().positive() }).parse(request.params);
    const vehicle = await prisma.vehicleEntry.findFirst({
      where: { eventId, entryNumber: params.entryNumber, status: VehicleStatus.CHECKED_IN },
      include: { owner: true, category: true, photos: { where: { moderationStatus: "APPROVED" }, orderBy: { sortOrder: "asc" } } },
    });
    if (!vehicle) throw app.httpErrors.notFound("Entry not found");
    return { vehicle: toPublicVehicle(vehicle) };
  });

  app.post("/public/entries/:vehicleId/vote", async (request) => {
    const params = z.object({ vehicleId: z.string().trim().min(1) }).parse(request.params);
    const body = z.object({ voterKey: z.string().trim().min(1) }).parse(request.body);

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { votingOpen: true, peopleChoiceCutoff: true },
    });
    if (!event?.votingOpen) throw app.httpErrors.forbidden("Voting is not currently open");
    if (event.peopleChoiceCutoff && new Date() > event.peopleChoiceCutoff) {
      throw app.httpErrors.forbidden("Voting has closed");
    }

    const vehicle = await prisma.vehicleEntry.findFirst({
      where: { id: params.vehicleId, eventId, status: VehicleStatus.CHECKED_IN },
      include: { category: true },
    });
    if (!vehicle) throw app.httpErrors.notFound("Vehicle not found");

    try {
      await prisma.peopleChoiceVote.create({
        data: { eventId, vehicleEntryId: vehicle.id, categoryId: vehicle.categoryId, voterKey: body.voterKey },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw app.httpErrors.conflict(`You've already voted in the ${vehicle.category.name} category`);
      }
      throw err;
    }

    return { ok: true as const, categoryName: vehicle.category.name };
  });

  app.get("/public/categories/:slug/entries", async (request) => {
    const params = z.object({ slug: z.string().trim().min(1) }).parse(request.params);
    const query = z.object({ page: z.coerce.number().int().min(1).default(1) }).parse(request.query);

    const category = await prisma.category.findFirst({
      where: { eventId, slug: params.slug, active: true },
    });
    if (!category) throw app.httpErrors.notFound("Category not found");

    const where = { eventId, categoryId: category.id, status: VehicleStatus.CHECKED_IN };
    const [total, vehicles] = await Promise.all([
      prisma.vehicleEntry.count({ where }),
      prisma.vehicleEntry.findMany({
        where,
        include: { owner: true, category: true, photos: { where: { moderationStatus: "APPROVED" }, orderBy: { sortOrder: "asc" }, take: 1 } },
        orderBy: { entryNumber: "asc" },
        skip: (query.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.min(query.page, totalPages);

    return {
      category: { id: category.id, name: category.name, slug: category.slug },
      entries: vehicles.map(toPublicVehicle),
      pagination: { page, pageSize: PAGE_SIZE, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
    };
  });
}
