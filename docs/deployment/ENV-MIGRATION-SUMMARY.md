# Environment Variables Migration Summary

## ✅ Changes Made to Prevent AUTH_KEY_DUPLICATED

### Files Modified:

1. **`apps/backend/.env.dev`** (Local development)
   - ✅ Added migration warning before MTProto variables
   - ⚠️ Variables remain TEMPORARILY until ingestion-service is deployed locally
   - Contains instructions for migration when ready

2. **`apps/backend/.env.staging.template`** (Staging on droplet)
   - ✅ Removed all MTProto credentials
   - ✅ Added `USE_SSE_INGESTION=true`
   - ✅ Added `INGESTION_REMOTE_URL=http://ingestion-service:3031`
   - ✅ Added clear warnings about NOT adding MTProto credentials

3. **`apps/backend/.env.production.template`** (Production on droplet)
   - ✅ Removed all MTProto credentials
   - ⚠️ `USE_SSE_INGESTION=false` by default (must be enabled during migration)
   - ✅ Added `INGESTION_REMOTE_URL=http://ingestion-service:3031`
   - ✅ Added migration instructions in comments

## 📋 Current State by Environment:

### DEV (Local - `/Users/bryanstevens/dev/onchain-bot`)

**Status:** ⚠️ PENDING MIGRATION

**Current config:**

- MTProto credentials: ✅ Still in `apps/backend/.env.dev` (with warning)
- Ingestion mode: Local (MTProto in backend)

**Action needed:**

1. When you're ready to test ingestion-service locally:
2. Create `apps/ingestion-service/.env` with credentials
3. Remove MTProto vars from `apps/backend/.env.dev`
4. Add to backend: `USE_SSE_INGESTION=true`
5. Run: `./scripts/validate-session-migration.sh`

### STAGING (Droplet - `/opt/onchain-bot-staging`)

**Status:** ✅ READY FOR MIGRATION (template updated)

**On droplet, you need to:**

1. SSH to droplet: `ssh root@144.126.203.139`
2. Navigate: `cd /opt/onchain-bot-staging`
3. Check current `.env.staging` for MTProto credentials
4. Create `apps/ingestion-service/.env` with those credentials
5. Remove MTProto from `apps/backend/.env.staging`
6. Ensure `USE_SSE_INGESTION=true` in backend
7. Run: `./scripts/validate-session-migration.sh`

### PRODUCTION (Droplet - `/opt/onchain-bot`)

**Status:** ✅ READY FOR MIGRATION (template updated)

**On droplet, you need to:**

1. SSH to droplet: `ssh root@144.126.203.139`
2. Navigate: `cd /opt/onchain-bot`
3. **BACKUP FIRST**: `cp apps/backend/.env apps/backend/.env.backup.$(date +%Y%m%d-%H%M%S)`
4. Extract MTProto credentials: `grep TELEGRAM_MTPROTO apps/backend/.env`
5. Create `apps/ingestion-service/.env` with those credentials
6. Remove MTProto from `apps/backend/.env`
7. Change `USE_SSE_INGESTION=false` to `USE_SSE_INGESTION=true`
8. Run: `./scripts/validate-session-migration.sh`
9. Follow full migration: `docs/deployment/MIGRATION-GUIDE-DROPLET.md`

## ⚠️ Critical Rules:

### ❌ NEVER DO THIS:

```bash
# DON'T have MTProto in BOTH places at the same time
# apps/backend/.env
TELEGRAM_MTPROTO_SESSION=xxx

# apps/ingestion-service/.env
INGESTION_TELEGRAM_MTPROTO_SESSION=xxx  # ← This causes AUTH_KEY_DUPLICATED!
```

### ✅ ALWAYS DO THIS:

```bash
# MTProto credentials in ONLY ONE place:

# apps/ingestion-service/.env (ONLY)
INGESTION_TELEGRAM_MTPROTO_API_ID=12345
INGESTION_TELEGRAM_MTPROTO_API_HASH=abc123
INGESTION_TELEGRAM_MTPROTO_SESSION=1AxYoUr...

# apps/backend/.env (NO MTProto, only SSE config)
USE_SSE_INGESTION=true
INGESTION_REMOTE_URL=http://ingestion-service:3031
```

## 🔍 Validation Commands:

### Before Any Changes:

```bash
# See what you currently have
cd /opt/onchain-bot  # or /opt/onchain-bot-staging
grep "TELEGRAM_MTPROTO" apps/backend/.env
```

### After Migration:

```bash
# Validate migration is safe
./scripts/validate-session-migration.sh

# Expected output:
# ✓ All checks passed!
# MTProto session migration is complete. Safe to deploy ingestion-service.
```

### If Validation Fails:

```bash
# Check what's wrong
cat apps/backend/.env | grep TELEGRAM_MTPROTO
cat apps/ingestion-service/.env | grep INGESTION_TELEGRAM_MTPROTO

# Fix issues, then re-validate
./scripts/validate-session-migration.sh
```

## 📚 Related Documentation:

- **Step-by-step migration**: `docs/deployment/MIGRATION-GUIDE-DROPLET.md`
- **Quick checklist**: `docs/deployment/DROPLET-ENV-CHECKLIST.md`
- **Ingestion-service .env template**: `apps/ingestion-service/.env.example`
- **Validation script**: `scripts/validate-session-migration.sh`
- **Validation script docs**: `scripts/README-validate-session-migration.md`

## 🎯 Next Steps:

1. ✅ **Done**: Templates updated with migration warnings
2. ⏭️ **Next**: SSH to droplet and migrate staging first
3. ⏭️ **Then**: Validate staging works for 48h
4. ⏭️ **Finally**: Migrate production following the full guide

## 📞 Support:

If you encounter `AUTH_KEY_DUPLICATED` errors:

1. **STOP** both backend and ingestion-service immediately
2. Wait 60 seconds for Telegram to clear session
3. Verify credentials are ONLY in one place
4. Run validation script
5. Start ingestion-service first, then backend
