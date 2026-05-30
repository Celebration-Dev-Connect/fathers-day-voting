resource "aws_cloudfront_origin_access_control" "photos" {
  name                              = "${var.project}-photos-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Long-TTL caching: approved objects are immutable (keyed by photo id), so no
# invalidation is ever required.
resource "aws_cloudfront_distribution" "photos" {
  enabled = true
  comment = "${var.project} approved vehicle photos"

  origin {
    domain_name              = aws_s3_bucket.photos.bucket_regional_domain_name
    origin_id                = "photos-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.photos.id
    # Only the public/ prefix is ever served; pending/ is unreachable via the CDN.
    origin_path = "/public"
  }

  default_cache_behavior {
    target_origin_id       = "photos-s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 86400
    max_ttl     = 31536000
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}
