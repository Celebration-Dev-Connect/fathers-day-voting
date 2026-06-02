# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Father's Day Car Show 2026 event management system for Celebration Church. Covers vehicle registration, QR-card check-in, people's choice voting, judge scoring, and a public visitor portal with photo upload + moderation.

## Repository Structure

npm workspaces monorepo:

- `apps/api` — Fastify 5 API (`@carshow/api`)
- `apps/admin-web` — Staff/registrar tablet app (`@carshow/admin-web`)
- `apps/judge-web` — Judge scoring app (`@carshow/judge-web`)
- `apps/public-web` — Public visitor portal with voting + photo upload (`@carshow/public-web`)
- `packages/db` — Prisma client + migrations (`@carshow/db`)
- `packages/carshow-components` — Shared React component library (`@carshow/carshow-components`)

## Development Commands

```sh
# Local dev (separate terminals)
npm install
docker compose up -d postgres
npm run db:generate && npm run db:migrate && npm run db:seed

npm run dev:api        # API on :4000
npm run dev:web        # Admin SPA on :3000
npm run dev:judge      # Judge SPA
npm run dev:public     # Public SPA on :3001
npm run dev:all        # All four concurrently

# Build
npm run build:components   # must run before any SPA build
npm run build              # full build (components → db → all SPAs → API)

# Type checking
npm run typecheck

# Tests (Node built-in runner, no jest/vitest)
npm test --workspace @carshow/api

# Database
npm run db:generate    # regenerate Prisma client after schema change
npm run db:migrate     # apply pending migrations (dev)
npm run db:seed        # seed demo data
```

The shared component library must be built (`npm run build:components`) before running or building any of the three SPAs — they import from the compiled `dist/`.

## Architecture

### API (`apps/api`)

Fastify 5 with Zod validation. All config is validated at startup via Zod in `apps/api/src/config.ts`. The event ID is hard-coded as `event-2026-fathers-day` in that file.

Route files in `apps/api/src/routes/` register on the Fastify instance. Auth helpers are in `apps/api/src/auth.ts` — `requireStaff` / `requireAdmin` / `requireJudge` verify JWT and return the staff record.

Public visitor access uses a per-vehicle `publicToken` in the URL (no auth). Staff use JWT Bearer tokens.

### Photo Pipeline

Uploads → `PENDING` → async worker scans → `APPROVED` (publicly visible) or deleted. The worker is started in `apps/api/src/server.ts` and runs a periodic sweeper.

Storage and moderation are pluggable:
- `STORAGE_DRIVER=local` (dev) writes to `apps/api/var/media/`; `s3` writes to S3.
- `MODERATION_DRIVER=mock` (dev) rejects any file whose bytes contain `unsafe`; `rekognition` uses AWS.

Local dev needs no AWS credentials.

### Frontend SPAs

All three SPAs (admin, judge, public) are React 19 + Vite + TypeScript. They consume `@carshow/carshow-components` for shared UI. Vite base path and API URL are injected at build time via `VITE_PUBLIC_BASE_PATH` and `VITE_API_URL`.

### Database

Prisma + PostgreSQL. Schema lives in `packages/db/prisma/schema.prisma`. After any schema change: `npm run db:generate` to update the client, then `npm run db:migrate`.

## Environment Variables

Copy `.env.example` to `.env` for local dev. Key vars:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Required in prod; has dev default |
| `STORAGE_DRIVER` | `local` (dev) or `s3` (prod) |
| `MODERATION_DRIVER` | `mock` (dev) or `rekognition` (prod) |
| `ENABLE_DEV_LOGIN` | Overrides prod check for test stacks |

## Dev Login Accounts (seed only)

- `admin@carshow.local` — admin
- `registrar1@carshow.local` — registrar
- `registrar2@carshow.local` — registrar

Dev login is blocked when `NODE_ENV=production` unless `ENABLE_DEV_LOGIN=true`.

## AWS Deployment (`infra/deploy.sh`)

Two environments — `test` and `prod` — each in its own Terraform workspace with isolated state.

When helping with AWS deploys, prefer the repository script over hand-running
Terraform/app deploy steps. Do not expose or commit AWS keys, secrets, tfvars,
state files, or `.env` values. If credentials are needed locally, use the AWS
profile named `carshow`.

**Local AWS setup checklist:**

```sh
# Tools required on PATH
aws --version
terraform version

# Configure credentials from private local values only; never paste them into git.
aws configure --profile carshow
# Default region: ca-central-1
# Default output format: json

# Validate identity before any Terraform or deploy action.
aws sts get-caller-identity --profile carshow
```

Before deploying AWS changes, make sure the relevant PR/state-sync branch has
been merged and `main` is current locally. Pull/fetch latest before initializing
or applying infrastructure so local code and Terraform state do not diverge.

**Terraform state sanity check:**

```sh
cd infra/terraform
terraform init
terraform workspace select test
terraform state list
```

`terraform state list` should show existing resources for the selected
workspace. If it is empty or surprising, stop and ask before applying.

**Prerequisites:**
1. Copy `infra/terraform/test.tfvars.example` → `infra/terraform/test.tfvars` (or `prod.tfvars`) and fill in values.
2. AWS credentials available via env vars, `--profile`, or SSO.
3. Tools on PATH: `aws`, `terraform`, `docker`, `npm`, `git`.

**Common operations:**

```sh
# First-time or routine deploy (builds image, applies infra, syncs SPAs)
./infra/deploy.sh --env test --profile carshow

# Preview what would change
./infra/deploy.sh --env test --profile carshow --plan

# Apply reviewed changes to AWS test
./infra/deploy.sh --env test --profile carshow

# Re-deploy only SPAs (after a frontend change, no image rebuild)
./infra/deploy.sh --env test --profile carshow --skip-infra --skip-image

# Tear down the test stack
./infra/deploy.sh --env test --profile carshow --destroy

# Stop compute between sessions (saves ~$35/mo; keeps CloudFront/ACM/Route53)
./infra/deploy.sh --env test --profile carshow --suspend
./infra/deploy.sh --env test --profile carshow --resume
```

**Deploy flow (full deploy):**
1. Terraform `init` + workspace select/create
2. Ensure ECR repo exists (`-target=aws_ecr_repository.api`)
3. Build API Docker image for `linux/amd64` (required even on Apple Silicon)
4. Push to ECR; tag defaults to git short SHA
5. `terraform apply` full stack
6. Build each SPA with correct env vars, sync to S3, invalidate CloudFront

**First-time prod DNS:** After first apply, run `terraform -chdir=infra/terraform output acm_validation_records` to get ACM validation records, then add the CloudFront alias from `terraform output cloudfront_domain`.

**After seeding test:** Set `run_seed = false` in `test.tfvars` to stop re-seeding on every deploy.

### Infrastructure layout (Terraform)

ECS Fargate API → ALB → CloudFront. Three S3 buckets (public-web, admin-web, judge-web) served behind the same CloudFront distribution under `/`, `/admin`, `/judge` behaviors. RDS PostgreSQL. ECR for the API image. Secrets Manager for `DATABASE_URL` and `JWT_SECRET`. Region: `ca-central-1` by default.

Admin and judge SPAs use a separate `<env>.html` fallback file (`admin.html`, `judge.html`) in their S3 buckets to avoid CloudFront cache key collisions with `/index.html`.
