import type { Category, Prisma, SpecialAward } from "@carshow/db";

export const votingRegistrationInclude = {
  owner: true,
  category: true,
  qrCard: true,
  photos: { orderBy: { sortOrder: "asc" as const } },
} satisfies Prisma.VehicleEntryInclude;

export type VotingRegistration = Prisma.VehicleEntryGetPayload<{
  include: typeof votingRegistrationInclude;
}>;

export type VoteGroup = {
  vehicleEntryId: string;
  _count: {
    _all: number;
  };
};

export type JudgePick = {
  categoryId: string;
  vehicleEntryId: string;
  rank: number;
  vehicleEntry: VotingRegistration;
};

export type WinnerOverride = {
  categoryId: string;
  vehicleEntryId: string;
  rank: number;
  reason: string | null;
  updatedAt: Date;
  vehicleEntry: VotingRegistration;
  adminStaffUser?: {
    displayName: string;
  } | null;
};

export type PeopleChoiceTallyItem = {
  registration: VotingRegistration;
  votes: number;
  rank: number;
  tieBreakPoints: number;
};

export type SpecialAwardVoteGroup = {
  specialAwardId: string;
  vehicleEntryId: string;
  _count: {
    _all: number;
  };
};

export type SpecialAwardTallyItem = {
  registration: VotingRegistration;
  votes: number;
  rank: number;
};

export type JudgeScoreItem = {
  registration: VotingRegistration;
  rank: number;
  judgePoints: number;
  peopleChoiceTieBreakPoints: number;
  rankCounts: number[];
  tieBreakSummary: string;
  manualOverride: boolean;
  overrideReason?: string | null;
  overrideBy?: string | null;
  overrideAt?: Date | null;
};

export function judgePointsForRank(rank: number) {
  return Math.max(0, 11 - rank);
}

export function compareJudgeScores(first: JudgeScoreItem, second: JudgeScoreItem) {
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

export function buildTieBreakSummary(item: JudgeScoreItem) {
  const firstPlaceCount = item.rankCounts[1] ?? 0;
  return `${item.judgePoints} judge points; ${firstPlaceCount} first-place ranking${
    firstPlaceCount === 1 ? "" : "s"
  }; ${item.peopleChoiceTieBreakPoints} People's Choice tie-break points.`;
}

export function buildVotingTallies({
  categories,
  voteGroups,
  votedVehicles,
  judgePicks,
  winnerOverrides,
}: {
  categories: Category[];
  voteGroups: VoteGroup[];
  votedVehicles: VotingRegistration[];
  judgePicks: JudgePick[];
  winnerOverrides: WinnerOverride[];
}) {
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

  const overridesByCategory = new Map<string, WinnerOverride[]>();
  for (const override of winnerOverrides) {
    const overrides = overridesByCategory.get(override.categoryId) ?? [];
    overrides.push(override);
    overridesByCategory.set(override.categoryId, overrides);
  }

  return categories.map((category) => {
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
  });
}

export function buildSpecialAwardTallies({
  specialAwards,
  voteGroups,
  votedVehicles,
}: {
  specialAwards: SpecialAward[];
  voteGroups: SpecialAwardVoteGroup[];
  votedVehicles: VotingRegistration[];
}) {
  const vehicleById = new Map(votedVehicles.map((vehicle) => [vehicle.id, vehicle]));
  const votesByAward = new Map<string, SpecialAwardTallyItem[]>();

  for (const vote of voteGroups) {
    const vehicle = vehicleById.get(vote.vehicleEntryId);
    if (!vehicle) continue;
    const awardVotes = votesByAward.get(vote.specialAwardId) ?? [];
    awardVotes.push({ registration: vehicle, votes: vote._count._all, rank: 0 });
    votesByAward.set(vote.specialAwardId, awardVotes);
  }

  for (const awardVotes of votesByAward.values()) {
    awardVotes.sort((first, second) => {
      if (second.votes !== first.votes) return second.votes - first.votes;
      return first.registration.entryNumber - second.registration.entryNumber;
    });
    awardVotes.forEach((item, index) => {
      item.rank = index + 1;
    });
  }

  return specialAwards.map((specialAward) => ({
    specialAward,
    results: (votesByAward.get(specialAward.id) ?? []).slice(0, 10),
  }));
}
