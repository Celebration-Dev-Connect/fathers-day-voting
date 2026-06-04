import { ComprehendClient, DetectToxicContentCommand } from "@aws-sdk/client-comprehend";
import type { TextModerationResult, TextModerator } from "./types.js";
import { containsBadWords } from "./wordlist.js";

export class ComprehendTextModerator implements TextModerator {
  private readonly client: ComprehendClient;
  private readonly minConfidence: number;

  constructor(region: string, minConfidence: number) {
    this.client = new ComprehendClient({ region });
    this.minConfidence = minConfidence;
  }

  async moderate(texts: string[]): Promise<TextModerationResult> {
    // Stage 1 — local word list (free, instant)
    if (containsBadWords(texts)) {
      return { approved: false, reason: "wordlist" };
    }

    // Stage 2 — AWS Comprehend DetectToxicContent
    let result;
    try {
      result = await this.client.send(
        new DetectToxicContentCommand({
          TextSegments: texts.map((Text) => ({ Text })),
          LanguageCode: "en",
        }),
      );
    } catch (err) {
      // Fail open on AWS errors so a Comprehend outage doesn't block all owner saves.
      console.error("[comprehend-text-moderation] error, failing open:", err);
      return { approved: true };
    }

    const flagged = result.ResultList?.some((seg) =>
      seg.Labels?.some((l) => (l.Score ?? 0) >= this.minConfidence),
    );

    if (flagged) {
      return { approved: false, reason: "comprehend", labels: result.ResultList };
    }
    return { approved: true, labels: result.ResultList };
  }
}
