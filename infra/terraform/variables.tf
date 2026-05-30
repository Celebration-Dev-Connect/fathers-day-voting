variable "region" {
  description = "AWS region for all resources."
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Short project/name prefix for tagging and resource names."
  type        = string
  default     = "carshow"
}

variable "environment" {
  description = "Deployment environment (e.g. prod, staging)."
  type        = string
  default     = "prod"
}

variable "bucket_name" {
  description = "Globally-unique S3 bucket name for vehicle photos."
  type        = string
}

variable "cors_allowed_origins" {
  description = "Origins permitted to upload directly to the bucket (browser CORS). The API-proxied path does not need this; included for future direct uploads."
  type        = list(string)
  default     = ["*"]
}
