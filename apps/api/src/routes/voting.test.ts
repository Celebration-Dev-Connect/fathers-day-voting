import assert from "node:assert/strict";
import test from "node:test";
import { publishedSnapshot, winnerSlidesFromSnapshot } from "./voting.js";

const vehicleOne = {
  id: "vehicle-1",
  entryNumber: 101,
  year: 1967,
  make: "Chevrolet",
  model: "Camaro",
  nickname: null,
  exteriorColor: null,
  buildStory: null,
  category: { id: "category-1", name: "Classic Car", slug: "classic-car" },
  ownerName: "Alex Owner",
  primaryPhotoId: "photo-1",
  photos: [
    {
      id: "photo-1",
      url: "https://example.com/photo-1.jpg",
      mediumUrl: null,
      thumbUrl: null,
      altText: null,
      sortOrder: 0,
      isPrimary: true,
    },
  ],
};

const vehicleTwo = {
  ...vehicleOne,
  id: "vehicle-2",
  entryNumber: 102,
  model: "Chevelle",
};

test("publishedSnapshot rejects missing or non-object snapshots", () => {
  assert.equal(publishedSnapshot(null), null);
  assert.equal(publishedSnapshot([]), null);
  assert.equal(publishedSnapshot("not-json"), null);
});

test("winnerSlidesFromSnapshot uses official category winners when judging is enabled", () => {
  const slides = winnerSlidesFromSnapshot({
    judgesVotingEnabled: true,
    categories: [
      {
        category: { id: "category-1", name: "Classic Car", slug: "classic-car" },
        official: [{ rank: 1, vehicle: vehicleOne, judgePoints: 42 }],
        peopleChoice: [{ rank: 1, vehicle: vehicleTwo, votes: 20 }],
      },
    ],
    specialAwards: [
      {
        specialAward: { id: "award-1", name: "Best Paint", description: null },
        results: [{ rank: 1, vehicle: vehicleTwo, votes: 7 }],
      },
    ],
  });

  assert.deepEqual(
    slides.map((slide) => ({
      id: slide.id,
      kind: slide.kind,
      label: slide.label,
      resultLabel: slide.resultLabel,
      vehicleId: slide.vehicle.id,
    })),
    [
      {
        id: "category-category-1",
        kind: "CATEGORY",
        label: "Classic Car",
        resultLabel: "Category Winner",
        vehicleId: "vehicle-1",
      },
      {
        id: "special-award-award-1",
        kind: "SPECIAL_AWARD",
        label: "Best Paint",
        resultLabel: "Special Award Winner",
        vehicleId: "vehicle-2",
      },
    ],
  );
});

test("winnerSlidesFromSnapshot uses people's choice category winners when judging is disabled", () => {
  const slides = winnerSlidesFromSnapshot({
    judgesVotingEnabled: false,
    categories: [
      {
        category: { id: "category-1", name: "Classic Car", slug: "classic-car" },
        official: [{ rank: 1, vehicle: vehicleOne, judgePoints: 42 }],
        peopleChoice: [{ rank: 1, vehicle: vehicleTwo, votes: 20 }],
      },
    ],
    specialAwards: [],
  });

  assert.equal(slides.length, 1);
  assert.equal(slides[0]?.vehicle.id, "vehicle-2");
  assert.equal(slides[0]?.resultLabel, "People's Choice Winner");
});
