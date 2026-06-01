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

resource "aws_secretsmanager_secret_version" "db_url" {
  secret_id     = aws_secretsmanager_secret.db_url.id
  secret_string = "postgresql://${var.db_username}:${random_password.db.result}@${aws_db_instance.main.address}:5432/${var.project}?schema=public"
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
