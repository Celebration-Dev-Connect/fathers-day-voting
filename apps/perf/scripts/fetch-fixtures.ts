/**
 * Fetches real IDs from the running API and DB, then writes them to
 * fixtures/seed-data.json. Run this before any Artillery scenario.
 *
 * Requires:
 *   - API running at TARGET_URL (for category slugs and vehicle IDs)
 *   - DATABASE_URL set (for QR public tokens, which aren't in the public API)
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '@carshow/db';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TARGET_URL = process.env.TARGET_URL ?? 'http://localhost:4000';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${TARGET_URL}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

type EventResponse = {
  categories: Array<{ slug: string; name: string }>;
};

type EntriesResponse = {
  entries: Array<{ id: string; entryNumber: number }>;
};

async function main() {
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

  // QR public tokens aren't exposed through the public API. Query the DB
  // directly so browse and upload tests can exercise the /v/:token paths.
  const qrCards = await prisma.qrCard.findMany({
    where: { vehicleEntry: { status: 'CHECKED_IN' } },
    select: { publicToken: true },
    take: 100,
  });
  await prisma.$disconnect();

  const tokens = qrCards.map((q) => q.publicToken);

  if (tokens.length === 0) {
    throw new Error('No QR cards found for checked-in vehicles. Ensure db:seed has run.');
  }

  const fixtures = { slugs, vehicleIds, tokens, entryNumbers };
  const outPath = join(__dirname, '..', 'fixtures', 'seed-data.json');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(fixtures, null, 2));

  console.log(
    `✓ Fixtures written to ${outPath}\n` +
    `  ${slugs.length} categories, ${vehicleIds.length} vehicles, ` +
    `${tokens.length} QR tokens, ${entryNumbers.length} entry numbers`
  );
}

main().catch((err) => {
  console.error('fetch-fixtures failed:', err.message);
  process.exit(1);
});
