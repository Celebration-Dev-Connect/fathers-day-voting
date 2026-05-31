output "public_domain" {
  description = "The public domain for this stack (used by the deploy script to build the SPAs)."
  value       = var.domain
}

output "cloudfront_domain" {
  description = "Add a CNAME record in your DNS registrar: var.domain → this value."
  value       = aws_cloudfront_distribution.main.domain_name
}

output "cloudfront_distribution_id" {
  description = "Used for cache invalidations after SPA deploys: aws cloudfront create-invalidation --distribution-id <id> --paths '/index.html'"
  value       = aws_cloudfront_distribution.main.id
}

output "acm_validation_records" {
  description = "Add these CNAME records in your DNS registrar to validate the ACM certificate. The CloudFront distribution will not serve HTTPS until the cert is issued."
  value = {
    for dvo in aws_acm_certificate.main.domain_validation_options : dvo.domain_name => {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  }
}

output "ecr_repository_url" {
  description = "Push API images here. Tag with git commit SHA: docker push <url>:<sha>"
  value       = aws_ecr_repository.api.repository_url
}

output "app_runner_service_url" {
  description = "Internal App Runner URL. Not for public use — all traffic enters via CloudFront /api/*."
  value       = "https://${aws_apprunner_service.api.service_url}"
}

output "rds_endpoint" {
  description = "RDS hostname for migration SSM tunnel: aws ssm start-session ... --parameters host=[<value>]"
  value       = aws_db_instance.main.address
  sensitive   = true
}

output "photos_bucket" {
  description = "S3 bucket name for vehicle photos (used by the API)."
  value       = aws_s3_bucket.photos.bucket
}

output "admin_web_bucket" {
  description = "Deploy admin-web SPA: aws s3 sync apps/admin-web/dist/ s3://<value>/ --delete"
  value       = aws_s3_bucket.admin_web.bucket
}

output "public_web_bucket" {
  description = "Deploy public-web SPA: aws s3 sync apps/public-web/dist/ s3://<value>/ --delete"
  value       = aws_s3_bucket.public_web.bucket
}
