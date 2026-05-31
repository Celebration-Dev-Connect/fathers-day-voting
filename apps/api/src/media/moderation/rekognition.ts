import { DetectModerationLabelsCommand, RekognitionClient } from "@aws-sdk/client-rekognition";
import type { ImageModerator } from "./types.js";

/** Prod driver: AWS Rekognition DetectModerationLabels over inline bytes (≤5MB).
 *  Any returned moderation label above MinConfidence marks the image unsafe. */
export class RekognitionModerator implements ImageModerator {
  private readonly client: RekognitionClient;

  constructor(
    region: string,
    private readonly minConfidence: number,
  ) {
    this.client = new RekognitionClient({ region });
  }

  async scan(image: { bytes: Buffer; contentType: string }) {
    const res = await this.client.send(
      new DetectModerationLabelsCommand({
        Image: { Bytes: image.bytes },
        MinConfidence: this.minConfidence,
      }),
    );
    const labels = res.ModerationLabels ?? [];
    return { safe: labels.length === 0, labels };
  }
}
