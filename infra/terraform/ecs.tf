# ── ECS Cluster ───────────────────────────────────────────────────────────────

resource "aws_ecs_cluster" "main" {
  name = "${var.project}-${var.environment}"

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE"]
}

# ── CloudWatch Log Group ──────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${var.project}-${var.environment}-api"
  retention_in_days = 7

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}

# ── Task Definition ───────────────────────────────────────────────────────────

resource "aws_ecs_task_definition" "api" {
  family                   = "${var.project}-${var.environment}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.ecs_cpu
  memory                   = var.ecs_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name  = "api"
    image = "${aws_ecr_repository.api.repository_url}:${var.image_tag}"

    portMappings = [{
      containerPort = 4000
      protocol      = "tcp"
    }]

    environment = [
      { name = "API_PORT", value = "4000" },
      { name = "API_HOST", value = "0.0.0.0" },
      { name = "NODE_ENV", value = "production" },
      { name = "AWS_REGION", value = var.region },
      { name = "REKOGNITION_REGION", value = "us-east-1" },
      { name = "S3_BUCKET", value = aws_s3_bucket.photos.bucket },
      { name = "CDN_BASE_URL", value = "https://${var.domain}/photos" },
      { name = "STORAGE_DRIVER", value = "s3" },
      { name = "MODERATION_DRIVER", value = "rekognition" },
      { name = "TEXT_MODERATION_DRIVER", value = "comprehend" },
      { name = "ENABLE_DEV_LOGIN", value = var.enable_dev_login ? "true" : "false" },
      { name = "RUN_SEED", value = var.run_seed ? "true" : "false" },
      { name = "PLANNING_CENTER_CALLBACK_URL", value = var.pco_callback_url },
      { name = "PCO_TEAM_NAME", value = var.pco_team_name },
      { name = "ADMIN_WEB_URL", value = var.admin_web_url },
      { name = "JUDGE_WEB_URL", value = var.judge_web_url },
      { name = "CORS_ALLOWED_ORIGINS", value = var.cors_allowed_origins },
    ]

    secrets = [
      { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.db_url.arn },
      { name = "JWT_SECRET", valueFrom = aws_secretsmanager_secret.jwt_secret.arn },
      { name = "PLANNING_CENTER_CLIENT_ID", valueFrom = aws_secretsmanager_secret.pco_client_id.arn },
      { name = "PLANNING_CENTER_CLIENT_SECRET", valueFrom = aws_secretsmanager_secret.pco_client_secret.arn },
      { name = "WEBGUIDE_USERNAME", valueFrom = aws_secretsmanager_secret.webguide_username.arn },
      { name = "WEBGUIDE_PASSWORD", valueFrom = aws_secretsmanager_secret.webguide_password.arn },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.api.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "api"
      }
    }

    essential = true
  }])

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}

# ── Application Load Balancer ─────────────────────────────────────────────────

resource "aws_lb" "api" {
  name               = "${var.project}-${var.environment}-api"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = [aws_subnet.public_a.id, aws_subnet.public_b.id]

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}

resource "aws_lb_target_group" "api" {
  name        = "${var.project}-${var.environment}-api"
  port        = 4000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    path                = "/health"
    healthy_threshold   = 2
    unhealthy_threshold = 5
    interval            = 30
    timeout             = 5
  }

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}

# CloudFront -> ALB uses plain HTTP on port 80; TLS is terminated at CloudFront.
resource "aws_lb_listener" "api" {
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

# ── ECS Service ───────────────────────────────────────────────────────────────

resource "aws_ecs_service" "api" {
  name            = "${var.project}-${var.environment}-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.ecs_min_size
  launch_type     = "FARGATE"

  # The container runs migrations + optional seed on boot; give it time to come
  # up before the ALB health check can mark it unhealthy and trigger a replace.
  health_check_grace_period_seconds = 120

  # Public subnets + public IP so tasks reach ECR/AWS APIs over the IGW.
  # Inbound stays closed via the ecs_tasks security group (ALB only).
  network_configuration {
    subnets          = [aws_subnet.public_a.id, aws_subnet.public_b.id]
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 4000
  }

  # Desired count is owned by app autoscaling after creation — don't let
  # Terraform revert it on every apply.
  lifecycle {
    ignore_changes = [desired_count]
  }

  # The target group must be attached to a listener before ECS will register
  # the service against it.
  depends_on = [aws_lb_listener.api]

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}

# ── Auto Scaling ──────────────────────────────────────────────────────────────

resource "aws_appautoscaling_target" "api" {
  max_capacity       = var.ecs_max_size
  min_capacity       = var.ecs_min_size
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"

  depends_on = [aws_ecs_service.api]
}

resource "aws_appautoscaling_policy" "api_requests" {
  name               = "${var.project}-${var.environment}-api-requests"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  service_namespace  = aws_appautoscaling_target.api.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      # Format: <alb-arn-suffix>/<tg-arn-suffix>
      resource_label = "${aws_lb.api.arn_suffix}/${aws_lb_target_group.api.arn_suffix}"
    }
    # Scale out when any task is receiving more than 1,000 req/min (~17 req/s).
    # This fires on actual inbound load rather than CPU, which stays low for
    # I/O-bound workloads (DB waits don't burn CPU).
    target_value = 1000
  }
}
