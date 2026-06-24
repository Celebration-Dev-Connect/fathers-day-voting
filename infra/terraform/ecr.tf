resource "aws_ecr_repository" "api" {
  count                = var.decommissioned ? 0 : 1
  name                 = "${var.project}/api"
  image_tag_mutability = "MUTABLE"
  force_delete         = var.teardown_friendly

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}

resource "aws_ecr_lifecycle_policy" "api" {
  count      = var.decommissioned ? 0 : 1
  repository = aws_ecr_repository.api[0].name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 5 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 5
      }
      action = { type = "expire" }
    }]
  })
}
