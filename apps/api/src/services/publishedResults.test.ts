import assert from "node:assert/strict";
import test from "node:test";
import { placementsForVehicle } from "./publishedResults.js";

test("placementsForVehicle returns official, people's choice, and special award placements", () => {
  const vehicle = { id: "vehicle-1" };
  const placements = placementsForVehicle(
    {
      categories: [
        {
          category: { name: "Classic Car" },
          official: [{ rank: 2, vehicle }],
          peopleChoice: [{ rank: 1, vehicle }],
        },
      ],
      specialAwards: [
        {
          specialAward: { name: "Best Paint" },
          results: [{ rank: 3, vehicle }],
        },
      ],
    },
    vehicle.id,
  );

  assert.deepEqual(placements, [
    { kind: "OFFICIAL", label: "Classic Car", rank: 2 },
    { kind: "PEOPLE_CHOICE", label: "Classic Car", rank: 1 },
    { kind: "SPECIAL_AWARD", label: "Best Paint", rank: 3 },
  ]);
});

test("placementsForVehicle ignores unpublished or unrelated results", () => {
  assert.deepEqual(placementsForVehicle(null, "vehicle-1"), []);
  assert.deepEqual(
    placementsForVehicle(
      {
        categories: [
          {
            category: { name: "Truck" },
            official: [],
            peopleChoice: [{ rank: 1, vehicle: { id: "vehicle-2" } }],
          },
        ],
        specialAwards: [],
      },
      "vehicle-1",
    ),
    [],
  );
});
