import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import sensible from "@fastify/sensible";
import { prisma, QrCardStatus, StaffRole, VehicleStatus } from "@carshow/db";
import Fastify, { FastifyRequest } from "fastify";
import { z } from "zod";

const eventId = "event-2026-fathers-day";

type StaffSession = {
  staffUserId: string;
  role: StaffRole;
};

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: StaffSession;
    user: StaffSession;
  }
}

const app = Fastify({
  logger: true,
});

await app.register(cors, {
  origin: true,
  credentials: true,
});

await app.register(sensible);

await app.register(jwt, {
  secret: process.env.JWT_SECRET ?? "local-dev-secret-change-me",
});

const authHeaderSchema = z.object({
  authorization: z.string().optional(),
});

async function requireStaff(request: FastifyRequest) {
  const headers = authHeaderSchema.parse(request.headers);
  if (!headers.authorization?.startsWith("Bearer ")) {
    throw app.httpErrors.unauthorized("Missing staff session");
  }

  const token = headers.authorization.replace("Bearer ", "");
  const session = app.jwt.verify<StaffSession>(token);
  const staff = await prisma.staffUser.findUnique({
    where: { id: session.staffUserId },
  });

  if (!staff?.active) {
    throw app.httpErrors.unauthorized("Staff account is inactive");
  }

  return staff;
}

async function requireAdmin(request: FastifyRequest) {
  const staff = await requireStaff(request);
  if (staff.role !== StaffRole.ADMIN) {
    throw app.httpErrors.forbidden("Admin role required");
  }
  return staff;
}

function normalizeSearch(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function nextEntryNumber() {
  const latest = await prisma.vehicleEntry.findFirst({
    where: { eventId },
    orderBy: { entryNumber: "desc" },
    select: { entryNumber: true },
  });

  return (latest?.entryNumber ?? 0) + 1;
}

const ownerSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  phone: z.string().trim().min(7),
  email: z.string().trim().email().optional().or(z.literal("")),
  publicName: z.string().trim().optional(),
  publicNameOptIn: z.boolean().default(false),
  waiverAccepted: z.boolean().default(false),
});

const vehicleSchema = z.object({
  categoryId: z.string().min(1),
  year: z.coerce.number().int().min(1900).max(2100),
  make: z.string().trim().min(1),
  model: z.string().trim().min(1),
  nickname: z.string().trim().optional(),
  plateNumber: z.string().trim().optional(),
  exteriorColor: z.string().trim().optional(),
  internalNotes: z.string().trim().optional(),
});

const registrationSchema = z.object({
  owner: ownerSchema,
  vehicle: vehicleSchema,
});

app.get("/health", async () => {
  return { ok: true };
});

app.post("/auth/dev-login", async (request, reply) => {
  if (process.env.NODE_ENV === "production") {
    throw app.httpErrors.notFound("Dev login is disabled in production");
  }

  const body = z.object({ email: z.string().email() }).parse(request.body);
  const staff = await prisma.staffUser.findUnique({
    where: { email: body.email },
  });

  if (!staff?.devLogin || !staff.active) {
    throw app.httpErrors.unauthorized("Unknown dev staff user");
  }

  const token = app.jwt.sign({
    staffUserId: staff.id,
    role: staff.role,
  });

  return reply.send({
    token,
    staff: {
      id: staff.id,
      email: staff.email,
      displayName: staff.displayName,
      role: staff.role,
    },
  });
});

app.get("/auth/planning-center/start", async () => {
  throw app.httpErrors.notImplemented("Planning Center OAuth is configured in production setup later");
});

app.get("/auth/me", async (request) => {
  const staff = await requireStaff(request);
  return {
    staff: {
      id: staff.id,
      email: staff.email,
      displayName: staff.displayName,
      role: staff.role,
    },
  };
});

app.get("/categories", async (request) => {
  await requireStaff(request);
  return {
    categories: await prisma.category.findMany({
      where: { eventId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { vehicleEntries: true } } },
    }),
  };
});

app.post("/categories", async (request) => {
  await requireAdmin(request);
  const body = z
    .object({
      name: z.string().trim().min(1),
      active: z.boolean().default(true),
    })
    .parse(request.body);

  const count = await prisma.category.count({ where: { eventId } });
  const category = await prisma.category.create({
    data: {
      eventId,
      name: body.name,
      slug: slugify(body.name),
      active: body.active,
      sortOrder: count + 1,
    },
  });

  return { category };
});

app.patch("/categories/:id", async (request) => {
  await requireAdmin(request);
  const params = z.object({ id: z.string() }).parse(request.params);
  const body = z
    .object({
      name: z.string().trim().min(1).optional(),
      active: z.boolean().optional(),
    })
    .parse(request.body);

  const existing = await prisma.category.findFirst({
    where: { id: params.id, eventId },
  });

  if (!existing) throw app.httpErrors.notFound("Category not found");

  const category = await prisma.category.update({
    where: { id: existing.id },
    data: {
      ...body,
      slug: body.name ? slugify(body.name) : undefined,
    },
  });

  return { category };
});

app.get("/registrations", async (request) => {
  await requireStaff(request);
  const query = z.object({ search: z.string().optional() }).parse(request.query);
  const search = normalizeSearch(query.search);
  const numericSearch = Number(search.replace(/^#/, ""));

  const searchFilters = search
    ? [
        Number.isFinite(numericSearch) ? { entryNumber: numericSearch } : undefined,
        { make: { contains: search, mode: "insensitive" as const } },
        { model: { contains: search, mode: "insensitive" as const } },
        { plateNumber: { contains: search, mode: "insensitive" as const } },
        { owner: { firstName: { contains: search, mode: "insensitive" as const } } },
        { owner: { lastName: { contains: search, mode: "insensitive" as const } } },
        { owner: { phone: { contains: search, mode: "insensitive" as const } } },
        { owner: { email: { contains: search, mode: "insensitive" as const } } },
        { qrCard: { visibleCode: { contains: search, mode: "insensitive" as const } } },
        { qrCard: { publicToken: { contains: search, mode: "insensitive" as const } } },
      ].filter((filter) => filter !== undefined)
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
    },
    take: 100,
  });

  return { registrations };
});

app.post("/registrations", async (request) => {
  const staff = await requireStaff(request);
  const body = registrationSchema.parse(request.body);

  const category = await prisma.category.findFirst({
    where: { id: body.vehicle.categoryId, eventId, active: true },
  });

  if (!category) {
    throw app.httpErrors.badRequest("Active category is required");
  }

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
        entryNumber: await nextEntryNumber(),
        year: body.vehicle.year,
        make: body.vehicle.make,
        model: body.vehicle.model,
        nickname: body.vehicle.nickname,
        plateNumber: body.vehicle.plateNumber,
        exteriorColor: body.vehicle.exteriorColor,
        internalNotes: body.vehicle.internalNotes,
        registeredByStaffId: staff.id,
      },
      include: {
        owner: true,
        category: true,
        qrCard: true,
      },
    });
  });

  return { registration };
});

app.get("/registrations/:id", async (request) => {
  await requireStaff(request);
  const params = z.object({ id: z.string() }).parse(request.params);
  const registration = await prisma.vehicleEntry.findFirst({
    where: { id: params.id, eventId },
    include: {
      owner: true,
      category: true,
      qrCard: true,
      qrAuditLogs: {
        include: { staffUser: true, qrCard: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!registration) throw app.httpErrors.notFound("Registration not found");
  return { registration };
});

app.patch("/registrations/:id", async (request) => {
  await requireStaff(request);
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
          }
        : {},
      include: { owner: true, category: true, qrCard: true },
    });
  });

  return { registration };
});

app.post("/registrations/:id/check-in", async (request) => {
  await requireStaff(request);
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
    include: { owner: true, category: true, qrCard: true },
  });

  return { registration };
});

app.get("/qr-cards/:code", async (request) => {
  await requireStaff(request);
  const params = z.object({ code: z.string().trim().min(1) }).parse(request.params);
  const qrCard = await prisma.qrCard.findFirst({
    where: {
      eventId,
      OR: [{ visibleCode: params.code }, { publicToken: params.code }],
    },
    include: {
      vehicleEntry: {
        include: { owner: true, category: true },
      },
    },
  });

  if (!qrCard) throw app.httpErrors.notFound("QR card not found");
  return { qrCard };
});

app.post("/qr-cards/assign", async (request) => {
  const staff = await requireStaff(request);
  const body = z
    .object({
      vehicleEntryId: z.string(),
      code: z.string().trim().min(1),
    })
    .parse(request.body);

  const result = await prisma.$transaction(async (tx) => {
    const vehicle = await tx.vehicleEntry.findFirst({
      where: { id: body.vehicleEntryId, eventId },
      include: { qrCard: true },
    });

    if (!vehicle) throw app.httpErrors.notFound("Registration not found");
    if (vehicle.qrCard) throw app.httpErrors.conflict("Vehicle already has an assigned QR card");

    const qrCard = await tx.qrCard.findFirst({
      where: {
        eventId,
        OR: [{ visibleCode: body.code }, { publicToken: body.code }],
      },
    });

    if (!qrCard) throw app.httpErrors.notFound("QR card not found");
    if (qrCard.status !== QrCardStatus.PRINTED || qrCard.vehicleEntryId) {
      throw app.httpErrors.conflict("QR card is already assigned or unavailable");
    }

    const updatedQrCard = await tx.qrCard.update({
      where: { id: qrCard.id },
      data: {
        status: QrCardStatus.ASSIGNED,
        vehicleEntryId: vehicle.id,
        assignedAt: new Date(),
      },
    });

    await tx.vehicleEntry.update({
      where: { id: vehicle.id },
      data: {
        status: VehicleStatus.CHECKED_IN,
        checkedInAt: vehicle.checkedInAt ?? new Date(),
      },
    });

    const auditLog = await tx.qrAssignmentAuditLog.create({
      data: {
        eventId,
        qrCardId: qrCard.id,
        vehicleEntryId: vehicle.id,
        staffUserId: staff.id,
        action: "ASSIGNED",
        reason: "Initial registration assignment",
      },
    });

    return { qrCard: updatedQrCard, auditLog };
  });

  return result;
});

app.get("/qr-audit", async (request) => {
  await requireStaff(request);
  const query = z
    .object({
      vehicleEntryId: z.string().optional(),
      qrCardId: z.string().optional(),
    })
    .parse(request.query);

  const auditLogs = await prisma.qrAssignmentAuditLog.findMany({
    where: {
      eventId,
      vehicleEntryId: query.vehicleEntryId,
      qrCardId: query.qrCardId,
    },
    include: {
      staffUser: true,
      qrCard: true,
      vehicleEntry: {
        include: { owner: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return { auditLogs };
});

const port = Number(process.env.API_PORT ?? 4000);
const host = process.env.API_HOST ?? "0.0.0.0";

await app.listen({ port, host });
