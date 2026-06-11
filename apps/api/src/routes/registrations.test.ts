import assert from "node:assert/strict";
import test from "node:test";
import { shouldImportCsvPhoto } from "./registrations.js";

const existingVehicle = {
  id: "vehicle-1",
  entryNumber: 1,
  ownerId: "owner-1",
  primaryPhotoId: null,
  photoCount: 0,
};

test("imports a CSV photo for a new vehicle", () => {
  assert.equal(shouldImportCsvPhoto(undefined, "https://example.com/photo.jpg"), true);
});

test("imports a CSV photo only when an existing vehicle has no photos", () => {
  assert.equal(shouldImportCsvPhoto(existingVehicle, "https://example.com/photo.jpg"), true);
  assert.equal(shouldImportCsvPhoto({ ...existingVehicle, photoCount: 1 }, "https://example.com/photo.jpg"), false);
});

test("never replaces an existing primary photo", () => {
  assert.equal(
    shouldImportCsvPhoto({ ...existingVehicle, primaryPhotoId: "owner-selected-photo" }, "https://example.com/photo.jpg"),
    false,
  );
});

test("does not attempt a photo import without a photo link", () => {
  assert.equal(shouldImportCsvPhoto(existingVehicle, ""), false);
});
