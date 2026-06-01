export type ModerationDecision = "APPROVED" | "REJECTED" | "HUMAN_REVIEW";

export interface ModerationResult {
  decision: ModerationDecision;
  moderationLabels: unknown;
  vehicleLabels: unknown;
}

/** S3-native reference — Rekognition reads the object directly, no byte transfer. */
export type S3ScanInput = { kind: "s3"; bucket: string; key: string; contentType: string };
/** Inline bytes — used by the local/mock driver. */
export type BytesScanInput = { kind: "bytes"; bytes: Buffer; contentType: string };
export type ScanInput = S3ScanInput | BytesScanInput;

export interface ImageModerator {
  scan(input: ScanInput): Promise<ModerationResult>;
}
