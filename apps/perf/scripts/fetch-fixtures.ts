/**
 * Fetches real IDs from the running API and DB, then writes them to
 * fixtures/seed-data.json. Run this before any Artillery scenario.
 *
 * Local mode (default):
 *   - API running at TARGET_URL (for category slugs and vehicle IDs)
 *   - DATABASE_URL set (for QR public tokens, which aren't in the public API)
 *
 * Remote mode (set PERF_JWT):
 *   - API running at TARGET_URL with ENABLE_DEV_LOGIN=true
 *   - PERF_JWT set to a valid staff JWT (obtain via POST /auth/dev-login)
 *   - All DB work is done server-side via GET /internal/perf-fixtures
 *   - DATABASE_URL is not required — used when RDS is in a private subnet
 *
 * In a seeded dev environment, QR cards aren't linked to vehicles until
 * a registrar scans them at check-in. This script (or the server-side
 * endpoint in remote mode) links unassigned QR cards to checked-in vehicles
 * as part of perf test setup so the upload and browse-by-token paths have
 * real data to exercise.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TARGET_URL = process.env.TARGET_URL ?? 'http://localhost:4000';
const PERF_JWT = process.env.PERF_JWT;

const outPath = join(__dirname, '..', 'fixtures', 'seed-data.json');

async function fetchRemote() {
  console.log(`Fetching fixtures via API (remote mode) from ${TARGET_URL} …`);
  const res = await fetch(`${TARGET_URL}/internal/perf-fixtures`, {
    headers: { Authorization: `Bearer ${PERF_JWT}` },
  });
  if (!res.ok) {
    throw new Error(`GET /internal/perf-fixtures → ${res.status} ${await res.text()}`);
  }
  const fixtures = await res.json() as {
    slugs: string[];
    vehicleIds: string[];
    entryNumbers: number[];
    tokens: string[];
  };

  if (fixtures.tokens.length === 0) {
    throw new Error('No QR tokens returned. Ensure db:seed has run and vehicles are checked in.');
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(fixtures, null, 2));
  console.log(
    `✓ Fixtures written to ${outPath}\n` +
    `  ${fixtures.slugs.length} categories, ${fixtures.vehicleIds.length} vehicles, ` +
    `${fixtures.tokens.length} QR tokens, ${fixtures.entryNumbers.length} entry numbers`
  );
}

async function fetchLocal() {
  const { prisma } = await import('@carshow/db');

  async function get<T>(path: string): Promise<T> {
    const res = await fetch(`${TARGET_URL}${path}`);
    if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  type EventResponse = { categories: Array<{ slug: string; name: string }> };
  type EntriesResponse = { entries: Array<{ id: string; entryNumber: number }> };

  console.log(`Fetching fixtures from ${TARGET_URL} …`);

  const event = await get<EventResponse>('/public/event');
  const slugs = event.categories.map((c) => c.slug);

  if (slugs.length === 0) {
    throw new Error('No active categories returned from /public/event. Is the DB seeded?');
  }

  const vehicleIds: string[] = [];
  const entryNumbers: number[] = [];

  for (const slug of slugs) {
    const data = await get<EntriesResponse>(`/public/categories/${slug}/entries?page=1`);
    for (const entry of data.entries) {
      vehicleIds.push(entry.id);
      if (entry.entryNumber) entryNumbers.push(entry.entryNumber);
    }
  }

  if (vehicleIds.length === 0) {
    throw new Error('No checked-in vehicles found. Ensure db:seed has run and vehicles are checked in.');
  }

  const linked = await prisma.qrCard.count({ where: { vehicleEntryId: { not: null } } });
  if (linked < vehicleIds.length) {
    // In a fresh seeded dev env, QR cards exist but aren't assigned to vehicles
    // (that's the registrar's job). Assign unlinked cards to vehicles so the
    // upload and QR-token browse paths have real data to hit during load tests.
    const unlinked = await prisma.qrCard.findMany({
      where: { vehicleEntryId: null },
      select: { id: true },
      take: vehicleIds.length - linked,
    });
    const needed = vehicleIds.slice(linked);
    await Promise.all(
      unlinked.map((card, i) =>
        prisma.qrCard.update({ where: { id: card.id }, data: { vehicleEntryId: needed[i] } })
      )
    );
    console.log(`  Linked ${unlinked.length} QR cards to vehicles (${linked + unlinked.length} total linked)`);
  }

  // QR public tokens aren't exposed through the public API — query the DB.
  const qrCards = await prisma.qrCard.findMany({
    where: { vehicleEntry: { status: 'CHECKED_IN' } },
    select: { publicToken: true },
    take: 100,
  });
  await prisma.$disconnect();

  const tokens = qrCards.map((q) => q.publicToken);
  if (tokens.length === 0) {
    throw new Error('Still no linked QR cards after setup. This is unexpected.');
  }

  const fixtures = { slugs, vehicleIds, tokens, entryNumbers };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(fixtures, null, 2));
  console.log(
    `✓ Fixtures written to ${outPath}\n` +
    `  ${slugs.length} categories, ${vehicleIds.length} vehicles, ` +
    `${tokens.length} QR tokens, ${entryNumbers.length} entry numbers`
  );
}

const main = PERF_JWT ? fetchRemote : fetchLocal;
main().catch((err) => {
  console.error('fetch-fixtures failed:', err.message);
  process.exit(1);
});
