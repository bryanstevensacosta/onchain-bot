# Draft: Startup Config Validator

## Status

`awaiting-approval`

## Intent

CLEAR — user wants a startup-time env var validator that blocks on missing critical vars, warns on optional ones, and adds connectivity pre-flight checks.

## Changes Approved

Approved by user (said "si" to the proposed architecture on 2026-07-13).

## Decisions Recorded

### 1. Blocking tier (Tier 1 — Always Required)

These vars BLOCK startup with a fatal error if empty:

- `ALCHEMY_API_KEY`
- `BIRDEYE_API_KEY`
- `COINMARKETCAP_API_KEY`
- `FLUXRPC_API_KEY`
- `HELIUS_API_KEY`
- `MOBULA_API_KEY`
- `MORALIS_API_KEY`
- `PUMPDEV_API_KEY`, `PUMPDEV_WALLET_PUBLIC`, `PUMPDEV_WALLET_PRIVATE`
- `TELEGRAM_BOT_TOKEN`
- `INGESTION_TELEGRAM_MTPROTO_API_ID`, `INGESTION_TELEGRAM_MTPROTO_API_HASH`, `INGESTION_TELEGRAM_MTPROTO_SESSION`
- `VIP_CALLS_BOT_TOKEN`, `CRYPTO_NEWS_BOT_TOKEN`, `CHAIN_DEXTER_BOT_TOKEN`

### 2. Blocking tier (Tier 2 — Required When Enabled)

- `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` — if `DATABASE_ENABLED=true`
- `REDIS_HOST`, `REDIS_PORT` — if `REDIS_ENABLED=true`
- `PUBLISHING_TELEGRAM_OUTPUT_CHANNEL` — warn but don't block (optional feature)
- `VIP_CALLS_OUTPUT_CHANNEL`, `CRYPTO_NEWS_OUTPUT_CHANNEL` — same
- `LLM_GATEWAY_API_KEY` — warn if empty (LLM features degrade gracefully)

### 3. Format validation (Tier 3)

- `PORT`: integer 1–65535
- `NODE_ENV`: one of `development|production|test`
- `INGESTION_TELEGRAM_MTPROTO_API_ID`: positive integer
- `CHAIN_DEXTER_INGEST_MODE`: one of `webhook|polling`

### 4. Warning tier (optional — non-blocking)

- `INGESTION_TELEGRAM_SEED_KOLS`, `INGESTION_TELEGRAM_SEED_NEWS`
- `ANALYTICS_*`, `MILESTONE_*`, `KOL_REPUTATION_*` — all have defaults
- `UPLOADS_ROOT`, `LOG_*` — all have defaults
- FluxRPC/Helius WS URLs — WebSocket is fallback
- `FLUXRPC_RPC` — warn if empty (chain detection needs it)

### 5. Architecture

- **New file**: `apps/backend/src/shared/common/config/config-validator.ts`
  - Exports `validateAppConfig(appCfg: AppConfig): { warnings: string[] }`
  - Throws `ConfigValidationError` (extends Error) with ALL missing vars listed
  - Manifest defined as a typed array of `ConfigVarDefinition[]`
  - Pure function, zero NestJS DI — callable before boot
- **Wiring in `main.ts`**: After dotenv load (line 22), before `NestFactory.create()` (line 54)
  Evaluate config factory: `(appConfig as () => AppConfig)()` → then validate
- **Connectivity**: Separate `ConfigConnectivityService` in `config-connectivity.service.ts`
  Implements `OnApplicationBootstrap`, pings PG/Redis/Telegram, warns only
  Wired as provider in `AppModule`

### 6. Connectivity checks (non-blocking)

- `ConfigConnectivityService` on `OnApplicationBootstrap`
- Postgres: `pg.Client` → `SELECT 1` — warn if unreachable (skip if DB disabled)
- Redis: `new Redis().ping()` — warn if unreachable (skip if Redis disabled)
- Telegram Bot API: `fetch(getMe endpoint)` — warn if unreachable (skip if token empty)
- All errors caught → never crash. Log via `Logger`.

### 7. Testing

- **Unit**: ConfigValidator — all-present, missing-required, mixed, format errors, conditional-required-if
- **Unit**: Connectivity service — with mocked pg/redis/fetch, verify warn on fail
- **Integration**: bootstrap with missing env → process exits with error message
- Test file: `apps/backend/src/shared/common/config/__tests__/config-validator.spec.ts`
- Test file: `apps/backend/src/shared/common/config/__tests__/config-connectivity.service.spec.ts`

### 8. Non-goals / Must-NOT-Have

- NO changes to `app.config.ts` structure (keep `?? ''`)
- NO new npm dependencies
- NO changes to `.env` files
- NO NestJS module for validator — it's a function
- NO compile-time impact — validator runs at runtime only

## Evidence collected

- `app.config.ts`: full 537-line config with all env vars
- `main.ts`: bootstrap flow with dotenv manual load at lines 17-22
- `database.module.ts`: TypeORM conditional init, entities list
- `health.controller.ts`: existing health check pattern
- `chain-dexter-bot/bot.config.ts`: existing validate() warn pattern precedent

## Pending action

Write `.omo/plans/startup-config-validator.md` with full task breakdown after user approval.
