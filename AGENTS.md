# PROJECT KNOWLEDGE BASE

**Refreshed:** 2026-09-04 (was generated 2026-07-02, commit 3576329 — rewritten, old content was stale)
**Branch:** master

## OVERVIEW

**Alpha Meta Token Scanner** — monorepo, 3 apps: NestJS alpha-call pipeline (`apps/backend`, :3030) + centralized Telegram ingestion (`apps/ingestion-service`, :3031, SSE fan-out) + React/Vite dashboard (`apps/frontend`, :5173). Private, UNLICENSED. Node 22+ required, CI runs Node 24. TypeScript 5.9 (root) / 5.7 (backends).

Per-app docs (verified, authoritative over this file for details): `apps/backend/AGENTS.md`, `apps/ingestion-service/AGENTS.md`, `apps/frontend/AGENTS.md`. Sub-BC `AGENTS.md` files were consolidated into `apps/backend/AGENTS.md` on 2026-09-04 (7 files migrated + deleted).

### Ingestion-Service Architecture (CRITICAL — One Source of Truth)

**The ingestion-service is STANDALONE and CENTRALIZED** — there is ONE instance that owns ALL Telegram ingestion data and serves ALL environments:

```
                    ┌──────────────────────────────────────────────┐
                    │  ingestion-service (ÚNICO) - Puerto 3032      │
                    │                                               │
                    │  OWNERSHIP:                                   │
                    │  ✓ Una sola sesión MTProto                    │
                    │  ✓ DB: crypto_news_sources (sources)          │
                    │  ✓ DB: kol_identities (KOL metadata)          │
                    │  ✓ DB: crypto_news_messages (messages)        │
                    │  ✓ DB: crypto_news_message_media (media refs) │
                    │  ✓ uploads/: archivos de media descargados    │
                    │                                               │
                    │  API ENDPOINTS (read-only para backends):     │
                    │  → GET /api/crypto-news/sources              │
                    │  → GET /api/crypto-news/messages             │
                    │  → GET /api/media/:channelId/:messageId/:idx │
                    │  → GET /api/ingestion/stream (SSE)           │
                    └──────────────┬───────────────────────────────┘
                                   │ HTTP API (read-only)
                  ┌────────────────┼────────────────┐
                  │                │                │
          ┌───────▼──────┐  ┌─────▼──────┐  ┌─────▼──────┐
          │ Backend Dev   │  │ Backend     │  │ Backend    │
          │ (local)       │  │ Staging     │  │ Production │
          │               │  │ :3031       │  │ :3030      │
          │ NO crypto-news│  │ NO crypto-  │  │ NO crypto- │
          │ DB tables     │  │ news tables │  │ news tables│
          └───────────────┘  └─────────────┘  └────────────┘
                  │                │                │
          ┌───────▼──────┐  ┌─────▼──────┐  ┌─────▼──────┐
          │ Frontend Dev  │  │ Frontend    │  │ Frontend   │
          │ localhost     │  │ Staging     │  │ Production │
          │ :5173         │  │ :4173       │  │ :80        │
          └───────────────┘  └─────────────┘  └────────────┘
               ↑                  ↑                  ↑
               └──────────────────┴──────────────────┘
                        Todos consultan ingestion-service
                        para crypto-news data (HTTP API)
```

**INVARIANTS (DO NOT VIOLATE)**:

1. **Una sola instancia de ingestion-service** — NO crear `onchain-bot-staging-ingestion` ni instancias por environment
2. **Una sola sesión MTProto** — credenciales viven SOLO en ingestion-service (`.env` ← `INGESTION_TELEGRAM_MTPROTO_*`); duplicarlas causa `AUTH_KEY_DUPLICATED`
3. **Una sola DB para crypto-news** — tablas `crypto_news_sources`, `crypto_news_messages`, `crypto_news_message_media` viven SOLO en ingestion-service DB
4. **Ingestion-service es el owner de media** — descarga archivos a `uploads/crypto-news/media/` y los sirve vía `GET /api/media/*`
5. **Backends NO escriben crypto-news** — staging/prod solo LEEN vía HTTP API del ingestion-service (no réplican tablas ni datos)
6. **Frontend consume directamente del ingestion-service** — `GET /api/crypto-news/messages` apunta al puerto 3032 (no proxy vía backend)
7. **NO definir ingestion-service en `docker-compose.staging.yml` ni `.prod.yml`** — solo existe en `docker-compose.ingestion.yml` (standalone)

**Rationale**:

- ✅ **Sin duplicación de datos**: staging y production ven EXACTAMENTE los mismos mensajes/sources/media
- ✅ **Sincronización automática**: un solo mensaje descargado → visible en todos los ambientes instantáneamente
- ✅ **Escalabilidad**: agregar nuevos ambientes (QA, dev2) solo requiere apuntarlos al ingestion-service existente
- ✅ **Separación de responsabilidades**: ingestion-service maneja MTProto + storage, backends manejan lógica de negocio (scoring, publishing, etc.)
- ✅ **Evita conflictos**: sin DBs duplicadas, sin archivos duplicados, sin sesiones duplicadas

**Data Flow (Crypto-News — Opción A: Filter on-Read)**:

```
Telegram Channel (MTProto)
    ↓ (ingestion-service lee mensaje)
ingestion-service:
    1. Descarga media → uploads/crypto-news/media/
    2. INSERT INTO crypto_news_messages (id, content, channel_id, ...) ← RAW content, NO filters
    3. INSERT INTO crypto_news_message_media (message_id, url, type, ...)
    4. Emite evento SSE (metadata-only, NO content)
Backend (staging/prod) — OPCIÓN A (filter on-read):
    1. EnqueueMatchingCronScheduler (cron every minute):
       a. Fetch RAW messages: CryptoNewsIngestionClient → GET ingestion:3032/api/crypto-news/messages?limit=50
       b. Filter + match: FilteredCryptoNewsService:
          - Load per-channel ContentFilterService rules (regex transforms)
          - Apply filters to title + content (on-read, NO persist)
          - Evaluate keywords (simple + AND-groups)
          - Check blacklist phrases (block if match)
       c. Enqueue matched messages: EnqueueMatchingMessageUseCase → publisher queue (cap 36)
    2. PublisherCronScheduler (every minute): drain queue → LLM → Bot API publish
Frontend:
    1. Consulta directo a ingestion:3032: GET /api/crypto-news/messages?limit=50 (RAW content)
    2. Renderiza mensajes SIN filtros (display mode)
    3. Media se carga de: http://ingestion:3032/api/media/{channelId}/{messageId}/{index}
```

**Arquitectura Opción A — Invariantes**:

- Ingestion-service guarda contenido CRUDO (sin filtros, sin transformaciones)
- Backend staging/production aplican SUS PROPIOS filtros on-read (NO replican DB)
- Frontend muestra contenido RAW (sin transformaciones)
- Publisher queue recibe contenido FILTRADO (AFTER ContentFilterService + keywords matched)

**KOL Data** (nota: actualmente los KOL identities están en el backend, no en ingestion-service — considerar migración futura para consistencia).

## STRUCTURE

```
.
├── apps/
│   ├── backend/             # NestJS 11 — DDD/Hexagonal, 22 wired modules (NOT 19)
│   ├── ingestion-service/   # NestJS 11 — single MTProto session → SSE (:3031)
│   └── frontend/            # React 18 + Vite 5 — FSD dashboard (:5173)
├── scripts/                 # 28 files: sync-*, backup-db.sh, cleanup-ports.mjs, check-docs-staleness.mjs,
│                            # audit-enrichment-apis.js, deploy.sh, diagnose-*, validate-session-migration.sh…
├── config/                  # ingestion.config.json (safety defaults for ingestion-service)
├── infra/                   # cron/docker-prune, systemd/socat Tailscale tunnel templates, terraform/ (tracked tfvars + provider binaries — see Drift)
├── docs/                    # HELIUS, api, arch, architecture, bot, ci-cd, deployment, fixes, nest-js, proyect…
├── docs-money/              # ToS summary, monetization, KOL onboarding/legal, rate limits (7 files)
├── .github/workflows/       # deploy.yml — GHCR build + self-hosted droplet deploy (NOT ssh-action)
├── .husky/                  # pre-commit, commit-msg, pre-push (Husky v9)
├── GOVERNANCE.md            # Branch governance (Spanish, v2.0, active)
├── opencode.json            # opencode config
├── bootstrap-droplet.sh     # droplet bootstrap
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

## WHERE TO LOOK

| Task                 | Location                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------- |
| Run backend+frontend | `npm run dev` (root, port-cleanup → :3030 + :5173; ingestion-service NOT included)           |
| Run ingestion        | `cd apps/ingestion-service && npm run start:dev` (:3031, no root script)                     |
| Backend tests        | `npm run test:backend` (Jest, 173 `*.spec.ts` co-located)                                    |
| Ingestion tests      | `cd apps/ingestion-service && npm test` (15 specs)                                           |
| Frontend tests       | `npm run test:frontend` (Vitest, 23 `*.test.*` files)                                        |
| Lint                 | `npm run lint` (all workspaces) / `:backend` / `:frontend` (flat configs, differ per app)    |
| Format               | `npm run format` (Prettier, singleQuote + trailingComma all)                                 |
| Build                | `npm run build` (backend `nest build` + frontend `tsc -b && vite build`; no ingestion job)   |
| DB migrations        | `cd apps/backend && npm run migration:run` (`scripts/run-migrations.sh` + TypeORM)           |
| Backfill scripts     | `apps/backend/scripts/backfills/` (19 date-prefixed, idempotent) + `migrate.js/ts`           |
| MTProto session      | `apps/ingestion-service`: `npm run telegram:gen-session` (sessions live ONLY there)          |
| Seed KOLs/sources    | `POST telegram-kol/identity/kols` / `POST crypto-news/sources` on backend (DB-driven)        |
| Architecture docs    | `apps/backend/docs/spydefi/arch/` (14 files: DDD, anti-patterns, ADRs)                       |
| Safety config        | `config/ingestion.config.json` (used only in Docker; dev falls back to defaults)             |
| Git hooks            | `.husky/{pre-commit,commit-msg,pre-push}` + `lint-staged.config.js` + `commitlint.config.js` |
| Docs staleness check | `npm run docs:check` + `.docs-map.jsonc` (sub-BC entries removed 2026-09-04)                 |

## CODE MAP (high-centrality symbols, line numbers verified)

| Symbol                       | Type           | Location                                                                                                           | Role                                                                |
| ---------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `bootstrap()`                | function       | `apps/backend/src/main.ts:85`                                                                                      | Entry; dotenv, DEBUG trace, 120 s timeout, ValidationPipe, WS       |
| `AppModule`                  | class          | `apps/backend/src/app.module.ts`                                                                                   | 22 modules + infra (Dashboard/Identity imports commented)           |
| `appConfig`                  | const          | `apps/backend/src/shared/common/config/app.config.ts:338`                                                          | `registerAs('app', …)` — all backend env validation                 |
| `DataProviderPort`           | abstract class | `apps/backend/src/data-provider/core/data-provider.port.ts`                                                        | Base for 13 external API adapters                                   |
| `AggregateRoot<TId>`         | class          | `apps/backend/src/shared/kernel/aggregate-root.ts:17`                                                              | DDD aggregate base — Entity + DomainEvent collection                |
| `DomainErrorFilter`          | class          | `apps/backend/src/shared/filters/domain-error.filter.ts:12`                                                        | `DomainError` → HTTP status                                         |
| `WsGateway`                  | class          | `apps/backend/src/shared/ws/gateway/ws.gateway.ts:32`                                                              | Socket.IO fan-out (`EVENT_MAP`, 12 events)                          |
| `TelegramSseListenerAdapter` | class          | `apps/backend/src/telegram/ingestion/shared/api/sse/…` (459 lines)                                                 | Backend SSE client (fetch+ReadableStream, backoff 1 s→30 s)         |
| `StreamService`              | class          | `apps/ingestion-service/src/stream/application/services/stream.service.ts`                                         | SSE fan-out server (:3031) + 30 s heartbeat                         |
| `IngestionCoordinator` ×2    | class          | ingestion-service `telegram/shared/application/coordinators/…` + backend `telegram/ingestion/shared/application/…` | Route raw messages → typed payloads (service) / use cases (backend) |
| `App`                        | component      | `apps/frontend/src/app/index.tsx`                                                                                  | QueryProvider → SocketProvider → AppRouter                          |
| `RootLayout`                 | component      | `apps/frontend/src/app/layouts/root-layout.tsx:11`                                                                 | Header nav (5 links) + `<Outlet/>`                                  |

## CONVENTIONS

### TypeScript (from `tsconfig.base.json` — verified)

- **Strict flags**: `strictNullChecks`, `noImplicitAny`, `strictBindCallApply`, `noFallthroughCasesInSwitch`, `forceConsistentCasingInFileNames`, `isolatedModules` — all on. `strict` is **NOT** enabled globally.
- **Backend**: `nodenext` + `nodenext` resolution, `resolvePackageJsonExports`, `experimentalDecorators`, `emitDecoratorMetadata`.
- **Frontend**: `ESNext` + `Bundler` resolution, `noEmit`, `allowImportingTsExtensions`, `jsx: react-jsx`.

### Path aliases

- **Backend** (`apps/backend/tsconfig.json`): `shared/*` (+`shared/kernel/*`, `shared/common/*`), `chain/*`, `token/*`, `telegram/*`, `kol/*`, `settings/*`, `dashboard/*`, `data-provider/*`, `health/*`, `src/*` — rooted at `src/`. `@/*` is **not** a backend alias. ⚠️ Dead `discovery/*` alias (no `src/discovery/`) + duplicated `settings/*` key.
- **Ingestion-service**: `shared/*`, `telegram/*`, `stream/*`, `media/*`, `health/*`, `src/*` (+ kernel/common). No `@/*`.
- **Frontend** (`apps/frontend/tsconfig.json`): only `@/*` → `src/*` (`baseUrl: ./src`). No `../../../` chains.

### ESLint (flat configs — differ per app, NOT project-wide)

- **Backend + ingestion-service**: `@typescript-eslint/no-explicit-any` **off**, `require-await` off, `no-floating-promises`/`no-unsafe-*`/`await-thenable` warn, `no-useless-catch` warn, unused vars warn (`^_`), `prettier/prettier` error (`endOfLine: auto`).
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

**Hook files**: `.husky/pre-commit` (minimal shell, Husky v9 shim in `.husky/_/`) · `.husky/commit-msg` (commitlint) · `.husky/pre-push` (`npm test`) · `lint-staged.config.js` (explicit `--config` per app for backend `src/`+`test/` and frontend `src/`; prettier for json/md/yaml — ⚠️ no ingestion-service glob, its files skip commit lint) · `commitlint.config.js` (conventional) · `opencode.json` (bash `ask` by default; `allow` for read-only git/gh).

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

- TypeORM 0.3 with `synchronize: true` (dev/test). Staging/prod: migrations (`scripts/run-migrations.sh`, 12 files in backend; ingestion-service reads one table, no migrations of its own).
- Per-BC schema-per-context is v2 plan; v1 uses in-memory repos within modules (largest: normalization cap 5000).
- Database toggle: `DATABASE_ENABLED=true` to enable; tests force it on in `jest.setup.ts` (both services).

### Tests

- Backend: co-located `*.spec.ts` (`testRegex: .*.spec\.ts$`), **173 spec files** (NOT 74). E2E in `apps/backend/test/*.e2e-spec.ts` (separate `jest-e2e.json`; `--forceExit`, 30 s timeout).
- Ingestion-service: 15 specs + 5 e2e files.
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

### Ingestion-Service (CRITICAL — Architecture Invariants)

- **NEVER create multiple ingestion-service instances** — one standalone instance on port 3032 feeds ALL backends (dev/staging/prod)
- **NEVER duplicate MTProto credentials** — session lives ONLY in `apps/ingestion-service/.env` (`INGESTION_TELEGRAM_MTPROTO_*`); duplication triggers `AUTH_KEY_DUPLICATED`
- **NEVER define ingestion-service in `docker-compose.staging.yml` or `.prod.yml`** — only `docker-compose.ingestion.yml` (standalone)
- **NEVER create separate crypto-news sources DBs per environment** — single `crypto_news_sources` table, both backends query the same ingestion-service
- **Backend MUST consume via SSE** — `INGESTION_SERVICE_URL` points to the centralized instance (Tailscale `cryptoganster.tailf01c61.ts.net:3032` or `localhost:3032`)
- **Staging/production backends filter client-side** — ingestion-service broadcasts ALL channels, backends subscribe to what they need

### Shared-kernel contracts (handle with care)

- `ChainId` VO (`apps/backend/src/shared/common/value-objects/chain-id.vo.ts`) — shared kernel contract.
- `TokenMetrics` VO (`apps/backend/src/shared/common/value-objects/token-metrics.vo.ts`) — payload breaks downstream consumers if changed.
- TypeORM `kol.entity.ts` — **NOT** the domain aggregate. Domain entity is elsewhere.

## UNIQUE STYLES

- **DDD inside NestJS.** Explicit `AggregateRoot`/`Entity`/`ValueObject`/`DomainEvent` base classes in backend `shared/kernel/`.
- **13-provider adapter pattern** under backend `data-provider/` (NOT 15) + `core/` port. Raw axios, silent nulls, consumer-side caching.
- **Centralized MTProto ingestion**: one session in ingestion-service → SSE fan-out → N backends consume. MTProto creds live ONLY there (`INGESTION_TELEGRAM_MTPROTO_*`).
- **Event-driven pipeline with named events** (`<bc>.<aggregate>.<action>`): `extraction.candidates.extracted`, `parsing.call.parsed`, `normalization.call.normalized`, `enrichment.token.enriched` (+`.failed`), `classification.token.classified`, `scoring.token.scored`, `vip-call.approval.approved|rejected` (NOT `filters.token.*` — ghost name, see backend gap 20), `honeypot.analysis.completed`, `publishing.telegram.published|failed`.
- **FSD on frontend, DDD on backend** — strict layer rules in both. See per-app AGENTS.md files.

## COMMANDS

```bash
# First time
npm install                       # workspaces install (apps/*)

# Dev (backend + frontend; ingestion-service runs separately on :3031)
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
npm run telegram:gen-session      # LEGACY — sessions now belong to ingestion-service

# TypeORM Migrations (cd apps/backend; staging/prod use migrations, dev/test use synchronize:true)
npm run migration:generate -- -n MigrationName
npm run migration:run
npm run migration:revert
npm run migration:show

# Ingestion-service (cd apps/ingestion-service — no root scripts)
npm run start:dev                 # watch, :3031
npm run telegram:gen-session      # generate INGESTION_TELEGRAM_MTPROTO_SESSION
npm test | test:e2e | test:cov

# Docker
npm run docker:up                 # postgres:16 + redis:7 + pgAdmin (:5050) per apps/backend/docker-compose.yml
npm run docker:down
```

## DEPLOY (GitHub Actions — GHCR + self-hosted, NOT ssh-action)

`.github/workflows/` has 13 workflows (not one):

| Workflow                                                                                   | Trigger                                                      | Does                                                                                                                                                             |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`                                                                                   | push dev/master, PRs                                         | Node 24, tests with `DATABASE_ENABLED=true` + `DATABASE_SYNCHRONIZE=true`, onnxruntime cache — backend + frontend ONLY (no ingestion-service job)                |
| `deploy.yml` (165 lines)                                                                   | push master                                                  | below                                                                                                                                                            |
| `deploy-staging.yml`                                                                       | push dev (waits for CI)                                      | staging deploy                                                                                                                                                   |
| `deploy-ingestion.yml`                                                                     | push master touching `apps/ingestion-service/**` (no-cancel) | ingestion GHCR build+deploy                                                                                                                                      |
| `release-please.yml` + config                                                              | —                                                            | changelog automation (feeds `CHANGELOG.md` files); versions backend + frontend packages ONLY (ingestion-service unversioned — explains part of the version skew) |
| `branch-governance.yml`, `pr-sync-check.yml`, `sync-dev/master-to-dev.yml`, `sync-dev.yml` | —                                                            | branch policy automation (see GOVERNANCE.md); both sync files auto-sync master→dev on push (possible overlap — verify before touching)                           |
| `cleanup.yml`, `full-prune.yml`, `ghcr-test-{build,pull}.yml`                              | —                                                            | hygiene + image checks: nightly disk cleanup (3 am cron), manual full prune, GHCR test builds on Dockerfile PRs                                                  |

Prod `deploy.yml` flow:

1. **build-and-push**: Buildx → GHCR (`-backend` + `-frontend` images, `:sha` + `:latest` tags, `linux/amd64`).
2. **deploy** (self-hosted runner): rsync tree (excl. `.git/uploads/node_modules/dist/backups/logs/.env*`) → DB backup → chown → disk prune → pull → **migrations in one-off container** → `compose up -d --force-recreate` → sleep 180 s → healthcheck `:3030/api/health` with **automatic rollback** (recreate + re-check, fail loudly).

Branch model (`GOVERNANCE.md` v2.0, Spanish, active): `dev` (integration) → PR squash → `master` (prod); 1 approval + CI pass + resolved threads; long-lived only `dev`/`master`; no `release/*` (continuous deploy on master push).

## PRODUCTION DROPLET

| Name       | Host          | IP              | SSH Config                  |
| ---------- | ------------- | --------------- | --------------------------- |
| Production | CryptoGanster | 144.126.203.139 | SSH alias in VS Code Remote |

### Quick Access (from local)

```bash
ssh CryptoGanster
ssh root@144.126.203.139
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
- `docs/deployment/` — droplet checklists + **ingestion-service runbook/FAQ/post-deploy** (operational, current).
- `docs/arch/01-11 + INDEX` — older arch series (superseded by `apps/backend/docs/spydefi/arch/` for backend).
- `docs-money/` (7 files) — ToS-derived monetization notes (verify against current ToS before legal decisions).
- `CHANGELOG.md` — auto-generated by release-please from conventional commits (don't hand-edit).
- Release flow: conventional commits on `master` → release-please PR → squash-merge → tag + GitHub Release automatically (`docs/release-process.md`; hotfix path documented there).
- Branch protection is declarative via GitHub REST API (`docs/branch-protection.md`); hooks + ruleset + governance workflow = 3 enforcement layers.
- ⚠️ Root `README.md` is stale: 2-app table (no ingestion-service), "16 BCs / 14 tablas", "Live" page, MTProto publishing, and links to `frontend.md` / `kol-refactor.md` / `optimize.md` — **none exist**. Prefer this file + per-app AGENTS.md.

## CROSS-SERVICE FLOWS (ports at a glance)

```
Telegram MTProto ──► ingestion-service :3031 ──SSE /api/ingestion/stream──► backend :3030
       ▲                         │  media /api/media/…                       │ Bot API sendMessage/photo
       │                         │  health /api/health                       ▼
  (manual join)        backend :3030 ──GET kols|sources/active/ids──► provides channel lists
                                                                              │ Socket.IO
                                                                              ▼
                                                                     frontend :5173 (proxy + WS)
```

- Backend↔ingestion heartbeat: SSE `health:ping` 30 s; backend backoff 1 s→30 s; no replay (lossy by design).
- Media: ingestion-service owns `uploads/`; backend reads via HTTP (`INGESTION_SERVICE_URL`) or read-only volume in compose.
- Channels: backend DB (`telegram-kol/identity`, `crypto-news/sources`) is the source of truth; ingestion-service polls IDs.

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

crypto-news msg ──► ingestion-service (persist RAW) ──► backend poll (every min) ──► FilteredCryptoNewsService
                                                                                          (fetch + filter + match)
                                                                ▼
                                                    EnqueueMatchingCronScheduler ──► queue ──► LLM ──► Bot API
                                                    (keywords matched, NOT blacklisted)  (publisher-cron 1 min)
```

Decision numbers: score v1 (base 50, tiers 80/60/40/20/10-risk-names), 8 fail-fast gates, honeypot analyzer port, rep multiplier 0.85–1.15. See `apps/backend/AGENTS.md` §SCORING & GATES.

## INGESTION-SERVICE INTERNALS

```
MTProto (one session)
   │ realtime NewMessage + 30 s polling (minId=cursor, limit 50)
   ▼
TelegramMtprotoListenerAdapter ──► MessageQueue ──► subscribe()
   │ crypto-news only: MediaDownloaderService ──► uploads/crypto-news/media/{channel}/
   ▼
IngestionCoordinator.route(raw, kol|crypto-news)
   │ KOL: strip text (ToS) │ news: keep text+media URLs
   ▼
StreamService.broadcast ──► N SSE clients (+30 s health:ping, DisconnectionTracker)
```

Lossy by design: no replay, backfill unimplemented, dedup service present but unwired, sleep window unenforced. See `apps/ingestion-service/AGENTS.md` gaps.

## KNOWN DRIFT (root level)

- **Ingestion-service absent from root tooling**: no `dev`/`build`/`test`/`lint` root entries, no lint-staged glob, pre-commit `tsc` covers backend+frontend only. `npm run dev` gives you a system that can't hear Telegram.
- **Version skew**: root `package.json` is `0.0.1`, apps are `1.3.2`. Don't trust the root version.
- **gitignore highlights**: `.env*` (except `.example`/`.staging.template`/`.production.template`), `dist/`, `uploads/`, backend `logs/`, `*.tfstate`, `.playwright-mcp/`, `.omo` evidence dirs (plans/drafts tracked).
- **`infra/terraform/terraform.tfvars` is git-tracked** (tfstate correctly ignored). Audit it for secrets; `.terraform/` provider binaries are also tracked (repo bloat — darwin-only binary committed).

## NOTES

> **Security:** Never commit production credentials. SSH access details, tokens, and passwords belong in `.env` files (gitignored) or password managers — not in this knowledge base.

- **`.env.dev` takes precedence** over `.env` (`ConfigModule.envFilePath: ['.env.dev', '.env']`, both NestJS services).
- **Port cleanup before dev**: `scripts/cleanup-ports.mjs` runs as `predev` hook — kills stale 3030/5173 holders.
- **MTProto lives in ingestion-service** (`INGESTION_TELEGRAM_MTPROTO_*` there, nowhere else). Backend publishing is Bot API (`vip-calls/vip-channel` + crypto-news publisher + chain-dexter-bot). Backend MTProto mode is legacy/rollback-only.
- **Frontend port 5173 is strict**: Vite exits if port is held; cleanup script handles this.
- **`@/*` alias is frontend-only.** Don't use it in backend imports.
- **No CLAUDE.md exists** — conventions live in `apps/backend/docs/spydefi/arch/`, `GOVERNANCE.md` (branches), and per-app AGENTS.md files.
- **AGENTS.md map**: this file (root) + `apps/{backend,ingestion-service,frontend}/AGENTS.md`. No sub-BC AGENTS.md remain (consolidated 2026-09-04).
