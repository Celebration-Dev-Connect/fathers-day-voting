# The API runs outside AWS (Proxmox), so it authenticates with an IAM user access key.
resource "aws_iam_user" "api" {
  name = "${var.project}-${var.environment}-api"

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}

data "aws_iam_policy_document" "api" {
  statement {
    sid     = "PhotoBucketObjects"
    actions = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.photos.arn}/*"]
  }

  statement {
    sid       = "ModerationScan"
    actions   = ["rekognition:DetectModerationLabels"]
    resources = ["*"]
  }
}

resource "aws_iam_user_policy" "api" {
  name   = "${var.project}-${var.environment}-api-policy"
  user   = aws_iam_user.api.name
  policy = data.aws_iam_policy_document.api.json
}

resource "aws_iam_access_key" "api" {
  user = aws_iam_user.api.name
}
