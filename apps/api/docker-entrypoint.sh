#!/bin/sh
# Container entrypoint: apply pending DB migrations (and optionally seed) before
# starting the API. RDS lives in a private subnet with no bastion/NAT, so there
# is no out-of-band way to migrate — doing it here is the supported path.
#
# `prisma migrate deploy` takes a Postgres advisory lock, so it is safe when
# multiple instances start at once: one applies, the rest no-op.
set -e

PRISMA="node_modules/.bin/prisma"
TSX="node_modules/.bin/tsx"
SCHEMA="packages/db/prisma/schema.prisma"

echo "[entrypoint] Applying database migrations..."
"$PRISMA" migrate deploy --schema "$SCHEMA"

if [ "${1:-}" = "cleanup-registrations" ]; then
  echo "[entrypoint] Running one-time registration cleanup..."
  exec node apps/api/dist/scripts/cleanupRegistrations.js
fi

if [ "${CLEANUP_REGISTRATIONS_ON_START:-false}" = "true" ]; then
  echo "[entrypoint] CLEANUP_REGISTRATIONS_ON_START=true — running one-time registration cleanup..."
  node apps/api/dist/scripts/cleanupRegistrations.js
fi

if [ "$RUN_SEED" = "true" ]; then
  echo "[entrypoint] RUN_SEED=true — seeding database (idempotent upserts)..."
  "$TSX" packages/db/prisma/seed.ts
fi

echo "[entrypoint] Starting API..."
exec node apps/api/dist/server.js
