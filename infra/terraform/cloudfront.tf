# ── ACM certificate (must be in us-east-1 for CloudFront) ────────────────────
# Always created so the ARN exists in state. When skip_cloudfront = true the
# cert stays in PENDING_VALIDATION and is never attached to anything — that is
# harmless. When skip_cloudfront = false, dns.tf handles validation (if
# route53_zone_id is set) or you validate manually.

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

# ── Shared OAC for all S3 origins ─────────────────────────────────────────────

resource "aws_cloudfront_origin_access_control" "s3" {
  count                             = var.skip_cloudfront ? 0 : 1
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

# Short-TTL cache policy for public read-only API endpoints.
# 30s TTL with query strings in the cache key so paginated endpoints
# (?page=N) cache each page separately. Used for /api/public/event and
# /api/public/categories/*/entries.
resource "aws_cloudfront_cache_policy" "api_short" {
  count       = var.skip_cloudfront ? 0 : 1
  name        = "${var.project}-${var.environment}-api-short-ttl"
  default_ttl = 30
  max_ttl     = 30
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "all"
    }
  }
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
  count   = var.skip_cloudfront ? 0 : 1
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
  count   = var.skip_cloudfront ? 0 : 1
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
  count   = var.skip_cloudfront ? 0 : 1
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
  count   = var.skip_cloudfront ? 0 : 1
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
  count   = var.skip_cloudfront ? 0 : 1
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
  count       = var.skip_cloudfront ? 0 : 1
  enabled     = true
  # When using a custom domain (test/prod), attach the alias so the distribution
  # answers on that domain. When cloudfront_custom_domain = false (perf), omit
  # aliases entirely — the distribution is reachable only via its AWS-assigned
  # *.cloudfront.net domain, which uses CloudFront's built-in certificate.
  aliases     = var.cloudfront_custom_domain ? [var.domain] : []
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
    origin_access_control_id = aws_cloudfront_origin_access_control.s3[0].id
  }

  # Origin 3: Photos (S3) — CF function rewrites /photos/<id> → /public/<id>
  origin {
    origin_id                = "photos"
    domain_name              = aws_s3_bucket.photos.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.s3[0].id
  }

  # Origin 4: Judge web SPA (S3)
  origin {
    origin_id                = "judge-web"
    domain_name              = aws_s3_bucket.judge_web.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.s3[0].id
  }

  # Origin 5: Public web SPA (S3) — default origin
  origin {
    origin_id                = "public-web"
    domain_name              = aws_s3_bucket.public_web.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.s3[0].id
  }

  # Behavior 1 (priority 1): /api/public/event → cached 30s
  # Must sit above the /api/* catch-all so CloudFront applies caching here
  # instead of the CachingDisabled policy that covers the rest of the API.
  # The strip_api_prefix function still runs so Fargate receives /public/event.
  ordered_cache_behavior {
    path_pattern             = "/api/public/event"
    target_origin_id         = "api"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = aws_cloudfront_cache_policy.api_short[0].id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_except_host.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.strip_api_prefix[0].arn
    }
  }

  # Behavior 2 (priority 2): /api/public/results → cached 30s
  # Read-only results snapshot; high traffic on results day. Mirrors the
  # /api/public/event behavior exactly.
  ordered_cache_behavior {
    path_pattern             = "/api/public/results"
    target_origin_id         = "api"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = aws_cloudfront_cache_policy.api_short[0].id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_except_host.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.strip_api_prefix[0].arn
    }
  }

  # Behavior 3 (priority 3): /api/public/categories/*/entries → cached 30s
  # The * wildcard matches the category slug. Query strings (e.g. ?page=2) are
  # included in the cache key via the api_short policy so pages cache separately.
  ordered_cache_behavior {
    path_pattern             = "/api/public/categories/*/entries"
    target_origin_id         = "api"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = aws_cloudfront_cache_policy.api_short[0].id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_except_host.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.strip_api_prefix[0].arn
    }
  }

  # Behavior 3 (priority 3): /api/* → Fargate (all other API routes, no caching)
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
      function_arn = aws_cloudfront_function.strip_api_prefix[0].arn
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
      function_arn = aws_cloudfront_function.admin_routing[0].arn
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
      function_arn = aws_cloudfront_function.judge_routing[0].arn
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
      function_arn = aws_cloudfront_function.photos_prefix[0].arn
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
      function_arn = aws_cloudfront_function.spa_routing[0].arn
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    # cloudfront_custom_domain = true (test/prod): use the ACM cert for the
    # custom domain alias. When Route 53 manages DNS, depend on the validation
    # resource so the cert is issued before CloudFront builds. Otherwise
    # reference the cert directly (external DNS, must already be validated).
    #
    # cloudfront_custom_domain = false (perf): use the distribution's built-in
    # *.cloudfront.net certificate — no ACM cert or domain validation needed.
    cloudfront_default_certificate = var.cloudfront_custom_domain ? false : true
    acm_certificate_arn            = var.cloudfront_custom_domain ? (local.manage_dns ? aws_acm_certificate_validation.main[0].certificate_arn : aws_acm_certificate.main.arn) : null
    ssl_support_method             = var.cloudfront_custom_domain ? "sni-only" : null
    minimum_protocol_version       = var.cloudfront_custom_domain ? "TLSv1.2_2021" : null
  }

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}
