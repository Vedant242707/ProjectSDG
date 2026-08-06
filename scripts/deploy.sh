#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "$PROJECT_ROOT"

# Verify .env exists
if [ ! -f .env ]; then
    echo "ERROR: .env file not found. Copy .env.production to .env and fill in secrets."
    exit 1
fi

echo "==> Building and starting all services..."
docker compose up -d --build

echo "==> Waiting for backend to be healthy..."
until docker compose exec -T backend curl -sf http://localhost:8000/ > /dev/null 2>&1; do
    echo "    backend not ready yet — retrying in 3s..."
    sleep 3
done

echo "==> Seeding admin account (idempotent — safe to rerun)..."
docker compose exec -T backend python scripts/seed_admin.py

echo ""
echo "==> Deployment complete!"
echo "    App:         http://localhost"
echo "    API docs:    http://localhost/api/docs"
echo "    MinIO UI:    http://localhost:9001"
echo ""
echo "    View logs:   docker compose logs -f"
echo "    Stop all:    docker compose down"
