output "bucket_name" {
  description = "S3 bucket holding vehicle photos."
  value       = aws_s3_bucket.photos.bucket
}

output "cloudfront_domain" {
  description = "CloudFront domain serving APPROVED photos. Use as CDN_BASE_URL (prefixed with https://)."
  value       = aws_cloudfront_distribution.photos.domain_name
}

output "aws_access_key_id" {
  description = "Access key id for the API IAM user. Set as AWS_ACCESS_KEY_ID."
  value       = aws_iam_access_key.api.id
}

output "aws_secret_access_key" {
  description = "Secret for the API IAM user. Set as AWS_SECRET_ACCESS_KEY."
  value       = aws_iam_access_key.api.secret
  sensitive   = true
}
