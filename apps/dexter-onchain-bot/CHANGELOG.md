# Changelog

All notable changes to `@onchain-bot/dexter-onchain-bot` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Pending-vs-not-found split + 10s market-data timeout (dexter
  plan todo 19a, robust-nulls S):** the pipeline reads
  `MarketDataSnapshot.status` (already end-to-end, no replumbing)
  at the `hasIdentity` sites and gains the `pending` outcome
  variant — pending shells answer `pending`, client nulls and
  ready-without-identity stay frozen `not-found`. Pinned wire
  contract over HTTP 200 (never 429/202 bare):
  `{ error: 'Token pending — retry shortly', address, pending: true }`
  on `GET /dexter/token` and preview (1:1, `PreviewUnresolvedShape.
pending?`); `resolve()` still returns null for pending (bot
  generic message stands, accepted). Frontend renders the pending
  copy (`Token data pending for … — retry shortly`, never `Token
not found`). `MARKET_DATA_TIMEOUT_MS` default 2000→10000 (cold
  fan-out ~2s, Telegram tolerates ~60s; `.env.*templates` updated).

- **Pair-side identity regression spec (dexter plan todo 20 —
  spec only, zero logic changes):** new
  `token-scan-pair-side.spec.ts` pins the dexter end of the
  market-data side-verification contract — a snapshot carrying the
  quote-side identity (USDC mint in a PUMP/USDC pool) resolves with
  `symbol == 'USDC'` / `!= 'PUMP'`, `name == 'USD Coin'`
  (explicit + bare paths), and base-side identity still passes
  through (PUMP stays PUMP). Identity asserts only, never address
  equality (tautological). The fix itself lives in market-data
  (summary `quoteToken` + fetcher side check); dexter copies the
  already-correct identity.

- \*\*Best-candidate auto-resolve with disclosure + `w/mo/y` ages
  (plan todo 17 — deliberate reversal of never-first-hit): the
  bare-address sweep now picks the highest-liquidity candidate
  (tiebreak: higher FDV, then first-seen — deterministic, raw-number
  comparison) and returns `alternatives: {chain,address,
liquidityUsd?}[]` on every multi-chain `ResolvedToken` (picked
  chain excluded, same order rule); `ambiguous` survives only for
  the zero-candidate path (message + hint byte-identical),
  `invalid`/`not-found` untouched. Accepted risk (scam copy with
  liquidity could win) mitigated by the always-attached disclosure.
  New derived key `{{alternatives}}` on every command (`Also on:
bsc, eth`, `""` when ≤1 chain). `formatCompactAgeText` extended
  to weeks/months/years (`<7d→Xd`, `<30d→Xw`, `<365d→Xmo`,
  else `Xy`; d/h/m rungs unchanged).

- \*\*FDV ATH from own snapshot history `{{fdvAth}}` + `{{fdvAthAgo}}`
  (plan todo 16): market-data adds a read-only `findFdvAth`
  aggregate over `snapshot-history` (max FDV + setting timestamp
  per chain+address, malformed rows skipped, history/retention
  untouched) wired into the snapshot path as `snapshot.fdvAth?`
  (strictly historical — read before the current row persists) and
  the compat edge as flat `fdvAthUsd`/`fdvAthAt`; dexter maps both
  shape-checked (client + pipeline double validation, mirroring
  `launchpad`/`venue`) onto `ResolvedToken`. Renderer: `fdvAth`
  money-compact no-`$` (todo-13 policy) + `fdvAthAgo` compact age
  (`9d/3d/5h/12m`, future clamps to now); cold-start (either null)
  renders BOTH empty — the current FDV is never substituted.
  Retention limit: janitor 90d window (ATH over surviving rows,
  not all time).

- \*\*Origin-aware venue line `{{chainName}}` + `{{venue}}` +
  `{{venueTech}}` + `{{venueLine}}` (plan todo 14): market-data
  exposes `snapshot.venue? {dexId, labels}` (live from the
  dexscreener best pair — `dexId` was already returned, `labels`
  added — resolved per call, never persisted, coexists with
  `launchpad`); dexter maps it shape-checked (`toVenueOrNull`) and
  passes it to `ResolvedToken.venue?` (re-validated at the pipeline
  boundary). Renderer: `chainName` from a code table (unlisted →
  `""`), `venue` prefers the launchpad name (no DEX hybrids),
  `venueTech` always `DexDisplay + labels` (uppercased, table +
  capitalize-first default), `venueLine` closed 4-branch (`<Origin>
via <Tech>` / origin / tech / `""`). Dangling-`@` cleanup joins the
  `•`/`|` family (`Solana @ ` → `""`, ` @ X` → `X`). Deliberate
  Conway deviation: origin-known renders the origin (`Bankr`) where
  Rick shows the tech (`Clanker V4`). `dexId` (`meteoradbc`) never
  feeds `launchpad.id` (`meteora-dbc`) — separate tables, spec-pinned.

- \*\*Bot deep-link `{{botStartAddressLink}}` + `/start <payload>`
  (plan todo 11, hybrid white-label design): new generic `BOT_USERNAME`
  env (no prefix, one value per env, `^[A-Za-z0-9_]{5,}$`, empty
  allowed — empty in all three templates, never a real username in
  git); new `BotIdentityService` (`settings/`, bootstrap-once
  gateway-inventory → Bot API `getMe` (5 s, token never logged) →
  env → `""`, warn-on-mismatch, fail-open); derived renderer key on
  every command (`https://t.me/<username>?start=<address>`, `""`
  without username or with a non-`[A-Za-z0-9_-]`/>64-char payload);
  `/start <payload>` answers the full card via the shared
  `sendFullScan` (ACTIVE `ca` template), bare/invalid `/start`
  byte-identical legacy. No Mini App, no auto-trading, no new
  callbacks.

- **Bot identity via bound-vault profile (plan todo 12):** `BotIdentityService` resolves the primary source from
  `GET /api/bots/:id/profile` (`username`) against the bound vault
  (existing local `'dexter'` mapping + `DEXTER_BOT_VAULT_ID`
  fallback, same order as the sender; unmapped → zero network) —
  order is now profile → Bot API `getMe` (5 s, token never logged)
  → `BOT_USERNAME` env → `""`, warn-not-throw fail-open throughout.
  The todo-11 inventory probe is deleted (rows carry no `username`
  by design). No gateway changes (existing `send`-scope endpoint);
  avatar ignored. `BOT_USERNAME` behavior unchanged (still 3rd).

- **Rick-parity number policy (plan todo 13):** formatters emit NO
  `$` (money → compact K/M/B trimmed `23.3K`/`7.9K`/`1.46B`;
  `priceUsd` → adaptive `<1` full digits `0.00002434` / `>=1`
  grouped max-2 `3,457`, fixing the live `$0.00`-for-dust bug via a
  renderer `priceUsd` special-case); percent → trimmed,
  sign-only-when-negative (`80%`, `-34.4%`, `-0` → `0%`); counts
  unchanged; `N/A` on null. `$` is literal body text where a style
  wants it (Proficy `$27.3K`, KOLscope `$30.22K` via `${{…}}`;
  Rick-style seeds carry none — zero seed-body edits, existing DB
  rows untouched). Catalog `PLACEHOLDER_META` examples updated to
  the new outputs.

- \*\*Origin-launchpad plumbing + Wave-1 seeds (dexter-launchpad Lane S,
  `feat:`): `MarketDataSnapshot` gains optional `launchpad?
{id,name,url}` (`market-data.client.ts`, shape-checked at the dexter
  boundary via `toLaunchpadOrNull` — all three strings non-empty else
  `null`, opaque JSON never reaches the renderer);
  `TokenScanPipeline.toResolvedToken` passes it through to
  `ResolvedToken.launchpad` (re-validated, JUP/HUMA team launches stay
  `null`). DisplayMap seed catalog: 22 Wave-1 rows
  (`launchpad/<id>/<emoji>`, §8 ratified set incl. swaps 👾/🪙/📥 —
  no Bags row, no backlog gofundmeme/grafun/flap/daos rows) via the
  existing `POST /api/dexter/display-maps` API only (operator-managed,
  no hardcoded seeds; exact curl loop in
  `.omo/notepads/dexter-launchpad-build.md`). Failing-first:
  `market-data-client-launchpad.spec.ts` (CHALE verbatim + absent +
  7 malformed → null) + `token-scan-launchpad.spec.ts` (CHALE
  passthrough + JUP/HUMA null + malformed → null) + 2 mocked e2e in
  `e2e/dexter-templates.spec.ts` (IconLink renders `[💊]
(https://pump.fun/coin/…)`, null → empty, card intact).
  (feat/mega-refactor-tramos)

### Changed

- Gateway staging cutover (STAGING ONLY 2026-09-29, no prod touch): `.env.staging.template` fixes `BOTS_GATEWAY_URL` to the staging gateway `:4071` (was `:4070`, unreachable — the gateway staging container listens on `4071`); `DEXTER_SEND_MODE=gateway` already pinned. Plain-text lookups cut over; keyboard sends (`reply_markup`), `editMessageText` and `answerCallbackQuery` have no gateway equivalent and stay direct-only (markup dropped client-side, recorded as skipped). Rollback: `DEXTER_SEND_MODE=dual`.

### Added

- **Message templates v1 (todos 1-13, `feat:`):** every command card
  (`ca`/`x`/`z`/`c`/`cc`/bare) renders from a DB-backed template
  (MarkdownV2, `{{double-brace}}` syntax, `{%` rejected; 22 base + 6
  derived placeholder keys + `timeframe`) with exactly 1 active
  template per command (partial unique index + in-memory guard; closed
  v1 command enum). Keyboards abandoned on `c`/`cc` — chart-link-only
  text cards (no `reply_markup` until gateway todo 7). Management via
  HTTP API only (`POST /api/dexter/templates`, template-preview,
  `/api/dexter/display-maps` CRUD, placeholders catalog — no
  Telegram-side template editing in v1). Seed: 7 templates / 6
  commands (`DEXTER_SEED_TEMPLATES`, vacuum-fill activation, per-seed
  fault isolation). DisplayMap rename: `EmojiMap` → `DisplayMap`
  (`{{chainDisplay}}`, `DISPLAY_RESOLVER`, route
  `/api/dexter/display-maps`, pure-rename migration). Transport
  rename: `src/telegram/` → `src/gateway/` (zero behavior). `GET
/dexter/token` exposes `templateUsed: { command, name, version } |
null` (error shapes unchanged). Verified: 40 suites / 288 tests
  green, `tsc --noEmit` clean, double boot
  (`DATABASE_ENABLED=false` in-memory + `true` TypeORM).
  `src/templates/` = Dexter bot message templates, NOT the future
  frontend-feed `templates` rename. (feat/mega-refactor-tramos)

- **Exclusive gateway bot + bind-from-inventory API:** dexter binds its
  bot FROM the gateway inventory (never by pasting a token here):
  `GET /api/dexter-bots/inventory` (vault bots + availability),
  `POST /api/dexter-bots/bind` (link-as-target → locks one vault bot
  to `dexter-onchain-bot`, 409 when another app holds it, records the
  local `dexter` → vault mapping), `POST /api/dexter-bots/unbind`
  (release; edit = unlink + relink). Creation stays on
  `POST /api/dexter-bots/migrate-to-gateway` (env token → vault).
  Failing-first: `dexter-bot-binding.service.spec.ts` (bind records
  mapping + inventory lists availability). (feat/mega-refactor-tramos)

- **Own scan-card template (`formatScanCard`, MarkdownV2):** built from
  `docs/examples-for-dexter/rick-bot-scanner.md` (card anatomy) under
  the `format-comparison.md` decision (entities-parse, MarkdownV2-send):
  header (`🔍 $SYMBOL | name — chain` + contract code line) +
  price/MC/liq + supplies (FDV + total/circulating/max) + holders/dev
  - links (DexScreener + GeckoTerminal) + trade-buttons hint (buttons
    travel as the inline keyboard; links keep the card actionable when
    the keyboard shape stays gateway-unsupported). All user strings
    MarkdownV2-escaped, 4096-char cap. `/x` + `/ca` (+ bare fallback)
    send it via `sendFullScan`. Failing-first: `scan-card.spec.ts`
    (real PERPS-like fixture renders every section, MarkdownV2,
    length-capped). (feat/mega-refactor-tramos)

### Changed

- **Gateway-only sends (direct leg retired):** `resolveDexterSendMode`
  always resolves `gateway` (stale `direct`/`dual` env values fall
  through instead of touching the Bot API); `TelegramBotClient`
  `.sendMessage` routes unconditionally to the inventory-bound vault
  bot (token never resolved client-side); keyboard shapes
  (`reply_markup`) degrade to text-only (gateway `SendDto` carries no
  `reply_markup` — links row keeps cards actionable; native keyboards
  return with gateway todo 7). Market-data HTTP remains the ONLY
  market-data source (unchanged). Specs updated: `send-mode.spec.ts`
  (always-gateway), `bot-client-dual-send.spec.ts` (gateway-only
  matrix), `gateway-send-client.service.spec.ts` (keyboard → text-only),
  `start-ca.spec.ts` (own-template mocks).

- **Dev holdings on the lookup card (`devWallets[]` + `devPctSupply`):**
  `MarketDataClient` maps them null-safe from the snapshot,
  `TokenScanPipeline.toResolvedToken` passes them through, `ResolvedToken`
  carries them, and the full Telegram card renders a `Dev:` line (pct +
  top-3 short wallets, `(probable)` flag; `Dev: N/A (no key or no data)`
  when absent — never a partial card). Failing-first:
  `token-scan-dev.spec.ts` (passthrough + card values + adversarial
  nulls). (feat/mega-refactor-tramos)

- **Supply fields on the lookup card (`totalSupply`,
  `circulatingSupply`, `maxSupply`, all-nullable):** `MarketDataClient`
  maps them from the market-data snapshot (null-safe `?? null`),
  `TokenScanPipeline.toResolvedToken` passes them through, `ResolvedToken`
  carries them, and the full Telegram card renders FDV + Total /
  Circulating / Max supply lines (`N/A` when the provider has none —
  never a partial card, never a crash). `GET /dexter/token` returns them
  via the pipeline token spread. Failing-first:
  `token-scan-supply.spec.ts` (passthrough + adversarial nulls + card
  lines). (feat/mega-refactor-tramos)

- **Bare-address lookup (no chain qualifier):** `GET
/dexter/token?address=` and every bot scan path accept a lone
  contract. `TokenScanPipeline.resolveDetailed` validates format (garbage
  → `invalid`, no network calls), reuses market-data chain-detect (`GET
/api/v1/chains/detect` via `MarketDataClient.detectChain`, down →
  solana-first sweep fallback), then sweeps the format-narrowed chains
  (solana → `[solana]`, EVM → `[ethereum, base, bsc, arbitrum,
polygon]`, detect winner ordered first) collecting identity hits:
  exactly one → resolved, two or more → `ambiguous` with `candidates`
  (explicit `chain:address` retry, never a first-hit silent guess), zero
  → `not-found`. `resolve()` keeps its contract (non-resolved → null,
  so Telegram handlers keep their explicit cannot-resolve message). The
  controller surfaces `{ error: 'Ambiguous address …', candidates }` and
  `{ error: 'Invalid address: …' }` alongside the unchanged `Token not
found` / `Address required` shapes. `MarketDataClient.resolveAny`
  removed (first-hit silent-guess path, zero callers).
- **Tests (failing-first, +3 suites / +14 tests, 19/69 green):**
  pipeline bare solana + bare EVM + detect-down sweep fallback +
  multi-chain ambiguous + garbage invalid + explicit-chain intact;
  client detect hit + non-ok → null + throw → null (never throws);
  controller resolved/ambiguous/invalid/not-found/missing explicit
  shapes.

### Fixed

- **Staging backport 2026-09-27:** default bind `DEXTER_HOST` changed
  `127.0.0.1` → `0.0.0.0` (loopback-in-container is unreachable via the
  published-port mapping; droplet staging already ran with `0.0.0.0`).
  Dev may still set `127.0.0.1` explicitly for loopback-only.

### Added

- **Lookup via telegram-bots-gateway (todo 6, dual-send, no cutover):**
  `DEXTER_SEND_MODE` (`direct` deprecated | `dual` default | `gateway`
  fail-closed) routing INSIDE `TelegramBotClient.sendMessage`, so all 9
  handlers + the router call it unchanged (lookup/scan/commands
  untouched otherwise). New `src/telegram/` code: vault-id-only port
  (`domain/ports/bots-gateway-sender.port.ts`, token never crosses) +
  `infrastructure/gateway/` (HMAC signer, vault-id mapping, 4096-chunk
  send client over `fetch`, send-mode helper) + `DualSendParityService`
  (outcome-only ledger, keyboard/edit/callback shapes recorded as
  `skipped`, `assertNoDivergence()` 409 cutover gate — Nest
  `ConflictException`, this app owns no `src/shared/kernel/`) +
  `MigrateBotsToGatewayUseCase` with `POST
/api/dexter-bots/migrate-to-gateway` (env token → vault, labels/ids
  only) + `POST /dexter/ingress` (gateway router fan-out target,
  `x-gateway-bot` + timing-safe secret, unsigned dev-only, errors
  acked). Gateway leg resolves the token server-side from the vault id
  (`DEXTER_BOT_VAULT_ID` or the migration mapping); direct client is
  `@deprecated` (dual-leg only). Staging/prod templates pin
  `DEXTER_SEND_MODE=gateway`.
- **Tests (failing-first, +10 suites / +35 tests, 16/55 green):**
  signer, mapping, send-client, send-mode, parity, migrate use-case,
  migration controller, ingress controller, bot-client dual routing
  (dual/direct/gateway, vault resolution, keyboard skip, divergence
  gate), secret-scan (vault-ids-only, no `console.*`, no direct token
  reads).
- **Verified:** `jest` 55/55 green, `tsc --noEmit` clean, `nest build`
  ok, gateway regression 15/66 green (zero gateway source edits), live
  dual `/start` (direct 401 vs gateway 777 — environmental divergence,
  gate closed) + live keyboard `/tb` skip + live gateway-mode `/help`
  777 (token never resolved) + 0 token leaks. Mode stays `dual`.
  Evidence `.omo/evidence/task-6-telegram-bots-gateway.log`.
- **Known cutover blockers (gateway todo 7):** keyboard sends
  (`reply_markup`), `editMessageText`, `answerCallbackQuery` need
  gateway support (or stay dual); vault mapping is in-memory.

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
