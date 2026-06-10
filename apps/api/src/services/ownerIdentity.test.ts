import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ownerIdentityKey } from "./ownerIdentity.js";

describe("ownerIdentityKey", () => {
  it("groups owners only when normalized email and phone both match", () => {
    assert.equal(
      ownerIdentityKey(" JOHN@example.com ", "(780) 555-1212"),
      ownerIdentityKey("john@example.com", "780-555-1212"),
    );
  });

  it("keeps same-name owners separate when email or phone differs", () => {
    const original = ownerIdentityKey("john@example.com", "780-555-1212");
    assert.notEqual(original, ownerIdentityKey("other@example.com", "780-555-1212"));
    assert.notEqual(original, ownerIdentityKey("john@example.com", "780-555-9999"));
  });
});
