import { Prisma, prisma } from "@carshow/db";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { eventId } from "../config.js";
import type { TextModerator } from "../text/moderation/index.js";

type OwnerRouteDeps = { textModerator: TextModerator };

type OwnerVehiclePayload = Prisma.VehicleEntryGetPayload<{
  include: { owner: true; category: true; photos: true };
}>;

function nullableText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

type OwnerSession = {
  ownerSession: true;
  ownerId: string;
  vehicleEntryId: string;
};

function normalizeAccessCode(value: string) {
  return value.replace(/\D/g, "").slice(0, 5);
}

function ownerVehicleSummary(vehicle: OwnerVehiclePayload) {
  return {
    id: vehicle.id,
    entryNumber: vehicle.entryNumber,
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    nickname: vehicle.nickname ?? null,
    category: {
      id: vehicle.category.id,
      name: vehicle.category.name,
      slug: vehicle.category.slug,
    },
  };
}

function ownerVehicleResponse(vehicle: OwnerVehiclePayload) {
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
    plateNumber: vehicle.plateNumber ?? null,
    exteriorColor: vehicle.exteriorColor ?? null,
    buildStory: vehicle.buildStory ?? "",
    ownerAccessCode: vehicle.ownerAccessCode,
    primaryPhotoId: vehicle.primaryPhotoId ?? null,
    status: vehicle.status,
    category: {
      id: vehicle.category.id,
      name: vehicle.category.name,
      slug: vehicle.category.slug,
    },
    owner: {
      id: vehicle.owner.id,
      firstName: vehicle.owner.firstName,
      lastName: vehicle.owner.lastName,
      phone: vehicle.owner.phone,
      email: vehicle.owner.email ?? null,
      publicName: vehicle.owner.publicName ?? null,
      publicNameOptIn: vehicle.owner.publicNameOptIn,
      waiverAccepted: vehicle.owner.waiverAccepted,
    },
    photos: photos.map((photo) => ({
      id: photo.id,
      url: photo.webUrl ?? photo.url ?? null,
      altText: photo.altText ?? null,
      sortOrder: photo.sortOrder,
      isPrimary: photo.id === vehicle.primaryPhotoId,
      ownerUploaded: photo.uploadedBy === `owner:${vehicle.ownerId}`,
      moderationStatus: photo.moderationStatus,
      createdAt: photo.createdAt.toISOString(),
    })),
  };
}

async function findOwnerVehicleById(vehicleId: string, ownerId?: string) {
  return prisma.vehicleEntry.findFirst({
    where: { id: vehicleId, eventId, ...(ownerId ? { ownerId } : {}) },
    include: {
      owner: true,
      category: true,
      photos: { orderBy: { sortOrder: "asc" } },
    },
  });
}

async function findOwnerVehicles(ownerId: string) {
  return prisma.vehicleEntry.findMany({
    where: { ownerId, eventId },
    include: {
      owner: true,
      category: true,
      photos: { orderBy: { sortOrder: "asc" } },
    },
    orderBy: { entryNumber: "asc" },
  });
}

export async function requireOwnerVehicle(app: FastifyInstance, request: FastifyRequest, vehicleId: string) {
  const authorization = z.object({ authorization: z.string().optional() }).parse(request.headers).authorization;
  if (!authorization?.startsWith("Bearer ")) throw app.httpErrors.unauthorized("Missing owner session");

  const session = app.jwt.verify<OwnerSession>(authorization.replace("Bearer ", ""));
  if (!session.ownerSession || !session.ownerId) throw app.httpErrors.unauthorized("Invalid owner session");

  const vehicle = await findOwnerVehicleById(vehicleId, session.ownerId);
  if (!vehicle) throw app.httpErrors.notFound("Vehicle not found");
  return { session, vehicle };
}

export async function registerOwnerRoutes(app: FastifyInstance, deps: OwnerRouteDeps) {
  app.post(
    "/owner/session",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "5 minutes",
          // Key by access code so shared WiFi doesn't lock out all owners.
          // This limits guessing attempts against any specific code, not per IP.
          keyGenerator: (req) => {
            const b = req.body as Record<string, unknown> | undefined;
            return typeof b?.accessCode === "string" ? `ac:${b.accessCode.replace(/\D/g, "").slice(0, 5)}` : req.ip;
          },
        },
      },
    },
    async (request) => {
    const body = z
      .object({
        lastName: z.string().trim().min(1).max(80),
        accessCode: z.string().trim().min(1),
      })
      .parse(request.body);
    const accessCode = normalizeAccessCode(body.accessCode);
    if (accessCode.length !== 5) throw app.httpErrors.badRequest("Access code must be 5 digits");

    const vehicle = await prisma.vehicleEntry.findFirst({
      where: {
        eventId,
        ownerAccessCode: accessCode,
        owner: { lastName: { equals: body.lastName, mode: "insensitive" } },
      },
      include: {
        owner: true,
        category: true,
        photos: { orderBy: { sortOrder: "asc" } },
      },
    });

    if (!vehicle) throw app.httpErrors.unauthorized("Last name or access code did not match");

    const vehicles = await findOwnerVehicles(vehicle.ownerId);
    const signOwnerToken = app.jwt.sign as unknown as (payload: OwnerSession, options: { expiresIn: string }) => string;
    const token = signOwnerToken(
      { ownerSession: true, ownerId: vehicle.ownerId, vehicleEntryId: vehicle.id },
      { expiresIn: "14d" },
    );

    return {
      token,
      vehicle: ownerVehicleResponse(vehicle),
      vehicles: vehicles.map(ownerVehicleSummary),
    };
  });

  app.get("/owner/vehicles/:id", async (request) => {
    const params = z.object({ id: z.string().trim().min(1) }).parse(request.params);
    const { vehicle, session } = await requireOwnerVehicle(app, request, params.id);
    const vehicles = await findOwnerVehicles(session.ownerId);
    return {
      vehicle: ownerVehicleResponse(vehicle),
      vehicles: vehicles.map(ownerVehicleSummary),
    };
  });

  app.patch("/owner/vehicles/:id", async (request) => {
    const params = z.object({ id: z.string().trim().min(1) }).parse(request.params);
    const body = z
      .object({
        owner: z
          .object({
            firstName: z.string().trim().min(1).max(80),
            lastName: z.string().trim().min(1).max(80),
            phone: z.string().trim().regex(/^\d{3}-\d{3}-\d{4}$/, "Phone must use XXX-XXX-XXXX format"),
            email: z.string().trim().email().optional().or(z.literal("")),
            publicName: z.string().trim().max(120).optional(),
            publicNameOptIn: z.boolean(),
          })
          .optional(),
        vehicle: z
          .object({
            year: z.coerce.number().int().min(1900).max(2100),
            make: z.string().trim().min(1).max(80),
            model: z.string().trim().min(1).max(100),
            nickname: z.string().trim().max(80).optional().nullable(),
            plateNumber: z.string().trim().max(20).optional().nullable(),
            exteriorColor: z.string().trim().max(60).optional().nullable(),
            buildStory: z.string().trim().max(2500).optional(),
          })
          .optional(),
      })
      .parse(request.body);

    const { vehicle, session } = await requireOwnerVehicle(app, request, params.id);

    const textsToCheck = [
      body.owner?.publicName,
      body.vehicle?.nickname,
      body.vehicle?.buildStory,
    ].filter((t): t is string => !!t);

    if (textsToCheck.length > 0) {
      const modResult = await deps.textModerator.moderate(textsToCheck);
      if (!modResult.approved) {
        throw app.httpErrors.unprocessableEntity(
          "Your submission contains content that doesn't meet our community guidelines. Please review and resubmit.",
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      if (body.owner) {
        await tx.owner.update({
          where: { id: vehicle.ownerId },
          data: {
            firstName: body.owner.firstName,
            lastName: body.owner.lastName,
            phone: body.owner.phone,
            email: body.owner.email || null,
            publicName: nullableText(body.owner.publicName),
            publicNameOptIn: body.owner.publicNameOptIn,
          },
        });
      }

      if (body.vehicle) {
        await tx.vehicleEntry.update({
          where: { id: vehicle.id },
          data: {
            year: body.vehicle.year,
            make: body.vehicle.make,
            model: body.vehicle.model,
            nickname: nullableText(body.vehicle.nickname),
            plateNumber: nullableText(body.vehicle.plateNumber)?.toUpperCase() ?? null,
            exteriorColor: nullableText(body.vehicle.exteriorColor),
            buildStory: body.vehicle.buildStory,
          },
        });
      }
    });

    const updated = await findOwnerVehicleById(params.id, session.ownerId);
    if (!updated) throw app.httpErrors.notFound("Vehicle not found");
    const vehicles = await findOwnerVehicles(session.ownerId);
    return { vehicle: ownerVehicleResponse(updated), vehicles: vehicles.map(ownerVehicleSummary) };
  });

  app.patch("/owner/vehicles/:id/primary-photo", async (request) => {
    const params = z.object({ id: z.string().trim().min(1) }).parse(request.params);
    const body = z.object({ photoId: z.string().trim().min(1) }).parse(request.body);
    const { vehicle, session } = await requireOwnerVehicle(app, request, params.id);

    const photo = await prisma.vehiclePhoto.findFirst({
      where: {
        id: body.photoId,
        vehicleEntryId: vehicle.id,
        moderationStatus: "APPROVED",
        url: { not: null },
      },
      select: { id: true },
    });
    if (!photo) throw app.httpErrors.badRequest("Only approved photos can be set as primary");

    await prisma.vehicleEntry.update({
      where: { id: vehicle.id },
      data: { primaryPhotoId: photo.id },
    });

    const updated = await findOwnerVehicleById(params.id, session.ownerId);
    if (!updated) throw app.httpErrors.notFound("Vehicle not found");
    const vehicles = await findOwnerVehicles(session.ownerId);
    return { vehicle: ownerVehicleResponse(updated), vehicles: vehicles.map(ownerVehicleSummary) };
  });
}
