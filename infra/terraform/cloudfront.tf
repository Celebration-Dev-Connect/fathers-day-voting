# ── ACM certificate (must be in us-east-1 for CloudFront) ────────────────────

resource "aws_acm_certificate" "main" {
  provider          = aws.us_east_1
  domain_name       = var.domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}

# Certificate validation: when var.route53_zone_id is set, Terraform creates the
# validation record and waits for issuance automatically (see dns.tf). With
# external DNS, add the records from output "acm_validation_records" at your
# registrar and ensure the cert is issued before the distribution can build.

# ── Shared OAC for all S3 origins ─────────────────────────────────────────────

resource "aws_cloudfront_origin_access_control" "s3" {
  name                              = "${var.project}-${var.environment}-s3"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ── Managed cache / origin-request policy lookups ────────────────────────────

data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

# Forwards all viewer headers and query strings except Host.
# Required for App Runner: forwarding the client Host header causes App Runner
# to reject requests because the hostname won't match its own service URL.
data "aws_cloudfront_origin_request_policy" "all_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

# ── CloudFront Functions ───────────────────────────────────────────────────────

# /api/* — strips the /api prefix before forwarding to App Runner so the
# Fastify routes receive requests at / rather than /api/.
resource "aws_cloudfront_function" "strip_api_prefix" {
  name    = "${var.project}-${var.environment}-strip-api-prefix"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = <<-EOT
    function handler(event) {
      var request = event.request;
      request.uri = request.uri.replace(/^\/api/, '') || '/';
      return request;
    }
  EOT
}

# /admin* — strips the /admin prefix so S3 receives paths relative to the
# bucket root, then falls back to /admin.html for any path without a file
# extension (enables Vite client-side routing).
# Uses /admin.html (not /index.html) to avoid a CloudFront cache key collision:
# CloudFront shares one cache across all behaviors, so every SPA must use a
# distinct fallback filename.
resource "aws_cloudfront_function" "admin_routing" {
  name    = "${var.project}-${var.environment}-admin-routing"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = <<-EOT
    function handler(event) {
      var request = event.request;
      var uri = request.uri.replace(/^\/admin/, '') || '/';
      request.uri = uri.includes('.') ? uri : '/admin.html';
      return request;
    }
  EOT
}

# /photos/* — rewrites /photos/<id> to /public/<id> to match the S3 key
# layout used by the moderation pipeline (pending/ and public/ prefixes).
resource "aws_cloudfront_function" "photos_prefix" {
  name    = "${var.project}-${var.environment}-photos-prefix"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = <<-EOT
    function handler(event) {
      var request = event.request;
      request.uri = request.uri.replace(/^\/photos\//, '/public/');
      return request;
    }
  EOT
}

# /judge* — strips the /judge prefix so S3 receives paths relative to the
# bucket root, then falls back to /judge.html for SPA client-side routing.
# Unique fallback filename avoids the shared CloudFront cache key collision.
resource "aws_cloudfront_function" "judge_routing" {
  name    = "${var.project}-${var.environment}-judge-routing"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = <<-EOT
    function handler(event) {
      var request = event.request;
      var uri = request.uri.replace(/^\/judge/, '') || '/';
      request.uri = uri.includes('.') ? uri : '/judge.html';
      return request;
    }
  EOT
}

# /* default — SPA routing for the public-web app. Paths with no file extension
# are served as /index.html; asset paths (hashed filenames) pass through.
# Owner-web is stored under /owner in the public-web bucket and falls back to
# /owner/index.html for owner routes. Sub-app paths (/admin, /judge, /api,
# /photos) are hard-rejected here so the public-web origin can never serve them,
# even if the ordered behaviors somehow miss (belt-and-suspenders guard).
resource "aws_cloudfront_function" "spa_routing" {
  name    = "${var.project}-${var.environment}-spa-routing"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = <<-EOT
    function handler(event) {
      var request = event.request;
      var uri = request.uri;
      var subApps = ['/admin', '/judge', '/api', '/photos'];
      for (var i = 0; i < subApps.length; i++) {
        if (uri === subApps[i] || uri.startsWith(subApps[i] + '/')) {
          return { statusCode: 404, statusDescription: 'Not Found' };
        }
      }
      if (uri === '/owner' || uri.startsWith('/owner/')) {
        request.uri = uri.includes('.') ? uri : '/owner/index.html';
        return request;
      }
      if (!uri.includes('.')) {
        request.uri = '/index.html';
      }
      return request;
    }
  EOT
}

# ── Distribution ──────────────────────────────────────────────────────────────

resource "aws_cloudfront_distribution" "main" {
  enabled     = true
  aliases     = [var.domain]
  comment     = "${var.project} ${var.environment}"
  price_class = "PriceClass_100"

  # Origin 1: ECS Fargate API via ALB (HTTP — TLS is terminated at CloudFront)
  origin {
    origin_id   = "api"
    domain_name = aws_lb.api.dns_name

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # Origin 2: Admin web SPA (S3)
  origin {
    origin_id                = "admin-web"
    domain_name              = aws_s3_bucket.admin_web.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.s3.id
  }

  # Origin 3: Photos (S3) — CF function rewrites /photos/<id> → /public/<id>
  origin {
    origin_id                = "photos"
    domain_name              = aws_s3_bucket.photos.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.s3.id
  }

  # Origin 4: Judge web SPA (S3)
  origin {
    origin_id                = "judge-web"
    domain_name              = aws_s3_bucket.judge_web.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.s3.id
  }

  # Origin 5: Public web SPA (S3) — default origin
  origin {
    origin_id                = "public-web"
    domain_name              = aws_s3_bucket.public_web.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.s3.id
  }

  # Behavior 1 (priority 1): /api/* → App Runner
  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = "api"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_except_host.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.strip_api_prefix.arn
    }
  }

  # Behavior 2 (priority 2): /admin* → admin-web S3 bucket
  ordered_cache_behavior {
    path_pattern           = "/admin*"
    target_origin_id       = "admin-web"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.optimized.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.admin_routing.arn
    }
  }

  # Behavior 3 (priority 3): /judge* → judge-web S3 bucket
  ordered_cache_behavior {
    path_pattern           = "/judge*"
    target_origin_id       = "judge-web"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.optimized.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.judge_routing.arn
    }
  }

  # Behavior 5 (priority 5): /photos/* → photos S3 bucket (public/ prefix)
  ordered_cache_behavior {
    path_pattern           = "/photos/*"
    target_origin_id       = "photos"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.optimized.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.photos_prefix.arn
    }
  }

  # Default behavior: /* → public-web S3 bucket
  default_cache_behavior {
    target_origin_id       = "public-web"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.optimized.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_routing.arn
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    # When managing DNS, depend on the validation resource so CloudFront only
    # builds once the certificate is issued. Otherwise use the cert directly
    # (external DNS: the cert must already be validated).
    acm_certificate_arn      = local.manage_dns ? aws_acm_certificate_validation.main[0].certificate_arn : aws_acm_certificate.main.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}
