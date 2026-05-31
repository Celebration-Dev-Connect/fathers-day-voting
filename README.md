# Father's Day Car Show Voting

Production-slice implementation for the Celebration Church Father's Day Car Show admin tablet registration flow.

## Local Proxmox Dry Run

1. Copy `.env.example` to `.env` and adjust values if needed.
2. Start Postgres:
   ```sh
   docker compose up -d postgres
   ```
3. Install dependencies:
   ```sh
   npm install
   ```
4. Generate Prisma client, migrate, and seed:
   ```sh
   npm run db:generate
   npm run db:migrate
   npm run db:seed
   ```
5. Run API and web locally:
   ```sh
   npm run dev:api
   npm run dev:web
   ```

For a VM-style dry run, `docker compose up --build` starts Postgres, the Fastify API, and the built tablet admin app.

## Dev Login Accounts

The seed creates local-only dev accounts:

- `admin@carshow.local` - admin
- `registrar1@carshow.local` - registrar
- `registrar2@carshow.local` - registrar

Dev login is blocked when `NODE_ENV=production`.

## Photo Upload + Moderation

User-uploaded vehicle photos are moderated before they are ever public. A fresh upload is stored and marked `PENDING`; an async in-process worker scans it (AWS Rekognition in prod, a mock scanner in dev). Clean images become `APPROVED` and publicly viewable; unsafe ones are deleted from storage and the database immediately. Public endpoints only ever return `APPROVED` photos. The worker also runs a periodic sweeper so a restart never leaves an image unscanned.

Storage and scanning are pluggable interfaces selected by env:

- `STORAGE_DRIVER=local` (filesystem, dev) or `s3` (prod).
- `MODERATION_DRIVER=mock` (dev) or `rekognition` (prod).

Local dev needs no AWS — `STORAGE_DRIVER=local` + `MODERATION_DRIVER=mock` runs the whole pipeline on disk under `apps/api/var/media/`. The mock scanner rejects any upload whose bytes contain the ASCII marker `unsafe`, so the reject path is testable locally.

Endpoints:

- `POST /v/:publicToken/photos` — public visitor upload (multipart, rate-limited). Returns `202 { id, status: "PENDING" }`.
- `POST /registrations/:id/photos` — staff upload (authenticated).
- `GET /v/:publicToken` — public vehicle read; returns only `APPROVED` photos.

### AWS infrastructure

The S3 bucket, CloudFront distribution, and IAM user are provisioned with Terraform — see [`infra/README.md`](infra/README.md).
