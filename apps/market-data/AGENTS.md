# apps/market-data/ — NestJS Knowledge Base

> Verified 2026-09-25 against code + `.omo/evidence/task-T3-01.log`.
> v0.1.0 (source of truth: `package.json`; Tramo 3, todos 0-1 DONE,
> 2-9 pending). Variante A monorepo (no Nx, no `libs/*` — G-16).
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
sibling (P13, todo 9). Todos 0-1 DONE (gate + setup, 6 stubs in
`app.module.ts`); todos 2-9 pending.
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

| Todo | Status                                                               | What                                                                            |
| ---- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 0    | DONE (evidence `.omo/evidence/task-0-mega-refactor-market-data.log`) | Precondition Gate T2: 6/6 backend `Moved to apps/feed-publisher` areas verified |
| 1    | DONE (evidence `.omo/evidence/task-T3-01.log`)                       | App setup + shared kernel (10 suites / 17 tests; boot smoke `:4000`)            |
| 2    | TODO                                                                 | Modules chain + provider + cache + rate-limiter                                 |
| 3    | TODO                                                                 | Module token: aggregate + aggregators + HTTP                                    |
| 4    | TODO                                                                 | Physical provider extraction + Dexter (C-DATA-01, last move)                    |
| 5    | TODO                                                                 | HTTP bridge + SLO + flag default (G-17)                                         |
| 6    | TODO                                                                 | Legacy market-data rename + frontend migration (R-4, G-18)                      |
| 7    | TODO                                                                 | Frontend: data dashboard + Dexter (C-UX-01)                                     |
| 8    | TODO                                                                 | Staging 7d + cutover + cleanup Tramo 3                                          |
| 9    | TODO                                                                 | dexter-onchain-bot app: extraction + cutover (P13, final phase)                 |

## PROGRAM STATUS

Todos 0-1 DONE (verified 2026-09-25 against code + evidence logs):

- Wired modules: health (live `GET /api/health`) + shared (global) +
  5 stub feature modules (token, chain, provider, cache, rate-limiter).
  0 business-logic modules yet — stubs boot, todos 2-3 fill them.
- Suite tally: 10 suites / 17 tests green (health, 5 stub modules,
  chain-id/token-id VOs, api-key guard, app config).
- P30 applied at setup: `MARKET_DATA_API_KEY` in `.env.example` day one;
  Dockerfile CMD `dist/main.js`; app-level `npm run dev`; staging+prod
  env templates + DBs `onchain_bot_market_data[_staging]` from day one;
  this AGENTS.md created viva from todo 1.
- Gate T2 recorded: 6/6 backend feed areas carry
  `Moved to apps/feed-publisher` headers (todo-0 log).

Todos 2-9 PENDING (not started, no evidence).

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
  src/app.module.ts      # Config global + Health + Shared + 5 stub modules
  src/health/            # GET /api/health static stub
  src/token/             # STUB (todo 3): snapshot + aggregators + HTTP
  src/chain/             # STUB (todo 2): catalog + probers + detect-chain
  src/provider/          # STUB (todo 2): health/latency registry + /api/v1/providers
  src/cache/             # STUB (todo 2): Redis+memory+interceptor (SLO layer)
  src/rate-limiter/      # STUB (todo 2): sliding window + circuit breaker
  src/shared/            # transversal (DONE, tested)
    config/              # app (MARKET_DATA_PORT) + database namespaces
    kernel/              # AggregateRoot/Entity/ValueObject/DomainEvent/DomainError
    value-objects/       # ChainIdVo (lowercased) + TokenIdVo (chain:address key)
    guards/              # ApiKeyGuard (MARKET_DATA_API_KEY)
    security/            # x-api-key helpers (fail-open when empty)
    decorators/          # @Public()
    filters/             # DomainExceptionFilter (DomainError -> HTTP)
```

## MODULES

All 5 feature modules are STUBS (empty `@Module({})`, boot-tested only).
`SharedModule` is `@Global()` (app + database config namespaces + guard

- filter). Business logic lands in todos 2-3; the 13 physical adapters
  land in todo 4 (C-DATA-01, last move — never earlier).

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

`GET /api/health` -> `{ status: 'ok' }` (static stub; composite probes land
with later todos and never claim liveness they don't have).

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
4. Token/chain/provider/cache/rate-limiter business logic (todos 2-3).
5. Physical provider extraction (todo 4, C-DATA-01).
6. HTTP bridge + SLO measurement + flag default (todo 5, G-17).
7. Legacy rename + frontend (todos 6-7, R-4/G-18/C-UX-01).
8. Deploy workflows (staging/prod) + rollback rehearsal (todo 8).
9. dexter-onchain-bot sibling (todo 9, P13).

## DECISIONS INDEX

| Decision                      | One-line                                                    | Status in this app                         |
| ----------------------------- | ----------------------------------------------------------- | ------------------------------------------ |
| Variante A v1 (G-16)          | Single-BC monorepo; spec `libs/*` → `src/*`                 | APPLIED (todo 1; mapping table in log)     |
| P30 Tramo-1 lessons           | x-api-key day one, `dist/main.js`, env templates, living KB | APPLIED (todo 1)                           |
| C-DB-01 own logical DB        | `onchain_bot_market_data[_staging]`                         | PLANNED (TypeORM unwired, GAP-1)           |
| C-DATA-01 providers move last | 13 adapters move in todo 4, never earlier                   | PINNED (stub comment in provider module)   |
| G-17 SLO-gated default        | `USE_DATA_SERVICE_API=true` only with p95<500ms measured    | PINNED (todo 5; flag OFF in all templates) |
| P39 standing rule             | AGENTS.md + CHANGELOG `## [Unreleased]` per todo            | APPLIED (this refresh)                     |

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
