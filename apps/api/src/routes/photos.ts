import { Prisma, prisma } from "@carshow/db";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { createReadStream } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { requireStaff } from "../auth.js";
import { config, eventId } from "../config.js";
import type { PhotoModerationWorker } from "../media/worker.js";
import type { PhotoStorage } from "../media/storage/index.js";

type PhotosDeps = { storage: PhotoStorage; worker: PhotoModerationWorker };

const ALLOWED_PHOTO_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

async function readUploadedImage(app: FastifyInstance, request: FastifyRequest) {
  const file = await request.file();
  if (!file) throw app.httpErrors.badRequest("No image file provided");
  if (!ALLOWED_PHOTO_MIME.has(file.mimetype)) {
    throw app.httpErrors.unsupportedMediaType("Only JPEG, PNG, or WebP images are allowed");
  }
  try {
    const bytes = await file.toBuffer();
    return { bytes, contentType: file.mimetype };
  } catch {
    throw app.httpErrors.payloadTooLarge("Image exceeds the maximum allowed size");
  }
}

async function createPendingPhoto(
  app: FastifyInstance,
  { storage, worker }: PhotosDeps,
  vehicleEntryId: string,
  uploadedBy: string,
  image: { bytes: Buffer; contentType: string },
) {
  const activeCount = await prisma.vehiclePhoto.count({
    where: { vehicleEntryId, moderationStatus: { in: ["PENDING", "APPROVED"] } },
  });
  if (activeCount >= config.photos.perVehicleCap) {
    throw app.httpErrors.conflict("This vehicle already has the maximum number of photos");
  }

  let photo: { id: string } | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const last = await prisma.vehiclePhoto.findFirst({
      where: { vehicleEntryId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    try {
      photo = await prisma.vehiclePhoto.create({
        data: {
          vehicleEntryId,
          sortOrder: (last?.sortOrder ?? 0) + 1,
          contentType: image.contentType,
          moderationStatus: "PENDING",
          uploadedBy,
        },
      });
      break;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && attempt < 2) continue;
      throw err;
    }
  }
  if (!photo) throw app.httpErrors.conflict("Could not allocate a photo slot, please retry");

  try {
    const { storageKey } = await storage.putPending(photo.id, image.bytes, image.contentType);
    await prisma.vehiclePhoto.update({ where: { id: photo.id }, data: { storageKey } });
  } catch (err) {
    await prisma.vehiclePhoto.delete({ where: { id: photo.id } }).catch(() => {});
    throw err;
  }

  worker.enqueue(photo.id);
  return { id: photo.id, status: "PENDING" as const };
}

export async function registerPhotosRoutes(app: FastifyInstance, deps: PhotosDeps) {
  app.post(
    "/v/:publicToken/photos",
    { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const params = z.object({ publicToken: z.string().trim().min(1) }).parse(request.params);
      const qrCard = await prisma.qrCard.findFirst({
        where: { eventId, publicToken: params.publicToken },
        select: { vehicleEntryId: true },
      });
      if (!qrCard?.vehicleEntryId) throw app.httpErrors.notFound("Vehicle not found");
      const image = await readUploadedImage(app, request);
      const result = await createPendingPhoto(app, deps, qrCard.vehicleEntryId, `visitor:${request.ip}`, image);
      return reply.code(202).send(result);
    },
  );

  app.post("/registrations/:id/photos", async (request, reply) => {
    const staff = await requireStaff(app, request);
    const params = z.object({ id: z.string() }).parse(request.params);
    const vehicle = await prisma.vehicleEntry.findFirst({
      where: { id: params.id, eventId },
      select: { id: true },
    });
    if (!vehicle) throw app.httpErrors.notFound("Registration not found");
    const image = await readUploadedImage(app, request);
    const result = await createPendingPhoto(app, deps, vehicle.id, `staff:${staff.id}`, image);
    return reply.code(202).send(result);
  });

  app.get("/v/:publicToken", async (request) => {
    const params = z.object({ publicToken: z.string().trim().min(1) }).parse(request.params);
    const qrCard = await prisma.qrCard.findFirst({
      where: { eventId, publicToken: params.publicToken },
      include: {
        vehicleEntry: {
          include: {
            category: true,
            owner: true,
            photos: { where: { moderationStatus: "APPROVED" }, orderBy: { sortOrder: "asc" } },
          },
        },
      },
    });
    if (!qrCard?.vehicleEntry) throw app.httpErrors.notFound("Vehicle not found");
    const vehicle = qrCard.vehicleEntry;
    return {
      vehicle: {
        entryNumber: vehicle.entryNumber,
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        nickname: vehicle.nickname,
        category: vehicle.category.name,
        ownerPublicName: vehicle.owner.publicNameOptIn
          ? vehicle.owner.publicName?.trim() || vehicle.owner.firstName
          : null,
        photos: vehicle.photos.map((photo) => ({
          id: photo.id,
          url: photo.url,
          altText: photo.altText,
          sortOrder: photo.sortOrder,
        })),
      },
    };
  });

  if (config.storage.driver === "local") {
    app.get("/media/public/:id", async (request, reply) => {
      const params = z.object({ id: z.string().regex(/^[a-z0-9]+$/i) }).parse(request.params);
      const photo = await prisma.vehiclePhoto.findFirst({
        where: { storageKey: `public/${params.id}`, moderationStatus: "APPROVED" },
        select: { contentType: true },
      });
      if (!photo) throw app.httpErrors.notFound("Image not found");
      reply.header("Content-Type", photo.contentType ?? "application/octet-stream");
      reply.header("Cache-Control", "public, max-age=300");
      return reply.send(createReadStream(join(config.storage.localDir, "public", params.id)));
    });
  }
}
