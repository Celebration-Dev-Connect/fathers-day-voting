#!/usr/bin/env bash
#
# deploy.sh — build, push, and deploy the Father's Day Car Show stack to AWS.
#
# Deploys one of three configurations, each isolated in its own Terraform
# workspace + state so a test or perf deploy can never touch prod:
#
#   test  — cheap, disposable: reduced resources, local dev-login, demo seed,
#           one-command teardown.   (infra/terraform/test.tfvars)
#   perf  — prod-sized, disposable: used by perf-test-aws.sh to load test
#           the full stack before event day. (infra/terraform/perf.tfvars)
#   prod  — full-size, protected.  (infra/terraform/prod.tfvars)
#
# Credentials are never taken as arguments or printed. The script uses the
# standard AWS credential chain (env vars, --profile, or SSO); Docker logs in to
# ECR via a short-lived token piped over stdin.
#
set -euo pipefail

# ── Locations ────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TF_DIR="$SCRIPT_DIR/terraform"

# Load local deployment credentials without passing them as command arguments.
# Terraform receives WebGuide credentials through sensitive TF_VAR values and
# stores them in Secrets Manager for ECS injection.
if [[ -f "$REPO_ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$REPO_ROOT/.env"
  set +a
fi
if [[ -n "${AWS_SECRET:-}" && -z "${AWS_SECRET_ACCESS_KEY:-}" ]]; then
  export AWS_SECRET_ACCESS_KEY="$AWS_SECRET"
fi
export TF_VAR_webguide_username="${WEBGUIDE_USERNAME:-${WEBGUIDEUSERNAME:-}}"
export TF_VAR_webguide_password="${WEBGUIDE_PASSWORD:-${WEBGUIDEPASSWORD:-}}"

# ── Defaults ─────────────────────────────────────────────────────────────────
ENVIRONMENT=""
PROFILE=""
REGION="ca-central-1"
IMAGE_TAG=""
SKIP_INFRA=false
SKIP_IMAGE=false
SKIP_SPAS=false
DO_PLAN=false
DO_DESTROY=false
DO_SUSPEND=false
DO_RESUME=false
AUTO_APPROVE=false

# ── Pretty output ────────────────────────────────────────────────────────────
bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '\033[1;34m▸\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Deploy the Father's Day Car Show stack to AWS.

USAGE:
  infra/deploy.sh --env <test|prod> [options]

REQUIRED:
  -e, --env <test|perf|prod>  Which configuration to deploy:
                            test = reduced resources, local login, seeded demo
                                   data, easy teardown
                            perf = prod-sized, disposable (use perf-test-aws.sh)
                            prod = full resources, protected data

OPTIONS:
  -p, --profile <name>    AWS CLI profile to use (else default credential chain
                          / AWS_PROFILE / SSO). Credentials are never printed.
  -r, --region <region>   AWS region (default: ca-central-1). Must match the
                          region in your tfvars.
  -t, --image-tag <tag>   API image tag to build/deploy (default: git short SHA).
      --skip-infra        Don't run Terraform; deploy app/SPAs to existing infra.
      --skip-image        Don't build/push the API image; reuse --image-tag.
      --skip-spas         Don't build/sync the public/admin/judge/owner SPAs.
      --plan              Show the Terraform plan for the env and exit.
      --destroy           Tear down the selected environment, then exit.
      --suspend           Stop ECS tasks and RDS without touching CloudFront/ACM.
                          Saves ~$35/mo. Resume with --resume. Max 7 days before
                          AWS auto-restarts the RDS instance.
      --resume            Start ECS and RDS after a --suspend (no image rebuild).
  -y, --auto-approve      Skip interactive confirmation prompts.
  -h, --help              Show this help.

EXAMPLES:
  # First-time / routine test deploy (everything)
  infra/deploy.sh --env test --profile carshow

  # See what prod would change, no apply
  infra/deploy.sh --env prod --profile carshow --plan

  # Re-deploy only the SPAs (e.g. after a frontend tweak)
  infra/deploy.sh --env test --skip-infra --skip-image

  # Tear down the test stack
  infra/deploy.sh --env test --destroy

  # Stop compute between sessions (keeps CloudFront/ACM/Route53 intact)
  infra/deploy.sh --env test --suspend
  infra/deploy.sh --env test --resume

NOTES:
  * Requires a matching tfvars file: infra/terraform/<env>.tfvars
    (copy <env>.tfvars.example and fill it in).
  * The API image is always built for linux/amd64 — App Runner only runs
    x86_64, so this works correctly from Apple Silicon too.
  * Each env lives in its own Terraform workspace ("test" / "perf" / "prod").
EOF
}

# ── Arg parsing ──────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    -e|--env)         ENVIRONMENT="${2:-}"; shift 2 ;;
    -p|--profile)     PROFILE="${2:-}"; shift 2 ;;
    -r|--region)      REGION="${2:-}"; shift 2 ;;
    -t|--image-tag)   IMAGE_TAG="${2:-}"; shift 2 ;;
    --skip-infra)     SKIP_INFRA=true; shift ;;
    --skip-image)     SKIP_IMAGE=true; shift ;;
    --skip-spas)      SKIP_SPAS=true; shift ;;
    --plan)           DO_PLAN=true; shift ;;
    --destroy)        DO_DESTROY=true; shift ;;
    --suspend)        DO_SUSPEND=true; shift ;;
    --resume)         DO_RESUME=true; shift ;;
    -y|--auto-approve) AUTO_APPROVE=true; shift ;;
    -h|--help)        usage; exit 0 ;;
    *)                usage; die "Unknown argument: $1" ;;
  esac
done

# ── Validate inputs ──────────────────────────────────────────────────────────
[[ -n "$ENVIRONMENT" ]] || { usage; die "--env is required (test, perf, or prod)"; }
[[ "$ENVIRONMENT" == "test" || "$ENVIRONMENT" == "perf" || "$ENVIRONMENT" == "prod" ]] || die "--env must be 'test', 'perf', or 'prod' (got '$ENVIRONMENT')"

VAR_FILE_NAME="$ENVIRONMENT.tfvars"
VAR_FILE="$TF_DIR/$VAR_FILE_NAME"
[[ -f "$VAR_FILE" ]] || die "Missing $VAR_FILE — copy $ENVIRONMENT.tfvars.example to $ENVIRONMENT.tfvars and fill it in."

# Prod can only be deployed from CI — OIDC credentials never exist locally.
if [[ "$ENVIRONMENT" == "prod" && "${CI:-}" != "true" ]]; then
  die "prod deploys must originate from GitHub Actions. Trigger the 'Deploy Production' workflow instead."
fi

# Pass --profile through to the AWS CLI via the standard env var (never logged).
if [[ -n "$PROFILE" ]]; then export AWS_PROFILE="$PROFILE"; fi
export AWS_REGION="$REGION" AWS_DEFAULT_REGION="$REGION"

# ── Tooling preflight ────────────────────────────────────────────────────────
need() { command -v "$1" >/dev/null 2>&1 || die "Required tool not found on PATH: $1"; }
need aws
need terraform
$SKIP_IMAGE || need docker
$SKIP_SPAS  || need npm
need git

# ── Helpers ──────────────────────────────────────────────────────────────────
tf() { terraform -chdir="$TF_DIR" "$@"; }
tf_var_args=( -var-file="$VAR_FILE_NAME" -var="region=$REGION" )

confirm() {
  # $1 = prompt; returns 0 to proceed
  $AUTO_APPROVE && return 0
  local reply
  read -r -p "$1 " reply
  [[ "$reply" == "yes" || "$reply" == "y" ]]
}

select_workspace() {
  info "Selecting Terraform workspace: $ENVIRONMENT"
  tf workspace select "$ENVIRONMENT" >/dev/null 2>&1 || tf workspace new "$ENVIRONMENT"
}

# ── Identity check (prints account/role, never secrets) ──────────────────────
info "Verifying AWS credentials${PROFILE:+ (profile: $PROFILE)}…"
CALLER="$(aws sts get-caller-identity --output json 2>/dev/null)" \
  || die "AWS credentials are not valid/available. Configure a profile, env vars, or 'aws sso login'."
ACCOUNT_ID="$(printf '%s' "$CALLER" | sed -n 's/.*"Account": *"\([0-9]*\)".*/\1/p')"
CALLER_ARN="$(printf '%s' "$CALLER" | sed -n 's/.*"Arn": *"\([^"]*\)".*/\1/p')"
ok "Authenticated as $CALLER_ARN (account $ACCOUNT_ID, region $REGION)"

bold ""
bold "Stack: $ENVIRONMENT   Account: $ACCOUNT_ID   Region: $REGION"
bold ""

# ── terraform init + workspace ───────────────────────────────────────────────
info "terraform init"
tf init -input=false >/dev/null
select_workspace

# ── --plan: show plan and exit ───────────────────────────────────────────────
if $DO_PLAN; then
  PLAN_TAG="${IMAGE_TAG:-latest}"
  info "terraform plan ($ENVIRONMENT)"
  tf plan "${tf_var_args[@]}" -var="image_tag=$PLAN_TAG"
  exit 0
fi

# ── --destroy: tear down and exit ────────────────────────────────────────────
if $DO_DESTROY; then
  warn "This will DESTROY the '$ENVIRONMENT' stack in account $ACCOUNT_ID."
  if [[ "$ENVIRONMENT" == "prod" ]]; then
    confirm "Type 'yes' to destroy PROD:" || die "Aborted."
  else
    confirm "Type 'yes' to destroy:" || die "Aborted."
  fi
  APPROVE=(); $AUTO_APPROVE && APPROVE=(-auto-approve)
  tf destroy "${tf_var_args[@]}" -var="image_tag=latest" "${APPROVE[@]+"${APPROVE[@]}"}"
  ok "Destroyed $ENVIRONMENT."
  exit 0
fi

# ── --suspend: stop compute, leave CloudFront/ACM/Route53 intact ─────────────
# Saves ~$35/mo between sessions. RDS auto-restarts after 7 days if not resumed.
if $DO_SUSPEND; then
  CLUSTER="${project:-carshow}-${ENVIRONMENT}"
  SERVICE="${project:-carshow}-${ENVIRONMENT}-api"
  DB_ID="${project:-carshow}-${ENVIRONMENT}"
  confirm "Suspend compute for '$ENVIRONMENT' (stop ECS + RDS)?" || die "Aborted."
  info "Scaling ECS service to 0 tasks"
  aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE" \
    --desired-count 0 --region "$REGION" >/dev/null
  info "Stopping RDS instance (takes ~1 min)"
  aws rds stop-db-instance --db-instance-identifier "$DB_ID" \
    --region "$REGION" >/dev/null
  ok "Suspended. CloudFront, ACM, Route53, ALB, VPC remain intact."
  ok "Resume with: ./infra/deploy.sh --env $ENVIRONMENT --resume"
  exit 0
fi

# ── --resume: restart compute after a suspend ─────────────────────────────────
if $DO_RESUME; then
  CLUSTER="${project:-carshow}-${ENVIRONMENT}"
  SERVICE="${project:-carshow}-${ENVIRONMENT}-api"
  DB_ID="${project:-carshow}-${ENVIRONMENT}"
  info "Starting RDS instance"
  aws rds start-db-instance --db-instance-identifier "$DB_ID" \
    --region "$REGION" >/dev/null
  info "Waiting for RDS to be available (typically 2-3 min)…"
  aws rds wait db-instance-available --db-instance-identifier "$DB_ID" \
    --region "$REGION"
  ok "RDS available"
  info "Scaling ECS service back to 1 task"
  aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE" \
    --desired-count 1 --region "$REGION" >/dev/null
  ok "Resumed. App will be healthy once the task passes health checks (~2 min)."
  exit 0
fi

# ── Resolve image tag ────────────────────────────────────────────────────────
if [[ -z "$IMAGE_TAG" ]]; then
  IMAGE_TAG="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
fi
info "API image tag: $IMAGE_TAG"

# Extra guard before mutating prod.
if [[ "$ENVIRONMENT" == "prod" ]] && ! $AUTO_APPROVE; then
  confirm "Type 'yes' to deploy to PRODUCTION:" || die "Aborted."
fi

# ── Bootstrap: ensure the ECR repo exists before docker push ─────────────────
# The ECR repo name (carshow/api) is shared across all workspaces in the same
# account. If another workspace already created it, import it into this
# workspace's state rather than failing with RepositoryAlreadyExistsException.
if ! $SKIP_INFRA; then
  ECR_REPO_NAME="${ENVIRONMENT%%-*}/api"
  # Use the project variable from tfvars if we can parse it, else fall back to env prefix
  # awk -F'"' is portable (BSD + GNU); sed \s* is not valid on macOS BSD sed
  _parsed_project="$(awk -F'"' '/^project[[:space:]]*=/ {print $2; exit}' "$VAR_FILE")"
  [[ -n "$_parsed_project" ]] && ECR_REPO_NAME="${_parsed_project}/api"
  info "Ensuring ECR repository exists ($ECR_REPO_NAME)"
  if ! tf state show aws_ecr_repository.api >/dev/null 2>&1; then
    if aws ecr describe-repositories --repository-names "$ECR_REPO_NAME" \
        --region "$REGION" >/dev/null 2>&1; then
      info "ECR repo already exists in AWS — importing into workspace state"
      tf import "${tf_var_args[@]}" -var="image_tag=$IMAGE_TAG" \
        aws_ecr_repository.api "$ECR_REPO_NAME" >/dev/null
    else
      tf apply "${tf_var_args[@]}" -var="image_tag=$IMAGE_TAG" \
        -target=aws_ecr_repository.api -auto-approve >/dev/null
    fi
  fi
fi

ECR_URL="$(tf output -raw ecr_repository_url 2>/dev/null)" \
  || die "Could not read ecr_repository_url. Run without --skip-infra first."
ECR_REGISTRY="${ECR_URL%%/*}"

# ── Build + push the API image ───────────────────────────────────────────────
if ! $SKIP_IMAGE; then
  info "Logging in to ECR ($ECR_REGISTRY)"
  aws ecr get-login-password --region "$REGION" \
    | docker login --username AWS --password-stdin "$ECR_REGISTRY" >/dev/null
  ok "Docker logged in to ECR"

  info "Building API image for linux/amd64 (this can take a few minutes)…"
  docker build --platform linux/amd64 \
    -t "$ECR_URL:$IMAGE_TAG" \
    -f "$REPO_ROOT/apps/api/Dockerfile" "$REPO_ROOT"

  info "Pushing $ECR_URL:$IMAGE_TAG"
  docker push "$ECR_URL:$IMAGE_TAG" >/dev/null
  ok "Image pushed"
fi

# ── Apply the full stack ─────────────────────────────────────────────────────
if ! $SKIP_INFRA; then
  info "Applying full Terraform stack ($ENVIRONMENT)"
  APPROVE=(); $AUTO_APPROVE && APPROVE=(-auto-approve)
  tf apply "${tf_var_args[@]}" -var="image_tag=$IMAGE_TAG" "${APPROVE[@]+"${APPROVE[@]}"}"
  ok "Infrastructure applied"
fi

# ── Build + deploy the SPAs ──────────────────────────────────────────────────
if ! $SKIP_SPAS; then
  DOMAIN="$(tf output -raw public_domain)"
  DIST_ID="$(tf output -raw cloudfront_distribution_id)"
  PUBLIC_BUCKET="$(tf output -raw public_web_bucket)"
  ADMIN_BUCKET="$(tf output -raw admin_web_bucket)"
  JUDGE_BUCKET="$(tf output -raw judge_web_bucket)"

  info "Installing workspace deps + building shared components"
  ( cd "$REPO_ROOT" && npm install --no-audit --no-fund >/dev/null && npm run build:components >/dev/null )

  info "Building public-web (base=/, api=/api) and syncing to s3://$PUBLIC_BUCKET"
  ( cd "$REPO_ROOT" \
      && VITE_PUBLIC_BASE_PATH=/ VITE_API_URL=/api \
         npm run build --workspace apps/public-web >/dev/null )
  aws s3 sync "$REPO_ROOT/apps/public-web/dist/" "s3://$PUBLIC_BUCKET/" --delete >/dev/null

  info "Building owner-web (base=/owner, api=/api) and syncing to s3://$PUBLIC_BUCKET/owner"
  ( cd "$REPO_ROOT" \
      && VITE_PUBLIC_BASE_PATH=/owner VITE_API_URL=/api \
         npm run build --workspace apps/owner-web >/dev/null )
  aws s3 sync "$REPO_ROOT/apps/owner-web/dist/" "s3://$PUBLIC_BUCKET/owner/" --delete >/dev/null

  info "Building admin-web (base=/admin, api=/api) and syncing to s3://$ADMIN_BUCKET"
  ( cd "$REPO_ROOT" \
      && VITE_PUBLIC_BASE_PATH=/admin VITE_API_URL=/api VITE_PUBLIC_APP_URL="https://$DOMAIN" \
         npm run build --workspace apps/admin-web >/dev/null )
  aws s3 sync "$REPO_ROOT/apps/admin-web/dist/" "s3://$ADMIN_BUCKET/" --delete >/dev/null
  # CloudFront shares one cache across all behaviors; using a unique fallback
  # filename per SPA avoids cache key collisions with /index.html.
  aws s3 cp "s3://$ADMIN_BUCKET/index.html" "s3://$ADMIN_BUCKET/admin.html" \
    --content-type "text/html" >/dev/null

  info "Building judge-web (base=/judge, api=/api) and syncing to s3://$JUDGE_BUCKET"
  ( cd "$REPO_ROOT" \
      && VITE_PUBLIC_BASE_PATH=/judge VITE_API_URL=/api \
         npm run build --workspace apps/judge-web >/dev/null )
  aws s3 sync "$REPO_ROOT/apps/judge-web/dist/" "s3://$JUDGE_BUCKET/" --delete >/dev/null
  aws s3 cp "s3://$JUDGE_BUCKET/index.html" "s3://$JUDGE_BUCKET/judge.html" \
    --content-type "text/html" >/dev/null

  info "Invalidating CloudFront cache"
  aws cloudfront create-invalidation --distribution-id "$DIST_ID" \
    --paths '/*' >/dev/null
  ok "SPAs deployed and cache invalidated"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
bold ""
ok "Deploy complete for '$ENVIRONMENT'."
if ! $SKIP_INFRA; then
  echo
  info "Next steps / outputs:"
  echo "  • App URL:        https://$(tf output -raw public_domain)"
  echo "  • DNS (first run): terraform -chdir=$TF_DIR output acm_validation_records"
  echo "  •                  terraform -chdir=$TF_DIR output cloudfront_domain  (CNAME target)"
  if [[ "$ENVIRONMENT" == "test" ]]; then
    echo "  • Admin login:    /admin    →  admin@carshow.local  (dev-login)"
    echo "  • Judge app:      /judge"
    echo "  • After 1st boot: set run_seed = false in test.tfvars and re-run to stop re-seeding."
  fi
fi
