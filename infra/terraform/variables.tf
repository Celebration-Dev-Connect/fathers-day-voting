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

variable "db_username" {
  description = "PostgreSQL master username."
  type        = string
  default     = "carshow"
}

# ── Resource sizing (lower these for cheap test stacks) ──────────────────────

variable "app_runner_cpu" {
  description = "App Runner vCPU units. Valid: 256, 512, 1024, 2048, 4096. Test: 512."
  type        = string
  default     = "1024"
}

variable "app_runner_memory" {
  description = "App Runner memory (MB). Must pair with cpu (e.g. 512→1024, 1024→2048). Test: 1024."
  type        = string
  default     = "2048"
}

variable "app_runner_min_size" {
  description = "App Runner min instances (always-on; >=1). Test: 1."
  type        = number
  default     = 1
}

variable "app_runner_max_size" {
  description = "App Runner max instances. Test: 1 (≤5 concurrent testers)."
  type        = number
  default     = 3
}

variable "rds_instance_class" {
  description = "RDS instance class. Test: db.t3.micro."
  type        = string
  default     = "db.t3.micro"
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

variable "app_runner_image_tag" {
  description = <<-EOT
    ECR image tag for the App Runner service.
    Use a git commit SHA in production — never "latest" once the service is live.
    Bootstrap order: run `terraform apply -target=aws_ecr_repository.api` first,
    push an image, then run `terraform apply` for the full stack.
  EOT
  type        = string
  default     = "latest"
}
