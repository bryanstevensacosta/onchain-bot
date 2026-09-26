# Changelog — @onchain-bot/scheduling-posts

## [Unreleased]

### Added (todos 1-2)

- App setup: `src/main.ts` (:4080 `SCHEDULING_POSTS_PORT`), `src/app.module.ts`
  (Config + Health + Scheduling + ScheduledPosts + Telegram, global x-api-key
  guard + DomainError filter), composite `GET /api/health` (5 components),
  Tier-1 config (`DATABASE_URL` required), own DB `onchain_bot_scheduling[_staging]`
  (dev pg :5442, redis :6389), `Dockerfile` + dev/staging compose, env templates.
- Scheduling core moved via `git mv` from feed-publisher (rotation catalog,
  per-target delay+caps, media library with permanent retention,
  `SCHEDULING_POSTS_UPLOADS_ROOT`), rewired to the gateway-only dispatcher.
- Contract posts: `ScheduleRequest` validation (201 create / 200 idempotent
  replay, 404/403/409/422 per contract §2), `ScheduledPost` state machine
  (scheduled → fired | cancelled | failed), per-target delay/cap HOLD fire
  path with §6 codes (`HELD_DELAY`, `HELD_DAILY_CAP`, `TARGET_DOWN`,
  `BOT_REVOKED`, `CHANNEL_MISMATCH`, `MEDIA_MISSING`, `CONTENT_REF_GONE`,
  `SESSION_CLOSED`), terminal callbacks (HTTP at-least-once, log-only
  unconfigured), `scheduled_posts` TypeORM shape (unwired), per-session
  rate limit (10/min, 429).
- Telegram via gateway only (P42): HMAC signer, send client
  (message/photo-URL/media_group-URL, fail-closed), vault bot mapping,
  outcome parity ledger + `GET /api/telegram/parity` + `assertNoDivergence`
  cutover gate. No Bot API leg exists in this app.
- 45 suites / 144 tests green (87% stmts); live boot matrix green
  (health 5-up, 401/201/200/403/404/422).
