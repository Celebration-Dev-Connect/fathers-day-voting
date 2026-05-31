resource "aws_apprunner_vpc_connector" "api" {
  vpc_connector_name = "${var.project}-${var.environment}-api"
  subnets            = [aws_subnet.private_a.id, aws_subnet.private_b.id]
  security_groups    = [aws_security_group.apprunner_connector.id]

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}

resource "aws_apprunner_auto_scaling_configuration_version" "api" {
  auto_scaling_configuration_name = "${var.project}-${var.environment}-api"
  min_size                        = 1
  max_size                        = 3

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}

resource "aws_apprunner_service" "api" {
  service_name = "${var.project}-${var.environment}-api"

  source_configuration {
    authentication_configuration {
      access_role_arn = aws_iam_role.apprunner_access.arn
    }

    image_repository {
      image_identifier      = "${aws_ecr_repository.api.repository_url}:${var.app_runner_image_tag}"
      image_repository_type = "ECR"

      image_configuration {
        port = "4000"

        runtime_environment_variables = {
          API_PORT          = "4000"
          API_HOST          = "0.0.0.0"
          NODE_ENV          = "production"
          AWS_REGION        = var.region
          S3_BUCKET         = aws_s3_bucket.photos.bucket
          CDN_BASE_URL      = "https://${var.domain}/photos"
          MODERATION_DRIVER = "rekognition"
        }

        # Secrets Manager ARNs — App Runner fetches the current value at startup.
        runtime_environment_secrets = {
          DATABASE_URL = aws_secretsmanager_secret.db_url.arn
          JWT_SECRET   = aws_secretsmanager_secret.jwt_secret.arn
        }
      }
    }

    auto_deployments_enabled = false
  }

  instance_configuration {
    cpu               = "1024"
    memory            = "2048"
    instance_role_arn = aws_iam_role.apprunner_instance.arn
  }

  auto_scaling_configuration_arn = aws_apprunner_auto_scaling_configuration_version.api.arn

  network_configuration {
    egress_configuration {
      egress_type       = "VPC"
      vpc_connector_arn = aws_apprunner_vpc_connector.api.arn
    }
  }

  health_check_configuration {
    protocol            = "HTTP"
    path                = "/health"
    interval            = 10
    timeout             = 5
    healthy_threshold   = 1
    unhealthy_threshold = 5
  }

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}
