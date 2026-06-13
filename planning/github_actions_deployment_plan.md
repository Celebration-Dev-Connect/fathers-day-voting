# GitHub Actions Deployment Plan

## Recommendation

Use a hybrid GitHub Actions model:

- Run pull-request CI on GitHub-hosted runners without AWS access.
- Run test and production deployments on dedicated self-hosted Linux x64
  runners hosted in isolated Proxmox LXC containers.
- Follow the Proxmox LXC, Docker, dedicated runner user, labels, and systemd
  service approach described in:
  <https://blog.ricardof.dev/setup-self-hosted-github-action-runner-in-minutes/>
- Keep Terraform infrastructure applies manual until Terraform drift and
  missing AWS read permissions are resolved.

The repository must remain private before enabling self-hosted runners. Do not
allow workflows from forks or untrusted branches to run on deployment runners.

## Runner Architecture

Create two separate LXC containers and GitHub runners:

| Runner | GitHub labels | Purpose | AWS access |
|---|---|---|---|
| Test | `self-hosted`, `Linux`, `X64`, `carshow`, `deploy-test` | Deploy merged `main` commits to test | Test resources only |
| Production | `self-hosted`, `Linux`, `X64`, `carshow`, `deploy-prod` | Manually promote a tested commit | Production resources only |

Do not use one shared runner for both environments. A compromised test job must
not inherit production credentials or access.

Recommended LXC baseline:

- Debian or Ubuntu unprivileged LXC with Docker support.
- At least 4 CPU cores, 8 GB RAM, and 20 GB disk for Node installs and Docker
  image builds.
- Dedicated non-root `runner` user with Docker group access.
- Runner installed as a systemd service so it restarts after reboots.
- Outbound access to GitHub, npm, AWS APIs, ECR, and application health URLs.
- No inbound public ports; administer from the private network only.
- Automatic OS security updates and monitored disk usage.

Register each runner at repository scope. Use runner groups if available to
restrict the production runner to the production deployment workflow.

## Desired Release Flow

1. Pull requests run build, typecheck, and API tests on `ubuntu-latest`.
2. A merge to `main` triggers a deployment to the GitHub `test` environment on
   `[self-hosted, Linux, X64, carshow, deploy-test]`.
3. Test deployment builds one API image, deploys it to ECS, waits for
   stability, deploys the SPAs, and verifies:
   `https://carshow-test.chasesspace.com/api/health`.
4. Production is a manual workflow dispatch that promotes the same tested
   commit through the protected GitHub `prod` environment.
5. Production runs only on
   `[self-hosted, Linux, X64, carshow, deploy-prod]`, requires an approving
   reviewer, and verifies:
   `https://visit.fathersdaycarshow.ca/api/health`.

Use deployment concurrency so only one deployment per environment can run at a
time. Never cancel an in-progress production deployment automatically.

## Runner Setup

Following the referenced guide:

1. Create the Proxmox LXC with Docker available.
2. Create a dedicated `runner` user and add it to the Docker group.
3. Verify `docker info` works as the runner user.
4. In GitHub, open repository **Settings → Actions → Runners → New
   self-hosted runner** and follow the Linux x64 registration commands.
5. Add the environment-specific labels listed above.
6. Run a harmless manual test workflow to confirm label routing.
7. Install and start the runner as a systemd service:

   ```sh
   sudo ./svc.sh install runner
   sudo ./svc.sh start
   ```

8. Configure a root-owned post-job hook outside the checkout directory to:
   - Remove the completed job workspace.
   - Remove temporary deployment files.
   - Prune old Docker build cache while retaining recently used layers.
   - Never delete active containers or all ECR images indiscriminately.

The runner registration token is short-lived and must not be saved. Protect the
runner service files, deployment credentials, and hook scripts from modification
by workflow jobs.

## AWS Authentication

### Preferred Final State

Use GitHub OIDC from the self-hosted runners with separate roles:

```text
carshow-github-test-deploy
carshow-github-prod-deploy
```

Restrict each role trust policy to this repository and matching GitHub
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

Self-hosting does not remove the benefits of OIDC: credentials remain
short-lived and cannot be recovered from the runner disk.

### Bootstrap State

Until OIDC roles are configured, the test runner may use the existing
key/secret-only IAM deploy user:

```text
arn:aws:iam::123456789012:user/carshow-deploy-caleb
```

- Store credentials in an AWS profile or root-owned environment file on the
  test runner, never in the repository or workflow YAML.
- Do not expose the credential file to pull-request jobs.
- Do not use this shared deploy user for automated production deployments.
- Rotate the key after OIDC is enabled.

Production automation should wait for a dedicated production role or dedicated
production-only IAM user with least-privilege access.

## Required App-Deploy Permissions

Scope resources to `carshow-test-*` or `carshow-prod-*` wherever AWS supports
resource-level permissions.

Each environment's deployment identity needs:

- `sts:GetCallerIdentity`
- ECR authentication, image layer upload, and image push for `carshow/api`
- ECS task-definition describe/register and service describe/update
- `iam:PassRole` only for the matching ECS execution and task roles
- S3 list, put, get, and delete for the matching public/admin/judge buckets
- CloudFront invalidation for the matching distribution
- ECS, ELB, and log read permissions required to verify and diagnose rollouts

Required rollout diagnostics include:

- `ecs:ListTasks`
- `ecs:DescribeTasks`
- `ecs:DescribeServices`
- `ecs:DescribeTaskDefinition`
- `logs:DescribeLogGroups`
- `logs:DescribeLogStreams`
- `logs:GetLogEvents`
- `logs:FilterLogEvents`
- `elasticloadbalancing:DescribeTargetHealth`

Full Terraform refresh/plan currently also lacks:

- `cloudwatch:DescribeAlarms`
- `cloudwatch:GetDashboard`
- `application-autoscaling:ListTagsForResource`

Application deployment identities should not have general Terraform
create/delete permissions, database password mutation permissions, secret value
read permissions, console access, or AWS SSO access.

## Repository Changes

Implement:

```text
.github/workflows/ci.yml
.github/workflows/self-hosted-runner-test.yml
.github/workflows/deploy-test.yml
.github/workflows/deploy-prod.yml
.github/workflows/reusable-app-deploy.yml
infra/ci/deploy-app.sh
infra/ci/runner-post-job.sh
```

The reusable deployment workflow should:

1. Target the environment-specific self-hosted runner label.
2. Check out the exact requested commit.
3. Install dependencies with `npm ci`.
4. Run the full build and API tests.
5. Authenticate to AWS using OIDC or the approved bootstrap profile.
6. Build and push `carshow/api:<full-commit-sha>`.
7. Read the task definition from a currently healthy running task, replace
   only the image, and preserve its roles, secrets, logging, and resources.
8. Assert that `CLEANUP_REGISTRATIONS_ON_START` and
   `RANDOMIZE_OWNER_CODES_ON_START` are absent and `RUN_SEED=false`.
9. Deploy ECS and wait for service stability.
10. On failure, print stopped-task reasons, target health, and relevant
    CloudWatch logs before failing the job.
11. Build and sync each SPA to its environment buckets.
12. Invalidate the environment's CloudFront distribution.
13. Verify `/api/health` and record the deployed commit SHA.

Use full commit SHA image tags, not short SHA or `latest`.

## GitHub Environment Protection

Create GitHub environments named `test` and `prod`.

Environment variables:

| Variable | Test | Production |
|---|---|---|
| `AWS_ROLE_ARN` | Test deploy role ARN | Production deploy role ARN |
| `AWS_REGION` | `ca-central-1` | `ca-central-1` |
| `ECS_CLUSTER` | `carshow-test` | `carshow-prod` |
| `ECS_SERVICE` | `carshow-test-api` | `carshow-prod-api` |
| `PUBLIC_BUCKET` | `carshow-public-web-test` | `carshow-public-web-prod` |
| `ADMIN_BUCKET` | `carshow-admin-web-test` | `carshow-admin-web-prod` |
| `JUDGE_BUCKET` | `carshow-judge-web-test` | `carshow-judge-web-prod` |
| `CLOUDFRONT_DISTRIBUTION_ID` | Test distribution ID | Production distribution ID |
| `PUBLIC_URL` | `https://carshow-test.chasesspace.com` | `https://visit.fathersdaycarshow.ca` |

Production protections:

- Required reviewer when supported by the repository billing plan. GitHub
  currently rejects this rule for the private repository.
- Restrict deployment branches to `main`.
- Manual workflow dispatch only.
- Production runner restricted to the production workflow/environment.
- Prevent concurrent production deployments.

Repository Actions protections:

- Disable workflows from forked pull requests on self-hosted runners.
- Require reviewed changes for `.github/workflows/**` and `infra/ci/**`.
- Use CODEOWNERS for deployment workflow and script changes.
- Pin third-party actions to immutable commit SHAs before production use.

## Prerequisites And Blockers

Before enabling automatic API deployments:

1. Confirm the repository is private.
2. Provision and harden the test LXC runner.
3. Grant the missing ECS and CloudWatch diagnostic permissions.
4. Resolve the test ECS startup issue; new test tasks currently stop after
   target registration while ECS preserves the previous healthy task.
5. Grant permission to read the healthy running task definition used as the
   safe deployment template.
6. Confirm test and production use `RUN_SEED=false`.
7. Validate the test runner with the harmless manual workflow.
8. Validate one manual test deployment before enabling automatic deploys from
   `main`.
9. Provision a separate production LXC and production-only AWS identity.
10. Validate production promotion through GitHub environment approval.

## Implementation Order

1. Provision the isolated test runner using the referenced Proxmox LXC guide.
2. Add CI on GitHub-hosted runners and the harmless self-hosted runner test.
3. Grant test deployment and diagnostic AWS permissions.
4. Add the reusable app-deploy workflow and deploy to test manually.
5. Stabilize test ECS deployments, then enable automatic test deploys on
   `main`.
6. Provision the separate production runner and production-only AWS role.
7. Add protected manual production promotion of an already-tested commit.
8. Migrate the test runner from the bootstrap IAM key to OIDC.
9. Consider Terraform plan/apply automation later as a separate, more
   privileged workflow.
