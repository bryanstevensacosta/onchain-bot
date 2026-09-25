# PROJECT KNOWLEDGE BASE

**Refreshed:** 2026-09-04 (was generated 2026-07-02, commit 3576329 — rewritten, old content was stale)
**Branch:** master

## OVERVIEW

**Onchain Bot** — monorepo, 3 apps: NestJS alpha-call pipeline (`apps/backend`, :3030) + per-env Telegram ingestion (`apps/ingestion-telegram`, same image per env — dev :3031, staging twin host :3033, prod host :3032 — SSE fan-out) + React/Vite dashboard (`apps/frontend`, :5173). Private, UNLICENSED. Node 22+ required, CI runs Node 24. TypeScript 5.9 (root) / 5.7 (backends).

Per-app docs (verified, authoritative over this file for details): `apps/backend/AGENTS.md`, `apps/ingestion-telegram/AGENTS.md`, `apps/frontend/AGENTS.md`. Sub-BC `AGENTS.md` files were consolidated into `apps/backend/AGENTS.md` on 2026-09-04 (7 files migrated + deleted).

### Ingestion-Telegram Architecture (CRITICAL — Per-Env Model, One Source of Truth)

**Each environment runs its OWN ingestion-telegram (same image, 1:1 with its backend)** — one MTProto session per env, never shared. Per-env model since `per-env-ingestion` (2026-09-22); the old singleton (one instance serving all envs) is retired.

```
                    ┌──────────────────────────────────────────────┐
                    │  ingestion-telegram PER ENV (same image):     │
                    │  dev local :3031 · staging twin host :3033   │
                    │  → container :3031 · prod host :3032         │
                    │  → container :3031                          │
                    │                                               │
                    │  OWNERSHIP (split 2026-09-08, per-env        │
                    │  2026-09-22):                               │
                    │  ✓ One MTProto session PER instance          │
                    │    (triple never shared across envs)         │
                    │  ✓ DB lógica propia por servidor Postgres:    │
                    │    <base>_ingestion (dev local una, Oracle    │
                    │    una prod + una staging twin:              │
                    │    onchain_bot_staging_ingestion)│
                    │  ✓ Tablas propias: crypto_news_sources,       │
                    │    crypto_news_messages, crypto_news_         │
                    │    message_media (KOL identity sigue en el    │
                    │    backend; los filtros vivos también)        │
                    │  ✓ uploads/: archivos de media descargados    │
                    │    (named volume propio por env)              │
                    │                                               │
                    │  API ENDPOINTS (read-only para su backend):   │
                    │  → GET /api/feed/sources (feed-unification;  │
                    │    las viejas /api/feed/* dan 404)    │
                    │  → GET /api/feed/messages                   │
                    │  → GET /api/media/:channelId/:messageId/:idx │
                    │  → GET /api/ingestion/stream (SSE, sin gate) │
                    └──────────────┬───────────────────────────────┘
                                   │ HTTP API (read-only, 1:1)
                  ┌────────────────┼────────────────┐
                  │                │                │
          ┌───────▼──────┐  ┌─────▼──────┐  ┌─────▼──────┐
          │ Backend Dev   │  │ Backend     │  │ Backend    │
          │ (local)       │  │ Staging     │  │ Production │
          │ → ingestion   │  │ → twin      │  │ → prod     │
          │   :3031       │  │   :3033     │  │   :3032    │
          │ NO feed│  │ NO crypto-  │  │ NO crypto- │
          │ DB tables     │  │ news tables │  │ news tables│
          └───────────────┘  └─────────────┘  └────────────┘
                  │                │                │
          ┌───────▼──────┐  ┌─────▼──────┐  ┌─────▼──────┐
          │ Frontend Dev  │  │ Frontend    │  │ Frontend   │
          │ localhost     │  │ Staging     │  │ Production │
          │ :5173         │  │ :4173       │  │ :80        │
          └───────────────┘  └─────────────┘  └────────────┘
               ↑                  ↑                  ↑
               │                  │                  │
          dev ingestion     staging twin      prod ingestion
          (:3031)           (:3033)           (:3032)
          (cada frontend consulta SU ingestion por env)
```

**INVARIANTS (DO NOT VIOLATE)**:

1. **Un ingestion-telegram por env (1:1 con su backend)** — `docker-compose.ingestion.yml` (prod, host `:3032`→container `:3031`) + `docker-compose.staging-ingestion.yml` (twin, project `onchain-bot-staging-ingestion`, host `:3033`→container `:3031`) + dev local (`:3031`). Misma imagen, triple y DB distintas. El singleton multi-env está retirado (2026-09-22)
2. **Una triple MTProto por env, jamás compartida** — cada instancia tiene SU triple (`INGESTION_TELEGRAM_MTPROTO_API_ID/_API_HASH/_SESSION` en SU `.env`: prod `.env.production`, staging `.env.staging` con la vieja cuenta de dev, local `.env` con la cuenta nueva). Mapa sin secretos: prod=cuenta actual, staging=vieja-dev, local=nueva (3-4 canales). Dos instancias con la misma triple causan `AUTH_KEY_DUPLICATED`. Pre-boot: triple-inequality assert por hashes (ver runbook twin)
3. **Una DB de ingestion por env (`<base>_ingestion`)** — TARGET names tras el rename: dev local `onchain_bot_ingestion`, Oracle prod `onchain_bot_ingestion` + Oracle staging `onchain_bot_staging_ingestion` (permitida desde per-env 2026-09-22; antes prohibida). Estado live: las DBs Oracle conservan el nombre pre-rename hasta que ejecute el runbook (.omo/runbooks/rename-onchain-bot-db.md, fase 3). Tablas `crypto_news_sources`, `crypto_news_messages`, `crypto_news_message_media` viven SOLO en la DB de SU env desde el split 2026-09-08 (antes existían también en el backend; migración `1860000000001-DropIngestionOwnedFeedTables`). El twin arranca VACÍO (sin seed, sin mirror prod)
4. **Ingestion-telegram es el owner de media** — descarga archivos a `uploads/crypto-news/media/` y los sirve vía `GET /api/media/*`
5. **Backends NO escriben feed** — staging/prod solo LEEN vía HTTP API del ingestion-telegram (no réplican tablas ni datos)
6. **Frontend consume directamente del ingestion-telegram** — `GET /api/feed/messages` apunta al puerto 3032 (no proxy vía backend)
7. **NO definir ingestion-telegram en `docker-compose.staging.yml` ni `.prod.yml`** — un compose por env: `docker-compose.ingestion.yml` (prod standalone) + `docker-compose.staging-ingestion.yml` (twin)
8. **Retención 72h de messages + media en ingestion** — janitor `FeedRetentionCleanupScheduler` (ingestion-telegram, lock `9_421_373`, reloj `ingested_at`); 72h por invariante del plan. Valor efectivo en prod pendiente de decisión del operador (el backend prod limpiaba media con 24h; ver dossier task-10 §4)

**Rationale** (per-env 2026-09-22 — cada env es dueño de sus datos):

- ✅ **Sin sesiones compartidas**: una triple por env elimina `AUTH_KEY_DUPLICATED` por diseño
- ✅ **Aislamiento real**: staging experimenta (canales, filtros, retention) sin rozar prod
- ✅ **Escalabilidad**: agregar un env = un compose + una triple + una DB `<base>_ingestion`
- ✅ **Separación de responsabilidades**: ingestion-telegram maneja MTProto + storage, backends manejan lógica de negocio (scoring, publishing, etc.)
- ✅ **Misma imagen en todos lados**: el borrado SSE y los fixes se validan en el twin antes de prod

**Data Flow (Crypto-News — Opción A: Filter on-Read)**:

```
Telegram Channel (MTProto)
    ↓ (ingestion-telegram lee mensaje)
ingestion-telegram:
    1. Descarga media → uploads/crypto-news/media/
    2. INSERT INTO crypto_news_messages (id, content, channel_id, ...) ← RAW content, NO filters
    3. INSERT INTO crypto_news_message_media (message_id, url, type, ...)
    4. Emite evento SSE (metadata-only, NO content)
Backend (staging/prod) — OPCIÓN A (filter on-read):
    1. EnqueueMatchingCronScheduler (cron every minute):
       a. Fetch RAW messages: FeedIngestionClient → GET su-ingestion/api/feed/messages?limit=50
          (prod `:3032`, staging twin `:3033`, dev `:3031` — cada backend lee SU ingestion)
       b. Filter + match: FilteredFeedService:
          - Load per-channel ContentFilterService rules (regex transforms)
          - Apply filters to title + content (on-read, NO persist)
          - Evaluate keywords (simple + AND-groups)
          - Check blacklist phrases (block if match)
       c. Enqueue matched messages: EnqueueMatchingMessageUseCase → publisher queue (cap 36)
    2. PublisherCronScheduler (every minute): drain queue → LLM → Bot API publish
Frontend (cada env contra SU ingestion — ver `apps/frontend/AGENTS.md` §PROXY):
    1. Consulta directo a su ingestion (`:3031` dev, `:3033` twin staging, `:3032` prod): GET /api/feed/messages?limit=50 (RAW content)
    2. Renderiza mensajes SIN filtros (display mode)
    3. Media se carga de: http://su-ingestion/api/media/{channelId}/{messageId}/{index}
```

**Arquitectura Opción A — Invariantes**:

- Ingestion-telegram guarda contenido CRUDO (sin filtros, sin transformaciones)
- Backend staging/production aplican SUS PROPIOS filtros on-read (NO replican DB)
- Frontend muestra contenido RAW (sin transformaciones)
- Publisher queue recibe contenido FILTRADO (AFTER ContentFilterService + keywords matched)

**KOL Data** (nota: actualmente los KOL identities están en el backend, no en ingestion-telegram — considerar migración futura para consistencia).

## STRUCTURE

```
.
├── apps/
│   ├── backend/             # NestJS 11 — DDD/Hexagonal, 22 wired modules (NOT 19)
│   ├── ingestion-telegram/   # NestJS 11 — per-env MTProto session → SSE (dev :3031, staging twin host :3033, prod host :3032)
│   └── frontend/            # React 18 + Vite 5 — FSD dashboard (:5173)
├── scripts/                 # 28 files: sync-*, backup-db.sh, cleanup-ports.mjs, check-docs-staleness.mjs,
│                            # audit-enrichment-apis.js, deploy.sh, diagnose-*, validate-session-migration.sh…
├── config/                  # ingestion.config.json (safety defaults for ingestion-telegram)
├── infra/                   # cron/docker-prune, systemd/socat Tailscale tunnel templates, terraform/ (tracked tfvars + provider binaries — see Drift)
├── docs/                    # HELIUS, api, arch, architecture, bot, ci-cd, deployment, fixes, nest-js, proyect…
├── docs-money/              # ToS summary, monetization, KOL onboarding/legal, rate limits (7 files)
├── .github/workflows/       # deploy.yml — GHCR build + self-hosted Oracle server deploy (NOT ssh-action)
├── .husky/                  # pre-commit, commit-msg, pre-push (Husky v9)
├── GOVERNANCE.md            # Branch governance (Spanish, v2.0, active)
├── opencode.json            # opencode config
├── bootstrap-droplet.sh     # Oracle bootstrap
├── .omo/ .sisyphus/ .kiro/ .playwright-mcp/  # agent/tool state — do NOT source
```

## GIT FLOW & BRANCH STRATEGY

See **[GIT-FLOW.md](./GIT-FLOW.md)** for complete Git workflow documentation, including:

- Branch strategy (`dev` → staging, `master` → production)
- Squash vs Rebase merge strategies
- Daily development workflows (solo and team)
- Hotfix procedures
- Sync requirements after merges
- Common scenarios and troubleshooting

**Critical**: Always sync `dev` with `master` after merging to avoid conflicts on next PR.
Do it MANUALLY (`git checkout dev && git merge origin/master`) — the bot sync
was removed 2026-09-14 (its PR checks never completed unattended; see
`sync-dev.yml` header). Takes ~1 min, zero noise.

## WHERE TO LOOK

| Task                 | Location                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------- |
| Run backend+frontend | `npm run dev` (root, port-cleanup → :3030 + :5173; ingestion-telegram NOT included)          |
| Run ingestion        | `npm run dev:ingestion` (root → :3031, port-cleanup + `start:dev -w ingestion-telegram`)     |
| Backend tests        | `npm run test:backend` (Jest, 170 suites / 1969 tests post-split)                            |
| Ingestion tests      | `cd apps/ingestion-telegram && npm test` (43 suites / 815 tests post-split)                  |
| Frontend tests       | `npm run test:frontend` (Vitest, 23 `*.test.*` files)                                        |
| Lint                 | `npm run lint` (all workspaces) / `:backend` / `:frontend` (flat configs, differ per app)    |
| Format               | `npm run format` (Prettier, singleQuote + trailingComma all)                                 |
| Build                | `npm run build` (backend `nest build` + frontend `tsc -b && vite build`; no ingestion job)   |
| DB migrations        | `cd apps/backend && npm run migration:run` (`scripts/run-migrations.sh` + TypeORM)           |
| Backfill scripts     | `apps/backend/scripts/backfills/` (19 date-prefixed, idempotent) + `migrate.js/ts`           |
| MTProto session      | `apps/ingestion-telegram`: `npm run telegram:gen-session` (sessions live ONLY there)         |
| Seed KOLs/sources    | `POST telegram-kol/identity/kols` / `POST feed/sources` on backend (DB-driven)               |
| Architecture docs    | `apps/backend/docs/spydefi/arch/` (14 files: DDD, anti-patterns, ADRs)                       |
| Safety config        | `config/ingestion.config.json` (used only in Docker; dev falls back to defaults)             |
| Git hooks            | `.husky/{pre-commit,commit-msg,pre-push}` + `lint-staged.config.js` + `commitlint.config.js` |
| Docs staleness check | `npm run docs:check` + `.docs-map.jsonc` (sub-BC entries removed 2026-09-04)                 |

## CODE MAP (high-centrality symbols, line numbers verified)

| Symbol                                                    | Type           | Location                                                                                                                                                                      | Role                                                                |
| --------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `bootstrap()`                                             | function       | `apps/backend/src/main.ts:85`                                                                                                                                                 | Entry; dotenv, DEBUG trace, 120 s timeout, ValidationPipe, WS       |
| `AppModule`                                               | class          | `apps/backend/src/app.module.ts`                                                                                                                                              | 22 modules + infra (Dashboard/Identity imports commented)           |
| `appConfig`                                               | const          | `apps/backend/src/shared/common/config/app.config.ts:338`                                                                                                                     | `registerAs('app', …)` — all backend env validation                 |
| `DataProviderPort`                                        | abstract class | `apps/backend/src/data-provider/core/data-provider.port.ts`                                                                                                                   | Base for 13 external API adapters                                   |
| `AggregateRoot<TId>`                                      | class          | `apps/backend/src/shared/kernel/aggregate-root.ts:17`                                                                                                                         | DDD aggregate base — Entity + DomainEvent collection                |
| `DomainErrorFilter`                                       | class          | `apps/backend/src/shared/filters/domain-error.filter.ts:12`                                                                                                                   | `DomainError` → HTTP status                                         |
| `WsGateway`                                               | class          | `apps/backend/src/shared/ws/gateway/ws.gateway.ts:32`                                                                                                                         | Socket.IO fan-out (`EVENT_MAP`, 12 events)                          |
| `TelegramSseListenerAdapter`                              | class          | `apps/backend/src/telegram/ingestion/shared/api/sse/…` (459 lines)                                                                                                            | Backend SSE client (fetch+ReadableStream, backoff 1 s→30 s)         |
| `StreamService`                                           | class          | `apps/ingestion-telegram/src/stream/application/services/stream.service.ts`                                                                                                   | SSE fan-out server (:3031) + 30 s heartbeat                         |
| `MessagePersistenceCoordinator` + `MessageRoutingService` | class          | ingestion-telegram `telegram/shared/application/coordinators/message-persistence.coordinator.ts` + backend `telegram/ingestion/shared/application/message-routing.service.ts` | Route raw messages → typed payloads (service) / use cases (backend) |
| `App`                                                     | component      | `apps/frontend/src/app/index.tsx`                                                                                                                                             | QueryProvider → SocketProvider → AppRouter                          |
| `RootLayout`                                              | component      | `apps/frontend/src/app/layouts/root-layout.tsx:11`                                                                                                                            | Header nav (5 links) + `<Outlet/>`                                  |

## CONVENTIONS

### TypeScript (from `tsconfig.base.json` — verified)

- **Strict flags**: `strictNullChecks`, `noImplicitAny`, `strictBindCallApply`, `noFallthroughCasesInSwitch`, `forceConsistentCasingInFileNames`, `isolatedModules` — all on. `strict` is **NOT** enabled globally.
- **Backend**: `nodenext` + `nodenext` resolution, `resolvePackageJsonExports`, `experimentalDecorators`, `emitDecoratorMetadata`.
- **Frontend**: `ESNext` + `Bundler` resolution, `noEmit`, `allowImportingTsExtensions`, `jsx: react-jsx`.

### Path aliases

- **Backend** (`apps/backend/tsconfig.json`): `shared/*` (+`shared/kernel/*`, `shared/common/*`), `chain/*`, `token/*`, `telegram/*`, `kol/*`, `settings/*`, `dashboard/*`, `data-provider/*`, `health/*`, `src/*` — rooted at `src/`. `@/*` is **not** a backend alias. ⚠️ Dead `discovery/*` alias (no `src/discovery/`) + duplicated `settings/*` key.
- **Ingestion-telegram**: `shared/*`, `telegram/*`, `stream/*`, `media/*`, `health/*`, `src/*` (+ kernel/common). No `@/*`.
- **Frontend** (`apps/frontend/tsconfig.json`): only `@/*` → `src/*` (`baseUrl: ./src`). No `../../../` chains.

### ESLint (flat configs — differ per app, NOT project-wide)

- **Backend + ingestion-telegram**: `@typescript-eslint/no-explicit-any` **off**, `require-await` off, `no-floating-promises`/`no-unsafe-*`/`await-thenable` warn, `no-useless-catch` warn, unused vars warn (`^_`), `prettier/prettier` error (`endOfLine: auto`).
- **Frontend** (`eslint.config.js`): `typescript-eslint` **recommended** (`no-explicit-any` is ERROR here), react + react-hooks (`exhaustive-deps: warn`) + prettier. Stricter — don't assume backend rules.

### Prettier

- `singleQuote: true`, `trailingComma: "all"` (root `.prettierrc`).

### Git hooks (Husky v9 — `.husky/`)

Three git hooks auto-installed via `husky init`; bypass with `--no-verify`:

| Hook             | Behavior                                                                                                                                                             |          Blocks commit?          |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------: | ----- | --- | ---- | -------- | ---- | ---- | ----- | ----- | ------ | ------- | --------------------------------------------------------------------------------------- | --- |
| **`pre-commit`** | Refuse commits on `master` (use `dev` + PR) → `lint-staged` → `tsc --noEmit --incremental false` on backend + frontend → `npm run docs:check` (non-blocking warning) | lint + tsc + branch YES; docs NO |
| **`commit-msg`** | `commitlint --edit $1` enforces **conventional commits** (`feat:`, `fix:`, `chore:`, `docs:`, `style:`, `refactor:`, `perf:`, `test:`, `build:`, `ci:`, `revert:`)   |               YES                |
| **`pre-push`**   | Validate branch naming (`dev/master/feat                                                                                                                             |               fix                | chore | ci  | docs | refactor | perf | test | build | style | hotfix | release | revert/\*`) → block direct push to `master`→`npm test` (backend Jest + frontend Vitest) | YES |

**Hook files**: `.husky/pre-commit` (minimal shell, Husky v9 shim in `.husky/_/`) · `.husky/commit-msg` (commitlint) · `.husky/pre-push` (`npm test`) · `lint-staged.config.js` (explicit `--config` per app for backend `src/`+`test/`, frontend `src/`, and ingestion-telegram `src/`+`test/`; prettier for json/md/yaml) · `commitlint.config.js` (conventional) · `opencode.json` (bash `ask` by default; `allow` for read-only git/gh).

**Docs staleness check** (`.docs-map.jsonc` + `scripts/check-docs-staleness.mjs`):

- Walks up the directory tree for each staged file, finds matching AGENTS.md entries (L0 root + L1 apps only since 2026-09-04 consolidation)
- **Non-blocking**: commit passes with a yellow `⚠️` warning; developer decides whether to update
- Run standalone: `npm run docs:check` or `node scripts/check-docs-staleness.mjs`
- Maintain `.docs-map.jsonc` when creating new `AGENTS.md` files at any level

To bypass all hooks for a single commit: `git commit --no-verify -m "..."`.

### NestJS conventions (both services)

- `deleteOutDir: true` in `nest-cli.json`.
- `process.noDeprecation = true` (pg@8 + TypeORM `synchronize: true` noise).
- `ConfigModule.envFilePath: ['.env.dev', '.env']` — `.env.dev` wins. Both services.

### Frontend conventions

- React Router v6 via `createBrowserRouter` but NO loaders — TanStack Query owns server state.
- TanStack React Query v5: `staleTime: 5s`, `retry: 1`, `refetchOnWindowFocus: false`, per-hook `refetchInterval` polling (5–30 s).
- Socket.IO singleton (websocket→polling, reconnect 5× 1 s→30 s). No Zustand/Redux (zero imports).
- Tailwind CSS 3.4 utility classes (+ per-BC `bc.*` color tokens); no CSS-in-JS.
- MSW 2.6 / recharts / lucide-react / zod in deps with **zero imports** — do not adopt without discussion.

### Vite dev proxy (`apps/frontend/vite.config.ts` — 5 entries + regex)

- `/api`, `/crypto-news-publisher`, `/crypto-news-ads`, regex `^/crypto-news/(messages|sources|backfill|media)` → `http://localhost:3030` (no `changeOrigin`)
- `/socket.io` → `http://localhost:3030` (ws: true)
- `strictPort: true` on `127.0.0.1:5173`. Prod nginx mirrors per-prefix (`apps/frontend/nginx.conf`, 203 lines).

### Database

- TypeORM 0.3 with `synchronize: true` (dev/test). Staging/prod: migrations (`scripts/run-migrations.sh`; backend 15 files incl. `1860000000001-DropIngestionOwnedFeedTables`; ingestion-telegram baseline `1788844970659-BaselineIngestionSchema` + `migration:*` scripts + `data-source.ts` since 2026-09-08, `synchronize:false, migrationsRun:false` outside dev/test).
- DB split 2026-09-08: backend `PERSISTED_ENTITIES` = 39 (sin las 3 tablas feed); ingestion DB `<base>_ingestion` con 5 tablas propias. pgAdmin: la segunda DB vive en el MISMO servidor — sin cambio en `apps/backend/pgadmin/servers.json`, aparece como otra DB bajo el mismo server entry.
- Per-BC schema-per-context is v2 plan; v1 uses in-memory repos within modules (largest: normalization cap 5000).
- Database toggle: `DATABASE_ENABLED=true` to enable; tests force it on in `jest.setup.ts` (both services).

### Tests

- Backend: co-located `*.spec.ts` (`testRegex: .*.spec\.ts$`), **170 spec files post-split** (was 173; 3 deleted in split). E2E in `apps/backend/test/*.e2e-spec.ts` (separate `jest-e2e.json`; `--forceExit`, 30 s timeout).
- Ingestion-telegram: 15 specs + 5 e2e files.
- Post-split suites (task-10 evidence): backend **170 suites / 1969 tests** green, ingestion **43 suites / 815 tests** green.
- Frontend: Vitest, 23 `*.test.{ts,tsx}` files, co-located + `__tests__/`; `src/test/setup.ts` (jest-dom). jsdom in deps.
- No coverage thresholds enforced in any app.

## ANTI-PATTERNS (THIS PROJECT)

Source: `apps/backend/docs/spydefi/arch/09-anti-patterns.md` — project-level rules.

### Git Operations (CRITICAL)

- **Never execute `git reset --hard`** — permanently destroys uncommitted changes. Fix TS errors manually, do NOT reset.
- **Never execute `git revert --no-commit`** — same reason.
- **Never use destructive git commands without explicit user approval** (`reset`, `rebase`, `force-push`).
- **When TypeScript errors occur during commit**: read, fix in files, retry. Never "undo" staged changes.

### Architectural

- **No `@Entity` in domain layer.** ORM entities live in `infrastructure/persistence/typeorm/entities/`.
- **Never update DB directly.** Always through the aggregate (`save()` via repo port).
- **Never publish events before `commit()`.** `await repo.save(agg); await eventBus.publishAll(agg.commitEvents())`.
- **Never share entities between BCs.** Use ports + DTOs. (Backend currently violates the module variant in 7+ places — see its AGENTS.md gap 7.)
- **Never use `any` crossing BC boundaries.** Strongly-typed DTOs and events only.
- **No anemic domain model.** Entities enforce invariants, not just hold data.
- **No mixing domains in a single BC.** Split when responsibilities diverge.

### Pipeline / runtime

- **Raw Telegram text must NOT cross the event bus** (fix-1, ToS compliance). `KolIngestionOrchestratorUseCase` calls `ExtractFromMessageUseCase` and `ParseFromCandidatesUseCase` directly. Event bus kicks in only at `normalization.call.normalized`.
- **Ticker must NEVER be null** in published-call flow (enforced pre-publisher in `vip-calls/vip-channel`; tracking tolerates null by design).
- **External providers are NEVER queried** in `token-approved-publish-ticker-bug-exploration.spec.ts` context. (Sanctioned exception: `TickerResolverService` 9-level cascade in vip-channel.)
- **`bug-exploration.spec.ts` files encode future-fix invariants** — do not "fix" them; they document expected behavior post-fix.

### Ingestion-Telegram (CRITICAL — Architecture Invariants)

- **UN ingestion-telegram por env (1:1 con su backend)** — dev `:3031`, staging twin host `:3033`→container `:3031` (`docker-compose.staging-ingestion.yml`), prod host `:3032`→container `:3031` (`docker-compose.ingestion.yml`). Misma imagen, jamás dos instancias con la misma triple
- **NEVER duplicate MTProto credentials across envs** — una triple por env (`INGESTION_TELEGRAM_MTPROTO_*` en el `.env` de SU instancia); duplicarlas causa `AUTH_KEY_DUPLICATED`. Mapa: prod=cuenta actual, staging=vieja-dev, local=nueva
- **NEVER define ingestion-telegram in `docker-compose.staging.yml` or `.prod.yml`** — un compose por env (ver invariante #7)
- **NEVER create feed tables in the backend** — cada env lee SU ingestion vía HTTP API (sin réplicas, sin tablas duplicadas)
- **Backend MUST consume via SSE its own ingestion** — `INGESTION_TELEGRAM_URL`: dev `http://localhost:3031`, staging twin `http://onchain-bot-ingestion-telegram-staging:3031`, prod `http://onchain-bot-ingestion-telegram:3031` (host `:3032`; Tailscale `cryptoganster.tailf01c61.ts.net:3032` — live on Oracle since 2026-09-10, ex-DO (suspended 2026-09-10) was `100.84.4.28` — twin `:3033`)
- **Staging/production backends filter client-side** — cada ingestion emite SUS canales, su backend filtra lo que necesita

### Shared-kernel contracts (handle with care)

- `ChainId` VO (`apps/backend/src/shared/common/value-objects/chain-id.vo.ts`) — shared kernel contract.
- `TokenMetrics` VO (`apps/backend/src/shared/common/value-objects/token-metrics.vo.ts`) — payload breaks downstream consumers if changed.
- TypeORM `kol.entity.ts` — **NOT** the domain aggregate. Domain entity is elsewhere.

## UNIQUE STYLES

- **DDD inside NestJS.** Explicit `AggregateRoot`/`Entity`/`ValueObject`/`DomainEvent` base classes in backend `shared/kernel/`.
- **13-provider adapter pattern** under backend `data-provider/` (NOT 15) + `core/` port. Raw axios, silent nulls, consumer-side caching.
- **Per-env MTProto ingestion**: one session per ingestion-telegram instance (dev/staging-twin/prod, same image) → SSE to ITS backend. MTProto creds live ONLY in each instance's own `.env` (`INGESTION_TELEGRAM_MTPROTO_*`), never shared.
- **Event-driven pipeline with named events** (`<bc>.<aggregate>.<action>`): `extraction.candidates.extracted`, `parsing.call.parsed`, `normalization.call.normalized`, `enrichment.token.enriched` (+`.failed`), `classification.token.classified`, `scoring.token.scored`, `vip-call.approval.approved|rejected` (NOT `filters.token.*` — ghost name, see backend gap 20), `honeypot.analysis.completed`, `publishing.telegram.published|failed`.
- **FSD on frontend, DDD on backend** — strict layer rules in both. See per-app AGENTS.md files.

## COMMANDS

```bash
# First time
npm install                       # workspaces install (apps/*)

# Dev (backend + frontend; ingestion-telegram runs separately on :3031)
npm run dev                       # backend:3030 + frontend:5173, port-cleanup first

# Dev (single)
npm run dev:backend-only          # :3030 (+ db:migrate, see backend AGENTS.md dev:mock for no-Telegram mode)
npm run dev:frontend-only         # :5173

# Build / Test / Lint / Format
npm run build                     # backend nest build + frontend tsc -b && vite build (NO ingestion job)
npm run test                      # backend Jest + frontend Vitest (both workspaces)
npm run test:backend | :frontend
npm run lint | :backend | :frontend
npm run format                    # prettier --write "apps/*/src/**/*.{ts,tsx}"

# Docs staleness check (also runs in pre-commit as warning)
npm run docs:check                # node scripts/check-docs-staleness.mjs

# Bypass all git hooks (use sparingly)
git commit --no-verify -m "..."

# Backend-specific (cd apps/backend)
npm run start:dev                 # nest start --watch + db:migrate
npm run start:debug               # with --inspect-brk
npm run dev:mock                  # no-Telegram mode (USE_MOCK_INGESTION)
npm run cli:inject | :record | :replay
npm run db:migrate | :migrate:dry-run | :status
npm run db:backup                 # calls ../../scripts/backup-db.sh
npm run telegram:gen-session      # LEGACY — sessions now belong to ingestion-telegram

# TypeORM Migrations (cd apps/backend; staging/prod use migrations, dev/test use synchronize:true)
npm run migration:generate -- -n MigrationName
npm run migration:run
npm run migration:revert
npm run migration:show

# Ingestion-telegram (`npm run dev:ingestion` from root, or cd apps/ingestion-telegram; lint/build/test via `lint:ingestion`/`build:ingestion`/`test:ingestion`)
npm run start:dev                 # watch, :3031
npm run telegram:gen-session      # generate INGESTION_TELEGRAM_MTPROTO_SESSION
npm test | test:e2e | test:cov

# Docker
npm run docker:up                 # postgres:16 + redis:7 + pgAdmin (:5050) per apps/backend/docker-compose.yml
npm run docker:down
```

## DEV ON THE ORACLE SERVER (alt-port layout, Oracle host also runs prod/staging)

Prod (`:3030/:5173/:5432/:6379`) and staging (`:3031/:4173/:5433/:6380`) occupy the
standard ports, so dev runs fully shifted and NEVER shares DBs with them:

| Service      | Binds to                    | Notes                                                                                                                              |
| ------------ | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| backend      | `:3040`                     | `apps/backend/.env.dev` (gitignored), `PORT=3040`                                                                                  |
| frontend     | `:5183`                     | `apps/frontend/.env.development` (gitignored), vite `--port 5183`                                                                  |
| postgres dev | `:5434`                     | `onchain-bot-postgres-dev` (`POSTGRES_PORT=5434 docker compose up`)                                                                |
| redis dev    | `:6381`                     | `onchain-bot-redis-dev` (`REDIS_PORT=6381 …`)                                                                                      |
| ingestion    | per-env `:3031/:3032/:3033` | Dev local `:3031` · staging twin `:3033` · prod `:3032` — cada env oye SU ingestion (1:1), nunca una 2ª sesión con la misma triple |

`.env.dev` uses DUMMY keys/tokens/channels (validator Tier-1 requires non-empty;
providers degrade to null, publishers fail 401 without posting anything real).
`INGESTION_TELEGRAM_MTPROTO_ENABLED=false` (+ dummy `API_ID=1` for the format
check). NEVER copy prod/staging secrets into dev env files.

### Process discipline (CRITICAL on this host)

Prod/staging containers run the SAME cmdline as dev
(`node dist/backend/src/main.js`, shown on host as user `opc`, cwd `/app`).
Therefore:

- **Kill dev processes by explicit PID only — NEVER by pattern.**
  `pkill -f` / `pgrep -f` match prod/staging container processes too (this already
  killed a live prod backend once; `unless-stopped` revived it, no outage, but
  do not repeat). Track dev PIDs in `/tmp/dev-pids.txt` at start time.
- **Distinguish twins by cwd/user**: dev = `ubuntu`, cwd `/data/repos/onchain-bot/apps/backend`;
  prod/staging = `opc`, cwd `/app` (container). Verify with
  `readlink /proc/<pid>/cwd` before any kill. `$$`-exclusion loops are NOT
  sufficient (they only protect your own shell).
- **File watchers are unreliable here** (`tsc --watch`, `node --watch`, nodemon
  all miss events): dev loop is explicit — `npx tsc -p tsconfig.build.json`
  in `apps/backend`, then restart the backend PID. `.env` changes always need a
  manual restart (watchers don't track env files).

### Logs without multiple SSH sessions

One tmux session, view-only panes: `tmux new-session -d -s onchain-dev` +
`tail -F /tmp/dev-backend.log|/tmp/dev-frontend.log|/tmp/dev-tsc.log`
(`tmux attach -t onchain-dev`, detach with `Ctrl-b d`). Dev processes themselves
run via `nohup … &` + files (never inside tmux panes — pane surgery has killed
the server before).

### Dev infra recovery (it happened 2026-09-14)

Symptom: backend 500s + `ECONNREFUSED 127.0.0.1:5434` in `/tmp/dev-backend.log`
while `docker ps` shows NO `*-dev` containers (volumes survive — data is safe).

Root cause found same day: **duplicate compose project names.** Without an
explicit `name:`, compose uses the directory basename — and both
`apps/backend/docker-compose.yml` (dev, `/data`) and
`apps/backend/docker-compose.staging.yml` (`/opt/...-staging`) computed
project `backend` with identical service names (`postgres`, `redis`).
Every `up` from either side recreated the other's DB containers (staging
deploys ate dev; later a 5-min dev watchdog ate staging back).
Rule: **every compose file on shared hosts MUST set a unique `name:`**
(`onchain-bot-dev`, `onchain-bot-staging`, `onchain-bot-prod` …).
`docker system prune` (nightly Disk Cleanup workflow + every deploy) then makes
the removal permanent for stopped containers. Never `down` the dev compose —
use `stop` if you must pause it.

Recovery (reattaches the surviving volumes, no data loss):

```bash
cd apps/backend
POSTGRES_PORT=5434 REDIS_PORT=6381 sudo -E docker compose -f docker-compose.yml up -d postgres redis
```

Since 2026-09-14 the recovery is automatic: systemd timer
`onchain-dev-infra.timer` runs the equivalent `up -d` every 5 min
(unit `onchain-dev-infra.service`). To pause dev infra intentionally,
stop the timer first or it will resurrect the containers:
`sudo systemctl stop onchain-dev-infra.timer`.

Attribution trap (same date): `auditd` watches docker usage —
`/etc/audit/rules.d/docker-{cli,sock}.rules`. If dev containers vanish
again, the culprit is one query away (shows login user + full cmdline):

```bash
sudo ausearch -k docker-cli --start recent | grep -E "auid=|proctitle" | tail -20
```

## DEPLOY (GitHub Actions — GHCR + self-hosted, NOT ssh-action)

`.github/workflows/` has 13 workflows (not one):

| Workflow                                                      | Trigger                                                       | Does                                                                                                                                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ci.yml`                                                      | push dev/master, PRs                                          | Node 24, tests with `DATABASE_ENABLED=true` + `DATABASE_SYNCHRONIZE=true`, onnxruntime cache — backend + frontend ONLY (no ingestion-telegram job)                 |
| `deploy.yml` (165 lines)                                      | push master                                                   | below                                                                                                                                                              |
| `deploy-staging.yml`                                          | push dev (waits for CI)                                       | staging deploy                                                                                                                                                     |
| `deploy-ingestion.yml`                                        | push master touching `apps/ingestion-telegram/**` (no-cancel) | ingestion GHCR build+deploy                                                                                                                                        |
| Manual release (no workflow)                                  | —                                                             | maintainer bumps versions + hand-writes per-app `CHANGELOG.md` entries (see `RELEASE-FLOW.md`, forthcoming)                                                        |
| `branch-governance.yml`, `pr-sync-check.yml`, `sync-dev.yml`  | —                                                             | branch policy automation (see GOVERNANCE.md); `sync-dev.yml` only refreshes open PRs — master→dev sync is MANUAL since 2026-09-14 (bot never completed unattended) |
| `cleanup.yml`, `full-prune.yml`, `ghcr-test-{build,pull}.yml` | —                                                             | hygiene + image checks: nightly disk cleanup (3 am cron), manual full prune, GHCR test builds on Dockerfile PRs                                                    |

Prod `deploy.yml` flow:

1. **build-and-push**: Buildx → GHCR (`-backend` + `-frontend` images, `:sha` + `:latest` tags, `linux/amd64,linux/arm64` multi-arch since 2026-09-10).
2. **deploy** (self-hosted runner, label `oracle`): rsync tree (excl. `.git/uploads/node_modules/dist/backups/logs/.env*`) → DB backup → chown → disk prune → pull → **migrations in one-off container** → `compose up -d --force-recreate` → sleep 180 s → healthcheck `:3030/api/health` with **automatic rollback** (recreate + re-check, fail loudly).

Branch model (`GOVERNANCE.md` v2.0, Spanish, active): `dev` (integration) → PR squash → `master` (prod); 1 approval + CI pass + resolved threads; long-lived only `dev`/`master`; no `release/*` (continuous deploy on master push).

## PRODUCTION ORACLE

> Oracle migration 2026-09-10: prod serves from Oracle (`OracleDroplet`); ex-DO node `digitalocean` suspended 2026-09-10. Staging on Oracle HELD (fresh-DB migration bug = separate product track); LiteLLM gateway deferred to a separate track.

| Name                         | Host          | IP                                                                  | SSH Config                    |
| ---------------------------- | ------------- | ------------------------------------------------------------------- | ----------------------------- |
| Production (Oracle)          | OracleDroplet | `ubuntu@150.136.155.23` (Tailscale `cryptoganster`=100.110.169.120) | SSH alias in VS Code Remote   |
| ex-DO (suspended 2026-09-10) | digitalocean  | 144.126.203.139 (ex-DO (suspended 2026-09-10))                      | retired alias `CryptoGanster` |

### Quick Access (from local)

```bash
ssh OracleDroplet
ssh ubuntu@150.136.155.23
```

### Production Commands

```bash
# Logs
docker compose -f /opt/onchain-bot/apps/backend/docker-compose.prod.yml logs backend --tail 100

# Restart
docker compose -f /opt/onchain-bot/apps/backend/docker-compose.prod.yml restart backend

# Health check
curl -s http://localhost:3030/api/health

# Recent published calls
curl -s http://localhost:3030/api/vip-calls/calls/recent?limit=5

# Failed calls
curl -s http://localhost:3030/api/vip-calls/calls/failed?limit=10
```

> **Security:** Never commit production credentials. SSH access details, tokens, and passwords belong in `.env` files (gitignored) or password managers — not in this knowledge base.

## DOCS MAP (beyond AGENTS.md)

- `docs/proyect/{BC,PLAN,DEPLOY,ENV}.md` — project plans (Spanish).
- `docs/deployment/` — Oracle checklists + **ingestion-telegram runbook/FAQ/post-deploy** (operational, current).
- `docs/arch/01-11 + INDEX` — older arch series (superseded by `apps/backend/docs/spydefi/arch/` for backend).
- `docs-money/` (7 files) — ToS-derived monetization notes (verify against current ToS before legal decisions).
- Per-app `CHANGELOG.md` (`apps/{backend,frontend,ingestion-telegram}/CHANGELOG.md`) — hand-written from conventional commits (automation removed 2026-09-11; see `RELEASE-FLOW.md`, forthcoming).
- Release flow: manual bump → changelog entry → tag → `gh release create` (pointer at `docs/release-process.md`).
- Branch protection is declarative via GitHub REST API (`docs/branch-protection.md`); hooks + ruleset + governance workflow = 3 enforcement layers.
- ⚠️ Root `README.md` is stale: 2-app table (no ingestion-telegram), "16 BCs / 14 tablas", "Live" page, MTProto publishing, and links to `frontend.md` / `kol-refactor.md` / `optimize.md` — **none exist**. Prefer this file + per-app AGENTS.md.

## CROSS-SERVICE FLOWS (ports at a glance)

```
Telegram MTProto ──► ingestion-telegram :3031 ──SSE /api/ingestion/stream──► backend :3030
       ▲                         │  media /api/media/…                       │ Bot API sendMessage/photo
       │                         │  health /api/health                       ▼
  (manual join)        backend :3030 ──GET kols|sources/active/ids──► provides channel lists
                                                                              │ Socket.IO
                                                                              ▼
                                                                     frontend :5173 (proxy + WS)
```

- Backend↔ingestion heartbeat: SSE `health:ping` 30 s; backend backoff 1 s→30 s; no replay (lossy by design).
- Media: ingestion-telegram owns `uploads/`; backend reads via HTTP (`INGESTION_TELEGRAM_URL`) or read-only volume in compose.
- Ports: each ingestion listens `:3031` in dev and inside its container; Oracle host maps prod `127.0.0.1:3032` → `:3031` and staging twin `127.0.0.1:3033` → `:3031` (host ports avoid the clash with staging backend on `:3031`).
- Channels: KOL identity lives in backend DB (`telegram-kol/identity`, polled by ingestion-telegram); feed sources/messages/media live in the ingestion DB (`<base>_ingestion`, owned by ingestion-telegram since split 2026-09-08).

## BACKEND PIPELINE (alpha-call path + opaque news path)

```
kol msg ──► intake/extraction ──► intake/parsing ──► normalization ──┬──► chain/detection
 (direct calls, fix-1)                                               │         │
                                                                     ▼         ▼
                                                              enrichment ◄────┘
                                                                     │
                                                                     ▼
                                              classification ──► scoring ──► vip-call-approval
                                                                                  │ APPROVED
                                                                                  ▼
                                                              vip-channel: reserve ──► sendMessage ──► finalize
                                                                                  │ PUBLISHED
                                                                                  ▼
                                                              call-tracking (evals) + achievements (milestones)

feed msg ──► ingestion-telegram (persist RAW) ──► backend poll (every min) ──► FilteredFeedService
                                                                                          (fetch + filter + match)
                                                                ▼
                                                    EnqueueMatchingCronScheduler ──► queue ──► LLM ──► Bot API
                                                    (keywords matched, NOT blacklisted)  (publisher-cron 1 min)
```

**Crypto-News 3-Flag Control (CRITICAL)**:

The pipeline uses **3 independent flags** controlling enqueue, LLM, and publishing:

| Flag                | Owner            | Controls                          | Location            |
| ------------------- | ---------------- | --------------------------------- | ------------------- |
| `matchingEnabled`   | `MatchingConfig` | `EnqueueMatchingCronScheduler`    | `feed-integration/` |
| `llmEnabled`        | `LlmConfig`      | LLM vs raw content mode           | `feed-publisher/`   |
| `publishingEnabled` | `LlmConfig`      | `PublisherCronScheduler` (master) | `feed-publisher/`   |

**Critical Dependency**: `LLM generation = llmEnabled AND publishingEnabled`

LLM generation **ONLY occurs when BOTH** `llmEnabled=true` AND `publishingEnabled=true`. If publishing is paused, LLM doesn't run (saves API costs, no point generating unpublished content).

**Truth Table**:

| Matching | LLM | Publishing | Result                                      |
| :------: | :-: | :--------: | ------------------------------------------- |
|    ❌    | ❌  |     ❌     | All paused                                  |
|    ❌    | ❌  |     ✅     | Drain queue raw (no new enqueue)            |
|    ❌    | ✅  |     ❌     | All paused (LLM inactive)                   |
|    ❌    | ✅  |     ✅     | Drain queue with LLM (no new enqueue)       |
|    ✅    | ❌  |     ❌     | Enqueue only (queue builds)                 |
|    ✅    | ❌  |     ✅     | **Raw pipeline** (enqueue + publish raw)    |
|    ✅    | ✅  |     ❌     | Enqueue only (LLM inactive)                 |
|    ✅    | ✅  |     ✅     | **Full pipeline** (enqueue + LLM + publish) |

**Use Cases**:

- Pause publishing, keep enqueuing: `matching=true`, `publishing=false` → queue accumulates
- Publish raw only (no LLM cost): `llm=false`, `publishing=true`
- Drain existing queue: `matching=false`, `publishing=true`
- Emergency stop: all flags `false`

**Frontend**: 3 independent toggle buttons in `MatchingToggleButton` component (optimistic updates per flag).

**Why decoupled**: Matching shouldn't depend on publisher config; separate configs prevent unnecessary coupling (see `apps/backend/AGENTS.md` §FEED for migration details).

```

Decision numbers: score v1 (base 50, tiers 80/60/40/20/10-risk-names), 8 fail-fast gates, honeypot analyzer port, rep multiplier 0.85–1.15. See `apps/backend/AGENTS.md` §SCORING & GATES.

## INGESTION-TELEGRAM INTERNALS

```

MTProto (one session)
│ realtime NewMessage + 30 s polling (minId=cursor, limit 50)
▼
TelegramMtprotoListenerAdapter ──► MessageQueue ──► subscribe()
│ crypto-news only: MediaDownloaderService ──► uploads/crypto-news/media/{channel}/
▼
MessagePersistenceCoordinator.route(raw, kol|crypto-news)
│ KOL: strip text (ToS) │ news: keep text+media URLs
▼
StreamService.broadcast ──► its backend SSE client (+30 s health:ping, open stream, no register gate)

```

Lossy by design: no replay (backfill endpoint deleted with the multi-backend layer); dedup wired source-side (feed-unification); sleep window unenforced. See `apps/ingestion-telegram/AGENTS.md` gaps.

## KNOWN DRIFT (root level)

- **Ingestion-telegram root tooling (resolved 2026-09-20, T24):** root tiene `dev:ingestion` + `lint/build/test:ingestion`, lint-staged cubre `src/`+`test/` de ingestion, y pre-commit `tsc` cubre las 3 apps. `npm run dev` (solo backend+frontend) es un sistema que no escucha Telegram: sin ingestion en `:3031` el backend solo reintenta el SSE (backoff 1 s→30 s) o usa mock — arranca `npm run dev:ingestion` en otra terminal para oír Telegram.
- **Version skew (resolved 2026-09-20, T22): single-source = per-app `package.json` (+ hand-written per-app `CHANGELOG.md`, manual release flow).** Root `package.json` is `1.0.0` (monorepo placeholder, no CHANGELOG — never bump it as a release); apps are backend `1.2.0` / frontend `1.1.0` / ingestion-telegram `1.1.0`. The old `v1.3.2` in AGENTS headers never existed — headers now state their app version explicitly.
- **gitignore highlights**: `.env*` (except `.example`/`.staging.template`/`.production.template`), `dist/`, `uploads/`, backend `logs/`, `*.tfstate`, `.playwright-mcp/`, `.omo` evidence dirs (plans/drafts tracked).
- **`infra/terraform/terraform.tfvars` is git-tracked** (tfstate correctly ignored). Audit it for secrets; `.terraform/` provider binaries are also tracked (repo bloat — darwin-only binary committed).

## NOTES

> **Security:** Never commit production credentials. SSH access details, tokens, and passwords belong in `.env` files (gitignored) or password managers — not in this knowledge base.

- **`.env.dev` takes precedence** over `.env` (`ConfigModule.envFilePath: ['.env.dev', '.env']`, both NestJS services).
- **Port cleanup before dev**: `scripts/cleanup-ports.mjs` runs as `predev` hook — kills stale 3030/5173 holders.
- **MTProto lives in ingestion-telegram** (`INGESTION_TELEGRAM_MTPROTO_*` there, nowhere else). Backend publishing is Bot API (`vip-calls/vip-channel` + feed publisher + chain-dexter-bot). Backend MTProto branch is deleted (forcing it throws `410 Gone`); rollback is a previous image tag, never a backend session.
- **Frontend port 5173 is strict**: Vite exits if port is held; cleanup script handles this.
- **`@/*` alias is frontend-only.** Don't use it in backend imports.
- **No CLAUDE.md exists** — conventions live in `apps/backend/docs/spydefi/arch/`, `GOVERNANCE.md` (branches), and per-app AGENTS.md files.
- **AGENTS.md map**: this file (root) + `apps/{backend,ingestion-telegram,frontend}/AGENTS.md`. No sub-BC AGENTS.md remain (consolidated 2026-09-04).

## MEGA-REFACTOR (branch `feat/mega-refactor-tramos`)

Goal: extract 3 new apps out of the backend — kol-system → feed-publisher
→ market-data (+ `dexter-onchain-bot` as Tramo 3 final phase, P13). Per-env SSE
+ per-app DBs intact.

| Tramo           | Plan                                            |
| --------------- | ----------------------------------------------- |
| central (index) | `.omo/plans/mega-refactor-central.md`           |
| 1 · kol-system  | `.omo/plans/mega-refactor-kol-system.md`        |
| 2 · content-pub.| `.omo/plans/mega-refactor-feed-publisher.md` |
| 3 · market-data | `.omo/plans/mega-refactor-market-data.md`       |

Decisions: `.omo/drafts/mega-refactor-tramos.md` §7.6 (P1–P27). Target tree:
`.omo/reference/mega-refactor-target-tree.md`. Build status per app lives in
`apps/kol-system/AGENTS.md` §PROGRAM INDEX.
```
