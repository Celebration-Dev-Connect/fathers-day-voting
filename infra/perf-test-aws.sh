#!/usr/bin/env bash
#
# perf-test-aws.sh — deploy a prod-sized perf environment, run all load test
# scenarios against it, then tear it down.
#
# Prerequisites:
#   1. Copy infra/terraform/perf.tfvars.example → infra/terraform/perf.tfvars
#      and fill in the required values (db_username, etc.).
#   2. AWS credentials available (profile, env vars, or SSO).
#   3. Tools on PATH: aws, terraform, docker, npm, git, curl, jq.
#
# Usage:
#   ./infra/perf-test-aws.sh [options]
#
# Options:
#   -p, --profile <name>   AWS CLI profile (default: carshow)
#   -r, --region <region>  AWS region (default: ca-central-1)
#      --keep              Don't destroy the stack after tests (useful for debugging)
#      --skip-deploy       Target an already-running perf stack (implies --keep)
#   -y, --auto-approve     Pass --auto-approve to deploy.sh
#   -h, --help             Show this help
#
# Total expected runtime: ~35–45 min (deploy ~15, tests ~10, destroy ~15).
# Cost: ~$0.25–0.35 for a single run (2× Fargate 1024/2048, db.t3.medium, ALB).
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TF_DIR="$SCRIPT_DIR/terraform"

PROFILE="carshow"
REGION="ca-central-1"
KEEP=false
SKIP_DEPLOY=false
AUTO_APPROVE=false

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '\033[1;34m▸\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Deploy a prod-sized perf environment, run all load tests, then tear it down.

USAGE:
  infra/perf-test-aws.sh [options]

OPTIONS:
  -p, --profile <name>   AWS CLI profile (default: carshow)
  -r, --region <region>  AWS region (default: ca-central-1)
      --keep             Don't destroy the stack after the tests complete.
                         Useful for inspecting logs or re-running individual
                         scenarios. Destroy manually when done:
                           ./infra/deploy.sh --env perf --destroy
      --skip-deploy      Skip deploy and destroy steps — target an already-
                         running perf stack. Implies --keep.
  -y, --auto-approve     Skip confirmation prompts in deploy.sh.
  -h, --help             Show this help.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -p|--profile)     PROFILE="${2:-}"; shift 2 ;;
    -r|--region)      REGION="${2:-}"; shift 2 ;;
    --keep)           KEEP=true; shift ;;
    --skip-deploy)    SKIP_DEPLOY=true; KEEP=true; shift ;;
    -y|--auto-approve) AUTO_APPROVE=true; shift ;;
    -h|--help)        usage; exit 0 ;;
    *)                usage; die "Unknown argument: $1" ;;
  esac
done

START_TS=$SECONDS

# ── Preflight ─────────────────────────────────────────────────────────────────
need() { command -v "$1" >/dev/null 2>&1 || die "Required tool not found on PATH: $1"; }
need aws; need terraform; need npm; need git; need curl; need jq

[[ -f "$TF_DIR/perf.tfvars" ]] \
  || die "Missing infra/terraform/perf.tfvars — copy perf.tfvars.example and fill it in."

export AWS_PROFILE="$PROFILE"
export AWS_REGION="$REGION" AWS_DEFAULT_REGION="$REGION"

APPROVE_FLAG=()
$AUTO_APPROVE && APPROVE_FLAG=(--auto-approve)

# ── Deploy ────────────────────────────────────────────────────────────────────
if ! $SKIP_DEPLOY; then
  bold ""
  bold "Step 1/3 — Deploy perf environment (prod-sized, SPAs skipped)"
  bold ""
  "$SCRIPT_DIR/deploy.sh" \
    --env perf \
    --profile "$PROFILE" \
    --region "$REGION" \
    --skip-spas \
    "${APPROVE_FLAG[@]+"${APPROVE_FLAG[@]}"}"
  ok "Deploy complete"
fi

# ── Read ALB URL ──────────────────────────────────────────────────────────────
info "Reading ALB URL from Terraform output"
terraform -chdir="$TF_DIR" workspace select perf >/dev/null 2>&1
API_URL="$(terraform -chdir="$TF_DIR" output -raw api_url)"
ok "ALB URL: $API_URL"

# ── Wait for health ────────────────────────────────────────────────────────────
bold ""
bold "Step 2/3 — Wait for API health"
bold ""
info "Polling $API_URL/health (up to 5 min)…"
DEADLINE=$(( SECONDS + 300 ))
until curl -sf "$API_URL/health" >/dev/null 2>&1; do
  if [[ $SECONDS -ge $DEADLINE ]]; then
    die "API did not become healthy within 5 minutes."
  fi
  printf '.'
  sleep 5
done
printf '\n'
ok "API is healthy"

# ── Dev-login → JWT ───────────────────────────────────────────────────────────
info "Obtaining staff JWT via dev-login"
LOGIN_RESP="$(curl -sf -X POST "$API_URL/auth/dev-login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@carshow.local"}')"
PERF_JWT="$(printf '%s' "$LOGIN_RESP" | jq -r '.token')"
[[ -n "$PERF_JWT" && "$PERF_JWT" != "null" ]] \
  || die "dev-login failed or returned no token. Response: $LOGIN_RESP"
ok "JWT obtained"

# ── Run load tests ─────────────────────────────────────────────────────────────
bold ""
bold "Step 3/3 — Run Artillery load tests"
bold ""
# run-perf.ts fetches fixtures then runs browse → vote → upload.
# PERF_JWT is passed so fetch-fixtures uses the remote API path (no direct DB access).
( cd "$REPO_ROOT" \
    && TARGET_URL="$API_URL" PERF_JWT="$PERF_JWT" \
       npm run perf --workspace @carshow/perf )

ELAPSED=$(( SECONDS - START_TS ))
MINS=$(( ELAPSED / 60 ))
SECS=$(( ELAPSED % 60 ))

bold ""
ok "All load test scenarios complete (${MINS}m ${SECS}s elapsed)"
echo
info "Reports: apps/perf/reports/*.html"
info "Post-run checks:"
echo "  • Browse p99 should be flat during the sustained phase"
echo "  • Vote scenario: 5xx rate must be 0%"
echo "  • ECS task count: aws ecs describe-services --cluster carshow-perf --services carshow-perf-api"
echo "  • CloudWatch logs: aws logs tail /ecs/carshow-perf --follow"
echo ""

# ── Teardown ───────────────────────────────────────────────────────────────────
if $KEEP; then
  warn "--keep is set. Stack is still running — destroy when done:"
  warn "  ./infra/deploy.sh --env perf --profile $PROFILE --destroy"
else
  bold ""
  bold "Tearing down perf environment…"
  bold ""
  "$SCRIPT_DIR/deploy.sh" \
    --env perf \
    --profile "$PROFILE" \
    --region "$REGION" \
    --destroy \
    "${APPROVE_FLAG[@]+"${APPROVE_FLAG[@]}"}"
  ok "Perf environment destroyed."
fi
