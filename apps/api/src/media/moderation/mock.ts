import type { ImageModerator } from "./types.js";

const UNSAFE_MARKER = Buffer.from("unsafe");

/** Dev/test driver: deterministic — any upload whose bytes contain the ASCII
 *  marker "unsafe" is rejected, everything else passes. Lets the reject path be
 *  exercised locally without AWS. */
export class MockModerator implements ImageModerator {
  async scan(image: { bytes: Buffer; contentType: string }) {
    const flagged = image.bytes.includes(UNSAFE_MARKER);
    return flagged
      ? { safe: false, labels: [{ name: "MockUnsafeMarker", confidence: 100 }] }
      : { safe: true, labels: [] as unknown[] };
  }
}
