# Changelog

All notable changes to `@onchain-bot/dexter-onchain-bot` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Dexter flat layout (follow-up of todo 13, no behavior change):**
  `src/dexter/` level removed — `commands/`, `scan/`, `settings/` lifted
  to `src/` top level via `git mv`, `telegram-io/` renamed to
  `src/telegram/` (no `-io` suffix), `dexter.module.ts` moved to
  `src/dexter.module.ts` (single composition root, still no nested Nest
  modules — commands ⇄ telegram would `forwardRef`-cycle). All imports
  re-pointed, `dexter/*` path alias + jest mapper entry dropped (unused),
  AGENTS.md paths updated. Suite counts unchanged (6 suites / 20 tests).
- **Hexagonal split by sub-BCs (Tramo 3, todo 13, follow-up of
  todo 9, P13):** flat `src/dexter/` (todo 9 lift-and-shift) split into
  four hexagonal sub-BCs with zero behavior change — `commands/`
  (router + handlers: slash dispatch, bare-address fallback, context
  resolver, per-user rate limiter), `scan/` (pipeline + address
  detector + forward extractor + market-data client + formatter),
  `telegram/` (poller, webhook + lookup controllers, Bot API client,
  trade-button registry, keyboard builder), `settings/` (chat-settings
  domain + service, bot config, in-memory repositories). Each sub-BC
  owns `domain/` ports, `application/` use-cases/services, and
  `infrastructure/` adapters (`telegram` also owns `api/` HTTP).
  Two new domain ports: `scan/domain/ports/scan-pipeline.port.ts`
  (`ScanPipeline` + `ResolvedToken` + `ChainIdentifier`, decoupled from
  the telegram `ChainId`) and
  `telegram/domain/ports/telegram.port.ts` (Bot API shapes,
  re-exported by the client). `src/` root keeps only
  `dexter.module.ts` (single composition root — nested Nest modules
  would `forwardRef`-cycle commands against telegram). Every spec
  moved with its source; suite counts unchanged (6 suites / 20 tests).
- **Verified:** `jest` 20/20 green (±0), `tsc --noEmit` clean,
  `nest build` ok, boot on `:4060` with empty route diff (4 routes:
  `GET /api/health`, `GET /dexter/token`, `POST /dexter/webhook`,
  `POST /dexter/health`) and identical spot curls (`/api/health` ok,
  `/dexter/health` polling, `/dexter/token` explicit errors,
  webhook `{ ok: true }`, unknown route 404).

### Added

- **Dexter onchain lookup bot extraction (Tramo 3, todo 9, P13):** new
  `apps/dexter-onchain-bot/` (`@onchain-bot/dexter-onchain-bot` v0.1.0)
  answering on-chain token scans over Bot API, fed exclusively by
  market-data HTTP (todo 5 bridge, default-true).
- **Setup:** `package.json` (NestJS 11, `@nestjs/axios` for the Bot API
  client), `nest-cli.json`, `tsconfig.json` / `tsconfig.build.json`
  (`shared/*`, `src/*` paths), `src/main.ts` (`DEXTER_PORT`,
  default dev `:4060`, loopback bind, global `ValidationPipe`),
  `AppModule` (Config + Health + Dexter), `GET /api/health`,
  `.env.example` + `.env.staging.template` + `.env.production.template`,
  `Dockerfile` (`CMD apps/dexter-onchain-bot/dist/main.js`, healthcheck
  on `/api/health`), dev + staging compose (explicit project names,
  `onchain_bot_dexter[_staging]` DBs, ports verified free: app
  4060/4061/4062, postgres 5440/5441, redis 6387/6388).
- **Moved from backend `chain-dexter-bot` (read-only source, untouched):**
  `CommandRouterService` + commands (`/x /z /c /cc /tb /settings`
  inherited) + `MessageFormatterAdapter` + `TradeButtonRegistry`
  (affiliate tags rebranded `dexter-*`) + `InlineKeyboardBuilder` +
  chat settings (model + in-memory repos + service, TypeORM NOT moved) +
  `ContextResolverService` + `TelegramBotClient` + `UpdatePollerService`
  - webhook controller (`POST /dexter/webhook`, secret + per-user limit).
- **New:** `/start` rewritten (lookup info + usage, no publish words),
  `/ca <contract>` full card, bare-address detection (no slash) +
  forward / free-text extraction (addresses + exchange mentions; kind
  resolved via market-data, never guessed) through `BareAddressHandler`,
  `MarketDataClient` (`GET /api/market-data/snapshot` + `resolveAny`
  chain sweep) backing `TokenScanPipeline.resolve`, per-user sliding
  window rate limit (router on all paths + webhook edge), native
  `GET /dexter/token?address=` lookup for manual QA.
- **Token migration (C-BOTS-01):** `DEXTER_BOT_TOKEN` wins,
  `CHAIN_DEXTER_BOT_TOKEN` honored as deprecated fallback.
- **Tests (failing-first, 6 suites / 20 tests green):** start, ca
  (card + usage + explicit unresolvable), bare, forward-ok,
  forward-empty, settings (`/settings` render, `/tb` on/off), plus
  address-detector, forward-extractor, and per-user rate-limiter units.
- **Verified:** `jest` 20/20 green, `tsc --noEmit` clean, boot on
  `:4060` with `curl` (`/api/health` ok, `/dexter/token` explicit
  error with market-data down, `/dexter/health` polling). No-token
  boot keeps HTTP up with bot ingress inactive (warn + poller skip).

### Constraints honored

- Lookup-only: no channel publishing, no scoring/tracking imports.
- Backend move source read-only; `.kiro/` untouched; no root scripts
  touched (no `dev:dexter` alias — documented in AGENTS.md instead).
