# Two plain-string secrets so ECS can inject each as a discrete env var.
# The RDS password and address are not known until rds.tf resources are created;
# Terraform resolves the dependency order automatically.

resource "aws_secretsmanager_secret" "db_url" {
  name                    = "${var.project}/${var.environment}/db-url"
  recovery_window_in_days = 0

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}

locals {
  # URL-encode the DB password so special chars don't break the connection string.
  # % must be replaced first to avoid double-encoding.
  db_password_url_encoded = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
    random_password.db.result,
    "%", "%25"), "#", "%23"), "@", "%40"), "?", "%3F"), "[", "%5B"), "]", "%5D"),
  "&", "%26"), "=", "%3D"), "+", "%2B"), "/", "%2F"), "!", "%21")
}

resource "aws_secretsmanager_secret_version" "db_url" {
  secret_id     = aws_secretsmanager_secret.db_url.id
  secret_string = "postgresql://${var.db_username}:${local.db_password_url_encoded}@${aws_db_instance.main.address}:5432/${var.project}?schema=public${var.db_connection_limit != null ? "&connection_limit=${var.db_connection_limit}" : ""}"
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name                    = "${var.project}/${var.environment}/jwt-secret"
  recovery_window_in_days = 0

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = random_password.jwt_secret.result
}

resource "aws_secretsmanager_secret" "pco_client_id" {
  name                    = "${var.project}/${var.environment}/pco-client-id"
  recovery_window_in_days = 0

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret_version" "pco_client_id" {
  secret_id     = aws_secretsmanager_secret.pco_client_id.id
  secret_string = var.pco_client_id
}

resource "aws_secretsmanager_secret" "pco_client_secret" {
  name                    = "${var.project}/${var.environment}/pco-client-secret"
  recovery_window_in_days = 0

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret_version" "pco_client_secret" {
  secret_id     = aws_secretsmanager_secret.pco_client_secret.id
  secret_string = var.pco_client_secret
}

resource "aws_secretsmanager_secret" "pco_api_app_id" {
  name                    = "${var.project}/${var.environment}/pco-api-app-id"
  recovery_window_in_days = 0

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret_version" "pco_api_app_id" {
  secret_id     = aws_secretsmanager_secret.pco_api_app_id.id
  secret_string = var.pco_api_app_id
}

resource "aws_secretsmanager_secret" "pco_api_secret" {
  name                    = "${var.project}/${var.environment}/pco-api-secret"
  recovery_window_in_days = 0

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret_version" "pco_api_secret" {
  secret_id     = aws_secretsmanager_secret.pco_api_secret.id
  secret_string = var.pco_api_secret
}

resource "aws_secretsmanager_secret" "webguide_username" {
  name                    = "${var.project}/${var.environment}/webguide-username"
  recovery_window_in_days = 0

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret_version" "webguide_username" {
  secret_id     = aws_secretsmanager_secret.webguide_username.id
  secret_string = var.webguide_username
}

resource "aws_secretsmanager_secret" "webguide_password" {
  name                    = "${var.project}/${var.environment}/webguide-password"
  recovery_window_in_days = 0

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret_version" "webguide_password" {
  secret_id     = aws_secretsmanager_secret.webguide_password.id
  secret_string = var.webguide_password
}

resource "aws_secretsmanager_secret" "email_smtp_username" {
  name                    = "${var.project}/${var.environment}/email-smtp-username"
  recovery_window_in_days = 0

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret_version" "email_smtp_username" {
  secret_id     = aws_secretsmanager_secret.email_smtp_username.id
  secret_string = var.email_smtp_username
}

resource "aws_secretsmanager_secret" "email_smtp_password" {
  name                    = "${var.project}/${var.environment}/email-smtp-password"
  recovery_window_in_days = 0

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret_version" "email_smtp_password" {
  secret_id     = aws_secretsmanager_secret.email_smtp_password.id
  secret_string = var.email_smtp_password
}
