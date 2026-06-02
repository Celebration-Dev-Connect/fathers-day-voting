import { config } from "../../config.js";
import { MockModerator } from "./mock.js";
import { RekognitionModerator } from "./rekognition.js";
import type { ImageModerator } from "./types.js";

/** Pick the moderation backend from config (MODERATION_DRIVER). */
export function createModerator(): ImageModerator {
  if (config.moderation.driver === "rekognition") {
    return new RekognitionModerator(config.aws.region!);
  }
  return new MockModerator();
}

export type { ImageModerator } from "./types.js";
