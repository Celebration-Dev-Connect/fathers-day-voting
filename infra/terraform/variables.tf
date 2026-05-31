variable "region" {
  description = "AWS region for all resources (ACM cert is always us-east-1 regardless)."
  type        = string
  default     = "ca-central-1"
}

variable "project" {
  description = "Short prefix used in resource names and tags."
  type        = string
  default     = "carshow"
}

variable "environment" {
  description = "Deployment environment."
  type        = string
  default     = "prod"
}

variable "domain" {
  description = "Public domain for the app. Used as the CloudFront alias and ACM cert SAN."
  type        = string
  default     = "carshow.celebrationedmonton.com"
}

variable "db_username" {
  description = "PostgreSQL master username."
  type        = string
  default     = "carshow"
}

variable "app_runner_image_tag" {
  description = <<-EOT
    ECR image tag for the App Runner service.
    Use a git commit SHA in production — never "latest" once the service is live.
    Bootstrap order: run `terraform apply -target=aws_ecr_repository.api` first,
    push an image, then run `terraform apply` for the full stack.
  EOT
  type        = string
  default     = "latest"
}
