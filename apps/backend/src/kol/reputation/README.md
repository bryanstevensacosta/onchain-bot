# Reputation BC (`kol/reputation/`)

The **heart of the auto-aprendizaje loop**. Owns the per-KOL reputation
aggregate that downstream BCs (scoring, leaderboard, KOL profiles) consume.
Each KOL's reputation is derived from their real Telegram activity — the
canonical token calls they've made — so reputation varies per KOL.

## 1. What this BC does

- **Aggregates** every KOL's mention volume from `canonical_token_calls.sources[]`
  (the JSONB array of KOL mentions populated by
  `telegram/kol-calls-ingestion/`).
- **Computes** a 0..1 reputation score per KOL using a log-scaled activity curve.
- **Stores** the rich aggregate (`KolReputation` VO) in Postgres (`kol_reputations` table)
  or in-memory (dev fallback).
- **Refreshes** automatically every 15 minutes via `KolReputationScheduler`.
- **Exposes** read-only HTTP API for the frontend leaderboard + per-KOL queries.
- **Owns** the operator-curated `KNOWN_GOOD` / `KNOWN_BAD` KOL lists
  (`KnownKolPort` → `DefaultKnownKolRegistry`) consumed by `token/scoring/`
  so the scoring adapter stays free of hardcoded magic strings.

## 2. Why this design

| Decision | Why |
|---|---|
| Aggregate from `canonical_token_calls.sources` (not `call_performances`) | `call_performances` is empty until `call/lifecycle` BC ships. The `sources` JSONB on every canonical call IS the always-available data source (5+ KOLs have real mentions today). Using it makes the leaderboard real today, instead of 0.50 for everyone. |
| Log-scaled scoring (`0.5 + log10(n+1) * 0.2`) | Smooth growth: 1 mention ≈ 0.55, 5 mentions ≈ 0.65, 50 mentions ≈ 0.85. Avoids the "0 vs 1 mention" cliff that linear scoring would have. |
| Cap at 0.95 | Prevents a single mega-KOL from saturating the scale; leaves headroom for future boost signals (verified, curated, etc.). |
| Neutral default 0.5 + LOW confidence for zero data | Stops the leaderboard from looking "bad" for new KOLs. Cards show "0.50 (LOW)" so the UI is honest about the data quality. |
| Class-based services with `KolReputation` prefix | Naming aligned with BC: `KolReputationAggregator`, `KolReputationScorer`, `KolReputationCalculator`. Cohesive vocabulary. |

## 3. The pipeline (how reputation is computed)

```
canonical_token_calls.sources[] (per call, populated by telegram/kol-calls-ingestion)
        │
        │ KolReputationAggregator.aggregate(kolId, calls)
        ▼
KolReputationStats { totalMentions, distinctTokens, firstSeenAt, lastSeenAt }
        │
        │ KolReputationScorer.score(stats)
        ▼
KolReputationScore { score (0..1), confidence (LOW|MEDIUM|HIGH|VERY_HIGH) }
        │
        │ KolReputationCalculator.calculateFromCanonicalCalls(kolId, calls)
        │ (orchestrates aggregator + scorer + VO construction)
        ▼
KolReputation VO { kolId, score, totalCalls, strongCalls, ..., confidence, lastEvaluatedAt }
        │
        │ KolReputationRepository.save(rep)
        ▼
Postgres (kol_reputations table) — PK: kol_id
```

The pure-function design (`aggregate`, `score`, `calculateFromCanonicalCalls`)
keeps the math 100% testable without DB. The use case just wires the data
source + repository.

## 4. Domain (pure)

### `KolReputation` VO — `domain/value-objects/kol-reputation.vo.ts`

Rich aggregate, immutable, identity-only equality.

| Field | Type | Notes |
|---|---|---|
| `kolId` | `string` | Primary key |
| `score` | `number` (0..1) | The reputation |
| `totalCalls` | `number` | Total mentions across all canonical calls |
| `strongCalls` / `goodCalls` / `neutralCalls` / `poorCalls` / `failedCalls` | `number` | Outcome buckets (currently all goes to `neutralCalls` since we don't have outcomes yet — `call/lifecycle` will fill these) |
| `avgAthMultiple` | `number \| null` | Average peak multiple (populated when `call/lifecycle` events arrive) |
| `confidence` | `'LOW' \| 'MEDIUM' \| 'HIGH' \| 'VERY_HIGH'` | Based on `totalMentions` thresholds: <5 LOW, 5-19 MEDIUM, 20-49 HIGH, 50+ VERY_HIGH |
| `lastEvaluatedAt` | `Date` | When the score was last computed |

Helpers: `isTrusted` (score ≥ 0.7 + confidence ≠ LOW), `isSuspicious` (score ≤ 0.3 + confidence ≠ LOW), `successRate()`, `failureRate()`.

Factory: `KolReputation.fromValues({...})` — constructs the VO. `KolReputation.empty(kolId)` — neutral 0.5 LOW for new KOLs.

### `KolReputationAggregator` — `domain/services/kol-reputation-aggregator.ts`

```ts
class KolReputationAggregator {
  public static aggregate(
    kolId: string,
    calls: ReadonlyArray<{ chain; address; sources; lastSeenAt }>,
  ): KolReputationStats;  // { totalMentions, distinctTokens, firstSeenAt, lastSeenAt }
}
```

Iterates all canonical calls, parses `sources[]`, tallies mentions per KOL.
Coerces numeric `kolId` to string for comparison. Skips invalid sources.

### `KolReputationScorer` — `domain/services/kol-reputation-scorer.ts`

```ts
class KolReputationScorer {
  public static score(stats: { totalMentions: number }): {
    score: number;       // 0..1, log-scaled
    confidence: KolConfidence;
  };
}
```

Algorithm:
- 0 mentions → 0.50 LOW
- n > 0 → `Math.min(0.95, 0.5 + log10(n+1) * 0.2)` + threshold-based confidence

### `KolReputationCalculator` — `domain/services/kol-reputation-calculator.ts`

```ts
class KolReputationCalculator {
  public static calculateFromCanonicalCalls(
    kolId: string,
    calls: ReadonlyArray<KolReputationCanonicalCall>,
  ): KolReputation;  // orchestrates Aggregator + Scorer + VO
}
```

Top-level entry point. `RecomputeKolReputationUseCase` calls this with data
from `CanonicalTokenCallRepository.findRecent(5000)`.

## 5. Application (use cases)

| Use case | File | Purpose |
|---|---|---|
| `GetKolReputationUseCase` | `application/handlers/kol-stats-queries.use-case.ts` | Single KOL by id, returns KolReputation (from cache) |
| `GetTopKolsUseCase` | same | Top N KOLs sorted by score, filtered by minConfidence |
| `ListAllKolReputationsUseCase` | same | All KOLs, paginated |
| `RecomputeKolReputationUseCase` | `application/handlers/recompute-kol-reputation.use-case.ts` | **The core use case** — reads `CanonicalTokenCallRepository.findRecent(5000)`, calls `KolReputationCalculator.calculateFromCanonicalCalls`, persists via `KolReputationRepository.save` |

## 6. Application ports

| Port | File | Methods |
|---|---|---|
| `KolReputationRepository` | `application/ports/kol-reputation.repository.ts` | `save(rep)`, `findById(kolId)`, `findTop(limit, minConfidence)`, `findAll(limit, offset)`, `count()` |
| `KnownKolPort` | `application/ports/known-kol.port.ts` | `isKnownGood(kolId)`, `isKnownBad(kolId)`, `allGood()`, `allBad()` |

## 7. Infrastructure

### Persistence

| Implementation | File | Notes |
|---|---|---|
| `TypeOrmKolReputationRepository` | `infrastructure/persistence/typeorm/repositories/typeorm-kol-reputation.repository.ts` | Postgres-backed (when `DATABASE_ENABLED=true`), uses `KolReputationEntity` |
| `InMemoryKolReputationRepository` | `infrastructure/repositories/in-memory-kol-reputation.repository.ts` | FIFO-capped at 5,000 entries, dev/test fallback |

Factory in `reputation.module.ts` selects between the two based on config.

### `KolReputationEntity` (TypeORM)

`kol_reputations` table, PK `kol_id`. Columns mirror the VO 1:1 (denormalized for query speed). `last_evaluated_at` is set by the save path.

### `KolReputationScheduler` — `infrastructure/scheduling/kol-reputation.scheduler.ts`

Cron every 15 minutes (`*/15 * * * *`). Reads all KOLs from `IdentityModule.KolRepository` and triggers `RecomputeKolReputationUseCase.execute` for each. The `@Injectable` + `OnApplicationBootstrap` pattern matches `LiveMilestoneScheduler`.

### `DefaultKnownKolRegistry` — `infrastructure/known-kol/default-known-kol.registry.ts`

Static map of operator-curated `KNOWN_GOOD` / `KNOWN_BAD` KOLs. Replace with a DB-backed implementation in deployments that want operator-editable whitelists/blacklists.

## 8. API (HTTP)

| Verb | Path | Use case |
|---|---|---|
| `GET`    | `/telegram-kol/reputation/kols` | `ListAllKolReputationsUseCase` |
| `GET`    | `/telegram-kol/reputation/kols/top?limit=&minConfidence=` | `GetTopKolsUseCase` |
| `GET`    | `/telegram-kol/reputation/kols/:kolId` | `GetKolReputationUseCase` |
| `POST`   | `/telegram-kol/reputation/kols/recompute/:kolId` | `RecomputeKolReputationUseCase` (manual trigger) |

Controller: `api/http/kol-reputation.controller.ts`.

## 9. Module wiring (`reputation.module.ts`)

```ts
@Module({
  imports: [
    ConfigModule,
    SettingsModule,
    forwardRef(() => CallTrackingModule),  // legacy — kept for evaluate-call-performance
    IdentityModule,
    NormalizationModule,                    // NEW — provides CanonicalTokenCallRepository
    TypeOrmModule.forFeature([KolReputationEntity]),
  ],
  controllers: [KolReputationController],
  providers: [
    InMemoryKolReputationRepository,
    TypeOrmKolReputationRepository,
    { provide: KolReputationRepository, useFactory: ... },
    { provide: KnownKolPort, useClass: DefaultKnownKolRegistry },
    GetKolReputationUseCase,
    GetTopKolsUseCase,
    ListAllKolReputationsUseCase,
    RecomputeKolReputationUseCase,
    KolReputationScheduler,
  ],
  exports: [KolReputationRepository, KnownKolPort],
})
export class ReputationModule {}
```

`KolReputationRepository` and `KnownKolPort` are exported for downstream BCs (scoring, future leaderboard).

## 10. Consumers

- `token/scoring/` — injects `KolReputationRepository` + `KnownKolPort` via
  `DefaultKolReputationAdapter` (replaces `DefaultChannelReputationAdapter`).
  Uses the score as a multiplier in token scoring.
- Frontend `/kols` page — displays the leaderboard (top 10) + per-KOL score cards.

## 11. Future enhancements

When `call/lifecycle` BC ships (INV-18), the pipeline extends:

```
call/lifecycle emits CallMilestoneUnlockedEvent (X2, X5, X10)
        │
        │ new: KolReputationAthAggregator.aggregate(kolId, events)
        │   → KolReputationAthStats { x2Count, x5Count, x10Count, avgAth }
        │
        ▼
KolReputationCalculator.calculateFromBothSources(
  mentionStats,   // current
  athStats,       // new
)
        │
        ▼
score = blend(mentionScore, athScore) + confidence boost
```

ATH-based stats (x2Count, x5Count, etc.) + mention-based stats (totalMentions)
both feed the score, weighted by confidence.

## 12. Tests

- `domain/services/kol-reputation-calculator.spec.ts` — 11 specs covering
  `KolReputationAggregator` (5), `KolReputationScorer` (4), `KolReputationCalculator` (2).
- All pure functions, no DB needed.
- Tests: 540/540 pass in the backend suite.

## 13. Migration history

| Commit | Change |
|---|---|
| (legacy) | Original implementation reading from `CallPerformanceRepository` (always empty → uniform 0.50) |
| `4264267` | Replaced with `KolReputationAggregator` + `KolReputationScorer` + `KolReputationCalculator` classes. Reads from `CanonicalTokenCallRepository` (real data). Fixes INV-9 (leaderboard now shows real, varied scores). |