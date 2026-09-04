#!/usr/bin/env bash
set -euo pipefail

# Create test directory structure
mkdir -p apps/backend apps/ingestion-service

# Test 1: Both files missing (should fail)
echo "=== Test 1: Missing .env files ==="
bash scripts/validate-session-migration.sh 2>&1 || echo "Exit code: $?"

# Test 2: Backend has MTProto credentials (should fail)
echo -e "\n=== Test 2: Backend has MTProto credentials ==="
cat > apps/backend/.env << 'BACKEND_ENV'
TELEGRAM_MTPROTO_SESSION=test_session_string
TELEGRAM_MTPROTO_API_ID=12345678
TELEGRAM_MTPROTO_API_HASH=abcdef1234567890
BACKEND_ENV

cat > apps/ingestion-service/.env << 'INGESTION_ENV'
INGESTION_TELEGRAM_MTPROTO_SESSION=test_session_string
INGESTION_TELEGRAM_MTPROTO_API_ID=12345678
INGESTION_TELEGRAM_MTPROTO_API_HASH=abcdef1234567890
INGESTION_ENV

bash scripts/validate-session-migration.sh 2>&1 || echo "Exit code: $?"

# Test 3: Backend clean, ingestion has credentials (should pass)
echo -e "\n=== Test 3: Proper migration (should pass) ==="
cat > apps/backend/.env << 'BACKEND_ENV'
# MTProto credentials removed
NODE_ENV=development
BACKEND_ENV

cat > apps/ingestion-service/.env << 'INGESTION_ENV'
INGESTION_TELEGRAM_MTPROTO_SESSION=test_session_string
INGESTION_TELEGRAM_MTPROTO_API_ID=12345678
INGESTION_TELEGRAM_MTPROTO_API_HASH=abcdef1234567890
INGESTION_ENV

bash scripts/validate-session-migration.sh 2>&1
echo "Exit code: $?"

# Cleanup
rm -rf apps/backend/.env apps/ingestion-service/.env
