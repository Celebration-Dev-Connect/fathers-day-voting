resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name        = "${var.project}-${var.environment}"
    Project     = var.project
    Environment = var.environment
  }
}

resource "aws_subnet" "private_a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.1.0/24"
  availability_zone = "${var.region}a"

  tags = {
    Name        = "${var.project}-${var.environment}-private-a"
    Project     = var.project
    Environment = var.environment
  }
}

resource "aws_subnet" "private_b" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.2.0/24"
  availability_zone = "${var.region}b"

  tags = {
    Name        = "${var.project}-${var.environment}-private-b"
    Project     = var.project
    Environment = var.environment
  }
}

# ── Security groups ───────────────────────────────────────────────────────────
# Rules are defined separately with aws_security_group_rule to avoid the
# circular dependency that arises from inline ingress/egress blocks that
# reference each other's IDs.

resource "aws_security_group" "rds" {
  name        = "${var.project}-${var.environment}-rds"
  description = "PostgreSQL — inbound from App Runner connector only"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name        = "${var.project}-${var.environment}-rds"
    Project     = var.project
    Environment = var.environment
  }
}

resource "aws_security_group" "apprunner_connector" {
  name        = "${var.project}-${var.environment}-apprunner-connector"
  description = "App Runner VPC connector — egress to RDS and VPC endpoints"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name        = "${var.project}-${var.environment}-apprunner-connector"
    Project     = var.project
    Environment = var.environment
  }
}

resource "aws_security_group" "vpc_endpoints" {
  name        = "${var.project}-${var.environment}-vpc-endpoints"
  description = "Interface VPC endpoints — inbound from App Runner connector"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name        = "${var.project}-${var.environment}-vpc-endpoints"
    Project     = var.project
    Environment = var.environment
  }
}

# ── Security group rules ──────────────────────────────────────────────────────

resource "aws_security_group_rule" "rds_ingress" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.rds.id
  source_security_group_id = aws_security_group.apprunner_connector.id
  description              = "Postgres from App Runner connector"
}

resource "aws_security_group_rule" "connector_egress_rds" {
  type                     = "egress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.apprunner_connector.id
  source_security_group_id = aws_security_group.rds.id
  description              = "Postgres to RDS"
}

resource "aws_security_group_rule" "connector_egress_endpoints" {
  type                     = "egress"
  from_port                = 443
  to_port                  = 443
  protocol                 = "tcp"
  security_group_id        = aws_security_group.apprunner_connector.id
  source_security_group_id = aws_security_group.vpc_endpoints.id
  description              = "HTTPS to VPC interface endpoints"
}

resource "aws_security_group_rule" "endpoints_ingress" {
  type                     = "ingress"
  from_port                = 443
  to_port                  = 443
  protocol                 = "tcp"
  security_group_id        = aws_security_group.vpc_endpoints.id
  source_security_group_id = aws_security_group.apprunner_connector.id
  description              = "HTTPS from App Runner connector"
}

# ── VPC endpoints ─────────────────────────────────────────────────────────────

# Gateway endpoint — no hourly charge; routes S3 traffic inside the VPC backbone.
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_vpc.main.default_route_table_id]

  tags = {
    Name        = "${var.project}-${var.environment}-s3"
    Project     = var.project
    Environment = var.environment
  }
}

resource "aws_vpc_endpoint" "secretsmanager" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.region}.secretsmanager"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = [aws_subnet.private_a.id, aws_subnet.private_b.id]
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = {
    Name        = "${var.project}-${var.environment}-secretsmanager"
    Project     = var.project
    Environment = var.environment
  }
}

resource "aws_vpc_endpoint" "rekognition" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.region}.rekognition"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = [aws_subnet.private_a.id, aws_subnet.private_b.id]
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = {
    Name        = "${var.project}-${var.environment}-rekognition"
    Project     = var.project
    Environment = var.environment
  }
}
