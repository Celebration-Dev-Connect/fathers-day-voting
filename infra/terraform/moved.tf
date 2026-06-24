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

# ── Decommission state migrations ────────────────────────────────────────────
# Added when decommissioned variable introduced count = var.decommissioned ? 0 : 1
# on all backend resources. These blocks rewrite existing state entries so the
# next apply destroys the resources cleanly without recreating them first.

# ECS
moved {
  from = aws_ecs_cluster.main
  to   = aws_ecs_cluster.main[0]
}

moved {
  from = aws_ecs_cluster_capacity_providers.main
  to   = aws_ecs_cluster_capacity_providers.main[0]
}

moved {
  from = aws_cloudwatch_log_group.api
  to   = aws_cloudwatch_log_group.api[0]
}

moved {
  from = aws_ecs_task_definition.api
  to   = aws_ecs_task_definition.api[0]
}

moved {
  from = aws_lb.api
  to   = aws_lb.api[0]
}

moved {
  from = aws_lb_target_group.api
  to   = aws_lb_target_group.api[0]
}

moved {
  from = aws_lb_listener.api
  to   = aws_lb_listener.api[0]
}

moved {
  from = aws_ecs_service.api
  to   = aws_ecs_service.api[0]
}

moved {
  from = aws_appautoscaling_target.api
  to   = aws_appautoscaling_target.api[0]
}

moved {
  from = aws_appautoscaling_policy.api_requests
  to   = aws_appautoscaling_policy.api_requests[0]
}

# RDS
moved {
  from = aws_db_subnet_group.main
  to   = aws_db_subnet_group.main[0]
}

moved {
  from = aws_db_parameter_group.postgres16
  to   = aws_db_parameter_group.postgres16[0]
}

moved {
  from = aws_db_instance.main
  to   = aws_db_instance.main[0]
}

# ECR
moved {
  from = aws_ecr_repository.api
  to   = aws_ecr_repository.api[0]
}

moved {
  from = aws_ecr_lifecycle_policy.api
  to   = aws_ecr_lifecycle_policy.api[0]
}

# Secrets Manager
moved {
  from = aws_secretsmanager_secret.db_url
  to   = aws_secretsmanager_secret.db_url[0]
}

moved {
  from = aws_secretsmanager_secret_version.db_url
  to   = aws_secretsmanager_secret_version.db_url[0]
}

moved {
  from = aws_secretsmanager_secret.jwt_secret
  to   = aws_secretsmanager_secret.jwt_secret[0]
}

moved {
  from = aws_secretsmanager_secret_version.jwt_secret
  to   = aws_secretsmanager_secret_version.jwt_secret[0]
}

moved {
  from = aws_secretsmanager_secret.pco_client_id
  to   = aws_secretsmanager_secret.pco_client_id[0]
}

moved {
  from = aws_secretsmanager_secret_version.pco_client_id
  to   = aws_secretsmanager_secret_version.pco_client_id[0]
}

moved {
  from = aws_secretsmanager_secret.pco_client_secret
  to   = aws_secretsmanager_secret.pco_client_secret[0]
}

moved {
  from = aws_secretsmanager_secret_version.pco_client_secret
  to   = aws_secretsmanager_secret_version.pco_client_secret[0]
}

moved {
  from = aws_secretsmanager_secret.webguide_username
  to   = aws_secretsmanager_secret.webguide_username[0]
}

moved {
  from = aws_secretsmanager_secret_version.webguide_username
  to   = aws_secretsmanager_secret_version.webguide_username[0]
}

moved {
  from = aws_secretsmanager_secret.webguide_password
  to   = aws_secretsmanager_secret.webguide_password[0]
}

moved {
  from = aws_secretsmanager_secret_version.webguide_password
  to   = aws_secretsmanager_secret_version.webguide_password[0]
}

moved {
  from = aws_secretsmanager_secret.email_smtp_username
  to   = aws_secretsmanager_secret.email_smtp_username[0]
}

moved {
  from = aws_secretsmanager_secret_version.email_smtp_username
  to   = aws_secretsmanager_secret_version.email_smtp_username[0]
}

moved {
  from = aws_secretsmanager_secret.email_smtp_password
  to   = aws_secretsmanager_secret.email_smtp_password[0]
}

moved {
  from = aws_secretsmanager_secret_version.email_smtp_password
  to   = aws_secretsmanager_secret_version.email_smtp_password[0]
}

# S3 — admin and judge buckets and their sub-resources
moved {
  from = aws_s3_bucket.admin_web
  to   = aws_s3_bucket.admin_web[0]
}

moved {
  from = aws_s3_bucket_public_access_block.admin_web
  to   = aws_s3_bucket_public_access_block.admin_web[0]
}

moved {
  from = aws_s3_bucket_ownership_controls.admin_web
  to   = aws_s3_bucket_ownership_controls.admin_web[0]
}

moved {
  from = aws_s3_bucket.judge_web
  to   = aws_s3_bucket.judge_web[0]
}

moved {
  from = aws_s3_bucket_public_access_block.judge_web
  to   = aws_s3_bucket_public_access_block.judge_web[0]
}

moved {
  from = aws_s3_bucket_ownership_controls.judge_web
  to   = aws_s3_bucket_ownership_controls.judge_web[0]
}

# IAM — execution secrets policy (references gated secrets)
moved {
  from = aws_iam_role_policy.ecs_execution_secrets
  to   = aws_iam_role_policy.ecs_execution_secrets[0]
}

# CloudWatch alarms
moved {
  from = aws_cloudwatch_metric_alarm.alb_target_5xx
  to   = aws_cloudwatch_metric_alarm.alb_target_5xx[0]
}

moved {
  from = aws_cloudwatch_metric_alarm.alb_elb_5xx
  to   = aws_cloudwatch_metric_alarm.alb_elb_5xx[0]
}

moved {
  from = aws_cloudwatch_metric_alarm.unhealthy_hosts
  to   = aws_cloudwatch_metric_alarm.unhealthy_hosts[0]
}

moved {
  from = aws_cloudwatch_metric_alarm.api_latency
  to   = aws_cloudwatch_metric_alarm.api_latency[0]
}

moved {
  from = aws_cloudwatch_metric_alarm.ecs_cpu
  to   = aws_cloudwatch_metric_alarm.ecs_cpu[0]
}

moved {
  from = aws_cloudwatch_metric_alarm.ecs_memory
  to   = aws_cloudwatch_metric_alarm.ecs_memory[0]
}

moved {
  from = aws_cloudwatch_metric_alarm.rds_cpu
  to   = aws_cloudwatch_metric_alarm.rds_cpu[0]
}

moved {
  from = aws_cloudwatch_metric_alarm.rds_storage
  to   = aws_cloudwatch_metric_alarm.rds_storage[0]
}

moved {
  from = aws_cloudwatch_metric_alarm.rds_memory
  to   = aws_cloudwatch_metric_alarm.rds_memory[0]
}

moved {
  from = aws_cloudwatch_metric_alarm.rds_connections
  to   = aws_cloudwatch_metric_alarm.rds_connections[0]
}

moved {
  from = aws_cloudwatch_dashboard.main
  to   = aws_cloudwatch_dashboard.main[0]
}

