/**
 * Exports all database tables as a gzipped JSON snapshot and uploads to S3.
 * Run via the ECS task entrypoint: docker-entrypoint.sh export-data
 *
 * Required env vars (all already present in the ECS task definition):
 *   DATABASE_URL  — Postgres connection string (via Secrets Manager)
 *   S3_BUCKET     — Photos/backups bucket name
 *   AWS_REGION    — AWS region (default ca-central-1)
 *
 * The output lands at s3://${S3_BUCKET}/backups/data-export-YYYY-MM-DD.json.gz
 * Download it after the task completes:
 *   aws s3 cp s3://<bucket>/backups/data-export-<date>.json.gz ./data-export.json.gz
 */

import { gzipSync } from "node:zlib";
import { prisma } from "@carshow/db";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

async function main() {
  const bucket = process.env.S3_BUCKET;
  const region = process.env.AWS_REGION ?? "ca-central-1";

  if (!bucket) throw new Error("S3_BUCKET environment variable is required");

  console.log("==> Querying database tables...");

  const tables = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;

  const snapshot: Record<string, unknown> = {
    _meta: {
      exportedAt: new Date().toISOString(),
      tables: tables.map((t) => t.table_name),
    },
  };

  for (const { table_name } of tables) {
    const rows = await prisma.$queryRawUnsafe<unknown[]>(`SELECT * FROM "${table_name}"`);
    snapshot[table_name] = rows;
    console.log(`    ${table_name}: ${rows.length} rows`);
  }

  const json = JSON.stringify(snapshot, null, 2);
  const compressed = gzipSync(Buffer.from(json, "utf-8"));

  const date = new Date().toISOString().slice(0, 10);
  const key = `backups/data-export-${date}.json.gz`;

  console.log(`\n==> Uploading ${(compressed.length / 1024).toFixed(1)} KB to s3://${bucket}/${key} ...`);

  const s3 = new S3Client({ region });
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: compressed,
      ContentType: "application/gzip",
      ContentEncoding: "gzip",
    }),
  );

  console.log("\n==> Export complete!");
  console.log(`\nTo download locally:`);
  console.log(`  aws s3 cp s3://${bucket}/${key} ./data-export.json.gz`);
  console.log(`\nTo inspect (requires jq):`);
  console.log(`  gunzip -c data-export.json.gz | jq 'keys'`);
  console.log(`  gunzip -c data-export.json.gz | jq '.VehicleEntry | length'`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
