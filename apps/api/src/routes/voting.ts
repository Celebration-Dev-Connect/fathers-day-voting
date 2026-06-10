import { VehicleStatus, prisma } from "@carshow/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin, requireStaff } from "../auth.js";
import { eventId } from "../config.js";
import {
  buildSpecialAwardTallies,
  buildVotingTallies,
  votingRegistrationInclude,
} from "../services/votingTally.js";

const eventControlsSelect = {
  id: true,
  name: true,
  registrationOpen: true,
  votingOpen: true,
  judgesVotingEnabled: true,
  judgingOpen: true,
  resultsPublished: true,
  peopleChoiceCutoff: true,
};

export async function registerVotingRoutes(app: FastifyInstance) {
  app.post("/voting/initialize-event", async (request) => {
    await requireAdmin(app, request);
    const event = await prisma.event.upsert({
      where: { id: eventId },
      update: {},
      create: {
        id: eventId,
        name: "Father's Day Car Show / Show & Shine",
        eventDate: new Date("2026-06-21T16:00:00.000Z"),
        venueName: "Celebration Church",
        venueAddress: "7215 Argyll Road, Edmonton, AB",
        registrationOpen: true,
        peopleChoiceCutoff: new Date("2026-06-21T21:00:00.000Z"),
      },
      select: eventControlsSelect,
    });
    return { event };
  });

  app.get("/voting/settings", async (request) => {
    await requireStaff(app, request);
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: eventControlsSelect,
    });

    if (!event) throw app.httpErrors.notFound("Event not found");
    return { event };
  });

  app.patch("/voting/settings", async (request) => {
    await requireAdmin(app, request);
    const body = z
      .object({
        votingOpen: z.boolean().optional(),
        registrationOpen: z.boolean().optional(),
        judgesVotingEnabled: z.boolean().optional(),
        judgingOpen: z.boolean().optional(),
        resultsPublished: z.boolean().optional(),
        peopleChoiceCutoff: z.string().datetime().nullable().optional(),
      })
      .parse(request.body);

    const event = await prisma.event.update({
      where: { id: eventId },
      data: {
        registrationOpen: body.registrationOpen,
        votingOpen: body.votingOpen,
        judgesVotingEnabled: body.judgesVotingEnabled,
        judgingOpen: body.judgesVotingEnabled === false ? false : body.judgingOpen,
        resultsPublished: body.resultsPublished,
        peopleChoiceCutoff:
          body.peopleChoiceCutoff === undefined
            ? undefined
            : body.peopleChoiceCutoff
              ? new Date(body.peopleChoiceCutoff)
              : null,
      },
      select: eventControlsSelect,
    });

    return { event };
  });

  app.get("/voting/tallies", async (request) => {
    await requireStaff(app, request);
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        votingOpen: true,
        registrationOpen: true,
        judgesVotingEnabled: true,
        judgingOpen: true,
        resultsPublished: true,
        peopleChoiceCutoff: true,
      },
    });

    if (!event) throw app.httpErrors.notFound("Event not found");

    const [
      categories,
      voteGroups,
      judgePicks,
      winnerOverrides,
      specialAwards,
      specialAwardVoteGroups,
    ] = await Promise.all([
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
      prisma.specialAward.findMany({
        where: { eventId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      prisma.specialAwardVote.groupBy({
        by: ["specialAwardId", "vehicleEntryId"],
        where: {
          eventId,
          createdAt: event.peopleChoiceCutoff ? { lte: event.peopleChoiceCutoff } : undefined,
        },
        _count: { _all: true },
      }),
    ]);

    const votedVehicleIds = voteGroups.map((vote) => vote.vehicleEntryId);
    const specialAwardVotedVehicleIds = specialAwardVoteGroups.map((vote) => vote.vehicleEntryId);
    const allVotedVehicleIds = [...new Set([...votedVehicleIds, ...specialAwardVotedVehicleIds])];
    const votedVehicles = allVotedVehicleIds.length
      ? await prisma.vehicleEntry.findMany({
          where: { id: { in: allVotedVehicleIds }, eventId },
          include: votingRegistrationInclude,
        })
      : [];

    return {
      event,
      categories: buildVotingTallies({
        categories,
        voteGroups,
        votedVehicles,
        judgePicks: event.judgesVotingEnabled ? judgePicks : [],
        winnerOverrides: event.judgesVotingEnabled ? winnerOverrides : [],
      }),
      specialAwards: buildSpecialAwardTallies({
        specialAwards,
        voteGroups: specialAwardVoteGroups,
        votedVehicles,
      }),
    };
  });

  app.get("/voting/judge-completion", async (request) => {
    await requireStaff(app, request);

    const [categories, picks] = await Promise.all([
      prisma.category.findMany({
        where: { eventId },
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
      }),
      prisma.judgeCategoryPick.findMany({
        where: { eventId, rank: { gte: 1, lte: 10 } },
        select: {
          categoryId: true,
          judgeKey: true,
          judgeName: true,
          updatedAt: true,
        },
        orderBy: [{ categoryId: "asc" }, { judgeKey: "asc" }],
      }),
    ]);

    const judgesByCategory = new Map<
      string,
      Map<string, { judgeKey: string; judgeName: string; rankedCount: number; updatedAt: Date | null }>
    >();

    for (const pick of picks) {
      const categoryJudges = judgesByCategory.get(pick.categoryId) ?? new Map();
      const judge = categoryJudges.get(pick.judgeKey) ?? {
        judgeKey: pick.judgeKey,
        judgeName: pick.judgeName ?? "Judge",
        rankedCount: 0,
        updatedAt: null,
      };

      judge.rankedCount += 1;
      judge.updatedAt = !judge.updatedAt || pick.updatedAt > judge.updatedAt ? pick.updatedAt : judge.updatedAt;
      categoryJudges.set(pick.judgeKey, judge);
      judgesByCategory.set(pick.categoryId, categoryJudges);
    }

    return {
      categories: categories.map((category) => {
        const judges = Array.from(judgesByCategory.get(category.id)?.values() ?? [])
          .map((judge) => ({
            ...judge,
            complete: judge.rankedCount >= 10,
          }))
          .sort((first, second) => first.judgeName.localeCompare(second.judgeName));

        return {
          category,
          eligibleVehicleCount: category._count.vehicleEntries,
          judgeCount: judges.length,
          completeJudgeCount: judges.filter((judge) => judge.complete).length,
          totalPicks: judges.reduce((total, judge) => total + judge.rankedCount, 0),
          judges,
        };
      }),
    };
  });

  app.put("/voting/categories/:categoryId/winners", async (request) => {
    const staff = await requireAdmin(app, request);
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
}
