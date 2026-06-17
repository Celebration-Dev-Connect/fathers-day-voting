import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { randomOwnerAccessCode, resolveDownloadedPhotoContentType, shouldImportCsvPhoto } from "./registrations.js";

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

test("allocates random five-digit owner access codes without reusing reserved codes", () => {
  const used = new Set<string>();
  const codes = Array.from({ length: 100 }, () => randomOwnerAccessCode(used));

  assert.equal(new Set(codes).size, 100);
  assert.equal(used.size, 100);
  assert.ok(codes.every((code) => /^\d{5}$/.test(code)));
});

test("recognizes a downloaded image even with a generic content type", async () => {
  const bytes = await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 3,
      background: "#c8102e",
    },
  })
    .png()
    .toBuffer();

  assert.equal(await resolveDownloadedPhotoContentType("application/octet-stream", bytes), "image/png");
});

test("rejects an HTML WebGuide response even when the request succeeded", async () => {
  const bytes = Buffer.from("<!doctype html><html><body>login</body></html>");

  assert.equal(await resolveDownloadedPhotoContentType("text/html; charset=utf-8", bytes), null);
});
