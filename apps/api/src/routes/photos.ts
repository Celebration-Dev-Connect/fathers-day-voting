import { Prisma, prisma } from "@carshow/db";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { createReadStream } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { requireStaff } from "../auth.js";
import { config, eventId } from "../config.js";
import type { PhotoModerationWorker } from "../media/worker.js";
import type { PhotoStorage } from "../media/storage/index.js";
import { requireOwnerVehicle } from "./owner.js";

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
  source: "STAFF" | "VISITOR",
  image: { bytes: Buffer; contentType: string },
) {
  const activeCount = await prisma.vehiclePhoto.count({
    where: {
      vehicleEntryId,
      moderationStatus: { in: ["PENDING", "PROCESSING", "HUMAN_REVIEW", "APPROVED"] },
    },
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
          source,
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

async function deletePhotoObjects(app: FastifyInstance, deps: PhotosDeps, photoId: string, storageKey: string | null) {
  const keys = [storageKey, `public/${photoId}`, `public/${photoId}-web`, `public/${photoId}-medium`, `public/${photoId}-thumb`].filter(
    (key): key is string => Boolean(key),
  );
  await Promise.all(
    [...new Set(keys)].map((key) =>
      deps.storage.deleteStorageKey(key).catch((err) =>
        app.log.warn({ err, photoId, storageKey: key }, "could not delete photo storage object"),
      ),
    ),
  );
}

export async function registerPhotosRoutes(app: FastifyInstance, deps: PhotosDeps) {
  app.get("/photos/review", async (request) => {
    await requireStaff(app, request);
    const query = z
      .object({
        status: z.enum(["needs-review", "approved", "rejected", "all"]).default("needs-review"),
      })
      .parse(request.query);

    const statusWhere: Prisma.VehiclePhotoWhereInput =
      query.status === "needs-review"
        ? { moderationStatus: { in: ["PENDING", "PROCESSING", "HUMAN_REVIEW", "FAILED"] } }
        : query.status === "approved"
          ? { moderationStatus: "APPROVED" }
          : query.status === "rejected"
            ? { moderationStatus: "REJECTED" }
            : {};

    const photos = await prisma.vehiclePhoto.findMany({
      where: {
        vehicleEntry: { eventId },
        ...statusWhere,
      },
      include: {
        vehicleEntry: {
          include: {
            owner: true,
            category: true,
            qrCard: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return {
      photos: photos.map((photo) => ({
        id: photo.id,
        url: photo.webUrl ?? photo.url ?? null,
        mediumUrl: photo.mediumUrl,
        thumbUrl: photo.thumbUrl,
        contentType: photo.contentType,
        altText: photo.altText,
        sortOrder: photo.sortOrder,
        moderationStatus: photo.moderationStatus,
        moderationLabels: photo.moderationLabels,
        source: photo.source,
        uploadedBy: photo.uploadedBy,
        processingStartedAt: photo.processingStartedAt?.toISOString() ?? null,
        processedAt: photo.processedAt?.toISOString() ?? null,
        createdAt: photo.createdAt.toISOString(),
        vehicleEntry: {
          id: photo.vehicleEntry.id,
          entryNumber: photo.vehicleEntry.entryNumber,
          year: photo.vehicleEntry.year,
          make: photo.vehicleEntry.make,
          model: photo.vehicleEntry.model,
          nickname: photo.vehicleEntry.nickname,
          exteriorColor: photo.vehicleEntry.exteriorColor,
          status: photo.vehicleEntry.status,
          category: {
            id: photo.vehicleEntry.category.id,
            name: photo.vehicleEntry.category.name,
            slug: photo.vehicleEntry.category.slug,
          },
          owner: {
            id: photo.vehicleEntry.owner.id,
            firstName: photo.vehicleEntry.owner.firstName,
            lastName: photo.vehicleEntry.owner.lastName,
            phone: photo.vehicleEntry.owner.phone,
            email: photo.vehicleEntry.owner.email,
            publicName: photo.vehicleEntry.owner.publicName,
            publicNameOptIn: photo.vehicleEntry.owner.publicNameOptIn,
            waiverAccepted: photo.vehicleEntry.owner.waiverAccepted,
          },
          qrCard: photo.vehicleEntry.qrCard
            ? {
                id: photo.vehicleEntry.qrCard.id,
                visibleCode: photo.vehicleEntry.qrCard.visibleCode,
                publicToken: photo.vehicleEntry.qrCard.publicToken,
                status: photo.vehicleEntry.qrCard.status,
                vehicleEntryId: photo.vehicleEntry.qrCard.vehicleEntryId,
                printedAt: photo.vehicleEntry.qrCard.printedAt?.toISOString() ?? null,
                assignedAt: photo.vehicleEntry.qrCard.assignedAt?.toISOString() ?? null,
              }
            : null,
        },
      })),
    };
  });

  app.get("/photos/review/:id/image", async (request, reply) => {
    await requireStaff(app, request);
    const params = z.object({ id: z.string().trim().min(1) }).parse(request.params);
    const photo = await prisma.vehiclePhoto.findFirst({
      where: { id: params.id, vehicleEntry: { eventId }, storageKey: { not: null } },
      select: { storageKey: true, contentType: true },
    });
    if (!photo?.storageKey) throw app.httpErrors.notFound("Photo image not found");

    const bytes = await deps.storage.getBytes(photo.storageKey);
    reply.header("Content-Type", photo.contentType ?? "application/octet-stream");
    reply.header("Cache-Control", "private, max-age=30");
    return reply.send(bytes);
  });

  app.patch("/photos/review/:id", async (request) => {
    await requireStaff(app, request);
    const params = z.object({ id: z.string().trim().min(1) }).parse(request.params);
    const body = z.object({ status: z.enum(["APPROVED", "REJECTED"]) }).parse(request.body);

    const photo = await prisma.vehiclePhoto.findFirst({
      where: { id: params.id, vehicleEntry: { eventId } },
      select: { id: true, storageKey: true, url: true, mediumUrl: true, thumbUrl: true, moderationStatus: true },
    });
    if (!photo) throw app.httpErrors.notFound("Photo not found");

    if (body.status === "APPROVED") {
      let storageKey = photo.storageKey;
      let url = photo.url;
      if (storageKey && !storageKey.startsWith("public/")) {
        const moved = await deps.storage.moveToPublic(photo.id);
        storageKey = moved.storageKey;
      }
      if (storageKey) url = deps.storage.publicUrl(storageKey);

      const updated = await prisma.vehiclePhoto.update({
        where: { id: photo.id },
        data: {
          moderationStatus: "APPROVED",
          storageKey,
          url,
          mediumUrl: photo.mediumUrl,
          thumbUrl: photo.thumbUrl,
          processedAt: new Date(),
          processingStartedAt: null,
        },
      });
      return { photo: updated };
    }

    if (photo.storageKey && !photo.storageKey.startsWith("public/")) {
      await deps.storage.deletePending(photo.id).catch((err) =>
        app.log.warn({ err, photoId: photo.id }, "could not delete rejected pending photo bytes"),
      );
    }

    const updated = await prisma.vehiclePhoto.update({
      where: { id: photo.id },
      data: {
        moderationStatus: "REJECTED",
        processedAt: new Date(),
        processingStartedAt: null,
      },
    });
    return { photo: updated };
  });

  app.post(
    "/v/:publicToken/photos",
    {
      config: {
        rateLimit: {
          max: 12,
          timeWindow: "1 minute",
          // Key by the vehicle's public token, not IP — every visitor at the
          // venue shares one NAT IP, so an IP key would cap uploads for the whole
          // event. This gives each car its own per-minute upload budget.
          keyGenerator: (req) => {
            const p = req.params as Record<string, unknown> | undefined;
            return typeof p?.publicToken === "string" ? `pt:${p.publicToken}` : req.ip;
          },
        },
      },
    },
    async (request, reply) => {
      const params = z.object({ publicToken: z.string().trim().min(1) }).parse(request.params);
      const qrCard = await prisma.qrCard.findFirst({
        where: { eventId, publicToken: params.publicToken },
        select: { vehicleEntryId: true },
      });
      if (!qrCard?.vehicleEntryId) throw app.httpErrors.notFound("Vehicle not found");
      const image = await readUploadedImage(app, request);
      const result = await createPendingPhoto(app, deps, qrCard.vehicleEntryId, `visitor:${request.ip}`, "VISITOR", image);
      return reply.code(202).send(result);
    },
  );

  app.post(
    "/owner/vehicles/:id/photos",
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: "15 minutes",
          // Key by the vehicle id, not IP — owners on the shared venue WiFi would
          // otherwise collapse to one budget. Per-vehicle keeps each owner's
          // uploads independent.
          keyGenerator: (req) => {
            const p = req.params as Record<string, unknown> | undefined;
            return typeof p?.id === "string" ? `veh:${p.id}` : req.ip;
          },
        },
      },
    },
    async (request, reply) => {
      const params = z.object({ id: z.string().trim().min(1) }).parse(request.params);
      const { vehicle } = await requireOwnerVehicle(app, request, params.id);
      const image = await readUploadedImage(app, request);
      const result = await createPendingPhoto(app, deps, vehicle.id, `owner:${vehicle.ownerId}`, "VISITOR", image);
      return reply.code(202).send(result);
    },
  );

  app.delete("/owner/vehicles/:id/photos/:photoId", async (request) => {
    const params = z
      .object({
        id: z.string().trim().min(1),
        photoId: z.string().trim().min(1),
      })
      .parse(request.params);
    const { vehicle } = await requireOwnerVehicle(app, request, params.id);
    const photo = await prisma.vehiclePhoto.findFirst({
      where: {
        id: params.photoId,
        vehicleEntryId: vehicle.id,
        uploadedBy: `owner:${vehicle.ownerId}`,
      },
      select: { id: true, storageKey: true },
    });
    if (!photo) throw app.httpErrors.notFound("Owner-uploaded photo not found");

    await prisma.$transaction(async (tx) => {
      if (vehicle.primaryPhotoId === photo.id) {
        const replacement = await tx.vehiclePhoto.findFirst({
          where: {
            vehicleEntryId: vehicle.id,
            id: { not: photo.id },
            moderationStatus: "APPROVED",
            url: { not: null },
          },
          orderBy: { sortOrder: "asc" },
          select: { id: true },
        });
        await tx.vehicleEntry.update({
          where: { id: vehicle.id },
          data: { primaryPhotoId: replacement?.id ?? null },
        });
      }

      await tx.vehiclePhoto.delete({ where: { id: photo.id } });
    });

    await deletePhotoObjects(app, deps, photo.id, photo.storageKey);
    return { ok: true };
  });

  app.post("/registrations/:id/photos", async (request, reply) => {
    const staff = await requireStaff(app, request);
    const params = z.object({ id: z.string() }).parse(request.params);
    const vehicle = await prisma.vehicleEntry.findFirst({
      where: { id: params.id, eventId },
      select: { id: true },
    });
    if (!vehicle) throw app.httpErrors.notFound("Registration not found");
    const image = await readUploadedImage(app, request);
    const result = await createPendingPhoto(app, deps, vehicle.id, `staff:${staff.id}`, "STAFF", image);
    return reply.code(202).send(result);
  });

  app.delete("/registrations/:id/photos/:photoId", async (request) => {
    await requireStaff(app, request);
    const params = z
      .object({
        id: z.string().trim().min(1),
        photoId: z.string().trim().min(1),
      })
      .parse(request.params);
    const vehicle = await prisma.vehicleEntry.findFirst({
      where: { id: params.id, eventId },
      select: { id: true, primaryPhotoId: true },
    });
    if (!vehicle) throw app.httpErrors.notFound("Registration not found");

    const photo = await prisma.vehiclePhoto.findFirst({
      where: { id: params.photoId, vehicleEntryId: vehicle.id },
      select: { id: true, storageKey: true },
    });
    if (!photo) throw app.httpErrors.notFound("Photo not found");

    await prisma.$transaction(async (tx) => {
      if (vehicle.primaryPhotoId === photo.id) {
        const replacement = await tx.vehiclePhoto.findFirst({
          where: {
            vehicleEntryId: vehicle.id,
            id: { not: photo.id },
            moderationStatus: "APPROVED",
            url: { not: null },
          },
          orderBy: { sortOrder: "asc" },
          select: { id: true },
        });
        await tx.vehicleEntry.update({
          where: { id: vehicle.id },
          data: { primaryPhotoId: replacement?.id ?? null },
        });
      }

      await tx.vehiclePhoto.delete({ where: { id: photo.id } });
    });

    await deletePhotoObjects(app, deps, photo.id, photo.storageKey);
    return { ok: true };
  });

  app.post(
    "/public/entries/:vehicleId/photos",
    { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const params = z.object({ vehicleId: z.string().trim().min(1) }).parse(request.params);
      const vehicle = await prisma.vehicleEntry.findFirst({
        where: { id: params.vehicleId, eventId },
        select: { id: true },
      });
      if (!vehicle) throw app.httpErrors.notFound("Vehicle not found");
      const image = await readUploadedImage(app, request);
      const result = await createPendingPhoto(app, deps, vehicle.id, `visitor:${request.ip}`, "VISITOR", image);
      return reply.code(202).send(result);
    },
  );

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
    const photos = [...vehicle.photos].sort((a, b) => {
      if (a.id === vehicle.primaryPhotoId) return -1;
      if (b.id === vehicle.primaryPhotoId) return 1;
      return a.sortOrder - b.sortOrder;
    });
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
        primaryPhotoId: vehicle.primaryPhotoId ?? null,
        photos: photos.map((photo) => ({
          id: photo.id,
          url: photo.url,
          altText: photo.altText,
          sortOrder: photo.sortOrder,
          isPrimary: photo.id === vehicle.primaryPhotoId,
        })),
      },
    };
  });

  if (config.storage.driver === "local") {
    app.get("/media/public/:id", async (request, reply) => {
      const params = z.object({ id: z.string().regex(/^[a-z0-9]+(?:-(medium|thumb))?$/i) }).parse(request.params);
      // Variants share the base photo's approval status — strip suffix to look up.
      const baseId = params.id.replace(/-(medium|thumb)$/, "");
      const photo = await prisma.vehiclePhoto.findFirst({
        where: { storageKey: `public/${baseId}`, moderationStatus: "APPROVED" },
        select: { contentType: true },
      });
      if (!photo) throw app.httpErrors.notFound("Image not found");
      const isVariant = params.id !== baseId;
      reply.header("Content-Type", isVariant ? "image/webp" : (photo.contentType ?? "application/octet-stream"));
      reply.header("Cache-Control", "public, max-age=300");
      return reply.send(createReadStream(join(config.storage.localDir, "public", params.id)));
    });
  }
}
