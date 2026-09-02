# MTProto Credentials - Security Documentation

**Last Updated:** 2026-09-02  
**Issue:** AUTH_KEY_DUPLICATED error due to duplicate MTProto sessions

## Summary

MTProto credentials have been sanitized across all environments except local development to prevent `AUTH_KEY_DUPLICATED` errors when multiple instances attempt to use the same Telegram session simultaneously.

---

## Current State

### ✅ Real Credentials (ONLY in Local Development)

**Location:** `apps/ingestion-service/.env` (local machine)

```
INGESTION_TELEGRAM_MTPROTO_API_ID=21903336
INGESTION_TELEGRAM_MTPROTO_API_HASH=d463e40b07b58e6ecb222a609415c78f
INGESTION_TELEGRAM_MTPROTO_SESSION=1AQAOMTQ5LjE1NC4xNzUuNTQBuwzEd+UU... (full session string)
```

**Purpose:** Local development ingestion service that connects to Telegram MTProto API.

**Process:** Running on `localhost:3031` (PID varies)

---

### 🔒 Dummy Credentials (Production & Staging)

All other locations now use dummy values:

```
INGESTION_TELEGRAM_MTPROTO_API_ID=12345678
INGESTION_TELEGRAM_MTPROTO_API_HASH=abcdef1234567890abcdef1234567890
INGESTION_TELEGRAM_MTPROTO_SESSION=DUMMY_SESSION_STRING_NOT_FOR_PRODUCTION_USE
```

**Locations:**

- ✓ `apps/backend/.env.staging` (local)
- ✓ `apps/ingestion-service/.env.production.template` (local)
- ✓ `/opt/onchain-bot/apps/ingestion-service/.env.production` (droplet)
- ✓ `/opt/onchain-bot/apps/ingestion-service/.env.backup-mtproto` (droplet)

---

## Archived Backups - Status

**✅ COMPLETED (2026-09-02):** All backup files containing real credentials have been securely deleted from the droplet.

**Previously deleted:**

- `.env.backup-mtproto.old-20260902-213503`
- `.env.production.backup-20260901-091017`
- `.env.production.backup-20260902-213447`
- `.env.production.backup-before-cleanup`

**Remaining files (safe - contain only dummy values):**

- `/opt/onchain-bot/apps/ingestion-service/.env` (no MTProto credentials)
- `/opt/onchain-bot/apps/ingestion-service/.env.production` (dummy values)
- `/opt/onchain-bot/apps/ingestion-service/.env.backup-mtproto` (dummy values)
- `/opt/onchain-bot/apps/ingestion-service/.env.production.mtproto-removed` (archived, no credentials)

---

## Docker Container Status

**✅ UPDATED (2026-09-02):** The ingestion Docker container has been restarted with dummy credentials.

**Current container environment:**

```
INGESTION_TELEGRAM_MTPROTO_API_ID=12345678  # Dummy values
INGESTION_TELEGRAM_MTPROTO_API_HASH=abcdef1234567890abcdef1234567890
INGESTION_TELEGRAM_MTPROTO_SESSION=DUMMY_SESSION_STRING_NOT_FOR_PRODUCTION_USE
```

**Status:** ✅ Container healthy, no `AUTH_KEY_DUPLICATED` errors in logs.

---

## Session Conflict Resolution

### Problem

- **Local development** uses API_ID `21903336`
- **Production Docker** was using API_ID `34691112`
- Both were attempting MTProto connections simultaneously
- Telegram detected duplicate `auth_key` usage → `AUTH_KEY_DUPLICATED` error

### Solution

1. ✅ Keep real credentials ONLY in local development (`apps/ingestion-service/.env`)
2. ✅ Replace all production/staging credentials with dummy values
3. ✅ **Docker container restarted** with dummy credentials (2026-09-02)
4. ✅ **All backup files with real credentials deleted** from droplet (2026-09-02)
5. 📋 Production should use SSE ingestion or mock adapters, not direct MTProto

---

## Best Practices

### For Development

- **Never commit** `apps/ingestion-service/.env` to git (it's in `.gitignore`)
- Real credentials should only exist on developer's local machine
- Generate new sessions using: `cd apps/ingestion-service && npm run telegram:gen-session`

### For Production/Staging

- Use **SSE ingestion mode** (`USE_SSE_INGESTION=true`) to consume from local dev
- Or use **mock ingestion** (`USE_MOCK_INGESTION=true`) for testing
- **Never run MTProto directly** in production Docker containers

### For Templates

- All `.env.example` and `.env.*.template` files use dummy values
- Clear warnings about not committing real credentials

---

## Credential Generation

To generate a new MTProto session for local development:

```bash
cd apps/ingestion-service
npm run telegram:gen-session
```

This will:

1. Prompt for phone number
2. Send Telegram verification code
3. Generate a session string
4. Output the `INGESTION_TELEGRAM_MTPROTO_SESSION` value

**Store this securely** in your local `apps/ingestion-service/.env` file.

---

## GitHub Actions / CI/CD

**Current Status:** ✅ No MTProto credentials in GitHub Actions workflows

The deploy workflows (`.github/workflows/deploy-ingestion.yml`) do NOT inject any MTProto credentials. The container uses whatever is in `.env.production` on the droplet.

**Recommendation:** Consider using GitHub Secrets if real production MTProto is needed, but current architecture suggests using SSE mode instead.

---

## Summary Checklist

- [x] Local development has real credentials (`apps/ingestion-service/.env`)
- [x] Staging uses dummy credentials (`apps/backend/.env.staging`)
- [x] Production template uses dummy credentials (`.env.production.template`)
- [x] Droplet `.env.production` uses dummy credentials
- [x] Droplet `.env.backup-mtproto` uses dummy credentials
- [x] **Docker container restarted** with new dummy credentials ✅
- [x] **Old backup files deleted** from droplet ✅ (2026-09-02)
- [ ] Configure production to use SSE or mock ingestion mode (recommended)

---

## Emergency Recovery

**Status:** ✅ All old backups have been securely deleted.

If MTProto credentials need to be regenerated for any reason:

1. Generate a new session on your local development machine:

   ```bash
   cd apps/ingestion-service
   npm run telegram:gen-session
   ```

2. Update your local `apps/ingestion-service/.env` file with the new credentials

3. **Never** deploy real MTProto credentials to production/staging environments

**Note:** The original production credentials (API_ID=34691112) have been permanently removed from all systems as part of the security cleanup on 2026-09-02.
