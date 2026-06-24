# Father's Day Car Show 2026 — Decommission Runbook

Post-event teardown. Goal: `visit.fathersdaycarshow.ca` stays live with a simple static page;
all data and photos backed up locally; AWS bill drops to ~$0/month.

## What Stays on AWS

| Resource | Why |
|---|---|
| `carshow-public-web-prod` S3 bucket | Hosts the static "event is over" page |
| `carshow-photos-prod` S3 bucket | Photos remain accessible at `/photos/*` |
| CloudFront distribution | Continues serving the domain |
| ACM certificate | Required for HTTPS |
| DNS (external registrar) | No change needed |

Estimated post-decommission cost: **< $0.05/month** (CloudFront free tier + negligible S3).

## What Gets Torn Down

- ECS Fargate cluster + service (`carshow-prod`, `carshow-prod-api`)
- Application Load Balancer (`carshow-prod-api`)
- RDS PostgreSQL instance (`carshow-prod`, `db.t3.medium`) → final snapshot saved
- ECR repository (`carshow/api`)
- Secrets Manager secrets (8 secrets under `carshow/prod/*`)
- S3 buckets: `carshow-admin-web-prod`, `carshow-judge-web-prod`
- CloudWatch alarms (ALB, ECS, RDS) and dashboard
- ECS IAM policies (roles stay, no cost)

---

## Step 1 — Run Backups

```bash
# Runs RDS snapshot + exports all DB tables to S3 + downloads locally
ENV=prod AWS_PROFILE=carshow ./infra/scripts/backup-db.sh
```

This creates:
- An RDS manual snapshot: `carshow-prod-backup-<timestamp>` (stays in AWS)
- A JSON data export at `s3://carshow-photos-prod/backups/data-export-<date>.json.gz`
- A local download: `./data-export-<date>.json.gz`

**Verify the export before continuing:**
```bash
gunzip -c data-export-*.json.gz | jq 'keys'
gunzip -c data-export-*.json.gz | jq '._meta'    # row counts per table
```

Also run the photo export:
```bash
npm run --workspace @carshow/api exportPhotos
# Output: apps/api/output/ — one folder per vehicle + manifest.csv
# Move this to external drive / Google Drive before proceeding.
```

---

## Step 2 — Set `decommissioned = true`

In `infra/terraform/prod.tfvars`, change:
```
decommissioned = false
```
to:
```
decommissioned = true
```

---

## Step 3 — Run the Decommission Script

```bash
ENV=prod AWS_PROFILE=carshow ./infra/scripts/decommission.sh
```

This script will:
1. Upload `infra/static-site/index.html` to `carshow-public-web-prod`
2. Disable RDS deletion protection via AWS CLI
3. Run `terraform apply` — destroys ECS, ALB, RDS (with final snapshot), ECR, Secrets, alarms; updates CloudFront to static-only mode
4. Empty `carshow-admin-web-prod` and `carshow-judge-web-prod`, then applies Terraform again to delete them
5. Invalidate CloudFront cache

Total time: **15–25 minutes** (RDS deletion takes longest).

---

## Step 4 — Verify

- [ ] `https://visit.fathersdaycarshow.ca` shows the thank-you page
- [ ] `https://visit.fathersdaycarshow.ca/photos/<any-photo-id>` still serves a photo
- [ ] AWS Console: RDS `carshow-prod` is gone, snapshot `carshow-prod-final` exists
- [ ] AWS Console: ECS cluster `carshow-prod` is gone
- [ ] AWS Console: ECR `carshow/api` is gone
- [ ] AWS Console: Secrets Manager `carshow/prod/*` are all gone
- [ ] AWS billing dashboard shows only S3 + CloudFront costs after 24–48 hours

---

## Step 5 — Disable GitHub Actions Deploys

Update `.github/workflows/deploy-prod.yml` to prevent accidental re-deploys. Either:
- Delete or disable the workflow
- Add a manual guard at the top: `if: false`

---

## Local Data Exploration

To query event data locally:
```bash
# Decompress the export
gunzip -c data-export-YYYY-MM-DD.json.gz > data-export.json

# Inspect with jq
jq '.VehicleEntry | length' data-export.json           # vehicle count
jq '.PeopleChoiceVote | length' data-export.json        # vote count
jq '.Owner | map(.email) | .[]' data-export.json        # all owner emails
jq '.VehicleEntry | group_by(.categoryId) | map(length)' data-export.json
```

---

## Retained Data Summary

| Data | Location |
|---|---|
| All DB tables (entries, votes, owners, results) | `./data-export-<date>.json.gz` + S3 |
| Vehicle photos (full-res originals) | `apps/api/output/` (local) |
| RDS point-in-time backup | AWS RDS snapshots: `carshow-prod-backup-*` |
| RDS final snapshot | AWS RDS snapshots: `carshow-prod-final` (created on destroy) |
| Event results JSON | Inside DB export: `.Event[0].resultsSnapshot` |

**Delete the RDS snapshots** (not before 6 months) via AWS Console when no longer needed.
