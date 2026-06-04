export interface TextModerationResult {
  approved: boolean;
  /** Stage that rejected the content — for logging only. */
  reason?: "wordlist" | "comprehend";
  /** Raw API output — for logging only. */
  labels?: unknown;
}

export interface TextModerator {
  /** Check an array of strings in one call. Rejects if any string fails either stage. */
  moderate(texts: string[]): Promise<TextModerationResult>;
}
