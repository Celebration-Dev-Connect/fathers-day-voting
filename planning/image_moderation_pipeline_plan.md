# Image Upload + AWS Rekognition Moderation Pipeline (Backend Only)

> **Scope note:** This phase delivers and tests the **backend pipeline in isolation** — upload endpoints, S3 storage, async Rekognition moderation, and Terraform infra. Web/UI integration (visitor & owner upload screens, shared component types, admin moderation views) is intentionally **deferred** and excluded here. Everything below is verifiable via HTTP calls and local tooling without any frontend.

## Context

Visitors (and owners/staff) will upload vehicle photos from several places. Nothing user-uploaded may be shown publicly until it has been confirmed safe. We moderate every upload server-side via **AWS Rekognition `DetectModerationLabels`**, asynchronously, on the API itself. The DB row's moderation status is the gate: a freshly uploaded photo is `PENDING` and is never returned on public surfaces; only after a clean scan does it become `APPROVED` and publicly viewable. Images that fail moderation are deleted immediately from both S3 and the DB. Required AWS infrastructure (S3, IAM, CloudFront, Rekognition permissions) is provisioned as code via Terraform.

Today: no upload endpoints, no multipart, no AWS SDK, no job queue, and **zero IaC** exist. `VehiclePhoto` has only `url`. The API runs on Proxmox (outside AWS), so it authenticates to AWS with an IAM **user access key**. There is no public/visitor endpoint and no rate limiting yet.

## Decisions

- **IaC:** Terraform in `infra/terraform/`.
- **Async driver:** In-process worker + DB-backed sweeper. The `PENDING` rows in `VehiclePhoto` *are* the queue — no Redis. Survives restarts via a periodic sweeper.
- **Public delivery:** CloudFront (OAC) serving a private bucket's `public/` prefix. Justified by the ~10k-visitor / awards-burst traffic profile; immutable id-keyed objects mean no cache invalidation. `PENDING` objects live under `pending/` which the distribution does not serve.
- **Pluggable storage & moderation (key design):** Both photo **storage** and image **scanning** are defined as TypeScript interfaces with swappable implementations selected by config at startup. This phase ships two of each:
  - Storage: **LocalFs** (dev — files on local disk) and **S3** (prod).
  - Moderation: **Mock** (dev/tests) and **Rekognition** (prod).
  
  The two interfaces are independent — neither depends on the other (the worker orchestrates them), so e.g. local-disk storage can be paired with the mock scanner in dev, and any future backend (GCS, Azure Blob, a different vision API, a local NSFW model) is added as one new class + a factory case, with no changes to the pipeline.

---

## Architecture / flow

```
upload (multipart)                async (setImmediate, off the response)
   │                                      │
   ▼                                      ▼
API validates type/size/cap        worker.processPhoto(id):
   │                                 1. claim row (processingStartedAt)
   ├─ storage.putPending(pending/id) 2. bytes = storage.getBytes(pending/id)
   ├─ DB insert VehiclePhoto            moderator.scan({ bytes })
   │     status=PENDING, url=null    3a. CLEAN → storage.moveToPublic(id),
   ├─ enqueue(id)                         row.status=APPROVED, url=storage.publicUrl(...)
   └─ 202 { id, status:PENDING }     3b. UNSAFE → storage.deletePending(id) + delete row
                                     3c. ERROR → row.status=FAILED (sweeper retries)

  (storage & moderator are interfaces — see §3; impls chosen by config)

sweeper (setInterval ~30s): re-pick PENDING/FAILED rows whose claim is null or stale
   → handles API restarts; nothing unscanned is ever exposed because public reads filter status=APPROVED
```

---

## 1. Database schema — `packages/db/prisma/schema.prisma`

Add enum and extend `VehiclePhoto`:

```prisma
enum PhotoModerationStatus {
  PENDING    // uploaded, not yet confirmed safe — NEVER public
  APPROVED   // Rekognition clean — public
  FAILED     // scan errored — not public; sweeper retries
}

model VehiclePhoto {
  id                 String                @id @default(cuid())
  vehicleEntryId     String
  url                String?               // public CDN URL; null until APPROVED
  storageKey         String?               // S3 key (pending/<id> → public/<id>)
  contentType        String?
  altText            String?
  sortOrder          Int                   @default(0)
  moderationStatus   PhotoModerationStatus @default(PENDING)
  moderationLabels   Json?                 // detected labels (audit) / error detail
  uploadedBy         String?               // voterKey or staffUserId (provenance)
  processingStartedAt DateTime?            // claim marker for worker/sweeper
  processedAt        DateTime?
  createdAt          DateTime              @default(now())
  vehicleEntry       VehicleEntry          @relation(fields: [vehicleEntryId], references: [id], onDelete: Cascade)

  @@unique([vehicleEntryId, sortOrder])
  @@index([vehicleEntryId])
  @@index([moderationStatus])
}
```

- New migration `2026xxxx_photo_moderation`. **Existing seed rows must be back-filled** `moderationStatus = APPROVED` (they're demo loremflickr URLs) so current data stays valid — do this in the migration SQL (`UPDATE "VehiclePhoto" SET "moderationStatus"='APPROVED'`).
- Update `packages/db/prisma/seed.ts` to set `moderationStatus: "APPROVED"` on seeded photos.

`moderationStatus` is the "Processed/safe" column described: `PENDING` = not yet safe, `APPROVED` = safe. Rejected images are deleted, never stored.

---

## 2. API dependencies & config — `apps/api`

Add deps: `@fastify/multipart`, `@fastify/rate-limit`, `@aws-sdk/client-s3`, `@aws-sdk/client-rekognition`, `@aws-sdk/s3-request-presigner` (dev/MinIO URLs).

New `apps/api/src/config.ts` — zod-validated env accessor (consolidates the scattered `process.env` reads). Throws on missing required vars **in production** (`JWT_SECRET`, `AWS_REGION`, `S3_BUCKET`, `CDN_BASE_URL`); permissive defaults in dev. Exposes: AWS region, bucket, `S3_ENDPOINT?` (MinIO), `MODERATION_DRIVER` (`rekognition|mock`), `CDN_BASE_URL`, moderation threshold, max file size, per-vehicle photo cap.

---

## 3. Pluggable storage + moderation — `apps/api/src/media/`

Two independent interfaces, each with multiple implementations chosen at startup by config. The worker depends only on the interfaces, never a concrete backend.

### Storage interface — `media/storage/types.ts`
```ts
export interface PhotoStorage {
  putPending(id: string, bytes: Buffer, contentType: string): Promise<{ storageKey: string }>;
  getBytes(storageKey: string): Promise<Buffer>;          // used by the scanner, backend-agnostic
  moveToPublic(id: string): Promise<{ storageKey: string }>; // pending/<id> → public/<id>
  deletePending(id: string): Promise<void>;
  deletePublic(id: string): Promise<void>;
  publicUrl(storageKey: string): string;                   // how an APPROVED photo is served
}
```
Implementations (one file each):
- `media/storage/localFs.ts` — **dev.** Writes under `LOCAL_STORAGE_DIR` (e.g. `var/media/pending/<id>`, `var/media/public/<id>`). `moveToPublic` = `fs.rename`; deletes = `fs.unlink`. `publicUrl` → `${MEDIA_PUBLIC_BASE_URL}/media/public/<id>` served by a dev-only static route (see §4). No AWS, no MinIO, no container.
- `media/storage/s3.ts` — **prod.** `@aws-sdk/client-s3`: `PutObjectCommand`; `moveToPublic` = `CopyObjectCommand` + `DeleteObjectCommand`; `getBytes` = `GetObjectCommand`. `publicUrl` → `${CDN_BASE_URL}/<id>` (CloudFront).
- `media/storage/index.ts` — `createStorage(config): PhotoStorage` factory, switch on `STORAGE_DRIVER` (`local` | `s3`).

### Moderation interface — `media/moderation/types.ts`
```ts
export interface ImageModerator {
  scan(image: { bytes: Buffer; contentType: string }): Promise<{ safe: boolean; labels: unknown }>;
}
```
Takes raw bytes (not an S3 key) so it is fully decoupled from the storage backend. Implementations:
- `media/moderation/mock.ts` — **dev/tests.** `safe` unless an injected marker is present (e.g. original filename contains `unsafe`), so the reject path is exercisable locally and deterministically.
- `media/moderation/rekognition.ts` — **prod.** `@aws-sdk/client-rekognition` `DetectModerationLabelsCommand` with `Image: { Bytes }`, `MinConfidence` from config; `safe = (ModerationLabels ?? []).length === 0`.
- `media/moderation/index.ts` — `createModerator(config): ImageModerator` factory, switch on `MODERATION_DRIVER` (`mock` | `rekognition`).

> Note: Rekognition's inline `Bytes` path is capped at 5 MB, so `PHOTO_MAX_BYTES` defaults to 5 MB this phase. Server-side downscaling/EXIF-strip (e.g. `sharp`) to lift that cap is a listed follow-up.

### Worker — `media/worker.ts`
Constructed with a `PhotoStorage` + `ImageModerator` (injected; trivially swappable in tests).
- `enqueue(photoId)` → `setImmediate(() => processPhoto(photoId))` so scanning happens after the HTTP response.
- `processPhoto(id)`: atomically claim (`updateMany where id, processingStartedAt null/stale → set now`); `bytes = storage.getBytes(pendingKey)`; `moderator.scan({ bytes })`; apply CLEAN/UNSAFE/ERROR transitions from the flow above; always clears/sets the claim.
- `startSweeper()`: `setInterval` (~30s) selects a bounded batch of `PENDING`/`FAILED` rows with null/stale `processingStartedAt` and processes them with limited concurrency. Started after `app.listen`. This is the restart-safety net.

---

## 4. Endpoints — `apps/api/src/server.ts`

Register `@fastify/multipart` (limits: 1 file, ~10MB, mime allowlist `image/jpeg|png|webp`) and `@fastify/rate-limit` (applied to public upload).

- **Public upload (visitor):** `POST /v/:publicToken/photos` (no auth, rate-limited per IP). Resolve `QrCard.publicToken` → `vehicleEntryId`; enforce per-vehicle cap (count PENDING+APPROVED); next `sortOrder`; `storage.putPending` → insert row `PENDING` → `enqueue(id)` → `202 { id, status:"PENDING" }`. Provenance `uploadedBy = voterKey`.
- **Staff upload:** `POST /registrations/:id/photos` (`requireStaff`). Same pipeline (also moderated, for consistency).
- **Public vehicle read:** `GET /v/:publicToken` (no auth) → vehicle summary + photos filtered to `moderationStatus = APPROVED` only. Never exposes `pending/` keys. (This is the minimal read surface needed to *test* the pipeline; it is not a UI.)
- **Staff reads:** extend the existing registration includes (the `photos` include near server.ts:191 and the `/registrations/:id` include) so the API response carries `moderationStatus`/`url`. (Response-shape only — no UI work in this phase.)

- **Dev static media route:** when `STORAGE_DRIVER=local`, register a static route (`@fastify/static` or a small stream handler) serving `LOCAL_STORAGE_DIR/public/*` at `/media/public/*`, so locally-stored APPROVED photos resolve via `publicUrl`. Registered **only** for the local driver — prod serves from CloudFront and the `pending/` dir is never exposed.

All public surfaces gate on `moderationStatus = APPROVED`, so an unscanned image is unreachable even though its row exists.

---

## 5. Terraform IaC — `infra/terraform/`

- `versions.tf` — AWS provider pin; local state for now (note: migrate to S3 backend later).
- `variables.tf` — `region`, `project`, `bucket_name`, `environment`, `cors_allowed_origins`.
- `s3.tf` — private bucket; `aws_s3_bucket_public_access_block` (block all); bucket policy granting **only** the CloudFront OAC `s3:GetObject` on `public/*`; CORS for browser uploads; lifecycle rule deleting `pending/*` after 1 day (orphan/abandoned cleanup).
- `cloudfront.tf` — distribution with Origin Access Control, origin = bucket with **origin path `/public`** (so only approved objects are reachable), long-TTL immutable cache policy. Output domain.
- `iam.tf` — `aws_iam_user` for the API + access key + least-privilege policy: `s3:PutObject/GetObject/DeleteObject/CopyObject` on `arn:.../*`, `rekognition:DetectModerationLabels` on `*`.
- `outputs.tf` — `bucket_name`, `cloudfront_domain`, `aws_access_key_id`, `aws_secret_access_key` (sensitive). `infra/README.md` documents `terraform apply` and copying outputs into `.env`.
- `.gitignore`: add `infra/terraform/.terraform/`, `*.tfstate*`, `terraform.tfvars`. Provide `terraform.tfvars.example`.

Rekognition needs no provisioned resource — it's pay-per-call; only the IAM permission is required.

---

## 6. Local dev (no AWS, no MinIO)

- `STORAGE_DRIVER=local` + `MODERATION_DRIVER=mock`. The full pipeline (upload → scan → approve/reject → move/delete → public read) runs entirely on local disk with no AWS account and **no extra containers** — just the existing Postgres. Files land under `LOCAL_STORAGE_DIR` (gitignored, e.g. `apps/api/var/media/`) and APPROVED photos are served by the dev static route (§4).
- No `docker-compose.yml` change is required for the pipeline. (S3/MinIO is no longer part of local dev; prod uses real S3 via the `s3` driver.)

---

## 7. Env vars — `.env.example` (and document in README)

Driver selection:
- `STORAGE_DRIVER` (`local` | `s3`), `MODERATION_DRIVER` (`mock` | `rekognition`).

Local driver: `LOCAL_STORAGE_DIR` (e.g. `apps/api/var/media`), `MEDIA_PUBLIC_BASE_URL` (e.g. `http://localhost:4000`).

S3 / Rekognition driver: `AWS_REGION`, `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (from Terraform outputs; standard SDK credential-chain names), `S3_BUCKET`, `CDN_BASE_URL` (CloudFront domain), `MODERATION_MIN_CONFIDENCE` (e.g. `60`).

Common: `PHOTO_MAX_BYTES` (default 5 MB — Rekognition `Bytes` limit), `PHOTO_PER_VEHICLE_CAP`.

`config.ts` validates the vars required by the *selected* drivers (e.g. S3 vars only required when `STORAGE_DRIVER=s3`).

---

## Files to create / modify

Create:
- `infra/terraform/{versions,variables,s3,cloudfront,iam,outputs}.tf`, `infra/terraform/terraform.tfvars.example`, `infra/README.md`
- `apps/api/src/config.ts`
- `apps/api/src/media/storage/{types,localFs,s3,index}.ts`
- `apps/api/src/media/moderation/{types,mock,rekognition,index}.ts`
- `apps/api/src/media/worker.ts`

Modify: `packages/db/prisma/schema.prisma` (+ new migration), `packages/db/prisma/seed.ts`, `apps/api/src/server.ts`, `apps/api/package.json`, `.env.example`, `.gitignore` (add `apps/api/var/`), `README.md`. (No `docker-compose.yml` change needed for this phase.)

## Verification (local, end-to-end, no AWS, no frontend)

All via `curl`/HTTP against the running API, using the **local** drivers (`STORAGE_DRIVER=local`, `MODERATION_DRIVER=mock`) — no AWS, no MinIO:

1. `docker compose up -d postgres`; `npm run db:migrate && npm run db:seed`; start API.
2. **Happy path:** `POST /v/:token/photos` with a clean JPEG → `202 PENDING`. Immediately `GET /v/:token` → photo **absent**. After the worker runs → row `APPROVED`, file moved to `var/media/public/<id>`, `var/media/pending/<id>` gone, `GET /v/:token` returns it with a `url` that resolves via the dev static route.
3. **Reject path:** upload a file named `*unsafe*.jpg` → after processing, the DB row is gone and the on-disk file is deleted; never public. (Confirm via DB query + `ls var/media`.)
4. **Restart safety:** kill the API while a row is `PENDING`; on restart the sweeper claims and processes it.
5. **Caps/limits:** oversized file and >cap uploads are rejected with 4xx; rate-limit triggers on burst.
6. **Driver swap (interface check):** the same upload/scan tests pass unchanged when the worker is constructed with the S3 + Rekognition impls (unit-level with a stubbed S3/Rekognition, or against a real dev bucket), proving the pipeline is backend-agnostic.
7. **IaC:** `terraform init && terraform validate && terraform plan` (config correctness; real `apply` needs AWS creds). Confirm bucket blocks public access and only CloudFront OAC can read `public/*`.

## Out of scope / follow-ups (deferred to a later phase)

- **Web/UI integration** — visitor & owner upload screens, the `VehiclePhoto` shared-type change in `packages/carshow-components`, the `apps/admin-web/src/api.ts` multipart upload helper, and any admin moderation views. The backend returns the new fields, but no frontend consumes them yet.
- Server-side image downscaling / EXIF-strip (e.g. `sharp`) to normalize uploads and lift the 5 MB Rekognition `Bytes` cap.
- Additional storage/moderation implementations (GCS/Azure Blob, alternative vision APIs or a local NSFW model) — the interfaces are designed to accept them with no pipeline changes.
- Visitor & owner apps themselves, Planning Center auth, S3 remote Terraform backend, signed-cookie CloudFront (unneeded — approved images are public by design).
