# apps/market-data/ — NestJS Knowledge Base

> Verified 2026-09-25 against code + `.omo/evidence/task-T3-04.log`
> (todo 4 + P47) — prior tallies in `.omo/evidence/task-T3-address.log`
> (P45) and `.omo/evidence/task-T3-02.log`.
> v0.1.0 (source of truth: `package.json`; Tramo 3, todos 0-2 + 4 DONE,
> P45 address model DONE, P47 provider-home relocation DONE,
> todo-3 aggregators pending).
> Decisions cited as Pxx come from `.omo/drafts/mega-refactor-tramos.md`
> §7.6 (2026-09-24, P30 2026-09-25).
> Cross-tramo contracts pinned in `.omo/plans/mega-refactor-central.md`
> v2026-09-24; market-data plan in
> `.omo/plans/mega-refactor-market-data.md` (10 todos: 0-9).
> Spec base: `.kiro/specs/refactor-data/` (read as REQUIREMENTS, not
> topology: v1 topology is this app's `src/*`, G-16).

Contents: OVERVIEW · PROGRAM INDEX · PROGRAM STATUS · COMMANDS ·
STRUCTURE · MODULES · ENV INVENTORY · PORTS · HEALTH ·
TS/ESLINT CONVENTIONS · TESTS · GAPS · DECISIONS INDEX · DECISIONS ·
STANDING RULE · NOTES

## OVERVIEW

NestJS 11 service (Tramo 3 of the mega-refactor) owning all market data
outside the monolith: chain catalog + probers → provider registry →
aggregators (price/holders/security) → token snapshots over HTTP with
a measured p95<500ms SLO, plus the final-phase `dexter-onchain-bot`
sibling (P13, todo 9). Todos 0-2 DONE (gate + setup + chain/provider/
cache/rate-limiter + gateway shell); todos 3-9 pending.
See PROGRAM STATUS for the verified tally.

Design pivots that govern every future todo:

- **Variante A v1 (G-16)** — single-BC monorepo app. Every `libs/*`
  path in the spec maps to `src/*` here (providers →
  `token/infrastructure/providers`, aggregators →
  `token/application/services`, cache/rate-limiter → own modules,
  shared-kernel → `shared/`). Variante B (split apps / Nx) is a later
  phase gated on consumer count or p95 — never invented mid-todo.
- **C-DATA-01 order** — providers move LAST (todo 4), after Tramos 1-2
  consume enrichment via ports with flag. No early moves.
- **G-17 SLO gate** — `USE_DATA_SERVICE_API=true` becomes default only
  with a measured p95<500ms (todo 5). No cutover on promises.
- **C-DB-01 — own logical DB**: `onchain_bot_market_data[_staging]`
  on the same server as the backend DB per env.
- **P30 Tramo-1 lessons** — x-api-key day one, `dist/main.js`, app-level
  `npm run dev`, env templates staging+prod from setup, AGENTS.md vivo.

## PROGRAM INDEX

> Evidence filenames below are the REAL names on disk
> (`.omo/evidence/task-0-mega-refactor-market-data.log` for todo 0,
> `.omo/evidence/task-T3-01.log` for todo 1).

| Todo | Status                                                               | What                                                                                                                                                               |
| ---- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0    | DONE (evidence `.omo/evidence/task-0-mega-refactor-market-data.log`) | Precondition Gate T2: 6/6 backend `Moved to apps/feed-publisher` areas verified                                                                                    |
| 1    | DONE (evidence `.omo/evidence/task-T3-01.log`)                       | App setup + shared kernel (10 suites / 17 tests; boot smoke `:4000`)                                                                                               |
| 2    | DONE (evidence `.omo/evidence/task-T3-02.log`)                       | Modules chain + provider + cache + rate-limiter + gateway shell (P43)                                                                                              |
| P45  | DONE (evidence `.omo/evidence/task-T3-address.log`)                  | Address model absorbs token: `src/address/` + `/api/v1/addresses/*` (token = kind=token path; `/tokens/*` deprecated alias)                                        |
| 3    | TODO (model DONE via P45)                                            | Aggregators + persistence for address snapshots + HTTP batch                                                                                                       |
| 4    | DONE (evidence `.omo/evidence/task-T3-04.log`)                       | Physical provider extraction + Dexter-integrated (C-DATA-01, last move): 13 adapters canonical in `src/provider/infrastructure/`, registry 13/13, backend on shims |
| P47  | DONE (evidence `.omo/evidence/task-T3-04.log`)                       | Provider-home relocation: `address/infrastructure/providers/*` → `provider/infrastructure/<name>/` (single-level, P43-aligned)                                     |
| 5    | TODO                                                                 | HTTP bridge + SLO + flag default (G-17)                                                                                                                            |
| 6    | TODO                                                                 | Legacy market-data rename + frontend migration (R-4, G-18)                                                                                                         |
| 7    | TODO                                                                 | Frontend: data dashboard + Dexter (C-UX-01)                                                                                                                        |
| 8    | TODO                                                                 | Staging 7d + cutover + cleanup Tramo 3                                                                                                                             |
| 9    | TODO                                                                 | dexter-onchain-bot app: extraction + cutover (P13, final phase)                                                                                                    |

## PROGRAM STATUS

Todos 0-2 + 4 DONE (verified 2026-09-25 against code + evidence logs):

- Wired modules: health (live `GET /api/health`, `@Public()`) + shared
  (global) + address (P45 universal model) + token (deprecated P45
  alias) + chain/provider/cache/rate-limiter (ports, todo 2) +
  `ProvidersModule` (todo 4: the 13 canonical adapters) + gateway
  (P43: the ONLY feature controllers).
- Suite tally: 30 suites / 103 tests green (27/85 pre-todo-4 + 3 new
  todo-4 specs: registry-13, providers barrel, providers-module boot).
- Live edge verified on `:4000` (pre-todo-4): 6 chains, detect
  EVM+Solana, 7 provider statuses, address snapshot per kind,
  `/tokens/*` alias pinned to kind=token, unknown kind -> explicit
  `unknown` (no crash), 404 on unknown chain, `x-cache` HIT, x-api-key
  403/200 with key set (fail-open dev otherwise). Post-todo-4 the
  registry serves 13 statuses (edge re-verify lands with todo-5 SLO).
- Todo 4 (C-DATA-01, last move): 13 adapters physically extracted from
  `apps/backend/src/data-provider/` to `src/provider/infrastructure/`
  (P47 single-level home; byte-identical copies + relative-ized port
  imports, ConfigService wiring preserved so backend keys keep flowing
  through the shims). Registry extended 7 -> 13 descriptors (+`trading`
  kind for pumpdev). Backend keeps deprecated re-export shims only
  (dual-run, local default until todo-5 HTTP cutover; removed todo 8);
  zero `from 'data-provider` imports remain in backend `*.ts`.
  chain-dexter-bot stays INTEGRATED (standalone is todo 9); its scan
  path is covered by a market-data consumer suite (gap-7).
- P30 applied at setup: `MARKET_DATA_API_KEY` in `.env.example` day one;
  Dockerfile CMD `dist/main.js`; app-level `npm run dev`; staging+prod
  env templates + DBs `onchain_bot_market_data[_staging]` from day one;
  this AGENTS.md created viva from todo 1.
- Gate T2 recorded: 6/6 backend feed areas carry
  `Moved to apps/feed-publisher` headers (todo-0 log).

Todo 3 REMAINS (aggregators + persistence + batch HTTP — model half DONE
via P45). Todos 5-9 PENDING (not started, no evidence).

Worktree state 2026-09-25: DIRTY (new `apps/market-data/` tree untracked;
`apps/feed-publisher/` + backend touched by parallel Tramo-2 work —
out of scope, read-only here). No commit per dirty-worktree convention
(worktree left dirty, no commit).

## COMMANDS

```bash
npm run dev -w @onchain-bot/market-data   # watch, :4000
npm test -w @onchain-bot/market-data      # jest, all specs
npm run build -w @onchain-bot/market-data # nest build -> dist/main.js
curl -s localhost:4000/api/health            # {"status":"ok"}
docker compose -f apps/market-data/docker-compose.yml up -d  # pg :5438 + redis :6385
```

## STRUCTURE

```
apps/market-data/
  src/main.ts            # bootstrap :4000 (MARKET_DATA_PORT) + ValidationPipe
  src/app.module.ts      # Config global + Health + Shared + token stub + 4 port modules + Gateway (APP_GUARD ApiKeyGuard)
  src/health/            # GET /api/health (@Public(), skips edge auth)
  src/address/           # DONE (P45): AddressIdVo (chain+address+kind) + detector + snapshot service
  src/token/             # DEPRECATED (P45): thin alias of AddressModule (token = kind=token path)
  src/chain/             # DONE (todo 2): STATIC_CHAINS(6) + EVM/Solana probers + DetectChainService
  src/provider/          # HEXAGONAL (provider-hex): domain/ (port + descriptors + health VOs) + application/ (registry + checker + failover) + infrastructure/ (todo 4, P47: 13 canonical adapters + ProvidersModule); root files are compat re-exports
  src/cache/             # DONE (todo 2, global): CachePort + in-memory + CacheService + interceptor (SLO layer)
  src/rate-limiter/      # DONE (todo 2, global): sliding window + circuit breaker
  src/gateway/           # DONE (todo 2, P43): ONLY feature controllers (chains/providers/tokens-shell) + edge rate-limit guard
  src/shared/            # transversal (DONE, tested)
    config/              # app (MARKET_DATA_PORT) + database namespaces
    kernel/              # AggregateRoot/Entity/ValueObject/DomainEvent/DomainError
    value-objects/       # ChainIdVo (lowercased) + TokenIdVo (deprecated kind=token alias of AddressIdVo)
    guards/              # ApiKeyGuard (MARKET_DATA_API_KEY)
    security/            # x-api-key helpers (fail-open when empty)
    decorators/          # @Public()
    filters/             # DomainExceptionFilter (DomainError -> HTTP)
```

## MODULES

Token is absorbed (P45): `src/address/` owns the universal model
(Address = chain + address + kind wallet|token|program|exchange|
unknown) with format + optional-probe kind detection and a snapshot
service shared by all kinds (chain qualifier mandatory; unknown kinds
resolve to explicit `unknown`, never a crash). `src/token/` is a
deprecated alias (module re-exports AddressModule; TokenIdVo pins
kind=token). Chain, provider, cache, rate-limiter expose PORTS only
(no controllers — P43): the sole HTTP surface besides health is
`src/gateway/` (chains, providers, addresses + deprecated tokens
alias + `GatewayRateLimitGuard`; auth via global `ApiKeyGuard`).
`SharedModule`, `CacheModule`, `RateLimiterModule` are `@Global()`.
The 13 physical adapters live in `src/provider/infrastructure/`
(todo 4, C-DATA-01 + P47 — never earlier, never under `address/`).

## ENV INVENTORY

`.env.example` (7 vars): switches (`MARKET_DATA_ENABLED`,
`USE_DATA_SERVICE_API`), port, `MARKET_DATA_API_KEY` (inbound,
fail-open, P30 day-one), `DATABASE_URL` + `DATABASE_SYNCHRONIZE`,
`REDIS_URL`. Templates for staging (`:4001`, DB
`onchain_bot_market_data_staging`, `SYNCHRONIZE=false`) + prod (`:4002`,
DB `onchain_bot_market_data`) next to the app.
Staging prep status (todo 8, prep only): `docker-compose.staging.yml` +
`.env.staging.template` landed DRY-RUN (host `:4001`, DB
`onchain_bot_market_data_staging`); pending operator decision: staging
secrets (`MARKET_DATA_API_KEY`, pg password) are filled on the droplet
and never committed.

## PORTS

| Env     | App   | Postgres      | Redis         |
| ------- | ----- | ------------- | ------------- |
| dev     | :4000 | :5438         | :6385         |
| staging | :4001 | :5439         | :6386         |
| prod    | :4002 | server-shared | server-shared |

No clashes with backend (:3030), ingestion (:3031), frontend (:5173),
kol-system (:3050, pg :5435, redis :6382), feed-publisher (:3040, pg
:5436, redis :6383). Staging host ports :5439/:6386 verified free
repo-wide (grep zero source/config hits; operator to confirm with lsof
on Oracle at deploy).

## HEALTH

`GET /api/health` -> `{ status: 'ok' }` (`@Public()`, skips the global
edge auth; composite probes land with later todos and never claim
liveness they don't have). Gateway edge: `GET /api/v1/chains` (6),
`GET /api/v1/chains/detect?address=`, `GET /api/v1/providers` (13 since
todo 4), `GET /api/v1/addresses/:chain/:address[?kind=]` (P45; kind hint
optional, garbage -> explicit `unknown`), `GET /api/v1/tokens/
:chain/:address` (deprecated alias pinned to kind=token).

## TS/ESLINT CONVENTIONS

Mirrors kol-system/feed-publisher: `singleQuote`, strictNullChecks/noImplicitAny,
`emitDecoratorMetadata` + `experimentalDecorators`, path aliases
`shared/*`, `token/*`, `chain/*`, `provider/*`, `cache/*`, `src/*`. No `@/*`
alias here.

## TESTS

Jest (`testRegex: .*\.spec\.ts$`, `--forceExit --runInBand`). Failing-first:
every module/primitive landed with its spec in the same todo. Shared
coverage target >80% (pure units, no I/O).

## GAPS

1. Persistence entities/migrations (TypeORM wiring, `synchronize:false` outside dev).
2. `/metrics` exporter + Pino logging.
3. Redis adapters (cache + rate-limiter windows use `REDIS_URL`).
4. Address snapshot aggregators + persistence (todo 3 remainder:
   model + edge DONE via P45; aggregators + batch HTTP pending).
5. ~~Physical provider extraction (todo 4, C-DATA-01)~~ DONE
   (`src/provider/infrastructure/`, 13/13 registered; HTTP bridge +
   SLO + flag default remain todo 5, G-17).
6. HTTP bridge + SLO measurement + flag default (todo 5, G-17).
7. Legacy rename + frontend (todos 6-7, R-4/G-18/C-UX-01).
8. Deploy workflows (staging/prod) + rollback rehearsal (todo 8).
9. dexter-onchain-bot sibling (todo 9, P13).

## DECISIONS INDEX

| Decision                      | One-line                                                                               | Status in this app                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Variante A v1 (G-16)          | Single-BC monorepo; spec `libs/*` → `src/*`                                            | APPLIED (todo 1; mapping table in log)                                    |
| P30 Tramo-1 lessons           | x-api-key day one, `dist/main.js`, env templates, living KB                            | APPLIED (todo 1)                                                          |
| C-DB-01 own logical DB        | `onchain_bot_market_data[_staging]`                                                    | PLANNED (TypeORM unwired, GAP-1)                                          |
| C-DATA-01 providers move last | 13 adapters move in todo 4, never earlier                                              | APPLIED (todo 4: canonical `src/provider/infrastructure/`, backend shims) |
| P46 extraction mechanics      | Copy + shim (byte-identical, local default; HTTP cutover is todo 5)                    | APPLIED (todo 4: zero backend `from 'data-provider` imports)              |
| P47 provider home             | Single-level `src/provider/infrastructure/<name>/` (P43-aligned, not under `address/`) | APPLIED (todo 4 close-out relocation)                                     |
| G-17 SLO-gated default        | `USE_DATA_SERVICE_API=true` only with p95<500ms measured                               | PINNED (todo 5; flag OFF in all templates)                                |
| P43 gateway de salida         | `src/gateway/` owns aggregated-data HTTP; modules expose ports only                    | APPLIED (todo 2: 3 controllers + edge guard, zero module controllers)     |
| P45 address universal model   | `src/address/` absorbs token (kind discriminator); `/tokens/*` deprecated alias        | APPLIED (this change: model + detector + snapshots + edge)                |
| P39 standing rule             | AGENTS.md + CHANGELOG `## [Unreleased]` per todo                                       | APPLIED (this refresh)                                                    |

## DECISIONS

- P30 applied: `MARKET_DATA_API_KEY` in `.env.example` day one;
  Dockerfile CMD `dist/main.js`; app-level `npm run dev`; staging+prod
  env templates from setup; this AGENTS.md created viva from todo 1.
- Root `package.json` untouched (no `dev:market-data` alias — same as
  kol-system/feed-publisher; run via `-w @onchain-bot/market-data`). Kept
  read-only outside `apps/market-data/` except the mandated evidence logs
  (lockfile untouched — no new deps: all resolve via hoisted root modules,
  same as feed-publisher todos 2-8).
- Deps mirror feed-publisher minus LLM/queue stack (no `openai`,
  `bullmq`, `@nestjs/schedule` — this service has no queue, no cron, no
  LLM in v1; added in later todos only if the plan demands).
- Triplet 4000/4001/4002 + pg :5438/:5439 + redis :6385/:6386 verified
  free repo-wide (grep + lsof, see evidence log).
- Failing-first: all 10 spec files authored before their implementation
  files in this todo; suites run green after.
- P45 (address model): `src/address/` (kind enum + `AddressIdVo` +
  `AddressKindDetectorService` with hint > registry > probe > format
  precedence + `AddressSnapshotService` shared by all kinds) absorbs
  `src/token/` (deprecated alias: module re-exports AddressModule,
  TokenIdVo pins kind=token). Gateway gains `AddressesController`
  (`/api/v1/addresses/:chain/:address[?kind=]`, chain mandatory);
  TokensSnapshotController delegates as a kind=token alias.
  Format-only evidence never guesses wallet-vs-token (returns explicit
  `unknown`); the on-chain probe hook (`AddressProbe.isContract`)
  refines when present (RPC evidence lands with todo-4 adapters).
  tsconfig + jest mapper gained `address/*`.
- Todo 2 (P43 gateway): `src/gateway/` holds the only feature
  controllers (chains, providers, addresses + deprecated tokens
  alias + `GatewayRateLimitGuard` 60/min/IP + cache
  (`CacheInterceptor`, `x-cache` HIT/MISS) + global `ApiKeyGuard`
  (health `@Public()`). v1 probers are format-only (no RPC — RPC
  evidence lands with the todo-4 adapter extraction). tsconfig + jest
  mapper gained `rate-limiter/*` + `gateway/*`.
- P46 (todo 4 extraction mechanics): adapters copied byte-identical
  (only the `DataProviderPort` import re-pointed to the sibling
  `core/`); Nest `forRoot`/`forRootAsync` ConfigService wiring
  preserved so backend env keys keep flowing through the shims with
  zero behavior change. Backend `src/data-provider/**` (68 files) are
  deprecated `export *` shims; 13 consumers (10 enrichment adapters +
  2 chain probers + ticker-resolver) import the canonical home via
  relative paths — local default until the todo-5 HTTP bridge (G-17).
  Failing-first: registry-13 + barrel + module-boot specs (red before
  the copy, green after); backend shim-identity + dexter-consumer
  suites pin every consumer (adversarial: first drift fails fast).
- P47 (todo 4 close-out relocation): adapters first landed under
  `src/address/infrastructure/providers/` (P45 path from the plan)
  then moved single-level to `src/provider/infrastructure/<name>/`
  (P43-aligned: provider code lives with the provider port, address
  consumes via ports only — verified zero deep imports). Plain `mv`
  (tree untracked, `git mv` refused); all 84 backend references +
  `AppModule` re-pointed; `tsc` + suites re-greened after the move.
- Provider-hex (pure restructure, no behavior change): `src/provider/`
  is now hexagonal — `domain/` (DataProviderPort, descriptors, health
  VOs) <- `application/` (registry composes the extracted
  `ProviderHealthChecker` with the identical truth table, plus an
  additive `listFailoverOrder` over the pure `ProviderFailoverPolicy`)
  <- `infrastructure/<name>/` (one dir per adapter: service + config +
  types + module). Root `provider-registry.service.ts` /
  `provider-descriptor.ts` and `infrastructure/core/` stay as compat
  re-exports so `provider/*` consumers (address, gateway) and the
  backend cross-app shims resolve unchanged; 13 adapter services now
  import the port from `../../domain/`. Verified 30 suites / 103 tests
  (identical to pre-move) + `tsc` + `nest build` clean.

## STANDING RULE

Update this file on every todo (program index + program status +
gaps + decisions) plus a `CHANGELOG.md` `## [Unreleased]` entry in
English per `RELEASE-FLOW.md` (P39). Stale knowledge base = failed todo.

## NOTES

- Gate T2 record: `.omo/evidence/task-0-mega-refactor-market-data.log`
  (6/6 backend feed areas with `Moved to apps/feed-publisher` headers).
- `libs/*` → `src/*` mapping (G-16): providers →
  `token/infrastructure/providers`; aggregators →
  `token/application/services`; cache/rate-limiter → own modules;
  shared-kernel → `shared/`; chain probers → `chain/`. Variante B stays
  a gated later phase — no module invented without a mapping row.
