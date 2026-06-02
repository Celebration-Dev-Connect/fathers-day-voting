import {
  DetectLabelsCommand,
  DetectModerationLabelsCommand,
  RekognitionClient,
  type Image,
} from "@aws-sdk/client-rekognition";
import type { ImageModerator, ModerationResult, ScanInput } from "./types.js";

const VEHICLE_LABELS = new Set([
  "Car", "Automobile", "Vehicle", "Motor Vehicle", "Transportation",
  "Sports Car", "Coupe", "Sedan", "Convertible", "Race Car", "Classic Car",
  "SUV", "Truck", "Pickup Truck", "Van", "Minivan", "Bus", "Motorcycle",
  "Bike", "Motorbike", "Wheel", "Alloy Wheel", "Tire",
]);

const VEHICLE_LABEL_MIN_CONFIDENCE = 20;
const MODERATION_LABEL_MIN_CONFIDENCE = 50;

export class RekognitionModerator implements ImageModerator {
  private readonly client: RekognitionClient;

  constructor(region: string) {
    this.client = new RekognitionClient({ region });
    // Log the resolved region and full error at the HTTP layer to diagnose
    // the AccessDeniedException: UnknownError we're seeing at runtime.
    void this.client.config.region().then((r) =>
      console.log("[rekognition-client] resolved region:", r),
    );
    this.client.middlewareStack.add(
      (next, _ctx) => async (args) => {
        try {
          return await next(args);
        } catch (err: unknown) {
          // Dump every property on the error — the SDK message is often incomplete.
          console.error("[rekognition-error] full error:", JSON.stringify(err, Object.getOwnPropertyNames(err as object)));
          throw err;
        }
      },
      { step: "deserialize", priority: "low", name: "debugMiddleware" },
    );
  }

  async scan(input: ScanInput): Promise<ModerationResult> {
    const image: Image =
      input.kind === "s3"
        ? { S3Object: { Bucket: input.bucket, Name: input.key } }
        : { Bytes: input.bytes };

    // Step 1: check for unsafe content.
    const modRes = await this.client.send(
      new DetectModerationLabelsCommand({
        Image: image,
        MinConfidence: MODERATION_LABEL_MIN_CONFIDENCE,
      }),
    );
    const moderationLabels = modRes.ModerationLabels ?? [];

    if (moderationLabels.length > 0) {
      return { decision: "REJECTED", moderationLabels, vehicleLabels: [] };
    }

    // Step 2: check for vehicle-related content.
    const labelRes = await this.client.send(
      new DetectLabelsCommand({
        Image: image,
        MinConfidence: VEHICLE_LABEL_MIN_CONFIDENCE,
      }),
    );
    const vehicleLabels = (labelRes.Labels ?? []).filter((l) =>
      VEHICLE_LABELS.has(l.Name ?? ""),
    );

    if (vehicleLabels.length > 0) {
      return { decision: "APPROVED", moderationLabels: [], vehicleLabels };
    }

    return { decision: "HUMAN_REVIEW", moderationLabels: [], vehicleLabels: [] };
  }
}
