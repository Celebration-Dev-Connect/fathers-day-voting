# State address migration: singleton CloudFront resources → count-indexed form.
# Added when skip_cloudfront was introduced (count = var.skip_cloudfront ? 0 : 1).
# These blocks rewrite existing state entries in-place so the next apply does
# not destroy and recreate the distribution on the test/prod environments.

moved {
  from = aws_cloudfront_origin_access_control.s3
  to   = aws_cloudfront_origin_access_control.s3[0]
}

moved {
  from = aws_cloudfront_function.strip_api_prefix
  to   = aws_cloudfront_function.strip_api_prefix[0]
}

moved {
  from = aws_cloudfront_function.admin_routing
  to   = aws_cloudfront_function.admin_routing[0]
}

moved {
  from = aws_cloudfront_function.photos_prefix
  to   = aws_cloudfront_function.photos_prefix[0]
}

moved {
  from = aws_cloudfront_function.judge_routing
  to   = aws_cloudfront_function.judge_routing[0]
}

moved {
  from = aws_cloudfront_function.spa_routing
  to   = aws_cloudfront_function.spa_routing[0]
}

moved {
  from = aws_cloudfront_distribution.main
  to   = aws_cloudfront_distribution.main[0]
}

# State address migration: SPA bucket policies → count-indexed form.
# Added when skip_cloudfront introduced count = var.skip_cloudfront ? 0 : 1.

moved {
  from = aws_s3_bucket_policy.admin_web
  to   = aws_s3_bucket_policy.admin_web[0]
}

moved {
  from = aws_s3_bucket_policy.judge_web
  to   = aws_s3_bucket_policy.judge_web[0]
}

moved {
  from = aws_s3_bucket_policy.public_web
  to   = aws_s3_bucket_policy.public_web[0]
}
