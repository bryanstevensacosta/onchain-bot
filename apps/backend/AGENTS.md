# apps/backend/ — NestJS Knowledge Base

## OVERVIEW

NestJS 11 backend with DDD/Hexagonal architecture. 19 bounded contexts wired in AppModule. Port 3030, CORS permits 5173.

## STRUCTURE

```
src/
├── main.ts                     # bootstrap() entry point
├── app.module.ts               # AppModule: wires 19 BCs + infrastructure
├── token/                      # Token pipeline: extraction → parsing → normalization → enrichment → classification → scoring → filtering → honeypot → publishing
├── kol/                        # KOL identity, reputation, source, stats
├── chain/                      # Chain detection, registry, identity
├── telegram/                   # MTProto ingestion, Bot API publishing, chain-dexter-bot
├── data-provider/              # 13 external API adapters + core port
├── shared/                     # Shared kernel + common + filters + ws + cache + identicon
├── dashboard/                  # Dashboard read models
├── settings/                  # Application settings
├── health/                    # Health checks
└── scripts/                   # Backfills, migrations, seed scripts
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| NestJS bootstrap | `src/main.ts:38` (bootstrap function) |
| Module wiring | `src/app.module.ts:36` (AppModule) |
| Env validation | `shared/common/config/app.config.ts:178` (registerAs('app', ...)) |
| Data provider base | `data-provider/core/data-provider.port.ts` (DataProviderPort abstract class) |
| Backfill scripts | `scripts/backfills/` (date-prefixed, idempotent) |
| Migrations | `scripts/migrate.{js,ts}` |
| Unit tests | Co-located `*.spec.ts` in each BC |
| E2E tests | `test/*.e2e-spec.ts` + `jest-e2e.json` |
| Architecture docs | `docs/spydefi/arch/` (DDD, anti-patterns, ADRs) |

## CODE MAP

| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `bootstrap()` | function | `src/main.ts:38` | NestJS entry; CORS, ValidationPipe, DomainErrorFilter, IoAdapter |
| `AppModule` | class | `src/app.module.ts:36` | Wires 19 BCs + Config/EventEmitter/Schedule/Database/Redis |
| `appConfig` | const | `shared/common/config/app.config.ts:178` | All env var validation via registerAs |
| `DataProviderPort` | abstract class | `data-provider/core/data-provider.port.ts` | Base for 13 external API adapters |
| `AggregateRoot<TId>` | class | `shared/kernel/aggregate-root.ts:17` | DDD aggregate: extends Entity + DomainEvent collection |
| `DomainErrorFilter` | class | `shared/filters/domain-error.filter.ts:12` | Global exception filter: DomainError → HTTP status |
| `WsGateway` | class | `shared/ws/gateway/ws.gateway.ts:32` | Socket.IO: broadcasts pipeline events |
| `KolIngestionOrchestratorUseCase` | class | `kol/ingestion/application/` | Direct calls to extraction/parsing (fix-1 ToS compliance) |

## CONVENTIONS (DEVIATIONS FROM ROOT)

Per-BC directory layout (mandatory in every bounded context):
```
bc-name/
├── api/                        # Controllers, DTOs
├── application/
│   ├── handlers/              # Use cases (verb+entity pattern)
│   ├── ports/                 # Interface definitions
│   └── mappers/               # DTO ↔ domain mappers
├── domain/
│   ├── entities/              # Plain TS entities (NO @Entity)
│   ├── value-objects/
│   └── events/                # Domain events
├── infrastructure/
│   ├── persistence/typeorm/   # @Entity classes, mappers, repositories
│   ├── messaging/             # In-process event publishers
│   └── event-bus/             # Event handlers
└── *.spec.ts                  # Co-located tests
```

Use case naming: `<Action><Entity>UseCase` or `<Entity><Action>UseCase` (e.g., `ExtractCandidatesUseCase`, `ParseCallUseCase`).

Port/adapter pattern: Define port interface in `application/ports/`, implement in `infrastructure/`. No direct BC-to-BC module imports.

Path aliases: Use tsconfig.json aliases (e.g., `shared/*`, `token/*`). Do NOT use `@/*` in backend.

## ANTI-PATTERNS (DEVIATIONS FROM ROOT)

**Architectural**
- `@Entity` in domain layer: FORBIDDEN. ORM entities live in `infrastructure/persistence/typeorm/`.
- Direct DB updates: NEVER. Always go through aggregate `save()` via repo port.
- Event before commit: NEVER. Pattern: `await repo.save(agg); await eventBus.publishAll(agg.commitEvents())`.
- Entity sharing between BCs: FORBIDDEN. Use ports + DTOs.
- Module import across BCs: FORBIDDEN. Define own port + in-memory adapter.

**Pipeline runtime**
- Raw Telegram text crossing event bus: FORBIDDEN (`fix-1`). `KolIngestionOrchestratorUseCase` calls extraction/parsing directly. Event bus starts at `normalization.call.normalized`.
- Null ticker in publish flow: FORBIDDEN (invariant in `vip-calls-channel`).
- External providers in `token-approved-publish-ticker-bug-exploration.spec.ts`: NEVER.
- `bug-exploration.spec.ts` files: encode future-fix invariants. Do NOT fix.

## UNIQUE STYLES (BACKEND ONLY)

- **DDD inside NestJS**: Explicit `AggregateRoot`, `Entity`, `ValueObject`, `DomainEvent` base classes in `shared/kernel/`.
- **Event-driven pipeline**: Named events follow `<bc>.<aggregate>.<action>` pattern:
  - `extraction.candidates.extracted`
  - `parsing.call.parsed`
  - `normalization.call.normalized`
  - `enrichment.token.enriched`
  - `classification.token.classified`
  - `scoring.token.scored`
  - `filters.token.approved|rejected`
  - `honeypot.analysis.completed`
  - `publishing.telegram.published`
- **Shared kernel contracts**: `ChainId` VO and `TokenMetrics` VO are shared across BCs. Changes break consumers.
- **Per-BC schema strategy**: v2 uses schema-per-context. v1 uses in-memory repos.

## COMMANDS

```bash
# In apps/backend/
npm run start:dev          # nest start --watch + db:migrate
npm run start:debug       # nest start --watch --inspect-brk
npm run db:migrate        # Run backfill migrations
npm run db:migrate:dry-run
npm run db:backup         # Backup postgres
npm run migration:run     # typeorm migration:run
npm run telegram:gen-session  # Generate MTProto session string
npm run test              # Jest (co-located *.spec.ts)
npm run test:e2e         # E2E (separate jest-e2e.json)
```

See root AGENTS.md for lint, format, build commands.

## NOTES

- `process.noDeprecation = true` in main.ts silences pg@8 "client.query() while already executing" (TypeORM `synchronize: true` triggers it).
- MTProto + Telegram Bot API coexist: `telegram/ingestion` uses MTProto, `telegram/vip-calls-channel` uses Bot API. Session stored in `TELEGRAM_MTPROTO_SESSION` env.
- DATABASE_ENABLED toggle: Set `DATABASE_ENABLED=true` in .env to enable TypeORM. Tests force it on in jest.setup.ts.
- 13 data providers: All extend `DataProviderPort`. No centralized rate-limiting or caching at provider layer (consumer-side handles it).
- Root AGENTS.md covers: TypeScript strict flags, ESLint rules, Prettier config, global filters, WebSocket setup, database configuration.