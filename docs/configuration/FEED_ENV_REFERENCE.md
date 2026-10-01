# Crypto-News Environment Reference

> Every default below was verified against code on 2026-09-21. Do not copy
> values from memory, this file is the checked-in record of reality.
> Sources: `apps/backend/src/shared/common/config/app.config.ts`,
> `apps/ingestion-telegram/src/shared/common/config/app.config.ts`,
> `apps/ingestion-telegram/src/main.ts`,
> `apps/ingestion-telegram/src/stream/application/services/stream.service.ts`.
> Related: `.kiro/specs/refactor-kol-feed/refactor-recommendations.md` section 3,
> sibling tasks T1 (dual-path doc) and T3 (add-source guide) in
> `.omo/plans/refactor-kol-feed.md`.

Env precedence in both NestJS services: `.env.dev` wins over `.env`
(`ConfigModule.envFilePath: ['.env.dev', '.env']`).

## 0. Feed-unification rename note (2026-09-22, no new env vars)

Items 1-10 of `.omo/plans/telegram-feed-unification.md` introduced **zero**
new environment variables (verified by grepping `process.env.*` in
`apps/ingestion-telegram/src/shared/common/config/app.config.ts`: the full
`INGESTION_*` set predates the plan, and `SSE_*` came from the prior
refactor plan and is already documented in section 1). What changed are
table names, HTTP paths, and the on-disk media segment. Old → new:

| Old                                                                                 | New                                                                                                                                            |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| tables `crypto_news_sources` / `crypto_news_messages` / `crypto_news_message_media` | `telegram_feed_sources` / `telegram_feed_messages` / `telegram_feed_message_media` (all in the `<base>_ingestion` DB)                          |
| `GET/POST /api/feed/*` (ingestion)                                                  | `/api/feed/*` — sources CRUD in `SourcesController`, reads/stats in `FeedController`; old routes return 404                                    |
| `GET telegram-kol/identity/kols*` (backend)                                         | 501 with feed hints; reads via `GET {INGESTION_TELEGRAM_URL}/api/feed/sources?type=kol`                                                        |
| `<UPLOADS_ROOT>/crypto-news/media/`                                                 | `<UPLOADS_ROOT>/feed/media/` (`INGESTION_UPLOADS_ROOT` itself unchanged); HTTP serving `GET /api/media/:channelId/:messageId/:index` unchanged |
| retention clock `crypto_news_messages.ingested_at`                                  | `telegram_feed_messages.ingested_at` (same 72 h window, same lock `9_421_373`)                                                                 |

Stale rows below (kept verbatim, corrected by the table above): section 2
`INGESTION_UPLOADS_ROOT` still shows the old `crypto-news/media` segment;
section 3 troubleshooting still probes `GET {url}/api/feed/sources`
(use `/api/feed/sources`). Full design:
`apps/ingestion-telegram/docs/architecture/telegram-feed.md`; operator
guide: `apps/ingestion-telegram/docs/guides/ADD_FEED_SOURCE.md`.

## 0b. Per-env ingestion model (2026-09-22, no new env vars)

One ingestion-telegram per env (same image, 1:1 with its backend). The old
singleton (one instance serving all envs) is retired. No env var was added
or renamed for this — only which instance each URL points at.

| Env       | Ingestion instance                            | Host:container        | Backend reads via                                                           | Frontend reads via                 |
| --------- | --------------------------------------------- | --------------------- | --------------------------------------------------------------------------- | ---------------------------------- |
| dev local | own (`npm run dev:ingestion`)                 | `:3031`               | `INGESTION_TELEGRAM_URL=http://localhost:3031` (default)                    | vite `/ingestion-api` → `:3031`    |
| staging   | twin (`docker-compose.staging-ingestion.yml`) | `127.0.0.1:3033:3031` | `INGESTION_TELEGRAM_URL=http://onchain-bot-ingestion-telegram-staging:3031` | `nginx.staging.conf` twin upstream |
| prod      | singleton (`docker-compose.ingestion.yml`)    | `127.0.0.1:3032:3031` | `INGESTION_TELEGRAM_URL=http://onchain-bot-ingestion-telegram:3031`         | `nginx.conf` singleton upstream    |

Triples map (var names + account labels ONLY — never values, never hashes
beyond the pre-boot inequality assert in `docs/deployment/staging-twin-runbook.md`):

| Env     | Triple (`INGESTION_TELEGRAM_MTPROTO_API_ID/_API_HASH/_SESSION`) | Lives in                                                        |
| ------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| prod    | cuenta ACTUAL                                                   | `/opt/onchain-bot/apps/ingestion-telegram/.env.production`      |
| staging | VIEJA cuenta de dev                                             | `/opt/onchain-bot-staging/apps/ingestion-telegram/.env.staging` |
| local   | cuenta NUEVA (3-4 canales)                                      | repo-ignored `.env` / `.env.dev` (`.env.dev` wins)              |

Two instances with the same triple cause `AUTH_KEY_DUPLICATED`. Twin DB:
`alpha_meta_token_scanner_staging_ingestion` (starts EMPTY, no prod mirror).
Full twin ops: `docs/deployment/staging-twin-runbook.md`; twin seeding:
`docs/deployment/staging-twin-channels.md`.

## 1. Backend (`apps/backend`)

### Connection to ingestion-telegram

| Variable                 | Default                 | Reader                                                                                                                                                                                            | Valid range                                                                                                                                                                                                                                                                                                                  |
| ------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INGESTION_TELEGRAM_URL` | `http://localhost:3031` | `resolveIngestionServiceUrl()` in `apps/backend/src/shared/common/config/app.config.ts:95`, exposed as `app.ingestion.serviceUrl`; consumed by the SSE listener adapter and `FeedIngestionClient` | Any non-empty HTTP(S) URL. Empty string is treated as missing and falls back to the default. Per env (§0b): dev default, staging twin `http://onchain-bot-ingestion-telegram-staging:3031`, prod `http://onchain-bot-ingestion-telegram:3031` (Oracle host `:3032`, Tailscale `http://cryptoganster.tailf01c61.ts.net:3032`) |
| `USE_SSE_CRYPTO_NEWS`    | `true`                  | `app.ingestion.useSseFeed` (`app.config.ts:412`)                                                                                                                                                  | `true` / `false` (case-insensitive; anything else means `false`). `false` disables the real-time SSE path and the poller becomes the primary 1-minute ingestion mode (rollback without code changes)                                                                                                                         |
| `USE_SSE_INGESTION`      | `true`                  | `app.ingestion.useSse` (`app.config.ts:410`)                                                                                                                                                      | `true` / `false`. General KOL-path SSE switch; feed has its own switch above                                                                                                                                                                                                                                                 |
| `USE_MOCK_INGESTION`     | `false`                 | `app.ingestion.useMock` (`app.config.ts:414`)                                                                                                                                                     | `true` / `false`. CLI and test mode only                                                                                                                                                                                                                                                                                     |

### Polling

| Variable                               | Default | Reader                                                                                                    | Valid range                                                                                                                                                                                              |
| -------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CRYPTO_NEWS_POLLING_INTERVAL_MINUTES` | `5`     | `app.cryptoNews.pollingIntervalMinutes` (`app.config.ts:428`); consumed by `EnqueueMatchingCronScheduler` | Integer 1 to 60. Out-of-range or unparsable values silently fall back to `5`. Only used when `USE_SSE_CRYPTO_NEWS=true` (fallback cadence); when SSE is disabled the scheduler runs every 1 minute fixed |

Adaptive catch-up (no env knob): after 3 consecutive full batches
(`matches.length >= FETCH_LIMIT=50`) the scheduler fires one extra tick 10 s
later, then resets the streak. Any non-full batch or fetch failure resets the
streak to 0. Overlap guard (`isPolling`) skips a tick when the previous one
is still running.

### SSE timing (REAL, configurable)

The following three variables are live readers (wired in Task 7).
Defaults are unchanged from the previously hardcoded behavior:

| Variable                         | Default | Reader                                                                                                                                                                                                          | Valid range                                                                                                         |
| -------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `SSE_HEARTBEAT_INTERVAL_MS`      | `30000` | `stream.heartbeatIntervalMs` (`apps/ingestion-telegram/src/stream/stream.config.ts`); consumed by `StreamService.onModuleInit` (dynamic `SchedulerRegistry` job `sse-heartbeat`, default cron `*/30 * * * * *`) | Integer ms, 5000 to 300000. Missing or out-of-range values silently fall back to `30000`                            |
| `SSE_RECONNECT_INITIAL_DELAY_MS` | `1000`  | Backend `app.ingestion.sse.reconnectInitialDelayMs` (`apps/backend/src/shared/common/config/app.config.ts`); consumed by `TelegramSseListenerAdapter.calculateBackoff()`                                        | Integer ms, 100 to 30000. Missing or out-of-range values silently fall back to `1000`                               |
| `SSE_RECONNECT_MAX_DELAY_MS`     | `30000` | Backend `app.ingestion.sse.reconnectMaxDelayMs` (same files); mirrored as `stream.reconnectMaxDelayMs` in ingestion for future use                                                                              | Integer ms, clamped up to be at least the initial delay. Missing or unparsable values silently fall back to `30000` |

### Publishing (Bot API)

| Variable                     | Default                                   | Reader                                                                                               | Valid range                                |
| ---------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `CRYPTO_NEWS_BOT_TOKEN`      | `''` (empty, publishing fails without it) | `app.publishing.cryptoNews.botToken` (`app.config.ts:475`); consumed by `BotApiFeedPublisherAdapter` | Telegram Bot API token from BotFather      |
| `CRYPTO_NEWS_OUTPUT_CHANNEL` | `''` (empty)                              | `app.publishing.cryptoNews.outputChannel` (`app.config.ts:476`)                                      | Telegram channel id, e.g. `-1001234567890` |

### Retention (backend side)

| Variable                            | Default | Reader                                                                                                                                                                                                                           | Valid range                                                    |
| ----------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `CRYPTO_NEWS_MEDIA_RETENTION_HOURS` | `72`    | `app.feedMediaRetentionHours` (`app.config.ts:561`); backend read-side window. The hourly delete janitor moved to ingestion-telegram on 2026-09-08 (`FeedRetentionCleanupScheduler`); this backend var no longer drives deletion | Positive integer hours. Validated by `config-validator.ts:371` |

### LLM gateway

| Variable               | Default                          | Reader                                                                                                                                                                                                                                  | Valid range                                                                                                                      |
| ---------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `LLM_GATEWAY_BASE_URL` | `http://localhost:4845`          | `app.llm.gateway.baseUrl` (`app.config.ts:571`)                                                                                                                                                                                         | HTTP(S) URL of the LiteLLM-compatible gateway                                                                                    |
| `LLM_GATEWAY_API_KEY`  | `''` (empty)                     | `app.llm.gateway.apiKey` (`app.config.ts:572`)                                                                                                                                                                                          | Gateway virtual key                                                                                                              |
| `LLM_GATEWAY_MODEL`    | `opencode-zen/deepseek-v4-flash` | `app.llm.gateway.model` (`app.config.ts:573`)                                                                                                                                                                                           | Model identifier                                                                                                                 |
| `USE_MOCK_AI`          | `false`                          | Read directly via `process.env` in `telegram/crypto-news-publisher/infrastructure/llm/crypto-news-llm.adapter.ts:59` (and the threads mirror `threads/publisher/infrastructure/llm/threads-llm.adapter.ts:77`); NOT part of `appConfig` | Only the exact string `true` activates mock mode (returns input unchanged, skips the gateway). Useful for tests without LLM cost |

### Flags that are NOT env vars

`matchingEnabled`, `llmEnabled`, and `publishingEnabled` are **database rows**,
not environment variables. `matchingEnabled` lives in the `MatchingConfig`
entity (`feed-integration`); `llmEnabled` + `publishingEnabled` live in
the `LlmConfig` entity (`feed-publisher`), toggled via
`PATCH /crypto-news/matching/config` and `PATCH /crypto-news-publisher/llm`.
Never add a `MATCHING_*` env gate (`app.config.ts:420` comment). Critical
dependency: **LLM generation = `llmEnabled` AND `publishingEnabled`**
(`process-next-queued-article.use-case.ts:115`).

## 2. Ingestion-telegram (`apps/ingestion-telegram`)

### MTProto (single session, lives ONLY here)

| Variable                                      | Default                                                     | Reader                                                                                                                                            | Valid range                                                                                                                        |
| --------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `INGESTION_TELEGRAM_MTPROTO_API_ID`           | `0` (fails class-validator `IsPositive`, fail-fast at boot) | `app.telegram.apiId` (`app.config.ts:369`)                                                                                                        | Positive integer from `https://my.telegram.org/apps`                                                                               |
| `INGESTION_TELEGRAM_MTPROTO_API_HASH`         | `''` (fails `MinLength(32)`)                                | `app.telegram.apiHash` (`app.config.ts:370`)                                                                                                      | String, minimum 32 characters                                                                                                      |
| `INGESTION_TELEGRAM_MTPROTO_SESSION`          | `''` (fails `IsNotEmpty`)                                   | `app.telegram.sessionString` (`app.config.ts:371`)                                                                                                | Base64 session string, generated once via `npm run telegram:gen-session`. Never duplicate across instances (`AUTH_KEY_DUPLICATED`) |
| `INGESTION_TELEGRAM_MTPROTO_ENABLED`          | _(deleted from backend `src`)_                              | ~~Backend legacy MTProto toggle, rollback-only~~ — branch deleted (forcing it → `410 Gone`); no reader                                            | `true` / `false` (inert in backend; `false` only breaks ingestion until fixed)                                                     |
| `INGESTION_TELEGRAM_MTPROTO_LOG_LEVEL`        | `error`                                                     | Ingestion `TelegramClientManager` reads keys its config never exposes (known gap, always GramJS default ERROR); the old backend reader is deleted | Any non-empty string, e.g. `error`, `warn`                                                                                         |
| `INGESTION_TELEGRAM_MTPROTO_STARTUP_DELAY_MS` | `60000`                                                     | _(deleted from backend `src`)_ — old backend `app.telegram.mtprotoStartupDelayMs` reader is gone                                                  | Milliseconds (inert in backend)                                                                                                    |
| `INGESTION_TELEGRAM_MTPROTO_USE_WSS`          | `false`                                                     | _(deleted from backend `src`)_ — old backend `app.telegram.mtprotoUseWss` reader is gone                                                          | `true` / `false` (inert in backend)                                                                                                |

Backend `INGESTION_TELEGRAM_MTPROTO_*` readers are GONE from `src`
(verified by grep — no `MTPROTO` in `app.config.ts` outside a comment):
the dummy triple in the gitignored repo `.env.staging` (`:70-73`) is inert
(no reader), and compose `environment:` wins at runtime anyway.
Duplicating a real session into ANY backend `.env`
triggers `AUTH_KEY_DUPLICATED` against the owning ingestion instance (per-env:
one triple per instance — prod cuenta actual, staging vieja-dev, local nueva).

### Port triple-var quirk (known gap, verified 2026-09-21)

| Variable             | Read by                                                                                                                                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INGESTION_API_PORT` | **Yes**: `app.api.port`, default `3031` (`app.config.ts:376`); validated 1-65535                                                                                                                                              |
| `PORT`               | **Yes**: `apps/ingestion-telegram/src/main.ts:46` (`process.env.PORT \|\| 3031`), the actual listen port                                                                                                                      |
| `INGESTION_PORT`     | **Nothing**: documented in `.env.example` but no reader in `src`. Keep all three aligned to `3031` (prod host `3032` → container `3031`, twin host `3033` → container `3031` on the Oracle server) until the vars are unified |

### Retention janitor (ingestion owns deletion)

| Variable                                      | Default | Reader                                                                                                                                                                                          | Valid range                                                                                                                                                                                                                                                       |
| --------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INGESTION_CRYPTO_NEWS_MEDIA_RETENTION_HOURS` | `72`    | `app.feedMediaRetentionHours` (`app.config.ts:512`); consumed by `FeedRetentionCleanupScheduler` (hourly, advisory lock `9_421_373`) for BOTH passes: media files + `crypto_news_messages` rows | Positive integer hours; the scheduler clamps to >= 1 h. Clock is `crypto_news_messages.ingested_at` (arrival), never `published_at`. 72 h is the invariant; the effective prod value is pending operator decision (prod backend previously cleaned media at 24 h) |

### API, Redis, DB (ingestion)

| Variable                                                              | Default                                                                                                     | Reader                                                                                                                                                   |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INGESTION_API_HOST`                                                  | `0.0.0.0`                                                                                                   | `app.api.host` (`app.config.ts:377`)                                                                                                                     |
| `INGESTION_API_BASE_URL`                                              | `http://localhost:3031`                                                                                     | `app.api.baseUrl` (`app.config.ts:378`); stamped into SSE media URLs                                                                                     |
| `INGESTION_REDIS_ENABLED`                                             | enabled unless explicitly `false`                                                                           | `app.redis.enabled` (`app.config.ts:385`)                                                                                                                |
| `INGESTION_REDIS_HOST` / `_PORT` / `_DB`                              | `localhost` / `6379` / `0`                                                                                  | `app.redis.*` (`app.config.ts:386`). Without Redis, last-seen cursors live in memory and a restart replays up to 50 historic messages per channel as new |
| `INGESTION_DATABASE_HOST` / `_PORT` / `_NAME` / `_USER` / `_PASSWORD` | `localhost` / `5432` / `onchain_bot` / `postgres` / `postgres` (each overridable via `DATABASE_*` fallback) | `app.database.*` (`app.config.ts:451`). Gated by `DATABASE_ENABLED=true`                                                                                 |
| `INGESTION_UPLOADS_ROOT`                                              | `./uploads`                                                                                                 | `app.uploads.root` (`app.config.ts:394`); media served from `<root>/crypto-news/media/`                                                                  |

## 3. Troubleshooting

| Symptom                                                 | Check these vars first                                        | Fix                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SSE silent: no feed arriving, no errors                 | `INGESTION_TELEGRAM_URL` on the backend                       | Must point at the env's OWN ingestion (dev `http://localhost:3031`, prod host `:3032`, twin host `:3033` — see §0b). Wrong URL means the backend retries with backoff 1 s to 30 s forever. Verify with `curl {url}/api/health/ready` and `GET {url}/api/feed/sources`                                                                                                                         |
| Slow polling: matches appear minutes late               | `USE_SSE_CRYPTO_NEWS`, `CRYPTO_NEWS_POLLING_INTERVAL_MINUTES` | With SSE on, the poller is only a fallback every N minutes (default `5`, valid 1-60, invalid silently becomes `5`). With SSE off, polling is the primary path at a fixed 1 minute. If SSE is disconnected, latency degrades to the poll cadence plus queue drain                                                                                                                              |
| LLM never runs: queue drains but content is always raw  | `llmEnabled` AND `publishingEnabled` (DB flags, not env)      | LLM generation requires **both** flags true (`process-next-queued-article.use-case.ts:115`). `llmEnabled=true` with `publishingEnabled=false` is a silent no-op by design (saves API cost on unpublished content). Also check `USE_MOCK_AI=true`, which bypasses the gateway and returns raw content                                                                                          |
| Queue full: new matches rejected, `cap reached` in logs | None (cap is code, not env)                                   | Publisher queue cap is hardcoded `36` (`EnqueueMatchingMessageUseCase.MAX_QUEUE_DEPTH`, enforced in both TypeORM and in-memory repos, oldest evicted). Stale `PENDING` entries expire after a hardcoded 24 h TTL (`ExpireStaleQueueEntriesScheduler`, reason `Expired: exceeded 24h in queue`). Drain via publishing or wait for TTL expiry; do not raise the cap via env, no such var exists |
| `AUTH_KEY_DUPLICATED` / session logged out              | `INGESTION_TELEGRAM_MTPROTO_SESSION`                          | The session string must exist in exactly ONE instance per env (prod cuenta actual, staging vieja-dev, local nueva — §0b). Two live instances with the same triple log each other out: stop the duplicate, wait 60 s, keep a single one per triple                                                                                                                                             |
| Media 404s on old messages                              | `INGESTION_CRYPTO_NEWS_MEDIA_RETENTION_HOURS`                 | Files older than the window are deleted hourly. Backend serves local-first with ingestion-proxy fallback, so deletions only bite after the ingestion copy is gone too                                                                                                                                                                                                                         |
| High latency (>10 s ingestion to enqueue)               | SSE status, queue depth, filter regexes                       | Confirm SSE connected; check `PENDING` queue depth against the 36 cap; inspect per-channel regex filters for ReDoS-prone patterns (100 ms per-regex timeout, invalid patterns are skipped)                                                                                                                                                                                                    |
