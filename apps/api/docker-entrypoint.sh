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

apply_migrations() {
  echo "[entrypoint] Applying database migrations..."
  MIGRATE_LOG="$(mktemp)"
  "$PRISMA" migrate deploy --schema "$SCHEMA" >"$MIGRATE_LOG" 2>&1 || {
    cat "$MIGRATE_LOG" >&2
    # P3009/P3018: a migration failed mid-run and was recorded as failed.
    # PostgreSQL rolls back failed migration transactions atomically, so no
    # partial changes exist. Resolve the record(s) and retry.
    # P3018 fires on the first failure ("Migration name: <name>" format).
    # P3009 fires on subsequent runs ("migration `<name>` started" format).
    FAILED=$(awk -F'`' '/migration.*started.*failed/{print $2}' "$MIGRATE_LOG"; \
             awk '/^Migration name:/{print $NF}' "$MIGRATE_LOG")
    if [ -n "$FAILED" ]; then
      echo "[entrypoint] P3009 detected — resolving rolled-back migration(s)..."
      for m in $FAILED; do
        echo "[entrypoint]   resolve --rolled-back $m"
        "$PRISMA" migrate resolve --rolled-back "$m" --schema "$SCHEMA"
      done
      echo "[entrypoint] Retrying after resolve..."
      "$PRISMA" migrate deploy --schema "$SCHEMA"
    else
      exit 1
    fi
  }
  rm -f "$MIGRATE_LOG"
}

# ── Modes ─────────────────────────────────────────────────────────────────────

if [ "${1:-}" = "--migrate-only" ]; then
  apply_migrations
  echo "[entrypoint] Migration complete."
  exit 0
fi

if [ "${1:-}" = "cleanup-registrations" ]; then
  echo "[entrypoint] Running one-time registration cleanup..."
  exec node apps/api/dist/scripts/cleanupRegistrations.js
fi

if [ "${1:-}" = "export-data" ]; then
  echo "[entrypoint] Running database export..."
  exec node apps/api/dist/scripts/exportData.js
fi

# ── Normal startup ────────────────────────────────────────────────────────────

apply_migrations

if [ "${CLEANUP_REGISTRATIONS_ON_START:-false}" = "true" ]; then
  echo "[entrypoint] CLEANUP_REGISTRATIONS_ON_START=true — running one-time registration cleanup..."
  node apps/api/dist/scripts/cleanupRegistrations.js
fi

if [ "${RANDOMIZE_OWNER_CODES_ON_START:-false}" = "true" ]; then
  echo "[entrypoint] RANDOMIZE_OWNER_CODES_ON_START=true — randomizing existing owner access codes..."
  node apps/api/dist/scripts/randomizeOwnerAccessCodes.js
fi

if [ "$RUN_SEED" = "true" ]; then
  echo "[entrypoint] RUN_SEED=true — seeding database (idempotent upserts)..."
  "$TSX" packages/db/prisma/seed.ts
fi

echo "[entrypoint] Starting API..."
exec node apps/api/dist/server.js
