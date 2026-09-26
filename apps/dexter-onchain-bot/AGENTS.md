# apps/dexter-onchain-bot/ — NestJS Knowledge Base

> Verified 2026-09-25 against code + `.omo/evidence/task-13-mega-refactor-market-data.log`
> (Tramo 3, todo 13, follow-up of todo 9, P13). v0.1.0 (source of truth: `package.json`).
> Decisions cited as Pxx come from `.omo/drafts/mega-refactor-tramos.md`
> §7.6. Contracts pinned in `.omo/plans/mega-refactor-central.md`
> v2026-09-24 (C-PORTS-01, C-DB-01, C-BOTS-01); plan in
> `.omo/plans/mega-refactor-market-data.md` (todo 13, hexagonal split).

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
├── dexter.module.ts            # single composition root (see MODULES; avoids commands ⇄ telegram forwardRef cycles)
├── health/                     # GET /api/health -> { status: 'ok', service }
├── commands/                   # router + handlers (slash + bare fallback)
│   ├── domain/ports/command-handler.port.ts # CommandHandler/CommandContext types
│   └── application/
│       ├── router/command-router.service.ts # slash dispatch + fallback + per-user limit + tb callbacks
│       ├── context/context-resolver.service.ts # update -> CommandContext
│       ├── rate-limit/user-rate-limiter.ts  # per-user sliding window (60 s)
│       └── handlers/       # start/help (REWRITTEN) + ca (NEW) + x/z/c/cc/tb/settings (inherited) + bare-address fallback
├── scan/                       # pipeline + detector + extractor
│   ├── domain/
│   │   ├── ports/scan-pipeline.port.ts # ScanPipeline + ResolvedToken + ChainIdentifier + SCAN_PIPELINE
│   │   ├── detector/address-detector.ts# bare EVM/Solana detection + extractAddresses
│   │   └── extractor/forward-extractor.ts # any-text candidates (addresses + exchange mentions)
│   ├── application/pipeline/token-scan.pipeline.ts # resolve() via market-data (re-exports port types)
│   └── infrastructure/
│       ├── market-data/market-data.client.ts # NEW — GET /api/market-data/snapshot + resolveAny (chain sweep)
│       └── formatter/message-formatter.ts    # full/compact cards, 4096 cap (moved)
├── telegram/                   # poller + webhook + client + keyboard + registry
│   ├── domain/ports/telegram.port.ts # Bot API shapes (updates, messages, keyboards, responses)
│   ├── application/poller/update-poller.service.ts # polling ingress (active only in polling mode)
│   ├── api/http/
│   │   ├── webhook.controller.ts # POST /dexter/webhook (+secret, per-user limit) + POST /dexter/health
│   │   └── dexter.controller.ts  # GET /dexter/token?address= (native HTTP lookup, manual QA)
│   └── infrastructure/
│       ├── telegram/bot-client.ts# Bot API client (lookup answers only; re-exports domain port types)
│       └── keyboard/
│           ├── trade-button-registry.ts # 8 buttons (affiliate tags rebranded dexter-*)
│           └── inline-keyboard.builder.ts # scan + trade-button keyboards
└── settings/                   # chat config + bot config
    ├── domain/chat-settings.ts # settings model + repo ports + defaults (TypeORM NOT moved)
    ├── application/chat-settings.service.ts # getOrCreate/update/toggle (in-memory wired)
    └── infrastructure/
        ├── config/bot.config.ts# DEXTER_BOT_TOKEN (+ CHAIN_DEXTER_* fallback), ingest mode, rate limit
        └── repositories/in-memory.repositories.ts # in-memory groups/settings
```

Root files: `package.json` (`@onchain-bot/dexter-onchain-bot`), `nest-cli.json`,
`tsconfig.json` / `tsconfig.build.json` (paths `shared/*`, `src/*`),
`.env.example` + `.env.staging.template` + `.env.production.template`,
`docker-compose.yml` (dev) + `docker-compose.staging.yml`, `Dockerfile`
(`CMD apps/dexter-onchain-bot/dist/main.js`).

## MODULES

`DexterModule` (single composition-root module over the 4 sub-BC
folders — deliberately NOT one Nest module per sub-BC: the poller and
webhook in telegram depend on the router in commands, while the
handlers in commands depend on the client/keyboards/registry in
telegram, so nested modules would need `forwardRef` cycles for zero
behavioral gain; per-BC modules remain future work):

- settings/: `DexterBotConfigService` (global via `ConfigModule`) +
  `InMemoryChatGroupRepository` / `InMemoryChatSettingsRepository`
  behind `CHAT_GROUP_REPOSITORY` / `CHAT_SETTINGS_REPOSITORY` symbols →
  `ChatSettingsService` → commands' `ContextResolverService`.
- telegram/: `DexterWebhookController` (webhook) +
  `UpdatePollerService` (polling; drops `deleteWebhook` first,
  offset-tracked loop) + `TelegramBotClient` + `TradeButtonRegistry` +
  `InlineKeyboardBuilder` + `DexterController` (native HTTP lookup).
- commands/: `CommandRouterService` (factory-built with all 9 handlers
  - `BareAddressHandler` fallback + shared `UserRateLimiter`).
- scan/: `MarketDataClient` → `TokenScanPipeline` (`SCAN_PIPELINE`
  token, now defined in the scan domain port and re-exported by
  `DexterModule`; `TokenScanPipeline` alias) → `MessageFormatterAdapter`
  - scan domain detector/extractor (pure functions).

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
20 tests, failing-first (first run: 6 red — modules missing).
Todo 13 moved every spec with its source — counts unchanged (±0):

| Spec                                                              | Covers                                                                                             |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `scan/domain/detector/address-detector.spec.ts`                   | solana/evm/bare recognition, ordered deduped extraction                                            |
| `scan/domain/extractor/forward-extractor.spec.ts`                 | forward-ok (address + exchange), forward-empty, blank                                              |
| `commands/application/rate-limit/user-rate-limiter.spec.ts`       | per-user budget + independence                                                                     |
| `commands/application/handlers/start-ca.spec.ts`                  | /start rewritten (lookup, /ca, no publish/channel words); /ca card + usage + explicit unresolvable |
| `commands/application/router/command-router-bare-forward.spec.ts` | bare scan, forward-ok scan, forward-empty reply, unknown slash                                     |
| `commands/application/handlers/settings.spec.ts`                  | /settings render, /tb on/off                                                                       |

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
- Flat layout (follow-up of todo 13, no behavior change): the
  `src/dexter/` level is gone — `commands/`, `scan/`, `settings/` were
  lifted to `src/` top level via `git mv`, `telegram-io/` renamed to
  `src/telegram/` (no `-io` suffix), and `dexter.module.ts` moved to
  `src/dexter.module.ts` (still the single composition root wired by
  `AppModule` — no nested Nest modules, commands ⇄ telegram would
  `forwardRef`-cycle). All imports re-pointed (sibling BCs moved
  together, so `../../../` cross-BC relative depth is unchanged);
  the unused `dexter/*` path alias + jest mapper entry were dropped.
  Verified: jest 6/20 (±0), `tsc --noEmit` clean, `nest build` ok,
  boot `:4060` route diff empty (4 routes + spot curls identical).
- Todo 13 (hexagonal split, no behavior change): flat `src/dexter/`
  (lift-and-shift from todo 9) split into `commands/` (router+handlers),
  `scan/` (pipeline+detector+extractor), `telegram/`
  (poller/webhook/client/keyboard/registry), `settings/` — each with
  `domain/` ports, `application/` use-cases/services, `infrastructure/`
  adapters (+ `api/` HTTP where it owns routes). Two new domain ports:
  `scan/domain/ports/scan-pipeline.port.ts` (`ScanPipeline` +
  `ResolvedToken` + `ChainIdentifier`, decoupled from the telegram
  `ChainId`) and `telegram/domain/ports/telegram.port.ts` (Bot API
  shapes; the client re-exports them). `DexterModule` stays the single
  composition root (no nested Nest modules — commands ⇄ telegram
  would `forwardRef`-cycle). Verified: jest 6/20 (±0), `tsc --noEmit`
  clean, `nest build` ok, boot `:4060` route diff empty (4 routes +
  spot curls identical).
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
