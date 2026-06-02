import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Category } from "@carshow/db";
import {
  buildVotingTallies,
  compareJudgeScores,
  judgePointsForRank,
  type JudgeScoreItem,
  type VotingRegistration,
} from "./votingTally.js";

const category = {
  id: "cat-muscle",
  eventId: "event",
  name: "Muscle",
  slug: "muscle",
  active: true,
  sortOrder: 1,
  createdAt: new Date("2026-05-01T00:00:00.000Z"),
  updatedAt: new Date("2026-05-01T00:00:00.000Z"),
} satisfies Category;

function registration(id: string, entryNumber: number): VotingRegistration {
  return {
    id,
    eventId: "event",
    ownerId: `owner-${id}`,
    categoryId: category.id,
    registeredByStaffId: null,
    entryNumber,
    ownerAccessCode: entryNumber.toString().padStart(5, "0"),
    year: 1969,
    make: "Chevrolet",
    model: "Camaro",
    nickname: null,
    plateNumber: null,
    exteriorColor: null,
    internalNotes: null,
    buildStory: null,
    status: "REGISTERED",
    source: "ONSITE",
    checkedInAt: null,
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    owner: {
      id: `owner-${id}`,
      firstName: "Owner",
      lastName: id,
      phone: "555-555-5555",
      email: null,
      publicName: null,
      publicNameOptIn: false,
      waiverAccepted: true,
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
      updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    },
    category,
    qrCard: null,
    photos: [],
  };
}

function score(overrides: Partial<JudgeScoreItem>): JudgeScoreItem {
  return {
    registration: registration("entry", 1),
    rank: 0,
    judgePoints: 0,
    peopleChoiceTieBreakPoints: 0,
    rankCounts: Array.from({ length: 11 }, () => 0),
    tieBreakSummary: "",
    manualOverride: false,
    ...overrides,
  };
}

describe("voting tally scoring", () => {
  it("awards 10 points for first place down to 1 point for tenth place", () => {
    assert.equal(judgePointsForRank(1), 10);
    assert.equal(judgePointsForRank(5), 6);
    assert.equal(judgePointsForRank(10), 1);
    assert.equal(judgePointsForRank(11), 0);
  });

  it("sorts ties by first-place counts before People's Choice tie-break points", () => {
    const firstPlaceHeavy = score({
      registration: registration("first-place-heavy", 5),
      judgePoints: 20,
      peopleChoiceTieBreakPoints: 1,
      rankCounts: [0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    });
    const peopleChoiceHeavy = score({
      registration: registration("people-choice-heavy", 6),
      judgePoints: 20,
      peopleChoiceTieBreakPoints: 10,
      rankCounts: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    });

    assert.equal(compareJudgeScores(firstPlaceHeavy, peopleChoiceHeavy), -1);
  });

  it("uses People's Choice top-10 points when judge points and first-place counts are tied", () => {
    const voted = registration("voted", 1);
    const unvoted = registration("unvoted", 2);

    const [tally] = buildVotingTallies({
      categories: [category],
      votedVehicles: [voted],
      voteGroups: [{ vehicleEntryId: voted.id, _count: { _all: 25 } }],
      judgePicks: [
        { categoryId: category.id, vehicleEntryId: voted.id, rank: 2, vehicleEntry: voted },
        { categoryId: category.id, vehicleEntryId: unvoted.id, rank: 2, vehicleEntry: unvoted },
      ],
      winnerOverrides: [],
    });

    assert.equal(tally.judgeRanking[0]?.registration.id, voted.id);
    assert.equal(tally.judgeRanking[0]?.peopleChoiceTieBreakPoints, 10);
    assert.equal(tally.peopleChoice.length, 1);
  });

  it("limits People's Choice display to the top five", () => {
    const vehicles = Array.from({ length: 6 }, (_, index) => registration(`vehicle-${index + 1}`, index + 1));

    const [tally] = buildVotingTallies({
      categories: [category],
      votedVehicles: vehicles,
      voteGroups: vehicles.map((vehicle, index) => ({
        vehicleEntryId: vehicle.id,
        _count: { _all: 20 - index },
      })),
      judgePicks: [],
      winnerOverrides: [],
    });

    assert.equal(tally.peopleChoice.length, 5);
    assert.deepEqual(
      tally.peopleChoice.map((item) => item.rank),
      [1, 2, 3, 4, 5],
    );
  });

  it("uses admin overrides for judge top 3 while preserving score details when present", () => {
    const first = registration("first", 1);
    const second = registration("second", 2);
    const third = registration("third", 3);

    const [tally] = buildVotingTallies({
      categories: [category],
      votedVehicles: [],
      voteGroups: [],
      judgePicks: [
        { categoryId: category.id, vehicleEntryId: first.id, rank: 1, vehicleEntry: first },
        { categoryId: category.id, vehicleEntryId: second.id, rank: 2, vehicleEntry: second },
        { categoryId: category.id, vehicleEntryId: third.id, rank: 3, vehicleEntry: third },
      ],
      winnerOverrides: [
        {
          categoryId: category.id,
          vehicleEntryId: third.id,
          rank: 1,
          reason: "Tie-break review",
          updatedAt: new Date("2026-05-31T00:00:00.000Z"),
          vehicleEntry: third,
          adminStaffUser: { displayName: "Admin User" },
        },
        {
          categoryId: category.id,
          vehicleEntryId: first.id,
          rank: 2,
          reason: "Tie-break review",
          updatedAt: new Date("2026-05-31T00:00:00.000Z"),
          vehicleEntry: first,
          adminStaffUser: { displayName: "Admin User" },
        },
        {
          categoryId: category.id,
          vehicleEntryId: second.id,
          rank: 3,
          reason: "Tie-break review",
          updatedAt: new Date("2026-05-31T00:00:00.000Z"),
          vehicleEntry: second,
          adminStaffUser: { displayName: "Admin User" },
        },
      ],
    });

    assert.deepEqual(
      tally.judgeTop3.map((item) => item.registration.id),
      [third.id, first.id, second.id],
    );
    assert.equal(tally.judgeTop3[0]?.manualOverride, true);
    assert.equal(tally.judgeTop3[0]?.overrideBy, "Admin User");
    assert.equal(tally.judgeTop3[1]?.judgePoints, 10);
  });
});
