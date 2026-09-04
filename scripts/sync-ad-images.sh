#!/bin/bash
set -e

echo "=== Sync Ad Images from Production ==="
echo ""

# Get the upload directory from backend config
UPLOAD_DIR="/Users/bryanstevens/dev/onchain-bot/apps/backend/uploads"

echo "📦 Syncing ad images..."
echo "   From: root@144.126.203.139:/opt/onchain-bot/apps/backend/uploads/crypto-news-ads/"
echo "   To:   $UPLOAD_DIR/crypto-news-ads/"
echo ""

# Create local directory if it doesn't exist
mkdir -p "$UPLOAD_DIR/crypto-news-ads"

# Sync using rsync (will ask for SSH password)
rsync -avz --progress \
  root@144.126.203.139:/opt/onchain-bot/apps/backend/uploads/crypto-news-ads/ \
  "$UPLOAD_DIR/crypto-news-ads/"

echo ""
echo "✅ Sync complete!"
echo ""
echo "📊 Local ad images:"
find "$UPLOAD_DIR/crypto-news-ads" -type f | wc -l | xargs echo "   Total files:"
du -sh "$UPLOAD_DIR/crypto-news-ads" | awk '{print "   Total size: " $1}'
