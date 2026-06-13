# GitHub Actions Deployment Plan

## Goal

A fully automated, hardened CI/CD pipeline where GitHub Actions is the only
path to deploy any environment. No IAM user with long-lived deploy credentials
exists. Local machines cannot push application code or run Terraform against
test, perf, or production. All deployments are reproducible, audited, and
triggered from reviewed commits on the `main` branch.

---

## Identity Architecture

Four OIDC roles, no IAM deploy users. All roles are assumed ephemerally by
GitHub Actions; credentials exist only for the duration of a job and are never
stored on disk.

| Role | GitHub Environment(s) | Scope |
|---|---|---|
| `carshow-github-infra-nonprod` | `infra-nonprod` | Full Terraform for test and perf workspaces |
| `carshow-github-infra-prod` | `infra-prod` | Full Terraform for prod workspace |
| `carshow-github-test-deploy` | `test` | App deploy: test ECR, ECS, S3, CloudFront |
| `carshow-github-prod-deploy` | `prod` | App deploy: prod ECR, ECS, S3, CloudFront |

**Why four roles instead of two:**

Terraform operations for any environment necessarily require broad IAM permissions
because the target resources do not yet exist at the time `Create*` calls are
made (so resource-level ARN scoping is impossible for most AWS Create APIs). App
deploys, by contrast, operate on already-existing resources and can be tightly
scoped by ARN. Separating Terraform and app-deploy roles keeps the blast radius
of a compromised app-deploy job limited to content syncs and ECS updates — it
cannot mutate infrastructure, rotate secrets, or alter the database.

Prod infra is separated from nonprod infra for the same reason: a Terraform
mistake or a compromised nonprod infra job cannot touch production resources.

**ECR is shared.** The single `carshow/api` ECR repository stores images from
all environments, differentiated by full commit SHA tag. Both `test-deploy` and
`prod-deploy` roles need ECR push. Since ECR images are immutable at the SHA
level, a test-pushed image cannot be substituted at the prod layer.

**Perf uses the nonprod infra and a separate perf deploy role.** The perf
environment is a temporary, full-production-sized stack spun up for pre-event
load testing. It is provisioned via `infra-nonprod` role (Terraform) and app-
deployed via a `carshow-github-perf-deploy` OIDC role scoped exclusively to perf
resources.

Full role list with perf included:

| Role | GitHub Environment(s) | Scope |
|---|---|---|
| `carshow-github-infra-nonprod` | `infra-nonprod` | Terraform: test and perf workspaces |
| `carshow-github-infra-prod` | `infra-prod` | Terraform: prod workspace |
| `carshow-github-test-deploy` | `test` | App deploy: test resources only |
| `carshow-github-perf-deploy` | `perf` | App deploy: perf resources only |
| `carshow-github-prod-deploy` | `prod` | App deploy: prod resources only |

---

## Workflow Inventory

| File | Trigger | Runner | AWS Role |
|---|---|---|---|
| `ci.yml` | PR opened/updated | Self-hosted (`carshow`) | None |
| `terraform-plan.yml` | PR opened/updated (infra paths changed) | Self-hosted (`carshow`) | `infra-nonprod` or `infra-prod` based on target |
| `terraform-apply.yml` | `workflow_dispatch` | Self-hosted (`carshow`) | `infra-nonprod` or `infra-prod` |
| `deploy-test.yml` | Push to `main` + `workflow_dispatch` | Self-hosted (`carshow`) | `test-deploy` |
| `deploy-perf.yml` | `workflow_dispatch` | Self-hosted (`carshow`) | `perf-deploy` |
| `deploy-prod.yml` | `workflow_dispatch` (commit SHA required) | Self-hosted (`carshow`) | `prod-deploy` |
| `reusable-app-deploy.yml` | Called by deploy-*.yml | Passed from caller | Passed from caller |

### `ci.yml` (PR Checks)

Runs on the shared self-hosted runner. No AWS access. Steps:

1. `npm ci`
2. `npm run build`
3. `npm run typecheck`
4. `npm test --workspace @carshow/api`

Validates every PR before merge. Failure blocks the merge.

### `terraform-plan.yml`

Triggered on PRs that modify `infra/terraform/**` or `infra/iam/**`. Runs on
the shared runner. Posts the Terraform plan as a PR comment for human review
before any apply. Uses the appropriate infra OIDC role based on an input
(`nonprod` or `prod`). The plan is read-only; it never applies.

### `terraform-apply.yml`

Manual `workflow_dispatch` only. Inputs: `environment` (test / perf / prod) and
`action` (apply / plan / destroy / suspend / resume). Runs on the appropriate
self-hosted infra runner. Uses the `infra-nonprod` role for test and perf, the
`infra-prod` role for prod. Calls `infra/deploy.sh` for the infra-only steps
(skipping image build and SPA sync).

Production applies require the `infra-prod` GitHub environment, which is
restricted to the `main` branch.

### `deploy-test.yml`

Triggered automatically on every push to `main`. Calls `reusable-app-deploy.yml`
targeting the `test` GitHub environment on the shared self-hosted runner.
No commit SHA input needed — always deploys `github.sha`.

### `deploy-perf.yml`

Manual `workflow_dispatch` only. Inputs: `commit_sha` (the exact SHA to deploy).
Targets the `perf` GitHub environment on the shared runner. Used to deploy a
build to the perf stack immediately after provisioning it via `terraform-apply.yml`.

### `deploy-prod.yml`

Manual `workflow_dispatch` only. Input: `commit_sha` (required) — the full SHA
of a commit that was already verified healthy in test. Targets the `prod` GitHub
environment on the shared runner. The reusable workflow verifies that the SHA is
an ancestor of `main` before proceeding.

### `reusable-app-deploy.yml`

Shared build-and-deploy logic called by all three deploy workflows. Key
properties:

- Checks out the exact commit SHA, never the branch tip.
- Verifies the SHA is on `main` (`git merge-base --is-ancestor`).
- `npm ci && npm run build && npm test`
- Configures AWS credentials via OIDC only. `AWS_ROLE_ARN` is **required**; the
  workflow fails immediately if it is missing or empty. There is no ambient-
  credential fallback.
- Calls `infra/ci/deploy-app.sh deploy` (image build + ECS deploy + SPA sync +
  CloudFront invalidation + health check).
- On failure: calls `infra/ci/deploy-app.sh diagnostics`.
- Always calls `infra/ci/deploy-app.sh cleanup`.

---

## Self-Hosted Runner Architecture

All jobs run on a single self-hosted runner with labels
`[self-hosted, Linux, X64, carshow, deploy-test]`.

Environment isolation is provided by the OIDC trust policy, not by runner
separation. Each deploy job acquires credentials only for its environment's
OIDC role at job start; those credentials expire when the job ends and are never
written to disk. The runner itself carries no AWS credentials between jobs.
A test job and a prod job can run on the same machine safely because the prod
role can only be assumed by GitHub's OIDC service when the calling workflow
is running in the `prod` GitHub environment — a condition enforced by the
token issuer, not by the runner.

Concurrent jobs on the same runner are prevented by the `concurrency` group on
the reusable workflow (`group: deploy-${{ inputs.environment }}`), which queues
rather than cancels competing deploys.

Runner requirements:

- Debian or Ubuntu (unprivileged or privileged, Docker must work).
- At least 4 CPU cores, 8 GB RAM, 20 GB disk (Docker image builds are
  disk-intensive).
- Dedicated non-root `runner` user with Docker group access.
- Runner registered as a systemd service so it restarts after reboots.
- Outbound access to GitHub, npm, AWS APIs, ECR, and the stack health URLs.
- No inbound public ports.
- Automatic OS security updates.
- Post-job cleanup hook to remove the workspace and prune Docker build cache:
  `docker builder prune --force --filter "until=168h"`.

Setup guide: <https://blog.ricardof.dev/setup-self-hosted-github-action-runner-in-minutes/>

---

## AWS Setup — OIDC Provider

Create once per AWS account. Check for an existing provider first:

```sh
aws iam list-open-id-connect-providers
```

If `token.actions.githubusercontent.com` is not listed:

```sh
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

Verify the thumbprint against GitHub's current documentation before creating
the provider.

---

## AWS Setup — OIDC Role Trust Policies

Create these files in `infra/iam/`. They are safe to commit — they contain no
credentials. Replace `<github-org>` with the exact GitHub organisation or user
name that owns this repository.

The `sub` claim must exactly match the calling workflow's `environment:` value.
This is the IAM-enforced boundary: even if someone can trigger a workflow with
forged labels, the OIDC token's `sub` claim is issued by GitHub and cannot be
spoofed.

**`infra/iam/trust-test.json`**

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": "repo:<github-org>/fathers-day-voting:environment:test"
      }
    }
  }]
}
```

**`infra/iam/trust-perf.json`** — same as test with `environment:perf`.

**`infra/iam/trust-prod.json`** — same as test with `environment:prod`.

**`infra/iam/trust-infra-nonprod.json`** — same as test with `environment:infra-nonprod`.

**`infra/iam/trust-infra-prod.json`** — same as test with `environment:infra-prod`.

Create the roles and attach policies:

```sh
aws iam create-role \
  --role-name carshow-github-test-deploy \
  --assume-role-policy-document file://infra/iam/trust-test.json

aws iam put-role-policy \
  --role-name carshow-github-test-deploy \
  --policy-name carshow-test-app-deploy \
  --policy-document file://infra/iam/policy-test-deploy.json

# Repeat for perf, prod, infra-nonprod, infra-prod
```

---

## AWS Setup — Least-Privilege App Deploy Policies

These policies cover **application deployment only**. They cannot create or
destroy AWS resources, read secrets, modify IAM roles, or interact with the
other environment's resources.

Two permissions unavoidably require `"Resource": "*"`:

- `ecr:GetAuthorizationToken` — the ECR auth endpoint has no resource ARN.
- `ecs:RegisterTaskDefinition` — a new revision has no ARN until after the call.
  The deploy script compensates by asserting expected cluster/service names
  before `UpdateService`.

All other permissions are scoped to specific ARNs.

**After each initial Terraform apply, fill in the CloudFront distribution IDs:**

```sh
cd infra/terraform
terraform workspace select test && terraform output cloudfront_distribution_id
terraform workspace select perf && terraform output cloudfront_distribution_id
terraform workspace select prod && terraform output cloudfront_distribution_id
```

### `infra/iam/policy-test-deploy.json`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "STSCallerIdentity",
      "Effect": "Allow",
      "Action": "sts:GetCallerIdentity",
      "Resource": "*"
    },
    {
      "Sid": "ECRAuth",
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Sid": "ECRImagePush",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:BatchGetImage",
        "ecr:CompleteLayerUpload",
        "ecr:DescribeImages",
        "ecr:GetDownloadUrlForLayer",
        "ecr:InitiateLayerUpload",
        "ecr:PutImage",
        "ecr:UploadLayerPart"
      ],
      "Resource": "arn:aws:ecr:ca-central-1:123456789012:repository/carshow/api"
    },
    {
      "Sid": "ECSServiceRead",
      "Effect": "Allow",
      "Action": [
        "ecs:DescribeServices",
        "ecs:ListTasks",
        "ecs:DescribeTasks"
      ],
      "Resource": "*",
      "Condition": {
        "ArnEquals": {
          "ecs:cluster": "arn:aws:ecs:ca-central-1:123456789012:cluster/carshow-test"
        }
      }
    },
    {
      "Sid": "ECSTaskDefinitionRead",
      "Effect": "Allow",
      "Action": "ecs:DescribeTaskDefinition",
      "Resource": "arn:aws:ecs:ca-central-1:123456789012:task-definition/carshow-test-api:*"
    },
    {
      "Sid": "ECSTaskDefinitionRegister",
      "Effect": "Allow",
      "Action": "ecs:RegisterTaskDefinition",
      "Resource": "*"
    },
    {
      "Sid": "ECSServiceUpdate",
      "Effect": "Allow",
      "Action": "ecs:UpdateService",
      "Resource": "arn:aws:ecs:ca-central-1:123456789012:service/carshow-test/carshow-test-api"
    },
    {
      "Sid": "ECSPassRole",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": [
        "arn:aws:iam::123456789012:role/carshow-test-ecs-execution",
        "arn:aws:iam::123456789012:role/carshow-test-ecs-task"
      ],
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": "ecs-tasks.amazonaws.com"
        }
      }
    },
    {
      "Sid": "S3SPAObjects",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::carshow-public-web-test/*",
        "arn:aws:s3:::carshow-admin-web-test/*",
        "arn:aws:s3:::carshow-judge-web-test/*"
      ]
    },
    {
      "Sid": "S3SPAList",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": [
        "arn:aws:s3:::carshow-public-web-test",
        "arn:aws:s3:::carshow-admin-web-test",
        "arn:aws:s3:::carshow-judge-web-test"
      ]
    },
    {
      "Sid": "CloudFrontInvalidation",
      "Effect": "Allow",
      "Action": "cloudfront:CreateInvalidation",
      "Resource": "arn:aws:cloudfront::123456789012:distribution/<test-cf-distribution-id>"
    },
    {
      "Sid": "CloudWatchLogsDiagnostics",
      "Effect": "Allow",
      "Action": [
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams",
        "logs:GetLogEvents",
        "logs:FilterLogEvents"
      ],
      "Resource": [
        "arn:aws:logs:ca-central-1:123456789012:log-group:/ecs/carshow-test-api",
        "arn:aws:logs:ca-central-1:123456789012:log-group:/ecs/carshow-test-api:*"
      ]
    },
    {
      "Sid": "ELBDiagnostics",
      "Effect": "Allow",
      "Action": [
        "elasticloadbalancing:DescribeTargetHealth",
        "elasticloadbalancing:DescribeTargetGroups"
      ],
      "Resource": "*"
    }
  ]
}
```

### `infra/iam/policy-perf-deploy.json`

Identical to the test policy with `test` → `perf` in every ARN:

| Test ARN fragment | Perf ARN fragment |
|---|---|
| `cluster/carshow-test` | `cluster/carshow-perf` |
| `task-definition/carshow-test-api:*` | `task-definition/carshow-perf-api:*` |
| `service/carshow-test/carshow-test-api` | `service/carshow-perf/carshow-perf-api` |
| `role/carshow-test-ecs-*` | `role/carshow-perf-ecs-*` |
| `carshow-*-web-test/*` | `carshow-*-web-perf/*` |
| `log-group:/ecs/carshow-test-api` | `log-group:/ecs/carshow-perf-api` |
| `<test-cf-distribution-id>` | `<perf-cf-distribution-id>` |

### `infra/iam/policy-prod-deploy.json`

Identical to the test policy with `test` → `prod` in every ARN. Use the prod
distribution ID from `terraform output cloudfront_distribution_id` in the prod
workspace.

---

## AWS Setup — Terraform Role Policies

The infra roles need all the permissions in the existing
`infra/carshow-deploy-policy.json` combined with `carshow-deploy-policy-1.json`
and `carshow-deploy-policy-2.json`. These are the same permissions that were
previously on the manual deploy user; they are now attached to the GitHub OIDC
infra roles instead.

The nonprod infra role (`carshow-github-infra-nonprod`) handles the `test` and
`perf` Terraform workspaces. The prod infra role (`carshow-github-infra-prod`)
handles only the `prod` workspace.

Both infra roles require access to shared resources:

- Terraform state S3 bucket (`carshow-tf-state`) and DynamoDB lock table
  (`carshow-tf-lock`) — used by all workspaces.
- ECR repository management (Terraform manages the repo itself, not images).
- The OIDC provider ARN (so that Terraform can manage the OIDC roles as
  resources in the future).

Additional permissions needed beyond the existing policy (noted as missing in
earlier Terraform runs):

- `cloudwatch:DescribeAlarms`
- `cloudwatch:GetDashboard`
- `application-autoscaling:ListTagsForResource`

Add these to the combined policy before creating the infra roles.

---

## GitHub Environment Configuration

In GitHub: **Settings → Environments → New environment**

Create five environments: `test`, `perf`, `prod`, `infra-nonprod`, `infra-prod`.

### Variables per environment

| Variable | test | perf | prod |
|---|---|---|---|
| `AWS_ROLE_ARN` | ARN of `carshow-github-test-deploy` | ARN of `carshow-github-perf-deploy` | ARN of `carshow-github-prod-deploy` |
| `AWS_REGION` | `ca-central-1` | `ca-central-1` | `ca-central-1` |
| `ECS_CLUSTER` | `carshow-test` | `carshow-perf` | `carshow-prod` |
| `ECS_SERVICE` | `carshow-test-api` | `carshow-perf-api` | `carshow-prod-api` |
| `PUBLIC_BUCKET` | `carshow-public-web-test` | `carshow-public-web-perf` | `carshow-public-web-prod` |
| `ADMIN_BUCKET` | `carshow-admin-web-test` | `carshow-admin-web-perf` | `carshow-admin-web-prod` |
| `JUDGE_BUCKET` | `carshow-judge-web-test` | `carshow-judge-web-perf` | `carshow-judge-web-prod` |
| `CLOUDFRONT_DISTRIBUTION_ID` | From Terraform test output | From Terraform perf output | From Terraform prod output |
| `PUBLIC_URL` | `https://carshow-test.chasesspace.com` | From Terraform perf output | `https://visit.fathersdaycarshow.ca` |

For the `infra-nonprod` and `infra-prod` environments, add only `AWS_ROLE_ARN`
and `AWS_REGION`.

### Environment protections

| Environment | Branch restriction | Required reviewers | Trigger |
|---|---|---|---|
| `test` | `main` | None | Automatic on push to `main` |
| `perf` | `main` | None | Manual dispatch |
| `prod` | `main` | 1+ reviewer (if billing allows) | Manual dispatch with commit SHA |
| `infra-nonprod` | `main` | None | Manual dispatch |
| `infra-prod` | `main` | 1+ reviewer (if billing allows) | Manual dispatch |

The OIDC trust policy `sub` condition enforces the environment restriction at
the IAM layer independent of GitHub's branch/reviewer settings.

---

## `infra/deploy.sh` in the New Pipeline

`infra/deploy.sh` is retained for two purposes only:

1. **Local development** — spinning up and tearing down a personal test/dev
   stack that is not the shared test environment.
2. **Emergency fallback** — if CI is unavailable during the event.

Add an explicit block for the shared environments when run without the CI context:

```bash
# At the top of the environment validation section:
if [[ "$ENVIRONMENT" == "prod" || "$ENVIRONMENT" == "test" ]] \
    && [[ -z "${CI:-}" && -z "${GITHUB_ACTIONS:-}" ]]; then
  die "Shared environments (test, prod) must be deployed through GitHub Actions. \
Set CI=true only from an authorized runner."
fi
```

This check is advisory, not a hard security boundary (the IAM roles are the
hard boundary). It prevents accidental localhost runs against shared environments
without requiring the operator to work around anything.

For the perf environment and infrastructure-only Terraform operations, the
script continues to work as designed.

---

## Workflow Changes Required to Match This Plan

The current workflow files need these updates:

### 1. Remove the OIDC conditional in `reusable-app-deploy.yml`

```yaml
# Current (remove this conditional):
- name: Configure AWS credentials with OIDC
  if: ${{ env.AWS_ROLE_ARN != '' }}

# Replace with (unconditional):
- name: Configure AWS credentials with OIDC
  uses: aws-actions/configure-aws-credentials@<pinned-sha>
  with:
    role-to-assume: ${{ env.AWS_ROLE_ARN }}
    aws-region: ${{ env.AWS_REGION }}
```

`AWS_ROLE_ARN` must be present in every environment. The workflow fails at the
`aws-actions/configure-aws-credentials` step if it is missing, which is the
intended behavior.

### 2. Update `deploy-test.yml` to trigger on push to main

```yaml
on:
  push:
    branches: [main]
    paths-ignore:
      - 'planning/**'
      - '**.md'
  workflow_dispatch:
```

### 3. Add `deploy-perf.yml`

```yaml
name: Deploy Perf

on:
  workflow_dispatch:
    inputs:
      commit_sha:
        description: Full commit SHA to deploy to perf
        required: true
        type: string

permissions:
  contents: read
  id-token: write

jobs:
  deploy:
    uses: ./.github/workflows/reusable-app-deploy.yml
    with:
      environment: perf
      runner_labels: '["self-hosted","Linux","X64","carshow","deploy-test"]'
      commit_sha: ${{ inputs.commit_sha }}
```

### 4. Add `terraform-plan.yml` and `terraform-apply.yml`

New workflow files for Terraform, calling `infra/deploy.sh` with `--plan` or
the appropriate Terraform apply flags via the infra runners and infra OIDC roles.

### 5. Add `ci.yml` for PR checks

```yaml
name: CI

on:
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: [self-hosted, Linux, X64, carshow, deploy-test]
    steps:
      - uses: actions/checkout@<pinned-sha>
      - uses: actions/setup-node@<pinned-sha>
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: npm run typecheck
      - run: npm test --workspace @carshow/api
```

### 6. Pin all action versions to commit SHAs

Replace all `@v6` (or any floating version tag) with pinned commit SHAs
verified against each action's releases page. This prevents supply chain
attacks through tag mutation.

### 7. Update `main.yml`

Rename `main.yml` to `self-hosted-runner-test.yml` or replace its content with
a proper harmless runner validation workflow used only when provisioning new
runners.

---

## Decommissioning Localhost Deploy Access

Once all five OIDC roles are live and at least one successful end-to-end
deployment through CI has been validated for each environment:

1. Delete all access keys from the existing IAM deploy user in the AWS console
   or via CLI.
2. Delete the `[carshow]` profile entries from `~/.aws/credentials` and
   `~/.aws/config` on all dev machines.
3. Remove or zero out `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` /
   `AWS_SECRET` from all local `.env` files.

After this, no local machine has credentials that can push to ECR, update ECS
services, sync S3 buckets, or invalidate CloudFront in any environment.

---

## What the App Deploy Role Cannot Do

For clarity, the CI app-deploy OIDC roles (`test-deploy`, `perf-deploy`,
`prod-deploy`) explicitly cannot:

- Create, modify, or destroy any AWS resource (no VPC, RDS, ECS cluster, ALB,
  security group, CloudFront distribution, ACM cert, or IAM role)
- Read or write Secrets Manager values
- Access the Terraform state S3 bucket or DynamoDB lock table
- Assume any other OIDC role (trust policies are per-environment)
- Push SPA content or update ECS for any other environment
- Modify ECS task IAM roles (only `PassRole` to a named set of existing roles)

A fully compromised CI app-deploy job for test cannot deploy to production,
touch the database, read secrets, or modify infrastructure.

---

## Implementation Order

### Phase 1 — AWS Configuration

1. Add the three missing Terraform permissions to the combined deploy policy
   (`cloudwatch:DescribeAlarms`, `cloudwatch:GetDashboard`,
   `application-autoscaling:ListTagsForResource`).
2. Create `infra/iam/` with trust and policy files for all five roles.
3. Create the GitHub OIDC provider in AWS (check for existing provider first).
4. Create all five OIDC roles and attach their policies.

### Phase 2 — GitHub Configuration

5. Create all five GitHub environments with variables and branch restrictions.
6. Add each role ARN as `AWS_ROLE_ARN` in the matching environment.

### Phase 3 — Workflow Updates

7. Remove the OIDC conditional from `reusable-app-deploy.yml`.
8. Update `deploy-test.yml` with the push trigger.
9. Add `deploy-perf.yml`.
10. Add `ci.yml` for PR checks.
11. Add `terraform-plan.yml` and `terraform-apply.yml`.
12. Pin all action versions to commit SHAs.
13. Update `main.yml` to runner-validation use only.
14. Update `deploy-app.sh` validate() to require `AWS_ROLE_ARN` unconditionally.

### Phase 4 — Runner Provisioning

15. Provision and register the single self-hosted runner with labels
    `[self-hosted, Linux, X64, carshow, deploy-test]`.
16. Validate runner connectivity with a manual `workflow_dispatch` on the
    harmless `main.yml` test workflow.

### Phase 5 — Cutover

19. Validate one end-to-end automatic test deploy (push to main → test
    environment healthy).
20. Validate one manual prod promotion of a tested commit.
21. Delete all IAM deploy user access keys.
22. Clear `[carshow]` profile from dev machines.
23. Add the `infra/deploy.sh` guard for shared environments.

### Phase 6 — Hardening

24. Add `CODEOWNERS` for `.github/workflows/**` and `infra/ci/**`.
25. Enable required reviewers on `prod` and `infra-prod` GitHub environments.
26. Run a full dry-run prod deployment of a known-good commit under event
    conditions to confirm stability.
