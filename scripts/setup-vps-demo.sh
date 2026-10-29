#!/bin/bash
set -e

echo "=========================================================="
echo "🚀 SETUP DEMO ENVIRONMENT: ARAA HONEY HUB ON VPS"
echo "=========================================================="

# 1. Setup 2GB SWAP Memory if not exists (Essential for 2GB RAM VPS)
if [ ! -f /swapfile ]; then
  echo "⚙️ Creating 2GB Swap Memory..."
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "✅ 2GB Swap Memory successfully enabled!"
else
  echo "✅ Swap Memory already exists."
fi

# 2. Install Docker & Docker Compose if not installed
if ! command -v docker &> /dev/null; then
  echo "📦 Installing Docker..."
  curl -fsSL https://get.docker.com -o get-docker.sh
  sh get-docker.sh
  systemctl enable docker
  systemctl start docker
  echo "✅ Docker installed successfully."
fi

# 3. Create demo directory
mkdir -p /root/araa-demo
cd /root/araa-demo

echo "📦 Pulling & Starting Demo PostgreSQL Database..."
docker compose -f docker-compose.demo.yml up -d demo-db

# Wait for DB to be healthy
echo "⏳ Waiting for demo-db to initialize..."
until docker exec araa-demo-db pg_isready -U araa_admin -d araa_honey_demo; do
  sleep 2
done
echo "✅ Demo PostgreSQL is UP and HEALTHY!"

# 4. Clone Database from Supabase to Demo DB (Read-Only Dump)
if [ -n "$SOURCE_DB_PASSWORD" ]; then
  echo "📥 Cloning snapshot from Supabase into demo-db..."
  SOURCE_DB_HOST="${SOURCE_DB_HOST:-aws-1-ap-northeast-1.pooler.supabase.com}"
  SOURCE_DB_PORT="${SOURCE_DB_PORT:-6543}"
  SOURCE_DB_USER="${SOURCE_DB_USER:-postgres.saefgyiloalpiqfrglqo}"
  SOURCE_DB_NAME="${SOURCE_DB_NAME:-postgres}"

  docker run --rm \
    -e PGPASSWORD="$SOURCE_DB_PASSWORD" \
    postgres:16-alpine \
    pg_dump -h "$SOURCE_DB_HOST" -p "$SOURCE_DB_PORT" -U "$SOURCE_DB_USER" -d "$SOURCE_DB_NAME" --no-owner --no-acl \
    | docker exec -i araa-demo-db psql -U araa_admin -d araa_honey_demo

  echo "✅ Database Snapshot successfully cloned to demo-db!"
else
  echo "ℹ️ SOURCE_DB_PASSWORD not provided. Skipping remote clone."
fi

# 5. Build and Start Demo App Container
echo "🏗️ Building and Starting Demo App Container..."
docker compose -f docker-compose.demo.yml up -d --build demo-app

echo "=========================================================="
echo "🎉 DEMO ENVIRONMENT IS READY!"
echo "Aplikasi Demo berjalan di port 3000:"
echo "👉 http://$(curl -s ifconfig.me):3000"
echo "=========================================================="
