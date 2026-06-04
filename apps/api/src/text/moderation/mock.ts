import type { TextModerationResult, TextModerator } from "./types.js";
import { containsBadWords } from "./wordlist.js";

/** Dev/test driver — runs the real word-list filter (no AWS needed).
 *  Also rejects the "unsafe" sentinel for deterministic testing. */
export class MockTextModerator implements TextModerator {
  async moderate(texts: string[]): Promise<TextModerationResult> {
    if (containsBadWords(texts) || texts.some((t) => t.toLowerCase().includes("unsafe"))) {
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
