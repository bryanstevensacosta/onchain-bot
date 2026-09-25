# apps/kol-system/ — NestJS Knowledge Base

> Verified 2026-09-24 against code. v0.1.0 (source of truth: `package.json`; Tramo 1 scaffold, todos 2+4 built).
> Decisions cited as Pxx come from `.omo/drafts/mega-refactor-tramos.md` §7.6 (2026-09-24).
> Cross-tramo contracts (C-DB-01, C-SSE-01, C-SHARED-01/C2, C-DATA-01, C-BOTS-01) pinned in
> `.omo/plans/mega-refactor-central.md` v2026-09-24; threads stub C1 lives in
> `.omo/plans/mega-refactor-content-publisher.md` todo 8; market-data bridge + dexter app in
> `.omo/plans/mega-refactor-market-data.md` todos 4-9.

Contents: OVERVIEW · COMMANDS · STRUCTURE · MODULES · INGESTION · ENV INVENTORY ·
PORTS · HEALTH · TS/ESLINT CONVENTIONS · TESTS · MODULE MAP · GAPS · STANDING RULE · NOTES

## OVERVIEW

NestJS 11 service (Tramo 1 of the mega-refactor) that will own the whole KOL
alpha-call path: KOL mentions in → extraction → enrichment → templates →
dashboard/rankings (+ optional per-template publishing). Skeleton today:
Config + `GET /api/health` wired; ingestion client (SSE + polling fallback)
implemented but NOT yet wired into `AppModule`.

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
  it is the generic NAME of a default seed template. Backend `vip-calls/`
  is deleted at cleanup, never recreated under any name.
- **P16 — single dashboard with source selector**: each template has ONE
  dashboard; template stores `kolSourceIds: string[]` (empty = all).
- **P18 — gradual per-BC deprecation**: each completed BC deprecates its
  backend counterpart immediately (`@deprecated` header + pointer, pattern
  `scripts/add-deprecation-headers.js`); deletion only in todo 16.
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
- **P25 — this file is living**: created in todo 21, updated at the close of
  every task set (see STANDING RULE).
- **P6/P7/P8/P9 — templates own classification; enrichment bridges market-data;
  tracking is first-seen; bots are per-template optional**: no separate
  classification BC (channel picker + score viz + gem filters live in the
  template); enrichment consumes `apps/market-data` for `mc at` + `more details
+`; tracking = `First time` vs `Nx from last call`; each template may carry
  its own publishing bot token (BYO-token, viable publishing-only).
- **P11/P17 — rankings + horizontal layout**: `GET /api/kol-rankings?window=30d|7d|1d`
  over cron-fed `kol_window_stats(caller, window, total_x, calls_count)`;
  multiple per call = `last_mc / first_mc_at`, SUM per caller; performance rank
  horizontal 10 (5 left + 5 right, arrows flip asc/desc) + top-10 callers strip
  by call count with 30D/7D/1D selector.
- **P19/P20 — avatar fetch-once + SSE-only**: ingestion-telegram resolves the
  channel avatar once at source registration, stores it permanently (excluded
  from the 72h janitor), serves it via feed projection; kol-system consumes the
  URL only, never polls — SSE filtered client-side + catch-up by cursor.
- **P26/P27 — snapshots in own module, same DB**: every extraction emits a
  snapshot base with 4 dates (`occurred_at_telegram`, `ingested_at_kol`,
  `enriched_at`, `snapshot_at`); module `src/snapshot/` owns `mention_snapshots`
  inside the kol-system DB (no separate base); performance compares against the
  LAST snapshot of (caller, contract).
- **P12-bis/P13 — Dexter lookup is NOT here**: bot lookup lives in
  `apps/dexter-onchain-bot/` (Tramo 3), fed by `apps/market-data`; kol-system
  keeps only per-template publishing bots. C1: thread support is deferred —
  templates ship with `threadConfig: null` + 501 stub; v2 arrives with
  content-publisher.
- **P2 — verify each point separately**: plan Tramo 1 verifies P3–P9 with
  dedicated explore/librarian passes before implementing.
- **C-DB-01 — one DB per app**: kol-system owns `<base>_kol_system[_staging]`
  on the same server per env (12-DB table in the central plan); own
  `data-source.ts`, own migrations, `synchronize:false, migrationsRun:false`
  outside dev/test.
- **C-SSE-01 — strict type filtering**: SSE frames carry
  `data.messageType: 'kol'|'crypto-news'`; kol-system subscribes ONLY to
  `'kol'` client-side (+ `?type=kol` where the query param exists); subscribing
  to `crypto-news` is forbidden here (mirror rule binds content-publisher).

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
├── app.module.ts                 # Config (envFilePath ['.env.dev', '.env']) + HealthModule ONLY
├── health/
│   ├── health.module.ts
│   ├── health.controller.spec.ts
│   └── api/http/health.controller.ts   # GET /api/health → { status: 'ok' } (static shape)
├── ingestion/                    # BUILT (todo 4) but NOT wired into AppModule yet
│   ├── ingestion.module.ts       # providers: ProcessKolMessageHandler, KolIngestionClientService, KolIngestionClientPort→Adapter
│   ├── domain/ports/ingestion-client.port.ts
│   ├── application/
│   │   ├── handlers/process-kol-message.handler.ts (+ .spec.ts)
│   │   └── services/kol-ingestion-client.service.ts (+ .spec.ts)  # SSE + 1-min polling fallback, backoff 1s→30s
│   └── infrastructure/http/
│       ├── ingestion-http-client.adapter.ts (+ .spec.ts)
│       └── dto/kol-source.dto.ts, raw-kol-message.dto.ts
├── shared/                       # kernel/config/guards/filters — REUSE, extend, never copy (P21)
│   ├── kernel/aggregate-root.ts, entity.ts, value-object.ts, domain-error.ts, domain-event.ts (+ specs)
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

Wired today: `ConfigModule` (global, `.env.dev` > `.env`) + `HealthModule`.
`IngestionModule` exists (todo 4) but is NOT imported yet — wiring it is a
future todo (P20 follow-up decides whether the 1-min polling fallback stays).

Planned (per spec, NOT built — do not import until their todos land):
extraction, normalization, enrichment (market-data bridge, P7), scoring,
templates (+ classification inside templates, P6), approval, publishing
(per-template bots, P9/P12b), tracking (first-appearance, P8), rankings (P11).

## INGESTION — SSE + polling fallback (`ingestion/`)

`KolIngestionClientService` (`application/services/`) subscribes to `GET
{INGESTION_TELEGRAM_URL}/api/ingestion/stream` and accepts ONLY frames whose
`data.messageType==='kol'` — the top-level frame kind is `message:telegram`
for every telegram frame, so filtering MUST be client-side (P10). A 1-minute
polling fallback via the port covers gaps while the stream is down.
Disconnects back off 1s doubling → 30s cap.

Catch-up is by cursor (`GET /api/feed/messages?type=kol` from last messageId,
no periodic loop) per P20. **P20 follow-up**: kol-system is SSE-only by
design — if the 1-min fallback was already implemented (it was, todo 4), a
follow-up todo removes it. Do NOT add new polling without citing P20.

Base URL resolution: `INGESTION_TELEGRAM_URL` config → env → default
`http://localhost:3031` (dev default; per env it points at the OWN
ingestion-telegram instance — invariant 1:1, same as the backend).

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
One-DB-per-app (C-DB-01, central plan todo 2): dev local
`alpha_meta_token_scanner_kol_system`, Oracle prod same base name, twin staging
`alpha_meta_token_scanner_kol_system_staging` — 12 DBs total across the four
apps (kol/content/market/dexter × 3 envs) on the same server per env
(precedent: `<base>_ingestion`). Owner of migrations is kol-system itself (own
`data-source.ts` + `migration:run`); snapshot tables (`mention_snapshots`) live
in THIS db (P27), never a separate base.

Port discrepancy to know: `main.ts` listens on `KOL_SYSTEM_PORT ?? 3050`,
while `buildAppConfig().port` reads `PORT ?? 3030`. Canonical runtime port is
`KOL_SYSTEM_PORT=3050` (main.ts wins); do not set bare `PORT` expecting 3050.

## HEALTH

`GET /api/health` → 200 + `{ status: 'ok' }` (static shape, todo 2).
Per P21 each move-todo registers its indicator here (`ingestion.sse`,
`database`, `redis`, +1 per module:
extraction/parsing/normalization/enrichment/scoring/templates/approval/publishing/tracking).
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

Built (wired): `HealthModule` (`GET /api/health`).
Built (unwired): `IngestionModule` — `KolIngestionClientService` (SSE +
polling fallback, P20 follow-up pending) + `ProcessKolMessageHandler` +
`KolIngestionClientPort → IngestionHttpClientAdapter` (feed reads
`?type=kol`) + DTOs (`kol-source.dto`, `raw-kol-message.dto`).
Built (infra): `SharedModule` pieces — kernel, 4 configs, api-key guard,
domain-exception filter.
Planned: extraction (P5 contract × mention) → normalization → enrichment
(P7 market-data bridge: `mc at` + `more details +`) → templates with embedded
classification (P6: channel picker + score viz + gem filters) → scoring →
approval → publishing (P9/P12b per-template bots, P22/P23 DB catalog +
P23-bis admin-verified targets) → tracking (P8 first-appearance) → rankings
(P11 `GET /api/kol-rankings?window=30d|7d|1d`, cron-fed `kol_window_stats`,
P17 layout) → dashboard (P16 single + source selector).

Explicitly NOT in kol-system: `crypto-news` (content-publisher, P10),
`vip-calls` as code (template name only, P14), Dexter lookup
(`apps/dexter-onchain-bot`, P13), data providers (Tramo 3 owns extraction,
contract C-DATA-01 — consume via ports, never move).

## SNAPSHOT MODULE (P26/P27 — own module, same DB)

`src/snapshot/` owns `mention_snapshots` (+ future aggregates) inside the
kol-system DB. Extraction emits the snapshot base per mention (contract +
`occurred_at_telegram` from ingestion + `ingested_at_kol=now`); enrichment
completes it (`enriched_at=snapshot_at` + market data) and writes via port so
snapshot+mención stay atomic in one transaction. Tracking joins
mención↔snapshot locally; performance X of a call compares `last_mc` against
the LAST snapshot MC of that (caller, contract) (e.g. +55X). No separate base;
split (timescale/partitioning) only as a later phase if volume demands it.

## DASHBOARD LAYOUT (P16/P11/P17 — one dashboard per template)

Each template has ONE dashboard with a KOL source multi-select
(`kolSourceIds: string[]`, empty = all; picker fed by
`GET /api/feed/sources?type=kol`, mentions filtered locally). Columns:
`caller | call | mc at | tracking | time ago | more details +` (P5/P8; caller =
handle + url + db-id + avatar). Ranking block: performance horizontal 10 (5
left + 5 right, arrows toggle `sort=perf_asc|perf_desc`) over
`kol_window_stats.total_x`, plus a top-10 callers-by-count strip with
30D/7D/1D selector over `calls_count`; display +NX on 30D/7D, +% on 1D. Below:
extended template config section (sources, score display, gem filters, bot).
Legacy backend dashboard coexists until cutover — never break it early.

## BOTS CATALOG (P22/P23/P23-bis — DB, zero KOL_BOT_TOKEN)

No `KOL_BOT_TOKEN` exists, not even as seed (P23 follow-up removes it from
validation if todos 2-3 added it). Reusable catalog `telegram_bots` (id,
encrypted token, label) + template fields `bot_id` + `channel_target`; one bot
may publish for many templates/channels (A = bot X + channel 1, B = bot X +
channel 2); no `bot_id` = dashboard-only. Legacy per-template table
`template_bot_tokens` (P22) converges into this catalog. Target flow:
pick saved bot or add new → pick `channel_target` among channels where THAT
bot is admin (verified via Bot API `getChatMember`, stored
`admin_verified_at`); verified channels reusable as suggestions. Rotation = UI
update, no redeploy; tokens AES-256-GCM encrypted (shared pattern).

## EXTRACTION → ENRICHMENT → FRONTEND FLOW

- Extraction (P5) extracts the smart contract per mention (contract × mention,
  repeats valid) but does NOT serve it to the frontend directly.
- Each extraction passes to enrichment first; enrichment talks to
  `apps/market-data` to fetch the market snapshot that fills `mc at` and
  `more details +` in the dashboard (P7).
- Frontend only renders enriched mentions (contract + market data together).

## GAPS (verified 2026-09-24 — fix in their own todos, not opportunistically)

1. `IngestionModule` not wired into `AppModule` (only Config + Health) —
   SSE client never boots at runtime.
2. P20 follow-up open: 1-min polling fallback still present
   (`POLL_INTERVAL_MS = 60_000`); SSE-only design wants it removed.
3. `GET /api/health` is a static stub — no per-component indicators yet (P21).
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

## DECISIONS (P1–P27 + contracts — one line each, 2026-09-24)

- P1 (2026-09-24): no dedup of any kind in kol-system; repeats are first-class rows.
- P2 (2026-09-24): Tramo 1 plan verifies P3–P9 with separate explore/librarian passes.
- P3 (2026-09-24): ingestion consumes `kol`-type messages, distinct from `crypto-news`.
- P4 (2026-09-24): identity/sources live in ingestion-telegram (`kol` + `crypto-news` types); no profiles stored here.
- P5 (2026-09-24): extraction = contract × mention (+ timestamp, handle, url, channel, db-id).
- P6 (2026-09-24): classification lives INSIDE templates (channel picker + score viz + gem filters).
- P7 (2026-09-24): enrichment bridges `apps/market-data` → `mc at` + `more details +`.
- P8 (2026-09-24): tracking = `First time` vs `Nx from last call` (first `mc at` as reference).
- P9 (2026-09-24): optional per-template publishing bot (BYO-token, publishing-only, viable).
- P10 (2026-09-24): strict type separation — subscribe ONLY to `messageType==='kol'`.
- P11 (2026-09-24): KOL caller ranking `GET /api/kol-rankings?window=30d|7d|1d` over cron-fed `kol_window_stats`.
- P12-bis (2026-09-24): per-template publishing bots stay in kol-system (unchanged by P13).
- P13 (2026-09-24): Dexter lookup SUPERSEDES P12a → own app `apps/dexter-onchain-bot` (Tramo 3).
- P14 (2026-09-24): `vip-calls` is a template NAME (default seed), never a module; backend dir deleted at cleanup.
- P15 (2026-09-24): SUPERSEDED by P16 — no multi-dashboard CRUD.
- P16 (2026-09-24): one dashboard per template with source selector (`kolSourceIds: string[]`).
- P17 (2026-09-24): horizontal-10 performance rank (5+5, arrows) + top-10 by count strip + extended config section.
- P18 (2026-09-24): gradual per-BC deprecation (`@deprecated` headers now, deletion in todo 16).
- P19 (2026-09-24): avatar resolved once by ingestion-telegram, permanent (janitor-excluded), consumed as URL.
- P20 (2026-09-24): SSE-only ingestion, no polling loop (catch-up by cursor; remove 1-min fallback).
- P21 (2026-09-24): health indicator per component; reuse/extend `src/shared/`, never copy.
- P22 (2026-09-24): telegram config in DB (`template_bot_tokens`); no new `*_BOT_TOKEN` env per template.
- P23 (2026-09-24): reusable `telegram_bots` catalog + `bot_id`/`channel_target`; zero `KOL_BOT_TOKEN`.
- P23-bis (2026-09-24): `channel_target` admin-verified via `getChatMember` (`admin_verified_at`).
- P24 (2026-09-24): multi-env envs — distinct `ENCRYPTION_KEY` per env; tracked templates + `scp` deploy.
- P25 (2026-09-24): this AGENTS.md is living — updated at the close of every task set.
- P26 (2026-09-24): snapshot per extraction with 4 dates (`occurred_at_telegram`, `ingested_at_kol`, `enriched_at`, `snapshot_at`).
- P27 (2026-09-24): snapshots in own module `src/snapshot/`, SAME kol-system DB (default, a veto).
- C-DB-01 (2026-09-24): one-DB-per-app `<base>_<app>` same-server per env (12 DBs; central todo 2).
- C-SSE-01 (2026-09-24): frames carry `data.messageType`; filtering is mandatory client-side (central todo 5).
- C1 (2026-09-24): threads deferred — templates ship `threadConfig: null` + 501 stub; v2 with content-publisher.
- C2 (2026-09-24): C-SHARED-01 inverted — Tramo 1 moves the KOL bot first, Tramo 2 the crypto adapters.
- C3/C4 (2026-09-24): pilot risk on money-path (shadow/staging-14d/rehearsal/kill-switch); T2←T1, T3←T2 gates.

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
