import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { qrCodeLookupCandidates } from "./utils.js";

describe("qrCodeLookupCandidates", () => {
  it("maps a printed four-digit number to the legacy visible code", () => {
    assert.deepEqual(qrCodeLookupCandidates("0001"), ["0001", "C-001"]);
  });

  it("maps a legacy visible code to the numeric card number", () => {
    assert.deepEqual(qrCodeLookupCandidates("C-001"), ["0001", "C-001"]);
  });

  it("keeps scanned tokens unchanged", () => {
    assert.deepEqual(qrCodeLookupCandidates("fd2026-token"), ["fd2026-token"]);
  });
});
