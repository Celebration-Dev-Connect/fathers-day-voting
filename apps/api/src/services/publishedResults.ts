import { Prisma, prisma } from "@carshow/db";
import { eventId } from "../config.js";
import {
  buildSpecialAwardTallies,
  buildVotingTallies,
  votingRegistrationInclude,
  type VotingRegistration,
} from "./votingTally.js";

function toPublicVehicle(vehicle: VotingRegistration) {
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
    exteriorColor: vehicle.exteriorColor ?? null,
    buildStory: vehicle.buildStory ?? null,
    category: {
      id: vehicle.category.id,
      name: vehicle.category.name,
      slug: vehicle.category.slug,
    },
    ownerName: vehicle.owner.publicNameOptIn
      ? vehicle.owner.publicName || `${vehicle.owner.firstName} ${vehicle.owner.lastName}`
      : null,
    primaryPhotoId: vehicle.primaryPhotoId ?? null,
    photos: photos.map((photo) => ({
      id: photo.id,
      url: photo.webUrl ?? photo.url ?? null,
      mediumUrl: photo.mediumUrl ?? null,
      thumbUrl: photo.thumbUrl ?? null,
      altText: photo.altText ?? null,
      sortOrder: photo.sortOrder,
      isPrimary: photo.id === vehicle.primaryPhotoId,
    })),
  };
}

export async function buildPublishedResultsSnapshot(publishedByName: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { peopleChoiceCutoff: true, judgesVotingEnabled: true },
  });
  if (!event) throw new Error("Event not found");

  const [categories, voteGroups, judgePicks, winnerOverrides, specialAwards, specialAwardVoteGroups] =
    await Promise.all([
      prisma.category.findMany({
        where: { eventId, active: true },
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
        where: { eventId, active: true },
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

  const votedVehicleIds = [
    ...new Set([
      ...voteGroups.map((vote) => vote.vehicleEntryId),
      ...specialAwardVoteGroups.map((vote) => vote.vehicleEntryId),
    ]),
  ];
  const votedVehicles = votedVehicleIds.length
    ? await prisma.vehicleEntry.findMany({
        where: { id: { in: votedVehicleIds }, eventId },
        include: votingRegistrationInclude,
      })
    : [];

  const categoryTallies = buildVotingTallies({
    categories,
    voteGroups,
    votedVehicles,
    judgePicks: event.judgesVotingEnabled ? judgePicks : [],
    winnerOverrides: event.judgesVotingEnabled ? winnerOverrides : [],
  });
  const specialAwardTallies = buildSpecialAwardTallies({
    specialAwards,
    voteGroups: specialAwardVoteGroups,
    votedVehicles,
  });

  const publishedAt = new Date().toISOString();
  return {
    publishedAt,
    publishedByName,
    judgesVotingEnabled: event.judgesVotingEnabled,
    categories: categoryTallies.map((tally) => {
      const officialCandidates = [...tally.judgeTop3, ...tally.judgeRanking];
      const seen = new Set<string>();
      const official = officialCandidates
        .filter((item) => {
          if (seen.has(item.registration.id)) return false;
          seen.add(item.registration.id);
          return true;
        })
        .slice(0, 5)
        .map((item, index) => ({
          rank: index + 1,
          vehicle: toPublicVehicle(item.registration),
          judgePoints: item.judgePoints,
        }));

      return {
        category: { id: tally.category.id, name: tally.category.name, slug: tally.category.slug },
        official: event.judgesVotingEnabled ? official : [],
        peopleChoice: tally.peopleChoice.slice(0, 5).map((item) => ({
          rank: item.rank,
          vehicle: toPublicVehicle(item.registration),
          votes: item.votes,
        })),
      };
    }),
    specialAwards: specialAwardTallies.map((tally) => ({
      specialAward: {
        id: tally.specialAward.id,
        name: tally.specialAward.name,
        description: tally.specialAward.description ?? null,
      },
      results: tally.results.slice(0, 5).map((item) => ({
        rank: item.rank,
        vehicle: toPublicVehicle(item.registration),
        votes: item.votes,
      })),
    })),
  } satisfies Prisma.JsonObject;
}

export function placementsForVehicle(snapshot: Prisma.JsonValue | null, vehicleId: string) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return [];
  const value = snapshot as {
    categories?: Array<{
      category: { name: string };
      official: Array<{ rank: number; vehicle: { id: string } }>;
      peopleChoice: Array<{ rank: number; vehicle: { id: string } }>;
    }>;
    specialAwards?: Array<{
      specialAward: { name: string };
      results: Array<{ rank: number; vehicle: { id: string } }>;
    }>;
  };

  return [
    ...(value.categories ?? []).flatMap((category) => [
      ...category.official
        .filter((entry) => entry.vehicle.id === vehicleId)
        .map((entry) => ({ kind: "OFFICIAL" as const, label: category.category.name, rank: entry.rank })),
      ...category.peopleChoice
        .filter((entry) => entry.vehicle.id === vehicleId)
        .map((entry) => ({ kind: "PEOPLE_CHOICE" as const, label: category.category.name, rank: entry.rank })),
    ]),
    ...(value.specialAwards ?? []).flatMap((award) =>
      award.results
        .filter((entry) => entry.vehicle.id === vehicleId)
        .map((entry) => ({ kind: "SPECIAL_AWARD" as const, label: award.specialAward.name, rank: entry.rank })),
    ),
  ];
}
