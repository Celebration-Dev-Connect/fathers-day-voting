import { PhotoModerationStatus, Prisma, VehicleStatus, prisma } from "@carshow/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eventId } from "../config.js";
import { placementsForVehicle } from "../services/publishedResults.js";
import { normalizeSearch } from "../utils.js";

const PAGE_SIZE = 12;

function searchTokens(search: string) {
  return search.split(/\s+/).map((token) => token.trim()).filter(Boolean);
}

function publicVehicleSearchFilter(search: string): Prisma.VehicleEntryWhereInput {
  const numericSearch = Number(search.replace(/^#/, ""));
  const tokenFilters = searchTokens(search).map((token): Prisma.VehicleEntryWhereInput => {
    const numericToken = Number(token.replace(/^#/, ""));
    return {
      OR: [
        ...(Number.isFinite(numericToken) ? [{ entryNumber: numericToken }, { year: numericToken }] : []),
        { make: { contains: token, mode: "insensitive" } },
        { model: { contains: token, mode: "insensitive" } },
        { nickname: { contains: token, mode: "insensitive" } },
        { exteriorColor: { contains: token, mode: "insensitive" } },
        { owner: { publicNameOptIn: true, firstName: { contains: token, mode: "insensitive" } } },
        { owner: { publicNameOptIn: true, lastName: { contains: token, mode: "insensitive" } } },
        { owner: { publicNameOptIn: true, publicName: { contains: token, mode: "insensitive" } } },
      ],
    };
  });

  return {
    OR: [
      ...(Number.isFinite(numericSearch) ? [{ entryNumber: numericSearch }, { year: numericSearch }] : []),
      { make: { contains: search, mode: "insensitive" } },
      { model: { contains: search, mode: "insensitive" } },
      { nickname: { contains: search, mode: "insensitive" } },
      { exteriorColor: { contains: search, mode: "insensitive" } },
      { owner: { publicNameOptIn: true, firstName: { contains: search, mode: "insensitive" } } },
      { owner: { publicNameOptIn: true, lastName: { contains: search, mode: "insensitive" } } },
      { owner: { publicNameOptIn: true, publicName: { contains: search, mode: "insensitive" } } },
      ...(tokenFilters.length > 1 ? [{ AND: tokenFilters }] : []),
    ],
  };
}

function voteMetadata(request: { ip: string; headers: Record<string, string | string[] | undefined> }) {
  const forwardedFor = request.headers["x-forwarded-for"];
  const firstForwardedIp = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  const userAgent = request.headers["user-agent"];
  return {
    ipAddress: (firstForwardedIp?.split(",")[0]?.trim() || request.ip || null) as string | null,
    userAgent: (Array.isArray(userAgent) ? userAgent[0] : userAgent) ?? null,
  };
}

function toPublicVehicle(
  vehicle: Prisma.VehicleEntryGetPayload<{
    include: { owner: true; category: true; photos: true };
  }>,
) {
  const photos = [...vehicle.photos].sort((a, b) => {
    if (a.id === vehicle.primaryPhotoId) return -1;
    if (b.id === vehicle.primaryPhotoId) return 1;
    return a.sortOrder - b.sortOrder;
  });

  return {
    id: vehicle.id,
    entryNumber: vehicle.entryNumber,
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    nickname: vehicle.nickname ?? null,
    exteriorColor: vehicle.exteriorColor ?? null,
    buildStory: vehicle.buildStory ?? null,
    category: {
      id: vehicle.category.id,
      name: vehicle.category.name,
      slug: vehicle.category.slug,
    },
    ownerName: vehicle.owner.publicNameOptIn
      ? vehicle.owner.publicName || `${vehicle.owner.firstName} ${vehicle.owner.lastName}`
      : null,
    primaryPhotoId: vehicle.primaryPhotoId ?? null,
    photos: photos.map((p) => ({
      id: p.id,
      url: p.webUrl ?? p.url ?? null,
      mediumUrl: p.mediumUrl ?? null,
      thumbUrl: p.thumbUrl ?? null,
      altText: p.altText ?? null,
      sortOrder: p.sortOrder,
      isPrimary: p.id === vehicle.primaryPhotoId,
    })),
  };
}

export async function registerPublicRoutes(app: FastifyInstance) {
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
        resultsPublishedAt: true,
        resultsSnapshot: true,
      },
    });
    if (!event) throw app.httpErrors.notFound("Event not found");

    const [categories, specialAwards] = await Promise.all([
      prisma.category.findMany({
        where: { eventId, active: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, slug: true },
      }),
      prisma.specialAward.findMany({
        where: { eventId, active: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, description: true },
      }),
    ]);

    const resultsPublished = event.resultsPublished && event.resultsSnapshot !== null;
    return {
      event: {
        name: event.name,
        eventDate: event.eventDate,
        venueName: event.venueName,
        votingOpen: event.votingOpen,
        peopleChoiceCutoff: event.peopleChoiceCutoff,
        resultsPublished,
        resultsPublishedAt: resultsPublished ? event.resultsPublishedAt : null,
      },
      categories,
      specialAwards,
    };
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

    const cutoffPassed = event?.peopleChoiceCutoff
      ? Date.now() >= event.peopleChoiceCutoff.getTime()
      : false;

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

  app.post(
    "/public/vehicles/:token/vote",
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: "1 minute",
          // preHandler fires after body parsing, so req.body is available.
          // Default onRequest hook runs before parsing — body is always null there,
          // causing the keyGenerator to fall back to IP and rate-limit the whole
          // venue WiFi after 30 votes from any shared IP.
          hook: "preHandler",
          // Key by voterKey so each visitor gets their own 30/min budget.
          // Falls back to IP only if voterKey is somehow absent from the body.
          keyGenerator: (req) => {
            const b = req.body as Record<string, unknown> | undefined;
            return typeof b?.voterKey === "string" ? `vk:${b.voterKey}` : req.ip;
          },
        },
      },
    },
    async (request) => {
    const params = z.object({ token: z.string().trim().min(1) }).parse(request.params);
    const body = z.object({ voterKey: z.string().trim().min(1) }).parse(request.body);

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { votingOpen: true, peopleChoiceCutoff: true },
    });

    if (!event?.votingOpen) throw app.httpErrors.forbidden("Voting is not currently open");
    if (event.peopleChoiceCutoff && Date.now() >= event.peopleChoiceCutoff.getTime()) {
      throw app.httpErrors.forbidden("Voting has closed");
    }

    const qrCard = await prisma.qrCard.findUnique({
      where: { publicToken: params.token },
      include: { vehicleEntry: { include: { category: true } } },
    });
    if (!qrCard?.vehicleEntry) throw app.httpErrors.notFound("Vehicle not found");
    const vehicle = qrCard.vehicleEntry;

    const metadata = voteMetadata(request);
    await prisma.peopleChoiceVote.upsert({
      where: { eventId_categoryId_voterKey: { eventId, categoryId: vehicle.categoryId, voterKey: body.voterKey } },
      create: { eventId, vehicleEntryId: vehicle.id, categoryId: vehicle.categoryId, voterKey: body.voterKey, ...metadata },
      update: { vehicleEntryId: vehicle.id, ...metadata },
    });

    return { ok: true, categoryName: vehicle.category.name };
  });

  app.get("/public/entries/:entryNumber", async (request) => {
    const params = z.object({ entryNumber: z.string().trim().min(1) }).parse(request.params);
    const digitsOnly = params.entryNumber.replace(/\D/g, "");
    if (!digitsOnly) throw app.httpErrors.badRequest("Entry number must contain digits");

    const parsedEntryNumber = Number(digitsOnly);
    if (!Number.isInteger(parsedEntryNumber) || parsedEntryNumber <= 0) {
      throw app.httpErrors.badRequest("Entry number must be a positive integer");
    }

    const include: Prisma.VehicleEntryInclude = {
      owner: true,
      category: true,
      photos: { where: { moderationStatus: PhotoModerationStatus.APPROVED }, orderBy: { sortOrder: "asc" } },
    };

    let vehicle = await prisma.vehicleEntry.findFirst({
      where: { eventId, entryNumber: parsedEntryNumber, status: VehicleStatus.CHECKED_IN },
      include,
    });

    if (!vehicle) {
      const visibleCodeCandidates = Array.from(
        new Set([digitsOnly, digitsOnly.padStart(4, "0"), digitsOnly.replace(/^0+/, "") || "0"]),
      );
      vehicle = await prisma.vehicleEntry.findFirst({
        where: {
          eventId,
          status: VehicleStatus.CHECKED_IN,
          qrCard: { visibleCode: { in: visibleCodeCandidates } },
        },
        include,
      });
    }

    if (!vehicle) throw app.httpErrors.notFound("Entry not found");
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { resultsPublished: true, resultsSnapshot: true },
    });
    return {
      vehicle: toPublicVehicle(vehicle),
      placements: event?.resultsPublished ? placementsForVehicle(event.resultsSnapshot, vehicle.id) : [],
    };
  });

  app.get("/public/results", async () => {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { resultsPublished: true, resultsSnapshot: true },
    });
    if (!event?.resultsPublished || !event.resultsSnapshot) {
      throw app.httpErrors.notFound("Results have not been published");
    }
    return { results: event.resultsSnapshot };
  });

  app.post(
    "/public/entries/:vehicleId/vote",
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: "1 minute",
          hook: "preHandler",
          keyGenerator: (req) => {
            const b = req.body as Record<string, unknown> | undefined;
            return typeof b?.voterKey === "string" ? `vk:${b.voterKey}` : req.ip;
          },
        },
      },
    },
    async (request) => {
    const params = z.object({ vehicleId: z.string().trim().min(1) }).parse(request.params);
    const body = z.object({ voterKey: z.string().trim().min(1) }).parse(request.body);

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { votingOpen: true, peopleChoiceCutoff: true },
    });
    if (!event?.votingOpen) throw app.httpErrors.forbidden("Voting is not currently open");
    if (event.peopleChoiceCutoff && Date.now() >= event.peopleChoiceCutoff.getTime()) {
      throw app.httpErrors.forbidden("Voting has closed");
    }

    const vehicle = await prisma.vehicleEntry.findFirst({
      where: { id: params.vehicleId, eventId, status: VehicleStatus.CHECKED_IN },
      include: { category: true },
    });
    if (!vehicle) throw app.httpErrors.notFound("Vehicle not found");

    const metadata = voteMetadata(request);
    await prisma.peopleChoiceVote.upsert({
      where: { eventId_categoryId_voterKey: { eventId, categoryId: vehicle.categoryId, voterKey: body.voterKey } },
      create: { eventId, vehicleEntryId: vehicle.id, categoryId: vehicle.categoryId, voterKey: body.voterKey, ...metadata },
      update: { vehicleEntryId: vehicle.id, ...metadata },
    });

    return { ok: true as const, categoryName: vehicle.category.name };
  });

  app.post(
    "/public/entries/:vehicleId/special-awards/:specialAwardId/vote",
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: "1 minute",
          hook: "preHandler",
          keyGenerator: (req) => {
            const body = req.body as Record<string, unknown> | undefined;
            return typeof body?.voterKey === "string" ? `vk:${body.voterKey}` : req.ip;
          },
        },
      },
    },
    async (request) => {
      const params = z
        .object({ vehicleId: z.string().trim().min(1), specialAwardId: z.string().trim().min(1) })
        .parse(request.params);
      const body = z.object({ voterKey: z.string().trim().min(1) }).parse(request.body);

      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { votingOpen: true, peopleChoiceCutoff: true },
      });
      if (!event?.votingOpen) throw app.httpErrors.forbidden("Voting is not currently open");
      if (event.peopleChoiceCutoff && Date.now() >= event.peopleChoiceCutoff.getTime()) {
        throw app.httpErrors.forbidden("Voting has closed");
      }

      const [vehicle, specialAward] = await Promise.all([
        prisma.vehicleEntry.findFirst({
          where: { id: params.vehicleId, eventId, status: VehicleStatus.CHECKED_IN },
          select: { id: true },
        }),
        prisma.specialAward.findFirst({
          where: { id: params.specialAwardId, eventId, active: true },
          select: { id: true, name: true },
        }),
      ]);
      if (!vehicle) throw app.httpErrors.notFound("Vehicle not found");
      if (!specialAward) throw app.httpErrors.notFound("Special award not found");

      const metadata = voteMetadata(request);
      await prisma.specialAwardVote.upsert({
        where: { eventId_specialAwardId_voterKey: { eventId, specialAwardId: specialAward.id, voterKey: body.voterKey } },
        create: { eventId, specialAwardId: specialAward.id, vehicleEntryId: vehicle.id, voterKey: body.voterKey, ...metadata },
        update: { vehicleEntryId: vehicle.id, ...metadata },
      });

      return { ok: true as const, specialAwardName: specialAward.name };
    },
  );

  app.get("/public/categories/:slug/entries", async (request) => {
    const params = z.object({ slug: z.string().trim().min(1) }).parse(request.params);
    const query = z.object({ page: z.coerce.number().int().min(1).default(1), search: z.string().optional() }).parse(request.query);
    const search = normalizeSearch(query.search);

    const category = await prisma.category.findFirst({
      where: { eventId, slug: params.slug, active: true },
    });
    if (!category) throw app.httpErrors.notFound("Category not found");

    const where: Prisma.VehicleEntryWhereInput = {
      eventId,
      categoryId: category.id,
      status: VehicleStatus.CHECKED_IN,
      ...(search ? publicVehicleSearchFilter(search) : {}),
    };
    const [total, vehicles] = await Promise.all([
      prisma.vehicleEntry.count({ where }),
      prisma.vehicleEntry.findMany({
        where,
        include: { owner: true, category: true, photos: { where: { moderationStatus: "APPROVED" }, orderBy: { sortOrder: "asc" } } },
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

  app.get("/public/entries", async (request) => {
    const query = z.object({ page: z.coerce.number().int().min(1).default(1), search: z.string().optional() }).parse(request.query);
    const search = normalizeSearch(query.search);

    const where: Prisma.VehicleEntryWhereInput = {
      eventId,
      status: VehicleStatus.CHECKED_IN,
      ...(search ? publicVehicleSearchFilter(search) : {}),
    };

    const [total, vehicles] = await Promise.all([
      prisma.vehicleEntry.count({ where }),
      prisma.vehicleEntry.findMany({
        where,
        include: { owner: true, category: true, photos: { where: { moderationStatus: "APPROVED" }, orderBy: { sortOrder: "asc" } } },
        orderBy: { entryNumber: "asc" },
        skip: (query.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.min(query.page, totalPages);

    return {
      entries: vehicles.map(toPublicVehicle),
      pagination: { page, pageSize: PAGE_SIZE, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
    };
  });
}
