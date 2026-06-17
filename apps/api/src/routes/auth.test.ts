import assert from "node:assert/strict";
import test from "node:test";
import { StaffRole } from "@carshow/db";
import { matchMappedRoles, pickHighestRole } from "./auth.js";

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

const adminTeam = { pcoTeamName: "carshow", positionName: null, role: StaffRole.ADMIN };

test("matchMappedRoles grants a whole-team role to a member", () => {
  const positions = new Map([["carshow", ["Lead"]]]);
  assert.deepEqual(matchMappedRoles([adminTeam], positions), [StaffRole.ADMIN]);
});

test("matchMappedRoles does NOT match a non-member of a found team (empty positions)", () => {
  const positions = new Map([["carshow", []]]);
  assert.deepEqual(matchMappedRoles([adminTeam], positions), []);
});

test("matchMappedRoles does NOT match when the team was not looked up", () => {
  assert.deepEqual(matchMappedRoles([adminTeam], new Map()), []);
});

test("matchMappedRoles matches a positioned mapping only for that position (case-insensitive)", () => {
  const mappings = [{ pcoTeamName: "Photos", positionName: "Judge", role: StaffRole.JUDGE }];
  assert.deepEqual(matchMappedRoles(mappings, new Map([["Photos", ["judge"]]])), [StaffRole.JUDGE]);
  assert.deepEqual(matchMappedRoles(mappings, new Map([["Photos", ["Editor"]]])), []);
});
