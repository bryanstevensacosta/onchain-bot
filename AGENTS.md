# PROJECT KNOWLEDGE BASE

**Generated:** 2026-07-02 23:10 AST
**Commit:** 3576329
**Branch:** master

## OVERVIEW

**Alpha Meta Token Scanner** — monorepo: NestJS pipeline (ingest Telegram KOL alpha-calls, classify, score, republish to a VIP channel) + React/Vite dashboard. Private, UNLICENSED. Node 22+, TypeScript 5.9.

## STRUCTURE

```
.
├── apps/
│   ├── backend/           # NestJS — DDD/Hexagonal, 19 bounded contexts
│   └── frontend/          # React/Vite — Feature-Sliced Design (FSD)
├── scripts/               # Monorepo utility scripts (audit, db-backup, port-cleanup, check-docs-staleness)
├── docs/                  # Architecture + vendor docs (mixed; some experimental)
├── docs-money/            # Monetization / KOL onboarding (separate from docs)
├── .husky/                # Git hooks (pre-commit, commit-msg, pre-push) — Husky v9
├── .omo/                  # OmoCodex agent framework state (plans, evidence, drafts)
├── .sisyphus/             # Legacy Sisyphus agent state
├── .kiro/                 # Kiro IDE spec definitions
└── .playwright-mcp/       # Playwright MCP visual QA artifacts (gitignored-ish)
```

> `.omo/`, `.sisyphus/`, `.kiro/`, `.playwright-mcp/` are agent/tool state — **do not** source from them.

## WHERE TO LOOK

| Task                 | Location                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------- |
| Run both apps        | `npm run dev` (root, port-cleanup → backend:3030 + frontend:5173)                            |
| Backend-only dev     | `npm run dev:backend-only` (3030)                                                            |
| Frontend-only dev    | `npm run dev:frontend-only` (5173)                                                           |
| Backend tests        | `npm run test:backend` (Jest, co-located `*.spec.ts`)                                        |
| Frontend tests       | `npm run test:frontend` (Vitest)                                                             |
| Lint                 | `npm run lint` / `:backend` / `:frontend` (ESLint flat config)                               |
| Format               | `npm run format` (Prettier, singleQuote + trailingComma all)                                 |
| Build                | `npm run build` (nest build + vite build)                                                    |
| DB migrations        | `cd apps/backend && npm run migration:run`                                                   |
| Backfill scripts     | `apps/backend/scripts/backfills/` (date-prefixed, idempotent)                                |
| Seed KOLs            | `cd apps/backend && npm run telegram:gen-session` then seed env                              |
| Architecture docs    | `apps/backend/docs/spydefi/arch/` (DDD, anti-patterns, ADRs)                                 |
| Git hooks            | `.husky/{pre-commit,commit-msg,pre-push}` + `lint-staged.config.js` + `commitlint.config.js` |
| Docs staleness check | `npm run docs:check` + `.docs-map.jsonc` + `scripts/check-docs-staleness.mjs`                |

## CODE MAP (high-centrality symbols)

| Symbol               | Type           | Location                                                    | Role                                                             |
| -------------------- | -------------- | ----------------------------------------------------------- | ---------------------------------------------------------------- |
| `bootstrap()`        | function       | `apps/backend/src/main.ts:38`                               | NestJS entry; CORS, ValidationPipe, DomainErrorFilter, IoAdapter |
| `AppModule`          | class          | `apps/backend/src/app.module.ts:36`                         | Wires 19 BCs + Config/EventEmitter/Schedule/Database/Redis       |
| `appConfig`          | const          | `apps/backend/src/shared/common/config/app.config.ts:178`   | All env var validation via `registerAs('app', ...)`              |
| `DataProviderPort`   | abstract class | `apps/backend/src/data-provider/core/data-provider.port.ts` | Base for 13 external API adapters                                |
| `AggregateRoot<TId>` | class          | `apps/backend/src/shared/kernel/aggregate-root.ts:17`       | DDD aggregate base — extends Entity + DomainEvent collection     |
| `DomainErrorFilter`  | class          | `apps/backend/src/shared/filters/domain-error.filter.ts:12` | Global NestJS exception filter — `DomainError` → HTTP status     |
| `WsGateway`          | class          | `apps/backend/src/shared/ws/gateway/ws.gateway.ts:32`       | Socket.IO gateway — broadcasts pipeline events                   |
| `App`                | component      | `apps/frontend/src/app/index.tsx`                           | React root: QueryProvider → SocketProvider → AppRouter           |
| `RootLayout`         | component      | `apps/frontend/src/app/layouts/root-layout.tsx:11`          | Header nav + `<Outlet/>`                                         |

## CONVENTIONS

### TypeScript (both apps, from `tsconfig.base.json`)

- **Strict flags**: `strictNullChecks`, `noImplicitAny`, `strictBindCallApply`, `noFallthroughCasesInSwitch`, `forceConsistentCasingInFileNames`, `isolatedModules` — all on. `strict` (which would include `strictPropertyInitialization`) is **NOT** enabled globally.
- **Backend module**: `nodenext` + `nodenext` resolution, `resolvePackageJsonExports`, `experimentalDecorators`, `emitDecoratorMetadata`.
- **Frontend module**: `ESNext` + `Bundler` resolution, `noEmit`, `allowImportingTsExtensions`, `jsx: react-jsx`.

### Path aliases

- **Backend** (`apps/backend/tsconfig.json`): `shared/*`, `chain/*`, `token/*`, `telegram/*`, `kol/*`, `settings/*`, `dashboard/*`, `data-provider/*`, `health/*` — all rooted at `src/`. Use `@/*` is **not** a backend alias.
- **Frontend** (`apps/frontend/tsconfig.json`): only `@/*` → `src/*`. Don't introduce relative `../../../` chains in features.

### ESLint (flat config)

- `@typescript-eslint/no-explicit-any`: **off** (allowed project-wide)
- `@typescript-eslint/require-await`: **off** (in-memory repos use sync impls)
- `@typescript-eslint/no-floating-promises` / `no-unsafe-*` / `await-thenable`: **warn**
- `no-useless-catch`: **warn** (reserved for reconnect logic)
- `prettier/prettier`: **error** with `endOfLine: "auto"` (CRLF tolerated on Windows)
- Unused vars: **warn** with `^_` prefix ignore

### Prettier

- `singleQuote: true`, `trailingComma: "all"` (root `.prettierrc`)

### Git hooks (Husky v9 — `.husky/`)

Three git hooks auto-installed via `husky init`; bypass with `--no-verify`:

| Hook             | Behavior                                                                                                                                                           |     Blocks commit?      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :---------------------: |
| **`pre-commit`** | `lint-staged` (ESLint on staged files per workspace) → `tsc --noEmit --incremental false` on backend + frontend → `npm run docs:check` (non-blocking warning)      | lint + tsc YES; docs NO |
| **`commit-msg`** | `commitlint --edit $1` enforces **conventional commits** (`feat:`, `fix:`, `chore:`, `docs:`, `style:`, `refactor:`, `perf:`, `test:`, `build:`, `ci:`, `revert:`) |           YES           |
| **`pre-push`**   | `npm test` runs backend Jest + frontend Vitest                                                                                                                     |           YES           |

**Hook files**:

- `.husky/pre-commit` — minimal shell, no `#!/usr/bin/env sh` shim line (Husky v9 shim is in `.husky/_/`)
- `.husky/commit-msg` — invokes commitlint
- `.husky/pre-push` — invokes `npm test`
- `lint-staged.config.js` — glob → command map (CJS at root)
- `commitlint.config.js` — `extends: ['@commitlint/config-conventional']`

**Docs staleness check** (`.docs-map.jsonc` + `scripts/check-docs-staleness.mjs`):

- Walks up the directory tree for each staged file, finds matching AGENTS.md entries
- Reports all AGENTS.md from most-specific up to BC level (L2): does NOT warn about app-level (`apps/backend/AGENTS.md`, `apps/frontend/AGENTS.md`) or root (`AGENTS.md`)
- **Non-blocking**: commit passes with a yellow `⚠️` warning; developer decides whether to update
- Run standalone: `npm run docs:check` or `node scripts/check-docs-staleness.mjs`
- Maintain `.docs-map.jsonc` when creating new `AGENTS.md` files at any level

To bypass all hooks for a single commit: `git commit --no-verify -m "..."`.

### NestJS conventions

- `deleteOutDir: true` in `nest-cli.json` (cleans `dist/` on rebuild)
- Bootstrap: `bufferLogs: true` + `FilteredBootstrapLogger` to mute boot noise
- `process.noDeprecation = true` to silence pg@8 "client.query() while already executing" (TypeORM `synchronize: true` triggers it; goes away with migration-based schema)

### Frontend conventions

- React Router v6 (no data router / loaders — TanStack Query owns server state)
- TanStack React Query v5: `staleTime: 5s`, `retry: 1`, `refetchOnWindowFocus: false`
- Socket.IO for realtime (no Zustand, no Redux; zustand is in deps but unused)
- Tailwind CSS 3.4 utility classes; no CSS-in-JS
- MSW 2.6 in deps but not yet wired in tests

### Vite dev proxy (`apps/frontend/vite.config.ts`)

- `/api` → `http://localhost:3030` (no `changeOrigin`)
- `/socket.io` → `http://localhost:3030` (ws: true)
- `strictPort: true` on `127.0.0.1:5173`

### Database

- TypeORM 0.3 with `synchronize: true` (dev). Prod migration path exists via `apps/backend/scripts/backfills/migrate.{js,ts}`.
- Per-BC schema-per-context pattern (v2 plan); v1 uses in-memory repos within modules.
- Database toggle: `DATABASE_ENABLED=true` to enable; tests force it on in `jest.setup.ts`.

### Tests

- Backend: co-located `*.spec.ts`, `testRegex: .*.spec\.ts$`, 74 spec files. E2E in `apps/backend/test/*.e2e-spec.ts` (separate `jest-e2e.json`).
- Frontend: Vitest, mostly co-located; some in `__tests__/`. Add `// @vitest-environment jsdom` when DOM is needed.
- No coverage thresholds enforced in either app.

## ANTI-PATTERNS (THIS PROJECT)

Source: `apps/backend/docs/spydefi/arch/09-anti-patterns.md` — project-level rules.

### Git Operations (CRITICAL)

- **Never execute `git reset --hard`** — This permanently destroys uncommitted changes and cannot be undone. If there are TypeScript errors during commit, fix them manually, do NOT reset.
- **Never execute `git revert --no-commit`** — Same reason as above; this attempt to "undo" changes before committing destroys work.
- **Never use destructive git commands without explicit user approval** — Commands like `reset`, `rebase`, `force-push` require explicit permission.
- **When TypeScript errors occur during commit**: Read the errors, fix them in the affected files manually, then retry the commit. Do NOT attempt to "undo" the staged changes.

### Architectural

- **No `@Entity` in domain layer.** Domain entities are plain TS; ORM entities live in `infrastructure/persistence/typeorm/entities/`.
- **Never update DB directly.** Always go through the aggregate (`save()` via repo port).
- **Never publish events before `commit()`.** Pattern: `await repo.save(agg); await eventBus.publishAll(agg.commitEvents())`.
- **Never share entities between BCs.** Use ports + DTOs.
- **Never import another BC's NestJS module.** Define own port + in-memory adapter.
- **Never use `any` crossing BC boundaries.** Strongly-typed DTOs and events only.
- **No anemic domain model.** Entities enforce invariants, not just hold data.
- **No mixing domains in a single BC.** Split when responsibilities diverge.

### Pipeline / runtime

- **Raw Telegram text must NOT cross the event bus** (fix-1, ToS compliance). `KolIngestionOrchestratorUseCase` calls `ExtractFromMessageUseCase` and `ParseFromCandidatesUseCase` directly. Event bus kicks in only at `normalization.call.normalized`.
- **Ticker must NEVER be null** in published-call flow (invariant in `vip-calls-channel`).
- **External providers are NEVER queried** in `token-approved-publish-ticker-bug-exploration.spec.ts` context.
- **`bug-exploration.spec.ts` files encode future-fix invariants** — do not "fix" them; they document expected behavior post-fix.

### Shared-kernel contracts (handle with care)

- `ChainId` VO (`shared/common/value-objects/chain-id.vo.ts`) — shared kernel contract.
- `TokenMetrics` VO (`shared/common/value-objects/token-metrics.vo.ts`) — payload breaks downstream consumers if changed.
- TypeORM `kol.entity.ts` — **NOT** the domain aggregate. Domain entity is elsewhere.

## UNIQUE STYLES

- **DDD inside NestJS.** Most NestJS projects don't have explicit `AggregateRoot`/`Entity`/`ValueObject`/`DomainEvent` base classes — this project does, in `shared/kernel/`.
- **15-provider adapter pattern** under `data-provider/` (Helius, Birdeye, GeckoTerminal, Mobula, Moralis, DexScreener, RugCheck, PumpDev, Alchemy, FluxRPC, SolanaRPC, CoinGecko, CoinMarketCap, + `core`).
- **Event-driven pipeline with named events** (`<bc>.<aggregate>.<action>`): `extraction.candidates.extracted`, `parsing.call.parsed`, `normalization.call.normalized`, `enrichment.token.enriched`, `classification.token.classified`, `scoring.token.scored`, `filters.token.approved|rejected`, `honeypot.analysis.completed`, `publishing.telegram.published`.
- **FSD on frontend, DDD on backend** — strict layer rules in both. See `apps/frontend/AGENTS.md` and `apps/backend/AGENTS.md`.

## COMMANDS

```bash
# First time
npm install                       # workspaces install (apps/*)

# Dev (both)
npm run dev                       # backend:3030 + frontend:5173, port-cleanup first

# Dev (single)
npm run dev:backend-only
npm run dev:frontend-only

# Build / Test / Lint / Format
npm run build
npm run test
npm run lint
npm run format                    # prettier --write "apps/*/src/**/*.{ts,tsx}"

# Docs staleness check (also runs in pre-commit as warning)
npm run docs:check                # node scripts/check-docs-staleness.mjs

# Bypass all git hooks (use sparingly)
git commit --no-verify -m "..."

# Backend-specific (cd apps/backend)
npm run start:dev                 # nest start --watch + db:migrate
npm run start:debug               # with --inspect-brk
npm run db:migrate                # idempotent backfill migrations
npm run db:migrate:dry-run
npm run db:backup                 # calls scripts/backup-db.sh
npm run telegram:gen-session      # generate MTProto session string

# TypeORM Migrations (cd apps/backend)
# Note: Staging/production use migrations; dev/test use synchronize:true
npm run migration:generate -- -n MigrationName  # generate new migration from entity changes
npm run migration:run             # apply pending migrations
npm run migration:revert          # rollback last migration
npm run migration:show            # list applied and pending migrations

# Docker
npm run docker:up                 # postgres only (apps/backend/docker-compose.yml)
npm run docker:down
```

## DEPLOY (GitHub Actions)

`.github/workflows/deploy.yml` — runs on push to `master` (auto) or `workflow_dispatch` (manual):

1. **test** job: `npm ci` → `npm run test:backend` → `npm run test:frontend` → `npm run lint`
2. **deploy** job (needs: test): `appleboy/ssh-action@v1` → on droplet: `git pull` → `backup-db.sh` → `docker compose build --no-cache` → `migration:run` → `up -d --force-recreate` → `curl :3030/api/health`

## PRODUCTION DROPLET

| Name       | Host          | IP              | SSH Config                  |
| ---------- | ------------- | --------------- | --------------------------- |
| Production | CryptoGanster | 144.126.203.139 | SSH alias in VS Code Remote |

### Quick Access (from local)

```bash
# SSH to droplet (via VS Code Remote or direct)
ssh CryptoGanster

# Or direct IP
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

## NOTES

> **Security:** Never commit production credentials. SSH access details, tokens, and passwords belong in `.env` files (gitignored) or password managers — not in this knowledge base.

- **`.env.dev` takes precedence** over `.env` (`ConfigModule.envFilePath: ['.env.dev', '.env']`).
- **Port cleanup before dev**: `scripts/cleanup-ports.mjs` runs as `predev` hook — kills stale 3030/5173 holders.
- **MTProto + Telegram Bot API coexist**: `telegram/vip-calls-channel` uses Bot API (publishing), `telegram/ingestion` uses MTProto (listening). Session in `apps/backend/.env`: `TELEGRAM_MTPROTO_SESSION`.
- **Frontend port 5173 is strict**: Vite exits if port is held; cleanup script handles this.
- **`@/*` alias is frontend-only.** Don't use it in backend imports.
- **No CLAUDE.md exists** — project conventions live in `apps/backend/docs/spydefi/arch/` and this file.
- **Subdirectory AGENTS.md**: see `apps/backend/AGENTS.md` and `apps/frontend/AGENTS.md` for layer-specific guidance.
