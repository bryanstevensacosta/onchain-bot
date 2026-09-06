#!/bin/bash
# Fix uploads directory permissions for ingestion-service
# The ingestion-service container runs as user nodejs (uid 1001, gid 1001)
# but the uploads volume is mounted from backend/uploads which may have root ownership

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
UPLOADS_DIR="$PROJECT_ROOT/apps/backend/uploads"

echo "🔧 Fixing uploads directory permissions..."
echo "   Directory: $UPLOADS_DIR"

# Create directory structure if it doesn't exist
mkdir -p "$UPLOADS_DIR/crypto-news/media"

# Check current ownership
echo ""
echo "📋 Current ownership:"
ls -la "$UPLOADS_DIR" 2>/dev/null || echo "   Directory doesn't exist yet"

# Fix permissions
# Option 1: Make writable by all (simple, works everywhere)
echo ""
echo "🔓 Setting permissions to 777 (writable by container user)..."
chmod -R 777 "$UPLOADS_DIR"

# Option 2 (commented): Set ownership to match container user (1001:1001)
# Requires sudo, uncomment if you prefer this approach:
# echo "👤 Setting ownership to 1001:1001 (nodejs user in container)..."
# sudo chown -R 1001:1001 "$UPLOADS_DIR"

echo ""
echo "✅ Permissions fixed:"
ls -la "$UPLOADS_DIR"

echo ""
echo "🎯 Ingestion-service should now be able to write media files"
echo "   Restart the container if it's already running:"
echo "   docker restart onchain-bot-ingestion"
