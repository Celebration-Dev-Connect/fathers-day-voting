resource "aws_db_subnet_group" "main" {
  count      = local.ecs_active ? 1 : 0
  name       = "${var.project}-${var.environment}"
  subnet_ids = [aws_subnet.private_a.id, aws_subnet.private_b.id]

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}

resource "aws_db_parameter_group" "postgres16" {
  count  = local.ecs_active ? 1 : 0
  name   = "${var.project}-${var.environment}-postgres16"
  family = "postgres16"

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}

resource "aws_db_instance" "main" {
  count             = local.ecs_active ? 1 : 0
  identifier        = "${var.project}-${var.environment}"
  engine            = "postgres"
  engine_version    = "16"
  instance_class    = var.rds_instance_class
  allocated_storage = var.rds_allocated_storage
  storage_type      = "gp3"

  db_name  = var.project
  username = var.db_username
  password = random_password.db.result

  parameter_group_name   = aws_db_parameter_group.postgres16[0].name
  db_subnet_group_name   = aws_db_subnet_group.main[0].name
  vpc_security_group_ids = [aws_security_group.rds.id]

  publicly_accessible       = false
  deletion_protection       = var.teardown_friendly ? false : true
  skip_final_snapshot       = var.teardown_friendly ? true : false
  final_snapshot_identifier = var.teardown_friendly ? null : "${var.project}-${var.environment}-final"
  backup_retention_period   = var.rds_backup_retention

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}
