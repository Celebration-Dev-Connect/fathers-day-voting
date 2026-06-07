/**
 * Orchestrates the full performance test suite:
 *   1. Fetch fixtures from the running API
 *   2. Run browse, vote, and upload scenarios
 *   3. Generate an HTML report for each
 *
 * Usage:
 *   TARGET_URL=http://localhost:4000 npm run perf --workspace @carshow/perf
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const TARGET_URL = process.env.TARGET_URL ?? 'http://localhost:4000';

function run(label: string, cmd: string) {
  console.log(`\n── ${label} ─────────────────────────────`);
  console.log(`$ ${cmd}\n`);
  execSync(cmd, { stdio: 'inherit', cwd: ROOT });
}

async function checkApiUp() {
  try {
    const res = await fetch(`${TARGET_URL}/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err: any) {
    console.error(`\n✗ API not reachable at ${TARGET_URL}/health — ${err.message}`);
    console.error('  Start the API first: npm run dev:api (from repo root)\n');
    process.exit(1);
  }
}

mkdirSync(join(ROOT, 'reports'), { recursive: true });

await checkApiUp();
console.log(`✓ API is up at ${TARGET_URL}`);

run('Fetch fixtures', `tsx --env-file-if-exists=../../.env scripts/fetch-fixtures.ts`);

// Artillery is hoisted to the repo root node_modules by npm workspaces.
const artilleryBin = join(ROOT, '..', '..', 'node_modules', '.bin', 'artillery');
const target = `--target "${TARGET_URL}"`;

const scenarios = [
  { name: 'Browse', yml: 'artillery/browse.yml', out: 'reports/browse.json' },
  { name: 'Vote',   yml: 'artillery/vote.yml',   out: 'reports/vote.json' },
  { name: 'Upload', yml: 'artillery/upload.yml', out: 'reports/upload.json' },
];

for (const s of scenarios) {
  run(`${s.name} scenario`, `"${artilleryBin}" run ${target} --output ${s.out} ${s.yml}`);
}

console.log('\n── Generating HTML reports ──────────────────');
for (const s of scenarios) {
  if (existsSync(join(ROOT, s.out))) {
    run(`Report: ${s.name}`, `"${artilleryBin}" report ${s.out}`);
  }
}

console.log('\n✓ All scenarios complete. Open reports/*.html to review results.');
console.log('\nPost-run checklist:');
console.log('  • Browse p99 should be flat during the sustained phase (no tail growth)');
console.log('  • Vote scenario: 5xx rate must be 0%');
console.log('  • Check DB connections: SELECT count(*) FROM pg_stat_activity');
console.log('  • Check for failed photos: SELECT count(*) FROM "VehiclePhoto" WHERE "moderationStatus" = \'FAILED\'');
