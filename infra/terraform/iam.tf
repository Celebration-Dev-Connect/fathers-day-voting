# ── App Runner instance role ──────────────────────────────────────────────────
# Assumed by the running container. Grants least-privilege access to S3,
# Rekognition, and Secrets Manager. No long-lived credentials exist anywhere.

resource "aws_iam_role" "apprunner_instance" {
  name = "${var.project}-${var.environment}-apprunner-instance"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "tasks.apprunner.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}

data "aws_iam_policy_document" "apprunner_instance" {
  statement {
    sid       = "PhotosPendingReadWrite"
    actions   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.photos.arn}/pending/*"]
  }

  statement {
    sid       = "PhotosPublicWrite"
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.photos.arn}/public/*"]
  }

  statement {
    sid       = "Rekognition"
    actions   = ["rekognition:DetectModerationLabels"]
    resources = ["*"]
  }

  statement {
    sid     = "SecretsRead"
    actions = ["secretsmanager:GetSecretValue"]
    resources = [
      aws_secretsmanager_secret.db_url.arn,
      aws_secretsmanager_secret.jwt_secret.arn,
    ]
  }
}

resource "aws_iam_role_policy" "apprunner_instance" {
  name   = "${var.project}-${var.environment}-apprunner-instance"
  role   = aws_iam_role.apprunner_instance.id
  policy = data.aws_iam_policy_document.apprunner_instance.json
}

# ── App Runner access role ────────────────────────────────────────────────────
# Assumed by the App Runner control plane (not the container) to pull images
# from ECR. Distinct from the instance role — this is an App Runner requirement.

resource "aws_iam_role" "apprunner_access" {
  name = "${var.project}-${var.environment}-apprunner-access"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "build.apprunner.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}

resource "aws_iam_role_policy_attachment" "apprunner_access_ecr" {
  role       = aws_iam_role.apprunner_access.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess"
}
