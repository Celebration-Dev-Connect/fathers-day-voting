import { Prisma, prisma } from "@carshow/db";
import type { FastifyBaseLogger } from "fastify";
import sharp from "sharp";
import type { ImageModerator } from "./moderation/index.js";
import type { PhotoStorage } from "./storage/index.js";

const STALE_PROCESSING_MS = 2 * 60 * 1000;
const SWEEP_INTERVAL_MS = 30_000;
const SWEEP_BATCH = 10;

/**
 * Drives async moderation of uploaded photos following the state machine:
 *
 *   PENDING → PROCESSING → APPROVED   (no moderation labels + vehicle label >20%)
 *                        → HUMAN_REVIEW (no moderation labels + no vehicle labels)
 *                        → REJECTED   (moderation label >50%)
 *                        → FAILED     (system error — retried by sweeper)
 */
export class PhotoModerationWorker {
  private sweeper?: NodeJS.Timeout;
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly storage: PhotoStorage,
    private readonly moderator: ImageModerator,
    private readonly log: FastifyBaseLogger,
  ) {}

  enqueue(photoId: string) {
    setImmediate(() => {
      void this.processPhoto(photoId).catch((err) =>
        this.log.error({ err, photoId }, "photo moderation failed"),
      );
    });
  }

  async processPhoto(photoId: string) {
    if (this.inFlight.has(photoId)) return;
    this.inFlight.add(photoId);
    try {
      // Atomically claim: only picks up PENDING or stale PROCESSING rows.
      if (!(await this.claim(photoId))) return;

      const photo = await prisma.vehiclePhoto.findUnique({ where: { id: photoId } });
      if (!photo || !photo.storageKey) return;

      // Download bytes once — used for both the Rekognition scan and
      // the sharp resize on approval. Rekognition's S3Object reference
      // requires the Rekognition service principal to have a bucket policy
      // grant which we don't control, so inline bytes are simpler and safe
      // given the 5 MB upload cap.
      const contentType = photo.contentType ?? "application/octet-stream";
      let originalBytes: Buffer;
      try {
        originalBytes = await this.storage.getBytes(photo.storageKey);
      } catch (err) {
        this.log.error({ err, photoId }, "could not read pending photo bytes");
        await this.markFailed(photoId, { error: "storage_read_failed" });
        return;
      }

      // Run moderation scan with inline bytes.
      let result: Awaited<ReturnType<typeof this.moderator.scan>>;
      try {
        result = await this.moderator.scan({ kind: "bytes", bytes: originalBytes, contentType });
      } catch (err) {
        this.log.error({ err, photoId }, "moderation scan errored");
        await this.markFailed(photoId, { error: "scan_failed" });
        return;
      }

      const labels = toJson({ moderation: result.moderationLabels, vehicle: result.vehicleLabels });

      if (result.decision === "APPROVED") {

        const [mediumBytes, thumbBytes] = await Promise.all([
          sharp(originalBytes).resize(192, 144, { fit: "cover" }).webp({ quality: 82 }).toBuffer(),
          sharp(originalBytes).resize(56, 56, { fit: "cover" }).webp({ quality: 80 }).toBuffer(),
        ]);

        const [{ storageKey: mediumKey }, { storageKey: thumbKey }, { storageKey }] = await Promise.all([
          this.storage.putPublicVariant(photoId, "medium", mediumBytes, "image/webp"),
          this.storage.putPublicVariant(photoId, "thumb", thumbBytes, "image/webp"),
          this.storage.moveToPublic(photoId),
        ]);

        await prisma.vehiclePhoto.update({
          where: { id: photoId },
          data: {
            moderationStatus: "APPROVED",
            storageKey,
            url: this.storage.publicUrl(storageKey),
            mediumUrl: this.storage.publicUrl(mediumKey),
            thumbUrl: this.storage.publicUrl(thumbKey),
            moderationLabels: labels,
            processedAt: new Date(),
            processingStartedAt: null,
          },
        });
        this.log.info({ photoId }, "photo approved");

      } else if (result.decision === "REJECTED") {
        // Delete the bytes — rejected content must not be retrievable.
        await this.storage.deletePending(photoId).catch((err) =>
          this.log.warn({ err, photoId }, "could not delete rejected photo bytes"),
        );
        await prisma.vehiclePhoto.update({
          where: { id: photoId },
          data: {
            moderationStatus: "REJECTED",
            moderationLabels: labels,
            processedAt: new Date(),
            processingStartedAt: null,
          },
        });
        this.log.warn({ photoId, labels: result.moderationLabels }, "photo rejected");

      } else {
        // HUMAN_REVIEW — keep bytes in pending storage until a human decides.
        await prisma.vehiclePhoto.update({
          where: { id: photoId },
          data: {
            moderationStatus: "HUMAN_REVIEW",
            moderationLabels: labels,
            processedAt: new Date(),
            processingStartedAt: null,
          },
        });
        this.log.info({ photoId }, "photo queued for human review");
      }
    } finally {
      this.inFlight.delete(photoId);
    }
  }

  start() {
    void this.sweep();
    this.sweeper = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.sweeper.unref?.();
    this.log.info("photo moderation sweeper started");
  }

  stop() {
    if (this.sweeper) clearInterval(this.sweeper);
  }

  private async sweep() {
    try {
      const due = await prisma.vehiclePhoto.findMany({
        where: this.claimableWhere(),
        select: { id: true },
        take: SWEEP_BATCH,
      });
      for (const row of due) {
        await this.processPhoto(row.id);
      }
    } catch (err) {
      this.log.error({ err }, "photo moderation sweep failed");
    }
  }

  private async claim(photoId: string) {
    const claimed = await prisma.vehiclePhoto.updateMany({
      where: { id: photoId, ...this.claimableWhere() },
      data: { moderationStatus: "PROCESSING", processingStartedAt: new Date() },
    });
    return claimed.count > 0;
  }

  private claimableWhere(): Prisma.VehiclePhotoWhereInput {
    const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS);
    return {
      OR: [
        // Fresh PENDING photos ready to process.
        { moderationStatus: "PENDING", processingStartedAt: null },
        // PROCESSING rows whose worker crashed — reclaim after stale window.
        { moderationStatus: "PROCESSING", processingStartedAt: { lt: staleBefore } },
        // FAILED system errors — allow retry.
        { moderationStatus: "FAILED", processingStartedAt: { lt: staleBefore } },
      ],
    };
  }

  private async markFailed(photoId: string, detail: Record<string, unknown>) {
    await prisma.vehiclePhoto.update({
      where: { id: photoId },
      data: {
        moderationStatus: "FAILED",
        moderationLabels: toJson(detail),
        processedAt: new Date(),
      },
    });
  }
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}
