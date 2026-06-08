# ── Route 53 DNS automation ───────────────────────────────────────────────────
# Active only when var.route53_zone_id is set AND skip_cloudfront is false.
# It creates the ACM validation record, blocks until the certificate is issued,
# and points the domain at CloudFront — making the whole stack a single apply.
# With external DNS (empty zone id) or skip_cloudfront = true these resources
# are skipped and you manage records manually (or don't need them at all).

locals {
  manage_dns = var.route53_zone_id != "" && !var.skip_cloudfront
}

# Validation CNAME(s) for the ACM certificate.
resource "aws_route53_record" "acm_validation" {
  for_each = local.manage_dns ? {
    for dvo in aws_acm_certificate.main.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  zone_id         = var.route53_zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
  allow_overwrite = true
}

# Blocks until the certificate reaches "Issued" so CloudFront can attach it.
resource "aws_acm_certificate_validation" "main" {
  count                   = local.manage_dns ? 1 : 0
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.main.arn
  validation_record_fqdns = [for r in aws_route53_record.acm_validation : r.fqdn]
}

# Points the domain at the CloudFront distribution (alias A record).
resource "aws_route53_record" "alias" {
  count   = local.manage_dns ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.main[0].domain_name
    zone_id                = aws_cloudfront_distribution.main[0].hosted_zone_id
    evaluate_target_health = false
  }
}
