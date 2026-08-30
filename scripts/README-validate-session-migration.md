# Session Migration Validation Script

## Overview

The `validate-session-migration.sh` script ensures that MTProto session credentials have been properly migrated from the backend to the ingestion-service. This validation is **critical for deployment safety** to prevent AUTH_KEY_DUPLICATED errors (Telegram ToS violation).

## Purpose

Per **Requirement GAP 6** (Centralized Ingestion Service), this script validates:
- ✓ Backend `.env` has **NO** MTProto session variables
- ✓ Ingestion-service `.env` **HAS** all required MTProto session variables
- ⚠️ Backend is configured to use SSE ingestion mode (optional check)

## Usage

### Run the validation

```bash
./scripts/validate-session-migration.sh
```

### Exit codes

- `0` = Validation passed (safe to deploy)
- `1` = Validation failed (migration incomplete)

## What it checks

### Step 1: File existence
- `apps/backend/.env` exists
- `apps/ingestion-service/.env` exists

### Step 2: Backend has NO MTProto credentials
Checks that these variables are **NOT set** in `apps/backend/.env`:
- `TELEGRAM_MTPROTO_SESSION`
- `TELEGRAM_MTPROTO_API_ID`
- `TELEGRAM_MTPROTO_API_HASH`

### Step 3: Ingestion-service has MTProto credentials
Checks that these variables **ARE set** in `apps/ingestion-service/.env`:
- `INGESTION_TELEGRAM_MTPROTO_SESSION`
- `INGESTION_TELEGRAM_MTPROTO_API_ID`
- `INGESTION_TELEGRAM_MTPROTO_API_HASH`

### Step 4: Backend SSE mode (optional)
Checks if `USE_SSE_INGESTION=true` is set in `apps/backend/.env`.
This is an **optional warning** only - does not fail validation.

## Example output (success)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  MTProto Session Migration Validator
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ All checks passed!

MTProto session migration is complete. Safe to deploy ingestion-service.
```

## Example output (failure)

```
✗ TELEGRAM_MTPROTO_SESSION is set in apps/backend/.env (should be removed)
✗ INGESTION_TELEGRAM_MTPROTO_SESSION is NOT set in apps/ingestion-service/.env (required)

✗ Validation failed with 2 error(s)

MTProto session migration is INCOMPLETE. DO NOT deploy until fixed.

Action items:
  1. Move MTProto credentials from apps/backend/.env to apps/ingestion-service/.env
  2. Remove TELEGRAM_MTPROTO_* variables from apps/backend/.env
  3. Ensure INGESTION_TELEGRAM_MTPROTO_* variables are set in apps/ingestion-service/.env
  4. Re-run this script to verify
```

## When to run

Run this script:
- ✓ **Before deploying** the centralized ingestion-service to any environment
- ✓ **After migrating** credentials from backend to ingestion-service
- ✓ **In CI/CD pipeline** as a pre-deployment gate (Phase 7 migration workflow)

## Integration with deployment

This script should be integrated into the deployment workflow:

```bash
# In deploy script or CI/CD pipeline
./scripts/validate-session-migration.sh || {
  echo "ERROR: Session migration validation failed. Aborting deployment."
  exit 1
}

# Continue with deployment if validation passes
docker compose up -d ingestion-service
```

## Related documentation

- Spec: `.kiro/specs/centralized-ingestion-service/`
- Requirements: GAP 6 (Session Migration Validation)
- Design: Phase 7 (Migration Preparation and Validation)

## Troubleshooting

### "File not found" errors

Ensure you're running the script from the repository root and that both `.env` files exist:
```bash
cd /path/to/onchain-bot
./scripts/validate-session-migration.sh
```

### Empty variable values

The script checks for non-empty values. Ensure your `.env` files have actual values, not just empty assignments:
```bash
# BAD
INGESTION_TELEGRAM_MTPROTO_SESSION=

# GOOD
INGESTION_TELEGRAM_MTPROTO_SESSION=actual_session_string_here
```

### Variables with comments

The script uses simple grep matching. Ensure variable assignments are on their own lines:
```bash
# WORKS
INGESTION_TELEGRAM_MTPROTO_SESSION=value

# MAY NOT WORK
INGESTION_TELEGRAM_MTPROTO_SESSION=value # This is my session
```
