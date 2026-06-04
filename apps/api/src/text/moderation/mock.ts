import type { TextModerationResult, TextModerator } from "./types.js";

const UNSAFE_MARKER = "unsafe";

/** Dev/test driver — deterministic without AWS:
 *  - any text containing "unsafe" → rejected
 *  - everything else              → approved */
export class MockTextModerator implements TextModerator {
  async moderate(texts: string[]): Promise<TextModerationResult> {
    if (texts.some((t) => t.toLowerCase().includes(UNSAFE_MARKER))) {
      return { approved: false, reason: "wordlist" };
    }
    return { approved: true };
  }
}

/** No-op driver for environments where text moderation is disabled. */
export class PassthroughTextModerator implements TextModerator {
  async moderate(_texts: string[]): Promise<TextModerationResult> {
    return { approved: true };
  }
}
