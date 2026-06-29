# Identity BC (`kol/identity/`)

Owns the **KOL** aggregate — the canonical representation of a Telegram
Key Opinion Leader that the bot monitors for alpha signals.

## Aggregate

- `Kol` (root, in `domain/entities/kol.entity.ts`)
  - id: `KolId` (Telegram peer id as string)
  - handle: `KolHandle | null` (e.g. `SpyDefi`)
  - title: string
  - isActive: boolean (raw listener state, driven by `StartListeningUseCase`)
  - **lifecycleStatus**: `ACTIVE` | `DORMANT` | `BLACKLISTED` (new in kol-refactor Fase 1)
  - lastIngestedAt: Date | null

## Lifecycle transitions

The `Kol` aggregate owns three transitions:

| Method | Effect |
|---|---|
| `kol.activate()` | `lifecycleStatus = ACTIVE` (ingestion allowed) |
| `kol.dormant()` | `lifecycleStatus = DORMANT`, `isActive = false` (paused) |
| `kol.blacklist()` | `lifecycleStatus = BLACKLISTED`, `isActive = false` (hard-skipped) |

Use `SetKolLifecycleUseCase` from the API; never mutate the aggregate
directly from callers.

## Use cases

- `RegisterKolUseCase` — register a new KOL for ingestion
- `GetKolUseCase` — fetch one KOL by id
- `ListKolsUseCase` — list all KOLs
- `SetKolLifecycleUseCase` — change lifecycle status

## Persistence

- `KolEntity` (TypeORM, table `kols`, PK `kol_id`)
- `TypeOrmKolRepository` (Postgres)
- `InMemoryKolRepository` (FIFO-less, dev only)
- `JsonResolvedKolMetadataRepository` (file cache of resolved titles)

## Routes (HTTP)

| Verb | Path |
|---|---|
| GET    | `/telegram-kol/identity/kols` |
| POST   | `/telegram-kol/identity/kols` |
| GET    | `/telegram-kol/identity/kols/:kolId` |
| POST   | `/telegram-kol/identity/kols/:kolId/lifecycle` |
| POST   | `/telegram-kol/identity/kols/:kolId/backfill` |

## See also

- `kol-refactor.md` at the repo root — the plan that moved this BC out of `telegram/channels/`.
- `telegram/ingestion/` — the BC that subscribes to channels and produces raw messages.
- `kol/reputation/` — the BC that consumes call outcomes and updates per-KOL reputation.
