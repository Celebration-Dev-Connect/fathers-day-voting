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

# ── Private subnets (RDS only) ───────────────────────────────────────────────
# RDS has no internet route; reachable only from the ECS tasks security group.

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

# ── Public subnets (ALB + ECS tasks) ─────────────────────────────────────────
# Tasks get a public IP and reach ECR / Secrets Manager / Rekognition /
# CloudWatch over the internet gateway — no NAT or interface endpoints needed.
# Inbound is still closed: the tasks security group only admits the ALB.

resource "aws_subnet" "public_a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.10.0/24"
  availability_zone = "${var.region}a"

  tags = {
    Name        = "${var.project}-${var.environment}-public-a"
    Project     = var.project
    Environment = var.environment
  }
}

resource "aws_subnet" "public_b" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.11.0/24"
  availability_zone = "${var.region}b"

  tags = {
    Name        = "${var.project}-${var.environment}-public-b"
    Project     = var.project
    Environment = var.environment
  }
}

# ── Internet Gateway + public routing ─────────────────────────────────────────

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name        = "${var.project}-${var.environment}"
    Project     = var.project
    Environment = var.environment
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name        = "${var.project}-${var.environment}-public"
    Project     = var.project
    Environment = var.environment
  }
}

resource "aws_route_table_association" "public_a" {
  subnet_id      = aws_subnet.public_a.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "public_b" {
  subnet_id      = aws_subnet.public_b.id
  route_table_id = aws_route_table.public.id
}

# ── Security groups ───────────────────────────────────────────────────────────
# Rules are defined separately with aws_security_group_rule to avoid the
# circular dependency that arises from inline ingress/egress blocks that
# reference each other's IDs.

resource "aws_security_group" "alb" {
  name        = "${var.project}-${var.environment}-alb"
  description = "ALB - inbound HTTP from internet, egress to ECS tasks"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name        = "${var.project}-${var.environment}-alb"
    Project     = var.project
    Environment = var.environment
  }
}

resource "aws_security_group" "ecs_tasks" {
  name        = "${var.project}-${var.environment}-ecs-tasks"
  description = "ECS Fargate tasks - inbound from ALB only, egress to RDS + AWS APIs"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name        = "${var.project}-${var.environment}-ecs-tasks"
    Project     = var.project
    Environment = var.environment
  }
}

resource "aws_security_group" "rds" {
  name        = "${var.project}-${var.environment}-rds"
  description = "PostgreSQL - inbound from ECS tasks only"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name        = "${var.project}-${var.environment}-rds"
    Project     = var.project
    Environment = var.environment
  }
}

# ── Security group rules ──────────────────────────────────────────────────────

# ALB: allow HTTP from internet (CloudFront terminates HTTPS)
resource "aws_security_group_rule" "alb_ingress_http" {
  type              = "ingress"
  from_port         = 80
  to_port           = 80
  protocol          = "tcp"
  security_group_id = aws_security_group.alb.id
  cidr_blocks       = ["0.0.0.0/0"]
  description       = "HTTP from internet"
}

# ALB: egress to ECS tasks on port 4000
resource "aws_security_group_rule" "alb_egress_ecs" {
  type                     = "egress"
  from_port                = 4000
  to_port                  = 4000
  protocol                 = "tcp"
  security_group_id        = aws_security_group.alb.id
  source_security_group_id = aws_security_group.ecs_tasks.id
  description              = "API traffic to ECS tasks"
}

# ECS tasks: inbound from ALB only (this is what keeps the public-IP task closed)
resource "aws_security_group_rule" "ecs_ingress_alb" {
  type                     = "ingress"
  from_port                = 4000
  to_port                  = 4000
  protocol                 = "tcp"
  security_group_id        = aws_security_group.ecs_tasks.id
  source_security_group_id = aws_security_group.alb.id
  description              = "API traffic from ALB"
}

# ECS tasks: egress to RDS
resource "aws_security_group_rule" "ecs_egress_rds" {
  type                     = "egress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.ecs_tasks.id
  source_security_group_id = aws_security_group.rds.id
  description              = "Postgres to RDS"
}

# ECS tasks: HTTPS egress to the internet for ECR image pulls, Secrets Manager,
# Rekognition, and CloudWatch Logs (all reached over the internet gateway).
resource "aws_security_group_rule" "ecs_egress_https" {
  type              = "egress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  security_group_id = aws_security_group.ecs_tasks.id
  cidr_blocks       = ["0.0.0.0/0"]
  description       = "HTTPS to AWS APIs and ECR"
}

# RDS: inbound from ECS tasks
resource "aws_security_group_rule" "rds_ingress" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.rds.id
  source_security_group_id = aws_security_group.ecs_tasks.id
  description              = "Postgres from ECS tasks"
}

# ── VPC endpoints ─────────────────────────────────────────────────────────────

# Gateway endpoint — no hourly charge; keeps same-region S3 traffic (image
# layers, photo uploads) on the AWS backbone instead of the public path.
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.public.id]

  tags = {
    Name        = "${var.project}-${var.environment}-s3"
    Project     = var.project
    Environment = var.environment
  }
}
