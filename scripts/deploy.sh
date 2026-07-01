#!/bin/bash
###############################################################################
# Deploy script — executed on the production droplet by GitHub Actions via
# appleboy/ssh-action. Triggered on push to master (and workflow_dispatch).
#
# Workflow references this file via:
#   script_path: /tmp/deploy.sh
#
# Local equivalent of the `script: |` block from .github/workflows/deploy.yml.
# Keeping the workflow pointing at this file (instead of an inline `script:`)
# makes future edits reviewable in a normal git diff.
###############################################################################
set -euo pipefail

cd /opt/onchain-bot

echo "=== Pulling latest code ==="
git pull origin master

echo "=== Backing up database ==="
POSTGRES_CONTAINER=onchain-bot-postgres \
POSTGRES_USER=alpha_meta_token_scanner \
POSTGRES_DB=alpha_meta_token_scanner \
POSTGRES_PASSWORD=$(grep '^POSTGRES_PASSWORD=' .env.production | cut -d= -f2-) \
bash scripts/backup-db.sh

echo "=== Building images ==="
docker compose -f apps/backend/docker-compose.prod.yml build --no-cache

echo "=== Running migrations ==="
cd apps/backend
POSTGRES_HOST=postgres \
POSTGRES_USER=alpha_meta_token_scanner \
POSTGRES_DB=alpha_meta_token_scanner \
POSTGRES_PASSWORD=$(grep '^POSTGRES_PASSWORD=' .env.production | cut -d= -f2-) \
docker compose -f docker-compose.prod.yml run --rm -T backend npm run migration:run

cd /opt/onchain-bot

echo "=== Restarting services ==="
cd apps/backend && docker compose -f docker-compose.prod.yml up -d --force-recreate

echo "=== Waiting for healthcheck ==="
sleep 15
curl -sf http://localhost:3030/api/health && echo "" \
  || (echo "HEALTHCHECK FAILED" \
      && docker compose -f docker-compose.prod.yml logs backend --tail 50 \
      && exit 1)

echo "=== Deploy complete ==="