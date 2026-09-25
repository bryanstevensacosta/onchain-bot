# Changelog — @onchain-bot/telegram-bots-gateway

## [Unreleased]

### Added

- App scaffold (todo 1): NestJS 11 service on port triplet 4070/4071/4072 (dev/staging/prod, verified free with `lsof`), `GET /api/health`, `Dockerfile` (`CMD dist/main.js`), dev + staging compose files, `.env.example` + `.env.development` + staging/production templates (own DB `onchain_bot_bots[_staging]`).
- Encrypted bot vault (todo 1): `bot_vault` table shape (id, label, AES-256-GCM token, owner_app, created/rotated_at), internal CRUD (`POST/GET/GET :id/PATCH :id/rotate/DELETE :id /api/vault/bots`) with redacted reads (`token: '***'`), rotation without redeploy, fail-closed boot without `ENCRYPTION_KEY` (clear error, exit 1).
- Bot resolver (todo 1): `GET /api/bots/:id/profile` (handle, bot id, username, display name, avatar URL via Bot API `getMe`/`getUserProfilePhotos`) with permanent avatar cache under `uploads/avatars/` (janitor-excluded); `GET /api/bots/:id/avatar` serves the cached JPEG or 404 when uncached.
- Living `AGENTS.md` + test suite (6 suites, 19 tests, failing-first) with coverage.
