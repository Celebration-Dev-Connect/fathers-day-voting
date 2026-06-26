#!/usr/bin/env bash
# Bootstrap for the year-round carshow API host (compute_mode = ec2).
# Amazon Linux 2023, ARM64. Runs once at first boot (cloud-init), and again
# whenever Terraform replaces the instance because this script changed.
#
# This file is intentionally free of Terraform templating: it reads everything it
# needs from IMDS (region/account) and SSM Parameter Store (config + secrets +
# compose file + backup script). Keeping it a plain script avoids the
# templatefile() shell-escaping footguns.
set -euxo pipefail

# This is the production stack. PROJECT/ENVIRONMENT define the SSM param prefix.
PROJECT="carshow"
ENVIRONMENT="prod"
PREFIX="/$PROJECT/$ENVIRONMENT"
APP_DIR="/opt/carshow"
DATA_DIR="/data"

# ── Region / account from IMDSv2 ─────────────────────────────────────────────
TOKEN="$(curl -sS -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 300")"
imds() { curl -sS -H "X-aws-ec2-metadata-token: $TOKEN" "http://169.254.169.254/latest/$1"; }
REGION="$(imds meta-data/placement/region)"
export AWS_DEFAULT_REGION="$REGION"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
REGISTRY="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

# ── Packages: Docker + Compose plugin ────────────────────────────────────────
dnf update -y
dnf install -y docker
systemctl enable --now docker

# Compose v2 plugin (AL2023 doesn't ship it in the docker package).
mkdir -p /usr/libexec/docker/cli-plugins
COMPOSE_VERSION="v2.29.7"
curl -sSL "https://github.com/docker/compose/releases/download/$COMPOSE_VERSION/docker-compose-linux-x86_64" \
  -o /usr/libexec/docker/cli-plugins/docker-compose
chmod +x /usr/libexec/docker/cli-plugins/docker-compose

# ── Mount the dedicated EBS data volume at /data ──────────────────────────────
# Find the data disk: a block device that is not the root disk and has no
# mountpoints. On Nitro (t4g) the volume shows up as an NVMe device.
mkdir -p "$DATA_DIR"
ROOT_DISK="$(lsblk -ndo PKNAME "$(findmnt -no SOURCE /)" 2>/dev/null || true)"
DATA_DEV=""
for i in $(seq 1 30); do
  for dev in $(lsblk -dpno NAME,TYPE | awk '$2=="disk"{print $1}'); do
    name="$(basename "$dev")"
    [ "$name" = "$ROOT_DISK" ] && continue
    # Skip disks that already have a mounted partition/filesystem in use as root.
    if [ "$(lsblk -no MOUNTPOINT "$dev" | tr -d '[:space:]')" = "" ]; then
      DATA_DEV="$dev"
      break
    fi
  done
  [ -n "$DATA_DEV" ] && break
  sleep 5
done
if [ -z "$DATA_DEV" ]; then
  echo "ERROR: could not locate the data EBS volume" >&2
  exit 1
fi
# Create a filesystem only if the volume is blank (preserve data across replaces).
if ! blkid "$DATA_DEV" >/dev/null 2>&1; then
  mkfs.xfs "$DATA_DEV"
fi
UUID="$(blkid -s UUID -o value "$DATA_DEV")"
grep -q "$UUID" /etc/fstab || echo "UUID=$UUID $DATA_DIR xfs defaults,nofail 0 2" >>/etc/fstab
mount -a
mkdir -p "$DATA_DIR/pgdata"

# ── Render config from SSM ───────────────────────────────────────────────────
mkdir -p "$APP_DIR"
ssm() { aws ssm get-parameter --name "$1" --with-decryption --query Parameter.Value --output text; }

# Non-secret app env block.
ssm "$PREFIX/app-env" >"$APP_DIR/.env"

# Secrets → KEY=VALUE lines appended to .env.
{
  echo "DATABASE_URL=$(ssm "$PREFIX/db-url")"
  echo "DB_PASSWORD=$(ssm "$PREFIX/db-password")"
  echo "JWT_SECRET=$(ssm "$PREFIX/jwt-secret")"
  echo "PLANNING_CENTER_CLIENT_ID=$(ssm "$PREFIX/pco-client-id")"
  echo "PLANNING_CENTER_CLIENT_SECRET=$(ssm "$PREFIX/pco-client-secret")"
  echo "WEBGUIDE_USERNAME=$(ssm "$PREFIX/webguide-username")"
  echo "WEBGUIDE_PASSWORD=$(ssm "$PREFIX/webguide-password")"
  echo "EMAIL_SMTP_USERNAME=$(ssm "$PREFIX/email-smtp-username")"
  echo "EMAIL_SMTP_PASSWORD=$(ssm "$PREFIX/email-smtp-password")"
  echo "CARSHOW_IMAGE=$REGISTRY/$PROJECT/api:$(ssm "$PREFIX/image-tag")"
} >>"$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"

# Compose file + on-demand backup script (run manually if ever needed; the DB
# barely changes year-round so there is no scheduled backup).
ssm "$PREFIX/compose" >"$APP_DIR/docker-compose.yml"
ssm "$PREFIX/backup-script" >"$APP_DIR/backup-db.sh"
chmod +x "$APP_DIR/backup-db.sh"

# ── Start the stack ──────────────────────────────────────────────────────────
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY"
cd "$APP_DIR"
# Always start postgres; the api starts too if its image tag already exists in
# ECR (on a fresh stack the first CI deploy supplies it).
docker compose up -d postgres || true
docker compose up -d api || echo "api not started yet — run the CI deploy to push an image."

echo "[user-data] bootstrap complete."
