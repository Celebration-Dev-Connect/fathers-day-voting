import { VehicleStatus, prisma } from "@carshow/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireJudge } from "../auth.js";
import { eventId } from "../config.js";
import { votingRegistrationInclude } from "../services/votingTally.js";

const ballotPickSchema = z.object({
  vehicleEntryId: z.string(),
  rank: z.number().int().min(1).max(10),
});

function judgeKeyForStaff(staffUserId: string) {
  return `staff:${staffUserId}`;
}

async function loadCategorySummaries(judgeKey: string) {
  const categories = await prisma.category.findMany({
    where: { eventId, active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: {
        select: {
          vehicleEntries: {
            where: { status: VehicleStatus.CHECKED_IN },
          },
        },
      },
    },
  });

  const pickGroups = await prisma.judgeCategoryPick.groupBy({
    by: ["categoryId"],
    where: { eventId, judgeKey },
    _count: { _all: true },
  });
  const rankedCountByCategory = new Map(pickGroups.map((group) => [group.categoryId, group._count._all]));

  return categories.map((category) => ({
    category,
    eligibleVehicleCount: category._count.vehicleEntries,
    rankedCount: rankedCountByCategory.get(category.id) ?? 0,
    submitted: false,
  }));
}

async function loadBallot(categoryId: string, judgeKey: string) {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, eventId, active: true },
  });
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { judgesVotingEnabled: true, judgingOpen: true },
  });

  if (!category) return null;
  if (!event) return null;

  const picks = await prisma.judgeCategoryPick.findMany({
    where: {
      eventId,
      categoryId,
      judgeKey,
    },
    include: {
      vehicleEntry: {
        include: votingRegistrationInclude,
      },
    },
    orderBy: { rank: "asc" },
  });

  return {
    category,
    judgesVotingEnabled: event.judgesVotingEnabled,
    judgingOpen: event.judgesVotingEnabled && event.judgingOpen,
    submitted: false,
    picks: picks.map((pick) => ({
      rank: pick.rank,
      registration: pick.vehicleEntry,
    })),
  };
}

export async function registerJudgingRoutes(app: FastifyInstance) {
  app.get("/judging/session", async (request) => {
    const staff = await requireJudge(app, request);
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { judgesVotingEnabled: true, judgingOpen: true, resultsPublished: true },
    });

    if (!event) throw app.httpErrors.notFound("Event not found");

    return {
      staff: {
        id: staff.id,
        email: staff.email,
        displayName: staff.displayName,
        role: staff.role,
      },
      judgesVotingEnabled: event.judgesVotingEnabled,
      judgingOpen: event.judgesVotingEnabled && event.judgingOpen,
      resultsPublished: event.resultsPublished,
      categories: await loadCategorySummaries(judgeKeyForStaff(staff.id)),
    };
  });

  app.get("/judging/categories", async (request) => {
    const staff = await requireJudge(app, request);
    return { categories: await loadCategorySummaries(judgeKeyForStaff(staff.id)) };
  });

  app.get("/judging/categories/:categoryId/vehicles", async (request) => {
    await requireJudge(app, request);
    const params = z.object({ categoryId: z.string() }).parse(request.params);

    const registrations = await prisma.vehicleEntry.findMany({
      where: {
        eventId,
        categoryId: params.categoryId,
        status: VehicleStatus.CHECKED_IN,
      },
      include: votingRegistrationInclude,
      orderBy: { entryNumber: "asc" },
    });

    return { registrations };
  });

  app.get("/judging/categories/:categoryId/ballot", async (request) => {
    const staff = await requireJudge(app, request);
    const params = z.object({ categoryId: z.string() }).parse(request.params);
    const ballot = await loadBallot(params.categoryId, judgeKeyForStaff(staff.id));
    if (!ballot) throw app.httpErrors.notFound("Ballot category not found");
    return ballot;
  });

  app.put("/judging/categories/:categoryId/ballot", async (request) => {
    const staff = await requireJudge(app, request);
    const params = z.object({ categoryId: z.string() }).parse(request.params);
    const body = z.object({ picks: z.array(ballotPickSchema).max(10) }).parse(request.body);
    const rankSet = new Set(body.picks.map((pick) => pick.rank));
    const vehicleSet = new Set(body.picks.map((pick) => pick.vehicleEntryId));

    if (rankSet.size !== body.picks.length || vehicleSet.size !== body.picks.length) {
      throw app.httpErrors.badRequest("Ballot ranks and vehicles must be unique");
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { judgesVotingEnabled: true, judgingOpen: true },
    });

    if (!event) throw app.httpErrors.notFound("Event not found");
    if (!event.judgesVotingEnabled) throw app.httpErrors.forbidden("Judge voting is disabled");
    if (!event.judgingOpen) throw app.httpErrors.forbidden("Judging is closed");

    const vehicles = await prisma.vehicleEntry.findMany({
      where: {
        id: { in: body.picks.map((pick) => pick.vehicleEntryId) },
        eventId,
        categoryId: params.categoryId,
        status: VehicleStatus.CHECKED_IN,
      },
      select: { id: true },
    });

    if (vehicles.length !== body.picks.length) {
      throw app.httpErrors.badRequest("Ballot contains an ineligible vehicle");
    }

    await prisma.$transaction(async (tx) => {
      await tx.judgeCategoryPick.deleteMany({
        where: {
          eventId,
          categoryId: params.categoryId,
          judgeKey: judgeKeyForStaff(staff.id),
        },
      });

      if (body.picks.length) {
        await tx.judgeCategoryPick.createMany({
          data: body.picks.map((pick) => ({
            eventId,
            categoryId: params.categoryId,
            vehicleEntryId: pick.vehicleEntryId,
            rank: pick.rank,
            judgeKey: judgeKeyForStaff(staff.id),
            judgeName: staff.displayName,
          })),
        });
      }
    });

    return loadBallot(params.categoryId, judgeKeyForStaff(staff.id));
  });

  app.post("/judging/categories/:categoryId/submit", async () => {
    throw app.httpErrors.notImplemented("Submitted ballot locking requires the JudgeBallot migration");
  });
}
