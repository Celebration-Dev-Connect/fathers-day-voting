# Infrastructure (Terraform)

Provisions the AWS resources for the photo upload + moderation pipeline:

- **S3 bucket** (private; `block_public_access` on) for photos. `pending/` objects are scanned; `public/` objects are approved. A lifecycle rule deletes abandoned `pending/` objects after 1 day.
- **CloudFront** distribution (Origin Access Control) that serves **only** the `public/` prefix. Approved objects are immutable, so no cache invalidation is ever needed.
- **IAM user** for the API (runs on Proxmox, outside AWS) with least-privilege access: `s3:PutObject/GetObject/DeleteObject` on the bucket and `rekognition:DetectModerationLabels`.

Rekognition itself needs no provisioned resource — it is pay-per-call; only the IAM permission is required.

## Usage

```sh
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # edit values (bucket_name must be globally unique)

terraform init
terraform validate
terraform plan
terraform apply
```

## Wire outputs into the API `.env`

```sh
terraform output -raw bucket_name            # → S3_BUCKET
terraform output -raw cloudfront_domain      # → CDN_BASE_URL  (prefix with https://)
terraform output -raw aws_access_key_id      # → AWS_ACCESS_KEY_ID
terraform output -raw aws_secret_access_key  # → AWS_SECRET_ACCESS_KEY  (sensitive)
```

Then set the API to the cloud drivers:

```
STORAGE_DRIVER=s3
MODERATION_DRIVER=rekognition
AWS_REGION=us-east-1
S3_BUCKET=<bucket_name>
CDN_BASE_URL=https://<cloudfront_domain>
AWS_ACCESS_KEY_ID=<...>
AWS_SECRET_ACCESS_KEY=<...>
```

## Notes

- State is local for now. Before multiple operators run this, migrate to an S3 backend (see `versions.tf`).
- `terraform.tfvars`, `*.tfstate*`, and `.terraform/` are gitignored — never commit state or secrets.
