#!/usr/bin/env bash
# =====================================================================
# Session Migration Validation Script
# =====================================================================
# Validates that MTProto session has been properly migrated from backend
# to ingestion-service. This is critical for deployment safety to prevent
# AUTH_KEY_DUPLICATED errors (Telegram ToS violation).
#
# Per Requirement GAP 6 (Centralized Ingestion Service):
# - Backend .env must NOT contain MTProto session variables
# - Ingestion-service .env must HAVE MTProto session variables
#
# Usage:
#   ./scripts/validate-session-migration.sh
#
# Exit codes:
#   0 = Validation passed (safe to deploy)
#   1 = Validation failed (migration incomplete)
# =====================================================================

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Paths to .env files
BACKEND_ENV="apps/backend/.env"
INGESTION_ENV="apps/ingestion-service/.env"

# Track validation errors
VALIDATION_ERRORS=0

# =====================================================================
# Helper Functions
# =====================================================================

print_header() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  $1"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

print_success() {
  echo -e "${GREEN}✓${NC} $1"
}

print_error() {
  echo -e "${RED}✗${NC} $1"
  VALIDATION_ERRORS=$((VALIDATION_ERRORS + 1))
}

print_warning() {
  echo -e "${YELLOW}⚠${NC} $1"
}

check_env_file_exists() {
  local file_path=$1
  if [ ! -f "$file_path" ]; then
    print_error "File not found: $file_path"
    return 1
  fi
  return 0
}

check_var_not_set() {
  local env_file=$1
  local var_name=$2
  local description=$3

  # Check if variable exists and is not empty
  if grep -q "^${var_name}=" "$env_file" 2>/dev/null; then
    local value=$(grep "^${var_name}=" "$env_file" | cut -d'=' -f2- | xargs)
    if [ -n "$value" ]; then
      print_error "$description is set in $env_file (should be removed)"
      return 1
    fi
  fi

  print_success "$description is NOT set in $env_file"
  return 0
}

check_var_is_set() {
  local env_file=$1
  local var_name=$2
  local description=$3

  # Check if variable exists and is not empty
  if grep -q "^${var_name}=" "$env_file" 2>/dev/null; then
    local value=$(grep "^${var_name}=" "$env_file" | cut -d'=' -f2- | xargs)
    if [ -n "$value" ]; then
      print_success "$description is set in $env_file"
      return 0
    fi
  fi

  print_error "$description is NOT set in $env_file (required)"
  return 1
}

# =====================================================================
# Main Validation Logic
# =====================================================================

print_header "MTProto Session Migration Validator"
echo "Checking that MTProto credentials have been migrated from backend to ingestion-service..."
echo ""

# Check if .env files exist
print_header "Step 1: Verify .env files exist"
check_env_file_exists "$BACKEND_ENV" || exit 1
check_env_file_exists "$INGESTION_ENV" || exit 1
echo ""

# Check backend .env has NO session variables
print_header "Step 2: Verify backend .env has NO MTProto credentials"
echo "Backend must not have MTProto session to avoid AUTH_KEY_DUPLICATED errors"
echo ""

check_var_not_set "$BACKEND_ENV" "TELEGRAM_MTPROTO_SESSION" "TELEGRAM_MTPROTO_SESSION"
check_var_not_set "$BACKEND_ENV" "TELEGRAM_MTPROTO_API_ID" "TELEGRAM_MTPROTO_API_ID"
check_var_not_set "$BACKEND_ENV" "TELEGRAM_MTPROTO_API_HASH" "TELEGRAM_MTPROTO_API_HASH"
echo ""

# Check ingestion-service .env HAS session variables
print_header "Step 3: Verify ingestion-service .env HAS MTProto credentials"
echo "Ingestion service requires all MTProto credentials to connect to Telegram"
echo ""

check_var_is_set "$INGESTION_ENV" "INGESTION_TELEGRAM_MTPROTO_SESSION" "INGESTION_TELEGRAM_MTPROTO_SESSION"
check_var_is_set "$INGESTION_ENV" "INGESTION_TELEGRAM_MTPROTO_API_ID" "INGESTION_TELEGRAM_MTPROTO_API_ID"
check_var_is_set "$INGESTION_ENV" "INGESTION_TELEGRAM_MTPROTO_API_HASH" "INGESTION_TELEGRAM_MTPROTO_API_HASH"
echo ""

# Check backend is configured to use SSE ingestion (optional warning)
print_header "Step 4: Verify backend is configured for SSE mode (optional)"
if grep -q "^USE_SSE_INGESTION=true" "$BACKEND_ENV" 2>/dev/null; then
  print_success "Backend is configured to use SSE ingestion (USE_SSE_INGESTION=true)"
else
  print_warning "Backend USE_SSE_INGESTION is not set to 'true' - ensure this is set before deploying"
  echo "           (This check is informational only and does not fail validation)"
fi
echo ""

# Final result
print_header "Validation Result"
if [ $VALIDATION_ERRORS -eq 0 ]; then
  echo -e "${GREEN}✓ All checks passed!${NC}"
  echo ""
  echo "MTProto session migration is complete. Safe to deploy ingestion-service."
  echo ""
  exit 0
else
  echo -e "${RED}✗ Validation failed with $VALIDATION_ERRORS error(s)${NC}"
  echo ""
  echo "MTProto session migration is INCOMPLETE. DO NOT deploy until fixed."
  echo ""
  echo "Action items:"
  echo "  1. Move MTProto credentials from $BACKEND_ENV to $INGESTION_ENV"
  echo "  2. Remove TELEGRAM_MTPROTO_* variables from $BACKEND_ENV"
  echo "  3. Ensure INGESTION_TELEGRAM_MTPROTO_* variables are set in $INGESTION_ENV"
  echo "  4. Re-run this script to verify"
  echo ""
  exit 1
fi
