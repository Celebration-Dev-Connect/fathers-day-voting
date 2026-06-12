# Car Show Deployment Runbook

This is the source of truth for routine test and production deployments.

## Authentication

The repository uses the existing key/secret-only IAM deploy user:

```text
arn:aws:iam::123456789012:user/carshow-deploy-caleb
```

It has no console password and does not use AWS SSO. The ignored repository
`.env` contains its `AWS_ACCESS_KEY_ID` and `AWS_SECRET`. `infra/deploy.sh`
automatically sources `.env` and maps `AWS_SECRET` to
`AWS_SECRET_ACCESS_KEY`.

Do not print, commit, or copy `.env` values. Do not ask for SSO when the deploy
script authenticates successfully.

## Pre-Deploy

```sh
git status --short --branch
git pull --ff-only origin main
npm install
npm run build
npm test --workspace @carshow/api
```

Stop if the worktree contains unexpected changes or verification fails.

## Routine Application Deployment

Always use `--auto-approve`; otherwise the script may wait for an interactive
confirmation prompt.

Test:

```sh
./infra/deploy.sh --env test --skip-infra --auto-approve
```

Production:

```sh
./infra/deploy.sh --env prod --skip-infra --auto-approve
```

This builds and pushes the API image tagged with the current short Git SHA,
builds/syncs all SPAs, and invalidates CloudFront.

Important: with `--skip-infra`, the script does not update the ECS service. If
the change includes API code, promote the pushed image using the ECS procedure
below. Frontend-only changes need no ECS update.

## ECS API Promotion

Use the current service task definition as the template. Preserve all existing
environment variables, secrets, roles, networking, logging, and resource
settings. Change only the container image and remove any one-time flags.

Environment mapping:

| Environment | Cluster | Service | Task family | Desired count |
|---|---|---|---|---|
| test | `carshow-test` | `carshow-test-api` | `carshow-test-api` | 1 |
| prod | `carshow-prod` | `carshow-prod-api` | `carshow-prod-api` | 2 |

Before registering a task definition, ensure:

- Image is
  `123456789012.dkr.ecr.ca-central-1.amazonaws.com/carshow/api:<git-short-sha>`.
- `CLEANUP_REGISTRATIONS_ON_START` is absent.
- `RANDOMIZE_OWNER_CODES_ON_START` is absent.
- Production has `RUN_SEED=false`.
- Test should also have `RUN_SEED=false` after its initial seed. Re-seeding on
  every startup can exceed the load-balancer health window.

After registering the new revision:

```sh
aws ecs update-service \
  --cluster <cluster> \
  --service <service> \
  --task-definition <task-family>:<revision> \
  --region ca-central-1

aws ecs wait services-stable \
  --cluster <cluster> \
  --services <service> \
  --region ca-central-1
```

Do not deploy the API to production until the same image is healthy in test.
ECS keeps the prior healthy task serving if a new task fails health checks.

## Verification

```sh
curl -fsS https://carshow-test.chasesspace.com/api/health
curl -fsS https://visit.fathersdaycarshow.ca/api/health
```

Expected response:

```json
{"ok":true}
```

Also confirm the ECS service uses the intended task definition/image and has
its desired number of running tasks.

## Full Terraform Deployments

Do not run a full Terraform apply as part of a routine application deployment.
Run a plan first:

```sh
./infra/deploy.sh --env test --plan --auto-approve
./infra/deploy.sh --env prod --plan --auto-approve
```

As of June 12, 2026, the deploy user can authenticate and routine app deploys
work, but full Terraform refresh/plan still lacks at least:

- `cloudwatch:DescribeAlarms`
- `cloudwatch:GetDashboard`
- `application-autoscaling:ListTagsForResource`

Useful deployment diagnostics also currently lack:

- `ecs:ListTasks`
- `ecs:DescribeTasks`
- `logs:DescribeLogStreams`
- `logs:FilterLogEvents`

Review every Terraform plan carefully. Do not apply a plan that rotates
secrets, clears URLs, changes the shared ECR environment tag, or otherwise
contains unexplained drift.

## URLs

- Test: `https://carshow-test.chasesspace.com`
- Production: `https://visit.fathersdaycarshow.ca`
- Production CloudFront fallback:
  `https://d1eujn6wmp8c9o.cloudfront.net`
- Region: `ca-central-1`

