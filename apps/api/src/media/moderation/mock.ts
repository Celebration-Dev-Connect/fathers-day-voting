import type { ImageModerator, ModerationResult, ScanInput } from "./types.js";

const UNSAFE_MARKER = Buffer.from("unsafe");
const HUMAN_MARKER = Buffer.from("human");

/** Dev/test driver — deterministic without AWS:
 *  - bytes containing "unsafe"  → REJECTED
 *  - bytes containing "human"   → HUMAN_REVIEW
 *  - everything else            → APPROVED */
export class MockModerator implements ImageModerator {
  async scan(input: ScanInput): Promise<ModerationResult> {
    // Local driver always passes bytes; S3 kind won't reach this in prod.
    const bytes = input.kind === "bytes" ? input.bytes : Buffer.alloc(0);
    if (bytes.includes(UNSAFE_MARKER)) {
      return {
        decision: "REJECTED",
        moderationLabels: [{ name: "MockUnsafeMarker", confidence: 100 }],
        vehicleLabels: [],
      };
    }
    if (bytes.includes(HUMAN_MARKER)) {
      return { decision: "HUMAN_REVIEW", moderationLabels: [], vehicleLabels: [] };
    }
    return {
      decision: "APPROVED",
      moderationLabels: [],
      vehicleLabels: [{ name: "MockVehicle", confidence: 99 }],
    };
  }
}
