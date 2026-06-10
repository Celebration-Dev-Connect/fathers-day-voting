import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeQrCode } from "./utils.js";

describe("normalizeQrCode", () => {
  it("keeps a four-digit card number unchanged", () => {
    assert.equal(normalizeQrCode("0001"), "0001");
  });

  it("extracts a scanned public token from its URL", () => {
    assert.equal(normalizeQrCode("https://example.com/v/fd2026-token"), "fd2026-token");
  });
});
