import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import { prisma, Prisma, QrCardStatus, StaffRole, VehicleStatus } from "@carshow/db";
import Fastify, { FastifyRequest } from "fastify";
import { createReadStream } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { config } from "./config.js";
import { createModerator } from "./media/moderation/index.js";
import { createStorage } from "./media/storage/index.js";
import { PhotoModerationWorker } from "./media/worker.js";

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
  secret: config.jwtSecret,
});

await app.register(multipart, {
  limits: { files: 1, fileSize: config.photos.maxBytes },
});

await app.register(rateLimit, { global: false });

const storage = createStorage();
const moderator = createModerator();
const photoWorker = new PhotoModerationWorker(storage, moderator, app.log);

const ALLOWED_PHOTO_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

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

function normalizeQrCode(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  try {
    const parsed = new URL(trimmed);
    const pathCode = parsed.pathname.split("/").filter(Boolean).at(-1);
    return pathCode || trimmed;
  } catch {
    return trimmed.replace(/\/$/, "");
  }
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
  phone: z.string().trim().regex(/^\d{3}-\d{3}-\d{4}$/, "Phone must use XXX-XXX-XXXX format"),
  email: z.string().trim().email().optional().or(z.literal("")),
  publicName: z.string().trim().optional(),
  publicNameOptIn: z.boolean().default(false),
  waiverAccepted: z.boolean().default(false),
});
import { buildApp } from "./app.js";

const app = await buildApp();
const port = Number(process.env.API_PORT ?? 4000);
const host = process.env.API_HOST ?? "0.0.0.0";
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

async function readUploadedImage(request: FastifyRequest) {
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

  // Create the row first (claims a sortOrder); retry on the rare concurrent unique clash.
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
    await prisma.vehiclePhoto.delete({ where: { id: photo.id } }).catch(() => { });
    throw err;
  }

  photoWorker.enqueue(photo.id);
  return { id: photo.id, status: "PENDING" as const };
}

app.get("/health", async () => {
  return { ok: true };
});

app.post("/auth/dev-login", async (request, reply) => {
  if (!config.enableDevLogin) {
    throw app.httpErrors.notFound("Dev login is disabled");
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

const votingRegistrationInclude = {
  owner: true,
  category: true,
  qrCard: true,
  photos: { orderBy: { sortOrder: "asc" as const } },
} satisfies Prisma.VehicleEntryInclude;

type VotingRegistration = Prisma.VehicleEntryGetPayload<{
  include: typeof votingRegistrationInclude;
}>;

type PeopleChoiceTallyItem = {
  registration: VotingRegistration;
  votes: number;
  rank: number;
  tieBreakPoints: number;
};

type JudgeScoreItem = {
  registration: VotingRegistration;
  rank: number;
  judgePoints: number;
  peopleChoiceTieBreakPoints: number;
  rankCounts: number[];
  tieBreakSummary: string;
  manualOverride: boolean;
};

function judgePointsForRank(rank: number) {
  return Math.max(0, 11 - rank);
}

function compareJudgeScores(first: JudgeScoreItem, second: JudgeScoreItem) {
  if (second.judgePoints !== first.judgePoints) return second.judgePoints - first.judgePoints;
  if (second.rankCounts[1] !== first.rankCounts[1]) return second.rankCounts[1] - first.rankCounts[1];
  if (second.peopleChoiceTieBreakPoints !== first.peopleChoiceTieBreakPoints) {
    return second.peopleChoiceTieBreakPoints - first.peopleChoiceTieBreakPoints;
  }
  for (let rank = 2; rank <= 10; rank += 1) {
    if (second.rankCounts[rank] !== first.rankCounts[rank]) return second.rankCounts[rank] - first.rankCounts[rank];
  }
  return first.registration.entryNumber - second.registration.entryNumber;
}

function buildTieBreakSummary(item: JudgeScoreItem) {
  const firstPlaceCount = item.rankCounts[1] ?? 0;
  return `${item.judgePoints} judge points; ${firstPlaceCount} first-place ranking${firstPlaceCount === 1 ? "" : "s"
    }; ${item.peopleChoiceTieBreakPoints} People's Choice tie-break points.`;
}

app.get("/voting/settings", async (request) => {
  await requireStaff(request);
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      name: true,
      votingOpen: true,
      judgingOpen: true,
      resultsPublished: true,
      peopleChoiceCutoff: true,
    },
  });

  if (!event) throw app.httpErrors.notFound("Event not found");
  return { event };
});

app.patch("/voting/settings", async (request) => {
  await requireAdmin(request);
  const body = z
    .object({
      votingOpen: z.boolean().optional(),
      judgingOpen: z.boolean().optional(),
      resultsPublished: z.boolean().optional(),
      peopleChoiceCutoff: z.string().datetime().nullable().optional(),
    })
    .parse(request.body);

  const event = await prisma.event.update({
    where: { id: eventId },
    data: {
      votingOpen: body.votingOpen,
      judgingOpen: body.judgingOpen,
      resultsPublished: body.resultsPublished,
      peopleChoiceCutoff:
        body.peopleChoiceCutoff === undefined
          ? undefined
          : body.peopleChoiceCutoff
            ? new Date(body.peopleChoiceCutoff)
            : null,
    },
    select: {
      id: true,
      name: true,
      votingOpen: true,
      judgingOpen: true,
      resultsPublished: true,
      peopleChoiceCutoff: true,
    },
  });

  return { event };
});

app.get("/voting/tallies", async (request) => {
  await requireStaff(request);
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      votingOpen: true,
      judgingOpen: true,
      resultsPublished: true,
      peopleChoiceCutoff: true,
    },
  });

  if (!event) throw app.httpErrors.notFound("Event not found");

  const [categories, voteGroups, judgePicks, winnerOverrides] = await Promise.all([
    prisma.category.findMany({
      where: { eventId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.peopleChoiceVote.groupBy({
      by: ["vehicleEntryId"],
      where: {
        eventId,
        createdAt: event.peopleChoiceCutoff ? { lte: event.peopleChoiceCutoff } : undefined,
      },
      _count: { _all: true },
      orderBy: { _count: { vehicleEntryId: "desc" } },
    }),
    prisma.judgeCategoryPick.findMany({
      where: { eventId, rank: { gte: 1, lte: 10 } },
      include: {
        category: true,
        vehicleEntry: { include: votingRegistrationInclude },
      },
      orderBy: [{ category: { sortOrder: "asc" } }, { judgeKey: "asc" }, { rank: "asc" }],
    }),
    prisma.categoryWinnerOverride.findMany({
      where: { eventId, rank: { in: [1, 2, 3] } },
      include: {
        vehicleEntry: { include: votingRegistrationInclude },
        adminStaffUser: true,
      },
      orderBy: [{ categoryId: "asc" }, { rank: "asc" }],
    }),
  ]);

  const votedVehicleIds = voteGroups.map((vote) => vote.vehicleEntryId);
  const votedVehicles = votedVehicleIds.length
    ? await prisma.vehicleEntry.findMany({
      where: { id: { in: votedVehicleIds }, eventId },
      include: votingRegistrationInclude,
    })
    : [];
  const vehicleById = new Map(votedVehicles.map((vehicle) => [vehicle.id, vehicle]));

  const peopleChoiceByCategory = new Map<string, PeopleChoiceTallyItem[]>();
  const peopleChoiceTieBreakByVehicleId = new Map<string, number>();
  for (const vote of voteGroups) {
    const vehicle = vehicleById.get(vote.vehicleEntryId);
    if (!vehicle) continue;
    const categoryVotes = peopleChoiceByCategory.get(vehicle.categoryId) ?? [];
    categoryVotes.push({ registration: vehicle, votes: vote._count._all, rank: 0, tieBreakPoints: 0 });
    peopleChoiceByCategory.set(vehicle.categoryId, categoryVotes);
  }

  for (const categoryVotes of peopleChoiceByCategory.values()) {
    categoryVotes.sort((first, second) => second.votes - first.votes);
    categoryVotes.forEach((item, index) => {
      item.rank = index + 1;
      item.tieBreakPoints = Math.max(0, 11 - item.rank);
      if (item.rank <= 10) peopleChoiceTieBreakByVehicleId.set(item.registration.id, item.tieBreakPoints);
    });
  }

  const judgeScoresByCategory = new Map<string, Map<string, JudgeScoreItem>>();
  for (const pick of judgePicks) {
    const categoryScores = judgeScoresByCategory.get(pick.categoryId) ?? new Map<string, JudgeScoreItem>();
    const current =
      categoryScores.get(pick.vehicleEntryId) ??
      ({
        registration: pick.vehicleEntry,
        rank: 0,
        judgePoints: 0,
        peopleChoiceTieBreakPoints: peopleChoiceTieBreakByVehicleId.get(pick.vehicleEntryId) ?? 0,
        rankCounts: Array.from({ length: 11 }, () => 0),
        tieBreakSummary: "",
        manualOverride: false,
      } satisfies JudgeScoreItem);

    current.judgePoints += judgePointsForRank(pick.rank);
    current.rankCounts[pick.rank] = (current.rankCounts[pick.rank] ?? 0) + 1;
    categoryScores.set(pick.vehicleEntryId, current);
    judgeScoresByCategory.set(pick.categoryId, categoryScores);
  }

  const overridesByCategory = new Map<string, typeof winnerOverrides>();
  for (const override of winnerOverrides) {
    const overrides = overridesByCategory.get(override.categoryId) ?? [];
    overrides.push(override);
    overridesByCategory.set(override.categoryId, overrides);
  }

  return {
    event,
    categories: categories.map((category) => {
      const peopleChoice = (peopleChoiceByCategory.get(category.id) ?? []).slice(0, 5);
      const judgeRanking = Array.from(judgeScoresByCategory.get(category.id)?.values() ?? [])
        .sort(compareJudgeScores)
        .map((item, index) => ({
          ...item,
          rank: index + 1,
          tieBreakSummary: buildTieBreakSummary(item),
        }));
      const overrides = overridesByCategory.get(category.id) ?? [];
      const overrideByVehicleId = new Map(overrides.map((override) => [override.vehicleEntryId, override]));
      const judgeTop3 = overrides.length
        ? overrides.map((override) => {
          const score = judgeRanking.find((item) => item.registration.id === override.vehicleEntryId);
          return {
            ...(score ?? {
              registration: override.vehicleEntry,
              judgePoints: 0,
              peopleChoiceTieBreakPoints: peopleChoiceTieBreakByVehicleId.get(override.vehicleEntryId) ?? 0,
              rankCounts: Array.from({ length: 11 }, () => 0),
              tieBreakSummary: "Manual override winner.",
            }),
            rank: override.rank,
            manualOverride: true,
            overrideReason: override.reason,
            overrideBy: override.adminStaffUser?.displayName ?? null,
            overrideAt: override.updatedAt,
          };
        })
        : judgeRanking.slice(0, 3).map((item) => ({
          ...item,
          manualOverride: Boolean(overrideByVehicleId.get(item.registration.id)),
        }));

      return {
        category,
        peopleChoice,
        judgeRanking,
        judgeTop3,
        judgingDescription:
          "Judges rank up to 10 vehicles per category. Rank 1 earns 10 points down to rank 10 earning 1 point. Ties break by first-place count, then People's Choice top-10 points, then judge rank counts from second through tenth. Remaining ties require admin final ordering.",
      };
    }),
  };
});

app.put("/voting/categories/:categoryId/winners", async (request) => {
  const staff = await requireAdmin(request);
  const params = z.object({ categoryId: z.string() }).parse(request.params);
  const body = z
    .object({
      winners: z
        .array(
          z.object({
            vehicleEntryId: z.string(),
            rank: z.number().int().min(1).max(3),
          }),
        )
        .length(3),
      reason: z.string().trim().max(500).optional(),
    })
    .parse(request.body);

  const category = await prisma.category.findFirst({ where: { id: params.categoryId, eventId } });
  if (!category) throw app.httpErrors.notFound("Category not found");

  const ranks = new Set(body.winners.map((winner) => winner.rank));
  const vehicleIds = new Set(body.winners.map((winner) => winner.vehicleEntryId));
  if (ranks.size !== 3 || vehicleIds.size !== 3) {
    throw app.httpErrors.badRequest("Choose three different vehicles ranked 1, 2, and 3");
  }

  const vehicles = await prisma.vehicleEntry.findMany({
    where: { id: { in: [...vehicleIds] }, eventId, categoryId: category.id },
    select: { id: true },
  });
  if (vehicles.length !== 3) throw app.httpErrors.badRequest("All winners must be in this category");

  await prisma.$transaction(async (tx) => {
    await tx.categoryWinnerOverride.deleteMany({ where: { eventId, categoryId: category.id } });
    for (const winner of body.winners) {
      await tx.categoryWinnerOverride.create({
        data: {
          eventId,
          categoryId: category.id,
          vehicleEntryId: winner.vehicleEntryId,
          rank: winner.rank,
          reason: body.reason ?? "Manual admin winner order",
          adminStaffUserId: staff.id,
        },
      });
    }
  });

  return { ok: true };
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
      photos: { orderBy: { sortOrder: "asc" } },
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

app.get("/qr-cards", async (request) => {
  await requireStaff(request);
  const query = z
    .object({
      status: z.nativeEnum(QrCardStatus).optional(),
    })
    .parse(request.query);

  const qrCards = await prisma.qrCard.findMany({
    where: {
      eventId,
      status: query.status,
    },
    include: {
      vehicleEntry: {
        include: { owner: true, category: true },
      },
    },
    orderBy: { visibleCode: "asc" },
  });

  return { qrCards };
});

app.get("/qr-cards/:code", async (request) => {
  await requireStaff(request);
  const params = z.object({ code: z.string().trim().min(1) }).parse(request.params);
  const code = normalizeQrCode(params.code);
  const qrCard = await prisma.qrCard.findFirst({
    where: {
      eventId,
      OR: [{ visibleCode: code }, { publicToken: code }],
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
  const code = normalizeQrCode(body.code);

  const result = await prisma.$transaction(async (tx) => {
    const vehicle = await tx.vehicleEntry.findFirst({
      where: { id: body.vehicleEntryId, eventId },
      include: { qrCard: true },
    });

    if (!vehicle) throw app.httpErrors.notFound("Registration not found");

    const qrCard = await tx.qrCard.findFirst({
      where: {
        eventId,
        OR: [{ visibleCode: code }, { publicToken: code }],
      },
    });

    if (!qrCard) throw app.httpErrors.notFound("QR card not found");
    if (vehicle.qrCard?.id === qrCard.id) {
      throw app.httpErrors.conflict("Vehicle already has this QR card assigned");
    }
    if (qrCard.status !== QrCardStatus.PRINTED || qrCard.vehicleEntryId) {
      throw app.httpErrors.conflict("QR card is already assigned or unavailable");
    }

    if (vehicle.qrCard) {
      await tx.qrCard.update({
        where: { id: vehicle.qrCard.id },
        data: {
          status: QrCardStatus.REASSIGNED,
          vehicleEntryId: null,
        },
      });

      await tx.qrAssignmentAuditLog.create({
        data: {
          eventId,
          qrCardId: vehicle.qrCard.id,
          vehicleEntryId: vehicle.id,
          staffUserId: staff.id,
          action: "REASSIGNED",
          reason: `Replaced by ${qrCard.visibleCode}`,
        },
      });
    }

    const updatedQrCard = await tx.qrCard.update({
      where: { id: qrCard.id },
      data: {
        status: QrCardStatus.ASSIGNED,
        vehicleEntryId: vehicle.id,
        assignedAt: new Date(),
      },
    });

    const registration = await tx.vehicleEntry.update({
      where: { id: vehicle.id },
      data: {
        status: VehicleStatus.CHECKED_IN,
        checkedInAt: vehicle.checkedInAt ?? new Date(),
      },
      include: { owner: true, category: true, qrCard: true },
    });

    const auditLog = await tx.qrAssignmentAuditLog.create({
      data: {
        eventId,
        qrCardId: qrCard.id,
        vehicleEntryId: vehicle.id,
        staffUserId: staff.id,
        action: vehicle.qrCard ? "REASSIGNED" : "ASSIGNED",
        reason: vehicle.qrCard ? `Replaced ${vehicle.qrCard.visibleCode}` : "Initial registration assignment",
      },
    });

    return { qrCard: updatedQrCard, auditLog, registration };
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

// ---------------------------------------------------------------------------
// Public (unauthenticated) endpoints
// ---------------------------------------------------------------------------

function toPublicVehicle(
  vehicle: Prisma.VehicleEntryGetPayload<{
    include: {
      owner: true;
      category: true;
      photos: true;
    };
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
    ownerName: vehicle.owner.publicNameOptIn ? (vehicle.owner.publicName || `${vehicle.owner.firstName} ${vehicle.owner.lastName}`) : null,
    photos: vehicle.photos.map((p) => ({ id: p.id, url: p.url, altText: p.altText ?? null, sortOrder: p.sortOrder })),
  };
}

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
          photos: { orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });

  if (!qrCard) throw app.httpErrors.notFound("QR code not found");

  if (!qrCard.vehicleEntry) {
    return { assigned: false as const };
  }

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

  if (!event?.votingOpen) {
    throw app.httpErrors.forbidden("Voting is not currently open");
  }

  if (event.peopleChoiceCutoff && new Date() > event.peopleChoiceCutoff) {
    throw app.httpErrors.forbidden("Voting has closed");
  }

  const qrCard = await prisma.qrCard.findUnique({
    where: { publicToken: params.token },
    include: { vehicleEntry: { include: { category: true } } },
  });

  if (!qrCard?.vehicleEntry) {
    throw app.httpErrors.notFound("Vehicle not found");
  }

  const vehicle = qrCard.vehicleEntry;

  try {
    await prisma.peopleChoiceVote.create({
      data: {
        eventId,
        vehicleEntryId: vehicle.id,
        categoryId: vehicle.categoryId,
        voterKey: body.voterKey,
      },
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
    include: {
      owner: true,
      category: true,
      photos: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!vehicle) throw app.httpErrors.notFound("Entry not found");

  return { vehicle: toPublicVehicle(vehicle) };
});

const PAGE_SIZE = 12;

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
      data: {
        eventId,
        vehicleEntryId: vehicle.id,
        categoryId: vehicle.categoryId,
        voterKey: body.voterKey,
      },
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
      include: {
        owner: true,
        category: true,
        photos: { orderBy: { sortOrder: "asc" }, take: 1 },
      },
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
    pagination: {
      page,
      pageSize: PAGE_SIZE,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
});

// ---------------------------------------------------------------------------

// ---- Photo upload + moderation ----

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
    const image = await readUploadedImage(request);
    const result = await createPendingPhoto(qrCard.vehicleEntryId, `visitor:${request.ip}`, image);
    return reply.code(202).send(result);
  },
);

app.post("/registrations/:id/photos", async (request, reply) => {
  const staff = await requireStaff(request);
  const params = z.object({ id: z.string() }).parse(request.params);
  const vehicle = await prisma.vehicleEntry.findFirst({
    where: { id: params.id, eventId },
    select: { id: true },
  });
  if (!vehicle) throw app.httpErrors.notFound("Registration not found");
  const image = await readUploadedImage(request);
  const result = await createPendingPhoto(vehicle.id, `staff:${staff.id}`, image);
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

// Dev-only static serving of locally-stored APPROVED photos (prod uses CloudFront).
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

await app.listen({ port: config.port, host: config.host });


photoWorker.start();
