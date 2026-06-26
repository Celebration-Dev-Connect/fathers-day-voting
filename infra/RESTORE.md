# Father's Day Car Show — Restore Runbook (year-round EC2 mode)

Bring the full app back online at `visit.fathersdaycarshow.ca` on the cheap
year-round footprint after a decommission: a single EC2 box running the API and
PostgreSQL in Docker, behind the existing CloudFront distribution. ~$22/mo.

This is the inverse of `DECOMMISSION.md`. It assumes CloudFront, the ACM cert,
the `carshow-public-web-prod` and `carshow-photos-prod` buckets, and external DNS
are still in place (they survive decommission), and that you have the local
`pg_dump` from `infra/scripts/backup-db.sh`.

## Architecture

CloudFront (kept) routes `/` `/admin` `/judge` to the S3 SPA buckets, `/photos/*`
to the photos bucket, and `/api/*` to the EC2 box's Elastic IP over HTTP. On the
box, `docker compose` runs `postgres` (data on a dedicated EBS volume) and `api`.
Secrets live in SSM Parameter Store; the box uses its instance role via IMDS — no
AWS keys anywhere. Ops access is SSM Session Manager only (no SSH).

| Var | Value |
|---|---|
| `compute_mode` | `ec2` |
| `decommissioned` | `false` |
| `ec2_instance_type` | `t4g.small` |

## Step 1 — Provision the infrastructure

Run the **Terraform Apply** workflow:

- `environment`: `prod`
- `action`: `apply`
- `decommissioned`: ❌ **false**
- `compute_mode`: **ec2**

This re-creates ECR, the SSM params (secrets + compose file + non-secret env +
backup script), the EC2 instance + Elastic IP + EBS data volume + instance role,
the admin/judge S3 buckets, and reconfigures CloudFront back to full-app routing
(the `/api/*`, `/admin*`, `/judge*` behaviors return automatically).

On first boot the box brings up `postgres`, but `api` won't start until an image
exists in ECR (next step). That's expected.

## Step 2 — First app deploy (image + SPAs)

Set the prod GitHub environment variables for EC2 mode (one-time):

- `DEPLOY_TARGET` = `ec2`
- `INSTANCE_ID` = `terraform output -raw ec2_instance_id`
- (`CLOUDFRONT_DISTRIBUTION_ID`, `PUBLIC_BUCKET`, `ADMIN_BUCKET`, `JUDGE_BUCKET`,
  `PUBLIC_URL`, `AWS_REGION`, `AWS_ROLE_ARN` are unchanged from before.)

Then run **Deploy Production** with the commit SHA. It builds the API image for
**linux/arm64**, pushes to ECR, updates `/carshow/prod/image-tag`, tells the box
to pull + restart via SSM (the entrypoint runs `prisma migrate deploy`), and
builds + syncs the four SPAs, then invalidates CloudFront.

## Step 3 — Restore the database

The api's `prisma migrate deploy` creates the schema on start **and a migration
seeds the base Event row**, so the dump (a plain `pg_dump`) can't be layered on
top — recreate the database clean, then load the dump:

```bash
# Stage the dump in S3 (the box's role can read the photos bucket).
aws s3 cp backups/carshow-prod-YYYYMMDD-HHMMSS.sql.gz \
  s3://carshow-photos-prod/backups/db/restore.sql.gz --profile carshow

# Then, in an SSM Session Manager shell on the box (or via ssm send-command):
cd /opt/carshow
aws s3 cp s3://carshow-photos-prod/backups/db/restore.sql.gz /tmp/restore.sql.gz
docker compose stop api                                  # drop active connections
docker compose exec -T postgres psql -U carshow -d postgres \
  -c "DROP DATABASE carshow WITH (FORCE);" -c "CREATE DATABASE carshow OWNER carshow;"
gunzip -c /tmp/restore.sql.gz | docker compose exec -T postgres psql -U carshow -d carshow
docker compose up -d api                                 # entrypoint migrate is a no-op
rm /tmp/restore.sql.gz
```

Photos already live in `carshow-photos-prod` — nothing to restore there.

## Step 4 — Verify

- [ ] `https://visit.fathersdaycarshow.ca/api/health` → 200
- [ ] Home page shows the real public SPA (not the "event is over" page)
- [ ] `/admin` and `/judge` load; staff login works
- [ ] A known `/photos/<id>` still serves
- [ ] Public voting + photo upload → PENDING → APPROVED round-trips
- [ ] `aws ssm start-session --target <id>` works; `docker compose ps` healthy
- [ ] Reboot the box → containers auto-start, `/data` remounts, DB intact

## Ongoing deploys

Just run **Deploy Production** with the new commit SHA — same as before, now
targeting the box via SSM.

## Switching back to event-day scale (next year)

Before switching, take a manual backup so you can load the year's data into RDS:
`ssm start-session` to the box and run `/opt/carshow/backup-db.sh` (writes a dump
to `s3://carshow-photos-prod/backups/db/`). Then run **Terraform Apply** with
`compute_mode=ecs` — that destroys the EC2 box + data volume and rebuilds
ECS + ALB + RDS. Restore the dump into RDS. Set the prod GitHub env vars back
(`DEPLOY_TARGET=ecs`, `ECS_CLUSTER`, `ECS_SERVICE`) before the next app deploy.

> **Durability note:** in EC2 mode the database is a single container on one EBS
> volume. The volume survives instance replacement (only a `terraform destroy` or
> a mode switch removes it). There is no scheduled backup — the data barely
> changes year-round — but `/opt/carshow/backup-db.sh` takes an on-demand dump to
> S3 whenever you want one. RDS (with automated backups) returns with
> `compute_mode=ecs` for the event.
