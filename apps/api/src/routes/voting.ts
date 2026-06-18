import { Prisma, VehicleStatus, prisma } from "@carshow/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin, requireStaff } from "../auth.js";
import { config, eventId } from "../config.js";
import {
  buildSpecialAwardTallies,
  buildVotingTallies,
  votingRegistrationInclude,
} from "../services/votingTally.js";
import { buildPublishedResultsSnapshot } from "../services/publishedResults.js";

const eventControlsSelect = {
  id: true,
  name: true,
  registrationOpen: true,
  votingOpen: true,
  publicPhotoUploadsOpen: true,
  judgesVotingEnabled: true,
  judgingOpen: true,
  resultsPublished: true,
  resultsPublishedAt: true,
  peopleChoiceCutoff: true,
};

type CeremonyPublishedPhoto = {
  id: string;
  url: string | null;
  mediumUrl: string | null;
  thumbUrl: string | null;
  altText: string | null;
  sortOrder: number;
  isPrimary?: boolean;
};

type CeremonyPublishedVehicle = {
  id: string;
  entryNumber: number;
  year: number;
  make: string;
  model: string;
  nickname: string | null;
  exteriorColor: string | null;
  buildStory: string | null;
  category: { id: string; name: string; slug: string };
  ownerName: string | null;
  primaryPhotoId?: string | null;
  photos: CeremonyPublishedPhoto[];
};

type CeremonyPublishedEntry = {
  rank: number;
  vehicle: CeremonyPublishedVehicle;
  votes?: number;
  judgePoints?: number;
};

type CeremonyPublishedSnapshot = {
  judgesVotingEnabled: boolean;
  categories?: Array<{
    category: { id: string; name: string; slug: string };
    official?: CeremonyPublishedEntry[];
    peopleChoice?: CeremonyPublishedEntry[];
  }>;
  specialAwards?: Array<{
    specialAward: { id: string; name: string; description: string | null };
    results?: CeremonyPublishedEntry[];
  }>;
};

export function publishedSnapshot(value: unknown): CeremonyPublishedSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as CeremonyPublishedSnapshot;
}

export function winnerSlidesFromSnapshot(snapshot: CeremonyPublishedSnapshot | null) {
  if (!snapshot) return [];
  return [
    ...(snapshot.categories ?? []).flatMap((category) => {
      const entry = (snapshot.judgesVotingEnabled ? category.official?.[0] : null) ?? category.peopleChoice?.[0];
      if (!entry) return [];
      return [{
        id: `category-${category.category.id}`,
        kind: "CATEGORY" as const,
        label: category.category.name,
        resultLabel: snapshot.judgesVotingEnabled ? "Category Winner" : "People's Choice Winner",
        rank: entry.rank,
        votes: entry.votes,
        judgePoints: entry.judgePoints,
        vehicle: entry.vehicle,
      }];
    }),
    ...(snapshot.specialAwards ?? []).flatMap((award) => {
      const entry = award.results?.[0];
      if (!entry) return [];
      return [{
        id: `special-award-${award.specialAward.id}`,
        kind: "SPECIAL_AWARD" as const,
        label: award.specialAward.name,
        resultLabel: "Special Award Winner",
        rank: entry.rank,
        votes: entry.votes,
        judgePoints: entry.judgePoints,
        vehicle: entry.vehicle,
      }];
    }),
  ];
}

const cutoffBurstWindowMs = 15 * 60 * 1000;
const rapidVoteWindowMs = 2 * 60 * 1000;
const sameIpFlagThreshold = 5;

type VoteActivity = {
  kind: "PEOPLE_CHOICE" | "SPECIAL_AWARD";
  id: string;
  voterKey: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  vehicleEntryId: string;
  createdAt: Date;
  category?: { id: string; name: string } | null;
  specialAward?: { id: string; name: string } | null;
};

type VoteReviewRecord = VoteActivity & {
  category?: { id: string; name: string } | null;
  specialAward?: { id: string; name: string } | null;
  excludedAt: Date | null;
  excludedReason: string | null;
  excludedByStaff?: { displayName: string } | null;
};

type VoteFlagDetail = {
  flag: string;
  detail: string;
  ballots?: string[];
};

function summarizeCount<T>(items: T[], keyFor: (item: T) => string | null) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyFor(item);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function rapidVoteKeys(votes: VoteActivity[]) {
  const byKey = new Map<string, VoteActivity[]>();
  for (const vote of votes) {
    if (!vote.voterKey) continue;
    const list = byKey.get(vote.voterKey) ?? [];
    list.push(vote);
    byKey.set(vote.voterKey, list);
  }

  const flagged = new Set<string>();
  for (const [key, list] of byKey.entries()) {
    const sorted = [...list].sort((first, second) => first.createdAt.getTime() - second.createdAt.getTime());
    for (let index = 1; index < sorted.length; index += 1) {
      if (sorted[index].createdAt.getTime() - sorted[index - 1].createdAt.getTime() <= rapidVoteWindowMs) {
        flagged.add(key);
        break;
      }
    }
  }
  return flagged;
}

function publicVoterKey(voterKey: string | null) {
  if (!voterKey) return "Unknown voter";
  if (voterKey.length <= 10) return voterKey;
  return `${voterKey.slice(0, 4)}...${voterKey.slice(-4)}`;
}

function buildVoteReviewRows({
  votes,
  allVotes,
  cutoff,
  trustedIps,
}: {
  votes: VoteReviewRecord[];
  allVotes: VoteActivity[];
  cutoff: Date | null;
  trustedIps: Set<string>;
}) {
  const voterKeyCounts = summarizeCount(allVotes, (vote) => vote.voterKey);
  const voterKeyVehicleIds = new Map<string, Set<string>>();
  const voterKeyBallots = new Map<string, string[]>();
  const ipCounts = summarizeCount(allVotes, (vote) => vote.ipAddress);
  const ipVoterKeys = new Map<string, Set<string>>();
  for (const vote of allVotes) {
    if (vote.voterKey) {
      const vehicles = voterKeyVehicleIds.get(vote.voterKey) ?? new Set<string>();
      vehicles.add(vote.vehicleEntryId);
      voterKeyVehicleIds.set(vote.voterKey, vehicles);
      const ballots = voterKeyBallots.get(vote.voterKey) ?? [];
      const label = vote.kind === "PEOPLE_CHOICE"
        ? `PC: ${vote.category?.name ?? "Category"}`
        : `SA: ${vote.specialAward?.name ?? "Award"}`;
      if (!ballots.includes(label)) ballots.push(label);
      voterKeyBallots.set(vote.voterKey, ballots);
    }
    if (!vote.ipAddress || trustedIps.has(vote.ipAddress) || !vote.voterKey) continue;
    const set = ipVoterKeys.get(vote.ipAddress) ?? new Set<string>();
    set.add(vote.voterKey);
    ipVoterKeys.set(vote.ipAddress, set);
  }
  const rapidKeys = rapidVoteKeys(allVotes);

  return votes.map((vote) => {
    const flags: string[] = [];
    const flagDetails: VoteFlagDetail[] = [];
    if (!vote.ipAddress || !vote.userAgent) flags.push("Metadata unavailable");
    if (vote.ipAddress && trustedIps.has(vote.ipAddress)) flags.push("Church Wi-Fi IP");
    if (cutoff && vote.createdAt <= cutoff && cutoff.getTime() - vote.createdAt.getTime() <= cutoffBurstWindowMs) {
      flags.push("Close to cutoff");
    }
    if (
      vote.voterKey &&
      (voterKeyCounts.get(vote.voterKey) ?? 0) > 1 &&
      (voterKeyVehicleIds.get(vote.voterKey)?.size ?? 0) === 1
    ) {
      flags.push("Single-vehicle voter");
      flagDetails.push({
        flag: "Single-vehicle voter",
        detail: "This voter key has multiple ballot records and every one selected this same vehicle.",
        ballots: voterKeyBallots.get(vote.voterKey) ?? [],
      });
    }
    if (vote.voterKey && rapidKeys.has(vote.voterKey)) flags.push("Rapid voter activity");
    if (vote.ipAddress && !trustedIps.has(vote.ipAddress) && (ipCounts.get(vote.ipAddress) ?? 0) >= sameIpFlagThreshold) {
      flags.push("Many votes from same IP");
    }
    if (vote.ipAddress && (ipVoterKeys.get(vote.ipAddress)?.size ?? 0) >= sameIpFlagThreshold) {
      flags.push("Many voter keys from same IP");
    }

    return {
      id: vote.id,
      kind: vote.kind,
      label: vote.kind === "PEOPLE_CHOICE"
        ? vote.category?.name ?? "People's Choice"
        : vote.specialAward?.name ?? "Special Award",
      voterKey: publicVoterKey(vote.voterKey),
      ipAddress: vote.ipAddress,
      userAgent: vote.userAgent,
      trustedIp: Boolean(vote.ipAddress && trustedIps.has(vote.ipAddress)),
      createdAt: vote.createdAt,
      excludedAt: vote.excludedAt,
      excludedReason: vote.excludedReason,
      excludedBy: vote.excludedByStaff?.displayName ?? null,
      flags,
      flagDetails,
    };
  });
}

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
        publicPhotoUploadsOpen: true,
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

  app.get("/voting/ceremony", async (request) => {
    await requireAdmin(app, request);

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        peopleChoiceCutoff: true,
        resultsPublished: true,
        resultsPublishedAt: true,
        resultsSnapshot: true,
      },
    });

    if (!event) throw app.httpErrors.notFound("Event not found");

    const photos = await prisma.vehiclePhoto.findMany({
      where: {
        moderationStatus: "APPROVED",
        vehicleEntry: {
          eventId,
          status: VehicleStatus.CHECKED_IN,
        },
      },
      include: {
        vehicleEntry: {
          include: {
            owner: true,
            category: true,
          },
        },
      },
      orderBy: [{ createdAt: "asc" }],
    });

    const photoSlides = photos
      .sort((first, second) => {
        if (first.vehicleEntry.entryNumber !== second.vehicleEntry.entryNumber) {
          return first.vehicleEntry.entryNumber - second.vehicleEntry.entryNumber;
        }
        if (first.sortOrder !== second.sortOrder) return first.sortOrder - second.sortOrder;
        return first.createdAt.getTime() - second.createdAt.getTime();
      })
      .flatMap((photo) => {
        const url = photo.webUrl ?? photo.url ?? photo.mediumUrl ?? photo.thumbUrl;
        if (!url) return [];
        const vehicle = photo.vehicleEntry;
        return [{
          id: photo.id,
          url,
          mediumUrl: photo.mediumUrl,
          thumbUrl: photo.thumbUrl,
          altText: photo.altText,
          vehicle: {
            id: vehicle.id,
            entryNumber: vehicle.entryNumber,
            year: vehicle.year,
            make: vehicle.make,
            model: vehicle.model,
            ownerName: vehicle.owner.publicNameOptIn
              ? vehicle.owner.publicName || `${vehicle.owner.firstName} ${vehicle.owner.lastName}`
              : null,
            category: {
              id: vehicle.category.id,
              name: vehicle.category.name,
              slug: vehicle.category.slug,
            },
          },
        }];
      });

    const resultsPublished = event.resultsPublished && event.resultsSnapshot !== null;
    return {
      event: {
        peopleChoiceCutoff: event.peopleChoiceCutoff,
        resultsPublished,
        resultsPublishedAt: resultsPublished ? event.resultsPublishedAt : null,
      },
      photoSlides,
      winnerSlides: resultsPublished
        ? winnerSlidesFromSnapshot(publishedSnapshot(event.resultsSnapshot))
        : [],
    };
  });

  app.patch("/voting/settings", async (request) => {
    await requireAdmin(app, request);
    const body = z
      .object({
        votingOpen: z.boolean().optional(),
        registrationOpen: z.boolean().optional(),
        publicPhotoUploadsOpen: z.boolean().optional(),
        judgesVotingEnabled: z.boolean().optional(),
        judgingOpen: z.boolean().optional(),
        peopleChoiceCutoff: z.string().datetime().nullable().optional(),
      })
      .parse(request.body);

    const event = await prisma.event.update({
      where: { id: eventId },
      data: {
        registrationOpen: body.registrationOpen,
        votingOpen: body.votingOpen,
        publicPhotoUploadsOpen: body.publicPhotoUploadsOpen,
        judgesVotingEnabled: body.judgesVotingEnabled,
        judgingOpen: body.judgesVotingEnabled === false ? false : body.judgingOpen,
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

  app.post("/voting/results/publish", async (request) => {
    const staff = await requireAdmin(app, request);
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        peopleChoiceCutoff: true,
        judgesVotingEnabled: true,
        judgingOpen: true,
      },
    });

    if (!event) throw app.httpErrors.notFound("Event not found");
    if (!event.peopleChoiceCutoff || new Date() < event.peopleChoiceCutoff) {
      throw app.httpErrors.conflict("Results cannot be published until the People's Choice cutoff has passed");
    }
    if (event.judgesVotingEnabled && event.judgingOpen) {
      throw app.httpErrors.conflict("Close judging before publishing results");
    }

    const snapshot = await buildPublishedResultsSnapshot(staff.displayName);
    const updated = await prisma.event.update({
      where: { id: eventId },
      data: {
        votingOpen: false,
        resultsPublished: true,
        resultsPublishedAt: new Date(snapshot.publishedAt),
        resultsPublishedById: staff.id,
        resultsSnapshot: snapshot,
      },
      select: eventControlsSelect,
    });

    return { event: updated, results: snapshot };
  });

  app.post("/voting/results/unpublish", async (request) => {
    await requireAdmin(app, request);
    const updated = await prisma.event.update({
      where: { id: eventId },
      data: {
        resultsPublished: false,
        resultsPublishedAt: null,
        resultsPublishedById: null,
        resultsSnapshot: Prisma.DbNull,
      },
      select: eventControlsSelect,
    });
    return { event: updated };
  });

  app.get("/voting/tallies", async (request) => {
    await requireStaff(app, request);
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        votingOpen: true,
        publicPhotoUploadsOpen: true,
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
          excludedAt: null,
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
          excludedAt: null,
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

  app.get("/voting/vehicles/:vehicleEntryId/vote-review", async (request) => {
    await requireStaff(app, request);
    const params = z.object({ vehicleEntryId: z.string().trim().min(1) }).parse(request.params);
    const query = z
      .object({
        categoryId: z.string().trim().min(1).optional(),
        specialAwardId: z.string().trim().min(1).optional(),
        filter: z.enum(["all", "flagged", "excluded"]).default("all"),
        page: z.coerce.number().int().min(0).default(0),
        pageSize: z.coerce.number().int().min(10).max(100).default(25),
      })
      .parse(request.query);

    const [event, vehicle] = await Promise.all([
      prisma.event.findUnique({ where: { id: eventId }, select: { peopleChoiceCutoff: true, resultsPublished: true } }),
      prisma.vehicleEntry.findFirst({
        where: { id: params.vehicleEntryId, eventId },
        select: { id: true, categoryId: true },
      }),
    ]);
    if (!event) throw app.httpErrors.notFound("Event not found");
    if (!vehicle) throw app.httpErrors.notFound("Vehicle not found");

    const [peopleChoiceVotes, specialAwardVotes, allPeopleChoiceVotes, allSpecialAwardVotes] = await Promise.all([
      query.specialAwardId
        ? Promise.resolve([])
        : prisma.peopleChoiceVote.findMany({
            where: {
              eventId,
              vehicleEntryId: vehicle.id,
              categoryId: query.categoryId ?? vehicle.categoryId,
              createdAt: event.peopleChoiceCutoff ? { lte: event.peopleChoiceCutoff } : undefined,
            },
            include: {
              category: { select: { id: true, name: true } },
              excludedByStaff: { select: { displayName: true } },
            },
            orderBy: { createdAt: "asc" },
          }),
      query.specialAwardId
        ? prisma.specialAwardVote.findMany({
            where: {
              eventId,
              vehicleEntryId: vehicle.id,
              specialAwardId: query.specialAwardId,
              createdAt: event.peopleChoiceCutoff ? { lte: event.peopleChoiceCutoff } : undefined,
            },
            include: {
              specialAward: { select: { id: true, name: true } },
              excludedByStaff: { select: { displayName: true } },
            },
            orderBy: { createdAt: "asc" },
          })
        : Promise.resolve([]),
      prisma.peopleChoiceVote.findMany({
        where: {
          eventId,
          createdAt: event.peopleChoiceCutoff ? { lte: event.peopleChoiceCutoff } : undefined,
        },
        include: { category: { select: { id: true, name: true } } },
      }),
      prisma.specialAwardVote.findMany({
        where: {
          eventId,
          createdAt: event.peopleChoiceCutoff ? { lte: event.peopleChoiceCutoff } : undefined,
        },
        include: { specialAward: { select: { id: true, name: true } } },
      }),
    ]);

    const selectedVotes: VoteReviewRecord[] = [
      ...peopleChoiceVotes.map((vote) => ({ ...vote, kind: "PEOPLE_CHOICE" as const })),
      ...specialAwardVotes.map((vote) => ({ ...vote, kind: "SPECIAL_AWARD" as const })),
    ].sort((first, second) => first.createdAt.getTime() - second.createdAt.getTime());

    const allVotes: VoteActivity[] = [
      ...allPeopleChoiceVotes.map((vote) => ({ ...vote, kind: "PEOPLE_CHOICE" as const })),
      ...allSpecialAwardVotes.map((vote) => ({ ...vote, kind: "SPECIAL_AWARD" as const })),
    ];

    const trustedIps = new Set(config.voting.trustedIps);
    const rows = buildVoteReviewRows({
      votes: selectedVotes,
      allVotes,
      cutoff: event.peopleChoiceCutoff,
      trustedIps,
    });
    const includedCount = rows.filter((vote) => !vote.excludedAt).length;
    const excludedCount = rows.length - includedCount;
    const flaggedCount = rows.filter((vote) => vote.flags.some((flag) => flag !== "Church Wi-Fi IP")).length;
    const filteredRows = rows.filter((vote) => {
      if (query.filter === "flagged") return vote.flags.some((flag) => flag !== "Church Wi-Fi IP");
      if (query.filter === "excluded") return Boolean(vote.excludedAt);
      return true;
    });
    const pageCount = Math.max(1, Math.ceil(filteredRows.length / query.pageSize));
    const page = Math.min(query.page, pageCount - 1);
    const start = page * query.pageSize;

    return {
      vehicleEntryId: vehicle.id,
      context: {
        categoryId: query.categoryId ?? vehicle.categoryId,
        specialAwardId: query.specialAwardId ?? null,
      },
      resultsPublished: event.resultsPublished,
      summary: {
        total: rows.length,
        included: includedCount,
        excluded: excludedCount,
        flagged: flaggedCount,
      },
      pagination: {
        page,
        pageSize: query.pageSize,
        total: filteredRows.length,
        pageCount,
      },
      votes: filteredRows.slice(start, start + query.pageSize),
    };
  });

  app.patch("/voting/votes/:kind/:id", async (request) => {
    const staff = await requireAdmin(app, request);
    const params = z
      .object({
        kind: z.enum(["people-choice", "special-award"]),
        id: z.string().trim().min(1),
      })
      .parse(request.params);
    const body = z
      .object({
        excluded: z.boolean(),
        reason: z.string().trim().max(300).optional(),
      })
      .parse(request.body);

    const data = body.excluded
      ? {
          excludedAt: new Date(),
          excludedReason: body.reason || "Admin review exclusion",
          excludedByStaffId: staff.id,
        }
      : {
          excludedAt: null,
          excludedReason: null,
          excludedByStaffId: null,
        };

    const result = params.kind === "people-choice"
      ? await prisma.peopleChoiceVote.updateMany({ where: { id: params.id, eventId }, data })
      : await prisma.specialAwardVote.updateMany({ where: { id: params.id, eventId }, data });

    if (result.count === 0) throw app.httpErrors.notFound("Vote not found");

    return { ok: true };
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
