#!/usr/bin/env bash
#
# deploy.sh — build, push, and deploy the Father's Day Car Show stack to AWS.
#
# Deploys one of two configurations, each isolated in its own Terraform
# workspace + state so a test deploy can never touch prod:
#
#   test  — cheap, disposable: reduced resources, local dev-login, demo seed,
#           one-command teardown.   (infra/terraform/test.tfvars)
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
  -e, --env <test|prod>   Which configuration to deploy:
                            test = reduced resources, local login, seeded demo
                                   data, easy teardown
                            prod = full resources, protected data

OPTIONS:
  -p, --profile <name>    AWS CLI profile to use (else default credential chain
                          / AWS_PROFILE / SSO). Credentials are never printed.
  -r, --region <region>   AWS region (default: ca-central-1). Must match the
                          region in your tfvars.
  -t, --image-tag <tag>   API image tag to build/deploy (default: git short SHA).
      --skip-infra        Don't run Terraform; deploy app/SPAs to existing infra.
      --skip-image        Don't build/push the API image; reuse --image-tag.
      --skip-spas         Don't build/sync the public-web and admin-web SPAs.
      --plan              Show the Terraform plan for the env and exit.
      --destroy           Tear down the selected environment, then exit.
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

NOTES:
  * Requires a matching tfvars file: infra/terraform/<env>.tfvars
    (copy <env>.tfvars.example and fill it in).
  * The API image is always built for linux/amd64 — App Runner only runs
    x86_64, so this works correctly from Apple Silicon too.
  * Each env lives in its own Terraform workspace ("test" / "prod").
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
    -y|--auto-approve) AUTO_APPROVE=true; shift ;;
    -h|--help)        usage; exit 0 ;;
    *)                usage; die "Unknown argument: $1" ;;
  esac
done

# ── Validate inputs ──────────────────────────────────────────────────────────
[[ -n "$ENVIRONMENT" ]] || { usage; die "--env is required (test or prod)"; }
[[ "$ENVIRONMENT" == "test" || "$ENVIRONMENT" == "prod" ]] || die "--env must be 'test' or 'prod' (got '$ENVIRONMENT')"

VAR_FILE_NAME="$ENVIRONMENT.tfvars"
VAR_FILE="$TF_DIR/$VAR_FILE_NAME"
[[ -f "$VAR_FILE" ]] || die "Missing $VAR_FILE — copy $ENVIRONMENT.tfvars.example to $ENVIRONMENT.tfvars and fill it in."

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
  tf plan "${tf_var_args[@]}" -var="app_runner_image_tag=$PLAN_TAG"
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
  tf destroy "${tf_var_args[@]}" -var="app_runner_image_tag=latest" "${APPROVE[@]}"
  ok "Destroyed $ENVIRONMENT."
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
if ! $SKIP_INFRA; then
  info "Ensuring ECR repository exists"
  tf apply "${tf_var_args[@]}" -var="app_runner_image_tag=$IMAGE_TAG" \
    -target=aws_ecr_repository.api -auto-approve >/dev/null
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
  tf apply "${tf_var_args[@]}" -var="app_runner_image_tag=$IMAGE_TAG" "${APPROVE[@]}"
  ok "Infrastructure applied"
fi

# ── Build + deploy the SPAs ──────────────────────────────────────────────────
if ! $SKIP_SPAS; then
  DOMAIN="$(tf output -raw public_domain)"
  DIST_ID="$(tf output -raw cloudfront_distribution_id)"
  PUBLIC_BUCKET="$(tf output -raw public_web_bucket)"
  ADMIN_BUCKET="$(tf output -raw admin_web_bucket)"

  info "Installing workspace deps + building shared components"
  ( cd "$REPO_ROOT" && npm install --no-audit --no-fund >/dev/null && npm run build:components >/dev/null )

  info "Building public-web (base=/) and syncing to s3://$PUBLIC_BUCKET"
  ( cd "$REPO_ROOT" && VITE_PUBLIC_BASE_PATH=/ npm run build --workspace apps/public-web >/dev/null )
  aws s3 sync "$REPO_ROOT/apps/public-web/dist/" "s3://$PUBLIC_BUCKET/" --delete >/dev/null

  info "Building admin-web (base=/admin, api=/api) and syncing to s3://$ADMIN_BUCKET"
  ( cd "$REPO_ROOT" \
      && VITE_PUBLIC_BASE_PATH=/admin VITE_API_URL=/api VITE_PUBLIC_APP_URL="https://$DOMAIN" \
         npm run build --workspace apps/admin-web >/dev/null )
  aws s3 sync "$REPO_ROOT/apps/admin-web/dist/" "s3://$ADMIN_BUCKET/" --delete >/dev/null

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
    echo "  • Admin login:    /admin  →  admin@carshow.local  (dev-login)"
    echo "  • After 1st boot: set run_seed = false in test.tfvars and re-run to stop re-seeding."
  fi
fi
