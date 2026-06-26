# ── SSM Parameter Store secrets (compute_mode = ec2) ─────────────────────────
# Year-round EC2 mode reads secrets from SSM Parameter Store instead of Secrets
# Manager. Standard-tier SecureString parameters are free, saving the ~$3/mo
# Secrets Manager charge. The instance fetches these at boot/deploy via
# `aws ssm get-parameters-by-path --path /carshow/<env> --with-decryption` and
# writes them into /opt/carshow/.env for docker compose.
#
# In ec2 mode the database runs as a Docker container on the box, so DATABASE_URL
# points at the compose service hostname `postgres`, not RDS.

resource "aws_ssm_parameter" "db_password" {
  count = local.ec2_active ? 1 : 0
  name  = "/${var.project}/${var.environment}/db-password"
  type  = "SecureString"
  value = random_password.db.result
  tags  = { Project = var.project, Environment = var.environment }
}

resource "aws_ssm_parameter" "db_url" {
  count = local.ec2_active ? 1 : 0
  name  = "/${var.project}/${var.environment}/db-url"
  type  = "SecureString"
  value = "postgresql://${var.db_username}:${local.db_password_url_encoded}@postgres:5432/${var.project}?schema=public${var.db_connection_limit != null ? "&connection_limit=${var.db_connection_limit}" : ""}"
  tags  = { Project = var.project, Environment = var.environment }
}

resource "aws_ssm_parameter" "jwt_secret" {
  count = local.ec2_active ? 1 : 0
  name  = "/${var.project}/${var.environment}/jwt-secret"
  type  = "SecureString"
  value = random_password.jwt_secret.result
  tags  = { Project = var.project, Environment = var.environment }
}

resource "aws_ssm_parameter" "pco_client_id" {
  count = local.ec2_active ? 1 : 0
  name  = "/${var.project}/${var.environment}/pco-client-id"
  type  = "SecureString"
  value = var.pco_client_id
  tags  = { Project = var.project, Environment = var.environment }
}

resource "aws_ssm_parameter" "pco_client_secret" {
  count = local.ec2_active ? 1 : 0
  name  = "/${var.project}/${var.environment}/pco-client-secret"
  type  = "SecureString"
  value = var.pco_client_secret
  tags  = { Project = var.project, Environment = var.environment }
}

resource "aws_ssm_parameter" "webguide_username" {
  count = local.ec2_active ? 1 : 0
  name  = "/${var.project}/${var.environment}/webguide-username"
  type  = "SecureString"
  value = var.webguide_username
  tags  = { Project = var.project, Environment = var.environment }
}

resource "aws_ssm_parameter" "webguide_password" {
  count = local.ec2_active ? 1 : 0
  name  = "/${var.project}/${var.environment}/webguide-password"
  type  = "SecureString"
  value = var.webguide_password
  tags  = { Project = var.project, Environment = var.environment }
}

resource "aws_ssm_parameter" "email_smtp_username" {
  count = local.ec2_active ? 1 : 0
  name  = "/${var.project}/${var.environment}/email-smtp-username"
  type  = "SecureString"
  value = var.email_smtp_username
  tags  = { Project = var.project, Environment = var.environment }
}

resource "aws_ssm_parameter" "email_smtp_password" {
  count = local.ec2_active ? 1 : 0
  name  = "/${var.project}/${var.environment}/email-smtp-password"
  type  = "SecureString"
  value = var.email_smtp_password
  tags  = { Project = var.project, Environment = var.environment }
}

# Non-secret application environment (mirrors the ECS task definition env block in
# ecs.tf). Delivered as a single String param so the box's bootstrap can drop it
# straight into /opt/carshow/.env. AWS credentials are NOT here — the container
# uses the instance profile via IMDS.
resource "aws_ssm_parameter" "app_env" {
  count = local.ec2_active ? 1 : 0
  name  = "/${var.project}/${var.environment}/app-env"
  type  = "String"
  value = <<-EOT
    NODE_ENV=production
    API_PORT=4000
    API_HOST=0.0.0.0
    AWS_REGION=${var.region}
    REKOGNITION_REGION=us-east-1
    S3_BUCKET=${aws_s3_bucket.photos.bucket}
    CDN_BASE_URL=https://${var.domain}/photos
    STORAGE_DRIVER=s3
    MODERATION_DRIVER=rekognition
    TEXT_MODERATION_DRIVER=comprehend
    ENABLE_DEV_LOGIN=${var.enable_dev_login ? "true" : "false"}
    PLANNING_CENTER_CALLBACK_URL=${var.pco_callback_url}
    PCO_TEAM_NAME=${var.pco_team_name}
    ADMIN_WEB_URL=${var.admin_web_url}
    JUDGE_WEB_URL=${var.judge_web_url}
    CORS_ALLOWED_ORIGINS=${var.cors_allowed_origins}
    EMAIL_DRIVER=ses
    EMAIL_FROM_ADDRESS=${var.email_from_address}
    EMAIL_FROM_NAME=Father's Day Car Show
    EMAIL_SMTP_HOST=email-smtp.${var.region}.amazonaws.com
    EMAIL_SMTP_PORT=465
    OWNER_PORTAL_URL=${var.owner_portal_url}
  EOT
  tags  = { Project = var.project, Environment = var.environment }
}

# The compose file and backup script live in the repo (single source of truth)
# and are shipped to the box via SSM so user-data stays a plain static script.
resource "aws_ssm_parameter" "compose" {
  count = local.ec2_active ? 1 : 0
  name  = "/${var.project}/${var.environment}/compose"
  type  = "String"
  value = file("${path.module}/../ec2/docker-compose.prod.yml")
  tags  = { Project = var.project, Environment = var.environment }
}

resource "aws_ssm_parameter" "backup_script" {
  count = local.ec2_active ? 1 : 0
  name  = "/${var.project}/${var.environment}/backup-script"
  type  = "String"
  value = file("${path.module}/../ec2/backup-db.sh")
  tags  = { Project = var.project, Environment = var.environment }
}

# Non-secret runtime config the box also needs, kept in plain SSM params so the
# deploy script and the box agree on the same values without baking them into
# user_data. The deploy script overwrites image-tag on each release.
resource "aws_ssm_parameter" "image_tag" {
  count     = local.ec2_active ? 1 : 0
  name      = "/${var.project}/${var.environment}/image-tag"
  type      = "String"
  value     = var.image_tag
  overwrite = true
  # The CI deploy updates this out-of-band on each release; don't revert it.
  lifecycle {
    ignore_changes = [value]
  }
  tags = { Project = var.project, Environment = var.environment }
}
