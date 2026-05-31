# Infrastructure (Terraform)

Provisions the full AWS production stack for the Father's Day Car Show app.
All traffic enters through a single CloudFront distribution at `carshow.celebrationedmonton.com`.

## Resources

| File | What it creates |
|---|---|
| `vpc.tf` | VPC, private subnets, security groups, VPC endpoints (S3/Secrets Manager/Rekognition) |
| `rds.tf` | PostgreSQL 16 on RDS db.t3.micro (private subnet, no public access) |
| `ecr.tf` | ECR repository for the API container image |
| `secrets.tf` | Secrets Manager entries for `DATABASE_URL` and `JWT_SECRET` |
| `iam.tf` | App Runner instance role (S3 + Rekognition + Secrets Manager) and access role (ECR pull) |
| `s3.tf` | Three S3 buckets: photos, admin-web SPA, public-web SPA (all private, OAC only) |
| `app_runner.tf` | App Runner service (1 vCPU / 2 GB, VPC connector to RDS) |
| `cloudfront.tf` | Single CloudFront distribution, ACM cert, 4 CloudFront Functions, 4 cache behaviors |
| `random.tf` | Random passwords for RDS and JWT secret |

## Bootstrap order

App Runner requires an ECR image to exist before the service can be created.
Run in two stages on first deploy:

```sh
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # fill in values

terraform init
terraform apply -target=aws_ecr_repository.api  # creates ECR repo only

# Build and push the initial API image
docker build -t carshow/api -f apps/api/Dockerfile .
docker tag carshow/api:latest <ecr_url>:latest
docker push <ecr_url>:latest

terraform apply   # provisions everything else
```

## DNS (external registrar)

After `terraform apply`, add two CNAME records in your DNS registrar.
The exact values are in the Terraform outputs:

```sh
terraform output acm_validation_records   # → add these to validate the ACM cert
terraform output cloudfront_domain        # → CNAME carshow.celebrationedmonton.com to this
```

The CloudFront distribution shows "In Progress" until the ACM certificate validates.

## Deploying the API

```sh
SHA=$(git rev-parse --short HEAD)
docker build -t carshow/api -f apps/api/Dockerfile .
docker tag carshow/api:latest <ecr_url>:$SHA
docker push <ecr_url>:$SHA

# Update App Runner to the new image
terraform apply -var="app_runner_image_tag=$SHA"
```

## Deploying the SPAs

```sh
terraform output -raw cloudfront_distribution_id   # save this

# public-web
npm run build --workspace apps/public-web
aws s3 sync apps/public-web/dist/ s3://$(terraform output -raw public_web_bucket)/ --delete
aws cloudfront create-invalidation --distribution-id <id> --paths '/index.html'

# admin-web
npm run build --workspace apps/admin-web
aws s3 sync apps/admin-web/dist/ s3://$(terraform output -raw admin_web_bucket)/ --delete
aws cloudfront create-invalidation --distribution-id <id> --paths '/index.html'
```

## Running database migrations

Access RDS via SSM port-forwarding — no bastion host required:

```sh
# Terminal 1: open tunnel
aws ssm start-session \
  --target <ssm-instance-id> \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "{\"host\":[\"$(terraform output -raw rds_endpoint)\"],\"portNumber\":[\"5432\"],\"localPortNumber\":[\"5432\"]}"

# Terminal 2: run migrations
DATABASE_URL="postgresql://carshow:<pass>@localhost:5432/carshow?schema=public" \
  npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
```

Never run `db:seed` against production.

## Notes

- State is local by default. Before multi-operator use, uncomment the S3 backend in `versions.tf` and create the `carshow-tf-state` bucket manually.
- `terraform.tfvars`, `*.tfstate*`, and `.terraform/` are gitignored — never commit them.
- The App Runner service URL (`.awsapprunner.com`) is an internal detail — all public traffic goes through CloudFront.
