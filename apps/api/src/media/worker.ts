import { Prisma, prisma } from "@carshow/db";
import type { FastifyBaseLogger } from "fastify";
import type { ImageModerator } from "./moderation/index.js";
import type { PhotoStorage } from "./storage/index.js";

const STALE_CLAIM_MS = 2 * 60 * 1000; // reclaim a photo if a scan has been "in progress" longer than this
const SWEEP_INTERVAL_MS = 30_000;
const SWEEP_BATCH = 10;

/**
 * Drives async moderation of uploaded photos. The PENDING rows in VehiclePhoto
 * are the queue: `enqueue` scans immediately (off the HTTP response) and the
 * sweeper re-picks anything a restart left behind. Storage + moderator are
 * injected, so the pipeline is backend-agnostic.
 */
export class PhotoModerationWorker {
  private sweeper?: NodeJS.Timeout;
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly storage: PhotoStorage,
    private readonly moderator: ImageModerator,
    private readonly log: FastifyBaseLogger,
  ) {}

  /** Fire-and-forget scan after the response is sent. */
  enqueue(photoId: string) {
    setImmediate(() => {
      void this.processPhoto(photoId).catch((err) => this.log.error({ err, photoId }, "photo moderation failed"));
    });
  }

  async processPhoto(photoId: string) {
    if (this.inFlight.has(photoId)) return;
    this.inFlight.add(photoId);
    try {
      if (!(await this.claim(photoId))) return;

      const photo = await prisma.vehiclePhoto.findUnique({ where: { id: photoId } });
      if (!photo || !photo.storageKey) return;

      let bytes: Buffer;
      try {
        bytes = await this.storage.getBytes(photo.storageKey);
      } catch (err) {
        this.log.error({ err, photoId }, "could not read pending photo bytes");
        await this.markFailed(photoId, { error: "storage_read_failed" });
        return;
      }

      let result: { safe: boolean; labels: unknown };
      try {
        result = await this.moderator.scan({ bytes, contentType: photo.contentType ?? "application/octet-stream" });
      } catch (err) {
        this.log.error({ err, photoId }, "moderation scan errored");
        await this.markFailed(photoId, { error: "scan_failed" });
        return;
      }

      if (result.safe) {
        const { storageKey } = await this.storage.moveToPublic(photoId);
        await prisma.vehiclePhoto.update({
          where: { id: photoId },
          data: {
            moderationStatus: "APPROVED",
            storageKey,
            url: this.storage.publicUrl(storageKey),
            moderationLabels: toJson(result.labels),
            processedAt: new Date(),
            processingStartedAt: null,
          },
        });
        this.log.info({ photoId }, "photo approved");
      } else {
        // Unsafe: purge bytes and the row immediately — it must never be recoverable.
        await this.storage.deletePending(photoId);
        await prisma.vehiclePhoto.delete({ where: { id: photoId } });
        this.log.warn({ photoId, labels: result.labels }, "photo rejected and deleted");
      }
    } finally {
      this.inFlight.delete(photoId);
    }
  }

  start() {
    void this.sweep(); // catch anything left PENDING by a previous run
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

  /** Atomically take ownership of a photo; returns false if already claimed/resolved. */
  private async claim(photoId: string) {
    const claim = await prisma.vehiclePhoto.updateMany({
      where: { id: photoId, ...this.claimableWhere() },
      data: { processingStartedAt: new Date() },
    });
    return claim.count > 0;
  }

  private claimableWhere(): Prisma.VehiclePhotoWhereInput {
    const staleBefore = new Date(Date.now() - STALE_CLAIM_MS);
    return {
      moderationStatus: { in: ["PENDING", "FAILED"] },
      OR: [{ processingStartedAt: null }, { processingStartedAt: { lt: staleBefore } }],
    };
  }

  private async markFailed(photoId: string, detail: Record<string, unknown>) {
    // Keep processingStartedAt set so the stale window throttles retries.
    await prisma.vehiclePhoto.update({
      where: { id: photoId },
      data: { moderationStatus: "FAILED", moderationLabels: toJson(detail), processedAt: new Date() },
    });
  }
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}
