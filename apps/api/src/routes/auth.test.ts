import assert from "node:assert/strict";
import test from "node:test";
import { StaffRole } from "@carshow/db";
import { pickHighestRole } from "./auth.js";

test("pickHighestRole returns null when no roles match", () => {
  assert.equal(pickHighestRole([]), null);
});

test("pickHighestRole prefers ADMIN over REGISTRAR and JUDGE", () => {
  assert.equal(
    pickHighestRole([StaffRole.JUDGE, StaffRole.ADMIN, StaffRole.REGISTRAR]),
    StaffRole.ADMIN,
  );
});

test("pickHighestRole prefers REGISTRAR over JUDGE", () => {
  assert.equal(pickHighestRole([StaffRole.JUDGE, StaffRole.REGISTRAR]), StaffRole.REGISTRAR);
});

test("pickHighestRole returns the single matched role", () => {
  assert.equal(pickHighestRole([StaffRole.JUDGE]), StaffRole.JUDGE);
});
