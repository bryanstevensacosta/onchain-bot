# apps/telegram-bots-gateway/ — NestJS Knowledge Base

> Verified 2026-09-26 against code. v0.1.0 (source of truth: `package.json`; todos 1–6 built: setup + vault + resolver + send gateway + service auth + ingress router + kol/feed/dexter migration contracts; todo 8: legacy deprecation headers + inventory extension, analysis only).
> Plan: `.omo/plans/telegram-bots-gateway.md` (todos 1–2 + BOT USAGE INVENTORY rows 1–40 + EXTENSION). Decisions P42 in `.omo/drafts/mega-refactor-tramos.md` §7.6.

## OVERVIEW

NestJS 11 service (future Tramo, after market-data + dexter) that will be the SINGLE Bot API
coordination point: encrypted bot vault, global per-bot send rate-limit, single webhook ingress +
update router, per-bot health. Apps stop storing tokens. No MTProto here — Bot API only
(zero `AUTH_KEY_DUPLICATED` risk).

Built today (todos 1–2): Config (Tier-1) + `GET /api/health` + `VaultModule` (AES-256-GCM vault CRUD,
redacted reads, rotation without redeploy, `admin` scope) + `BotsModule` (resolver `GET /api/bots/:id/profile`:
handle, bot id, username, cached avatar; `send` scope) + `SendModule` (`POST /api/bots/:id/send`:
message/photo/media-group, global per-bot quota 30/s + ~1/s per chat, centralized 429 backoff,
idempotency) + `AuthModule` (per-client keys, `send` vs `admin` scopes, HMAC timestamp+nonce).

- `IngressModule` (todo 3: single webhook ingress + update router with per-route secret,
  fan-out to subscribed apps, webhook-vs-polling exclusivity, dead-letter).
- First migrated client (todo 4): kol-system publishes via this gateway
  (`KOL_PUBLISH_MODE=direct|dual|gateway`, vault migration
  `POST /api/vault/bots` with `admin` scope + HMAC). No gateway code
  changed in todo 4 — see §FIRST CLIENT below.
- Third migrated client (todo 6): dexter-onchain-bot answers lookups
  via this gateway (`DEXTER_SEND_MODE=direct|dual|gateway`, env-token
  vault migration, `POST /dexter/ingress` fan-out target). No gateway
  code changed in todo 6 — see §DEXTER CLIENT below. (feed-publisher
  migrated in todo 5 with zero gateway changes and no docs touch —
  its contract lives in `apps/feed-publisher/AGENTS.md` §GATEWAY
  MIGRATION.)
- Legacy deprecation sweep (todo 8, analysis + headers only): every
  remaining legacy direct-leg file carries an `@deprecated` JSDoc naming
  its gateway destination + absorbing todo (4/5/6) + removal todo (7);
  full 40-row inventory + per-file deprecation order + orphan check in
  the plan §BOT USAGE INVENTORY + §EXTENSION. No logic moved, nothing
  deleted (todo 7 deletes).

## COMMANDS

```bash
# In apps/telegram-bots-gateway/
npm run dev                # nest start --watch (port BOTS_GATEWAY_PORT, default 4070)
npm run start:prod         # node dist/main (after build)
npm run build              # nest build
npm test                   # jest --forceExit --runInBand --testTimeout=30s (co-located *.spec.ts)
npm run test:cov           # jest --coverage → ./coverage
npm run lint               # eslint "{src,test}/**/*.ts" --fix

# Root alias (NOT yet wired — read-only outside this app in todo 1; add manually):
#   "dev:bots-gateway": "node scripts/cleanup-ports.mjs --force 4070 && npm run start:dev -w @onchain-bot/telegram-bots-gateway"
```

Verified live 2026-09-25: `node dist/src/main.js` + `curl -s localhost:4070/api/health` →
`{"status":"ok","components":{"vault":"up","resolver":"up"}}` (process stopped afterwards;
evidence `.omo/evidence/task-1-telegram-bots-gateway.log`).

## STRUCTURE

```text
src/
├── main.ts                       # bootstrap() — ValidationPipe whitelist/forbidNonWhitelisted/transform, listen BOTS_GATEWAY_PORT ?? 4070; no ENCRYPTION_KEY → clear stderr + exit 1, no listen
├── app.module.ts                 # Config (envFilePath ['.env.dev', '.env']) + HealthModule + VaultModule + BotsModule
├── health/
│   ├── health.module.ts
│   └── api/http/health.controller.ts (+ .spec.ts)   # GET /api/health → { status: 'ok', components }
├── vault/                        # BUILT (todo 1)
│   ├── vault.module.ts           # controller + VaultService + EncryptionService + InMemory repo; exports VaultService + EncryptionService
│   ├── domain/bot-vault.entity.ts (+ .spec.ts)      # BotVaultEntry: id/label/ciphertext/ownerApp/createdAt/rotatedAt; toRedacted() → token '***'
│   ├── application/vault.service.ts                 # register/list/get/rotate/remove (redacted) + decryptToken (internal-only)
│   ├── infrastructure/encryption.service.ts (+ .spec.ts)  # AES-256-GCM, ENCRYPTION_KEY hex64 direct else SHA-256, fail-closed
│   ├── infrastructure/in-memory-bot-vault.repository.ts  # upsert by id; TypeORM repo lands with todo 7
│   ├── infrastructure/bot-vault.orm-entity.ts       # `bot_vault` table shape (id, label, token=ciphertext, owner_app, created/rotated_at)
│   └── api/http/vault.controller.ts (+ .spec.ts)    # POST/GET/GET :id/PATCH :id/rotate/DELETE :id /api/vault/bots (internal)
├── bots/                         # BUILT (todo 1, resolver only; todo 2: `send` scope)
│   ├── bots.module.ts            # imports VaultModule; controller + BotResolverService
│   ├── application/bot-resolver.service.ts           # getMe → profile; getUserProfilePhotos+getFile → permanent cache uploads/avatars/<id>.jpg
│   └── api/http/bots.controller.ts (+ .spec.ts)     # GET /api/bots/:id/profile + GET /api/bots/:id/avatar (404 when uncached)
├── auth/                         # BUILT (todo 2, service-to-service auth)
│   ├── auth.module.ts            # global APP_GUARD + AUTH_CLOCK_SKEW_SEC from config
│   ├── domain/client-credential.ts                 # ClientCredential: id/secret/scopes (send|admin, admin implies send)
│   ├── application/client-registry.service.ts       # BOTS_GATEWAY_CLIENTS JSON env + registerClient; empty = keyless dev (fail-open)
│   ├── application/hmac.service.ts (+ .spec.ts)    # HMAC-SHA256 METHOD\npath\nts\nnonce\nsha256(rawBody), timing-safe verify
│   ├── application/nonce-store.ts                   # single-use nonces, recorded only after verify, TTL 2x skew
│   └── api/http/service-auth.guard.ts (+ .spec.ts) + require-scope.decorator.ts  # 401 bad/expired/replayed, 403 wrong scope
├── send/                         # BUILT (todo 2, send gateway)
│   ├── send.module.ts            # imports VaultModule + AuthModule; TELEGRAM_API_BASE from config
│   ├── api/http/send.controller.ts                # POST /api/bots/:id/send + GET /api/bots/:id/stats (`send` scope)
│   ├── api/http/dto/send.dto.ts                    # kind message|photo|media_group + chat_id + client_msg_id (idempotency key)
│   ├── application/send.service.ts (+ .spec.ts)    # idempotency → vault → quota → Bot API → accounting
│   ├── application/per-bot-rate-limiter.service.ts (+ .spec.ts)  # 30/s per bot + 1/s per chat, per-bot queues
│   ├── application/idempotency.store.ts            # (bot, chat, client_msg_id) → stored result
│   ├── application/send-accounting.service.ts      # sent/quotaWaits/429/retried/failed per bot
│   ├── infrastructure/bot-api-client.ts (+ .spec.ts)  # POST Bot API, 429 retry_after + bounded retries, fail-closed
│   └── send.integration.spec.ts  # supertest matrix: happy send + 401s + replay + 403 + admin vault + stats
├── ingress/                      # BUILT (todo 3, webhook ingress + router)
│   ├── ingress.module.ts         # imports VaultModule (poller token lookup); INGRESS_FANOUT_OPTS from env
│   ├── domain/ingress-route.ts                 # IngressRoute: botId + webhookSecret + mode (webhook|polling) + subscribers
│   ├── application/subscription-registry.service.ts (+ .spec.ts)  # in-memory routes; BOTS_GATEWAY_INGRESS JSON seed
│   ├── application/ingress-mode.service.ts     # webhook XOR polling per bot (single mode field, never both)
│   ├── application/update-fanout.service.ts (+ .spec.ts)  # byte-identical POST per subscriber + HMAC + retry + dead-letter
│   ├── application/dead-letter.store.ts        # in-memory dead letters (persisted in todo 7)
│   ├── application/update-poller.service.ts    # getUpdates fallback (polling mode only, offset cursor)
│   ├── api/http/ingress.controller.ts          # POST :botId/updates (public, per-route secret) + admin route/mode/dead-letter
│   ├── api/http/dto/ingress.dto.ts             # UpsertRouteDto + SetModeDto + SubscriberDto
│   └── ingress.integration.spec.ts  # supertest: fan-out 2 apps + 401 + 409 exclusivity + dead-letter
├── shared/
│   ├── kernel/aggregate-root.ts, domain-error.ts
│   ├── config/app.config.ts (+ .spec.ts)            # Tier-1: ENCRYPTION_KEY + DATABASE_URL required; port BOTS_GATEWAY_PORT ?? 4070; telegramApiBase + clockSkewSec (todo 2)
│   ├── config/data-source.ts                        # own-DB data source (onchain_bot_bots[_staging]); migrations explicit
│   └── filters/domain-exception.filter.ts           # DomainError → HTTP status
Root: package.json (@onchain-bot/telegram-bots-gateway v0.1.0), nest-cli.json (deleteOutDir),
tsconfig{,.build}.json, jest.setup.ts, docker-compose.yml (postgres :5436, gateway :4070),
docker-compose.staging.yml (:4071), Dockerfile (CMD dist/main.js),
.env.example, .env.development, .env.staging.template, .env.production.template,
uploads/avatars/ (permanent cache, janitor-excluded — no janitor exists here)
```

## MODULES (app.module.ts — verified list)

Wired today: `ConfigModule` (global, `.env.dev` > `.env`, Tier-1 via `buildAppConfig()`) +
`HealthModule` (`GET /api/health`) + `VaultModule` (todo 1, `admin` scope since todo 2) +
`BotsModule` (todo 1, resolver only, `send` scope since todo 2) + `AuthModule` (todo 2, global
`APP_GUARD`) + `SendModule` (todo 2, send gateway) + `IngressModule` (todo 3, ingress router).

## VAULT (todo 1)

`BotVaultEntry` (domain, in-memory today): `id` (uuid) + `label` + `encryptedToken` (AES-256-GCM
ciphertext `iv:tag:data` hex) + `ownerApp` (kol-system | feed-publisher | dexter-onchain-bot) +
`createdAt` + `rotatedAt` (null until first rotation). Table `bot_vault` mirrors it
(`token` column holds ciphertext; `owner_app`; TypeORM entity + migration land with todo 7).

`EncryptionService`: 64-hex `ENCRYPTION_KEY` direct, else SHA-256 (dev convenience); empty key →
fail-closed `DomainError`; tamper → `failed to decrypt payload`. Round-trip + tamper + empty-key
pinned by spec.

CRUD (`VaultService`, internal): callers pass PLAINTEXT, service encrypts before persist, returns
ONLY redacted projections (`token: '***'` — ciphertext never leaves the repo). Rotation =
ciphertext swap + `rotatedAt`, no redeploy. `decryptToken()` is internal-only (resolver + future
send gateway; never logged, never in responses).

## RESOLVER (todo 1)

`BotResolverService.resolveProfile(vaultId)`: decrypts the vault token → Bot API `getMe`
(handle = vault label, botId, username, displayName) → `getUserProfilePhotos` + `getFile` →
downloads the largest photo → permanent cache `uploads/avatars/<vaultId>.jpg` (no janitor in this
app — cache never expires). `GET /api/bots/:id/profile` returns
`{ id, handle, botId, username, displayName, avatarUrl }` (`avatarUrl` null when the bot has no
photo or the fetch fails; upstream errors surface as 502 WITHOUT the token). `GET
/api/bots/:id/avatar` serves the cached JPEG (1y cache) or 404 when uncached. Transport is global
`fetch` (10 s timeout, injectable `FETCH_FN` for tests — no axios here). No MTProto anywhere.

## SEND (todo 2)

`POST /api/bots/:id/send` (`send` scope, 200): `SendService` runs idempotency
(`InMemoryIdempotencyStore` keyed by bot + chat + `client_msg_id`; repeats replay the stored
result without touching Telegram) → vault lookup (404 unknown bot, redacted, no Telegram call) →
`PerBotRateLimiterService` (sliding 1 s windows: 30/s per bot + 1/s per chat, per-bot
promise-chain queues so N apps serialize instead of bursting) → `BotApiClient` POSTs
`sendMessage`/`sendPhoto`/`sendMediaGroup` (global `fetch`, 15 s timeout, injectable `FETCH_FN`
for tests — no axios here). 429s honor `parameters.retry_after` (capped 60 s), retry bounded
times (default 3), then fail closed (`Telegram 429 persisted…`, no infinite retry);
non-429 errors surface WITHOUT the token. `SendAccountingService` counts per bot
(sent/quotaWaits/quotaWaitMs/telegram429/retried/failed), read via `GET /api/bots/:id/stats`
(`send` scope). Telegram-quota pacing ONLY — delays/caps stay in the calling apps
(plan constraint, no product policy here). In-memory quota + idempotency are exact
single-process; a shared store lands with multi-replica deploy (todo 7).

## AUTH (todo 2)

`AuthModule` provides the global `APP_GUARD` (`ServiceAuthGuard`): headers `x-api-key`
(client id) + `x-timestamp` (unix seconds) + `x-nonce` (≥8 chars, single use) + `x-signature`
(hex HMAC-SHA256 of `METHOD\npath\ntimestamp\nnonce\nsha256(rawBody))`, `HmacService`,
compared with `timingSafeEqual`. `main.ts` boots with `rawBody: true` so the signature covers
the exact wire bytes. `ClientRegistryService` reads `BOTS_GATEWAY_CLIENTS` JSON env
(`{"kol-system":{"secret":"…","scopes":["send"]}}`); empty = keyless dev (fail-open,
kol-system mirror). Nonces record ONLY after verify (failed attempts can't fill the store),
TTL 2× skew. Status discipline: unknown client / expired timestamp (±`BOTS_GATEWAY_CLOCK_SKEW_SEC`,
default 300) / bad signature / replayed nonce → 401; valid auth with the wrong scope → 403
(`admin` implies `send`; vault CRUD = `admin`, send + resolver + stats = `send`, health =
public). Keys/secrets/signatures never logged or echoed (pinned by guard spec + integration
matrix). TLS terminates at ingress — the gateway serves plain HTTP, never expose
`:4071`/`:4072` directly. Rotation drills: `docs/auth-compromise-drill.md`.

## FIRST CLIENT — kol-system migration (todo 4, no gateway code changes)

kol-system (`apps/kol-system/src/telegram/`) is the first app migrated
onto this gateway; all migration code lives THERE (read-only outside
kol-system in todo 4, so nothing here moved):

- Vault migration: kol-system `POST /api/telegram-bots/migrate-to-gateway`
  decrypts each local `telegram_bots` entry and re-registers it HERE via
  `POST /api/vault/bots` (`admin` scope, HMAC-signed) — the gateway
  re-encrypts with its own `ENCRYPTION_KEY`; plaintext lives only inside
  the TLS request body. The gateway mints fresh vault ids; kol-system keeps
  the local→vault map (in-memory until todo 7 persists it).
- Send path: kol-system `GatewaySendClient` → `POST /api/bots/:id/send`
  (`send` scope, HMAC-signed, `client_msg_id` = kol publishing-job id).
  Dual-send (`KOL_PUBLISH_MODE=dual`) runs the gateway leg beside the
  legacy direct leg and compares outcomes; `gateway` mode is the cutover
  (fail-closed, catalog token never resolved client-side).
- Operator wiring: register the client in `BOTS_GATEWAY_CLIENTS`
  (`{"kol-system":{"secret":"…","scopes":["send"]}}` for sends plus an
  `admin`-scoped credential for the one-shot migration), DISTINCT secrets
  per env. Canonical signing reminder for client implementers:
  `METHOD\npath\ntimestamp\nnonce\nsha256(rawBody)` with the EXACT route
  path (`/api/bots/:id/send`, `/api/vault/bots`) and the EXACT JSON bytes
  (this server verifies `rawBody`, enabled by `rawBody: true` in `main.ts`).

## INGRESS (todo 3)`POST /api/ingress/:botId/updates` (public to Telegram, 201): the per-route

`x-telegram-bot-api-secret-token` is timing-safe compared (unknown bot / mismatch →
401); polling-mode routes refuse delivery with 409 — webhook and getUpdates never
run together per bot (single `mode` field in `SubscriptionRegistryService`, no second
flag to drift; `IngressModeService` + poller both assert the same invariant).
`UpdateFanoutService` POSTs the raw update byte-identical to every subscribed app
(kol-system, feed-publisher, dexter) with `x-gateway-bot` + optional per-subscriber
`x-gateway-signature` HMAC — pass-through + auth, zero business logic. Down apps get
bounded retries (`BOTS_GATEWAY_FANOUT_MAX_ATTEMPTS=4`, backoff
`BOTS_GATEWAY_FANOUT_BACKOFF_MS=200,1000,5000`), then a `DeadLetterStore` record
(operator replay + persistence land with todo 7). Route management (`PUT|GET
:botId/subscriptions`, `DELETE :botId/subscriptions/:appId`, `POST :botId/mode`,
`POST :botId/poller/start|stop`, `GET :botId/dead-letter`) requires `admin` scope;
routes also seed from `BOTS_GATEWAY_INGRESS` JSON. `UpdatePollerService` is the
getUpdates fallback (polling mode only, offset cursor, vault token lookup); starting
it under webhook mode throws CONFLICT. In-memory registry + fan-out are exact
single-process; shared stores land with multi-replica deploy (todo 7).

## DEXTER CLIENT — dexter-onchain-bot migration (todo 6, no gateway code changes)

dexter-onchain-bot (`apps/dexter-onchain-bot/src/telegram/`) is the
third app migrated onto this gateway; all migration code lives THERE
(read-only outside dexter in todo 6, so nothing here moved):

- Vault migration: dexter `POST /api/dexter-bots/migrate-to-gateway`
  registers its `DEXTER_BOT_TOKEN` env token HERE via
  `POST /api/vault/bots` (`admin` scope, HMAC-signed,
  `ownerApp: 'dexter-onchain-bot'`) — the gateway re-encrypts with its
  own `ENCRYPTION_KEY`; plaintext lives only inside the TLS request
  body. The gateway mints the vault id; dexter keeps the local
  `dexter`→vault map (in-memory until todo 7 persists it) or pins
  `DEXTER_BOT_VAULT_ID` by hand.
- Send path: dexter `GatewaySendClient` → `POST /api/bots/:id/send`
  (`send` scope, HMAC-signed, `client_msg_id` per lookup) with routing
  INSIDE its `TelegramBotClient.sendMessage`
  (`DEXTER_SEND_MODE=direct|dual|gateway`, default `dual`). Plain-text
  lookup answers run both legs with outcome parity; keyboard sends
  (`reply_markup`), `editMessageText`, and `answerCallbackQuery` have
  NO gateway equivalent (`SendDto` carries no `reply_markup`) and stay
  direct-only (recorded as skipped, never diverged — gateway todo 7
  must cover them for cutover).
- Ingress path: dexter `POST /dexter/ingress` is the subscriber target
  for `UpdateFanoutService` (raw update byte-identical with
  `x-gateway-bot` + shared `x-gateway-secret`); direct webhook/poller
  stay live for the dual leg.
- Operator wiring: register the client in `BOTS_GATEWAY_CLIENTS`
  (`{"dexter-onchain-bot":{"secret":"…","scopes":["send"]}}` for sends
  plus an `admin`-scoped credential for the one-shot migration),
  DISTINCT secrets per env. Staging/prod dexter templates pin
  `DEXTER_SEND_MODE=gateway`.
- Evidence: `.omo/evidence/task-6-telegram-bots-gateway.log` — live
  dual `/start` (direct 401 vs gateway 777, environmental), keyboard
  `/tb` skip, gateway-mode `/help` 777 with the token never resolved.

## ENV INVENTORY (`.env.example` — verified)

| Var                                | Value / default in example                     | Notes                                                                                                              |
| ---------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `BOTS_GATEWAY_PORT`                | `4070`                                         | dev default; staging `4071`, prod `4072`                                                                           |
| `ENCRYPTION_KEY`                   | (empty — `openssl rand -hex 32`, NEVER commit) | Tier-1 required, DISTINCT per env; empty → exit 1, no listen                                                       |
| `DATABASE_URL`                     | `postgres://…@localhost:5432/onchain_bot_bots` | Tier-1 required; own logical DB                                                                                    |
| `DATABASE_SYNCHRONIZE`             | `true`                                         | dev only; `false` in staging/prod templates                                                                        |
| `AVATAR_DIR`                       | `uploads/avatars`                              | permanent cache, janitor-excluded                                                                                  |
| `BOTS_GATEWAY_CLIENTS`             | (empty = keyless dev)                          | JSON per-client keys+scopes (`{"id":{"secret":"…","scopes":["send"]}}`); DISTINCT secrets per env                  |
| `BOTS_GATEWAY_CLOCK_SKEW_SEC`      | `300`                                          | HMAC timestamp window (s); nonces live 2× this                                                                     |
| `TELEGRAM_API_BASE`                | `https://api.telegram.org`                     | override ONLY for local mock-Telegram live tests                                                                   |
| `BOTS_GATEWAY_INGRESS`             | (empty = no routes)                            | JSON per-bot routes (`{"<botId>":{"webhookSecret":"…","mode":"webhook","subscribers":[{"appId":"…","url":"…"}]}}`) |
| `BOTS_GATEWAY_FANOUT_MAX_ATTEMPTS` | `4`                                            | bounded fan-out retries per subscriber before dead-letter                                                          |
| `BOTS_GATEWAY_FANOUT_BACKOFF_MS`   | `200,1000,5000`                                | retry backoff schedule (ms, comma-separated)                                                                       |

Templates (tracked, placeholders, NO secrets): `.env.development`, `.env.staging.template`,
`.env.production.template`. Real files (`.env.staging`, `.env.production`) gitignored, copied via
`scp` to OracleDroplet on deploy.

## PORTS

Spec triplet: **4070 / 4071 / 4072** (dev / staging / prod — plan §Decisions; verified free with
`lsof -i :4070`). Local `docker-compose.yml`: postgres `5436:5432` (db `onchain_bot_bots`),
gateway `4070:4070`. No clash with backend (`:3030`), ingestion (`:3031/32/33`), kol-system
(`:3050`), market-data (`:4000`), dexter (`:4060`). DB naming `onchain_bot_bots[_staging]`
(one-DB-per-app, same server per env).

## HEALTH

`GET /api/health` → 200 + `{ status: 'ok', components: { vault: 'up', resolver: 'up', send: 'up', ingress: 'up' } }`
(public, no auth).

## TS/ESLINT CONVENTIONS

- TypeScript 5.7 (verified `tsc --noEmit` clean), `strictNullChecks`, `noImplicitAny`,
  `noFallthroughCasesInSwitch`, `forceConsistentCasingInFileNames`, `isolatedModules` —
  mirroring `tsconfig.base.json` (`strict` NOT enabled globally). `nodenext` module/resolution.
- Path aliases (`tsconfig.json` + jest `moduleNameMapper`): `shared/*`, `vault/*`, `bots/*`,
  `health/*`, `ingress/*`, `src/*` rooted at `src/`. No `@/*` (frontend-only).
- Prettier: `singleQuote: true`, `trailingComma: "all"` (root config).
- NestJS: `deleteOutDir: true` in `nest-cli.json`; `process.noDeprecation = true` in `main.ts`.
- `ConfigModule.envFilePath: ['.env.dev', '.env']` — `.env.dev` wins.

## TESTS

```bash
npm test            # jest --forceExit --runInBand --testTimeout=30s
npm run test:cov    # → ./coverage
```

Co-located `*.spec.ts` (`testRegex: .*\.spec\.ts$`); no coverage thresholds. Failing-first:
6 suites written red (missing modules), then implemented green (19 tests) in todo 1;
6 more suites red → green (35 tests) in todo 2 — 12 suites / 54 tests total, incl.
`send.integration.spec.ts` (supertest HMAC matrix over HTTP) + 3-apps × 12 burst under
quota + 429-backoff + idempotency; 3 more suites red → green (12 tests) in todo 3 —
15 suites / 66 tests total, incl. `ingress.integration.spec.ts` (fan-out to 2 apps,
per-route-secret 401, webhook-vs-polling 409, app-down dead-letter). No MTProto in tests
(sessions live ONLY in ingestion-telegram; duplicates cause `AUTH_KEY_DUPLICATED`) — the resolver
spec injects a mocked `FETCH_FN`, never the real Bot API.

## GAPS

1. TypeORM persistence is scaffold-only (`bot-vault.orm-entity.ts` + `data-source.ts`, no
   migration, no wired repository): runtime uses the in-memory repo. Wire + migrate in todo 7
   (CI/deploy).
2. Root `npm run dev:bots-gateway` alias NOT added (todo 1 was read-only outside this app) — add
   the one-liner from §COMMANDS when touching root `package.json`.
3. RESOLVED 2026-09-25 (todo 2) — `AuthModule` global `APP_GUARD`: vault CRUD requires
   `admin`, send/resolver/stats require `send`, health stays public; keyless dev still
   fail-open. Compromise drills in `docs/auth-compromise-drill.md`.
4. Jest `--testTimeout=30s` (found 2026-09-26, todo 3): jest parses the timeout as a
   number, so `30s` is NaN and the effective per-test timeout stays the 5 s default —
   keep slow paths (fan-out retries) under 5 s in specs; the ingress integration spec
   pins `BOTS_GATEWAY_FANOUT_BACKOFF_MS=5,5,5` for this reason.

## STANDING RULE

Every future todo ends with: **"update AGENTS.md if anything changed"**. If commands, ports, envs,
modules, routes, or decisions moved, this file moves with them — same living-doc pattern as the
other `apps/*/AGENTS.md`.

## NOTES

- `.env.dev` takes precedence over `.env`.
- Never commit secrets (`.env`, `.env.staging`, `.env.production` gitignored; templates carry
  placeholders only).
- Dirty-worktree caution (2026-09-25): this branch carries uncommitted backend changes — commit
  ONLY `apps/telegram-bots-gateway/` in todo commits (`feat(telegram-bots-gateway): …`).
- Conventional commits enforced by commitlint; never commit on `master`; `git reset --hard` /
  `revert --no-commit` forbidden without explicit approval.
