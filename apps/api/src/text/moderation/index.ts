import { config } from "../../config.js";
import { MockTextModerator, PassthroughTextModerator } from "./mock.js";
import { ComprehendTextModerator } from "./comprehend.js";
import type { TextModerator } from "./types.js";

export function createTextModerator(): TextModerator {
  if (config.textModeration.driver === "comprehend") {
    return new ComprehendTextModerator(
      config.aws.rekognitionRegion!,
      config.textModeration.minConfidence,
    );
  }
  if (config.textModeration.driver === "none") {
    return new PassthroughTextModerator();
  }
  return new MockTextModerator();
}

export type { TextModerator } from "./types.js";
