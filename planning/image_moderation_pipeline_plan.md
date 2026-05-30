# Image Upload + AWS Rekognition Moderation Pipeline (Backend Only)

> **Scope note:** This phase delivers and tests the **backend pipeline in isolation** — upload endpoints, S3 storage, async Rekognition moderation, and Terraform infra. Web/UI integration (visitor & owner upload screens, shared component types, admin moderation views) is intentionally **deferred** and excluded here. Everything below is verifiable via HTTP calls and local tooling without any frontend.

## Context

Visitors (and owners/staff) will upload vehicle photos from several places. Nothing user-uploaded may be shown publicly until it has been confirmed safe. We moderate every upload server-side via **AWS Rekognition `DetectModerationLabels`**, asynchronously, on the API itself. The DB row's moderation status is the gate: a freshly uploaded photo is `PENDING` and is never returned on public surfaces; only after a clean scan does it become `APPROVED` and publicly viewable. Images that fail moderation are deleted immediately from both S3 and the DB. Required AWS infrastructure (S3, IAM, CloudFront, Rekognition permissions) is provisioned as code via Terraform.

Today: no upload endpoints, no multipart, no AWS SDK, no job queue, and **zero IaC** exist. `VehiclePhoto` has only `url`. The API runs on Proxmox (outside AWS), so it authenticates to AWS with an IAM **user access key**. There is no public/visitor endpoint and no rate limiting yet.

## Decisions

- **IaC:** Terraform in `infra/terraform/`.
- **Async driver:** In-process worker + DB-backed sweeper. The `PENDING` rows in `VehiclePhoto` *are* the queue — no Redis. Survives restarts via a periodic sweeper.
- **Public delivery:** CloudFront (OAC) serving a private bucket's `public/` prefix. Justified by the ~10k-visitor / awards-burst traffic profile; immutable id-keyed objects mean no cache invalidation. `PENDING` objects live under `pending/` which the distribution does not serve.

---

## Architecture / flow

```
upload (multipart)                async (setImmediate, off the response)
   │                                      │
   ▼                                      ▼
API validates type/size/cap        worker.processPhoto(id):
   │                                 1. claim row (processingStartedAt)
   ├─ S3 PutObject  pending/<id>     2. Rekognition DetectModerationLabels
   ├─ DB insert VehiclePhoto              (Image = S3Object pending/<id>)
   │     status=PENDING, url=null    3a. CLEAN → S3 Copy pending→public/<id>,
   ├─ enqueue(id)                         delete pending/<id>,
   └─ 202 { id, status:PENDING }          row.status=APPROVED, url=CDN/<id>
                                     3b. UNSAFE → delete pending/<id> + delete row
                                     3c. ERROR → row.status=FAILED (sweeper retries)

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

## 3. Storage + moderation modules — `apps/api/src/media/`

Driver abstraction so local dev needs no AWS:

- `storage.ts` — `interface PhotoStorage { putPending(key, bytes, contentType); moveToPublic(id); deletePending(id); deleteObject(key); publicUrl(storageKey) }`.
  - **S3 impl** (`@aws-sdk/client-s3`): `PutObjectCommand`, `CopyObjectCommand` + `DeleteObjectCommand` for the pending→public move. `publicUrl` → `${CDN_BASE_URL}/<id>` (prod) or a presigned GET (MinIO dev). One impl handles both; MinIO is just `S3_ENDPOINT` + `forcePathStyle`.
- `moderator.ts` — `interface Moderator { scan(pendingKey): Promise<{ safe: boolean; labels: unknown }> }`.
  - **Rekognition impl**: `DetectModerationLabelsCommand` with `Image:{ S3Object:{ Bucket, Name: pendingKey } }`, `MinConfidence` from config. `safe = ModerationLabels.length === 0`.
  - **Mock impl** (dev/tests): safe unless the original filename contains `unsafe` (lets us exercise the reject path locally).
  - Selected by `MODERATION_DRIVER`.

`worker.ts`:
- `enqueue(photoId)` → `setImmediate(() => processPhoto(photoId))` so scanning happens after the HTTP response.
- `processPhoto(id)`: atomically claim (`updateMany where id, processingStartedAt null/stale → set now`); scan; apply CLEAN/UNSAFE/ERROR transitions from the flow above; always clears/sets the claim.
- `startSweeper()`: `setInterval` (~30s) selects a bounded batch of `PENDING`/`FAILED` rows with null/stale `processingStartedAt` and processes them with limited concurrency. Started after `app.listen`. This is the restart-safety net.

---

## 4. Endpoints — `apps/api/src/server.ts`

Register `@fastify/multipart` (limits: 1 file, ~10MB, mime allowlist `image/jpeg|png|webp`) and `@fastify/rate-limit` (applied to public upload).

- **Public upload (visitor):** `POST /v/:publicToken/photos` (no auth, rate-limited per IP). Resolve `QrCard.publicToken` → `vehicleEntryId`; enforce per-vehicle cap (count PENDING+APPROVED); next `sortOrder`; `storage.putPending` → insert row `PENDING` → `enqueue(id)` → `202 { id, status:"PENDING" }`. Provenance `uploadedBy = voterKey`.
- **Staff upload:** `POST /registrations/:id/photos` (`requireStaff`). Same pipeline (also moderated, for consistency).
- **Public vehicle read:** `GET /v/:publicToken` (no auth) → vehicle summary + photos filtered to `moderationStatus = APPROVED` only. Never exposes `pending/` keys. (This is the minimal read surface needed to *test* the pipeline; it is not a UI.)
- **Staff reads:** extend the existing registration includes (the `photos` include near server.ts:191 and the `/registrations/:id` include) so the API response carries `moderationStatus`/`url`. (Response-shape only — no UI work in this phase.)

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

## 6. Local dev (no AWS needed) — `docker-compose.yml`

- Add `minio` service (S3-compatible) + a one-shot `mc` init container that creates the bucket. API talks to it via `S3_ENDPOINT=http://localhost:9000`, `forcePathStyle`.
- Dev env: `MODERATION_DRIVER=mock`, so the full pipeline (upload → scan → approve/reject → move/delete → public read) runs locally with no AWS account. `publicUrl` returns a presigned MinIO GET in dev.

---

## 7. Env vars — `.env.example` (and document in README)

Add: `AWS_REGION`, `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (from Terraform outputs; standard SDK credential-chain names), `S3_BUCKET`, `S3_ENDPOINT` (dev/MinIO only), `CDN_BASE_URL` (CloudFront domain), `MODERATION_DRIVER` (`rekognition|mock`), `MODERATION_MIN_CONFIDENCE` (e.g. `60`), `PHOTO_MAX_BYTES`, `PHOTO_PER_VEHICLE_CAP`.

---

## Files to create / modify

Create: `infra/terraform/{versions,variables,s3,cloudfront,iam,outputs}.tf`, `infra/terraform/terraform.tfvars.example`, `infra/README.md`; `apps/api/src/config.ts`; `apps/api/src/media/{storage,moderator,worker}.ts`.
Modify: `packages/db/prisma/schema.prisma` (+ new migration), `packages/db/prisma/seed.ts`, `apps/api/src/server.ts`, `apps/api/package.json`, `docker-compose.yml`, `.env.example`, `.gitignore`, `README.md`.

## Verification (local, end-to-end, no AWS, no frontend)

All via `curl`/HTTP against the running API:

1. `docker compose up -d postgres minio`; create bucket; `npm run db:migrate && npm run db:seed`; start API with `MODERATION_DRIVER=mock`, MinIO endpoint.
2. **Happy path:** `POST /v/:token/photos` with a clean JPEG → `202 PENDING`. Immediately `GET /v/:token` → photo **absent**. After the worker runs → row `APPROVED`, object now under `public/`, `pending/` object gone, `GET /v/:token` returns it with a `url`.
3. **Reject path:** upload a file named `*unsafe*.jpg` → after processing, the DB row is gone and the S3 object is deleted; never public. (Confirm via DB query + MinIO listing.)
4. **Restart safety:** kill the API while a row is `PENDING`; on restart the sweeper claims and processes it.
5. **Caps/limits:** oversized file and >cap uploads are rejected with 4xx; rate-limit triggers on burst.
6. **IaC:** `terraform init && terraform validate && terraform plan` (config correctness; real `apply` needs AWS creds). Confirm bucket blocks public access and only CloudFront OAC can read `public/*`.

## Out of scope / follow-ups (deferred to a later phase)

- **Web/UI integration** — visitor & owner upload screens, the `VehiclePhoto` shared-type change in `packages/carshow-components`, the `apps/admin-web/src/api.ts` multipart upload helper, and any admin moderation views. The backend returns the new fields, but no frontend consumes them yet.
- Visitor & owner apps themselves, Planning Center auth, S3 remote Terraform backend, signed-cookie CloudFront (unneeded — approved images are public by design).
