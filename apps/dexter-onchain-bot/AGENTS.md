# apps/dexter-onchain-bot/ — NestJS Knowledge Base

> Verified 2026-09-25 against code + `.omo/evidence/task-9-mega-refactor-market-data.log`
> (Tramo 3, todo 9, P13). v0.1.0 (source of truth: `package.json`).
> Decisions cited as Pxx come from `.omo/drafts/mega-refactor-tramos.md`
> §7.6. Contracts pinned in `.omo/plans/mega-refactor-central.md`
> v2026-09-24 (C-PORTS-01, C-DB-01, C-BOTS-01); plan in
> `.omo/plans/mega-refactor-market-data.md` (todo 9, final phase).

Contents: OVERVIEW · COMMANDS · STRUCTURE · MODULES · ENV INVENTORY ·
PORTS · HEALTH · SECURITY · TS CONVENTIONS · TESTS · GAPS · DECISIONS ·
NOTES

## OVERVIEW

NestJS 11 lookup-only Telegram bot (final phase of Tramo 3): answers
on-chain token scans over Bot API, fed EXCLUSIVELY by market-data HTTP
(todo 5 bridge, default-true). Extracted from backend
`telegram/chain-dexter-bot/` (which stays untouched — read-only move
source; its deprecation/removal belongs to the FINAL REVIEW, not here).

Lookup-only is the whole design: NO channel publishing, NO
scoring/tracking imports, NO local providers. Market-data down → an
explicit "cannot resolve" message, never a silent partial card.
Without `DEXTER_BOT_TOKEN` the HTTP surface still boots (bot ingress
stays inactive with a warn — verified in the boot log).

## COMMANDS

```bash
# In apps/dexter-onchain-bot/
npm run dev                  # DEXTER_PORT=4060 nest start --watch
npm run build                # nest build (emits dist/main.js)
npm run start:prod           # node dist/main
npm test                     # jest --forceExit (6 suites / 20 tests)
npx tsc --noEmit -p tsconfig.json
```

Root has NO dexter script on purpose (task constraint: read-only outside
`apps/dexter-onchain-bot/`; the backend move source was read, never
written). Dev equivalent of `dev:ingestion`:

```bash
cd apps/dexter-onchain-bot && DEXTER_PORT=4060 npm run start:dev
```

## STRUCTURE

```
src/
├── main.ts                     # bootstrap() — DEXTER_PORT ?? 4060, host 127.0.0.1, ValidationPipe
├── app.module.ts               # Config (.env.dev > .env) + Health + Dexter
├── health/                     # GET /api/health -> { status: 'ok', service }
└── dexter/
    ├── dexter.module.ts        # full wiring (see MODULES)
    ├── bot.config.ts           # DEXTER_BOT_TOKEN (+ CHAIN_DEXTER_* fallback), ingest mode, rate limit
    ├── bot-client.ts           # Bot API client (moved, lookup answers only)
    ├── trade-button-registry.ts# 8 buttons (moved; affiliate tags rebranded dexter-*)
    ├── message-formatter.ts    # full/compact cards, 4096 cap (moved)
    ├── inline-keyboard.builder.ts # scan + trade-button keyboards (moved)
    ├── market-data.client.ts   # NEW — GET /api/market-data/snapshot + resolveAny (chain sweep)
    ├── token-scan.pipeline.ts  # resolve() via market-data (moved shape, re-wired source)
    ├── address-detector.ts     # NEW — bare EVM/Solana detection + extractAddresses
    ├── forward-extractor.ts    # NEW — any-text candidates (addresses + exchange mentions)
    ├── rate-limiter.ts         # NEW — per-user sliding window (60 s)
    ├── chat-settings.ts        # settings model + repo ports + defaults (TypeORM NOT moved)
    ├── in-memory.repositories.ts # in-memory groups/settings (moved logic)
    ├── chat-settings.service.ts# getOrCreate/update/toggle (moved, in-memory wired)
    ├── context-resolver.service.ts # update -> CommandContext (moved)
    ├── command-handler.ts      # CommandHandler/CommandContext types (moved)
    ├── bare-address.handler.ts # NEW — non-slash fallback (extract -> scan-first)
    ├── command-router.service.ts # slash dispatch + fallback + per-user limit + tb callbacks
    ├── commands/               # start (REWRITTEN) + ca (NEW) + x/z/c/cc/tb/settings (inherited)
    ├── update-poller.service.ts# polling ingress (moved; active only in polling mode)
    ├── webhook.controller.ts   # POST /dexter/webhook (+secret, per-user limit) + POST /dexter/health
    └── dexter.controller.ts    # GET /dexter/token?address= (native HTTP lookup, manual QA)
```

Root files: `package.json` (`@onchain-bot/dexter-onchain-bot`), `nest-cli.json`,
`tsconfig.json` / `tsconfig.build.json` (paths `dexter/*`, `shared/*`, `src/*`),
`.env.example` + `.env.staging.template` + `.env.production.template`,
`docker-compose.yml` (dev) + `docker-compose.staging.yml`, `Dockerfile`
(`CMD apps/dexter-onchain-bot/dist/main.js`).

## MODULES

`DexterModule` (single module, no cross-BC imports by construction):

- Config: `DexterBotConfigService` (global via `ConfigModule`).
- Ingress: `DexterWebhookController` (webhook) + `UpdatePollerService`
  (polling; drops `deleteWebhook` first, offset-tracked loop).
- Routing: `CommandRouterService` (factory-built with all 9 handlers +
  `BareAddressHandler` fallback + shared `UserRateLimiter`).
- Scan: `MarketDataClient` → `TokenScanPipeline` (`SCAN_PIPELINE` token,
  `TokenScanPipeline` alias) → `MessageFormatterAdapter` +
  `TradeButtonRegistry` + `InlineKeyboardBuilder`.
- Settings: `InMemoryChatGroupRepository` /
  `InMemoryChatSettingsRepository` behind `CHAT_GROUP_REPOSITORY` /
  `CHAT_SETTINGS_REPOSITORY` symbols → `ChatSettingsService` →
  `ContextResolverService`.

Commands: `/start` (rewritten: lookup info + usage, zero publish words),
`/ca` (new: full card), `/x` full, `/z` compact, `/c` chart+scan, `/cc`
chart-only, `/tb` trade-button config (+ `tb:toggle:` callbacks), `/help`,
`/settings` view. Bare contract (no slash) and any forward/free text go
through `BareAddressHandler`: first extracted contract is scanned;
text with no contract gets the "no veo ningún contrato" reply.

## ENV INVENTORY

| Variable                                                             | Default                                 | Meaning                                      |
| -------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------- |
| `DEXTER_ENABLED`                                                     | `false`                                 | master switch                                |
| `DEXTER_PORT` / `DEXTER_HOST`                                        | `4060` / `127.0.0.1`                    | bind (triplet 4060/4061/4062)                |
| `DEXTER_BOT_TOKEN`                                                   | `''`                                    | lookup bot token (wins over legacy)          |
| `CHAIN_DEXTER_BOT_TOKEN`                                             | `''`                                    | legacy fallback (deprecated, honored)        |
| `DEXTER_WEBHOOK_SECRET/URL`                                          | —                                       | webhook auth + registration                  |
| `DEXTER_INGEST_MODE`                                                 | `polling`                               | `webhook` (staging/prod) or `polling` (dev)  |
| `DEXTER_POLLING_INTERVAL_MS`                                         | `1000`                                  | poller cadence (min 100)                     |
| `MARKET_DATA_URL` / `MARKET_DATA_API_KEY` / `MARKET_DATA_TIMEOUT_MS` | `http://localhost:4000` / `''` / `2000` | ONLY market-data source                      |
| `DEXTER_RATE_LIMIT_PER_USER`                                         | `30`                                    | per-user commands per 60 s                   |
| `DEXTER_DEFAULT_TRADE_BUTTONS`                                       | `DEX,PHO,TRO`                           | default button set                           |
| `DATABASE_URL`                                                       | `…/onchain_bot_dexter`                  | RESERVED (v1 is in-memory; no TypeORM wired) |
| `REDIS_URL`                                                          | `…/6387/0`                              | RESERVED (limiter is in-process)             |

## PORTS

C-PORTS-01 triplet: dev `:4060` / staging host `:4061`→container `:4060` /
prod host `:4062`→container `:4060`. Verified free with
`lsof -i :4060 -i :4061 -i :4062` (empty) before first boot. Dev compose
DBs: postgres `:5440` (`onchain_bot_dexter`), redis `:6387`; staging:
`:5441` (`onchain_bot_dexter_staging`), `:6388` — all verified free
repo-wide by grep. Compose `name:` is explicit (`onchain-bot-dexter`,
`onchain-bot-dexter-staging`) so dev/staging never recreate each other.

## HEALTH

- `GET /api/health` → `{ status: 'ok', service: 'dexter-onchain-bot' }`
  (Docker HEALTHCHECK + staging healthcheck probe it via node).
- `POST /dexter/health` → `{ status: 'ok', ingestMode }`.
- `GET /dexter/token?address=` → resolved card + `text`, or
  `{ error: 'Token not found' }` (market-data down/pending → error, never
  a partial card).

## SECURITY

- Webhook secret: `DEXTER_WEBHOOK_SECRET` enforced when set (unsigned
  webhook accepted in dev only, with a warn).
- Rate limit: per-user sliding window (`DEXTER_RATE_LIMIT_PER_USER`/60 s)
  in the router (all paths) AND again at the webhook edge; over-budget
  updates are acked without dispatch.
- No secrets in logs: token never logged; `MARKET_DATA_API_KEY` sent as
  `x-api-key` header only.
- Lookup-only: no channel ids, no publish calls, no scoring/tracking —
  grep `publish|score|track` in `src/` hits only comments/docs.

## TS CONVENTIONS

Strict flags from `tsconfig.base.json` (`strictNullChecks`,
`noImplicitAny`, …); `singleQuote: true` everywhere (Prettier);
`emitDecoratorMetadata` + `experimentalDecorators` (Nest DI). Rule
learned the hard way (two failed boots): constructor-injected
dependencies MUST be value imports — `import type` erases the
design:paramtypes metadata and Nest throws UnknownDependenciesException
at boot. Type-only imports are fine for interfaces/DTOs in non-injected
positions.

## TESTS

Jest (`testRegex .*\.spec\.ts$`, `--forceExit`, 30 s). 6 suites /
20 tests, failing-first (first run: 6 red — modules missing):

| Spec                                  | Covers                                                                                             |
| ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `address-detector.spec.ts`            | solana/evm/bare recognition, ordered deduped extraction                                            |
| `forward-extractor.spec.ts`           | forward-ok (address + exchange), forward-empty, blank                                              |
| `rate-limiter.spec.ts`                | per-user budget + independence                                                                     |
| `commands/start-ca.spec.ts`           | /start rewritten (lookup, /ca, no publish/channel words); /ca card + usage + explicit unresolvable |
| `command-router-bare-forward.spec.ts` | bare scan, forward-ok scan, forward-empty reply, unknown slash                                     |
| `commands/settings.spec.ts`           | /settings render, /tb on/off                                                                       |

## GAPS

1. Market-data returns pending shells (nulls) until its todo-3
   aggregators land — live scans resolve only via mocked/stubbed data
   today; the explicit-error path is the production behavior meanwhile.
2. Chat settings are in-memory: a restart loses `/tb` customization
   (same as backend with `DATABASE_ENABLED=false`); the
   `onchain_bot_dexter[_staging]` DBs are provisioned but unwired.
3. `resolveAny` sweeps 6 chains sequentially (6 × timeout worst case);
   add a detect-chain edge or parallel sweep when p95 matters.
4. No e2e against a live bot token (unit specs + manual `GET
/dexter/token` only); needs a sandbox bot before staging.
5. No dexter deploy workflow / CI job yet (same as market-data staging
   state: compose files are DRY-RUN).

## DECISIONS

- P13: standalone `apps/dexter-onchain-bot/` (extraction, not integration).
- Token migration: `DEXTER_BOT_TOKEN` wins, `CHAIN_DEXTER_BOT_TOKEN`
  fallback (C-BOTS-01).
- Bridge default-true: market-data HTTP is the only source (no local
  cascade — unlike the backend dual-run).
- Dev ingest default `polling` (backend default was webhook).
- `/c` + `/cc` link DexScreener directly (pool-address field dropped —
  snapshots carry no pool detail).
- Affiliate tags rebranded `dexter-*` (were `chaindexter`).
- No root `dev:dexter` script: task constraint (read-only outside the
  app dir) wins over the setup checklist — documented here instead.

## NOTES

- Backend `chain-dexter-bot/` is the read-only move source: do NOT edit
  it here; deprecate/remove only at the FINAL REVIEW (C4-bis).
- Staging/prod compose + env templates are DRY-RUN (no deploy workflow,
  nothing applied to Oracle — operator confirms paths/ports with lsof).
- `.kiro/` left alone per task constraint.
