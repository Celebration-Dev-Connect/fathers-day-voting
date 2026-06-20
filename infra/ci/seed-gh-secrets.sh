#!/usr/bin/env bash
# Seed GitHub Actions environment secrets from local *.tfvars files.
#
# Creates one secret per tfvar variable (TF_<ENV>_<VAR>) in the matching
# GitHub environment so each variable can be updated independently.
#
#   test/perf → infra-nonprod GitHub environment
#   prod      → infra-prod    GitHub environment
#
# Prerequisites:
#   - gh CLI installed and authenticated (gh auth status)
#   - infra/terraform/{test,perf,prod}.tfvars present and filled in
#
# Usage:
#   ./infra/ci/seed-gh-secrets.sh             # seed all three environments
#   ./infra/ci/seed-gh-secrets.sh test        # seed test only
#   ./infra/ci/seed-gh-secrets.sh prod        # seed prod only

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TF_DIR="$SCRIPT_DIR/../terraform"
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)

# Extract a single variable's value from a tfvars file.
# Strips surrounding quotes, trailing comments, and whitespace.
# Returns empty string if the variable is not present in the file.
get_var() {
  local key="$1" file="$2" line value
  line=$(grep -m1 "^${key}[[:space:]]*=" "$file" 2>/dev/null) || { printf ''; return 0; }
  value="${line#*=}"
  # ltrim
  value="${value#"${value%%[![:space:]]*}"}"
  # For unquoted values (bool / number), strip trailing inline comment
  if [[ "$value" != '"'* ]]; then
    value="${value%%[[:space:]]#*}"
    value="${value%%#*}"
  fi
  # rtrim
  value="${value%"${value##*[![:space:]]}"}"
  # Strip surrounding double quotes from string values
  value="${value#\"}"
  value="${value%\"}"
  printf '%s' "$value"
}

set_secret() {
  local name="$1" value="$2" gh_env="$3"
  printf '%s' "$value" | gh secret set "$name" --env "$gh_env" --repo "$REPO"
  echo "  ✓ $name"
}

seed_env() {
  local env="$1" gh_env="$2"
  local f="$TF_DIR/${env}.tfvars"
  local prefix
  prefix="TF_$(echo "$env" | tr '[:lower:]' '[:upper:]')"

  if [[ ! -f "$f" ]]; then
    echo "  ⚠ $f not found — skipping $env"
    return 0
  fi

  echo ""
  echo "=== $env → GitHub environment: $gh_env ==="

  # ── Common variables (all environments) ──────────────────────────────────
  set_secret "${prefix}_REGION"                "$(get_var region "$f")"                "$gh_env"
  set_secret "${prefix}_PROJECT"               "$(get_var project "$f")"               "$gh_env"
  set_secret "${prefix}_ENVIRONMENT"           "$(get_var environment "$f")"           "$gh_env"
  set_secret "${prefix}_DOMAIN"                "$(get_var domain "$f")"                "$gh_env"
  set_secret "${prefix}_DB_USERNAME"           "$(get_var db_username "$f")"           "$gh_env"
  set_secret "${prefix}_ROUTE53_ZONE_ID"       "$(get_var route53_zone_id "$f")"       "$gh_env"
  set_secret "${prefix}_ECS_CPU"               "$(get_var ecs_cpu "$f")"               "$gh_env"
  set_secret "${prefix}_ECS_MEMORY"            "$(get_var ecs_memory "$f")"            "$gh_env"
  set_secret "${prefix}_ECS_MIN_SIZE"          "$(get_var ecs_min_size "$f")"          "$gh_env"
  set_secret "${prefix}_ECS_MAX_SIZE"          "$(get_var ecs_max_size "$f")"          "$gh_env"
  set_secret "${prefix}_RDS_INSTANCE_CLASS"    "$(get_var rds_instance_class "$f")"    "$gh_env"
  set_secret "${prefix}_RDS_ALLOCATED_STORAGE" "$(get_var rds_allocated_storage "$f")" "$gh_env"
  set_secret "${prefix}_RDS_BACKUP_RETENTION"  "$(get_var rds_backup_retention "$f")"  "$gh_env"
  set_secret "${prefix}_ENABLE_DEV_LOGIN"      "$(get_var enable_dev_login "$f")"      "$gh_env"
  set_secret "${prefix}_RUN_SEED"              "$(get_var run_seed "$f")"              "$gh_env"
  set_secret "${prefix}_TEARDOWN_FRIENDLY"     "$(get_var teardown_friendly "$f")"     "$gh_env"
  set_secret "${prefix}_IMAGE_TAG"             "$(get_var image_tag "$f")"             "$gh_env"
  set_secret "${prefix}_PCO_CLIENT_ID"         "$(get_var pco_client_id "$f")"         "$gh_env"
  set_secret "${prefix}_PCO_CLIENT_SECRET"     "$(get_var pco_client_secret "$f")"     "$gh_env"
  set_secret "${prefix}_PCO_CALLBACK_URL"      "$(get_var pco_callback_url "$f")"      "$gh_env"
  set_secret "${prefix}_PCO_TEAM_NAME"         "$(get_var pco_team_name "$f")"         "$gh_env"
  set_secret "${prefix}_ADMIN_WEB_URL"         "$(get_var admin_web_url "$f")"         "$gh_env"
  set_secret "${prefix}_JUDGE_WEB_URL"         "$(get_var judge_web_url "$f")"         "$gh_env"
  set_secret "${prefix}_WEBGUIDE_USERNAME"     "$(get_var webguide_username "$f")"     "$gh_env"
  set_secret "${prefix}_WEBGUIDE_PASSWORD"     "$(get_var webguide_password "$f")"     "$gh_env"

  # ── Environment-specific extras ───────────────────────────────────────────
  case "$env" in
    perf)
      set_secret "${prefix}_DB_CONNECTION_LIMIT"      "$(get_var db_connection_limit "$f")"      "$gh_env"
      set_secret "${prefix}_SKIP_CLOUDFRONT"          "$(get_var skip_cloudfront "$f")"          "$gh_env"
      set_secret "${prefix}_CLOUDFRONT_CUSTOM_DOMAIN" "$(get_var cloudfront_custom_domain "$f")" "$gh_env"
      ;;
    prod)
      set_secret "${prefix}_DB_CONNECTION_LIMIT"      "$(get_var db_connection_limit "$f")"      "$gh_env"
      set_secret "${prefix}_CORS_ALLOWED_ORIGINS"     "$(get_var cors_allowed_origins "$f")"     "$gh_env"
      set_secret "${prefix}_ALERT_EMAIL"              "$(get_var alert_email "$f")"              "$gh_env"
      set_secret "${prefix}_ALERT_SMS"                "$(get_var alert_sms "$f")"                "$gh_env"
      set_secret "${prefix}_CLOUDFRONT_CUSTOM_DOMAIN" "$(get_var cloudfront_custom_domain "$f")" "$gh_env"
      ;;
  esac
}

ENVS=("${@:-test perf prod}")
if [[ $# -eq 0 ]]; then
  ENVS=(test perf prod)
fi

for env in "${ENVS[@]}"; do
  case "$env" in
    test) seed_env test infra-nonprod ;;
    perf) seed_env perf infra-nonprod ;;
    prod) seed_env prod infra-prod ;;
    *) echo "Unknown environment: $env (expected: test, perf, prod)"; exit 1 ;;
  esac
done

echo ""
echo "Done. Verify with:"
echo "  gh secret list --env infra-nonprod --repo $REPO"
echo "  gh secret list --env infra-prod    --repo $REPO"
echo ""
echo "Old blob secrets (TEST_TFVARS, PERF_TFVARS, PROD_TFVARS, WEBGUIDE_USERNAME,"
echo "WEBGUIDE_PASSWORD) can now be deleted from GitHub if no longer referenced."
