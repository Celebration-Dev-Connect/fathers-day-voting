# Infrastructure (Terraform)

Provisions the full AWS production stack for the Father's Day Car Show app.
All traffic enters through a single CloudFront distribution at `carshow.celebrationedmonton.com`.

## Resources

| File | What it creates |
|---|---|
| `vpc.tf` | VPC, private subnets, security groups, VPC endpoints (S3/Secrets Manager/Rekognition) |
| `rds.tf` | PostgreSQL 16 on RDS (private subnet, no public access; size via vars) |
| `ecr.tf` | ECR repository for the API container image |
| `secrets.tf` | Secrets Manager entries for `DATABASE_URL` and `JWT_SECRET` |
| `iam.tf` | App Runner instance role (S3 + Rekognition + Secrets Manager) and access role (ECR pull) |
| `s3.tf` | Three S3 buckets: photos, admin-web SPA, public-web SPA (all private, OAC only) |
| `app_runner.tf` | App Runner service (CPU/memory/scale via vars, VPC connector to RDS) |
| `cloudfront.tf` | Single CloudFront distribution, ACM cert, 4 CloudFront Functions, 4 cache behaviors |
| `random.tf` | Random passwords for RDS and JWT secret |

## Two configurations

Each environment lives in its **own Terraform workspace** (separate state), with
its own var file, so a test deploy can never modify prod:

| Env | Var file | Resources | Auth | Data | Teardown |
|---|---|---|---|---|---|
| `test` | `test.tfvars` | 0.5 vCPU / 1 GB App Runner, 1 instance, no DB backups | local dev-login | demo seed on boot | one-command |
| `prod` | `prod.tfvars` | 1 vCPU / 2 GB, autoscale 1–3, daily backups | Planning Center OAuth | none | protected |

Copy the matching example and fill it in:

```sh
cp infra/terraform/prod.tfvars.example infra/terraform/prod.tfvars   # for prod
# test.tfvars ships ready to use
```

## Deploying (recommended: the script)

`infra/deploy.sh` does the whole flow — credential check, ECR bootstrap, image
build/push (for `linux/amd64`, so it works from Apple Silicon), `terraform
apply` in the right workspace, and the SPA builds + S3 sync + CloudFront
invalidation. Credentials are never passed as args or printed.

For the current routine test/production process, credential behavior, ECS
promotion steps, safety checks, and known IAM limitations, read
[`DEPLOYMENT_RUNBOOK.md`](DEPLOYMENT_RUNBOOK.md) before deploying.

```sh
infra/deploy.sh --env test  --profile <aws-profile>   # full test deploy
infra/deploy.sh --env prod  --profile <aws-profile>   # full prod deploy
infra/deploy.sh --env prod  --plan                    # preview, no changes
infra/deploy.sh --env test  --skip-infra --skip-image # redeploy SPAs only
infra/deploy.sh --env test  --destroy                 # tear down test
infra/deploy.sh --help                                # all options
```

## DNS (external registrar)

On the first deploy of a new domain, add two CNAME records in your registrar
(values come from the Terraform outputs the script prints, or):

```sh
cd infra/terraform
terraform workspace select test   # or prod
terraform output acm_validation_records   # → add these to validate the ACM cert
terraform output cloudfront_domain        # → CNAME your domain to this
```

The CloudFront distribution shows "In Progress" until the ACM certificate validates.

## Manual deploy (if you can't use the script)

App Runner requires an ECR image to exist before the service can be created, so
the first deploy is two stages:

```sh
cd infra/terraform
terraform init
terraform workspace select test || terraform workspace new test

terraform apply -var-file=test.tfvars -target=aws_ecr_repository.api   # ECR only
ECR_URL=$(terraform output -raw ecr_repository_url)

SHA=$(git rev-parse --short HEAD)
aws ecr get-login-password --region ca-central-1 | docker login --username AWS --password-stdin "${ECR_URL%%/*}"
docker build --platform linux/amd64 -t "$ECR_URL:$SHA" -f ../../apps/api/Dockerfile ../..
docker push "$ECR_URL:$SHA"

terraform apply -var-file=test.tfvars -var="app_runner_image_tag=$SHA"     # full stack
```

Swap `test` → `prod` and `test.tfvars` → `prod.tfvars` for production.

## Deploying the SPAs

CloudFront serves **public-web at `/`** (default behavior) and **admin-web at
`/admin*`**. Both Vite apps derive their asset `base` and API URL from build-time
env vars, so these **must** be set or the SPAs ship broken (assets 404, or admin
API calls hit the static bucket instead of `/api`):

```sh
terraform output -raw cloudfront_distribution_id   # save this as <id>

# public-web — served at the domain root
VITE_PUBLIC_BASE_PATH=/ \
  npm run build --workspace apps/public-web
aws s3 sync apps/public-web/dist/ s3://$(terraform output -raw public_web_bucket)/ --delete
aws cloudfront create-invalidation --distribution-id <id> --paths '/*'

# admin-web — served under /admin, but its API calls must go to /api (root),
# and links to the public site must point at the domain root.
VITE_PUBLIC_BASE_PATH=/admin \
VITE_API_URL=/api \
VITE_PUBLIC_APP_URL=https://carshow.celebrationedmonton.com \
  npm run build --workspace apps/admin-web
aws s3 sync apps/admin-web/dist/ s3://$(terraform output -raw admin_web_bucket)/ --delete
aws cloudfront create-invalidation --distribution-id <id> --paths '/admin*'
```

> Why `VITE_API_URL=/api` for admin: without it the app derives `API_URL` from
> the base path (`/admin/api`), which CloudFront routes to the admin S3 bucket
> rather than the `/api/*` → App Runner behavior. Public-web doesn't need it
> because its base is `/`, so the derived `/api` is already correct.

## Database migrations

Migrations run **automatically** on API container startup
(`apps/api/docker-entrypoint.sh` runs `prisma migrate deploy` before the server,
guarded by a Postgres advisory lock so concurrent instances are safe). RDS has
no bastion/NAT, so this in-container step is the supported path — there is
nothing to run by hand. Just deploy a new image and the migrations apply.

Seeding is opt-in via the `run_seed` variable (sets `RUN_SEED=true`), intended
for test stacks only — see below. **Never enable `run_seed` for real
production.**

After the first successful **test** boot, set `run_seed = false` in `test.tfvars`
and re-run the deploy so restarts/scale-ups don't re-run the seed. Log in to the
admin app (`/admin`) with the seeded `admin@carshow.local` account via dev-login.

## Tearing down

A stack created with `teardown_friendly = true` (as in `test.tfvars`) destroys
in a single command:

```sh
infra/deploy.sh --env test --destroy
# or manually, in the test workspace:
#   terraform workspace select test && terraform destroy -var-file=test.tfvars
```

This disables RDS deletion protection, skips the final snapshot, and lets
Terraform empty the S3 buckets and ECR repo. CloudFront still takes ~15–20 min
to disable and delete — that's normal.

> Production (`teardown_friendly = false`) intentionally **blocks** a clean
> destroy: RDS deletion protection and a forced final snapshot stay on, and
> non-empty S3/ECR must be emptied manually first. That's the safety you want
> for real data.

## Notes

- `test` and `prod` each use a dedicated Terraform **workspace** (separate state). Always run the deploy script or `terraform workspace select <env>` before manual commands so you don't apply to the wrong stack.
- State is local by default. Before multi-operator use, uncomment the S3 backend in `versions.tf` and create the `carshow-tf-state` bucket manually — the S3 backend keeps per-workspace state under separate keys automatically.
- `*.tfvars` (except `*.tfvars.example`), `*.tfstate*`, and `.terraform/` are gitignored — never commit them.
- Test interface VPC endpoints (Secrets Manager, Rekognition) still bill hourly per-AZ even at idle; the quickest cost control for a test stack is to tear it down when you're done rather than leave it running.
- The App Runner service URL (`.awsapprunner.com`) is an internal detail — all public traffic goes through CloudFront.
