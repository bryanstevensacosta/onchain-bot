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

| Method            | Effect                                                             |
| ----------------- | ------------------------------------------------------------------ |
| `kol.activate()`  | `lifecycleStatus = ACTIVE` (ingestion allowed)                     |
| `kol.dormant()`   | `lifecycleStatus = DORMANT`, `isActive = false` (paused)           |
| `kol.blacklist()` | `lifecycleStatus = BLACKLISTED`, `isActive = false` (hard-skipped) |

Use `SetKolLifecycleUseCase` from the API; never mutate the aggregate
directly from callers.

## Use cases

- `RegisterKolUseCase` — register a new KOL for ingestion
- `GetKolUseCase` — fetch one KOL by id
- `ListKolsUseCase` — list all KOLs
- `SetKolLifecycleUseCase` — change lifecycle status

## Persistence (item 8, telegram-feed-unification)

- Identity lives in ingestion-telegram (`telegram_feed_sources`, `type='kol'`).
- Backend keeps NO `kols` table (dropped by migration `1877000000000-DropKolsTable`).
- `KolRepository` port reads via `FeedIdentityHttpClient`
  (`GET {INGESTION_TELEGRAM_URL}/api/feed/sources?type=kol`, fail-open;
  writes throw 501). Domain aggregate + VOs + mapper views stay.
- CRUD/lifecycle use cases are 501 shims; `KolController` answers 501 on all routes.

## Routes (HTTP) — all 501 deprecated, use the feed API

| Verb     | Path                                           | Replacement                                      |
| -------- | ---------------------------------------------- | ------------------------------------------------ |
| GET/POST | `/telegram-kol/identity/kols`                  | `GET/POST {INGESTION}/api/feed/sources?type=kol` |
| GET      | `/telegram-kol/identity/kols/:kolId`           | feed list + find                                 |
| POST     | `/telegram-kol/identity/kols/:kolId/lifecycle` | `PATCH {INGESTION}/api/feed/sources/:id/toggle`  |
| POST     | `/telegram-kol/identity/kols/:kolId/backfill`  | none (501 with hint)                             |

## See also

- `kol-refactor.md` at the repo root — the plan that moved this BC out of `telegram/channels/`.
- `telegram/ingestion/` — the BC that subscribes to channels and produces raw messages.
- `kol/reputation/` — the BC that consumes call outcomes and updates per-KOL reputation.
