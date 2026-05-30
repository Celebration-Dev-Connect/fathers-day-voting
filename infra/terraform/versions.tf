terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Local state for now. Migrate to an S3 backend before multi-operator use:
  # backend "s3" { bucket = "..." key = "carshow/terraform.tfstate" region = "..." }
}

provider "aws" {
  region = var.region
}
