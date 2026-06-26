#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="$ROOT/infra/ci/out"
TASK_FILE="$OUT_DIR/task-definition.json"

# DEPLOY_TARGET selects how the API is hosted:
#   ecs — ECS Fargate rolling deploy (event-day stack)
#   ec2 — single year-round EC2 box; pull + restart via SSM Send-Command
DEPLOY_TARGET="${DEPLOY_TARGET:-ecs}"

# SPA + CloudFront vars are common to both targets.
required_env=(
  DEPLOY_ENV AWS_REGION PUBLIC_BUCKET ADMIN_BUCKET JUDGE_BUCKET
  CLOUDFRONT_DISTRIBUTION_ID PUBLIC_URL IMAGE_TAG
)
# Per-target compute vars. INSTANCE_ID is optional for ec2 — when unset it is
# resolved from the instance Name tag in validate().
case "$DEPLOY_TARGET" in
  ecs) required_env+=(ECS_CLUSTER ECS_SERVICE) ;;
esac

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
  # perf deployments are intentionally excluded from CI; use infra/deploy.sh --env perf
  [[ "$DEPLOY_ENV" == "test" || "$DEPLOY_ENV" == "prod" ]] || {
    echo "DEPLOY_ENV must be test or prod" >&2
    exit 1
  }
  [[ -n "${AWS_ROLE_ARN:-}" ]] || {
    echo "AWS_ROLE_ARN is required. Set it in the GitHub environment variables." >&2
    exit 1
  }
  [[ "$IMAGE_TAG" =~ ^[0-9a-f]{40}$ ]] || {
    echo "IMAGE_TAG must be a full Git commit SHA" >&2
    exit 1
  }
  [[ "$DEPLOY_TARGET" == "ecs" || "$DEPLOY_TARGET" == "ec2" ]] || {
    echo "DEPLOY_TARGET must be ecs or ec2" >&2
    exit 1
  }
  if [[ "$DEPLOY_TARGET" == "ecs" ]]; then
    [[ "$ECS_CLUSTER" == "carshow-$DEPLOY_ENV" && "$ECS_SERVICE" == "carshow-$DEPLOY_ENV-api" ]] || {
      echo "Unexpected ECS deployment target" >&2
      exit 1
    }
  else
    # Resolve the box from its Name tag when INSTANCE_ID isn't pinned via env.
    if [[ -z "${INSTANCE_ID:-}" ]]; then
      INSTANCE_ID="$(aws ec2 describe-instances \
        --region "$AWS_REGION" \
        --filters "Name=tag:Name,Values=carshow-${DEPLOY_ENV}-api" \
        "Name=instance-state-name,Values=running" \
        --query 'Reservations[0].Instances[0].InstanceId' \
        --output text 2>/dev/null)"
      export INSTANCE_ID
    fi
    [[ "$INSTANCE_ID" =~ ^i-[0-9a-f]+$ ]] || {
      echo "INSTANCE_ID not set and no running carshow-${DEPLOY_ENV}-api instance found" >&2
      exit 1
    }
  fi
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

  if [[ -n "$running_task_arn" && "$running_task_arn" != "None" ]]; then
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
  else
    # No running task (e.g., crash-loop with 0 healthy tasks). Fall back to
    # the latest registered task definition so the deploy can still proceed.
    echo "[deploy] No running task found — using latest registered task definition as base."
    base_task_definition="$(aws ecs describe-task-definition \
      --region "$AWS_REGION" \
      --task-definition "${ECS_SERVICE}" \
      --query 'taskDefinition.taskDefinitionArn' \
      --output text)"
    [[ -n "$base_task_definition" && "$base_task_definition" != "None" ]] || {
      echo "No registered task definition found for ${ECS_SERVICE}" >&2
      exit 1
    }
  fi

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

run_migrations() {
  local task_definition_arn="$1"
  local network_json task_arn task_id exit_code

  echo "[deploy] Running database migrations (isolated Fargate task)..."

  network_json="$(aws ecs describe-services \
    --region "$AWS_REGION" \
    --cluster "$ECS_CLUSTER" \
    --services "$ECS_SERVICE" \
    --query 'services[0].networkConfiguration' \
    --output json)"

  task_arn="$(aws ecs run-task \
    --region "$AWS_REGION" \
    --cluster "$ECS_CLUSTER" \
    --task-definition "$task_definition_arn" \
    --launch-type FARGATE \
    --network-configuration "$network_json" \
    --overrides '{"containerOverrides":[{"name":"api","command":["--migrate-only"]}]}' \
    --query 'tasks[0].taskArn' \
    --output text)"

  task_id="${task_arn##*/}"
  echo "[deploy] Migration task: $task_id"

  # Wait up to 10 min for the migration task to finish (40 × 15 s)
  AWS_MAX_ATTEMPTS=40 aws ecs wait tasks-stopped \
    --region "$AWS_REGION" \
    --cluster "$ECS_CLUSTER" \
    --tasks "$task_arn" || true

  exit_code="$(aws ecs describe-tasks \
    --region "$AWS_REGION" \
    --cluster "$ECS_CLUSTER" \
    --tasks "$task_arn" \
    --query 'tasks[0].containers[0].exitCode' \
    --output text)"

  if [[ -z "$exit_code" || "$exit_code" == "None" ]]; then
    echo "[deploy] Migration task timed out — check ECS console for task $task_id." >&2
    exit 1
  fi

  if [[ "$exit_code" != "0" ]]; then
    echo "[deploy] Migration task failed (exit $exit_code). Task logs:" >&2
    aws logs filter-log-events \
      --region "$AWS_REGION" \
      --log-group-name "/ecs/${ECS_SERVICE}" \
      --log-stream-names "api/api/$task_id" \
      --query 'events[].message' \
      --output text 2>/dev/null | tail -50 >&2 || true
    echo "[deploy] Migrations failed — deployment aborted. Existing service is unchanged." >&2
    exit 1
  fi

  echo "[deploy] Database migrations applied successfully."
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

  run_migrations "$task_definition_arn"

  aws ecs update-service \
    --region "$AWS_REGION" \
    --cluster "$ECS_CLUSTER" \
    --service "$ECS_SERVICE" \
    --task-definition "$task_definition_arn" \
    --force-new-deployment >/dev/null

  # Default waiter: 40 attempts × 15 s = 10 min. Increase to 80 × 15 s = 20 min
  # so rolling deploys following a prior crash-loop have time to fully drain.
  AWS_MAX_ATTEMPTS=80 aws ecs wait services-stable \
    --region "$AWS_REGION" \
    --cluster "$ECS_CLUSTER" \
    --services "$ECS_SERVICE"
}

deploy_api_ec2() {
  local account_id registry command_id status
  account_id="$(aws sts get-caller-identity --query Account --output text)"
  registry="${account_id}.dkr.ecr.${AWS_REGION}.amazonaws.com"
  ECR_URL="${registry}/carshow/api"

  # x86_64 host (t3) — build linux/amd64 natively on the x64 CI runner.
  aws ecr get-login-password --region "$AWS_REGION" |
    docker login --username AWS --password-stdin "$registry"
  docker build --platform linux/amd64 -t "$ECR_URL:$IMAGE_TAG" -f apps/api/Dockerfile .
  docker push "$ECR_URL:$IMAGE_TAG"

  # Record the released tag so a future instance replacement boots this image.
  aws ssm put-parameter --region "$AWS_REGION" \
    --name "/carshow/${DEPLOY_ENV}/image-tag" --type String --overwrite \
    --value "$IMAGE_TAG" >/dev/null

  echo "[deploy] Sending pull+restart to instance ${INSTANCE_ID} via SSM..."
  command_id="$(aws ssm send-command \
    --region "$AWS_REGION" \
    --instance-ids "$INSTANCE_ID" \
    --document-name "AWS-RunShellScript" \
    --comment "carshow ${DEPLOY_ENV} deploy ${IMAGE_TAG}" \
    --parameters "commands=[\
\"set -euo pipefail\",\
\"cd /opt/carshow\",\
\"sed -i 's#^CARSHOW_IMAGE=.*#CARSHOW_IMAGE=${ECR_URL}:${IMAGE_TAG}#' .env\",\
\"aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${registry}\",\
\"docker compose pull api\",\
\"docker compose up -d api\",\
\"docker image prune -f\"]" \
    --query 'Command.CommandId' --output text)"

  echo "[deploy] SSM command: $command_id — waiting for completion..."
  # The api entrypoint applies `prisma migrate deploy` before serving.
  aws ssm wait command-executed \
    --region "$AWS_REGION" \
    --command-id "$command_id" \
    --instance-id "$INSTANCE_ID" || true

  status="$(aws ssm get-command-invocation \
    --region "$AWS_REGION" \
    --command-id "$command_id" \
    --instance-id "$INSTANCE_ID" \
    --query 'Status' --output text)"

  if [[ "$status" != "Success" ]]; then
    echo "[deploy] SSM command status: $status. Output:" >&2
    aws ssm get-command-invocation \
      --region "$AWS_REGION" \
      --command-id "$command_id" \
      --instance-id "$INSTANCE_ID" \
      --query '{stdout:StandardOutputContent,stderr:StandardErrorContent}' \
      --output text >&2 || true
    exit 1
  fi
  echo "[deploy] Instance updated to ${IMAGE_TAG}."
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
  if [[ "$DEPLOY_TARGET" == "ec2" ]]; then
    deploy_api_ec2
  else
    deploy_api
  fi
  deploy_spas
  curl --fail --silent --show-error --retry 12 --retry-delay 10 --retry-all-errors \
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
      --query 'tasks[].{taskArn:taskArn,taskDefinitionArn:taskDefinitionArn,createdAt:createdAt,stoppedAt:stoppedAt,stoppedReason:stoppedReason,containers:containers[].{name:name,reason:reason,exitCode:exitCode}}' \
      --output json

    echo "Recent logs for stopped tasks:"
    local task_arn task_id
    for task_arn in $task_arns; do
      task_id="${task_arn##*/}"
      echo "Task $task_id:"
      aws logs filter-log-events \
        --region "${AWS_REGION:-ca-central-1}" \
        --log-group-name "/ecs/${ECS_SERVICE:-}" \
        --log-stream-names "api/api/$task_id" \
        --limit 100 \
        --query 'events[].message' \
        --output text
    done
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
