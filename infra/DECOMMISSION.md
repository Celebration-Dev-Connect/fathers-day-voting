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

> **Terraform state + tfvars live in CI.** State is in the `carshow-tf-state`
> S3 backend and `*.tfvars` are generated from GitHub secrets at run time, so the
> decommission is driven through the **Terraform Apply** workflow — not by editing
> a local `prod.tfvars`. The `decommissioned` flag is passed as a workflow input.

## Step 1 — Run Backups

Two offline backups are taken before any teardown: a full `pg_dump` of the
database and a copy of every approved photo.

**Database (`pg_dump`)** — the RDS instance lives in a private subnet, so open a
temporary hole, dump, then close it:

```bash
export AWS_PROFILE=carshow AWS_REGION=ca-central-1
PRIV_A=$(aws ec2 describe-subnets --filters Name=tag:Name,Values=carshow-prod-private-a --query 'Subnets[0].SubnetId' --output text)
PRIV_B=$(aws ec2 describe-subnets --filters Name=tag:Name,Values=carshow-prod-private-b --query 'Subnets[0].SubnetId' --output text)
PUB_RT=$(aws ec2 describe-route-tables --filters Name=tag:Name,Values=carshow-prod-public --query 'RouteTables[0].RouteTableId' --output text)
RDS_SG=$(aws rds describe-db-instances --db-instance-identifier carshow-prod --query 'DBInstances[0].VpcSecurityGroups[0].VpcSecurityGroupId' --output text)
MY_IP=$(curl -s https://checkip.amazonaws.com)

# Open: route private subnets to the IGW, allow your IP, enable public access
A1=$(aws ec2 associate-route-table --route-table-id $PUB_RT --subnet-id $PRIV_A --query AssociationId --output text)
A2=$(aws ec2 associate-route-table --route-table-id $PUB_RT --subnet-id $PRIV_B --query AssociationId --output text)
RULE=$(aws ec2 authorize-security-group-ingress --group-id $RDS_SG --protocol tcp --port 5432 --cidr ${MY_IP}/32 --query 'SecurityGroupRules[0].SecurityGroupRuleId' --output text)
aws rds modify-db-instance --db-instance-identifier carshow-prod --publicly-accessible --apply-immediately >/dev/null
aws rds wait db-instance-available --db-instance-identifier carshow-prod

# Dump (libpq from homebrew: /opt/homebrew/opt/libpq/bin)
HOST=carshow-prod.chb3gnhyotzl.ca-central-1.rds.amazonaws.com
export PGPASSWORD=$(aws secretsmanager get-secret-value --secret-id carshow/prod/db-url --query SecretString --output text | sed -E 's#^postgres(ql)?://[^:]+:([^@]+)@.*#\2#')
pg_dump -h $HOST -p 5432 -U carshow -d carshow --no-owner --no-acl | gzip -9 > backups/carshow-prod-$(date +%Y%m%d-%H%M%S).sql.gz

# Close: revert everything (RDS is destroyed in Step 3 anyway, but stay tidy)
aws ec2 revoke-security-group-ingress --group-id $RDS_SG --security-group-rule-ids $RULE
aws ec2 disassociate-route-table --association-id $A1
aws ec2 disassociate-route-table --association-id $A2
aws rds modify-db-instance --db-instance-identifier carshow-prod --no-publicly-accessible --apply-immediately >/dev/null
```

**Photos** — pulls bytes from the prod S3 bucket; reads records from a local DB
restored from the dump above (so no DB hole needed):

```bash
# Restore the dump into a local DB first (see "Local Data Exploration" below),
# then:
cd apps/api
AWS_PROFILE=carshow AWS_REGION=ca-central-1 STORAGE_DRIVER=s3 \
  S3_BUCKET=carshow-photos-prod CDN_BASE_URL=https://visit.fathersdaycarshow.ca/photos \
  DATABASE_URL=postgresql://carshow:carshow@localhost:5432/carshow_prod \
  node --import tsx src/scripts/exportPhotos.ts
# Output: apps/api/output/ — one folder per vehicle + manifest.csv.
# Move backups/ to an external drive / Google Drive before proceeding.
```

> The `backups/` directory is gitignored. A belt-and-suspenders RDS **final
> snapshot** (`carshow-prod-final`) is also created automatically in Step 3.

---

## Step 2 — Preview the teardown (optional but recommended)

Run the **Terraform Plan** workflow to see exactly what will be destroyed:

- Workflow: **Terraform Plan**
- `environment`: `prod`
- `decommissioned`: ✅ **true**

Expect destroys of ECS, ALB, RDS, ECR, Secrets, CloudWatch alarms — and **no**
destroys of the CloudFront distribution, photos bucket, or public-web bucket.

---

## Step 3 — Run the Decommission

Run the **Terraform Apply** workflow:

- Workflow: **Terraform Apply**
- `environment`: `prod`
- `action`: `apply`
- `decommissioned`: ✅ **true**

(Prod runs through the `infra-prod` GitHub environment, so approve the run if
required reviewers are configured.)

The workflow then:
1. Disables RDS deletion protection and empties the admin/judge S3 buckets.
2. Runs `terraform apply` with `decommissioned = true` — destroys ECS, ALB,
   RDS (with final snapshot `carshow-prod-final`), ECR, Secrets, and alarms;
   reconfigures CloudFront to static-only mode.
3. Syncs `infra/static-site/` to `carshow-public-web-prod` and invalidates the
   CloudFront cache.

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

## Step 5 — Prevent accidental re-provisioning

Once decommissioned, the only thing that would rebuild the backend is another
**Terraform Apply** run with `decommissioned` left at its default (`false`). To
avoid surprise costs, disable the app deploy workflows (`deploy-prod.yml` /
`main.yml`) — delete them or add a top-level `if: false` guard.

> **Re-provisioning next year** is intentionally easy: run **Terraform Apply**
> with `environment=prod`, `action=apply`, and `decommissioned=false` (the
> default). Terraform rebuilds ECS, ALB, RDS, ECR, Secrets, and alarms from the
> same state. Restore data from the `pg_dump` or the `carshow-prod-final`
> snapshot.

---

## Local Data Exploration

Restore the `pg_dump` into a local database (kept separate from the `carshow`
dev DB so both coexist):

```bash
docker compose up -d postgres
PGPASSWORD=carshow psql -h localhost -U carshow -d carshow -c 'CREATE DATABASE carshow_prod;'
gunzip -c backups/carshow-prod-*.sql.gz | PGPASSWORD=carshow psql -h localhost -U carshow -d carshow_prod

# Then query it directly:
PGPASSWORD=carshow psql -h localhost -U carshow -d carshow_prod \
  -c 'SELECT count(*) FROM "VehicleEntry";'
```

---

## Retained Data Summary

| Data | Location |
|---|---|
| Full SQL dump (all tables) | `backups/carshow-prod-<date>.sql.gz` (local, gitignored) |
| Vehicle photos (full-res originals) | `backups/photos-export/` (local) + `carshow-photos-prod` S3 |
| RDS final snapshot | AWS RDS snapshots: `carshow-prod-final` (created on destroy) |
| Event results JSON | In the dump: `Event.resultsSnapshot` |

**Delete the RDS final snapshot** (not before 6 months) via AWS Console when no longer needed.
