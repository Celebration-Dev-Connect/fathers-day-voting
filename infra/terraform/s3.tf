resource "aws_s3_bucket" "photos" {
  bucket = var.bucket_name

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}

# Private bucket — no public ACLs or policies allowed. Public read happens only
# through CloudFront (see cloudfront.tf).
resource "aws_s3_bucket_public_access_block" "photos" {
  bucket                  = aws_s3_bucket.photos.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "photos" {
  bucket = aws_s3_bucket.photos.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# Only CloudFront (via OAC) may read objects, and only under public/*.
# Pending uploads under pending/* are never publicly reachable.
data "aws_iam_policy_document" "bucket" {
  statement {
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
      values   = [aws_cloudfront_distribution.photos.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "photos" {
  bucket = aws_s3_bucket.photos.id
  policy = data.aws_iam_policy_document.bucket.json

  depends_on = [aws_s3_bucket_public_access_block.photos]
}

resource "aws_s3_bucket_cors_configuration" "photos" {
  bucket = aws_s3_bucket.photos.id

  cors_rule {
    allowed_methods = ["PUT", "POST", "GET"]
    allowed_origins = var.cors_allowed_origins
    allowed_headers = ["*"]
    max_age_seconds = 3000
  }
}

# Abandoned/orphaned uploads under pending/ are swept after 1 day.
resource "aws_s3_bucket_lifecycle_configuration" "photos" {
  bucket = aws_s3_bucket.photos.id

  rule {
    id     = "expire-pending"
    status = "Enabled"

    filter {
      prefix = "pending/"
    }

    expiration {
      days = 1
    }
  }
}
