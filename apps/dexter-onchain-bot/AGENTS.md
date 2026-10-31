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
npm test                     # jest --forceExit (75 suites / 815 tests)
npm run seed:display-maps -- [--dry-run|--apply] [--file=<path>] [--allow-prod]
                             # manual DisplayMap seed (default DRY-RUN, never bootstrap)
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
├── dexter.module.ts            # single composition root (see MODULES; avoids commands ⇄ gateway forwardRef cycles)
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
├── gateway/                    # poller + webhook + ingress + client + keyboard + registry
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
├── templates/                  # message templates + display maps (MarkdownV2, {{double-brace}})
│   ├── domain/                 # MessageTemplate + DisplayMap entities/validators + repo ports (closed v1 command enum)
│   ├── application/            # DisplayResolverService (DISPLAY_RESOLVER) + PreviewTemplateUseCase
│   ├── infrastructure/
│   │   ├── persistence/        # TypeORM + in-memory repos (MESSAGE_TEMPLATE_REPOSITORY symbol, DisplayMapRepository token)
│   │   └── seed/              # message-template-seed.service.ts (7 templates/6 commands)
│   │                          # display-map-seed.{service,cli}.ts + data/display-maps.seed.json
│   │                          # (manual CLI, default dry-run, NOT a bootstrap hook)
│   └── api/http/               # message-templates + template-preview + display-maps controllers (management via HTTP API only)
├── placeholders/               # renderer + registry ({{key}} only, {% rejected)
│   ├── domain/placeholder-registry.ts # 22 base + 39 derived keys + per-command whitelist
│   ├── application/template-renderer.service.ts # TemplateRendererService (DISPLAY_RESOLVER-backed)
│   └── api/http/placeholders.controller.ts # placeholder catalog reference
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

`DexterModule` (single composition-root module over the 6 sub-BC
folders — deliberately NOT one Nest module per sub-BC: the poller and
webhook in gateway depend on the router in commands, while the
handlers in commands depend on the client/keyboards/registry in
gateway, so nested modules would need `forwardRef` cycles for zero
behavioral gain; per-BC modules remain future work):

- settings/: `DexterBotConfigService` (global via `ConfigModule`) +
  `InMemoryChatGroupRepository` / `InMemoryChatSettingsRepository`
  behind `CHAT_GROUP_REPOSITORY` / `CHAT_SETTINGS_REPOSITORY` symbols →
  `ChatSettingsService` → commands' `ContextResolverService`.
- gateway/: `DexterWebhookController` (webhook) +
  `UpdatePollerService` (polling; drops `deleteWebhook` first,
  offset-tracked loop) + `TelegramBotClient` + `TradeButtonRegistry` +
  `InlineKeyboardBuilder` + `DexterController` (native HTTP lookup).
- commands/: `CommandRouterService` (factory-built with all 9 handlers
  - `BareAddressHandler` fallback + shared `UserRateLimiter`).
- scan/: `MarketDataClient` → `TokenScanPipeline` (`SCAN_PIPELINE`
  token, now defined in the scan domain port and re-exported by
  `DexterModule`; `TokenScanPipeline` alias) → `MessageFormatterAdapter`
  - scan domain detector/extractor (pure functions). `MarketDataSnapshot`
    carries optional `launchpad? {id,name,url}` (shape-checked via
    `toLaunchpadOrNull`, else null) → `ResolvedToken.launchpad?` (Lane S;
    renderer derives `launchpadText/TextLink/Icon/IconLink` from it, null
    → all four `""`).
- templates/ + placeholders/: `MESSAGE_TEMPLATE_REPOSITORY` symbol →
  `TypeOrmMessageTemplateRepository` (`DATABASE_ENABLED=true`, own
  `DataSource`) or the shared `InMemoryMessageTemplateRepository`
  (`false`); `DisplayMapRepository` (abstract-class token, own token) →
  TypeORM/in-memory pair the same way; `DISPLAY_RESOLVER` →
  `DisplayResolverService` (`useExisting`, both modes — in-memory
  starts with an EMPTY display catalog so `{{chainDisplay}}` renders
  `""` until rows arrive via API, no reboot needed) +
  `TemplateRendererService` + `PreviewTemplateUseCase` +
  `MessageTemplateSeedService`. Seed runs `runOnce()` then `refresh()`
  in ONE `onApplicationBootstrap` (same-module hooks run
  concurrently — never split seed/warmup). No `forwardRef` anywhere
  (single root holds); every class-token ctor param carries an
  explicit `@Inject(X)` (import-elision guard, see TS CONVENTIONS).
- `DexterController GET /dexter/token?address=` also returns
  `templateUsed: { command, name, version } | null` (active `ca`
  template + clean render → rendered `text`; otherwise legacy
  text/scanCard + null; ambiguous/invalid/not-found shapes
  byte-identical, no `templateUsed` key). `POST /dexter/health`
  untouched.

Commands: `/start` (rewritten: lookup info + usage, zero publish words),
`/ca` (new: full card), `/x` full, `/z` compact, `/c` chart+scan, `/cc`
chart-only, `/tb` trade-button config (+ `tb:toggle:` callbacks), `/help`,
`/settings` view. Bare contract (no slash) and any forward/free text go
through `BareAddressHandler`: first extracted contract is scanned;
text with no contract gets the "no veo ningún contrato" reply.

> Message templates note (todos 1-13, DONE 2026-10-01): all command
> cards (`ca`/`x`/`z`/`c`/`cc`/bare) render from DB templates in
> MarkdownV2 with `{{double-brace}}` syntax (`{%` rejected; 22 base +
> 22 derived keys + `timeframe`), exactly 1 active template per command
> (partial unique index + in-memory guard). Keyboards abandoned on
> `c`/`cc` — chart-link-only text cards (no `reply_markup` until
> gateway todo 7 covers it; gateway `SendDto` has none). Management
> via HTTP API only (`POST /api/dexter/templates`,
> `/api/dexter/display-maps` CRUD, preview endpoints — no
> Telegram-side template editing in v1). Live precedent:
> feed-publisher prompt-templates (controller-first validation, 409
> guards). DISAMBIGUATION: `src/templates/` = Dexter bot message
> templates, NOT the future frontend-feed `templates` rename.

## ENV INVENTORY

| Variable                                                                     | Default                                  | Meaning                                                                                                                                                           |
| ---------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEXTER_ENABLED`                                                             | `false`                                  | master switch                                                                                                                                                     |
| `DEXTER_PORT` / `DEXTER_HOST`                                                | `4060` / `0.0.0.0`                       | bind (triplet 4060/4061/4062; dev may pin 127.0.0.1)                                                                                                              |
| `DEXTER_BOT_TOKEN`                                                           | `''`                                     | lookup bot token (wins over legacy — direct-leg credential only since todo 6)                                                                                     |
| `CHAIN_DEXTER_BOT_TOKEN`                                                     | `''`                                     | legacy fallback (deprecated, honored)                                                                                                                             |
| `DEXTER_BOT_VAULT_ID`                                                        | `''`                                     | gateway vault id for this bot (todo 6; set by hand after migration)                                                                                               |
| `BOT_USERNAME`                                                               | `''`                                     | white-label bot username for deep-links (todo 11; generic name on purpose, one value per env; `^[A-Za-z0-9_]{5,}$`, empty allowed — never a real username in git) |
| `DEXTER_SEND_MODE`                                                           | `dual`                                   | `direct` (deprecated) \| `dual` (both legs + parity) \| `gateway` (cutover)                                                                                       |
| `BOTS_GATEWAY_URL` / `BOTS_GATEWAY_CLIENT_ID` / `BOTS_GATEWAY_CLIENT_SECRET` | `http://localhost:4070` / `''` / `''`    | gateway base + HMAC client (empty = keyless/unsigned dev)                                                                                                         |
| `DEXTER_INGRESS_SECRET`                                                      | `null`                                   | shared secret for `POST /dexter/ingress` (empty = unsigned dev)                                                                                                   |
| `DEXTER_WEBHOOK_SECRET/URL`                                                  | —                                        | webhook auth + registration                                                                                                                                       |
| `DEXTER_INGEST_MODE`                                                         | `polling`                                | `webhook` (staging/prod) or `polling` (dev)                                                                                                                       |
| `DEXTER_POLLING_INTERVAL_MS`                                                 | `1000`                                   | poller cadence (min 100)                                                                                                                                          |
| `MARKET_DATA_URL` / `MARKET_DATA_API_KEY` / `MARKET_DATA_TIMEOUT_MS`         | `http://localhost:4000` / `''` / `10000` | ONLY market-data source (10s: cold fan-out ~2s, Telegram tolerates ~60s)                                                                                          |
| `DEXTER_RATE_LIMIT_PER_USER`                                                 | `30`                                     | per-user commands per 60 s                                                                                                                                        |
| `DEXTER_DEFAULT_TRADE_BUTTONS`                                               | `DEX,PHO,TRO`                            | default button set                                                                                                                                                |
| `DATABASE_URL`                                                               | `…/onchain_bot_dexter`                   | templates/display repos: TypeORM when `DATABASE_ENABLED=true`, in-memory when `false` (chat settings still in-memory)                                             |
| `REDIS_URL`                                                                  | `…/6387/0`                               | RESERVED (limiter is in-process)                                                                                                                                  |

## PORTS

C-PORTS-01 triplet: dev `:4060` / staging host `:4061`→container `:4060` /
prod host `:4062`→container `:4060`. Verified free with
`lsof -i :4060 -i :4061 -i :4062` (empty) before first boot. Dev compose
DBs: postgres single `:5432` (`onchain_bot_dexter`, consolidated 2026-09-28; standalone compose still `:5440`), redis `:6387`; staging:
`:5441` (`onchain_bot_dexter_staging`), `:6388` — all verified free
repo-wide by grep. Compose `name:` is explicit (`onchain-bot-dexter`,
`onchain-bot-dexter-staging`) so dev/staging never recreate each other.

## DEPLOY (dexter-deploy-and-frontend Wave 2 — staging provisioning fixed 2026-10-18; prod dormant)

- STATUS (2026-10-18): the staging deploy job now self-syncs the full repo
  tree before touching anything (provisioning fix mirroring
  `deploy-staging.yml`). Runs since 2026-10-11 always failed at "Ensure
  dexter staging databases running" — nothing had provisioned
  `/opt/onchain-bot-staging/apps/dexter-onchain-bot/` (compose file
  absent). The dexter staging stack itself was bootstrapped MANUALLY on
  2026-09-27 (old image, healthy); first rollout via the workflow DONE
  2026-10-18 — run 39127827233 GREEN (see RUN bullets below).
  `.env.staging` is operator-owned (confirmed present on Oracle
  2026-10-18; the sync excludes `.env*`). The prod workflow stays DORMANT
  until the master merge gate; `/opt/onchain-bot/apps/dexter-onchain-bot/`
  is CREATED by the prod sync on its first run (absent on Oracle today).
- RUN 39126203303 (first real rollout, 2026-10-18): provisioning steps
  ALL passed; aborted PRE-WRITE at the migration dry-run (`28P01`).
  Double root cause (evidence
  `.omo/evidence/task-dexter-run1-diagnosis.log`): (1) ALIAS COLLISION —
  the shared `onchain-bot-staging-net` has ~7 postgres containers
  claiming the `postgres` alias (Docker DNS round-robins; a one-off hit
  the wrong server); (2) CREDENTIAL DRIFT — the staging volume was
  initialized (2026-09-27) with the compose defaults (`onchain_bot`),
  while the operator `.env.staging` carries a different password (never
  exercised: the running app boots with `DATABASE_ENABLED` unset =
  in-memory mode). Fix: DB one-offs take an explicit `-e DATABASE_URL`
  with the UNIQUE container-name host (no `--env-file`); compose
  `DATABASE_URL`/`REDIS_URL` hosts are unique container names too (same
  class for `redis`). Owner note: realign or rotate the stale
  `.env.staging` credential in ONE coordinated change (volume + compose
  interpolation + workflow literal).
- RUN 39127374679 (second run, 2026-10-18): dry-run ✓ + `migration:run`
  ✓ — the DATABASE_URL fix works (4 migrations applied to
  `onchain_bot_dexter_staging`); then failed pulling the app image: the
  build was amd64-only while the Oracle host is aarch64 (`no matching
manifest for linux/arm64/v8`). Fixed same day: multi-arch build
  (setup-qemu + `linux/amd64,linux/arm64`, mirroring `deploy.yml`).
  Evidence: `.omo/evidence/task-dexter-run2-diagnosis.log`.
- RUN 39127827233 (third run, 2026-10-18): GREEN — first GOOD deploy
  (multi-arch build 4m14s → pull ✓ → recreate ✓ → healthcheck ✓ → pin
  `:staging-prev-dexter` written → smoke ✓). Live: container recreated
  (healthy), `DATABASE_ENABLED=true`, unique-host `DATABASE_URL`, seed
  `created=7 activeEnsured=6`. Evidence:
  `.omo/evidence/task-dexter-run3-green.log`.
- Rollback lane SIMULATED green (run 39130971794, throwaway branch
  `test/dexter-rollback-sim`, dispatch-only — never dev/master):
  pulled `:staging-prev-dexter` from GHCR → stop (grace 30) → local
  retag + recreate (no pull) → healthcheck ✓ (`healthy after ~20s`;
  downtime window 13s). Evidence:
  `.omo/evidence/task-dexter-rollbacksim.log`.
- Compose: `docker-compose.staging.yml` (staging `:4061`/`:5441`/`:6388`,
  DB `onchain_bot_dexter_staging`) + `docker-compose.prod.yml` (prod
  `:4062`/`:5448`/`:6395`, DB `onchain_bot_dexter`, `name:
onchain-bot-dexter-prod`, network `onchain-bot-net`). Prod ports verified
  free repo-wide by grep; operator confirms on Oracle with lsof (Wave 4 gate).
- Workflows: `.github/workflows/deploy-dexter-staging.yml` (push `dev`,
  tags `:sha` + `:staging-latest`, manual rollback lane) +
  `deploy-dexter-prod.yml` (push `master`, tags `:sha` + `:latest`,
  automatic rollback lane mirroring `deploy.yml`). Both build multi-arch
  (`linux/amd64,linux/arm64` via setup-qemu — Oracle hosts are aarch64;
  the original amd64-only note was corrected 2026-10-18 after run
  39127374679 died pulling on arm64), both own
  dexter paths only (anti-double-fire: disjoint from backend/frontend/
  ingestion workflows). Oracle lanes: `pg_dump` backup → precondition SELECT
  probe → `migration:run` in a throwaway `--target builder` one-off
  (Dockerfile `AS builder` verified — prod image untouched) → recreate →
  healthcheck (`:4061`/`:4062`) → pin `:staging-prev-dexter`/`:prev-dexter`.
- Secrets: `docs/deploy-secrets.md` (NAMES only; values live on the droplet).

## HEALTH

- `GET /api/health` → `{ status: 'ok', service: 'dexter-onchain-bot' }`
  (Docker HEALTHCHECK + staging healthcheck probe it via node).
- `POST /dexter/health` → `{ status: 'ok', ingestMode }`.
- `GET /dexter/token?address=` → resolved card + `text`, or
  `{ error: 'Token not found' }` (market-data down → error, never
  a partial card), or the pending shape
  `{ error: 'Token pending — retry shortly', address, pending: true }`
  (HTTP 200 — market-data answered a transient pending shell; copy
  differs from `Token not found` on purpose). Bare addresses need no chain qualifier (detect-first
  via chain-detect, else the format-narrowed solana-first sweep);
  multi-chain identity resolves best-pick (highest liquidity +
  `alternatives` disclosure, plan todo 17); zero-candidate ambiguity
  answers `{ error: 'Ambiguous address …', candidates }` and
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
  token → vault). New: `gateway/application/
dexter-bot-binding.service.ts` + `gateway/api/http/
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
- **New code** (`src/gateway/` — `src/telegram/` at todo-6 time, renamed todo 12 — all inside this app): `domain/ports/
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

| Spec                                                                     | Covers                                                                                                                       |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `scan/domain/detector/address-detector.spec.ts`                          | solana/evm/bare recognition, ordered deduped extraction                                                                      |
| `scan/application/pipeline/token-scan-bare-address.spec.ts`              | bare solana/EVM via detect, detect-down sweep fallback, multi-chain ambiguous → null, garbage invalid, explicit chain intact |
| `scan/application/pipeline/token-scan-supply.spec.ts`                    | supply passthrough (client → token), null-supply resolve + N/A card, FDV + supply lines rendered                             |
| `scan/infrastructure/market-data/market-data-client-detect.spec.ts`      | detect-chain hit, non-ok → null, fetch throw → null (never throws)                                                           |
| `gateway/api/http/dexter-controller-bare.spec.ts`                        | resolved card, ambiguous candidates, invalid, not-found, missing-param explicit shapes                                       |
| `scan/domain/extractor/forward-extractor.spec.ts`                        | forward-ok (address + exchange), forward-empty, blank                                                                        |
| `commands/application/rate-limit/user-rate-limiter.spec.ts`              | per-user budget + independence                                                                                               |
| `commands/application/handlers/start-ca.spec.ts`                         | /start rewritten (lookup, /ca, no publish/channel words); /ca card + usage + explicit unresolvable                           |
| `commands/application/router/command-router-bare-forward.spec.ts`        | bare scan, forward-ok scan, forward-empty reply, unknown slash                                                               |
| `commands/application/handlers/settings.spec.ts`                         | /settings render, /tb on/off                                                                                                 |
| `gateway/infrastructure/gateway/gateway-hmac-signer.service.spec.ts`     | canonical sign/verify, tamper + wrong-secret reject, keyless `{}`                                                            |
| `gateway/infrastructure/gateway/gateway-bot-mapping.service.spec.ts`     | local→vault map + unmapped fallback                                                                                          |
| `gateway/infrastructure/gateway/gateway-send-client.service.spec.ts`     | message post + chunking + empty/keyboard/401 fail-closed, no token in body/URL                                               |
| `gateway/infrastructure/gateway/send-mode.spec.ts`                       | mode parsing, dual default                                                                                                   |
| `gateway/application/services/dual-send-parity.service.spec.ts`          | outcome agreement, ok-mismatch → 409 gate, skipped never diverged                                                            |
| `gateway/application/use-cases/migrate-bots-to-gateway.use-case.spec.ts` | vault register + map, missing-token + duplicate + 403 paths                                                                  |
| `gateway/api/http/gateway-migration.controller.spec.ts`                  | 201 labels/ids-only shape                                                                                                    |
| `gateway/api/http/ingress.controller.spec.ts`                            | fan-out dispatch + secret rejects + error-ack + unsigned dev                                                                 |
| `gateway/infrastructure/telegram/bot-client-dual-send.spec.ts`           | dual/direct/gateway routing, vault resolution, keyboard skip, divergence gate                                                |
| `gateway/dual-send-secret-scan.spec.ts`                                  | vault-ids-only bodies, no console.\*, no direct token reads                                                                  |

## GAPS

1. Market-data returns pending shells (nulls) until its todo-3
   aggregators land — live scans resolve only via mocked/stubbed data
   today; the explicit-error path is the production behavior meanwhile.
2. Chat settings are in-memory: a restart loses `/tb` customization
   (same as backend with `DATABASE_ENABLED=false`); the
   `onchain_bot_dexter[_staging]` DBs are provisioned but unwired.
3. Bare lookup is detect-first + format-narrowed sweep (solana → [solana],
   EVM → [ethereum, base, bsc, arbitrum, polygon, robinhood], detect winner ordered
   first): identity on 2+ chains resolves best-pick (highest liquidity,
   tiebreak higher FDV then first-seen — deterministic; `alternatives`
   disclose the rest, plan todo 17 — DELIBERATE reversal of the old
   never-first-hit rule). The EVM sweep is
   sequential (6 × timeout worst case); parallelize when p95 matters.
4. No e2e against a live bot token (unit specs + manual `GET
/dexter/token` only); needs a sandbox bot before staging.
5. Deploy workflows exist (staging + prod, Wave 2) and staging now
   self-provisions its tree (fix 2026-10-18); prod stays dormant until
   the master merge gate (prod tree absent on Oracle). No dexter CI job
   yet (same as market-data staging state).

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
  `scan/` (pipeline+detector+extractor), `gateway/`
  (poller/webhook/client/keyboard/registry), `settings/` — each with
  `domain/` ports, `application/` use-cases/services, `infrastructure/`
  adapters (+ `api/` HTTP where it owns routes). Two new domain ports:
  `scan/domain/ports/scan-pipeline.port.ts` (`ScanPipeline` +
  `ResolvedToken` + `ChainIdentifier`, decoupled from the telegram
  `ChainId`) and `gateway/domain/ports/telegram.port.ts` (Bot API
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
- Todo 12 (rename, zero behavior): `src/telegram/` → `src/gateway/`
  via `git mv` (transport centralization: poller + webhook + ingress +
  Bot API client + keyboards + registry are all gateway transport, so
  the folder now says what it is). `TelegramBotClient` class name,
  `telegram.port.ts` filename, and `infrastructure/telegram/` Bot API
  subfolder stay (legitimate Telegram names — only the BC root moved);
  all `@/telegram/` + `./telegram/` imports re-pointed, zero logic
  touched. Verified: `@/telegram/` grep 0, tsc + jest + build green,
  boot route diff empty.
- No root `dev:dexter` script: task constraint (read-only outside the
  app dir) wins over the setup checklist — documented here instead.
- Message templates (todos 1-13, DONE 2026-10-01): `src/templates/`
  (domain entities + ports, TypeORM + in-memory repos behind a
  `DATABASE_ENABLED` factory-switch, 3 migrations pending, seed 7
  templates/6 commands) + `src/placeholders/` (registry +
  `TemplateRendererService`) wired in `DexterModule`
  (`MESSAGE_TEMPLATE_REPOSITORY`, `DisplayMapRepository`,
  `DISPLAY_RESOLVER` → `DisplayResolverService` useExisting);
  seed-then-refresh in a single `onApplicationBootstrap`; commands
  served by templates (`ca`/`x`/`z`/`c`/`cc`/bare, keyboards
  abandoned — chart-link-only); closed v1 command enum; EmojiMap →
  DisplayMap rename (`{{chainDisplay}}`, route
  `/api/dexter/display-maps`); `GET /dexter/token` exposes
  `templateUsed`. Verified: jest 40/288 green, `tsc --noEmit` clean,
  double boot (`false` in-memory + `true` TypeORM) with
  display-via-API-no-reboot. `src/templates/` = Dexter bot message
  templates, NOT the future frontend-feed `templates` rename.
  Placeholder catalog contract (plan todo 15): `GET /api/dexter/placeholders/:command`
  returns entries alphabetically by `key` (registry `placeholdersFor`, locale-free byte order).

## NOTES

- Bot deep-link (plan todo 11, `botStartUrl`): derived key on
  EVERY command (`https://t.me/<username>?start=<address>`; no
  username → `""`; payload must match Bot API `start` rules
  (`[A-Za-z0-9_-]`, ≤64 chars — EVM 42 + Solana 44 fit — else `""`,
  never truncated). Identity resolves ONCE at bootstrap via
  `BotIdentityService` (`settings/`, sibling of the bot config —
  NOT `gateway/`, which is message transport): bound-vault profile
  (`GET /api/bots/:id/profile` `username`, plan todo 12 — vault id
  from the existing local `'dexter'` mapping + `DEXTER_BOT_VAULT_ID`
  fallback, same order as the sender; unmapped → zero network; the
  todo-11 inventory probe is deleted — inventory rows carry no
  `username` by design) → Bot API `getMe` with `DEXTER_BOT_TOKEN` (one fetch, 5 s timeout,
  token never logged) → `BOT_USERNAME` env → `""`. Warns (never
  throws) when env disagrees with a live source. `/start <payload>`
  runs the shared `address-detector` and answers the full card via
  the SAME `sendFullScan` as `/ca` (lookup `['ca']` — `start` is
  not a template command); bare/invalid `/start` is byte-identical
  legacy. No Mini App (`startapp`), no auto-trading, no new
  callbacks.

- Origin launchpad (2026-10-04, dexter-launchpad Lane S):
  `ResolvedToken.launchpad? {id,name,url}` (market-data detector
  origin, persists through graduation) + 4 derived keys
  (`launchpadText/TextLink/Icon/IconLink`; IconLink→Link fallback,
  null → `""`). DisplayMap dimension `launchpad` (emoji only,
  operator-seeded via API — 23 rows after the flap intake (plan todo
  44), no hardcoded seeds).
  Supported table with status flags: ratified R1
  `.omo/notepads/dexter-launchpad-r1.md` §§1-2 + §8 (source of truth;
  detector lives in market-data `src/provider/launchpad/`).

- Display-only launchpad name override (display-name lane): DisplayMap
  dimension `launchpadName` (`matchValue` = canonical `launchpad.id`,
  case-insensitive trim like the existing resolver; `display` = the
  operator-chosen name, e.g. `pump-fun` → `Pump`). The renderer
  centralizes `resolveLaunchpadDisplayName(launchpad, resolver)` and
  uses it everywhere the name surfaces (`launchpadText`,
  `launchpadTextLink` text, `launchpadIconLink` fallback text, `venue`
  - `venueLine` origin branch). Override wins; missing/whitespace
    display falls back to the detector `name` (never blank). Detector
    output, DB rows and `launchpad.id` never change (taste, not data).
    Example row (operator creates via UI/API when wanted, never
    auto-seeded by the app): `{placeholderKey:'launchpadName',
matchValue:'pump-fun', display:'Pump'}`. Committed catalog +
    manual CLI (plan todo 9, 2026-10-21):
    `src/templates/infrastructure/seed/data/display-maps.seed.json`
    ships `(chain,solana,🟣)` + `(launchpadName,pump-fun,Pump)` — the
    two rows that render `🟣 Solana @ Pump` with
    `{{chainDisplay}} {{chainName}}{{venueSuffixShort}}` — and
    `npm run seed:display-maps` applies them through the repository
    port (`--apply` writes; default is dry-run; existing pairs are
    skipped and display differences reported as `drift`, NEVER
    overwritten). The CLI is a separate entrypoint: it imports the
    JSON, sets `DEXTER_SEED_TEMPLATES=false` + `DEXTER_INGEST_MODE=webhook`
    before the context (no template seed, no second Telegram poller),
    aborts when `DATABASE_ENABLED=false`, and prints the redacted DB
    target. Nothing in the app runtime reads the seed file.

- Manual mint→launchpad overrides (plan todo 37): curated table
  `dexter_launchpad_overrides` (`mint` unique + `launchpad_id` +
  nullable `note` + `created_at`; migration
  `1791625023000-CreateDexterLaunchpadOverrides`) with admin CRUD
  `POST/GET /api/dexter/launchpad-overrides` (+ `GET /:id`,
  `DELETE /:id`, NO `PATCH` — delete+recreate by design). The
  pipeline consults the row FIRST (`resolveLaunchpad` in
  `token-scan.pipeline.ts`): a hit reports the curated slug with
  MAXIMUM precedence over the detector (even over a positive
  detection) + one `launchpad override hit` audit log per hit;
  delete (or no row) restores detector behavior byte-identically,
  and every store failure fails open to the snapshot value.
  `launchpad_id` must be one of the 23 detector slugs (unknown →
  400 + `valid` list); mint normalizes via the single
  `normalizeMint` (EVM → lowercase, Solana → exact base58;
  malformed → 400). The 23-slug catalog mirrors market-data
  `src/launchpad/domain/launchpad-table.ts` (dexter never imports
  market-data source) — INTAKE RULE: a new detector slug MUST land
  here in the same wave or override creation for it fails closed.
  Chain-agnostic by design (one row per mint, all chains).

- Number policy Rick-parity (plan todo 13): formatters emit NO `$`
  (money → compact K/M/B at 1 decimal trimmed at ≥1000 (`23.3K`/`7.9K`/
  `1.5B`; owner re-pin plan todo 64 2026-10-17 post research 58) and a
  nearest WHOLE integer below 1000 (`984`/`752`/`146`/`11`/`749`;
  re-pin plan todo 65 2026-10-18, SPEED evidence: Rick renders all four
  sub-1000 money samples whole and `10.85`→`11` discards truncation);
  supersedes the old up-to-2-dec rule `1.46B`/`30.22K`. Rounding
  carries the mantissa only, never the unit: `999.96K` → `1000K`
  (no roll to `1M`); below 1000 a whole rounding up to `1000`
  (`999.5`–`999.99…`) carries to `1K`, never a bare unit-less `1000`.
  `priceUsd` → adaptive `<1` fixed 8 decimals half-up, trailing zeros
  stripped (`0.00002434`, `0.00000075`; re-pin plan todo 66 2026-10-18,
  SPEED evidence: DS raw `0.0000007521` → Rick `0.00000075`,
  which discriminates the old 3-sig-figs rule; ultra-dust below 1e-8
  falls back to the legacy 3-sig-figs rule, never `0`) / `>=1` grouped
  max-2 `3,457`; percent → trimmed sign-only-when-negative
  `80%`/`-34.4%`, `-0` → `0%`; counts unchanged; `N/A` on null). `$` is
  literal body text where a style wants it (Proficy-style
  `MC: ${{marketCapUsd}}` → `$27.3K`; Rick-style bodies carry none).
  Raw `$` is valid MarkdownV2 (not in the reserved set — no escaping
  needed; the renderer escapes VALUES only, bodies travel raw).
  Legacy cap de significativos en precio adaptativo (plan todo 45):
  max-3-sig-figs half-up, trailing zeros stripped
  (`0.000002417035478` → `0.00000242`; `0.5`/`3,457` intact;
  zero/negative/NaN pass through) — SUPERSEDED by the 8-dp rule above
  for values ≥1e-8; retained ONLY as the <1e-8 dust fallback (never
  renders `0` for a non-zero price).

- Liquidity-ratio placeholder (plan todo 62): derived key
  `liquidityRatio` on EVERY command — Rick-parity `xN` multiplier
  value of the SERVED `fdvUsd ÷ liquidityUsd`, `N = Math.round(...)`
  (half-up, legacy `toFixed(0)` convention; round-vs-ceil is
  sample-indecidable, round is the pin). The value carries NO
  brackets — bracket composition is template-author-owned
  (`[{{liquidityRatio}}]` → `[x3]`; owner rev. 2026-10-17). Value
  escaped once like any other (no-op on `xN`); `""` when either side
  is absent, non-finite, ≤0 or the rounded `N < 1` — NEVER `N/A`
  nor `x0`
  (PERPS sample `Liq: 1.8K ⚠️` carries no bracket; low-liq markers
  out of v1 scope). Empty-value composition (plan todo 69):
  `[{{liquidityRatio}}]` renders `[x3]` with a value and NO bracket
  at all when empty — the renderer cleanup (`cleanupDanglingSeparators`)
  collapses empty `[]` pairs (same family as `[{{alternatives}}]` /
  `[{{chainDisplay}}]`), guarded so `[](...)` links are never touched.
  Pure renderer computation: no snapshot /
  market-data field, no network; the ratio mirrors the served FDV
  (incl. the todo-61 `dexscreener` fallback provenance). Samples:
  Chale `7.9K [x3]` (23300/7900), WENCAT-Rick `6.7K [x3]`
  (19100/6700). STEP-0 hostile review (todo 62): vol/liq, liq/fdv,
  floor/trunc, ATH-FDV numerators all refuted by samples; caveats
  documented in `.omo/evidence/task-fe-liquidity-ratio.log`.

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
- Staging stack live on Oracle since 2026-09-27 (manual bootstrap);
  replaced by the workflow-deployed image on 2026-10-18 (first GOOD
  deploy, run 39127827233; rollback lane sim green — see RUN bullets).
  Prod compose + env
  templates remain unapplied (prod dormant, Wave 4 gate — operator
  confirms `.env.production` + ports with lsof).
- `.kiro/` left alone per task constraint.

- Origin-aware venue line (plan todo 14): 4 renderer keys on every
  command — `chainName` (code table: solana→Solana, ethereum→Ethereum,
  bnb→BNB, bsc→BNB, base→Base, arbitrum→Arbitrum, polygon→Polygon,
  robinhood→Robinhood, unichain→Unichain; unlisted → `""`, never the
  raw slug), `venue` (launchpad known → its `name`, ignoring the DEX
  display entirely — no hybrids; else `DexDisplay + labels`),
  `venueTech` (always `DexDisplay + labels`, no origin override),
  `venueLine` (closed 4-branch: origin+tech-different → `<Origin> via
<Tech>`, origin-only → origin, tech-only → tech, none → `""`).
  `MarketDataSnapshot.venue? {dexId, labels}` (client shape-checked via
  `toVenueOrNull`) → `ResolvedToken.venue?` (pipeline re-validated,
  same double-validation as `launchpad`). `dexId` (`meteoradbc`) and
  `launchpad.id` (`meteora-dbc`) live in separate tables and are never
  mixed. Conway deviation (deliberate, pinned in `venue-display.ts`):
  origin-known tokens render the origin (`Bankr`) where Rick shows the
  tech (`Clanker V4`) — we know the origin via the detector, Rick only
  sees the DEX.

- FDV ATH from own history (plan todo 16): market-data
  `SnapshotHistoryRepository.findFdvAth(chain, address)` (read-only
  aggregate: max `quote.fdvUsd` + setting-row `createdAt`, malformed
  rows skipped; never mutates history/retention) → `AddressSnapshot.
fdvAth? {fdvUsd, at}` (read BEFORE the current row is persisted —
  strictly historical) → compat edge as flat `fdvAthUsd`/`fdvAthAt`
  → dexter `MarketDataSnapshot` (client shape-checked via
  `toFdvAthUsdOrNull`/`toFdvAthAtOrNull`) → `ResolvedToken.
fdvAthUsd?`/`fdvAthAt?` (pipeline re-validated, same double
  validation as `launchpad`/`venue`). Renderer: 2 keys on every
  command — `fdvAth` (money-compact, todo-13 policy, no `$`) +
  `fdvAthAgo` (compact age `9d/3d/5h/12m`, floored, sub-minute
  `0m`; `formatCompactAgeText` in `message-formatter.ts` — no seed
  ships an age formatter to reuse, this is the single home; future
  timestamps clamp to now). Cold-start (either null) → BOTH `""`
  — the current FDV is NEVER substituted as ATH (spec-pinned).
  RETENTION LIMIT: the janitor keeps the last 90d
  (`SNAPSHOT_HISTORY_RETENTION_DAYS`) — ATH is the max over
  surviving rows, NOT all time.

- Best-pick with disclosure (plan todo 17 — DELIBERATE REVERSAL of
  the never-first-hit invariant): the bare-address sweep used to
  answer `ambiguous` whenever 2+ chains resolved; it now picks the
  HIGHEST-liquidity candidate (tiebreak: higher FDV, then first-seen
  sweep order — deterministic; comparisons on RAW numbers, never
  formatted strings; `null` liquidity sorts weakest) and returns the
  token with `alternatives: {chain,address,liquidityUsd?}[]` (every
  OTHER resolved chain, same order rule — never self-lists).
  `ambiguous` survives ONLY for the zero-candidate path (message +
  `chain:address` hint byte-identical); `invalid`/`not-found`
  untouched. ACCEPTED RISK (pinned in `token-scan.pipeline.ts` too):
  a scam copy with the deepest pool could win the pick — mitigated
  by the always-attached disclosure (a resolved token is never
  returned without it) + the existing downstream checks. Renderer:
  derived key `{{alternatives}}` on every command (`Also on: bsc,
eth` — chain slugs as resolved, comma-space joined; `""` when ≤1
  chain). Ages: `formatCompactAgeText` now spans `w/mo/y`
  (thresholds, floored: <7d → `Xd`, <30d → `Xw` = 7d weeks, <365d
  → `Xmo` = 30d months, else `Xy` = 365d years; d/h/m rungs
  byte-identical to todo 16).

- Pending-vs-not-found split (plan todo 19a, robust-nulls S): the
  pipeline reads `MarketDataSnapshot.status` (already end-to-end —
  no replumbing) at the `hasIdentity` sites and gains the `pending`
  outcome variant. Chain-qualified: identity → resolved, pending
  shell → `pending`, client null (fetch throw / own-timeout) or
  ready-without-identity → `not-found` (frozen). Sweep: zero hits
  with ≥1 pending shell → `pending`; all client-null → `not-found`.
  `resolve()` still collapses `pending` to null (ACCEPTED: the bot
  keeps its generic reply; only `GET /dexter/token` + preview split
  the shapes). Wire contract PINNED:
  `{ error: 'Token pending — retry shortly', address, pending: true }`
  over HTTP 200 — never 429/202 bare; `not-found` byte-contract
  frozen. Preview maps 1:1 (`PreviewUnresolvedShape.pending?`,
  frontend `isPreviewUnresolved` renders the pending copy `Token data
pending for … — retry shortly`). `MARKET_DATA_TIMEOUT_MS` default
  is 10s (cold fan-out ~2s, Telegram tolerates ~60s — the old 2s
  truncated cold scans into `not-found`).

- Serve-stale pin-through, no background refresh (plan todo 19b1):
  market-data replays its newest ready row (24h bound) with
  `stale: true` + `staleAsOf` + `staleAgeMs` when its fan-out fails;
  the client validates the trio at the boundary (strict `true`,
  ISO-gated as-of, finite non-negative age; absent → fresh-shaped
  `false`/`null`/`null`) and the pipeline sets it on every
  `ResolvedToken` (explicit `false` on fresh — never `undefined`).
  `hasIdentity` resolution is untouched (stale rows carry identity,
  so they resolve); `resolve()` returns the stale token on the bot
  path unchanged. Preview passes the token through (address path +
  token-echo path — no use-case logic change); `GET /dexter/token`
  spreads it onto the card. Freshness honesty rides the bit alone:
  frontend badges stale replays (`Stale data from X ago`, preview +
  live editor) and never renders them as live. No refresh infra of
  any kind on this path (no cron/queue/timer/fire-and-forget) —
  the next request retries providers naturally.

- Identity provenance (plan todo 39): market-data tags every quote
  `identityProvenance` (`'market'` = providers/discovery pair side,
  `'metadata'` = on-chain Metaplex PDA as post-merge last resort,
  Solana-only, identity-only fill — numbers stay aggregator-owned).
  `MarketDataSnapshot.identityProvenance?` (client validates via
  `toIdentityProvenanceOrNull` — exact strings only, else null) →
  `ResolvedToken.identityProvenance?` (pipeline ALWAYS sets:
  wire value or `'market'` default for legacy silent answers;
  optional only so older literals compile). Renderer marks
  `metadata` names with a mandatory ` (unverified)` suffix on
  `{{name}}` (escaped once; empty names stay `N/A`, `{{symbol}}`
  stays raw — the name carries the badge). Preview, bot and
  frontend inherit the marked text through the render — no extra
  code on any surface (legacy `formatScanCard` fallback untouched,
  byte-identical).

- Tail-degraded pin-through (plan todo 41b, ONE decision): market-data
  tags every card `degraded` (true on any tail-extra timeout/skip).
  `MarketDataSnapshot.degraded?` (client validates via
  `toDegradedOrFalse` — strict `true` only, else false) →
  `ResolvedToken.degraded?` (pipeline ALWAYS sets, explicit `false`
  on full cards; optional only so older literals compile) → preview
  `token` echo (verbatim, no use-case change) → `GET /dexter/token`
  spread. Stale AND degraded are independent bits (a stale-degraded
  card carries both). Frontend badges it `Partial data` (preview +
  live editor, English per page convention).

- Pair-age placeholder (plan todo 63): derived key `age` on EVERY
  command renders the best-liquidity PAIR age from the snapshot's
  top-level ISO `pairCreatedAt` (market-data converts raw ms → ISO
  ONCE at `buildSnapshot`; dexter validates via the new
  `toPairCreatedAtOrNull` client guard → `ResolvedToken.pairCreatedAt?`
  via the `toResolvedToken` mapping). Formatter is the shared
  `MessageFormatterAdapter.formatCompactAgeText` — never forked:
  floored d/w/mo/y rungs, future timestamps clamp to `0m`,
  absent/empty/unparseable render `""` (cold-start honesty — never a
  guessed age). PAIR PROXY, never token deploy age: a migration
  (curve → AMM) under-reports (documented caveat both sides; the
  GeckoTerminal-only venue path carries honest `null`). Registry
  19→20 derived keys (42 keys for `ca|x|z|bare`, 43 for `c|cc`);
  catalog META `{type:'derived', nullable:true, example:'3d'}`. Zero
  new HTTP calls — the field rides the existing snapshot response.
  Samples: WENCAT pair `2026-10-13T12:01:14Z` → `4d`; SCRIP
  `2026-10-15T15:22:11Z` → `2d`. Specs:
  `template-renderer-age.spec.ts`,
  `market-data-client-pair-created-at.spec.ts`,
  `token-scan-venue.spec.ts` (passthrough) + registry counts.
  Evidence: `.omo/evidence/task-fe-age.log`.

- 🍯 honeypot row + venueSuffix + cleanup extension (plan todo 71,
  dexter lane; market-data leg 🍯 lives in ITS app): 2 new derived
  keys on EVERY command → 22 base + 22 derived (44 keys for
  `ca|x|z|bare`, 45 for `c|cc`). `honeypotLine` = `"\n🍯 " + core`
  SUFFIX mechanics (precedent: `venueLine` `""`=silencio +
  bounded suffix — NOT todo-62 packaging), `""` = full silence (no
  line). Input `ResolvedToken.honeypot?` =
  `{buy: number|null, sell: number|null, sim: 'ok'|'fail'|null}`
  (% 0-100) — client `toHoneypotOrNull` bounds-checks (finite 0-100
  - exact sim enum, violation → null, pattern `toVenueOrNull`) →
    pipeline re-validates in `toResolvedToken` (double validation).
    TOTAL matrix over (sim, buy, sell), gated on RAW values (never
    round-to-0-and-silence): `sim='fail'` → ALWAYS a row (minimum
    `SIM: FAIL`; sides → `SIM: FAIL ⋅ T: b/s`/`b/?`/`?/s`); `ok` →
    `SIM: OK ⋅ T: …`, exact 0/0 → silence ("no taxes + working round
    trip shows nothing"); `null` (Fase 1 external source) → `T: …`,
    JAMÁS a `SIM:` claim; silence ONLY (a) both sides EXACTLY 0 (any
    sim except fail) or (b) both absent with `sim !== 'fail'`.
    Unknown sides → `?`; `T: b/?` is Rick's own form, `T: ?/s` +
    one-sided `?` under ok/null are OUR extension (pinned in switch
    comment + spec names). Display: integer if integral (`3`, `0`),
    else ≤2-dec trim (`3.99`, `3.8`); a measured >0 collapsing at 2
    dec steps to 3 dec (`0.004`), below that `<0.001` — never `0`
    for measured >0; no `%`/money formatters (escapeV2 no-op on
    `🍯 ⋅ : / ?`). `venueSuffix` = `" @ X"`/`""` (escaped once;
    `venueLine` empty → `""`) — kills the v14 empty-line hole
    (`@` literals around an empty `{{venueLine}}` leave a bare
    `\n`). Cleanup extension (owner decision 2026-10-19): 7 new
    rules at the END of `cleanupDanglingSeparators` after the todo-69
    `[]` trio — (1) `[`]`` bracket-with-only-empty-code-span
trailing/leading/mid (same hspace semantics + `(?!\()` anti-link
guard); (2) orphan empty code span (trailing/leading/mid) with
lookarounds `(?<!\[)``(?!\])`keeping`[``](url)`byte-intact;
(3) line-end-only dangling`⇨`(mid-line/line-start`⇨`stays).
Launchpad-layout extension (2026-10-30, plan §10.15): a FOURTH trio
collapses the EMPTY ESCAPED pair`\[\]`(left by the body's static`\[{{fdvAthAgo}}\]`; the backslash inside the pair is invisible to the
raw `[]`trio) in the same three positions with the same hspace rules
and`(?!\()` guard, placed BEFORE the dangling-`⇨`rule so`FDV: 8.3K ⇨ \[\]`collapses to`FDV: 8.3K`; an escaped pair WITH
content (`\[7d\]`) is untouched.
Populated spans/brackets (`[x3]`, `` `x` ``, links) untouched.
Catalog META ×2 `{type:'derived', nullable:true, example}`;
count literals 42→44 / 43→45. Seeds NOT touched (row is opt-in
template text; v14 wiring = owner, snippet delivered in evidence,
NOT applied). Specs: `template-renderer-honeypot.spec.ts`(full
matrix) +`template-renderer-venue-suffix.spec.ts`+`market-data-client-honeypot.spec.ts`+`token-scan-honeypot.spec.ts`+ cleanup describe in`template-renderer.service.spec.ts`+ registry/age count pins.
Evidence:`.omo/evidence/task-fe-honeypot-research/
    dexter-lane.log`+`dexter-lane-snippets.md` (proposed v14
    snippets, not applied).

- `venueSuffixShort` (plan todo 73, display-only, 2026-10-21): opt-in
  derived key rendering `" @ " + texts.venue` — the SHORT venue
  (launchpad ORIGIN name when a launchpad is known, else the DEX
  display), escaped once on the composed string, `""` when
  `texts.venue === ''`. Accepts `launchpadForVenue` exactly like
  `venue`/`venueSuffix`, so the `launchpadName` DisplayMap override
  applies (`pump-fun` → `Pump`): `{{chainName}}{{venueSuffixShort}}`
  renders `Solana @ Pump` where `{{chainName}}{{venueSuffix}}`
  renders `Solana @ Pump via PumpSwap`; WITHOUT the override the
  detector name renders escaped (`Solana @ pump\.fun`). Purely
  display: no snapshot field, no pipeline change, no new HTTP, and
  `venueSuffix` stays byte-identical (regression-pinned). Registry
  now 22 base + 23 derived = 45 keys for `ca|x|z|bare` / 46 for
  `c|cc`; catalog META `{type:'derived', nullable:true, example:' @
Pump'}`. Specs: 6 tests in
  `template-renderer-venue-suffix.spec.ts` (whitelist+catalog,
  override, detector fallback, DEX-only fallback, silence,
  `venueSuffix` pin) + registry/age count pins. Verified
  `tsc --noEmit` clean, 73 suites / 793 tests green.

- Rick compact-card parity (2026-10-22, market-data + dexter): 6 new
  derived keys on EVERY command — `headerIcon` (launchpad icon link
  when present, else the chain DisplayMap emoji; both empty → `""`),
  `liquidityUsdSide` (`liquidityUsd / 2`, display-only; the core
  liquidity stays TOTAL — no contract change), `liquidityFlags`
  (`⚠️` when the one-side liquidity is `< $1,000`, `🔒` when
  `lockedLiquidityPercent + burnedPercent >= 50` and at least one is
  numeric; composed with ONE leading space, adjacent icons, no
  trailing space — ` ⚠️🔒` / ` 🔒` / ` ⚠️` / `""`), `honeypotBlock`
  (`"\n\n🍯 " + <same core as honeypotLine>`; `honeypotLine` stays
  byte-identical so existing templates are untouched), `ageSuffix`
  (`" ⋅ Age: "` + a static code span around the rendered age; `""`
  when age is empty → never a dangling `Age:` label), and `nameLink` (`[Name](botStartUrl)` or
  `Name` without a URL — PLAIN text since the owner correction
  2026-10-26; `**Name**` is not MarkdownV2 bold and leaked literally.
  Compose bold in a body as `[*{{name}}*]({{botStartUrl}})`). It reuses the `{{name}}` helper so the
  `(unverified)` suffix and the `N/A` default are identical, and no
  `[Name]()` is produced). Registry: 22 base + 29 derived = 51 keys
  for `ca|x|z|bare` / 52 for `c|cc`; `PLACEHOLDER_META` carries all
  six. `formatCompactAgeText` drops the weeks rung (7-29d now
  `Nd`; `30d+` stays `mo`, floors otherwise unchanged).
  `DEX_DISPLAY` gains `pancakeswap_v2`/`pancakeswap_v3`
  (`Pancakeswap V2`/`Pancakeswap V3`; the plain `pancakeswap` key is
  untouched). DisplayMap seed: the committed catalog now ships THREE
  rows — the two labels plus `(chain, bsc, 🟡)` — applied MANUALLY
  via `npm run seed:display-maps` (default dry-run; `--apply` writes,
  existing pairs skip, display differences are drift and are never
  overwritten). The BSC row is committed but NOT applied by the app at
  boot. No live verification claimed.

- Rick 1-hour row (2026-10-26, code + specs only — NO live
  verification): ONE composed derived key `market1hRow` on EVERY
  command, fed by four NEW optional snapshot fields — `volume1hUsd`,
  `priceChange1h`, `txns1hBuys`, `txns1hSells` (wire contract owned
  by the market-data lane). Reference row (docs:
  pricebot#reading-a-token-scan): `📈 1H: 159 ⋅ 1.7% 🅑 3 Ⓢ 5` =
  1h volume, 1h change, buys, sells; `📉` ONLY on a strictly
  negative change (zero and positive → `📈`). Composition reuses the
  shared formatters (`formatMoneyText`, `formatPercentText` — it
  ALREADY emits `%`, so none is appended — and `formatNumberText`
  for the counts). MONOSPACE (owner request 2026-10-26): every value
  rides its OWN MarkdownV2 code span and the numbers travel RAW inside
  the span (`MessageFormatterAdapter.codeV2Text`, NOT `escapeV2Text`: a
  `\.` inside a code entity prints its backslash). The static glue
  (`1H:`, `⋅`, `🅑`, `Ⓢ`) carries no V2 specials, so the row emits ZERO
  backslashes. Rendered shape:

  ```text
  📈 1H: `159` ⋅ `1.7%` 🅑 `3` Ⓢ `5`
  ```

  SILENCE (`""`) when ANY of the four is missing/non-finite
  (counts additionally `>= 0`) — never a half-empty row, never
  `N/A`: `volume === null || change === null || buys === null ||
sells === null → ''`. Client boundary `toFiniteNumberOrNull` /
  `toNonNegativeCountOrNull`; the pipeline passes the four through
  with explicit `null` when absent. The port fields are OPTIONAL
  (`?: number | null`) so the 25 existing `ResolvedToken` literals
  keep compiling — the same convention as
  `honeypot`/`pairCreatedAt`/`fdvAthUsd`. Registry: 22 base + 30
  derived = 52 keys for `ca|x|z|bare` / 53 for `c|cc`; catalog META
  example is the exact sample. Specs:
  `template-renderer-market-1h-row.spec.ts`,
  `market-data-client-market-1h.spec.ts`,
  `token-scan-market-1h.spec.ts` + registry/rick-card count pins.

- Holders top-5 row `👥 TH:` (2026-10-26, plan
  `.omo/plans/dexter-rick-compact-card.md` §10.5-§10.9 — code only,
  NO body edit, NO activation): ONE composed derived key
  `holderTopRow` on EVERY command, fed by the frozen wire contract
  `holderConcentration: { topPercents: number[]; top10Percent: number }
| null` (owned by market-data; Solana-only, so KODA/BSC renders
  silence on purpose). Registry: 22 base + 31 derived = 53 keys for
  `ca|x|z|bare` / 54 for `c|cc`; catalog META example carries the
  literal `\n\n` prefix (same encoding as `honeypotBlock`).
  **Value = `""` (silence) or `"\n\n👥 TH: " + payload`** — a BLANK
  line before the row (captured Rick layout: after the 1H row, §10.1b),
  same mechanics as `honeypotBlock`; silence leaves no label, no
  newline, no separator. **Payload**: per-holder percentages at 1
  decimal with the trailing zero KEPT (`2.0`, `4.3`), MONOSPACED
  (owner request 2026-10-26): each value in its own code span joined by
  `⋅`, ONE space, then the integer top-10 bracket whose V2 escapes stay
  OUTSIDE the span. Carried shape:

  ```text
  \n\n👥 TH: `4.3`⋅`3.3`⋅`2.8`⋅`2.3`⋅`1.8` \[`20%`\]
  ```

  **Bracket in
  displayed TENTHS**: `displayedTenths = Σ Math.round(p*10)`,
  `bracket = Math.max(Math.round(top10Percent), Math.ceil(displayedTenths
/ 10))` — the binary carry (`0.1+0.1+0.1+16.1+3.6` accumulates to
  `20.000000000000004`/`…007`) never prints 21, and the bracket is
  never below the printed sum. **Silence on ANY gap**: absent/null/
  malformed, empty `topPercents`, >5 entries, any non-finite or
  out-of-[0,100] value, or `sum(topPercents) > top10Percent + ε` —
  NEVER `N/A`, never a half row, never padding for <5 holders. The
  non-increasing ORDER rule (`p[i] >= p[i+1]`, ties valid) is
  enforced at the CLIENT boundary (§10.7), not by the renderer.
  `ε = 1e-9` percentage points,
  one constant per app (`HOLDER_SUM_EPSILON`), the same literal
  pinned in market-data's spec (no shared package). Boundary guards:
  `toHolderConcentrationOrNull` in the client (rejects arrays,
  non-array `topPercents`, >5, non-finite/out-of-range, non-increasing,
  `top10Percent` outside `[-ε, 100+ε]`, incoherent sum) → the
  pipeline re-validates in `toResolvedToken` (double validation,
  same as `honeypot`/`venue`; the field MUST stay declared in the
  inline structural type or it is silently dropped). The row emits
  exactly TWO backslashes (`\[`/`\]` around the bracket span); the
  numbers travel raw inside their spans. The legacy
  `{{top10HolderPercent}}` is a
  DIFFERENT metric (per-account, pool-inclusive) and is untouched.
  Specs: `template-renderer-holder-top-row.spec.ts`,
  `market-data-client-holder-concentration.spec.ts`,
  `token-scan-holder-concentration.spec.ts` + controller META
  completeness (`placeholders.controller.spec.ts`) + registry/age/
  rick-card count pins.

- Rick title status emoji `{{newTokenIcon}}` (2026-10-30; code only —
  NO body edit, NO activation; docs: pricebot#scan-icons
  "🆕 - token age under 15 minutes"): SEPARATE derived key on EVERY
  command so a body composes `{{newTokenIcon}}{{headerIcon}}` →
  `🆕💊` (launchpad icon-link) / `🆕🟡` (chain emoji). `headerIcon`
  stays byte-identical — the 🆕 is never folded into it. Age = the
  SAME best-liquidity PAIR ISO `pairCreatedAt` that `age` reads (no
  new wire field, no network; proxy caveat: a curve → AMM migration
  under-reports, so a mature token can read as new). Windows:
  `0 <= now - at < 15 * 60_000` → `🆕`; exactly 15m and older → `""`
  (the docs say "under 15 minutes"); absent/null/empty/unparseable →
  `""`; FUTURE timestamp → `""` (explicit guard — `{{age}}` clamps
  future to `0m`, which would falsely claim a brand-new pair). Raw
  emoji, no MarkdownV2 escaping, no surrounding space. Registry:
  22 base + 32 derived = 54 keys for `ca|x|z|bare` / 55 for `c|cc`;
  catalog META `{type:'derived', nullable:true, example:'🆕'}`.
  Spec: `template-renderer-new-token-icon.spec.ts` + registry/age/
  rick-card count pins.

- Launchpad (bonding-curve) SHORT layout (2026-10-30; code only — no
  body edit, no seed/DB change, no activation). Rick docs: "Tokens
  still on a launchpad bonding curve use a shorter layout: `🆕💊` -
  the launchpad headline drops `[FDV/24h change]`; `⏳ 45% @ Pump` -
  bonding progress, launchpad; There is no USD or Liq row, and `5M:`
  replaces `1H:`". SEVEN new derived keys on EVERY command, ALL
  self-silencing OFF curve, so ONE body can serve both layouts and an
  existing body that does not use them stays byte-identical.
  `headerIcon` already covers the `💊` half of `🆕💊` (the 🆕 comes
  from `newTokenIcon`).
  | Key | Off curve | On curve |
  | ------------------ | ------------------------------------------------ | --------------------------------------- |
  | `curveRow` | `""` | `\n⏳ [prog% ]@ Name` (name falls back to `bondingCurve.launchpadId`) |
  | `quoteSuffix` | `""` | `/<quoteSymbol>` or `""` |
  | `fdvChangeBracket` | `\[<fdvUsd>/<priceChange24h>\] ` (key owns the escapes; `""` when both unknown) | `""` |
  | `usdRow` | `\n💰 USD: <price>` in a code span (zero backslashes) | `""` |
  | `liqRow` | `\n💦 Liq: <one-side>` in a code span + `liquidityFlags` outside it | `""` |
  | `market5mRow` | ROW identical to `market1hRow` on `5M:`, lowered as a NEW line (`\n`) | same |
  | `marketRow` | `\n` + `market1hRow` row (bare row bytes identical) | `\n` + `5M:` row (byte-identical to `market5mRow`) |

  Wire contract (frozen, owned by market-data): top-level
  `bondingCurve?: { onCurve: boolean; launchpadId: string;
quoteSymbol: string | null; quoteMint: string | null;
progressPercent: number | null } | null` — `onCurve === true` means
  "verified on-chain, still on the curve". Boundary guard
  `toBondingCurveOrNull` (client) resolves the WHOLE object to `null`
  unless it is a non-array object with `onCurve === true`, a non-empty
  `launchpadId`, quote members absent/null or non-empty strings, and
  `progressPercent` absent/null or finite in `[0,100]`; the pipeline
  re-validates the same way in `toResolvedToken` (the field MUST stay
  declared in its inline structural type or it is silently dropped —
  same bug class as `holderConcentration`). Four new optional 5m wire
  fields (`volume5mUsd`, `priceChange5m`, `txns5mBuys`, `txns5mSells`)
  validate exactly like the 1h ones (`toFiniteNumberOrNull` /
  `toNonNegativeCountOrNull`); port fields optional so older
  `ResolvedToken` literals compile, pipeline always sets explicit
  `null`. `curveRow` progress uses `formatPercentText` (it already
  emits `%`) and the launchpad display name honors the `launchpadName`
  DisplayMap override (`pump-fun` → `Pump`), escaped once; a dotted
  detector fallback renders `pump\.fun`. For the mint class this
  layout targets the snapshot carries `launchpad: null`, so `curveRow`
  falls back to `bondingCurve.launchpadId` (guard-guaranteed
  non-empty) as both `id` and `name` — the `launchpadName` override
  still applies, so the acceptance case renders `⏳ 75% @ Pump`.
  `fdvChangeBracket` owns its MarkdownV2 bracket escaping: it emits
  `\[` + fdv + `/` + change + `\]` + one trailing space, so a body
  MUST NOT add literal brackets (precedent: `holderTopRow` owns
  `\[`/`\]`); BOTH sides unknown (absent/null/non-finite) → `""`
  (never `[N/A/N/A] `), exactly one unknown → the other renders
  `N/A` (`\[9\.6K/N/A\] `). `usdRow`/`liqRow` put the number in a
  MarkdownV2 code span (owner monospace requirement; the composed key
  is the ONLY correct way — a body wrapping `{{priceUsd}}` in ticks
  receives an already escaped value and prints the `\.`), so both
  rows emit ZERO backslashes; `liqRow` keeps `liquidityFlags` OUTSIDE
  the span and `formatMoneyText(liquidityUsd/2)` supplies the
  one-side number. `market5mRow` shares the
  extracted `renderMarketWindowRow` helper with `market1hRow` (the 1H
  bytes are pinned unchanged). POST-PREVIEW FIX (2026-10-30, staging
  `:4061`): `market5mRow`/`marketRow` used to emit the BARE row, so the
  v17 body glued them to the previous line (`Age: \`3m\`📉 5M:`,
  `💦 Liq: \`147.9K\`📉 1H:`) and a body-side `\n` left a BLANK line
  whenever the row silenced. Both keys now lower their own line
  (`"\n" + row`, `""`= silence — the`usdRow`/`liqRow`/`curveRow`  mechanics), while`market1hRow`keeps its legacy bytes and the v17
  body stays byte-identical. Pinned end-to-end in
 `template-renderer-bonding-curve.spec.ts`(curva+5m, curva sin 5m,
  fuera de curva, silencio). Registry: 22 base + 39 derived
  = **61** keys for`ca|x|z|bare`/ **62** for`c|cc`; catalog META
  carries all seven. Specs:
  `template-renderer-bonding-curve.spec.ts`,
  `market-data-client-bonding-curve.spec.ts`,
  `token-scan-bonding-curve.spec.ts`+ registry/age/rick-card count
  pins. The seeded`ca`body is untouched (it still lacks the
 `💰 USD:`/`💦 Liq:` lines — the launchpad layout is opt-in for the
  owner's live template).
