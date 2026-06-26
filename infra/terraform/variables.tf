variable "region" {
  description = "AWS region for all resources (ACM cert is always us-east-1 regardless)."
  type        = string
  default     = "ca-central-1"
}

variable "project" {
  description = "Short prefix used in resource names and tags."
  type        = string
  default     = "carshow"
}

variable "environment" {
  description = "Deployment environment."
  type        = string
  default     = "prod"
}

variable "domain" {
  description = "Public domain for the app. Used as the CloudFront alias and ACM cert SAN."
  type        = string
  default     = "carshow.celebrationedmonton.com"
}

variable "route53_zone_id" {
  description = <<-EOT
    Route 53 hosted zone ID for the domain. When set, Terraform creates the ACM
    validation record, waits for the certificate to be issued, and creates the
    CloudFront alias record automatically (single-apply). Leave empty for
    externally-managed DNS, in which case you must add the validation and alias
    records yourself and the certificate must be issued before CloudFront builds.
  EOT
  type        = string
  default     = ""
}

variable "db_username" {
  description = "PostgreSQL master username."
  type        = string
  default     = "carshow"
}

# ── Resource sizing (lower these for cheap test stacks) ──────────────────────

variable "ecs_cpu" {
  description = "Fargate task CPU units. Valid: 256, 512, 1024, 2048, 4096. Test: 512."
  type        = string
  default     = "1024"
}

variable "ecs_memory" {
  description = "Fargate task memory (MB). Must pair with cpu (e.g. 512->1024, 1024->2048). Test: 1024."
  type        = string
  default     = "2048"
}

variable "ecs_min_size" {
  description = "ECS service minimum task count. Prod: 2 to avoid cold-start lag at event open. Test: 1."
  type        = number
  default     = 2
}

variable "ecs_max_size" {
  description = "ECS service maximum task count for auto scaling. Prod: 5 for 10k-attendee headroom. Test: 1."
  type        = number
  default     = 5
}

variable "rds_instance_class" {
  description = "RDS instance class. Prod: db.t3.medium (t3.micro/small deplete CPU credits under 7h sustained load). Test: db.t3.micro."
  type        = string
  default     = "db.t3.medium"
}

variable "rds_allocated_storage" {
  description = "RDS storage (GB). gp3 minimum is 20."
  type        = number
  default     = 20
}

variable "rds_backup_retention" {
  description = "RDS automated backup retention (days). Test: 0 to disable."
  type        = number
  default     = 1
}

variable "enable_dev_login" {
  description = <<-EOT
    Enable the email/dev-login auth path on the API (POST /auth/dev-login).
    Set true for a TEST deployment that runs real infra (S3/RDS/Rekognition) but
    keeps local staff login while Planning Center OAuth is not yet wired up.
    Keep false for real production.
  EOT
  type        = bool
  default     = false
}

variable "run_seed" {
  description = <<-EOT
    Run the database seed (event, categories, demo staff/vehicles/votes) on API
    container startup. Intended for test deployments only — turn back to false
    after the first boot so restarts don't re-seed. Never enable for real prod.
  EOT
  type        = bool
  default     = false
}

variable "teardown_friendly" {
  description = <<-EOT
    Make the stack destroyable in a single `terraform destroy`:
    disables RDS deletion protection, skips the final DB snapshot, and lets
    Terraform empty/delete non-empty S3 buckets and the ECR repo. Convenient for
    test/throwaway stacks; keep false for production to protect data.
  EOT
  type        = bool
  default     = false
}

variable "pco_client_id" {
  description = "Planning Center OAuth app client ID."
  type        = string
  default     = ""
  sensitive   = true
}

variable "pco_client_secret" {
  description = "Planning Center OAuth app client secret."
  type        = string
  default     = ""
  sensitive   = true
}

variable "webguide_username" {
  description = "WebGuide username used to download vehicle photos referenced by registration CSV imports."
  type        = string
  default     = ""
  sensitive   = true
}

variable "webguide_password" {
  description = "WebGuide password used to download vehicle photos referenced by registration CSV imports."
  type        = string
  default     = ""
  sensitive   = true
}

variable "email_smtp_username" {
  description = "AWS SES SMTP username for sending owner invite emails."
  type        = string
  default     = ""
  sensitive   = true
}

variable "email_smtp_password" {
  description = "AWS SES SMTP password for sending owner invite emails."
  type        = string
  default     = ""
  sensitive   = true
}

variable "email_from_address" {
  description = "From address for outbound emails (must be SES-verified)."
  type        = string
  default     = "mail@celebrationedmonton.com"
}

variable "owner_portal_url" {
  description = "Public URL of the owner portal, embedded in invite emails."
  type        = string
  default     = "https://visit.fathersdaycarshow.ca/owner"
}

variable "pco_callback_url" {
  description = "Full public callback URL registered in the PCO OAuth app (e.g. https://example.com/api/auth/planning-center/callback)."
  type        = string
  default     = ""
}

variable "pco_team_name" {
  description = "PCO Services team name used for access control. Defaults to 'carshow'."
  type        = string
  default     = "carshow"
}

variable "admin_web_url" {
  description = "Public URL of the admin SPA, used to redirect after PCO OAuth (e.g. https://example.com/admin)."
  type        = string
  default     = ""
}

variable "judge_web_url" {
  description = "Public URL of the judge SPA, used to redirect after PCO OAuth (e.g. https://example.com/judge)."
  type        = string
  default     = ""
}

variable "cors_allowed_origins" {
  description = <<-EOT
    Comma-separated list of origins the API allows via CORS (e.g.
    "https://visit.fathersdaycarshow.ca"). The SPAs are same-origin behind
    CloudFront so this rarely matters in practice, but pinning it locks the API
    to the known web origin in production. Leave empty to reflect any origin.
  EOT
  type        = string
  default     = ""
}

variable "alert_email" {
  description = <<-EOT
    Email address subscribed to the CloudWatch alarm SNS topic. Leave empty to
    create the alarms without any notification subscription. After the first
    apply, confirm the SNS subscription email AWS sends to this address.
  EOT
  type        = string
  default     = ""
}

variable "alert_sms" {
  description = <<-EOT
    Phone number (E.164, e.g. "+15872972388") subscribed to the alarm SNS topic
    for SMS. Leave empty to skip SMS. Note: new accounts are in the SNS SMS
    sandbox — the destination number must be verified in the SNS console (Mobile
    → Text messaging → Sandbox) or you must request production SMS access, or
    messages won't be delivered. SMS is attached to the app-region topic only.
  EOT
  type        = string
  default     = ""
}

variable "skip_cloudfront" {
  description = <<-EOT
    Skip CloudFront, OAC, and CF Functions entirely. The ACM certificate is still
    created but left unvalidated (harmless — it is never attached to anything).
    Use only when you want to bypass the CDN layer completely (e.g. a very cheap
    test stack). For perf testing, prefer skip_cloudfront=false +
    cloudfront_custom_domain=false so caching behaviors are exercised.
    Saves ~10–15 min of CloudFront provisioning time per deploy.
  EOT
  type        = bool
  default     = false
}

variable "cloudfront_custom_domain" {
  description = <<-EOT
    When true (default), CloudFront requires a custom domain alias and an ACM
    certificate — the normal test/prod posture. When false, the distribution uses
    its AWS-assigned *.cloudfront.net domain with the built-in CloudFront
    certificate so no domain or DNS is needed. Use false for the perf stack so the
    full CloudFront distribution (including cache behaviors) can be tested without
    a custom domain or cert validation delay.
  EOT
  type        = bool
  default     = true
}

variable "decommissioned" {
  description = <<-EOT
    When true, all backend resources (ECS, ALB, RDS, ECR, Secrets Manager, CloudWatch
    alarms) are destroyed and CloudFront is updated to serve only the static
    "event is over" page from the public-web S3 bucket. The photos bucket and
    CloudFront distribution remain so /photos/* URLs continue to work.
    Set this AFTER running infra/scripts/backup-db.sh and verifying the backups.
  EOT
  type        = bool
  default     = false
}

variable "compute_mode" {
  description = <<-EOT
    How the API is hosted.
      "ecs" — event-day footprint: ECS Fargate behind an ALB, RDS PostgreSQL,
              Secrets Manager, and CloudWatch alarms/dashboard. Scales for the show.
      "ec2" — cheap year-round footprint: a single small EC2 instance running the
              API and PostgreSQL in Docker, behind CloudFront directly (no ALB),
              secrets in SSM Parameter Store. ~$22/mo vs ~$160/mo for "ecs".
    Ignored when decommissioned = true (everything backend is torn down).
    Switch back to "ecs" before the next event; restore data from the nightly
    pg_dump in s3://carshow-photos-<env>/backups/db/ or the RDS final snapshot.
  EOT
  type        = string
  default     = "ecs"

  validation {
    condition     = contains(["ecs", "ec2"], var.compute_mode)
    error_message = "compute_mode must be \"ecs\" or \"ec2\"."
  }
}

variable "ec2_instance_type" {
  description = "EC2 instance type for compute_mode = ec2. x86_64 (t3) to match the linux/amd64 image built natively on the x64 CI runner (no cross-arch emulation). t3.small (2 GB) is the safe minimum for API + Postgres + the moderation worker."
  type        = string
  default     = "t3.small"
}

variable "ec2_data_volume_size" {
  description = "Size (GB) of the dedicated EBS data volume that holds the Postgres data dir on compute_mode = ec2. Survives instance replacement."
  type        = number
  default     = 20
}

variable "image_tag" {
  description = <<-EOT
    ECR image tag for the ECS task definition.
    Use a git commit SHA in production -- never "latest" once the service is live.
    Bootstrap order: run `terraform apply -target=aws_ecr_repository.api` first,
    push an image, then run `terraform apply` for the full stack.
  EOT
  type        = string
  default     = "latest"
}

variable "db_connection_limit" {
  description = <<-EOT
    Prisma connection pool size per Fargate task, appended to DATABASE_URL as
    ?connection_limit=N. Leave null to use Prisma's default (num_cpus*2+1, ~3
    for a 1-vCPU task). Set to 20 for prod/perf: 2 tasks × 20 = 40 connections
    at steady state, 5 tasks × 20 = 100 at max scale — well within db.t3.medium
    capacity (~451 max). Keep null for the test stack (single task, low traffic).
  EOT
  type        = number
  default     = null
}
