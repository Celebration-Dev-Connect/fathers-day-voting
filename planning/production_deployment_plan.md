# Production Deployment Plan

**Event:** Father's Day Car Show — Celebration Edmonton  
**Event date:** Sunday, June 21, 2026  
**Target go-live:** June 7, 2026 (test event day)  
**Production domain:** `carshow.celebrationedmonton.com`  
**AWS region:** `ca-central-1` (Calgary — closest to Edmonton)

---

## URL structure

All traffic enters through a single domain via a single CloudFront distribution. Path-based routing directs requests to the correct origin.

| Path | Destination |
|---|---|
| `carshow.celebrationedmonton.com/` | public-web SPA (visitor voting) |
| `carshow.celebrationedmonton.com/admin*` | admin-web SPA (staff) |
| `carshow.celebrationedmonton.com/photos/*` | S3 photo delivery |
| `carshow.celebrationedmonton.com/api/*` | App Runner (Fastify API) |

---

## Architecture overview

```
carshow.celebrationedmonton.com
  │
  └─ Route 53 → CloudFront (single distribution, path-based behaviors)
                    │
                    ├─ /api/*  ──────────────────────► App Runner (Fastify)
                    │           CloudFront Function         │
                    │           strips /api prefix          │ VPC connector
                    │                               ┌───────▼────────────┐
                    │                               │  VPC               │
                    ├─ /admin*  ─────────────────►  │  Private subnets   │
                    │           OAC                 │  RDS PostgreSQL     │
                    │           S3 admin-web-prod   └────────────────────┘
                    │
                    ├─ /photos/*  ───────────────► S3 carshow-photos-prod
                    │             OAC                /public/ prefix only
                    │
                    └─ /* (default)  ────────────► S3 public-web-prod
                                     OAC
```

---

## VPC

A dedicated VPC isolates the database from the public internet. App Runner connects into it via a VPC connector. S3, Rekognition, and Secrets Manager are reached through VPC endpoints — no NAT gateway or internet gateway required inside the VPC.

```
VPC CIDR:     10.0.0.0/16
Region:       ca-central-1

Subnets:
  Private A   10.0.1.0/24   ca-central-1a   RDS, VPC connector
  Private B   10.0.2.0/24   ca-central-1b   RDS required standby subnet
```

### VPC endpoints

| Endpoint | Type | Purpose |
|---|---|---|
| `com.amazonaws.ca-central-1.s3` | Gateway | App Runner → S3 |
| `com.amazonaws.ca-central-1.secretsmanager` | Interface | App Runner → JWT secret / DB URL |
| `com.amazonaws.ca-central-1.rekognition` | Interface | App Runner → photo moderation |

### Security groups

**`sg-rds`** — RDS instance  
- Inbound: 5432 from `sg-apprunner-connector` only  
- Outbound: none

**`sg-apprunner-connector`** — App Runner VPC connector  
- Outbound: 5432 to `sg-rds`  
- Outbound: 443 to `sg-vpc-endpoints`

**`sg-vpc-endpoints`** — Interface VPC endpoints  
- Inbound: 443 from `sg-apprunner-connector`

---

## CloudFront distribution

Single distribution with four cache behaviors evaluated in priority order.

### Origins

| Origin ID | Type | Target |
|---|---|---|
| `origin-api` | Custom (HTTPS) | App Runner default URL (e.g. `abc123.ca-central-1.awsapprunner.com`) |
| `origin-admin` | S3 OAC | `carshow-admin-web-prod` bucket |
| `origin-photos` | S3 OAC | `carshow-photos-prod` bucket, origin path `/public` |
| `origin-public` | S3 OAC | `carshow-public-web-prod` bucket |

The App Runner URL is internal. CloudFront is the only public entry point for the API.

### Cache behaviors

| Priority | Path pattern | Origin | CF Function | Caching |
|---|---|---|---|---|
| 1 | `/api/*` | `origin-api` | `fn-strip-api-prefix` (viewer request) | Disabled — all API responses uncached |
| 2 | `/admin*` | `origin-admin` | `fn-spa-routing` (viewer request) | Enabled — static assets only |
| 3 | `/photos/*` | `origin-photos` | None | Enabled — immutable keys, long TTL |
| 4 | `/*` (default) | `origin-public` | `fn-spa-routing` (viewer request) | Enabled — static assets only |

**API behavior** must forward `Authorization`, `Content-Type`, and all query strings to App Runner. Cache policy: `CachingDisabled`. Origin request policy: forward all headers and query strings.

### CloudFront Functions

**`fn-strip-api-prefix`** — attached to `/api/*` behavior, viewer request  
Rewrites the URI before forwarding to App Runner so the API receives requests at `/` rather than `/api/`:

```js
function handler(event) {
  var request = event.request;
  request.uri = request.uri.replace(/^\/api/, '') || '/';
  return request;
}
```

**`fn-spa-routing`** — attached to `/admin*` and `/*` behaviors, viewer request  
Rewrites paths with no file extension to the SPA entry point for that app, enabling client-side routing:

```js
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  if (!uri.includes('.')) {
    if (uri.startsWith('/admin')) {
      request.uri = '/admin/index.html';
    } else {
      request.uri = '/index.html';
    }
  }

  return request;
}
```

### Certificate

ACM certificate in `us-east-1` (required by CloudFront regardless of app region):  
`carshow.celebrationedmonton.com` — single domain, DNS validated via Route 53.

---

## Services

### App Runner — API

```
Source:         ECR image (apps/api/Dockerfile)
CPU:            1 vCPU
Memory:         2 GB
Min instances:  1          ← never scale to zero on event day
Max instances:  3
Port:           4000
Health check:   GET /health  (add this lightweight route to the API)
VPC connector:  attached (reaches RDS in private subnet)
IAM role:       apprunner-instance-role
Custom domain:  none — accessed exclusively through CloudFront /api/*
```

The App Runner service URL (`.awsapprunner.com`) is not published. All API access goes through CloudFront. CORS on the API can be locked to `carshow.celebrationedmonton.com` only.

### RDS — PostgreSQL

```
Engine:         PostgreSQL 16
Instance class: db.t3.micro
Storage:        20 GB gp3
Multi-AZ:       No (single event; cost not justified)
Backup:         1-day automated backup retention
Public access:  No
Subnet group:   Private A + Private B
Security group: sg-rds
```

### S3 buckets

| Bucket | Contents | Notes |
|---|---|---|
| `carshow-public-web-prod` | public-web SPA build output | Private, OAC only |
| `carshow-admin-web-prod` | admin-web SPA build output | Private, OAC only |
| `carshow-photos-prod` | uploaded vehicle photos | Private, two prefixes (see below) |

Photo bucket prefixes:
```
pending/<id>   upload landing zone — never served
public/<id>    CloudFront /photos/* serves this prefix only
```

Photo lifecycle rule: expire `pending/` objects after 48 hours (cleans up stalled moderation jobs).

### ECR

```
Repository:  carshow/api
Lifecycle:   keep last 5 images
Tagging:     commit SHA (never use :latest in production)
```

### Secrets Manager

```
Secret name: carshow/prod/api
Keys:
  JWT_SECRET      random 256-bit hex, generated at bootstrap
  DATABASE_URL    full PostgreSQL connection string with password
```

App Runner injects these as environment variables at container startup. The RDS password is generated by Terraform's `random_password` resource and written directly to this secret — it never appears in Terraform state in plaintext.

### DNS

DNS is managed outside AWS. One record is needed in the external registrar:

```
carshow.celebrationedmonton.com   CNAME → <CloudFront distribution domain>
                                  e.g. d1234abcd.cloudfront.net
```

Set TTL to 60 seconds before go-live so changes propagate quickly if needed.

The CloudFront distribution domain is available as a Terraform output after `terraform apply`.

---

## IAM roles and policies

### `apprunner-instance-role`

Grants least-privilege access to the AWS services the API uses at runtime:

```
s3:PutObject        arn:aws:s3:::carshow-photos-prod/pending/*
s3:GetObject        arn:aws:s3:::carshow-photos-prod/pending/*
s3:CopyObject       arn:aws:s3:::carshow-photos-prod/*
s3:DeleteObject     arn:aws:s3:::carshow-photos-prod/*

rekognition:DetectModerationLabels   *

secretsmanager:GetSecretValue   arn:aws:secretsmanager:ca-central-1:<account>:secret:carshow/prod/api-*
```

### `apprunner-access-role`

Service-level role that allows the App Runner control plane to pull images from ECR. Separate from the instance role — this is an App Runner requirement.

---

## Environment variables

### App Runner (API)

| Variable | Value |
|---|---|
| `DATABASE_URL` | injected from Secrets Manager |
| `JWT_SECRET` | injected from Secrets Manager |
| `API_PORT` | `4000` |
| `API_HOST` | `0.0.0.0` |
| `NODE_ENV` | `production` |
| `AWS_REGION` | `ca-central-1` |
| `S3_BUCKET` | `carshow-photos-prod` |
| `CDN_BASE_URL` | `https://carshow.celebrationedmonton.com/photos` |
| `MODERATION_DRIVER` | `rekognition` |

### SPA build-time (Vite)

| Variable | public-web | admin-web |
|---|---|---|
| `VITE_API_URL` | `https://carshow.celebrationedmonton.com/api` | `https://carshow.celebrationedmonton.com/api` |
| `VITE_PUBLIC_BASE_PATH` | `/` | `/admin` |

---

## Terraform structure (`infra/terraform/`)

```
infra/terraform/
  main.tf             — provider config, S3 backend for Terraform state
  variables.tf        — region, domain, AWS account ID
  outputs.tf          — CloudFront domain, App Runner URL, RDS endpoint
  modules/
    vpc/              — VPC, subnets, security groups, VPC endpoints
    rds/              — subnet group, parameter group, db instance
    ecr/              — repository, lifecycle policy
    app-runner/       — service, instance role, access role, VPC connector
    s3-photos/        — photo bucket, CORS, lifecycle rule, OAC + bucket policy
    s3-spas/          — admin-web and public-web buckets, OAC + bucket policies
    cloudfront/       — single distribution, all behaviors, CF Functions, ACM cert
    secrets/          — Secrets Manager secret, random_password for RDS
```

Terraform state is stored in `carshow-tf-state` (S3 bucket with versioning, created manually once, not managed by Terraform).

---

## Deployment

### API

1. Build Docker image from `apps/api/Dockerfile`, tag with git commit SHA
2. Push to ECR (`carshow/api:<sha>`)
3. Run migrations (see below)
4. Update App Runner service to deploy the new image tag
5. App Runner performs a rolling update with zero downtime

### SPAs

```bash
# public-web
npm run build --workspace apps/public-web  # with production Vite env
aws s3 sync apps/public-web/dist/ s3://carshow-public-web-prod/ --delete
aws cloudfront create-invalidation --distribution-id <id> --paths "/index.html"

# admin-web
npm run build --workspace apps/admin-web   # with production Vite env
aws s3 sync apps/admin-web/dist/ s3://carshow-admin-web-prod/ --delete
aws cloudfront create-invalidation --distribution-id <id> --paths "/admin/index.html"
```

Static assets (JS/CSS with hashed filenames) do not need invalidation — only the entry point `index.html` files do.

### Database migrations

Migrations run before the new App Runner image goes live. Access RDS via SSM Session Manager port-forwarding — no bastion host required:

```bash
# Terminal 1: open tunnel to RDS
aws ssm start-session \
  --target <ssm-managed-instance-id> \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{"host":["<rds-endpoint>"],"portNumber":["5432"],"localPortNumber":["5432"]}'

# Terminal 2: run migrations through the tunnel
DATABASE_URL="postgresql://carshow:<pass>@localhost:5432/carshow" \
  npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
```

Never run `db:seed` against production.

---

## Cost estimate (event day — 24 hours)

| Service | Config | Cost |
|---|---|---|
| App Runner | 1 vCPU / 2 GB / min 1 instance / 24h | $1.88 |
| RDS db.t3.micro | 24h + 20 GB gp3 | $0.48 |
| VPC Interface endpoints | 2 endpoints × 24h × $0.01/hr | $0.48 |
| S3 photos | 200 GB storage + 20k PUT requests | $4.71 |
| Rekognition | 20,000 images × $0.001 | $19.00 |
| CloudFront photos egress | ~30 GB @ $0.085/GB | $2.55 |
| CloudFront SPA egress | negligible | $0.01 |
| CloudFront Functions | ~50k invocations, well within free tier | $0.00 |
| ECR storage | < 1 GB | $0.10 |
| Secrets Manager | 1 secret | $0.01 |
| **Total** | | **~$29.22** |

> **Cost reduction:** Resize uploads to ≤2 MB in the upload handler before `PutObject` (sharp). Drops S3 + CloudFront photo costs from $7.26 → $1.45, saving ~$5.80.

> **Free tier:** On a new AWS account (first 12 months), App Runner compute, RDS db.t3.micro, and the first 1k Rekognition images are free. Effective cost drops to **~$8.22**.

---

## Pre-event checklist

**2 weeks before (June 7 test event):**
- [ ] Confirm DNS access for `celebrationedmonton.com` with Celebration (needed to add CNAME and validate ACM certificate)
- [ ] `terraform apply` — provision all infrastructure
- [ ] Add ACM DNS validation CNAME record in external registrar (Terraform outputs the required name/value)
- [ ] Push first API image to ECR; deploy App Runner service
- [ ] Run migrations against RDS; confirm schema
- [ ] Deploy both SPAs to S3; confirm CloudFront behaviors route correctly
- [ ] Verify `/`, `/admin`, `/api/health`, and `/photos/<id>` all resolve correctly on the single domain
- [ ] End-to-end smoke test on a real mobile device: QR scan → vote
- [ ] Test photo upload → Rekognition pending → approved → visible at `/photos/<id>`
- [ ] Test staff login at `/admin`

**June 21 (event day):**
- [ ] Verify App Runner min instances = 1 before doors open
- [ ] Take manual RDS snapshot before doors open
- [ ] Monitor App Runner request count and latency during voting cutoff surge
- [ ] After awards: set App Runner min instances = 0 to stop idle cost
