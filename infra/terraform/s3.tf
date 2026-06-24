# ── Photos ────────────────────────────────────────────────────────────────────
# Kept even when decommissioned — photos remain accessible at /photos/* via
# the CloudFront distribution.

resource "aws_s3_bucket" "photos" {
  bucket        = "${var.project}-photos-${var.environment}"
  force_destroy = var.teardown_friendly

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}

resource "aws_s3_bucket_public_access_block" "photos" {
  bucket                  = aws_s3_bucket.photos.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "photos" {
  bucket = aws_s3_bucket.photos.id
  rule { object_ownership = "BucketOwnerEnforced" }
}

resource "aws_s3_bucket_cors_configuration" "photos" {
  bucket = aws_s3_bucket.photos.id
  cors_rule {
    allowed_methods = ["PUT", "POST", "GET"]
    allowed_origins = ["https://${var.domain}"]
    allowed_headers = ["*"]
    max_age_seconds = 3000
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "photos" {
  bucket = aws_s3_bucket.photos.id
  rule {
    id     = "expire-pending"
    status = "Enabled"
    filter { prefix = "pending/" }
    expiration { days = 2 }
  }
}

data "aws_iam_policy_document" "photos_bucket" {
  dynamic "statement" {
    for_each = var.skip_cloudfront ? [] : [1]
    content {
      sid       = "AllowCloudFrontReadPublicPrefix"
      actions   = ["s3:GetObject"]
      resources = ["${aws_s3_bucket.photos.arn}/public/*"]
      principals {
        type        = "Service"
        identifiers = ["cloudfront.amazonaws.com"]
      }
      condition {
        test     = "StringEquals"
        variable = "AWS:SourceArn"
        values   = [aws_cloudfront_distribution.main[0].arn]
      }
    }
  }

  statement {
    sid     = "AllowRekognitionRead"
    actions = ["s3:GetObject"]
    resources = [
      "${aws_s3_bucket.photos.arn}/pending/*",
      "${aws_s3_bucket.photos.arn}/public/*",
    ]
    principals {
      type        = "Service"
      identifiers = ["rekognition.amazonaws.com"]
    }
  }
}

resource "aws_s3_bucket_policy" "photos" {
  bucket     = aws_s3_bucket.photos.id
  policy     = data.aws_iam_policy_document.photos_bucket.json
  depends_on = [aws_s3_bucket_public_access_block.photos]
}

# ── Admin web SPA ─────────────────────────────────────────────────────────────
# Destroyed when decommissioned. Empty the bucket manually before applying.

resource "aws_s3_bucket" "admin_web" {
  count         = var.decommissioned ? 0 : 1
  bucket        = "${var.project}-admin-web-${var.environment}"
  force_destroy = var.teardown_friendly

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}

resource "aws_s3_bucket_public_access_block" "admin_web" {
  count                   = var.decommissioned ? 0 : 1
  bucket                  = aws_s3_bucket.admin_web[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "admin_web" {
  count  = var.decommissioned ? 0 : 1
  bucket = aws_s3_bucket.admin_web[0].id
  rule { object_ownership = "BucketOwnerEnforced" }
}

data "aws_iam_policy_document" "admin_web_bucket" {
  dynamic "statement" {
    for_each = var.skip_cloudfront ? [] : [1]
    content {
      sid       = "AllowCloudFrontRead"
      actions   = ["s3:GetObject"]
      resources = ["${try(aws_s3_bucket.admin_web[0].arn, "arn:aws:s3:::decommissioned")}/*"]
      principals {
        type        = "Service"
        identifiers = ["cloudfront.amazonaws.com"]
      }
      condition {
        test     = "StringEquals"
        variable = "AWS:SourceArn"
        values   = [aws_cloudfront_distribution.main[0].arn]
      }
    }
  }
}

resource "aws_s3_bucket_policy" "admin_web" {
  count      = var.decommissioned ? 0 : (var.skip_cloudfront ? 0 : 1)
  bucket     = aws_s3_bucket.admin_web[0].id
  policy     = data.aws_iam_policy_document.admin_web_bucket.json
  depends_on = [aws_s3_bucket_public_access_block.admin_web]
}

# ── Judge web SPA ────────────────────────────────────────────────────────────
# Destroyed when decommissioned. Empty the bucket manually before applying.

resource "aws_s3_bucket" "judge_web" {
  count         = var.decommissioned ? 0 : 1
  bucket        = "${var.project}-judge-web-${var.environment}"
  force_destroy = var.teardown_friendly

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}

resource "aws_s3_bucket_public_access_block" "judge_web" {
  count                   = var.decommissioned ? 0 : 1
  bucket                  = aws_s3_bucket.judge_web[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "judge_web" {
  count  = var.decommissioned ? 0 : 1
  bucket = aws_s3_bucket.judge_web[0].id
  rule { object_ownership = "BucketOwnerEnforced" }
}

data "aws_iam_policy_document" "judge_web_bucket" {
  dynamic "statement" {
    for_each = var.skip_cloudfront ? [] : [1]
    content {
      sid       = "AllowCloudFrontRead"
      actions   = ["s3:GetObject"]
      resources = ["${try(aws_s3_bucket.judge_web[0].arn, "arn:aws:s3:::decommissioned")}/*"]
      principals {
        type        = "Service"
        identifiers = ["cloudfront.amazonaws.com"]
      }
      condition {
        test     = "StringEquals"
        variable = "AWS:SourceArn"
        values   = [aws_cloudfront_distribution.main[0].arn]
      }
    }
  }
}

resource "aws_s3_bucket_policy" "judge_web" {
  count      = var.decommissioned ? 0 : (var.skip_cloudfront ? 0 : 1)
  bucket     = aws_s3_bucket.judge_web[0].id
  policy     = data.aws_iam_policy_document.judge_web_bucket.json
  depends_on = [aws_s3_bucket_public_access_block.judge_web]
}

# ── Public web SPA ────────────────────────────────────────────────────────────
# Always kept — serves the static "event is over" page when decommissioned.

resource "aws_s3_bucket" "public_web" {
  bucket        = "${var.project}-public-web-${var.environment}"
  force_destroy = var.teardown_friendly

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}

resource "aws_s3_bucket_public_access_block" "public_web" {
  bucket                  = aws_s3_bucket.public_web.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "public_web" {
  bucket = aws_s3_bucket.public_web.id
  rule { object_ownership = "BucketOwnerEnforced" }
}

data "aws_iam_policy_document" "public_web_bucket" {
  dynamic "statement" {
    for_each = var.skip_cloudfront ? [] : [1]
    content {
      sid       = "AllowCloudFrontRead"
      actions   = ["s3:GetObject"]
      resources = ["${aws_s3_bucket.public_web.arn}/*"]
      principals {
        type        = "Service"
        identifiers = ["cloudfront.amazonaws.com"]
      }
      condition {
        test     = "StringEquals"
        variable = "AWS:SourceArn"
        values   = [aws_cloudfront_distribution.main[0].arn]
      }
    }
  }
}

resource "aws_s3_bucket_policy" "public_web" {
  count      = var.skip_cloudfront ? 0 : 1
  bucket     = aws_s3_bucket.public_web.id
  policy     = data.aws_iam_policy_document.public_web_bucket.json
  depends_on = [aws_s3_bucket_public_access_block.public_web]
}
