# Self-Hosted GitHub Deployment Setup

The deployment workflows use separate self-hosted runners and GitHub
Environments for `test` and `prod`.

## Runner Labels

- Test: `self-hosted`, `Linux`, `X64`, `carshow`, `deploy-test`
- Production: `self-hosted`, `Linux`, `X64`, `carshow`, `deploy-prod`

Each runner requires Node-compatible system libraries, Docker, AWS CLI v2,
`jq`, `curl`, and outbound access to GitHub, npm, AWS, ECR, and the application
URLs.

## GitHub Environments

Create GitHub Environments named `test` and `prod`. Add these environment
variables:

| Variable | Test | Production |
|---|---|---|
| `AWS_REGION` | `ca-central-1` | `ca-central-1` |
| `ECS_CLUSTER` | `carshow-test` | `carshow-prod` |
| `ECS_SERVICE` | `carshow-test-api` | `carshow-prod-api` |
| `PUBLIC_BUCKET` | `carshow-public-web-test` | `carshow-public-web-prod` |
| `ADMIN_BUCKET` | `carshow-admin-web-test` | `carshow-admin-web-prod` |
| `JUDGE_BUCKET` | `carshow-judge-web-test` | `carshow-judge-web-prod` |
| `CLOUDFRONT_DISTRIBUTION_ID` | Test distribution ID | Production distribution ID |
| `PUBLIC_URL` | `https://carshow-test.chasesspace.com` | `https://visit.fathersdaycarshow.ca` |
| `AWS_ROLE_ARN` | Optional test OIDC role ARN | Production OIDC role ARN |

If `AWS_ROLE_ARN` is empty, the workflow uses the AWS credentials already
configured on the runner. This is allowed only as the temporary test-runner
bootstrap method. Production should use its dedicated OIDC role.

The `prod` Environment is restricted to the `main` branch. GitHub rejected the
required-reviewer rule because the repository's current billing plan does not
support that protection for this private repository. Production therefore
remains manual, requires an explicit full commit SHA, and will not run until a
separate production runner and OIDC role are configured.

## Workflows

- `deploy-test.yml`: manual test deployment of the workflow commit.
- `deploy-prod.yml`: manual production deployment requiring the full commit SHA
  that was already verified in test.
- `reusable-app-deploy.yml`: shared build, test, ECS, SPA, health verification,
  diagnostics, and cleanup workflow.

The deployment script:

- Rejects cross-environment ECS and S3 targets.
- Requires an immutable full Git SHA image tag.
- Copies the current task definition to preserve roles, secrets, logging, and
  resource settings.
- Removes one-time cleanup/randomization flags and forces `RUN_SEED=false`.
- Waits for ECS stability before publishing the SPAs.
- Prints ECS stopped-task reasons, target health, and API logs on failure.

## Required AWS Diagnostics

The deployment identity must have:

- `ecs:ListTasks`
- `ecs:DescribeTasks`
- `ecs:DescribeServices`
- `ecs:DescribeTaskDefinition`
- `logs:DescribeLogGroups`
- `logs:DescribeLogStreams`
- `logs:GetLogEvents`
- `logs:FilterLogEvents`
- `elasticloadbalancing:DescribeTargetHealth`

See `planning/github_actions_deployment_plan.md` for the complete
least-privilege deployment permission plan.
