# Reputation BC (`kol/reputation/`)

The **heart of the autoaprendizaje** loop. Owns the per-KOL reputation
aggregate that the scoring BC consumes as a multiplier.

## Aggregate

`KolReputation` (in `domain/value-objects/kol-reputation.vo.ts`):

- `kolId`: string
- `score`: 0..1
- `totalCalls`, `strongCalls`, `goodCalls`, `neutralCalls`, `poorCalls`, `failedCalls`
- `avgAthMultiple`: number | null
- `confidence`: `LOW` | `MEDIUM` | `HIGH` | `VERY_HIGH` (based on total call count)
- `lastEvaluatedAt`: Date

The aggregate is recomputed by `recomputeKolReputation(kolId, perfs)`
— a pure function in `domain/services/`.

## Use cases

- `GetKolReputationUseCase`
- `GetTopKolsUseCase`
- `ListAllKolReputationsUseCase`
- `RecomputeKolReputationUseCase` (reads from `token/call-tracking`'s `CallPerformanceRepository`)

## Ports

- `KolReputationRepository` — persistence
- `KnownKolPort` — operator-curated KNOWN_GOOD / KNOWN_BAD lists. The
  concrete `DefaultKnownKolRegistry` (in `infrastructure/known-kol/`)
  holds the static map. Replace with a DB-backed implementation in
  deployments that want operator-editable whitelists/blacklists.

## Persistence

- `KolReputationEntity` (TypeORM, table `kol_reputations`, PK `kol_id`)
- `TypeOrmKolReputationRepository` (Postgres)
- `InMemoryKolReputationRepository` (FIFO-capped at 5,000 entries, dev only)

## Routes (HTTP)

| Verb | Path |
|---|---|
| GET    | `/telegram-kol/reputation/kols` |
| GET    | `/telegram-kol/reputation/kols/top?limit=&minConfidence=` |
| GET    | `/telegram-kol/reputation/kols/:kolId` |
| POST   | `/telegram-kol/reputation/kols/recompute/:kolId` |

## Consumers

- `token/scoring/` — injects `KolReputationRepository` + `KnownKolPort`
  via `DefaultKolReputationAdapter` (replaces `DefaultChannelReputationAdapter`).
- `kol/stats/` (Fase 5) — read-only leaderboards.

## See also

- `kol-refactor.md` at the repo root — the plan that moved this BC out of `token/channel-reputation/`.
- `kol/identity/` — owns the `Kol` aggregate that this BC scores.
- `token/call-tracking/` — produces the `CallPerformance` stream that drives recompute.
