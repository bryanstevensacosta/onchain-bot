# kol/ — KOL Domain (4 Bounded Contexts)

## OVERVIEW

KOL (Key Opinion Leader) bounded context. Four sub-contexts: identity (KOL entity + pipeline entry), reputation (aggregation + scoring), source (channel attribution), stats (Fase 5 stub). Drives the alpha-call pipeline via `KolIngestionOrchestratorUseCase` and aggregates reputation per `KolReputationScheduler` cron.

## STRUCTURE

| Sub-context | Role |
|-------------|------|
| `identity/` | KOL entity CRUD, lifecycle management, pipeline entry (KolIngestionOrchestratorUseCase) |
| `reputation/` | Kol reputation aggregation, scoring, cron-driven recomputation |
| `source/` | Value objects for KOL source attribution (seed, manual, discovery) |
| `stats/` | Stub for Fase 5 (leaderboard, ROI trends, alpha-callers endpoints) |

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Pipeline entry point (MTProto -> extraction+parsing) | `kol/identity/application/handlers/kol-ingestion-orchestrator.use-case.ts` |
| Reputation aggregator (cron) | `kol/reputation/infrastructure/scheduling/kol-reputation.scheduler.ts` |
| Seed KOLs on bootstrap | `kol/identity/infrastructure/seeders/kol.seeder.ts` |
| Add new reputation metric | `kol/reputation/domain/services/kol-reputation-calculator.ts` |
| Find kol-leaderboard endpoint | Use `/kol/reputation/kols/top` (stats stub returns `{note: 'Stub'}`) |
| Resolve missing handle | `kol/identity/infrastructure/persistence/json-resolved-kol-metadata.repository.ts` |

## CODE MAP

| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `KolIngestionOrchestratorUseCase` | class | `kol/identity/application/handlers/` | Pipeline entry: direct calls to extraction/parsing (fix-1 compliance) |
| `KolSeeder` | class | `kol/identity/infrastructure/seeders/kol.seeder.ts` | Idempotent seed on app bootstrap |
| `KolReputationScheduler` | class | `kol/reputation/infrastructure/scheduling/` | Cron-driven reputation recomputation |
| `KolStatsController` | class | `kol/stats/api/http/` | Stub controller ( Fase 5) |
| `KolEntity` | class | `kol/identity/domain/entities/kol.entity.ts` | Domain aggregate (NOT the TypeORM entity) |

## CONVENTIONS

- **KOL ID**: Numeric Telegram user/channel ID as string (e.g., `"123456789"`).
- **Seed env format**: `INGESTION_TELEGRAM_SEED_CHANNELS=kolId|handle|title, kolId|handle|title` (comma-separated).
- **Handle resolution priority**: Seed override > MTProto resolution > null (handle may be null for channel IDs).

## ANTI-PATTERNS

- **fix-1 compliance**: `KolIngestionOrchestratorUseCase` calls `ExtractFromMessageUseCase` and `ParseFromCandidatesUseCase` directly. Raw text never crosses the event bus.
- **Domain vs ORM**: `kol/identity/domain/entities/kol.entity.ts` is the domain aggregate. `kol/identity/infrastructure/persistence/typeorm/entities/kol.entity.ts` is the TypeORM entity. Never confuse them. Domain layer stays plain TS.

## UNIQUE STYLES

- **Only orchestrator bypassing event bus**: KOL entry is the sole use case that skips the event bus for extraction/parsing (compliance-driven, not a pattern to replicate).
- **Stats is documentation-only**: `kol/stats` controller exists to document planned endpoints. It returns stubs. Frontend uses `kol/reputation` endpoints directly.

## COMMANDS

```bash
# Generate MTProto session for ingestion
cd apps/backend && npm run telegram:gen-session

# Seed KOLs (via .env)
# INGESTION_TELEGRAM_SEED_CHANNELS=...

# Run backfill for KOL data
cd apps/backend && npm run db:migrate
# or specific: apps/backend/scripts/backfills/2026-06-26-kol-*.{sql,ts}
```

## NOTES

- Handle resolution: Seed env provides explicit handle/title, otherwise MTProto resolves on first message. Null handle is valid for channel-sourced KOLs.
- Stats stub status: `KolStatsController` documents planned endpoints (`/kol-leaderboard`, `/top-calls`, `/roi-trends`, `/alpha-calls`). All return `{note: 'Stub — Fase 5 pendiente'}`.
- Leaderboard location: Current frontend reads from `/kol/reputation/kols/top`. Stats endpoints will proxy this once Fase 5 is implemented.
- Lifecycle states: `ACTIVE` (ingestion enabled), `DORMANT` (paused), `BLACKLISTED` (hard-skipped).