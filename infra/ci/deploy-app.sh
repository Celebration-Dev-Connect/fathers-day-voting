#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="$ROOT/infra/ci/out"
TASK_FILE="$OUT_DIR/task-definition.json"

required_env=(
  DEPLOY_ENV AWS_REGION ECS_CLUSTER ECS_SERVICE PUBLIC_BUCKET ADMIN_BUCKET JUDGE_BUCKET
  CLOUDFRONT_DISTRIBUTION_ID PUBLIC_URL IMAGE_TAG
)

require_tools() {
  local tool
  for tool in aws docker jq npm curl; do
    command -v "$tool" >/dev/null 2>&1 || {
      echo "Required tool not found: $tool" >&2
      exit 1
    }
  done
}

validate() {
  require_tools
  local name
  for name in "${required_env[@]}"; do
    [[ -n "${!name:-}" ]] || {
      echo "Missing required environment variable: $name" >&2
      exit 1
    }
  done

  [[ "$PUBLIC_URL" == https://* ]] || {
    echo "PUBLIC_URL must use HTTPS" >&2
    exit 1
  }
  [[ "$DEPLOY_ENV" == "test" || "$DEPLOY_ENV" == "prod" ]] || {
    echo "DEPLOY_ENV must be test or prod" >&2
    exit 1
  }
  if [[ "$DEPLOY_ENV" == "prod" && -z "${AWS_ROLE_ARN:-}" ]]; then
    echo "Production deployments require AWS_ROLE_ARN for OIDC authentication" >&2
    exit 1
  fi
  [[ "$IMAGE_TAG" =~ ^[0-9a-f]{40}$ ]] || {
    echo "IMAGE_TAG must be a full Git commit SHA" >&2
    exit 1
  }
  [[ "$ECS_CLUSTER" == "carshow-$DEPLOY_ENV" && "$ECS_SERVICE" == "carshow-$DEPLOY_ENV-api" ]] || {
    echo "Unexpected ECS deployment target" >&2
    exit 1
  }
  [[ "$PUBLIC_BUCKET" == "carshow-public-web-$DEPLOY_ENV" \
    && "$ADMIN_BUCKET" == "carshow-admin-web-$DEPLOY_ENV" \
    && "$JUDGE_BUCKET" == "carshow-judge-web-$DEPLOY_ENV" ]] || {
    echo "Unexpected S3 deployment target" >&2
    exit 1
  }
  aws sts get-caller-identity >/dev/null
}

render_task_definition() {
  local running_task_arn base_task_definition
  mkdir -p "$OUT_DIR"

  running_task_arn="$(aws ecs list-tasks \
    --region "$AWS_REGION" \
    --cluster "$ECS_CLUSTER" \
    --service-name "$ECS_SERVICE" \
    --desired-status RUNNING \
    --query 'taskArns[0]' \
    --output text)"
  [[ -n "$running_task_arn" && "$running_task_arn" != "None" ]] || {
    echo "No healthy running task is available to use as the deployment template" >&2
    exit 1
  }
  base_task_definition="$(aws ecs describe-tasks \
    --region "$AWS_REGION" \
    --cluster "$ECS_CLUSTER" \
    --tasks "$running_task_arn" \
    --query 'tasks[0].taskDefinitionArn' \
    --output text)"
  [[ -n "$base_task_definition" && "$base_task_definition" != "None" ]] || {
    echo "Could not determine the running task definition" >&2
    exit 1
  }

  aws ecs describe-task-definition \
    --region "$AWS_REGION" \
    --task-definition "$base_task_definition" \
    --query taskDefinition \
    --output json |
    jq --arg image "$ECR_URL:$IMAGE_TAG" '
      del(
        .taskDefinitionArn,
        .revision,
        .status,
        .requiresAttributes,
        .compatibilities,
        .registeredAt,
        .registeredBy,
        .deregisteredAt
      )
      | .containerDefinitions[0].image = $image
      | .containerDefinitions[0].environment = (
          [.containerDefinitions[0].environment[]
            | select(
                .name != "CLEANUP_REGISTRATIONS_ON_START"
                and .name != "RANDOMIZE_OWNER_CODES_ON_START"
                and .name != "RUN_SEED"
              )
          ] + [{"name":"RUN_SEED","value":"false"}]
        )
    ' >"$TASK_FILE"

  jq -e '
    [.containerDefinitions[].environment[]?.name]
    | index("CLEANUP_REGISTRATIONS_ON_START") == null
      and index("RANDOMIZE_OWNER_CODES_ON_START") == null
  ' "$TASK_FILE" >/dev/null
  jq -e '
    [.containerDefinitions[].environment[]? | select(.name == "RUN_SEED") | .value]
    == ["false"]
  ' "$TASK_FILE" >/dev/null
}

deploy_api() {
  local account_id registry task_definition_arn
  account_id="$(aws sts get-caller-identity --query Account --output text)"
  registry="${account_id}.dkr.ecr.${AWS_REGION}.amazonaws.com"
  ECR_URL="${registry}/carshow/api"
  export ECR_URL

  aws ecr get-login-password --region "$AWS_REGION" |
    docker login --username AWS --password-stdin "$registry"
  docker build --platform linux/amd64 -t "$ECR_URL:$IMAGE_TAG" -f apps/api/Dockerfile .
  docker push "$ECR_URL:$IMAGE_TAG"

  render_task_definition
  task_definition_arn="$(aws ecs register-task-definition \
    --region "$AWS_REGION" \
    --cli-input-json "file://$TASK_FILE" \
    --query taskDefinition.taskDefinitionArn \
    --output text)"

  aws ecs update-service \
    --region "$AWS_REGION" \
    --cluster "$ECS_CLUSTER" \
    --service "$ECS_SERVICE" \
    --task-definition "$task_definition_arn" \
    --force-new-deployment >/dev/null

  aws ecs wait services-stable \
    --region "$AWS_REGION" \
    --cluster "$ECS_CLUSTER" \
    --services "$ECS_SERVICE"
}

deploy_spas() {
  npm run build:components

  VITE_PUBLIC_BASE_PATH=/ VITE_API_URL=/api \
    npm run build --workspace @carshow/public-web
  aws s3 sync apps/public-web/dist/ "s3://$PUBLIC_BUCKET/" --delete

  VITE_PUBLIC_BASE_PATH=/owner VITE_API_URL=/api \
    npm run build --workspace @carshow/owner-web
  aws s3 sync apps/owner-web/dist/ "s3://$PUBLIC_BUCKET/owner/" --delete

  VITE_PUBLIC_BASE_PATH=/admin VITE_API_URL=/api VITE_PUBLIC_APP_URL="$PUBLIC_URL" \
    npm run build --workspace @carshow/admin-web
  aws s3 sync apps/admin-web/dist/ "s3://$ADMIN_BUCKET/" --delete
  aws s3 cp "s3://$ADMIN_BUCKET/index.html" "s3://$ADMIN_BUCKET/admin.html" \
    --content-type text/html

  VITE_PUBLIC_BASE_PATH=/judge VITE_API_URL=/api \
    npm run build --workspace @carshow/judge-web
  aws s3 sync apps/judge-web/dist/ "s3://$JUDGE_BUCKET/" --delete
  aws s3 cp "s3://$JUDGE_BUCKET/index.html" "s3://$JUDGE_BUCKET/judge.html" \
    --content-type text/html

  aws cloudfront create-invalidation \
    --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
    --paths "/*" >/dev/null
}

deploy() {
  validate
  deploy_api
  deploy_spas
  curl --fail --silent --show-error --retry 12 --retry-delay 10 \
    "$PUBLIC_URL/api/health"
  echo
  echo "Deployed commit $IMAGE_TAG to $PUBLIC_URL"
}

diagnostics() {
  set +e
  echo "ECS service deployments and recent events:"
  aws ecs describe-services \
    --region "${AWS_REGION:-ca-central-1}" \
    --cluster "${ECS_CLUSTER:-}" \
    --services "${ECS_SERVICE:-}" \
    --query 'services[0].{deployments:deployments,events:events[0:10]}' \
    --output json

  echo "Load balancer target health:"
  local target_group_arn
  target_group_arn="$(aws ecs describe-services \
    --region "${AWS_REGION:-ca-central-1}" \
    --cluster "${ECS_CLUSTER:-}" \
    --services "${ECS_SERVICE:-}" \
    --query 'services[0].loadBalancers[0].targetGroupArn' \
    --output text)"
  if [[ -n "$target_group_arn" && "$target_group_arn" != "None" ]]; then
    aws elbv2 describe-target-health \
      --region "${AWS_REGION:-ca-central-1}" \
      --target-group-arn "$target_group_arn" \
      --output json
  fi

  echo "Recently stopped task reasons:"
  local task_arns
  task_arns="$(aws ecs list-tasks \
    --region "${AWS_REGION:-ca-central-1}" \
    --cluster "${ECS_CLUSTER:-}" \
    --service-name "${ECS_SERVICE:-}" \
    --desired-status STOPPED \
    --max-results 10 \
    --query taskArns \
    --output text)"
  if [[ -n "$task_arns" ]]; then
    # shellcheck disable=SC2086
    aws ecs describe-tasks \
      --region "${AWS_REGION:-ca-central-1}" \
      --cluster "${ECS_CLUSTER:-}" \
      --tasks $task_arns \
      --query 'tasks[].{taskArn:taskArn,stoppedReason:stoppedReason,containers:containers[].{name:name,reason:reason,exitCode:exitCode}}' \
      --output json
  fi

  echo "Recent API logs:"
  aws logs filter-log-events \
    --region "${AWS_REGION:-ca-central-1}" \
    --log-group-name "/ecs/${ECS_SERVICE:-}" \
    --limit 100 \
    --query 'events[].message' \
    --output text
}

cleanup() {
  rm -rf "$OUT_DIR"
  docker builder prune --force --filter "until=168h" >/dev/null 2>&1 || true
}

case "$MODE" in
  validate) validate ;;
  deploy) deploy ;;
  diagnostics) diagnostics ;;
  cleanup) cleanup ;;
  *)
    echo "Usage: $0 {validate|deploy|diagnostics|cleanup}" >&2
    exit 2
    ;;
esac
