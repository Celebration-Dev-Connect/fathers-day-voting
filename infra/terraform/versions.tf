terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }

  backend "s3" {
    bucket               = "carshow-tf-state"
    key                  = "terraform.tfstate"
    region               = "ca-central-1"
    workspace_key_prefix = "workspace"
    dynamodb_table       = "carshow-tf-lock"
    encrypt              = true
  }
}

provider "aws" {
  region = var.region
}

# CloudFront requires ACM certificates in us-east-1 regardless of app region.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}
