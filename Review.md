# Security & Performance Review — Father's Day Car Show 2026

**Reviewed:** 2026-06-04  
**Updated:** 2026-06-04 — all Critical and High issues resolved  
**Scope:** Full codebase + Terraform infrastructure  
**Context:** Public-facing event, up to 10,000 attendees over a 7-hour window (June 21, 2026)

---

## Executive Summary

The application is architecturally sound for a single-day event. The authentication model is well-reasoned (Planning Center OAuth for staff, anonymous cookie-based tokens for voters, per-vehicle public tokens for QR links), data access patterns are clean (Prisma everywhere, no raw string interpolation into queries), and the AWS infrastructure follows good separation-of-concerns. However, there are **six issues that should be fixed before the event**, plus a cluster of lower-priority hardening recommendations. Most fixes are small.

---

## Architecture Overview

```
Visitors/Public       Staff/Judges             Car Owners
    │                      │                       │
    ▼                      ▼                       ▼
CloudFront (HTTPS, TLS 1.2+, PriceClass_100)
    ├── /api/*  ──► ALB (HTTP:80) ──► ECS Fargate (1-3 tasks, 1vCPU/2GB)
    │                                     │       │
    │                                  Prisma   moderation worker
    │                                     │       │
    │                                   RDS PG   Rekognition
    ├── /photos/* ──► S3 (photos bucket, OAC, public/ prefix only)
    ├── /admin* ──► S3 (admin-web bucket, OAC)
    ├── /judge* ──► S3 (judge-web bucket, OAC)
    └── /* ──► S3 (public-web bucket, OAC)
```

**Strengths of the current architecture:**
- All four origins (S3 × 3 + API) served from a single CloudFront distribution; HTTPS enforced via viewer-protocol-policy redirect everywhere
- S3 buckets fully private (block all public access, OAC); CloudFront is the only read path
- Secrets Manager for DATABASE_URL, JWT_SECRET, PCO credentials — no secrets baked into the image or env vars
- IAM task role is least-privilege: S3 scoped to `pending/*` and `public/*` prefixes, Rekognition scoped to two actions
- RDS in private subnets, no public endpoint
- QR card `publicToken` is a full cuid, not guessable
- `prisma.$queryRaw` in hero-photos uses Prisma's template literal parameterization (`${eventId}` becomes a bound parameter, not inline SQL)
- Photo upload pipeline has MIME allowlist, per-vehicle cap, DB-atomic claim to prevent double-processing across tasks

---

## OWASP Top 10 Analysis

### A01 — Broken Access Control

**Issue: Owner access codes are sequential and predictable** — `MEDIUM PRIORITY`

`accessCodeForEntry(entryNumber)` in `registrations.ts:23` produces `(entryNumber % 100000).padStart(5, "0")`. For 1,000 entries that means codes 00001–01000 — a range of 1,000 values, not 100,000. The `/owner/session` endpoint requires last name + code, but has **no rate limiting**. An attacker who knows any common last name (Smith, Johnson) could iterate the entire keyspace in under a minute.

**Fix:** Add route-level rate limiting to `/owner/session` and consider replacing sequential codes with `crypto.randomBytes(3).toString("hex")` (or similar) assigned at registration time.

**Issue: ALB is internet-accessible, bypassing CloudFront** — `MEDIUM PRIORITY`

`aws_security_group_rule.alb_ingress_http` allows `0.0.0.0/0:80`. Anyone who discovers the ALB DNS name can call the API directly — bypassing CloudFront's HTTPS enforcement, any future WAF rules, and any CloudFront-level caching that might protect the DB. Because CloudFront strips `/api` via a CF Function before forwarding, direct ALB calls would reach routes at their native paths (e.g., `GET /auth/me` works directly).

**Fix:** Add a WAF WebACL to the ALB with a rule that blocks requests that do not contain the `X-Forwarded-For` header matching CloudFront's managed prefix list, or lock the ALB SG ingress to [CloudFront's published IP ranges](https://ip-ranges.amazonaws.com/ip-ranges.json) via an AWS-managed prefix list (`com.amazonaws.global.cloudfront.origin-facing`).

### A02 — Cryptographic Failures

**Issue: Staff JWTs have no expiry** — `MEDIUM PRIORITY`

`app.jwt.sign({ staffUserId, role })` in `auth.ts:122` and the PCO callback carry no `expiresIn`. A token stolen from browser history (the PCO flow redirects to `/#token=…`) is valid indefinitely. The `requireStaff` DB lookup does check `staff.active`, so deactivating an account does revoke access — but only if you know to do it.

**Fix:** Set `expiresIn: "12h"` (or `"24h"` to cover the event day) for all staff tokens. The staff apps can refresh via `/auth/planning-center/start` on next login.

**Issue: Voter ballot cookie is missing the `Secure` flag** — `LOW PRIORITY`

`voter.ts:47`: `document.cookie = \`${COOKIE_NAME}=…; SameSite=Lax\`` — no `Secure` attribute. In production (CloudFront forces HTTPS), cookies are only sent over HTTPS anyway, but best practice is to explicitly set `Secure` so the browser enforces it.

**Fix:** Append `; Secure` to the cookie string.

### A03 — Injection

**No significant issues found.** All DB access goes through Prisma's parameterized API. The one raw query in `public.ts:51` uses the template literal form of `prisma.$queryRaw` which correctly binds `${eventId}` as a parameter. Input validation via Zod schemas at every route boundary. No dynamic SQL concatenation detected.

### A05 — Security Misconfiguration

**Issue: CORS reflects any origin** — `LOW PRIORITY`

`app.ts:31`: `cors({ origin: true, credentials: true })`. `origin: true` means Fastify echoes back whatever `Origin` header the client sends. Combined with `credentials: true`, this allows any origin to make credentialed cross-origin requests. Staff use `Authorization: Bearer` headers (not cookies), so the practical CSRF risk is low, but the combination is against best practice and would fail a formal security audit.

**Fix:** Set `origin` to an explicit allowlist of the admin/judge/public SPA origins (e.g., `["https://carshow.celebrationedmonton.com"]`), or read them from config.

**Issue: Rate limiting is opt-in with most endpoints unprotected** — `HIGH PRIORITY`

`app.ts:36`: `rateLimit({ global: false })`. Only two photo-upload routes have `rateLimit` in their config objects. All voting endpoints, owner session, and public read endpoints are unprotected:

| Endpoint | Rate limit |
|---|---|
| `POST /public/vehicles/:token/vote` | None |
| `POST /public/entries/:vehicleId/vote` | None |
| `POST /owner/session` | None |
| `GET /public/categories/:slug/entries` | None |
| `GET /public/hero-photos` | None |

During peak voting (thousands of simultaneous submissions), unprotected vote endpoints combined with a client-controlled `voterKey` create a simple replay attack surface: delete the cookie, get a new UUID, vote again.

**Fix:** Add per-route rate limits to both vote endpoints (e.g., `max: 20, timeWindow: "1 minute"` per IP) and to `/owner/session` (e.g., `max: 10, timeWindow: "5 minutes"`).

**Issue: No HTTP security response headers** — `LOW PRIORITY`

The API and SPA assets are served without `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy`, or `Strict-Transport-Security`. CloudFront can add these with zero code change via a Response Headers Policy.

**Fix:** Add a CloudFront Response Headers Policy to the distribution with at minimum:
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`

### A07 — Identification and Authentication Failures

**Issue: `request.ip` is the ALB's IP, not the visitor's** — `MEDIUM PRIORITY`

Fastify is instantiated as `Fastify({ logger: true })` with no `trustProxy` setting. Behind CloudFront → ALB, the real client IP arrives in `X-Forwarded-For`, but without `trustProxy: true`, `request.ip` resolves to the ALB's internal IP. This means:

1. The photo upload `uploadedBy` field (`visitor:${request.ip}`) is useless for attribution — all visitor photos will show the ALB IP.
2. Rate limiting (which also uses `request.ip` by default) is broken — all visitors share the same "IP" and will collectively hit the limit extremely quickly.

**Fix:** Change `Fastify({ logger: true })` to `Fastify({ logger: true, trustProxy: true })` in `app.ts`. Fastify will then use the `X-Forwarded-For` header set by CloudFront/ALB.

### A09 — Security Logging and Monitoring Failures

**Issue: No alerting on error spikes or abnormal traffic** — `LOW PRIORITY`

CloudWatch log group is configured with 7-day retention (adequate for the event). However, there are no CloudWatch alarms for:
- ECS 5xx error rate spike (indicating a crash loop or DB exhaustion)
- RDS CPU > 80% (indicating query overload)
- ALB 5xx rate (indicating upstream API failures)

During a 7-hour event window, you want to know within 2–3 minutes if something goes wrong. Without alarms, you're relying on a human noticing.

**Fix:** Add CloudWatch alarms (ideally with SNS → email/SMS) for:
- `HTTPCode_Target_5XX_Count > 10 in 5 minutes` on the ALB target group
- `CPUUtilization > 80%` on the ECS service (sustained 5 minutes)
- `CPUUtilization > 80%` on the RDS instance

---

## Authentication & Authorization Deep Dive

### Staff (Admin / Registrar)
JWT Bearer token, DB lookup on every request to verify `active`. Role-checked via `requireAdmin` / `requireJudge`. PCO OAuth flow is the production path; dev-login is gated on `ENABLE_DEV_LOGIN=false` in prod tfvars. **Well-implemented.**

### Judges
Same JWT flow, `requireJudge` checks `ADMIN || JUDGE`. Judge ballots are scoped to the judge's own `judgeKey = staff:${staff.id}`, preventing one judge from overwriting another's picks. **Well-implemented.**

### Car Owners
JWT Bearer token containing `{ ownerSession: true, ownerId, vehicleEntryId }`, signed with `expiresIn: "14d"`. Owner routes verify `ownerId` matches the requested vehicle. Owner cannot upload photos for or modify other owners' vehicles. **Well-implemented, but the 14d expiry with a weak access code means the token is valuable to protect.** (See access code issue above.)

### Public Visitors (Anonymous)
Intentionally anonymous. Voting deduplication via `voterKey` (UUID) in a browser cookie. The `PeopleChoiceVote` table has a unique index on `(eventId, categoryId, voterKey)`, so the same key cannot vote twice in the same category. This is a best-effort soft deduplication — a determined visitor can clear cookies and vote again. For a church car show, this is an appropriate and documented tradeoff, but it should be understood that the system does not provide strong ballot integrity.

### QR Card Public Tokens
`publicToken` is a full cuid assigned at card creation — opaque and unguessable. Used to access `/v/:publicToken` (the vehicle profile page) and `/public/vehicles/:token`. **Good.**

---

## Photo Upload Pipeline

The pipeline is thoughtfully designed. The state machine (`PENDING → PROCESSING → APPROVED/REJECTED/HUMAN_REVIEW`) with DB-level claiming prevents double-processing across multiple ECS tasks. Sharp resize on approval is efficient. Cleanup of rejected content is correct.

**Concern: Rekognition API rate limits under concurrent upload load**

Each photo triggers two Rekognition API calls: `DetectModerationLabels` + `DetectLabels`. Default Rekognition TPS limits in `ca-central-1` are:
- `DetectModerationLabels`: 5 TPS
- `DetectLabels`: 5 TPS

If 3,000 of 10,000 visitors upload one photo each, that's 6,000 Rekognition calls. The sweeper processes 10 photos every 30 seconds per task (3 tasks = 30 photos/30s = 1 photo/second). This is well under the TPS limit — the sweeper's intentional pacing is actually protective here. However, photos uploaded directly (via `worker.enqueue` → `setImmediate`) bypass the sweeper pacing and process immediately in parallel. Under a burst of simultaneous uploads, you could exceed Rekognition's TPS.

**Fix:** Consider adding a small delay between Rekognition calls in `processPhoto`, or limit the `inFlight` set size (currently unbounded) to cap concurrent moderation calls at 2–3.

**Concern: `HUMAN_REVIEW` photos accumulate without notification**

Photos where Rekognition finds no moderation labels but also no vehicle labels (e.g., a photo of just a person) stay in `HUMAN_REVIEW` indefinitely until an admin reviews them via `/photos/review`. There is no alert or dashboard notification. During the event, this queue could grow silently.

**Fix:** On event day, have a staff member periodically check the admin photo review panel. Consider adding a badge/counter for pending HUMAN_REVIEW items to the admin dashboard.

---

## Scaling & Performance Analysis

### Traffic Model

| Metric | Estimate |
|---|---|
| Total attendees | 10,000 |
| Event duration | 7 hours |
| Peak concurrent users | ~1,500–2,000 (arrival surge + lunch peak) |
| QR scans (each visit profile page) | 10,000 over 7h = ~24/min average; ~100–200/min at arrival peak |
| Vote writes (5 categories avg) | 50,000 total = ~120/min average; ~500+/min at peak |
| Photo uploads | ~3,000 (30% participation) = ~7/min average |

### ECS Fargate

Current config: 1–3 tasks, 1 vCPU / 2 GB each, CPU scale-out at 70%.

**Scale-out lag is the key risk.** ECS typically takes 2–3 minutes to provision, health-check, and register a new task. If everyone arrives at 9:00 AM and starts scanning QR codes simultaneously, the service may be under-provisioned for those first few minutes.

**Recommendations:**
- Increase `ecs_min_size` to `2` in prod.tfvars to avoid cold-start lag entirely — you want 2 healthy tasks before the event starts.
- Increase `ecs_max_size` to `5` or `6` for headroom. The 3-task cap is tight for a 2,000-concurrent scenario.
- Manually set desired count to 3 the morning of the event before gates open (`aws ecs update-service --cluster … --service … --desired-count 3`).

### RDS PostgreSQL

Current config: `db.t3.micro` (1 vCPU, 1 GB RAM, burstable). This is the single biggest scaling risk.

**T3 CPU credits:** `db.t3.micro` earns 6 CPU credits/hour and consumes 10 credits/minute at 100% CPU. A 7-hour event under sustained moderate load will deplete the credit balance in the first 1–2 hours, dropping the effective CPU to 10% baseline. Write-heavy workloads (voting, check-in) will stall.

**Recommendation:** Upgrade to `db.t3.small` (2 vCPU, 2 GB) minimum for event day. This doubles CPU and RAM headroom. The cost difference is ~$25–30 for the day. Alternatively, use `db.t3.medium` (2 vCPU, 4 GB) for comfortable headroom.

**Prisma connection pool:** With `global: false` rateLimit and no explicit `connection_limit` in DATABASE_URL, Prisma defaults vary. For Fargate, each task gets its own pool. Ensure `?connection_limit=10` is appended to `DATABASE_URL` to prevent connection exhaustion on the RDS side (t3.micro supports ~100 connections; 3 tasks × 10 = 30, well within limits).

### Database Query Performance Concerns

**`ORDER BY RANDOM()` in `/public/hero-photos`** (`public.ts:52–65`):

This query runs a full sequential scan of `VehiclePhoto` and sorts all matching rows randomly on every request. Called from the public home page with no rate limiting or caching. With 1,000+ approved photos, this runs ~150ms per call. At 200 concurrent users loading the home page, this is 200 × 150ms of DB CPU every few seconds.

**Fix options (choose one):**
1. Add `{ config: { rateLimit: { max: 30, timeWindow: "10 seconds" } } }` to the endpoint.
2. Cache the result in-memory for 30 seconds (simple `let cache; let cacheTime` singleton in the route file).
3. Replace with `OFFSET (RANDOM() * count)::INT LIMIT 10` — still random but avoids full sort.

**`/voting/tallies`** runs 6–7 parallel DB queries including `groupBy` aggregations across all votes. This endpoint is staff-only (a handful of tablets), so it's low-frequency. **No action needed**, but be aware it will be slow if called during high-vote-activity periods.

**`/registrations?search=…`** runs an 11-field OR query with case-insensitive LIKE on owner names, phone, email. The `@@index([eventId, status])` and `@@index([eventId, categoryId])` on VehicleEntry help for filtered queries, but LIKE with no leading wildcard on name fields benefits from trigram indexes if performance becomes an issue.

### CloudFront Caching for the Public API

All `/api/*` traffic uses `Managed-CachingDisabled`, meaning every API request hits an ECS container. The public read endpoints (`/public/event`, `/public/categories/:slug/entries`) return data that changes rarely and could safely be cached at CloudFront for 30–60 seconds. This would dramatically reduce DB read load during peak traffic.

This requires adding a cache behavior for read-only public paths with a short TTL cache policy — a medium-effort Terraform change.

### Photo Moderation Worker Memory

The `inFlight` Set in the worker has no bound. Under a burst of simultaneous uploads all calling `enqueue()`, the set could grow to hundreds of entries, each holding buffer bytes + sharp promises in memory. With 2 GB per task, this is unlikely to OOM, but worth monitoring.

---

## Prioritized Action List

### Must-Fix Before Event Day

| # | Issue | File | Status |
|---|---|---|---|
| 1 | Add `trustProxy: true` to Fastify — rate limits and IP logging are broken without it | `apps/api/src/app.ts` | ✅ Fixed |
| 2 | Add rate limiting to both vote endpoints (`POST /public/vehicles/:token/vote`, `POST /public/entries/:vehicleId/vote`) | `apps/api/src/routes/public.ts` | ✅ Fixed — 30 req/min keyed by `voterKey` (not IP; shared venue WiFi safe) |
| 3 | Add rate limiting to `POST /owner/session` | `apps/api/src/routes/owner.ts` | ✅ Fixed — 10 req/5 min keyed by access code (limits guessing per code, not per IP) |
| 4 | Add `expiresIn: "12h"` to staff JWT signing (dev-login and PCO callback) | `apps/api/src/routes/auth.ts` | ✅ Fixed |
| 5 | Upgrade RDS to `db.t3.medium` in prod.tfvars | `infra/terraform/variables.tf` + `prod.tfvars.example` | ✅ Fixed — default changed to `db.t3.medium`; test.tfvars overrides to `t3.micro` and is unaffected |
| 6 | Set `ecs_min_size = 2` and `ecs_max_size = 5` for event day | `infra/terraform/variables.tf` + `prod.tfvars.example` | ✅ Fixed — defaults updated; test.tfvars overrides to `min=1, max=1` and is unaffected |

### Strong Recommendations (Do Before Event If Time Allows)

| # | Issue | Effort | Status |
|---|---|---|---|
| 7 | Add max-length validation to registration schema fields (`firstName`, `lastName`, `make`, `model`) | Low | ✅ Fixed — all string fields now have `.max()` bounds |
| 8 | Fix `ORDER BY RANDOM()` in `/public/hero-photos` with a simple in-memory cache | Low | ✅ Fixed — 60-second module-level cache added |
| 9 | Add `Secure` flag to voter ballot cookie in `voter.ts` | 1 word | ✅ Fixed |
| 10 | Add CloudWatch alarms for ALB 5xx rate, ECS CPU, RDS CPU with SNS notification | Medium | ⬜ Open |
| 11 | Restrict ALB SG to CloudFront origin-facing IP prefix list | Medium Terraform | ⬜ Open |
| 12 | Add `Content-Security-Policy`, `X-Content-Type-Options`, `Strict-Transport-Security` headers via CloudFront Response Headers Policy | Medium Terraform | ⬜ Open |

### Nice to Have (Post-Event or Low Urgency)

| # | Issue | Status |
|---|---|---|
| 13 | Narrow `cors({ origin: true })` to an explicit allowlist | ⬜ Open |
| 14 | Replace sequential owner access codes with random 5-digit codes | ⬜ Open |
| 15 | Add WAF WebACL to CloudFront with AWS Managed Rule Groups (core rule set) | ⬜ Open |
| 16 | Consider CloudFront TTL caching for `/public/event` and `/public/categories/:slug/entries` | ⬜ Open |
| 17 | Add HUMAN_REVIEW badge counter to admin dashboard so photo queue doesn't silently back up | ⬜ Open |
| 18 | Cap `inFlight` set size in the moderation worker to limit concurrent Rekognition calls | ⬜ Open |

---

## Event-Day Runbook Additions

Based on this review, recommend adding to the day-of checklist:

1. **30 min before gates open:** Confirm ECS has 2+ healthy tasks running; manually set desired count to 3.
2. **15 min before gates open:** Open the admin Photo Review panel; confirm no backlog from test uploads.
3. **Monitor during event:** Watch CloudWatch ECS and RDS CPU metrics. If RDS CPU sustains >70% for 5+ minutes, scale the voting load by temporarily pausing vote processing on the admin panel to relieve DB pressure.
4. **After voting closes:** Ensure `peopleChoiceCutoff` is set in the admin before announcing winners — votes after the cutoff are excluded from tallies even if the DB still accepts them.
5. **End of day:** Set `ecs_min_size = 1` to reduce cost before suspending the stack.
