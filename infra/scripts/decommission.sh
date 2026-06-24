#!/usr/bin/env bash
# decommission.sh — Full decommission of carshow-prod
#
# Brings the AWS bill to ~$0 while keeping:
#   - visit.fathersdaycarshow.ca → static "event is over" page
#   - S3 bucket carshow-photos-prod (photos remain accessible at /photos/*)
#
# Prerequisites:
#   - backup-db.sh has been run and backups are verified locally
#   - AWS CLI configured (aws configure or AWS_PROFILE env var)
#   - Terraform CLI available
#   - prod.tfvars is updated with decommissioned = true
#
# Usage:
#   ENV=prod ./infra/scripts/decommission.sh
#   AWS_PROFILE=carshow ENV=prod ./infra/scripts/decommission.sh

set -euo pipefail

ENV="${ENV:-prod}"
PROJECT="carshow"
REGION="${AWS_REGION:-ca-central-1}"
CLUSTER="${PROJECT}-${ENV}"
DB_IDENTIFIER="${PROJECT}-${ENV}"
PHOTOS_BUCKET="${PROJECT}-photos-${ENV}"
ADMIN_BUCKET="${PROJECT}-admin-web-${ENV}"
JUDGE_BUCKET="${PROJECT}-judge-web-${ENV}"
PUBLIC_BUCKET="${PROJECT}-public-web-${ENV}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TF_DIR="${SCRIPT_DIR}/../terraform"
STATIC_DIR="${SCRIPT_DIR}/../static-site"

PROFILE_ARGS=()
if [ -n "${AWS_PROFILE:-}" ]; then
  PROFILE_ARGS=(--profile "$AWS_PROFILE")
fi

echo "================================================================"
echo "  Carshow ${ENV} — DECOMMISSION"
echo "================================================================"
echo ""
echo "This script will:"
echo "  1. Upload the static thank-you page to S3"
echo "  2. Disable RDS deletion protection"
echo "  3. Apply Terraform (decommissioned=true) — destroys ECS, ALB,"
echo "     RDS, ECR, Secrets Manager, CloudWatch alarms, and updates CloudFront"
echo "  4. Empty and remove admin/judge S3 buckets"
echo "  5. Invalidate CloudFront cache"
echo ""
echo "CONFIRM: Have you run backup-db.sh and verified the backup? (y/N)"
read -r CONFIRM
if [ "${CONFIRM}" != "y" ] && [ "${CONFIRM}" != "Y" ]; then
  echo "Aborted. Run ./infra/scripts/backup-db.sh first."
  exit 1
fi

echo ""
echo "CONFIRM: Is 'decommissioned = true' set in prod.tfvars? (y/N)"
read -r CONFIRM2
if [ "${CONFIRM2}" != "y" ] && [ "${CONFIRM2}" != "Y" ]; then
  echo "Aborted. Set 'decommissioned = true' in infra/terraform/prod.tfvars first."
  exit 1
fi

# ── Step 1: Upload static page ────────────────────────────────────────────────
echo ""
echo "==> [1/5] Uploading static 'event is over' page to S3..."
aws s3 sync "${STATIC_DIR}/" "s3://${PUBLIC_BUCKET}/" \
  --delete \
  --region "${REGION}" \
  "${PROFILE_ARGS[@]}"
echo "    Done."

# ── Step 2: Disable RDS deletion protection ───────────────────────────────────
echo ""
echo "==> [2/5] Disabling RDS deletion protection on ${DB_IDENTIFIER}..."
echo "    (Required before Terraform can destroy the instance)"
aws rds modify-db-instance \
  --db-instance-identifier "${DB_IDENTIFIER}" \
  --no-deletion-protection \
  --apply-immediately \
  --region "${REGION}" \
  "${PROFILE_ARGS[@]}" \
  --output text --query 'DBInstance.DBInstanceIdentifier' | xargs -I{} echo "    Modified: {}"

echo "    Waiting for instance to be available..."
aws rds wait db-instance-available \
  --db-instance-identifier "${DB_IDENTIFIER}" \
  --region "${REGION}" \
  "${PROFILE_ARGS[@]}"
echo "    Deletion protection disabled."

# ── Step 3: Terraform apply (destroys backend, updates CloudFront) ────────────
echo ""
echo "==> [3/5] Running terraform apply with decommissioned=true..."
echo "    This destroys ECS, ALB, RDS, ECR, Secrets, CloudWatch alarms."
echo "    RDS will take a final snapshot: ${DB_IDENTIFIER}-final"
echo "    This step takes 10-20 minutes."
echo ""
(
  cd "${TF_DIR}"
  terraform workspace select "${ENV}"
  terraform apply -var-file="${ENV}.tfvars" -auto-approve
)

# ── Step 4: Empty and remove SPA buckets ─────────────────────────────────────
echo ""
echo "==> [4/5] Emptying admin and judge S3 buckets..."
if aws s3 ls "s3://${ADMIN_BUCKET}" --region "${REGION}" "${PROFILE_ARGS[@]}" &>/dev/null; then
  aws s3 rm "s3://${ADMIN_BUCKET}" --recursive --region "${REGION}" "${PROFILE_ARGS[@]}"
  echo "    Emptied ${ADMIN_BUCKET}"
else
  echo "    ${ADMIN_BUCKET} already gone."
fi

if aws s3 ls "s3://${JUDGE_BUCKET}" --region "${REGION}" "${PROFILE_ARGS[@]}" &>/dev/null; then
  aws s3 rm "s3://${JUDGE_BUCKET}" --recursive --region "${REGION}" "${PROFILE_ARGS[@]}"
  echo "    Emptied ${JUDGE_BUCKET}"
else
  echo "    ${JUDGE_BUCKET} already gone."
fi

# Second terraform apply removes the now-empty buckets
echo ""
echo "    Applying Terraform to delete emptied buckets..."
(
  cd "${TF_DIR}"
  terraform apply -var-file="${ENV}.tfvars" -auto-approve
)

# ── Step 5: CloudFront cache invalidation ─────────────────────────────────────
echo ""
echo "==> [5/5] Invalidating CloudFront cache..."
DIST_ID=$(cd "${TF_DIR}" && terraform output -raw cloudfront_distribution_id)
aws cloudfront create-invalidation \
  --distribution-id "${DIST_ID}" \
  --paths "/*" \
  --region us-east-1 \
  "${PROFILE_ARGS[@]}" \
  --query 'Invalidation.Id' --output text | xargs -I{} echo "    Invalidation: {}"

echo ""
echo "================================================================"
echo "  DECOMMISSION COMPLETE"
echo "================================================================"
echo ""
echo "Verify:"
echo "  open https://visit.fathersdaycarshow.ca"
echo "  (should show the 'Thanks for Coming' page within ~60s)"
echo ""
echo "AWS console checks:"
echo "  - ECS: cluster '${CLUSTER}' is gone"
echo "  - RDS: instance '${DB_IDENTIFIER}' is gone"
echo "  - RDS: snapshot '${DB_IDENTIFIER}-final' exists (keep ≥6 months)"
echo "  - ECR: repository '${PROJECT}/api' is gone"
echo "  - Secrets Manager: 'carshow/${ENV}/*' secrets are gone"
echo ""
echo "Remaining AWS resources (minimal cost):"
echo "  - S3: ${PUBLIC_BUCKET} (static page)"
echo "  - S3: ${PHOTOS_BUCKET} (photos accessible at /photos/*)"
echo "  - CloudFront distribution"
echo "  - ACM certificate"
echo "  - VPC (no running resources → no cost)"
echo ""
echo "Next: Disable the GitHub Actions deploy workflows to prevent"
echo "      accidental re-deploys (.github/workflows/deploy-prod.yml)"
