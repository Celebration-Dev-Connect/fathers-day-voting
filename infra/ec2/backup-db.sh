#!/usr/bin/env bash
# Nightly Postgres backup for the year-round EC2 host (compute_mode = ec2).
# Dumps the carshow DB from the postgres container and uploads a gzip to
# s3://<photos-bucket>/backups/db/. Invoked by the carshow-db-backup systemd
# timer. The box's instance role grants the S3 write. Shipped via SSM; the repo
# copy is the source of truth (infra/terraform/ssm.tf).
set -euo pipefail

PROJECT="carshow"
ENVIRONMENT="prod"
APP_DIR="/opt/carshow"
RETAIN_DAYS=30

TOKEN="$(curl -sS -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 300")"
REGION="$(curl -sS -H "X-aws-ec2-metadata-token: $TOKEN" \
  "http://169.254.169.254/latest/meta-data/placement/region")"
export AWS_DEFAULT_REGION="$REGION"

BUCKET="$PROJECT-photos-$ENVIRONMENT"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
KEY="backups/db/$PROJECT-$ENVIRONMENT-$STAMP.sql.gz"
TMP="$(mktemp)"

cd "$APP_DIR"
docker compose exec -T postgres \
  pg_dump -U carshow -d carshow --no-owner --no-acl | gzip -9 >"$TMP"

aws s3 cp "$TMP" "s3://$BUCKET/$KEY"
rm -f "$TMP"
echo "[backup] uploaded s3://$BUCKET/$KEY"

# Prune dumps older than RETAIN_DAYS.
CUTOFF="$(date -u -d "-$RETAIN_DAYS days" +%Y-%m-%d 2>/dev/null || date -u -v-"$RETAIN_DAYS"d +%Y-%m-%d)"
aws s3api list-objects-v2 --bucket "$BUCKET" --prefix "backups/db/" \
  --query "Contents[?LastModified<'$CUTOFF'].Key" --output text 2>/dev/null | tr '\t' '\n' | while read -r old; do
  [ -n "$old" ] && aws s3 rm "s3://$BUCKET/$old" || true
done
