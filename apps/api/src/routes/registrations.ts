import { Prisma, QrCardStatus, StaffRole, VehicleStatus, prisma } from "@carshow/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireStaff } from "../auth.js";
import { eventId } from "../config.js";
import { registrationSchema } from "../schemas/registration.js";
import { normalizeSearch } from "../utils.js";

type RegistrationPayload = Prisma.VehicleEntryGetPayload<{
  include: { owner: true; category: true; qrCard: true; photos: true };
}>;

async function nextEntryNumber() {
  const latest = await prisma.vehicleEntry.findFirst({
    where: { eventId },
    orderBy: { entryNumber: "desc" },
    select: { entryNumber: true },
  });

  return (latest?.entryNumber ?? 0) + 1;
}

function accessCodeForEntry(entryNumber: number) {
  return (entryNumber % 100000).toString().padStart(5, "0");
}

function registrationResponse(registration: RegistrationPayload) {
  const photos = [...registration.photos].sort((a, b) => {
    if (a.id === registration.primaryPhotoId) return -1;
    if (b.id === registration.primaryPhotoId) return 1;
    return a.sortOrder - b.sortOrder;
  });

  return {
    ...registration,
    primaryPhotoId: registration.primaryPhotoId ?? null,
    photos: photos.map((photo) => ({
      id: photo.id,
      vehicleEntryId: photo.vehicleEntryId,
      url: photo.url,
      altText: photo.altText,
      sortOrder: photo.sortOrder,
      isPrimary: photo.id === registration.primaryPhotoId,
      ownerUploaded: photo.uploadedBy === `owner:${registration.ownerId}`,
      moderationStatus: photo.moderationStatus,
      createdAt: photo.createdAt.toISOString(),
    })),
  };
}

export async function registerRegistrationRoutes(app: FastifyInstance) {
  app.get("/registrations/metrics", async (request) => {
    await requireStaff(app, request);

    const [total, checkedIn, assignedQr, categories, photosApproved, photosRejected] = await Promise.all([
      prisma.vehicleEntry.count({ where: { eventId } }),
      prisma.vehicleEntry.count({ where: { eventId, status: VehicleStatus.CHECKED_IN } }),
      prisma.qrCard.count({
        where: {
          eventId,
          status: QrCardStatus.ASSIGNED,
          vehicleEntryId: { not: null },
        },
      }),
      prisma.category.count({ where: { eventId, active: true } }),
      prisma.vehiclePhoto.count({ where: { vehicleEntry: { eventId }, moderationStatus: "APPROVED" } }),
      prisma.vehiclePhoto.count({ where: { vehicleEntry: { eventId }, moderationStatus: "REJECTED" } }),
    ]);

    return { metrics: { total, checkedIn, assignedQr, categories, photosApproved, photosRejected } };
  });

  app.get("/registrations", async (request) => {
    await requireStaff(app, request);
    const query = z.object({ search: z.string().optional() }).parse(request.query);
    const search = normalizeSearch(query.search);
    const numericSearch = Number(search.replace(/^#/, ""));

    const searchFilters: Prisma.VehicleEntryWhereInput[] | undefined = search
      ? [
          ...(Number.isFinite(numericSearch) ? [{ entryNumber: numericSearch }] : []),
          { make: { contains: search, mode: "insensitive" } },
          { model: { contains: search, mode: "insensitive" } },
          { plateNumber: { contains: search, mode: "insensitive" } },
          { owner: { firstName: { contains: search, mode: "insensitive" } } },
          { owner: { lastName: { contains: search, mode: "insensitive" } } },
          { owner: { phone: { contains: search, mode: "insensitive" } } },
          { owner: { email: { contains: search, mode: "insensitive" } } },
          { ownerAccessCode: { contains: search } },
          { qrCard: { visibleCode: { contains: search, mode: "insensitive" } } },
          { qrCard: { publicToken: { contains: search, mode: "insensitive" } } },
        ]
      : undefined;

    const registrations = await prisma.vehicleEntry.findMany({
      where: {
        eventId,
        ...(searchFilters ? { OR: searchFilters } : {}),
      },
      orderBy: { entryNumber: "desc" },
      include: {
        owner: true,
        category: true,
        qrCard: true,
        photos: { orderBy: { sortOrder: "asc" } },
      },
      take: 100,
    });

    return { registrations: registrations.map(registrationResponse) };
  });

  app.post("/registrations", async (request) => {
    const staff = await requireStaff(app, request);
    const body = registrationSchema.parse(request.body);

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { registrationOpen: true },
    });

    if (!event) throw app.httpErrors.notFound("Event not found");
    if (!event.registrationOpen && staff.role !== StaffRole.ADMIN) {
      throw app.httpErrors.forbidden("Registration is closed");
    }

    const category = await prisma.category.findFirst({
      where: { id: body.vehicle.categoryId, eventId, active: true },
    });

    if (!category) {
      throw app.httpErrors.badRequest("Active category is required");
    }

    const entryNumber = await nextEntryNumber();
    const registration = await prisma.$transaction(async (tx) => {
      const owner = await tx.owner.create({
        data: {
          ...body.owner,
          email: body.owner.email || null,
        },
      });

      return tx.vehicleEntry.create({
        data: {
          eventId,
          ownerId: owner.id,
          categoryId: body.vehicle.categoryId,
          entryNumber,
          ownerAccessCode: accessCodeForEntry(entryNumber),
          year: body.vehicle.year,
          make: body.vehicle.make,
          model: body.vehicle.model,
          nickname: body.vehicle.nickname,
          plateNumber: body.vehicle.plateNumber,
          exteriorColor: body.vehicle.exteriorColor,
          internalNotes: body.vehicle.internalNotes,
          buildStory: body.vehicle.buildStory,
          registeredByStaffId: staff.id,
        },
        include: {
          owner: true,
          category: true,
          qrCard: true,
          photos: { orderBy: { sortOrder: "asc" } },
        },
      });
    });

    return { registration: registrationResponse(registration) };
  });

  app.get("/registrations/:id", async (request) => {
    await requireStaff(app, request);
    const params = z.object({ id: z.string() }).parse(request.params);
    const registration = await prisma.vehicleEntry.findFirst({
      where: { id: params.id, eventId },
      include: {
        owner: true,
        category: true,
        qrCard: true,
        photos: { orderBy: { sortOrder: "asc" } },
        qrAuditLogs: {
          include: { staffUser: true, qrCard: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!registration) throw app.httpErrors.notFound("Registration not found");
    return { registration: registrationResponse(registration) };
  });

  app.patch("/registrations/:id", async (request) => {
    await requireStaff(app, request);
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = registrationSchema.partial().parse(request.body);

    const existing = await prisma.vehicleEntry.findFirst({
      where: { id: params.id, eventId },
      include: { owner: true },
    });

    if (!existing) throw app.httpErrors.notFound("Registration not found");

    const registration = await prisma.$transaction(async (tx) => {
      if (body.owner) {
        await tx.owner.update({
          where: { id: existing.ownerId },
          data: {
            ...body.owner,
            email: body.owner.email || null,
          },
        });
      }

      return tx.vehicleEntry.update({
        where: { id: existing.id },
        data: body.vehicle
          ? {
              categoryId: body.vehicle.categoryId,
              year: body.vehicle.year,
              make: body.vehicle.make,
              model: body.vehicle.model,
              nickname: body.vehicle.nickname,
              plateNumber: body.vehicle.plateNumber,
              exteriorColor: body.vehicle.exteriorColor,
              internalNotes: body.vehicle.internalNotes,
              buildStory: body.vehicle.buildStory,
            }
          : {},
        include: { owner: true, category: true, qrCard: true, photos: { orderBy: { sortOrder: "asc" } } },
      });
    });

    return { registration: registrationResponse(registration) };
  });

  app.patch("/registrations/:id/primary-photo", async (request) => {
    await requireStaff(app, request);
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ photoId: z.string().trim().min(1) }).parse(request.body);
    const existing = await prisma.vehicleEntry.findFirst({
      where: { id: params.id, eventId },
      select: { id: true },
    });
    if (!existing) throw app.httpErrors.notFound("Registration not found");

    const photo = await prisma.vehiclePhoto.findFirst({
      where: {
        id: body.photoId,
        vehicleEntryId: existing.id,
        moderationStatus: "APPROVED",
        url: { not: null },
      },
      select: { id: true },
    });
    if (!photo) throw app.httpErrors.badRequest("Only approved photos can be set as hero");

    const registration = await prisma.vehicleEntry.update({
      where: { id: existing.id },
      data: { primaryPhotoId: photo.id },
      include: { owner: true, category: true, qrCard: true, photos: { orderBy: { sortOrder: "asc" } } },
    });

    return { registration: registrationResponse(registration) };
  });

  app.post("/registrations/:id/check-in", async (request) => {
    await requireStaff(app, request);
    const params = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.vehicleEntry.findFirst({
      where: { id: params.id, eventId },
    });

    if (!existing) throw app.httpErrors.notFound("Registration not found");

    const registration = await prisma.vehicleEntry.update({
      where: { id: existing.id },
      data: {
        status: VehicleStatus.CHECKED_IN,
        checkedInAt: new Date(),
      },
      include: { owner: true, category: true, qrCard: true, photos: { orderBy: { sortOrder: "asc" } } },
    });

    return { registration: registrationResponse(registration) };
  });
}
