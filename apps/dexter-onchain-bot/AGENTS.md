# apps/dexter-onchain-bot/ — NestJS Knowledge Base

> Verified 2026-09-26 against code + `.omo/evidence/task-6-telegram-bots-gateway.log`
> (telegram-bots-gateway todo 6: lookup via gateway, dual-send parity).
> Tramo 3 base verified 2026-09-25 (todo 13). v0.1.0 (source of truth: `package.json`).
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
npm test                     # jest --forceExit (23 suites / 74 tests)
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
├── main.ts                     # bootstrap() — DEXTER_PORT ?? 4060, host 0.0.0.0 default, ValidationPipe
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
│   ├── application/pipeline/token-scan.pipeline.ts # resolve() + resolveDetailed() via market-data (detect-first, format-narrowed sweep, explicit ambiguous/invalid; re-exports port types)
│   └── infrastructure/
│       ├── market-data/market-data.client.ts # NEW — GET /api/market-data/snapshot + GET /api/v1/chains/detect (chain-detect hint; resolveAny first-hit sweep REMOVED — silent-guess path, replaced by the pipeline collect-all)
│       └── formatter/message-formatter.ts    # full/compact cards, 4096 cap (moved)
├── telegram/                   # poller + webhook + ingress + client + keyboard + registry
│   ├── domain/ports/telegram.port.ts # Bot API shapes (updates, messages, keyboards, responses)
│   ├── domain/ports/bots-gateway-sender.port.ts # vault-id-only send port (todo 6, no token crosses)
│   ├── application/poller/update-poller.service.ts # polling ingress (active only in polling mode)
│   ├── application/services/dual-send-parity.service.ts # outcome-only ledger + 409 cutover gate (todo 6)
│   ├── application/use-cases/migrate-bots-to-gateway.use-case.ts # env token → vault register (todo 6)
│   ├── api/http/
│   │   ├── webhook.controller.ts # POST /dexter/webhook (+secret, per-user limit) + POST /dexter/health
│   │   ├── ingress.controller.ts # POST /dexter/ingress (gateway fan-out target, todo 6)
│   │   ├── gateway-migration.controller.ts # POST /api/dexter-bots/migrate-to-gateway (todo 6)
│   │   └── dexter.controller.ts  # GET /dexter/token?address= (native HTTP lookup, manual QA)
│   └── infrastructure/
│       ├── gateway/            # HMAC signer + vault-id mapping + send client + send-mode (todo 6)
│       ├── telegram/bot-client.ts# Bot API client (DEPRECATED direct leg; dual router, todo 6)
│       └── keyboard/
│           ├── trade-button-registry.ts # 8 buttons (affiliate tags rebranded dexter-*)
│           └── inline-keyboard.builder.ts # scan + trade-button keyboards
└── settings/                   # chat config + bot config
    ├── domain/chat-settings.ts # settings model + repo ports + defaults (TypeORM NOT moved)
    ├── application/chat-settings.service.ts # getOrCreate/update/toggle (in-memory wired)
    └── infrastructure/
        ├── config/bot.config.ts# DEXTER_BOT_TOKEN (+ CHAIN_DEXTER_* fallback), ingest mode, rate limit + gateway fields (todo 6)
        └── repositories/in-memory.repositories.ts # in-memory groups/settings
```

Root files: `package.json` (`@onchain-bot/dexter-onchain-bot`), `nest-cli.json`,
`tsconfig.json` / `tsconfig.build.json` (paths `@/*`, `shared/*`, `src/*`),
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

| Variable                                                                     | Default                                 | Meaning                                                                       |
| ---------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------- |
| `DEXTER_ENABLED`                                                             | `false`                                 | master switch                                                                 |
| `DEXTER_PORT` / `DEXTER_HOST`                                                | `4060` / `0.0.0.0`                      | bind (triplet 4060/4061/4062; dev may pin 127.0.0.1)                          |
| `DEXTER_BOT_TOKEN`                                                           | `''`                                    | lookup bot token (wins over legacy — direct-leg credential only since todo 6) |
| `CHAIN_DEXTER_BOT_TOKEN`                                                     | `''`                                    | legacy fallback (deprecated, honored)                                         |
| `DEXTER_BOT_VAULT_ID`                                                        | `''`                                    | gateway vault id for this bot (todo 6; set by hand after migration)           |
| `DEXTER_SEND_MODE`                                                           | `dual`                                  | `direct` (deprecated) \| `dual` (both legs + parity) \| `gateway` (cutover)   |
| `BOTS_GATEWAY_URL` / `BOTS_GATEWAY_CLIENT_ID` / `BOTS_GATEWAY_CLIENT_SECRET` | `http://localhost:4070` / `''` / `''`   | gateway base + HMAC client (empty = keyless/unsigned dev)                     |
| `DEXTER_INGRESS_SECRET`                                                      | `null`                                  | shared secret for `POST /dexter/ingress` (empty = unsigned dev)               |
| `DEXTER_WEBHOOK_SECRET/URL`                                                  | —                                       | webhook auth + registration                                                   |
| `DEXTER_INGEST_MODE`                                                         | `polling`                               | `webhook` (staging/prod) or `polling` (dev)                                   |
| `DEXTER_POLLING_INTERVAL_MS`                                                 | `1000`                                  | poller cadence (min 100)                                                      |
| `MARKET_DATA_URL` / `MARKET_DATA_API_KEY` / `MARKET_DATA_TIMEOUT_MS`         | `http://localhost:4000` / `''` / `2000` | ONLY market-data source                                                       |
| `DEXTER_RATE_LIMIT_PER_USER`                                                 | `30`                                    | per-user commands per 60 s                                                    |
| `DEXTER_DEFAULT_TRADE_BUTTONS`                                               | `DEX,PHO,TRO`                           | default button set                                                            |
| `DATABASE_URL`                                                               | `…/onchain_bot_dexter`                  | RESERVED (v1 is in-memory; no TypeORM wired)                                  |
| `REDIS_URL`                                                                  | `…/6387/0`                              | RESERVED (limiter is in-process)                                              |

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
  a partial card). Bare addresses need no chain qualifier (detect-first
  via chain-detect, else the format-narrowed solana-first sweep);
  ambiguity answers `{ error: 'Ambiguous address …', candidates }` and
  garbage answers `{ error: 'Invalid address: …' }` — explicit choice,
  never a silent guess.

## EXCLUSIVE GATEWAY + OWN SCAN CARD (feat/mega-refactor-tramos, DONE 2026-09-28)

Supersedes §GATEWAY MIGRATION dual regime above (kept for history):
dexter is now gateway-ONLY and owns its scan-card template.

- **Exclusive binding**: dexter binds its bot FROM the gateway
  inventory — `GET /api/dexter-bots/inventory` (vault bots +
  availability) → `POST /api/dexter-bots/bind { vaultId }`
  (link-as-target; locks one vault bot to `dexter-onchain-bot`, 409
  when another app holds it; records local `dexter` → vault mapping)
  → `POST /api/dexter-bots/unbind` (release; edit = unlink + relink).
  Creation stays on `POST /api/dexter-bots/migrate-to-gateway` (env
  token → vault). New: `telegram/application/
dexter-bot-binding.service.ts` + `telegram/api/http/
bot-binding.controller.ts` (wired in `DexterModule`). Frontend
  `/dexter` carries the bind UI (`DexterBotBindingSection`: create +
  inventory list + link/unlink, `ENDPOINTS.dexter`, same-origin
  `/dexter-api` → `:4060` dev / `:4061` staging / `:4062` prod).
- **Gateway-only sends**: `resolveDexterSendMode` always resolves
  `gateway` (stale `direct`/`dual` fall through); `TelegramBotClient`
  `.sendMessage` goes unconditionally to the inventory-bound vault bot
  (token never resolved client-side, direct leg retired);
  `reply_markup` degrades to text-only (gateway `SendDto` has none —
  scan cards carry DexScreener/GeckoTerminal links + trade hint; native
  keyboards return with gateway todo 7). Market-data HTTP remains the
  ONLY market-data source.
- **Own scan card** (`MessageFormatterAdapter.formatScanCard`,
  MarkdownV2): from `docs/examples-for-dexter/rick-bot-scanner.md`
  anatomy under the `format-comparison.md` decision
  (entities-parse, MarkdownV2-send) — header (`🔍 $SYMBOL | name —
chain` + contract code) + price/MC/liq + supplies (FDV +
  total/circulating/max) + holders/dev + links + trade hint; user
  strings MarkdownV2-escaped, 4096 cap. `/x` + `/ca` (+ bare fallback)
  send it via `sendFullScan` (no keyboard).
- **Evidence**: `.omo/evidence/dexter-exclusive.log` — jest + tsc +
  live (bind, exclusivity reject, scan card).
- **Known limits**: vault mapping in-memory (persisted at global
  cutover); keyboards text-only until gateway todo 7 covers
  `reply_markup`.

## GATEWAY MIGRATION (telegram-bots-gateway todo 6, DONE 2026-09-26)

Lookup answers via the gateway with dual-send parity (mirrors the
kol-system todo-4 / feed-publisher todo-5 pattern). Mode stays `dual` —
NO cutover in this todo (adversarial: any divergence blocks cutover via
`assertNoDivergence`).

- **Path** (`DEXTER_SEND_MODE`, default `dual`): `direct` = legacy
  direct Bot API only (deprecated); `dual` = gateway + direct, compare
  via `DualSendParityService`, return the direct leg; `gateway` =
  gateway vault id only, fail-closed (cutover rehearsal, proven live).
- **New code** (`src/telegram/`, all inside this app): `domain/ports/
bots-gateway-sender.port.ts` (token never crosses — vault `botId`
  only) + `infrastructure/gateway/` (`gateway-hmac-signer` — canonical
  `METHOD\npath\nts\nnonce\nsha256(rawBody)`, flat env
  `BOTS_GATEWAY_CLIENT_ID/_SECRET`, keyless dev returns `{}`;
  `gateway-send-client` — 4096-char message chunks with per-chunk
  `client_msg_id`, global `fetch`; `gateway-bot-mapping` — local
  `dexter` label → vault id, unmapped falls back; `send-mode` helper) +
  `application/services/dual-send-parity.service.ts` (outcome-only
  compare — `messageId`s never compared; keyboard/edit/callback shapes
  recorded as `skipped`, never diverged; `assertNoDivergence()` throws
  409; deviation: Nest `ConflictException`, this app owns no
  `src/shared/kernel/`) + `application/use-cases/
migrate-bots-to-gateway.use-case.ts` (env token → vault register,
  labels/ids only in results) + `api/http/
gateway-migration.controller.ts` (`POST
/api/dexter-bots/migrate-to-gateway`, 201) + `api/http/
ingress.controller.ts` (`POST /dexter/ingress`, 201 — gateway router
  fan-out target, `x-gateway-bot` + timing-safe `x-gateway-secret`
  vs `DEXTER_INGRESS_SECRET`, unsigned accepted with warn in dev only,
  dispatch errors acked).
- **Wiring**: `TelegramBotClient.sendMessage` routes by mode INSIDE the
  client, so all 9 handlers + the router keep calling it unchanged
  (lookup/scan/commands untouched otherwise). Plain-text sends run both
  legs in `dual`; keyboard sends (`reply_markup`) stay direct-only
  (gateway `SendDto` has no `reply_markup`) and are recorded as
  skipped; `editMessageText` / `answerCallbackQuery` / `getUpdates` /
  `setWebhook` have no gateway equivalent and stay direct-only.
  `gateway` mode is fail-closed without a vault id or for keyboard
  shapes — the catalog token is never resolved client-side. The direct
  client carries `@deprecated` (dual-leg only, removed at gateway
  todo 7). Backend `chain-dexter-bot/` move source untouched
  (read-only).
- **Operator wiring**: vault migration needs an `admin`-scoped gateway
  client (send scope alone 403s — same as todos 4/5); DISTINCT secrets
  per env. Staging/prod templates pin `DEXTER_SEND_MODE=gateway`.
- **Evidence**: `.omo/evidence/task-6-telegram-bots-gateway.log` —
  16 suites / 55 tests green (+10/+35), `tsc` + `nest build` clean,
  live dual `/start` (direct 401 vs gateway 777 — environmental
  divergence, gate correctly closed) + live keyboard `/tb` skip (no
  gateway call) + live gateway-mode `/help` 777 (token never resolved)
  - 0 token leaks.
- **Known cutover blockers** (gateway todo 7): keyboard sends
  (`reply_markup`), `editMessageText`, `answerCallbackQuery` need
  gateway support (or stay dual); vault mapping is in-memory
  (persisted at global cutover).

## SECURITY

- Webhook secret: `DEXTER_WEBHOOK_SECRET` enforced when set (unsigned
  webhook accepted in dev only, with a warn). Gateway ingress secret:
  `DEXTER_INGRESS_SECRET` enforced the same way on
  `POST /dexter/ingress` (todo 6).
- Gateway HMAC: `BOTS_GATEWAY_CLIENT_ID/_SECRET` sign every gateway
  request (canonical `METHOD\npath\nts\nnonce\nsha256(rawBody)`);
  empty = unsigned keyless dev (gateway guard fails open).
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

Jest (`testRegex .*\.spec\.ts$`, `--forceExit`, 30 s). 19 suites /
69 tests, failing-first (first run: 10 red — gateway modules missing).
Todo 13 moved every spec with its source — counts unchanged (±0);
todo 6 added 10 suites / 35 tests (±0 since); bare-address added
3 suites / 14 tests:

| Spec                                                                      | Covers                                                                                                                       |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `scan/domain/detector/address-detector.spec.ts`                           | solana/evm/bare recognition, ordered deduped extraction                                                                      |
| `scan/application/pipeline/token-scan-bare-address.spec.ts`               | bare solana/EVM via detect, detect-down sweep fallback, multi-chain ambiguous → null, garbage invalid, explicit chain intact |
| `scan/application/pipeline/token-scan-supply.spec.ts`                     | supply passthrough (client → token), null-supply resolve + N/A card, FDV + supply lines rendered                             |
| `scan/infrastructure/market-data/market-data-client-detect.spec.ts`       | detect-chain hit, non-ok → null, fetch throw → null (never throws)                                                           |
| `telegram/api/http/dexter-controller-bare.spec.ts`                        | resolved card, ambiguous candidates, invalid, not-found, missing-param explicit shapes                                       |
| `scan/domain/extractor/forward-extractor.spec.ts`                         | forward-ok (address + exchange), forward-empty, blank                                                                        |
| `commands/application/rate-limit/user-rate-limiter.spec.ts`               | per-user budget + independence                                                                                               |
| `commands/application/handlers/start-ca.spec.ts`                          | /start rewritten (lookup, /ca, no publish/channel words); /ca card + usage + explicit unresolvable                           |
| `commands/application/router/command-router-bare-forward.spec.ts`         | bare scan, forward-ok scan, forward-empty reply, unknown slash                                                               |
| `commands/application/handlers/settings.spec.ts`                          | /settings render, /tb on/off                                                                                                 |
| `telegram/infrastructure/gateway/gateway-hmac-signer.service.spec.ts`     | canonical sign/verify, tamper + wrong-secret reject, keyless `{}`                                                            |
| `telegram/infrastructure/gateway/gateway-bot-mapping.service.spec.ts`     | local→vault map + unmapped fallback                                                                                          |
| `telegram/infrastructure/gateway/gateway-send-client.service.spec.ts`     | message post + chunking + empty/keyboard/401 fail-closed, no token in body/URL                                               |
| `telegram/infrastructure/gateway/send-mode.spec.ts`                       | mode parsing, dual default                                                                                                   |
| `telegram/application/services/dual-send-parity.service.spec.ts`          | outcome agreement, ok-mismatch → 409 gate, skipped never diverged                                                            |
| `telegram/application/use-cases/migrate-bots-to-gateway.use-case.spec.ts` | vault register + map, missing-token + duplicate + 403 paths                                                                  |
| `telegram/api/http/gateway-migration.controller.spec.ts`                  | 201 labels/ids-only shape                                                                                                    |
| `telegram/api/http/ingress.controller.spec.ts`                            | fan-out dispatch + secret rejects + error-ack + unsigned dev                                                                 |
| `telegram/infrastructure/telegram/bot-client-dual-send.spec.ts`           | dual/direct/gateway routing, vault resolution, keyboard skip, divergence gate                                                |
| `telegram/dual-send-secret-scan.spec.ts`                                  | vault-ids-only bodies, no console.\*, no direct token reads                                                                  |

## GAPS

1. Market-data returns pending shells (nulls) until its todo-3
   aggregators land — live scans resolve only via mocked/stubbed data
   today; the explicit-error path is the production behavior meanwhile.
2. Chat settings are in-memory: a restart loses `/tb` customization
   (same as backend with `DATABASE_ENABLED=false`); the
   `onchain_bot_dexter[_staging]` DBs are provisioned but unwired.
3. Bare lookup is detect-first + format-narrowed sweep (solana → [solana],
   EVM → [ethereum, base, bsc, arbitrum, polygon], detect winner ordered
   first): identity on 2+ chains answers ambiguous with candidates
   (explicit `chain:address` retry, never first-hit). The EVM sweep is
   sequential (5 × timeout worst case); parallelize when p95 matters.
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

- Holders + dev-wallet (2026-09-27, feat/mega-refactor-tramos):
  `ResolvedToken` carries `devWallets[]` + `devPctSupply` (market-data
  HTTP passthrough, null when absent). Full card renders a `Dev:` line
  (pct + top-3 wallets, `Dev: N/A` null-safe). Spec:
  `token-scan-dev.spec.ts`.
- Supply fields (2026-09-27, feat/mega-refactor-tramos): `ResolvedToken`
  carries `totalSupply` + `circulatingSupply` + `maxSupply` (market-data
  HTTP passthrough, null when the provider has none — never a partial
  card). The full Telegram card renders FDV (was already fetched, now
  formatted) + Total/Circulating/Max supply lines (`N/A` null-safe).
  `GET /dexter/token` returns them via the pipeline token spread.
- Backend `chain-dexter-bot/` is the read-only move source: do NOT edit
  it here; deprecate/remove only at the FINAL REVIEW (C4-bis).
- Staging/prod compose + env templates are DRY-RUN (no deploy workflow,
  nothing applied to Oracle — operator confirms paths/ports with lsof).
- `.kiro/` left alone per task constraint.
