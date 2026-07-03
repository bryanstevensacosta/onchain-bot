# shared/ — Cross-Cutting Kernel & Infrastructure

## OVERVIEW

Shared utilities consumed by all 19 Bounded Contexts. DDD primitives + cross-cutting infrastructure in 7 subdirs. Recent additions include: `uploadsRoot` (env `UPLOADS_ROOT`, default `./uploads`) for the crypto-news media downloader — points to the directory where Telegram photo attachments are persisted.

## STRUCTURE

| Subdir                  | Purpose                                                                         | Representative Symbol                                    |
| ----------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `kernel/`               | DDD base classes (AggregateRoot, Entity, ValueObject, DomainEvent, DomainError) | `AggregateRoot<TId>` at aggregate-root.ts:17             |
| `common/`               | Config, persistence, cache, utils, value-objects                                | `AppConfig` at config/app.config.ts:178                  |
| `filters/`              | Global NestJS exception filter                                                  | `DomainErrorFilter` at filters/domain-error.filter.ts:12 |
| `identicon/`            | SVG token identicon generator                                                   | generates from chain+address hash                        |
| `cache/`                | Token image caching (LRU/Redis)                                                 | `TokenImageCache` interface + adapters                   |
| `ws/`                   | WebSocket gateway + Socket.IO broadcaster                                       | `WsGateway` at gateway/ws.gateway.ts:32                  |
| `common/value-objects/` | Shared kernel contracts                                                         | `ChainId`, `TokenMetrics`                                |

## WHERE TO LOOK

| Question                             | Location                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------- |
| Add a new DDD base class             | `shared/kernel/` — extend `AggregateRoot<TId>`, `Entity`, or `ValueObject`  |
| Add a cross-BC value-object          | `shared/common/value-objects/` — factory method pattern, no mutations       |
| Add a new env var config             | `shared/common/config/app.config.ts` — register in `registerAs('app', ...)` |
| Add a global exception filter        | `shared/filters/` — implement `ExceptionFilter`, wire in `main.ts`          |
| Add caching strategy                 | `shared/cache/` — implement `TokenImageCache` port, swap LRU/Redis adapter  |
| Broadcast pipeline event to frontend | `shared/ws/` — inject `WsGateway`, call `broadcast(event, payload)`         |

## CODE MAP

| Symbol               | Type   | Location                                   | Role                                                                                                  |
| -------------------- | ------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `AggregateRoot<TId>` | class  | `kernel/aggregate-root.ts:17`              | DDD aggregate base — extends Entity, manages DomainEvent collection                                   |
| `AppConfig`          | const  | `common/config/app.config.ts:178`          | All env var validation via `registerAs('app', ...)`                                                   |
| `DomainErrorFilter`  | class  | `filters/domain-error.filter.ts:12`        | Maps DomainError → HTTP status, wired globally in main.ts                                             |
| `WsGateway`          | class  | `ws/gateway/ws.gateway.ts:32`              | Socket.IO gateway — broadcasts pipeline events                                                        |
| `ChainId`            | VO     | `common/value-objects/chain-id.vo.ts`      | SHARED KERNEL CONTRACT — breaking changes ripple                                                      |
| `TokenMetrics`       | VO     | `common/value-objects/token-metrics.vo.ts` | SHARED KERNEL CONTRACT — payload breaks downstream                                                    |
| `DatabaseModule`     | module | `common/persistence/database.module.ts`    | TypeORM conditionally enabled via `DATABASE_ENABLED`                                                  |
| `uploadsRoot`        | field  | `common/config/app.config.ts`              | Directory where crypto-news photo attachments are persisted (env `UPLOADS_ROOT`, default `./uploads`) |

## CONVENTIONS

- **Kernel class naming**: PascalCase, no prefix (e.g., `AggregateRoot`, not `BaseAggregate`)
- **Promote VO to shared**: Only when 3+ BCs depend on it; audit before changing payload
- **Extend `AggregateRoot` vs `Entity`**: Use `AggregateRoot` when aggregate manages invariants + publishes events; use `Entity` for passive domain objects
- **Config isolation**: All env validation lives in `AppConfig` — never scatter `process.env` reads across BCs

## ANTI-PATTERNS

- **Never modify shared kernel contracts** (`ChainId`, `TokenMetrics`) without cross-BC audit — breaking changes cascade silently
- **Never put BC-specific code in shared/**: Ports, use cases, domain logic belong in their BCs
- **Never define a port in shared**: Ports are BC-owned; shared only provides infrastructure adapters
- **Never publish events before `commit()`**: In aggregate, always `await repo.save(agg); await eventBus.publishAll(agg.commitEvents())`

## UNIQUE STYLES

- **DDD kernel as TS base classes**: Not decorators, just extendable classes in `kernel/`
- **Shared VOs as readonly interfaces**: Immutable, factory method construction, no setters
- **Global filter ordering**: `DomainErrorFilter` catches `DomainError`; other filters handle rest

## NOTES

- `process.noDeprecation = true` in `main.ts` silences pg@8 "client.query() while already executing" (TypeORM `synchronize: true` triggers it)
- `DomainErrorFilter` is global; order matters — wire after CORS/ValidationPipe in `main.ts`
- `DATABASE_ENABLED=true` enables TypeORM; tests force it on in `jest.setup.ts` regardless of env
- Redis module wraps `ioredis`; conditionally enabled when `REDIS_ENABLED` env var is set
- WebSocket broadcasts use event namespaced by BC: `<bc>.<aggregate>.<action>` (e.g., `normalization.call.normalized`)
- `UPLOADS_ROOT` env var (default `./uploads`): destination directory for crypto-news media downloads. In production Docker, this MUST be a mounted volume (see `apps/backend/docker-compose.prod.yml`) — otherwise files are wiped on every `build --no-cache`.
