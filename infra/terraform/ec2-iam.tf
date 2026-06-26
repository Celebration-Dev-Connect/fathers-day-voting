# ── EC2 instance role (compute_mode = ec2) ───────────────────────────────────
# The year-round box assumes this role for: SSM Session Manager + Send-Command
# (no SSH), ECR image pulls, S3 photo read/write, the nightly DB backup to S3,
# Rekognition/Comprehend moderation, and reading the SSM Parameter Store secrets.

data "aws_caller_identity" "current" {}

resource "aws_iam_role" "ec2" {
  count = local.ec2_active ? 1 : 0
  name  = "${var.project}-${var.environment}-ec2"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = { Project = var.project, Environment = var.environment }
}

# Session Manager (shell access) + Send-Command (deploys) without opening SSH.
resource "aws_iam_role_policy_attachment" "ec2_ssm_core" {
  count      = local.ec2_active ? 1 : 0
  role       = aws_iam_role.ec2[0].name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

data "aws_iam_policy_document" "ec2" {
  count = local.ec2_active ? 1 : 0

  # Pull the API image from ECR.
  statement {
    sid       = "EcrAuth"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
  statement {
    sid = "EcrPull"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
    ]
    resources = [aws_ecr_repository.api[0].arn]
  }

  # Photo pipeline (mirrors the ECS task role in iam.tf).
  statement {
    sid       = "PhotosBucketList"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.photos.arn]
  }
  statement {
    sid       = "PhotosReadWrite"
    actions   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.photos.arn}/pending/*", "${aws_s3_bucket.photos.arn}/public/*"]
  }

  # Nightly pg_dump backups + the one-time JSON export prefix.
  statement {
    sid       = "BackupsWrite"
    actions   = ["s3:PutObject", "s3:GetObject", "s3:ListBucket"]
    resources = [aws_s3_bucket.photos.arn, "${aws_s3_bucket.photos.arn}/backups/*"]
  }

  statement {
    sid       = "Rekognition"
    actions   = ["rekognition:DetectModerationLabels", "rekognition:DetectLabels"]
    resources = ["*"]
  }
  statement {
    sid       = "Comprehend"
    actions   = ["comprehend:DetectToxicContent"]
    resources = ["*"]
  }

  # Read the app secrets + runtime config from SSM Parameter Store.
  statement {
    sid     = "SsmRead"
    actions = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"]
    resources = [
      "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter/${var.project}/${var.environment}",
      "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter/${var.project}/${var.environment}/*",
    ]
  }

  # Decrypt SecureString parameters (default aws/ssm managed key).
  statement {
    sid       = "SsmKmsDecrypt"
    actions   = ["kms:Decrypt"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ssm.${var.region}.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "ec2" {
  count  = local.ec2_active ? 1 : 0
  name   = "${var.project}-${var.environment}-ec2"
  role   = aws_iam_role.ec2[0].id
  policy = data.aws_iam_policy_document.ec2[0].json
}

resource "aws_iam_instance_profile" "ec2" {
  count = local.ec2_active ? 1 : 0
  name  = "${var.project}-${var.environment}-ec2"
  role  = aws_iam_role.ec2[0].name

  tags = { Project = var.project, Environment = var.environment }
}
