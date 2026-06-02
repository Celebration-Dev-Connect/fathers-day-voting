import { Prisma, prisma } from "@carshow/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eventId } from "../config.js";

type OwnerVehiclePayload = Prisma.VehicleEntryGetPayload<{
  include: { owner: true; category: true; photos: true };
}>;

function nullableText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function ownerVehicleResponse(vehicle: OwnerVehiclePayload) {
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
    photos: vehicle.photos.map((photo) => ({
      id: photo.id,
      url: photo.url,
      altText: photo.altText ?? null,
      sortOrder: photo.sortOrder,
      moderationStatus: photo.moderationStatus,
      createdAt: photo.createdAt.toISOString(),
    })),
  };
}

async function findOwnerVehicleByToken(publicToken: string) {
  const qrCard = await prisma.qrCard.findFirst({
    where: { eventId, publicToken },
    select: { vehicleEntryId: true },
  });
  if (!qrCard?.vehicleEntryId) return null;

  return prisma.vehicleEntry.findFirst({
    where: { id: qrCard.vehicleEntryId, eventId },
    include: {
      owner: true,
      category: true,
      photos: { orderBy: { sortOrder: "asc" } },
    },
  });
}

export async function registerOwnerRoutes(app: FastifyInstance) {
  app.get("/owner/vehicles/:publicToken", async (request) => {
    const params = z.object({ publicToken: z.string().trim().min(1) }).parse(request.params);
    const vehicle = await findOwnerVehicleByToken(params.publicToken);
    if (!vehicle) throw app.httpErrors.notFound("Vehicle not found");
    return { vehicle: ownerVehicleResponse(vehicle) };
  });

  app.patch("/owner/vehicles/:publicToken", async (request) => {
    const params = z.object({ publicToken: z.string().trim().min(1) }).parse(request.params);
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

    const vehicle = await findOwnerVehicleByToken(params.publicToken);
    if (!vehicle) throw app.httpErrors.notFound("Vehicle not found");

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

    const updated = await findOwnerVehicleByToken(params.publicToken);
    if (!updated) throw app.httpErrors.notFound("Vehicle not found");
    return { vehicle: ownerVehicleResponse(updated) };
  });
}
