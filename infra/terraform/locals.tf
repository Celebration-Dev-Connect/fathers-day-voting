# Compute-mode gating. Backend resources only exist when NOT decommissioned, and
# then split between the two hosting modes:
#   ecs_active — ECS Fargate + ALB + RDS + Secrets Manager + CloudWatch (event day)
#   ec2_active — single EC2 box (API + Postgres in Docker) + SSM params (year round)
locals {
  ecs_active = !var.decommissioned && var.compute_mode == "ecs"
  ec2_active = !var.decommissioned && var.compute_mode == "ec2"
}
