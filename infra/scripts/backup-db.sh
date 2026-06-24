#!/usr/bin/env bash
# backup-db.sh — Pre-decommission backup for carshow-prod
#
# Runs TWO backups before any infra teardown:
#   1. RDS snapshot (point-in-time, stays in AWS until manually deleted)
#   2. Full JSON data export via a one-off ECS Fargate task (uploads to S3)
#
# Prerequisites:
#   - AWS CLI configured (aws configure or AWS_PROFILE env var)
#   - jq installed
#   - The ECS cluster and RDS instance are still running
#   - decommissioned = false in prod.tfvars (do NOT set true yet)
#
# Usage:
#   ENV=prod ./infra/scripts/backup-db.sh
#   AWS_PROFILE=carshow ENV=prod ./infra/scripts/backup-db.sh

set -euo pipefail

ENV="${ENV:-prod}"
PROJECT="carshow"
REGION="${AWS_REGION:-ca-central-1}"
CLUSTER="${PROJECT}-${ENV}"
DB_IDENTIFIER="${PROJECT}-${ENV}"
PHOTOS_BUCKET="${PROJECT}-photos-${ENV}"
SNAPSHOT_DATE=$(date +%Y%m%d-%H%M%S)
SNAPSHOT_ID="${DB_IDENTIFIER}-backup-${SNAPSHOT_DATE}"

PROFILE_ARGS=()
if [ -n "${AWS_PROFILE:-}" ]; then
  PROFILE_ARGS=(--profile "$AWS_PROFILE")
fi

echo "================================================================"
echo "  Carshow ${ENV} — pre-decommission backup"
echo "  Region: ${REGION}"
echo "================================================================"
echo ""

# ── Step 1: RDS snapshot ──────────────────────────────────────────────────────
echo "==> [1/4] Creating RDS snapshot: ${SNAPSHOT_ID}"
aws rds create-db-snapshot \
  --db-instance-identifier "${DB_IDENTIFIER}" \
  --db-snapshot-identifier "${SNAPSHOT_ID}" \
  --region "${REGION}" \
  "${PROFILE_ARGS[@]}"

echo "    Waiting for snapshot to complete (usually 3-8 minutes)..."
aws rds wait db-snapshot-completed \
  --db-snapshot-identifier "${SNAPSHOT_ID}" \
  --region "${REGION}" \
  "${PROFILE_ARGS[@]}"
echo "    RDS snapshot complete: ${SNAPSHOT_ID}"

# ── Step 2: Run export-data as one-off Fargate task ──────────────────────────
echo ""
echo "==> [2/4] Reading ECS service network config..."
TASK_CONFIG=$(aws ecs describe-services \
  --cluster "${CLUSTER}" \
  --services "${CLUSTER}-api" \
  --query 'services[0]' \
  --output json \
  --region "${REGION}" \
  "${PROFILE_ARGS[@]}")

TASK_DEF_ARN=$(echo "$TASK_CONFIG" | jq -r '.taskDefinition')
SUBNETS=$(echo "$TASK_CONFIG" | jq -r '.networkConfiguration.awsvpcConfiguration.subnets | join(",")')
SECURITY_GROUPS=$(echo "$TASK_CONFIG" | jq -r '.networkConfiguration.awsvpcConfiguration.securityGroups | join(",")')

echo "    Task definition: ${TASK_DEF_ARN}"
echo "    Subnets: ${SUBNETS}"

echo ""
echo "==> [3/4] Launching one-off export-data Fargate task..."
TASK_ARN=$(aws ecs run-task \
  --cluster "${CLUSTER}" \
  --task-definition "${TASK_DEF_ARN}" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[${SUBNETS}],securityGroups=[${SECURITY_GROUPS}],assignPublicIp=ENABLED}" \
  --overrides '{"containerOverrides":[{"name":"api","command":["export-data"]}]}' \
  --query 'tasks[0].taskArn' \
  --output text \
  --region "${REGION}" \
  "${PROFILE_ARGS[@]}")

echo "    Task ARN: ${TASK_ARN}"
echo "    Waiting for export to complete (usually 2-5 minutes)..."
echo "    Watch logs: https://console.aws.amazon.com/cloudwatch/home?region=${REGION}#logsV2:log-groups/log-group/$2Fecs$2F${PROJECT}-${ENV}-api"

aws ecs wait tasks-stopped \
  --cluster "${CLUSTER}" \
  --tasks "${TASK_ARN}" \
  --region "${REGION}" \
  "${PROFILE_ARGS[@]}"

EXIT_CODE=$(aws ecs describe-tasks \
  --cluster "${CLUSTER}" \
  --tasks "${TASK_ARN}" \
  --query 'tasks[0].containers[0].exitCode' \
  --output text \
  --region "${REGION}" \
  "${PROFILE_ARGS[@]}")

if [ "${EXIT_CODE}" != "0" ]; then
  echo ""
  echo "ERROR: Export task failed with exit code ${EXIT_CODE}."
  echo "Check CloudWatch Logs for details:"
  echo "  /ecs/${PROJECT}-${ENV}-api"
  exit 1
fi

# ── Step 3: Download the export locally ───────────────────────────────────────
echo ""
echo "==> [4/4] Downloading data export to current directory..."
EXPORT_DATE=$(date +%Y-%m-%d)
S3_KEY="backups/data-export-${EXPORT_DATE}.json.gz"
LOCAL_FILE="data-export-${EXPORT_DATE}.json.gz"

aws s3 cp "s3://${PHOTOS_BUCKET}/${S3_KEY}" "./${LOCAL_FILE}" \
  --region "${REGION}" \
  "${PROFILE_ARGS[@]}"

echo ""
echo "================================================================"
echo "  BACKUP COMPLETE"
echo "================================================================"
echo ""
echo "Files:"
echo "  RDS snapshot:  ${SNAPSHOT_ID}  (in AWS, delete after 6+ months)"
echo "  Local export:  ./${LOCAL_FILE}"
echo ""
echo "Verify the export:"
echo "  gunzip -c ${LOCAL_FILE} | jq 'keys'        # list tables"
echo "  gunzip -c ${LOCAL_FILE} | jq '._meta'       # row counts + export time"
echo ""
echo "To restore data to a local Postgres:"
echo "  1. docker compose up -d postgres"
echo "  2. gunzip -c ${LOCAL_FILE} | node infra/scripts/import-data.js"
echo ""
echo "You are now ready to run: ./infra/scripts/decommission.sh"
