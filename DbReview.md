# Database Review — Indexes & Query Optimization

**Reviewed:** 2026-06-04  
**Updated:** 2026-06-04 — all Critical and High issues resolved  
**Schema version:** 15 migrations applied (migration `20260604120000_perf_indexes` added)  
**Scale assumption:** ~1,000 vehicle entries, ~10,000 `PeopleChoiceVote` rows, ~3,000 `VehiclePhoto` rows

---

## Complete Index Inventory

The table below lists every index that currently exists across all migrations, what it serves, and its verdict.

| Table | Index | Type | Serves | Verdict |
|---|---|---|---|---|
| StaffUser | `id` | PK | all lookups | ✓ |
| StaffUser | `email` | UNIQUE | dev login | ✓ |
| StaffUser | `planningCenterId` | UNIQUE | PCO upsert | ✓ |
| Category | `id` | PK | FK resolution | ✓ |
| Category | `(eventId, slug)` | UNIQUE | category lookup by slug | ✓ |
| Owner | `id` | PK | FK resolution | ✓ |
| VehicleEntry | `id` | PK | all lookups | ✓ |
| VehicleEntry | `(eventId, entryNumber)` | UNIQUE | `nextEntryNumber`, public entry lookup | ✓ |
| VehicleEntry | `(eventId, ownerAccessCode)` | UNIQUE | owner session auth | ✓ |
| VehicleEntry | `primaryPhotoId` | UNIQUE | FK integrity | ✓ |
| VehicleEntry | `(eventId, status)` | INDEX | check-in count, metrics | ✓ |
| VehicleEntry | `(eventId, categoryId)` | INDEX | FK resolution, category queries | ✓ partial — missing `status` and `entryNumber` |
| VehicleEntry | `ownerId` | INDEX | owner vehicle list | ✓ |
| QrCard | `id` | PK | all lookups | ✓ |
| QrCard | `publicToken` | UNIQUE | QR scan, voter token | ✓ |
| QrCard | `vehicleEntryId` | UNIQUE | FK, one-card-per-vehicle | ✓ |
| QrCard | `(eventId, visibleCode)` | UNIQUE | QR assign lookup | ✓ |
| QrCard | `(eventId, status)` | INDEX | QR card list | ✓ |
| QrAssignmentAuditLog | `id` | PK | — | ✓ |
| QrAssignmentAuditLog | `(eventId, qrCardId)` | INDEX | audit lookup | ✓ |
| QrAssignmentAuditLog | `(eventId, vehicleEntryId)` | INDEX | audit lookup | ✓ |
| PeopleChoiceVote | `id` | PK | — | ✓ |
| PeopleChoiceVote | `(eventId, categoryId, voterKey)` | UNIQUE | duplicate-vote prevention | ✓ |
| PeopleChoiceVote | `(eventId, vehicleEntryId)` | INDEX | tally lookup | ✓ |
| PeopleChoiceVote | `(eventId, createdAt)` | INDEX | cutoff-filtered tally | ✓ |
| JudgeCategoryPick | `id` | PK | — | ✓ |
| JudgeCategoryPick | `(eventId, categoryId, judgeKey, rank)` | UNIQUE | ballot write | ✓ |
| JudgeCategoryPick | `(eventId, categoryId, judgeKey, vehicleEntryId)` | UNIQUE | ballot write | ✓ |
| JudgeCategoryPick | `(eventId, categoryId)` | INDEX | ballot read, tally | ✓ |
| JudgeCategoryPick | `(eventId, vehicleEntryId)` | INDEX | vehicle picks lookup | ✓ |
| CategoryWinnerOverride | `id` | PK | — | ✓ |
| CategoryWinnerOverride | `(eventId, categoryId, rank)` | UNIQUE | override write | ✓ |
| CategoryWinnerOverride | `(eventId, categoryId)` | INDEX | tally read | ✓ |
| VehiclePhoto | `id` | PK | all lookups | ✓ |
| VehiclePhoto | `(vehicleEntryId, sortOrder)` | UNIQUE | sort-order integrity | ✓ |
| VehiclePhoto | `vehicleEntryId` | INDEX | photo list per vehicle | ✓ partial — missing `moderationStatus` |
| VehiclePhoto | `moderationStatus` | INDEX | moderation worker sweep | ✓ partial — missing `processingStartedAt` |
| VehiclePhoto | `source` | INDEX | — (not queried in isolation) | redundant |
| SpecialAward | `id` | PK | — | ✓ |
| SpecialAward | `(eventId, name)` | UNIQUE | admin create | ✓ |
| SpecialAward | `(eventId, active)` | INDEX | active award list | ✓ |
| SpecialAwardVote | `id` | PK | — | ✓ |
| SpecialAwardVote | `(eventId, specialAwardId, voterKey)` | UNIQUE | duplicate-vote prevention | ✓ |
| SpecialAwardVote | `(eventId, specialAwardId)` | INDEX | tally groupBy | ✓ |
| SpecialAwardVote | `(eventId, vehicleEntryId)` | INDEX | vehicle vote lookup | ✓ |

---

## Missing Indexes — Ordered by Impact

### 1. `VehicleEntry(eventId, categoryId, status, entryNumber)` — CRITICAL ✅ Fixed

**Affects:** `/public/categories/:slug/entries` — the most frequently called API endpoint during the event. Every visitor who browses a category page hits this.

**Current query (public.ts:229–239):**
```ts
const where = { eventId, categoryId: category.id, status: VehicleStatus.CHECKED_IN };
const [total, vehicles] = await Promise.all([
  prisma.vehicleEntry.count({ where }),
  prisma.vehicleEntry.findMany({
    where,
    orderBy: { entryNumber: "asc" },
    skip: (query.page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  }),
]);
```

**What the planner does today:** Uses the `(eventId, categoryId)` index to find all vehicles in the category (potentially 100–200 rows for a popular category), then re-filters each row for `status = CHECKED_IN`, then sorts the survivors by `entryNumber`. That means the sort happens in-memory with no index support.

**With `(eventId, categoryId, status, entryNumber)`:** The planner can seek directly to `(eventId, categoryId, CHECKED_IN)` and read rows in pre-sorted `entryNumber` order. The `COUNT` and `LIMIT/OFFSET` can both use the index. No heap fetch needed for count, no in-memory sort.

The same index also accelerates:
- `judging/categories/:categoryId/vehicles` (judging.ts:116–127) — same 3-column filter plus `entryNumber` order
- `voting/judge-completion` count subquery (`_count: { select: { vehicleEntries: { where: { status: CHECKED_IN } } } }`)

**The existing `(eventId, categoryId)` index should be kept** — Prisma and PostgreSQL use it for FK constraint resolution (fast path when inserting VehicleEntry to verify the category exists). The new 4-column index is additive.

---

### 2. `VehiclePhoto(vehicleEntryId, moderationStatus, sortOrder)` — HIGH ✅ Fixed

**Affects:** Every public vehicle page load (`/public/vehicles/:token`, `/public/entries/:entryNumber`, `/public/categories/:slug/entries`). Photos are always included via:
```ts
photos: { where: { moderationStatus: "APPROVED" }, orderBy: { sortOrder: "asc" } }
```

**What the planner does today:** Uses the `vehicleEntryId` index to find all photos for the vehicle, then filters each row for `moderationStatus = "APPROVED"`, then sorts by `sortOrder`. For a vehicle with 10 uploaded photos (2 approved, 8 rejected/pending), this fetches 10 rows and discards 8.

**With `(vehicleEntryId, moderationStatus, sortOrder)`:** The planner seeks to `(vehicleEntryId, "APPROVED")` and reads rows in pre-sorted `sortOrder` order. Discards zero rows.

Also benefits:
- `createPendingPhoto` cap check (photos.ts:38): `count({ where: { vehicleEntryId, moderationStatus: { in: [4 values] } } })` — the compound index covers this with a range scan.
- `photos.ts:300–312` and `photos.ts:362–375`: primary-photo replacement queries that filter by `vehicleEntryId + moderationStatus + url not null`.

The existing `vehicleEntryId` single-column index becomes redundant (the compound index subsumes it), but Prisma will not automatically remove the old one — leave it or drop it; at 3,000 rows the difference is negligible.

---

### 3. `VehiclePhoto(moderationStatus, processingStartedAt)` — MEDIUM ✅ Fixed

**Affects:** The moderation worker sweeper that runs every 30 seconds (worker.ts:147–158).

**Sweep query:**
```ts
prisma.vehiclePhoto.findMany({
  where: {
    OR: [
      { moderationStatus: "PENDING", processingStartedAt: null },
      { moderationStatus: "PROCESSING", processingStartedAt: { lt: staleBefore } },
      { moderationStatus: "FAILED", processingStartedAt: { lt: staleBefore } },
    ],
  },
  select: { id: true },
  take: 10,
})
```

**What the planner does today:** Uses the `moderationStatus` index to find rows with status PENDING/PROCESSING/FAILED, then inspects `processingStartedAt` for each. Under normal operation, very few rows match (most photos settle to APPROVED/REJECTED quickly), so this is fast in practice. But during a burst upload scenario — 100 photos uploaded simultaneously — all 100 are PENDING and the sweeper has 100 rows to consider.

**With `(moderationStatus, processingStartedAt)`:** The index covers both the status and the timestamp filter. Rows come out pre-ordered, so `LIMIT 10` terminates the scan early. The `null` comparison (`processingStartedAt: null`) is still a filter, but it applies to the already-narrow status bucket.

---

### 4. `PeopleChoiceVote(voterKey, eventId)` — LOW/OPTIONAL

**Affects:** The existing unique index `(eventId, categoryId, voterKey)` already covers all vote lookups efficiently. No additional index is needed here. Listed to confirm the analysis is complete.

---

## Query Problems (No Index Will Fix These)

### Problem 1: `ORDER BY RANDOM()` in `/public/hero-photos` — HIGH IMPACT ✅ Fixed

**Location:** `apps/api/src/routes/public.ts:51–65`

```sql
ORDER BY RANDOM()
LIMIT 10
```

`ORDER BY RANDOM()` forces PostgreSQL to:
1. Materialise every row matching the WHERE clause (approved photos at sortOrder = 1 for checked-in vehicles — potentially 300–500 rows)
2. Assign a random float to each
3. Sort the full result set
4. Return the top 10

This is a full-sort of hundreds of rows on every public home page load, with no possibility of index support. At 2,000 concurrent users loading the home page, this runs hundreds of times per minute with sustained DB CPU cost.

**Fix A — Application-level cache (recommended, ~5 lines of code):**

Add a module-level cache in `public.ts`:

```ts
let heroCache: { photos: unknown[]; cachedAt: number } | null = null;
const HERO_CACHE_TTL_MS = 60_000; // 60 seconds

app.get("/public/hero-photos", async () => {
  if (heroCache && Date.now() - heroCache.cachedAt < HERO_CACHE_TTL_MS) {
    return { photos: heroCache.photos };
  }
  const photos = await prisma.$queryRaw<...>`...ORDER BY RANDOM() LIMIT 10`;
  heroCache = { photos, cachedAt: Date.now() };
  return { photos };
});
```

60 seconds is indistinguishable to users. The `ORDER BY RANDOM()` runs at most once per minute regardless of concurrent load.

**Fix B — Random-offset approach (eliminates the full sort):**

```sql
SELECT p.url, p."altText", e.year, e.make, e.model, e.nickname
FROM "VehiclePhoto" p
JOIN "VehicleEntry" e ON e.id = p."vehicleEntryId"
WHERE e."eventId" = ${eventId}
  AND e.status = 'CHECKED_IN'
  AND p."moderationStatus" = 'APPROVED'
  AND p.url IS NOT NULL
  AND p."sortOrder" = 1
  AND p.id >= (
    SELECT id FROM "VehiclePhoto"
    WHERE "moderationStatus" = 'APPROVED'
    ORDER BY id
    OFFSET (FLOOR(RANDOM() * (
      SELECT COUNT(*) FROM "VehiclePhoto"
      JOIN "VehicleEntry" e2 ON e2.id = "vehicleEntryId"
      WHERE e2."eventId" = ${eventId} AND e2.status = 'CHECKED_IN'
      AND "moderationStatus" = 'APPROVED' AND "sortOrder" = 1
    )))::int
    LIMIT 1
  )
LIMIT 10
```

More complex, but removes the full materialization + sort. Fix A is simpler and sufficient.

---

### Problem 2: `votingRegistrationInclude` fetches all photos for every judge-visible vehicle — MEDIUM IMPACT ✅ Fixed

**Location:** `apps/api/src/services/votingTally.ts:3–8`

```ts
export const votingRegistrationInclude = {
  owner: true,
  category: true,
  qrCard: true,
  photos: { orderBy: { sortOrder: "asc" as const } },  // ← no where clause
};
```

This include is used in:
- `GET /judging/categories/:categoryId/vehicles` — returns all vehicles in a category with all their photos (including PENDING, REJECTED)
- `GET /voting/tallies` — loads every vehicle that received any vote, with all their photos
- `GET /judging/categories/:categoryId/ballot` — loads 10 picked vehicles with all their photos

**Impact:** In the judge vehicle list, if a category has 50 vehicles and each has 5 photos (including rejected), that's 250 photo rows fetched and serialised, of which only ~100 are APPROVED and actually displayed. In `/voting/tallies`, it loads all voted vehicles (potentially 500) × photos.

**Fix:** Add a `moderationStatus` filter to the photos include in the voting tally context:

```ts
export const votingRegistrationInclude = {
  owner: true,
  category: true,
  qrCard: true,
  photos: {
    where: { moderationStatus: "APPROVED" },   // ← add this
    orderBy: { sortOrder: "asc" as const },
  },
};
```

The tradeoff: the admin photo-review endpoint also uses this include (via the registration list) and legitimately needs to see non-approved photos. Check whether `votingRegistrationInclude` is used there — it is used in `voting.ts` (tallies, judge-completion, winner override) and `judging.ts`. The `registrations.ts` routes define their own inline includes. So adding the filter is safe.

---

### Problem 3: Metrics endpoint runs 6 parallel DB queries — LOW IMPACT (staff only)

**Location:** `apps/api/src/routes/registrations.ts:52–70`

The metrics endpoint runs six `COUNT` queries in parallel. On `db.t3.micro`, parallel queries compete for the same limited CPU credit budget. Under high voting load, this can produce slow responses on the admin dashboard.

The most expensive of the six:
```ts
prisma.vehiclePhoto.count({
  where: { vehicleEntry: { eventId }, moderationStatus: "APPROVED" },
})
```
This requires a JOIN to VehicleEntry to filter by eventId — it can't use the `moderationStatus` index alone because VehiclePhoto has no `eventId` column.

**Fix A:** Add `eventId` to `VehiclePhoto` (schema change, migration needed). For a single-event system this is low priority.

**Fix B:** Since there is only one event, skip the eventId filter for photo counts — all photos belong to the same event anyway:
```ts
// Before
prisma.vehiclePhoto.count({
  where: { vehicleEntry: { eventId }, moderationStatus: "APPROVED" }
})
// After (safe for single-event system)
prisma.vehiclePhoto.count({
  where: { moderationStatus: "APPROVED" }
})
```
Uses the `moderationStatus` index directly with no join. Faster and simpler.

---

### Problem 4: NULL voterKey allows silent duplicate votes — SCHEMA NOTE

**Location:** `PeopleChoiceVote.voterKey` (nullable), `SpecialAwardVote.voterKey` (nullable)

PostgreSQL unique constraints treat `NULL ≠ NULL`. The unique index `(eventId, categoryId, voterKey)` does **not** prevent two rows with the same `(eventId, categoryId)` and `voterKey = NULL`. In practice, the client always generates a UUID (voter.ts:53 calls `crypto.randomUUID()`), so `NULL` is never sent intentionally. But the schema allows it, and a crafted API call omitting `voterKey` entirely — the Zod schema in `public.ts:144` requires `voterKey: z.string().trim().min(1)` so it cannot be null in practice. Low risk, but the schema and application layer are not aligned.

**Fix (optional, belt-and-suspenders):** Add a check constraint at the DB level:
```sql
ALTER TABLE "PeopleChoiceVote" ADD CONSTRAINT chk_voter_key_not_empty
  CHECK ("voterKey" IS NOT NULL AND LENGTH("voterKey") > 0);
```

---

## Redundant Indexes

### `VehiclePhoto.source` index ✅ Dropped

```sql
CREATE INDEX "VehiclePhoto_source_idx" ON "VehiclePhoto"("source");
```

No query in the codebase filters VehiclePhoto by `source` alone. The photo review endpoint filter is by `moderationStatus`, not `source`. `source` is only returned as a display field. This index consumes write overhead on every photo insert with no read benefit.

**Recommendation:** Drop this index. If a future analytics query needs it, it can be re-added.

---

## Recommended Migration

Create a new Prisma migration with the following SQL. Add the Prisma schema `@@index` annotations alongside to keep schema and migrations in sync.

**New migration file:** `packages/db/prisma/migrations/20260604_perf_indexes/migration.sql`

```sql
-- INDEX 1: Public category listing — covers eventId + categoryId + status + order
-- Replaces the planner's need to filter `status` post-index and sort in memory.
CREATE INDEX "VehicleEntry_eventId_categoryId_status_entryNumber_idx"
  ON "VehicleEntry"("eventId", "categoryId", "status", "entryNumber");

-- INDEX 2: Photo fetching per vehicle — covers moderationStatus filter + sort order
-- Eliminates post-filter on rejected/pending photos when fetching approved photos.
CREATE INDEX "VehiclePhoto_vehicleEntryId_moderationStatus_sortOrder_idx"
  ON "VehiclePhoto"("vehicleEntryId", "moderationStatus", "sortOrder");

-- INDEX 3: Moderation worker sweep — covers status + timestamp for stale-row reclaim
CREATE INDEX "VehiclePhoto_moderationStatus_processingStartedAt_idx"
  ON "VehiclePhoto"("moderationStatus", "processingStartedAt");

-- DROP redundant index (no query uses source alone)
DROP INDEX "VehiclePhoto_source_idx";
```

**Corresponding Prisma schema changes** in `packages/db/prisma/schema.prisma`:

```prisma
model VehicleEntry {
  // ... existing fields ...
  @@index([eventId, status])                              // existing — keep
  @@index([eventId, categoryId])                          // existing — keep (FK resolution)
  @@index([eventId, categoryId, status, entryNumber])     // NEW
  @@index([ownerId])                                      // existing — keep
}

model VehiclePhoto {
  // ... existing fields ...
  @@unique([vehicleEntryId, sortOrder])                   // existing — keep
  @@index([vehicleEntryId])                               // existing — keep (backward compat)
  @@index([vehicleEntryId, moderationStatus, sortOrder])  // NEW
  @@index([moderationStatus])                             // existing — keep
  @@index([moderationStatus, processingStartedAt])        // NEW
  // @@index([source])  ← REMOVE
}
```

After making schema changes: `npm run db:generate && npm run db:migrate`.

---

## Summary Table

| Finding | Table | Priority | Type | Status |
|---|---|---|---|---|
| Missing `(eventId, categoryId, status, entryNumber)` | VehicleEntry | **Critical** | Index | ✅ Added in migration `20260604120000_perf_indexes` |
| Missing `(vehicleEntryId, moderationStatus, sortOrder)` | VehiclePhoto | **High** | Index | ✅ Added in migration `20260604120000_perf_indexes` |
| `ORDER BY RANDOM()` in hero-photos | N/A | **High** | Query | ✅ 60-second module-level cache added in `public.ts` |
| `votingRegistrationInclude` fetches non-approved photos | VehiclePhoto | **Medium** | Query | ✅ `where: { moderationStatus: "APPROVED" }` added |
| Missing `(moderationStatus, processingStartedAt)` | VehiclePhoto | **Medium** | Index | ✅ Added in migration `20260604120000_perf_indexes` |
| Redundant `source` index | VehiclePhoto | **Low** | Index | ✅ Dropped in migration `20260604120000_perf_indexes` |
| Photo count in metrics uses eventId JOIN | VehiclePhoto | **Low** | Query | ⬜ Open |
| NULL voterKey not prevented at DB level | PeopleChoiceVote, SpecialAwardVote | **Low** | Schema | ⬜ Open |
