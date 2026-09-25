# apps/kol-system/ — NestJS Knowledge Base

> Verified 2026-09-25 against code. v0.1.0 (source of truth: `package.json`; Tramo 1 scaffold, todos 2+4+5 built).
> Decisions cited as Pxx come from `.omo/drafts/mega-refactor-tramos.md` §7.6 (2026-09-24).

Contents: OVERVIEW · PROGRAM INDEX · COMMANDS · STRUCTURE · MODULES · INGESTION ·
ENV INVENTORY · PORTS · HEALTH · TS/ESLINT CONVENTIONS · TESTS · MODULE MAP ·
SNAPSHOTS · GAPS · STANDING RULE · NOTES

## OVERVIEW

NestJS 11 service (Tramo 1 of the mega-refactor) that will own the whole KOL
alpha-call path: KOL mentions in → extraction → enrichment → templates →
dashboard/rankings (+ optional per-template publishing). Built today:
Config + `GET /api/health` + `IngestionModule` (SSE-only KOL client, P20) +
`ExtractionModule` (contract × mention, P5, direct call + P26 snapshot
bases, todo 5) wired into `AppModule`.

Design pivots (2026-09-24) that govern every future todo:

- **P1 — NO dedup of any kind in kol-system**: repeats are first-class data
  (each mention = one row). Ingestion-telegram dedups source-side; kol-system
  adds no layer of its own.
- **P3 — ingestion by type**: consumes `kol`-type messages from
  ingestion-telegram, distinct from `crypto-news` (the `route(raw,
kol|crypto-news)` coordinator already exists over there).
- **P4 — identity/sources live in ingestion-telegram**: sources have 2 types
  (`kol` + `crypto-news`). kol-system stores NO profiles; it consumes sources
  over HTTP (`GET /api/feed/sources?type=kol`). KOL avatar is resolved once by
  ingestion-telegram (MTProto) and served from then on (see P19 note in GAPS).
- **P5 — extraction = contract × mention**: smart contract per KOL mention +
  timestamp + handle + url + channel info + own db-id. Repeated = valid
  (feeds "called from @handle 8min ago"). Frontend table: `caller | call | mc
at | time ago | more details +`.
- **P10 — strict type separation**: kol-system subscribes ONLY to
  `messageType==='kol'` (crude, unmixed). No todo may subscribe to the foreign
  type (`crypto-news` belongs to content-publisher).
- **P14 — vip-calls absorbed by templates**: `vip-calls` is NOT a module —
  it is the generic NAME of a default seed template. Backend
  `apps/backend/src/telegram/vip-calls/` is deleted at cleanup, never
  recreated under any name.
- **P16 — single dashboard with source selector**: each template has ONE
  dashboard; template stores `kolSourceIds: string[]` (empty = all).
- **P17 — horizontal dashboard layout** (planned, not built — gap 6): ranking
  performance HORIZONTAL 10 total (5 left + 5 right) with arrows toggling
  perf asc↔desc; horizontal top-10 callers strip by call COUNT with 30D/7D/1D
  selector; extended template-config section. Backend: `kol_window_stats`
  holds `total_x` + `calls_count` per (caller, window); ranking endpoint
  exposes both + `sort=perf_asc|perf_desc`.
- **P18 — gradual per-BC deprecation**: each completed BC deprecates its
  backend counterpart immediately (`@deprecated` header + pointer, pattern
  `scripts/add-deprecation-headers.js`); deletion only in todo 16.
- **P19 — avatar source of truth permanent** (ingestion-telegram owns it, no
  consumer here yet — gap 5): MTProto fetch-ONCE at source registration,
  stored PERMANENTLY, EXCLUDED from the 72h janitor; `avatarUrl` in the
  `GET /api/feed/sources` projection; no periodic refresh (explicit manual
  only); placeholder fallback.
- **P20 — SSE-only, no polling** (done 2026-09-24, was gap 2): listener
  filters `data.messageType==='kol'` client-side; reconnect catch-up by
  cursor (`GET /api/feed/messages?type=kol` from last messageId, NO periodic
  loop). The 1-min fallback built in todo 4 was removed the same day — do
  NOT add new polling citing anything but P20.
- **P21 — health per component + shared without duplicating**: every move-todo
  registers its indicator in `GET /api/health`; reuse `src/shared/`, extend it
  instead of copying.
- **P22/P23 — telegram config via DB, zero KOL env**: bot tokens + channels
  live in DB (`template_bot_tokens` / `telegram_bots` + `bot_id` +
  `channel_target`); NO `KOL_BOT_TOKEN` exists, not even as seed (P23
  follow-up removes it from validation if todos 2-3 added it).
- **P24 — multi-env envs**: distinct `ENCRYPTION_KEY` per env; tracked
  templates `.env.development` / `.env.staging.template` /
  `.env.production.template` (placeholders, NO secrets); real files gitignored,
  copied via `scp` to OracleDroplet on deploy. Backend-mirror pattern.
- **P26 — snapshot per extraction, 4 timestamps** (planned — see SNAPSHOTS):
  each ingestion → extraction emits a base snapshot, enrichment completes it
  in table `mention_snapshots` (`occurred_at_telegram`, `ingested_at_kol`,
  `enriched_at`, `snapshot_at` = `enriched_at`). Performance compares vs the
  LAST snapshot of (caller, contract).
- **P27 — snapshots in own module, SAME DB** (planned — see SNAPSHOTS):
  `src/snapshot/` with its own tables inside the kol-system DB (no separate
  DB; enrichment writes via port). Joins + single-transaction atomicity;
  split (timescale/partition) only if volume demands.
- **P25 — this file is living**: created in todo 21, updated at the close of
  every task set (see STANDING RULE).

## PROGRAM INDEX (mega-refactor, branch `feat/mega-refactor-tramos`)

Order: kol-system → content-publisher → market-data (+ `dexter-onchain-bot`
as Tramo 3 final phase, P13). All paths verified 2026-09-24.

| Tramo            | Plan                                            | Scope                           |
| ---------------- | ----------------------------------------------- | ------------------------------- |
| central (index)  | `.omo/plans/mega-refactor-central.md`           | order, contracts, cutover       |
| 1 · kol-system   | `.omo/plans/mega-refactor-kol-system.md`        | this app (16 todos)             |
| 2 · content-pub. | `.omo/plans/mega-refactor-content-publisher.md` | crypto-news (12 todos)          |
| 3 · market-data  | `.omo/plans/mega-refactor-market-data.md`       | data service + Dexter (9 todos) |

Decisions source: `.omo/drafts/mega-refactor-tramos.md` §7.6 (P1–P27).
Target tree: `.omo/reference/mega-refactor-target-tree.md` — names
`apps/content-publisher/`, `apps/market-data/`, `apps/dexter-onchain-bot/`
as PLANNED (not yet scaffolded; only `apps/kol-system/` exists).

## COMMANDS

```bash
# In apps/kol-system/
npm run start:dev          # nest start --watch (port KOL_SYSTEM_PORT, default 3050)
npm run start:debug        # nest start --debug --watch
npm run start:prod         # node dist/main (after build)
npm run build              # nest build
npm test                   # jest --forceExit --runInBand --testTimeout=30s (co-located *.spec.ts)
npm run test:watch         # jest --watch --forceExit
npm run test:cov           # jest --coverage → ./coverage
npm run test:e2e           # jest --config ./test/jest-e2e.json (.e2e-spec.ts)
npm run lint               # eslint "{src,test}/**/*.ts" --fix
npm run format             # prettier --write "src/**/*.ts" "test/**/*.ts"
```

Versions verified live 2026-09-24 (invocations, not full suites):

```text
$ npx tsc --version    → Version 5.9.3
$ npx jest --version   → 30.4.1
$ npx eslint --version → v9.39.4
$ curl -s localhost:3059/api/health → {"status":"ok"}
```

Health was verified by booting `node dist/main.js` with
`KOL_SYSTEM_PORT=3059` and curling `GET /api/health` → 200 +
`{"status":"ok"}` (process stopped afterwards; evidence log holds the output).

## STRUCTURE

```text
src/
├── main.ts                       # bootstrap() — ValidationPipe whitelist/forbidNonWhitelisted/transform, listen KOL_SYSTEM_PORT ?? 3050
├── app.module.ts                 # Config (envFilePath ['.env.dev', '.env']) + HealthModule + IngestionModule + ExtractionModule (all wired)
├── health/
│   ├── health.module.ts
│   ├── health.controller.spec.ts
│   └── api/http/health.controller.ts   # GET /api/health → { status: 'ok' } (static shape)
├── ingestion/                    # BUILT (todo 4) + WIRED into AppModule (P20 SSE-only)
│   ├── ingestion.module.ts       # providers: ProcessKolMessageHandler, KolIngestionClientService, KolIngestionClientPort→Adapter
│   ├── domain/ports/ingestion-client.port.ts
│   ├── application/
│   │   ├── handlers/process-kol-message.handler.ts (+ .spec.ts)
│   │   └── services/kol-ingestion-client.service.ts (+ .spec.ts)  # SSE-only, catch-up by cursor, backoff 1s→30s
│   └── infrastructure/http/
│       ├── ingestion-http-client.adapter.ts (+ .spec.ts)
│       └── dto/kol-source.dto.ts, raw-kol-message.dto.ts
├── extraction/                   # BUILT (todo 5, P5+P26) + WIRED into AppModule
│   ├── extraction.module.ts      # providers: ExtractFromMessageUseCase, ExtractorPort→RegexExtractorAdapter,
│   │                             #   ExtractionCandidateRepository→InMemory, ExtractionHealthIndicator (hook point, P21)
│   ├── domain/entities/extraction-candidate.entity.ts (+ .spec.ts)  # contract × mention, db-id kolId:messageId:index
│   ├── domain/snapshot-base.ts   # P26 base: occurred_at_telegram + ingested_at_kol (no enriched_at)
│   ├── domain/ports/extractor.port.ts
│   ├── domain/value-objects/ticker.vo.ts, url.vo.ts
│   ├── application/handlers/extract-from-message.use-case.ts (+ .spec.ts)  # direct call fix-1, returns { candidates, snapshotBases }
│   ├── application/ports/extraction-candidate.repository.ts
│   ├── infrastructure/adapters/regex-extractor.adapter.ts (+ .spec.ts)     # NO Map-dedupe (P1): one entry per occurrence
│   ├── infrastructure/repositories/in-memory-extraction-candidate.repository.ts  # upsert by id = double-delivery guard
│   └── health/extraction-health.indicator.ts  # check() → { component: 'extraction', status } (unwired until composite health)
├── shared/                       # kernel/config/guards/filters — REUSE, extend, never copy (P21)
│   ├── kernel/aggregate-root.ts, entity.ts, value-object.ts, domain-error.ts, domain-event.ts (+ specs)
│   ├── value-objects/chain-hint.vo.ts, normalized-address.vo.ts (+ spec)  # P21 identity VOs (EVM/Solana) — extraction/parsing/normalization share this home
│   ├── config/app.config.ts (+ spec)          # Tier-1: ENCRYPTION_KEY + DATABASE_URL required
│   ├── config/database.config.ts (+ spec)
│   ├── config/redis.config.ts (+ spec)
│   ├── config/telegram.config.ts (+ spec)     # botToken '' by design — DB catalog (P23), no env fallback
│   ├── guards/api-key.guard.ts (+ spec)       # fail-open when KOL_SYSTEM_API_KEY empty
│   ├── filters/domain-exception.filter.ts (+ spec)
│   └── shared.module.ts (+ spec)
test/
├── health.e2e-spec.ts
└── jest-e2e.json
Root: package.json (@alpha-meta-token-scanner/kol-system v0.1.0), nest-cli.json (deleteOutDir),
tsconfig{,.build}.json, docker-compose.yml (postgres :5435, redis :6382), Dockerfile,
.env.example, coverage/, dist/
```

## MODULES (app.module.ts — verified list)

Wired today: `ConfigModule` (global, `.env.dev` > `.env`) + `HealthModule` +
`IngestionModule` (todo 4, SSE-only KOL client per P20 — wired 2026-09-24) +
`ExtractionModule` (todo 5, contract × mention per P5 + P26 snapshot bases —
wired 2026-09-25).

Planned (per spec, NOT built — do not import until their todos land):
normalization, enrichment (market-data bridge, P7), scoring,
templates (+ classification inside templates, P6), approval, publishing
(per-template bots, P9/P12b), tracking (first-appearance, P8), rankings (P11).

## INGESTION — SSE-only (`ingestion/`)

`KolIngestionClientService` (`application/services/`) subscribes to `GET
{INGESTION_TELEGRAM_URL}/api/ingestion/stream` and accepts ONLY frames whose
`data.messageType==='kol'` — the top-level frame kind is `message:telegram`
for every telegram frame, so filtering MUST be client-side (P10). There is NO
periodic polling loop (P20): gaps while the stream is down are closed by an
explicit catch-up read (`GET /api/feed/messages?type=kol`, rows newer than
the per-channel cursor) on boot and after every disconnect. Disconnects back
off 1s doubling → 30s cap.

Do NOT add new polling without citing P20.

Base URL resolution: `INGESTION_TELEGRAM_URL` config → env → default
`http://localhost:3031` (dev default; per env it points at the OWN
ingestion-telegram instance — invariant 1:1, same as the backend).

## EXTRACTION — contract × mention (`extraction/`, todo 5)

`ExtractFromMessageUseCase` runs as a DIRECT call (fix-1, no event bus):
one `ExtractionCandidate` per contract occurrence — multi-tip messages do
NOT collapse (override of the backend collapse-to-one), repeats are valid
(each = own row, own db-id `kolId:messageId:contractIndex`). Regexes mirror
the backend adapter but its `Map`-dedupe is deliberately NOT copied (P1).
Text without contracts → empty arrays, never a throw; malformed addresses
are skipped with a debug log. The ONLY guard is double-delivery: the repo
upserts by deterministic id, so realtime + catch-up re-delivery overwrites
the same rows.

P26 handoff is a DIRECT return (`{ candidates, snapshotBases }`), not an
event. Justification: kol-system wires no event bus at this stage; the head
of the money-path stays synchronous/deterministic (no lossy pub/sub between
extraction and enrichment); the snapshot row itself belongs to the planned
`src/snapshot/` module (P27), which enrichment will write via port.
`enriched_at` is therefore absent from the base by design.

## ENV INVENTORY (`.env.example`, 26 lines — verified)

| Var                             | Value / default in example                                        | Notes                                                           |
| ------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------- |
| `KOL_SYSTEM_ENABLED`            | `false`                                                           | master switch                                                   |
| `TEMPLATE_ORCHESTRATOR_ENABLED` | `false`                                                           | template orchestrator flag                                      |
| `INGESTION_TELEGRAM_URL`        | `http://localhost:3031`                                           | OWN ingestion per env (dev `:3031`, twin `:3033`, prod `:3032`) |
| `ENCRYPTION_KEY`                | ``(empty — generate`openssl rand -hex 32`, NEVER commit)          | Tier-1 required, DISTINCT per env (P24)                         |
| `DATABASE_URL`                  | `postgres://…@localhost:5432/alpha_meta_token_scanner_kol_system` | Tier-1 required; logical DB owned by kol-system                 |
| `REDIS_URL`                     | `redis://localhost:6379/0`                                        | optional-with-warning (falls back to in-memory)                 |
| `KOL_SYSTEM_PORT`               | `3050`                                                            | dev default                                                     |
| `KOL_SYSTEM_API_KEY`            | (absent from example — guard reads it, fail-open when empty)      | optional-with-warning                                           |

Tier-1 validation (`validateKolSystemConfig`): `ENCRYPTION_KEY` +
`DATABASE_URL` must be non-empty or boot throws `ConfigValidationError`.
There is NO `KOL_BOT_TOKEN` and there never will be (P23 — dashboard-only
boot; bot resolution moves to the DB catalog `template.bot_id`).

P24 templates (tracked, placeholders, NO secrets): `.env.development`,
`.env.staging.template`, `.env.production.template`. Real files
(`.env.staging`, `.env.production`) are gitignored and copied via `scp` to
OracleDroplet on deploy — backend-mirror pattern. `scp` note: copy the
template to the real name ON the server, fill secrets by hand there, never
commit.

## PORTS

Spec triplet (kol-system): **3050 / 3051 / 3052** (dev / staging / prod —
`.omo/drafts/mega-refactor-tramos.md` §4 A6, validated §7.1).

| Service                      | Dev     | Staging twin | Prod      |
| ---------------------------- | ------- | ------------ | --------- |
| kol-system HTTP              | `:3050` | `:3051`      | `:3052`   |
| kol-system DB                | `:5435` | (per-env)    | (per-env) |
| kol-system Redis             | `:6382` | (per-env)    | (per-env) |
| ingestion (its own, per env) | `:3031` | `:3033`      | `:3032`   |

Local `docker-compose.yml`: postgres `5435:5432` (db
`alpha_meta_token_scanner_kol_system`), redis `6382:6379`. No clash with
backend (`:3030/:5432/:6379`) or ingestion (`:3031/:3032/:3033`).
DB naming follows `<base>_<app>` per env (contract C-DB-01):
`alpha_meta_token_scanner_kol_system[_staging]`.

Port discrepancy to know: `main.ts` listens on `KOL_SYSTEM_PORT ?? 3050`,
while `buildAppConfig().port` reads `PORT ?? 3030`. Canonical runtime port is
`KOL_SYSTEM_PORT=3050` (main.ts wins); do not set bare `PORT` expecting 3050.

## HEALTH

`GET /api/health` → 200 + `{ status: 'ok' }` (static shape, todo 2).
Per P21 each move-todo registers its indicator here (`ingestion.sse`,
`database`, `redis`, +1 per module:
extraction/parsing/normalization/enrichment/scoring/templates/approval/publishing/tracking).
`ExtractionHealthIndicator.check()` (`extraction/health/`, todo 5) is the
extraction hook point — provided + exported, NOT yet consumed (no composite
health system exists; wiring lands with the composite-health todo, gap 3).
Staging verification (todo 15): health with ALL components `up`.

## TS/ESLINT CONVENTIONS

- TypeScript 5.9 (verified `5.9.3`), `strictNullChecks`, `noImplicitAny`,
  `noFallthroughCasesInSwitch`, `forceConsistentCasingInFileNames`,
  `isolatedModules` — mirroring the backend `tsconfig.base.json` set
  (`strict` NOT enabled globally). Backend uses `nodenext`; this app follows
  the same NestJS layout.
- Path aliases (`package.json` jest `moduleNameMapper`, `tsconfig.json`):
  `shared/*`, `telegram/*`, `src/*` rooted at `src/`. No `@/*` (frontend-only).
- ESLint (flat config, backend-mirror): `@typescript-eslint/no-explicit-any`
  off, `require-await` off, `no-floating-promises`/`no-unsafe-*` warn,
  unused vars warn (`^_`), `prettier/prettier` error.
- Prettier: `singleQuote: true`, `trailingComma: "all"` (root config).
- NestJS: `deleteOutDir: true` in `nest-cli.json`;
  `process.noDeprecation = true` in `main.ts` (pg + TypeORM noise).
- `ConfigModule.envFilePath: ['.env.dev', '.env']` — `.env.dev` wins.
- DDD: `AggregateRoot`/`Entity`/`ValueObject`/`DomainEvent`/`DomainError`
  base classes in `src/shared/kernel/` (mirroring backend `shared/kernel/`).
  No `@Entity` in domain layer; never update DB directly (through aggregate);
  never publish events before `commit()`.

## TESTS

```bash
npm test            # jest --forceExit --runInBand --testTimeout=30s
npm run test:e2e    # jest --config ./test/jest-e2e.json
npm run test:cov    # → ./coverage
```

Strategy (backend-mirror): co-located `*.spec.ts` (`testRegex:
.*\.spec\.ts$`); e2e in `test/*.e2e-spec.ts` (separate `jest-e2e.json`,
moduleNameMapper into `../src/`). In-memory repos when DB disabled; no
coverage thresholds enforced. MTProto restriction applies transitively: never
init a `TelegramClient` in tests (single session per env lives in
ingestion-telegram; duplicates cause `AUTH_KEY_DUPLICATED`).

## MODULE MAP (as built + planned)

Built (wired): `HealthModule` (`GET /api/health`) + `IngestionModule`
(SSE-only, P20) — `KolIngestionClientService` (realtime SSE + catch-up by
cursor, backoff 1s→30s) + `ProcessKolMessageHandler` +
`KolIngestionClientPort → IngestionHttpClientAdapter` (feed reads
`?type=kol`) + DTOs (`kol-source.dto`, `raw-kol-message.dto`).
Built (infra): `SharedModule` pieces — kernel, 4 configs, api-key guard,
domain-exception filter.
Built (domain): `ExtractionModule` (todo 5, P5+P26 — `ExtractFromMessageUseCase`
direct call fix-1, `ExtractionCandidate` per occurrence, snapshot bases via
direct return; identity VOs `ChainHint`/`NormalizedAddress` extended in
`src/shared/value-objects/`, P21).
Planned: normalization → enrichment (P7 market-data bridge: `mc at` + `more details +`;
completes snapshot P26) → snapshot (`src/snapshot/` own module, same DB, P27;
planned, not built) → templates with embedded
classification (P6: channel picker + score viz + gem filters) → scoring →
approval → publishing (P9/P12b per-template bots, P22/P23 DB catalog +
P23-bis admin-verified targets) → tracking (P8 first-appearance) → rankings
(P11 `GET /api/kol-rankings?window=30d|7d|1d`, cron-fed `kol_window_stats`,
P17 layout) → dashboard (P16 single + source selector).

Explicitly NOT in kol-system: `crypto-news` (content-publisher, P10),
`vip-calls` as code (template name only, P14), Dexter lookup
(`apps/dexter-onchain-bot`, P13), data providers (Tramo 3 owns extraction,
contract C-DATA-01 — consume via ports, never move).

## EXTRACTION → ENRICHMENT → FRONTEND FLOW

- Extraction (P5) extracts the smart contract per mention (contract × mention,
  repeats valid) but does NOT serve it to the frontend directly.
- Each extraction passes to enrichment first; enrichment talks to
  `apps/market-data` to fetch the market snapshot that fills `mc at` and
  `more details +` in the dashboard (P7).
- Frontend only renders enriched mentions (contract + market data together).

## SNAPSHOTS (P26 base live in extraction, P27 table planned)

Each extraction emits a base snapshot (`ExtractionSnapshotBase`, via the
use-case direct return — no bus); enrichment will complete it in table
`mention_snapshots` (owned by planned module `src/snapshot/`, SAME kol-system
DB — no separate DB; enrichment writes via port).

| Column                 | Set by             | Meaning                    |
| ---------------------- | ------------------ | -------------------------- |
| `occurred_at_telegram` | ingestion-telegram | capture in Telegram        |
| `ingested_at_kol`      | kol-system         | arrival here               |
| `enriched_at`          | enrichment         | market data attached       |
| `snapshot_at`          | enrichment         | = `enriched_at`, snap time |

Performance compares against the LAST snapshot of (caller, contract)
(e.g. +55X vs last snapshot MC). Rationale: mention↔snapshot joins +
single-transaction atomicity; split (timescale/partition) only if volume
demands.

## GAPS (verified 2026-09-24 — fix in their own todos, not opportunistically)

1. RESOLVED 2026-09-24 — `IngestionModule` wired into `AppModule`
   (Config + Health + Ingestion); SSE client boots at runtime.
2. RESOLVED 2026-09-24 (P20 done) — 1-min polling fallback removed;
   SSE-only with reconnect catch-up by cursor. No `setInterval`/`pollTimer`
   remains in non-spec source.
3. `GET /api/health` is a static stub — no per-component indicators yet (P21).
   `ExtractionHealthIndicator` (todo 5) exists as an unwired hook point;
   wiring lands with the composite-health todo.
4. `buildAppConfig().port` reads `PORT ?? 3030` while `main.ts` uses
   `KOL_SYSTEM_PORT ?? 3050` — bare `PORT` will mislead.
5. P19 avatar pipeline (ingestion resolves + serves permanently, excluded
   from 72h janitor, `avatarUrl` in feed projection, fetch-once) has no
   consumer here yet.
6. P11/P17 ranking + `kol_window_stats` + `GET /api/kol-rankings` not built.
7. No MTProto anywhere here by design (sessions live ONLY in
   ingestion-telegram, one triple per env). No data providers here by design
   (Tramo 3, C-DATA-01).
8. P24 templates `.env.development` / `.env.staging.template` /
   `.env.production.template` do not exist yet — only `.env.example`.
9. P26/P27 `src/snapshot/` + `mention_snapshots` not built (no consumer yet —
   extraction emits the P26 base in-memory via direct return since todo 5).
10. `bs58` is a declared kol-system dep (Solana validation, backend-mirror
    `^6.0.0`, resolved via hoisted root `node_modules`).

## STANDING RULE

Every future todo ends with: **"update AGENTS.md if anything changed"**
(P25). If commands, ports, envs, modules, routes, or decisions moved, this
file moves with them — same living-doc pattern as the other `apps/*/AGENTS.md`.

## NOTES

- `.env.dev` takes precedence over `.env` (both this service and the backend).
- Never commit secrets (`.env`, `.env.staging`, `.env.production` gitignored;
  templates carry placeholders only).
- Dirty-worktree caution: branch/topology decisions for the mega-refactor
  live in the drafts doc §6 (new `feat/mega-refactor-tramos` branch from
  `dev`); `M .omo/boulder.json` is out of scope — do not drag it into the
  branch.
- Conventional commits (`feat:`, `fix:`, …) enforced by commitlint; never
  commit on `master` (hook blocks); `git reset --hard` / `revert --no-commit`
  forbidden without explicit approval.
