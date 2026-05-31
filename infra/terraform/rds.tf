resource "aws_db_subnet_group" "main" {
  name       = "${var.project}-${var.environment}"
  subnet_ids = [aws_subnet.private_a.id, aws_subnet.private_b.id]

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}

resource "aws_db_parameter_group" "postgres16" {
  name   = "${var.project}-${var.environment}-postgres16"
  family = "postgres16"

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}

resource "aws_db_instance" "main" {
  identifier        = "${var.project}-${var.environment}"
  engine            = "postgres"
  engine_version    = "16"
  instance_class    = "db.t3.micro"
  allocated_storage = 20
  storage_type      = "gp3"

  db_name  = var.project
  username = var.db_username
  password = random_password.db.result

  parameter_group_name   = aws_db_parameter_group.postgres16.name
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  publicly_accessible     = false
  deletion_protection     = true
  skip_final_snapshot     = false
  final_snapshot_identifier = "${var.project}-${var.environment}-final"
  backup_retention_period = 1

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}
