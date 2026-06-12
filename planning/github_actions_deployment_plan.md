# GitHub Actions Deployment Plan

## Recommendation

Use GitHub Actions for application deployments only:

- Build and test the repository.
- Build one API image tagged with the full commit SHA.
- Push the image to ECR.
- Deploy the API to ECS.
- Build and sync the SPAs to S3.
- Invalidate CloudFront.
- Verify the public health endpoint.

Keep Terraform infrastructure applies manual until the current Terraform drift
and missing read permissions are resolved. The current `infra/deploy.sh` is
excellent for local operation, but even `--skip-infra` still requires ignored
local `tfvars`, initializes Terraform, selects a workspace, and reads Terraform
outputs. A CI workflow should not depend on those local files.

## Desired Release Flow

1. Pull requests run build, typecheck, and API tests without AWS access.
2. A merge to `main` automatically deploys the commit to the GitHub `test`
   environment.
3. Test deployment waits for ECS stability and verifies:
   `https://carshow-test.chasesspace.com/api/health`.
4. Production is a manual promotion of the same tested commit through the
   GitHub `prod` environment.
5. The `prod` environment requires an approving reviewer and only permits
   deployments from `main`.
6. Production waits for ECS stability and verifies:
   `https://visit.fathersdaycarshow.ca/api/health`.

Use deployment concurrency so only one deployment per environment runs at a
time.

## AWS Authentication

Use GitHub OIDC, not the existing deploy user's long-lived key.

Create the GitHub OIDC provider once:

```text
Provider URL: https://token.actions.githubusercontent.com
Audience:     sts.amazonaws.com
```

Create separate roles:

```text
carshow-github-test-deploy
carshow-github-prod-deploy
```

Restrict each role trust policy to this repository and its matching GitHub
environment:

```text
repo:chuget/fathers-day-voting:environment:test
repo:chuget/fathers-day-voting:environment:prod
```

Workflows require:

```yaml
permissions:
  contents: read
  id-token: write
```

Store only the role ARN and non-secret deployment configuration as GitHub
environment variables. Do not store AWS access keys.

## Required App-Deploy Permissions

Scope resources to `carshow-test-*` or `carshow-prod-*` wherever AWS supports
resource-level permissions.

The test/prod deployment roles need:

- `sts:GetCallerIdentity`
- ECR authentication, image layer upload, and image push for `carshow/api`
- ECS task-definition describe/register and service describe/update
- `iam:PassRole` only for the matching ECS execution/task roles
- S3 list, put, and delete for the matching public/admin/judge web buckets
- CloudFront invalidation for the matching distribution
- ECS/ELB/log read permissions required to verify or diagnose a rollout

At minimum, include these diagnostic reads that the current deploy user lacks:

- `ecs:ListTasks`
- `ecs:DescribeTasks`
- `logs:DescribeLogStreams`
- `logs:FilterLogEvents`
- `elasticloadbalancing:DescribeTargetHealth`

The application deployment roles should not have Terraform infrastructure
create/delete permissions, database password mutation permissions, or secret
value read permissions.

## Repository Changes

Implement these files:

```text
.github/workflows/ci.yml
.github/workflows/deploy-test.yml
.github/workflows/deploy-prod.yml
.github/workflows/reusable-app-deploy.yml
infra/ci/deploy-app.sh
infra/ci/task-definition-test.json
infra/ci/task-definition-prod.json
```

The reusable workflow should:

1. Check out the exact requested commit.
2. Install dependencies with `npm ci`.
3. Run build and API tests.
4. Configure short-lived AWS credentials using OIDC.
5. Build and push `carshow/api:<full-commit-sha>`.
6. Render a version-controlled ECS task-definition template with that image.
7. Assert safety before registering it:
   - `CLEANUP_REGISTRATIONS_ON_START` absent.
   - `RANDOMIZE_OWNER_CODES_ON_START` absent.
   - `RUN_SEED=false`.
8. Deploy the ECS task definition and wait for service stability.
9. Build each SPA with the correct base/API/public URL.
10. Sync SPA output to the environment's buckets.
11. Invalidate the environment's CloudFront distribution.
12. Verify `/api/health`.

Use full commit SHA image tags, not short SHA or `latest`, for traceability.

## GitHub Environment Configuration

Create GitHub environments named `test` and `prod`.

Environment variables:

| Variable | Test | Production |
|---|---|---|
| `AWS_ROLE_ARN` | test deploy role ARN | prod deploy role ARN |
| `AWS_REGION` | `ca-central-1` | `ca-central-1` |
| `ECS_CLUSTER` | `carshow-test` | `carshow-prod` |
| `ECS_SERVICE` | `carshow-test-api` | `carshow-prod-api` |
| `PUBLIC_BUCKET` | `carshow-public-web-test` | `carshow-public-web-prod` |
| `ADMIN_BUCKET` | `carshow-admin-web-test` | `carshow-admin-web-prod` |
| `JUDGE_BUCKET` | `carshow-judge-web-test` | `carshow-judge-web-prod` |
| `CLOUDFRONT_DISTRIBUTION_ID` | test distribution ID | prod distribution ID |
| `PUBLIC_URL` | `https://carshow-test.chasesspace.com` | `https://visit.fathersdaycarshow.ca` |

Production protection:

- Required reviewer.
- Restrict deployment branches to `main`.
- Prevent concurrent production deployments.

## Prerequisites And Blockers

Before enabling automatic API deployments:

1. Resolve the test ECS startup issue. New test tasks currently stop after
   target registration while ECS preserves the previous healthy task.
2. Grant diagnostic permissions so stopped-task reasons and CloudWatch logs can
   be inspected.
3. Create stable, version-controlled task-definition templates. Do not copy a
   task definition from the currently running service on every CI deployment.
4. Confirm test and production both use `RUN_SEED=false`.
5. Validate the GitHub test role with a manual workflow dispatch.
6. Validate production promotion with environment approval before enabling any
   automatic production trigger.

## Implementation Order

1. Add CI-only workflow.
2. Create AWS OIDC provider and test deploy role.
3. Add reusable app-deploy workflow and deploy to test manually.
4. Stabilize test deployments and make test automatic on `main`.
5. Create tightly scoped production role and protected GitHub environment.
6. Add manual production promotion of an already-tested commit.
7. Consider Terraform plan/apply automation later as a separate, more
   privileged workflow.

