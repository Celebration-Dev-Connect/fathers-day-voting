# ── Year-round EC2 host (compute_mode = ec2) ─────────────────────────────────
# A single small instance runs the API and PostgreSQL in Docker. CloudFront
# reaches it directly over HTTP on port 80 (TLS terminated at CloudFront, exactly
# as it previously talked to the ALB). The origin security group is locked to the
# CloudFront origin-facing prefix list so the box is never open to the world.
# Access for ops is via SSM Session Manager only — no SSH port, no key pair.

# Latest Amazon Linux 2023 ARM64 AMI (matches the t4g instance family and the
# linux/arm64 image we build for ECR).
data "aws_ssm_parameter" "al2023_arm64" {
  count = local.ec2_active ? 1 : 0
  name  = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

# CloudFront's published origin-facing IP ranges, so we can scope ingress to CF.
data "aws_ec2_managed_prefix_list" "cloudfront" {
  count = local.ec2_active ? 1 : 0
  name  = "com.amazonaws.global.cloudfront.origin-facing"
}

resource "aws_security_group" "ec2_origin" {
  count       = local.ec2_active ? 1 : 0
  name        = "${var.project}-${var.environment}-ec2-origin"
  description = "Year-round API host - inbound HTTP from CloudFront only, egress all"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name        = "${var.project}-${var.environment}-ec2-origin"
    Project     = var.project
    Environment = var.environment
  }
}

# Inbound HTTP from CloudFront edge locations only (TLS terminates at CloudFront).
resource "aws_security_group_rule" "ec2_ingress_cloudfront" {
  count             = local.ec2_active ? 1 : 0
  type              = "ingress"
  from_port         = 80
  to_port           = 80
  protocol          = "tcp"
  security_group_id = aws_security_group.ec2_origin[0].id
  prefix_list_ids   = [data.aws_ec2_managed_prefix_list.cloudfront[0].id]
  description       = "HTTP from CloudFront origin-facing ranges"
}

# Egress everywhere: ECR pulls, SSM, S3, Rekognition/Comprehend, SES, Docker Hub.
resource "aws_security_group_rule" "ec2_egress_all" {
  count             = local.ec2_active ? 1 : 0
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  security_group_id = aws_security_group.ec2_origin[0].id
  cidr_blocks       = ["0.0.0.0/0"]
  description       = "All outbound"
}

# Dedicated data volume for the Postgres data dir. Lives independently of the
# instance so user_data changes (which replace the instance) don't wipe the DB.
# Recovery of last resort is the nightly pg_dump in s3://<photos>/backups/db/.
resource "aws_ebs_volume" "data" {
  count             = local.ec2_active ? 1 : 0
  availability_zone = aws_subnet.public_a.availability_zone
  size              = var.ec2_data_volume_size
  type              = "gp3"
  encrypted         = true

  tags = {
    Name        = "${var.project}-${var.environment}-data"
    Project     = var.project
    Environment = var.environment
  }
}

resource "aws_instance" "api" {
  count                       = local.ec2_active ? 1 : 0
  ami                         = data.aws_ssm_parameter.al2023_arm64[0].value
  instance_type               = var.ec2_instance_type
  subnet_id                   = aws_subnet.public_a.id
  vpc_security_group_ids      = [aws_security_group.ec2_origin[0].id]
  iam_instance_profile        = aws_iam_instance_profile.ec2[0].name
  associate_public_ip_address = true

  root_block_device {
    volume_type = "gp3"
    volume_size = 10
    encrypted   = true
  }

  # IMDSv2 required; hop limit 2 so the Docker containers (one extra network hop)
  # can still fetch instance-role credentials for S3/Rekognition/SES/SSM.
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }

  # Static bootstrap — reads region/account from IMDS and all config/secrets from
  # SSM Parameter Store, so it needs no Terraform interpolation (file, not
  # templatefile — the script is full of unescaped bash ${...}).
  user_data = file("${path.module}/../ec2/user-data.sh")

  # Re-provision the box when the bootstrap script changes.
  user_data_replace_on_change = true

  tags = {
    Name        = "${var.project}-${var.environment}-api"
    Project     = var.project
    Environment = var.environment
  }
}

resource "aws_volume_attachment" "data" {
  count       = local.ec2_active ? 1 : 0
  device_name = "/dev/sdf"
  volume_id   = aws_ebs_volume.data[0].id
  instance_id = aws_instance.api[0].id
  # Don't try to detach a busy (mounted) volume on instance replace; the new
  # instance re-attaches and remounts it via user_data.
  stop_instance_before_detaching = true
}

# Stable public IP so the CloudFront origin domain doesn't change on replace.
resource "aws_eip" "api" {
  count    = local.ec2_active ? 1 : 0
  domain   = "vpc"
  instance = aws_instance.api[0].id

  tags = {
    Name        = "${var.project}-${var.environment}-api"
    Project     = var.project
    Environment = var.environment
  }
}
