# token/ — Alpha-Call Pipeline (10 Bounded Contexts)

## OVERVIEW

Largest bounded context: 10 sub-contexts forming an event-driven pipeline from raw Telegram message to published VIP call. Every stage stores entities with natural key `${chain}:${address}`.

## STRUCTURE

| # | Sub-context | Listens To | Emits | Primary Use Case |
|---|-------------|------------|-------|------------------|
| 1 | `intake/extraction` | `telegram.message.ingested` | `extraction.candidates.extracted` | `ExtractFromMessageUseCase` |
| 2 | `intake/parsing` | (direct call from orchestrator) | `parsing.call.parsed` | `ParseFromCandidatesUseCase` |
| 3 | `normalization` | `parsing.call.parsed` | `normalization.call.normalized` | `NormalizeCallUseCase` |
| 4 | `enrichment` | `normalization.call.normalized` | `enrichment.token.enriched` / `.failed` | `EnrichTokenUseCase` |
| 5 | `classification` | `enrichment.token.enriched` | `classification.token.classified` | `ClassifyTokenUseCase` |
| 6 | `scoring` | `classification.token.classified` | `scoring.token.scored` | `ScoreTokenUseCase` |
| 7 | `token-gating` (filters) | `scoring.token.scored` | `filters.token.approved` / `.rejected` | `ApplyFiltersUseCase` (7 gates) |
| 8 | `honeypot` | `scoring.token.scored` | `honeypot.analysis.completed` | `AnalyzeTokenHoneypotUseCase` |
| 9 | `call-tracking` | `scoring.token.scored` + `publishing.telegram.published` | (stores `CallEvaluationJob`, `TrackedPublishedCall`) | `TrackPublishedCallUseCase`, `ProcessDueEvaluationJobsUseCase` |
| 10 | `milestone` | (cron-scheduled) | (stores `MonitoredCall`, `NotifiedMilestone`) | `EvaluateActiveCallsUseCase` |

Note: Stages 1-2 bypass the event bus (fix-1 compliance). `KolIngestionOrchestratorUseCase` in `kol/identity` calls extraction + parsing directly. Event bus starts at normalization.

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Add a new pipeline stage | Create new sub-context under `token/` with hexagonal structure |
| Find a use case | `token/<stage>/application/handlers/*.use-case.ts` |
| Debug a stage that didn't fire | Check event name mapping in `WsGateway.EVENT_MAP`; verify listener registered in module |
| Add a new gate to filters | `token/token-gating/domain/value-objects/filter-reason.vo.ts` — add `FilterReasonCode` entry; update `ApplyFiltersUseCase` |
| Find the scoring formula | `token/scoring/application/handlers/score-token.use-case.ts` (501 lines) |
| Trace a published call | `token/call-tracking/` — entities: `CallEvaluationJob`, `TrackedPublishedCall` |
| Run pipeline manually | `POST /dev/seed` in `AppController` triggers `seedPipelineEvents` |

## CODE MAP

| Symbol | Location | Role |
|--------|----------|------|
| `ExtractFromMessageUseCase` | `token/intake/extraction/application/handlers/extract-from-message.use-case.ts` | Regex extracts CAs, tickers, URLs from raw text |
| `ParseFromCandidatesUseCase` | `token/intake/parsing/application/handlers/parse-from-candidates.use-case.ts` | Stores `TokenCall` entity |
| `EnrichTokenUseCase` | `token/enrichment/application/handlers/enrich-token.use-case.ts` | Fetches data from 13 providers, stores `TokenSnapshot` |
| `ScoreTokenUseCase` | `token/scoring/application/handlers/score-token.use-case.ts` | Main scoring formula (0-100) |
| `ApplyFiltersUseCase` | `token/token-gating/application/handlers/apply-filters.use-case.ts` | 7-gate filter decision (164 lines) |
| `FilterDecision` | `token/token-gating/domain/entities/filter-decision.entity.ts` | Aggregate with `${chain}:${address}` key |
| `TokenScore` | `token/scoring/domain/entities/token-score.entity.ts` | Aggregate with `${chain}:${address}` key |
| `TokenSnapshot` | `token/enrichment/domain/entities/token-snapshot.entity.ts` | Aggregate with `${chain}:${address}` key |

## CONVENTIONS

- **Natural key pattern**: Every BC entity uses `${chain}:${address}` as the storage key (e.g., `solana:EPjFWdd5AufqSSqeM6N9U1gD8U6T9p3v2U5M7Q2M2w3`).
- **Event naming**: `<bc>.<aggregate>.<action>` (e.g., `filters.token.approved`, `scoring.token.scored`).
- **BC isolation**: Each BC defines its own port interfaces (`FilterDecisionRepoPort`, `TokenScoreRepoPort`, etc.). No shared entities between BCs.

## ANTI-PATTERNS

- **Raw Telegram text must NOT cross event bus**: `KolIngestionOrchestratorUseCase` calls extraction + parsing directly (fix-1, ToS compliance). Event bus kicks in only at `normalization.call.normalized`.
- **Ticker must NEVER be null in published-call flow**: Invariant enforced in `telegram/vip-calls-channel`.
- **External providers are NEVER queried in bug-exploration.spec.ts context**: Tests mock all external calls; see `token-approved-publish-ticker-bug-exploration.spec.ts`.
- **DO NOT fix bug-exploration.spec.ts files**: These encode future-fix invariants. They document expected behavior post-fix.

## UNIQUE STYLES

- 10-stage pipeline with 7-gate filter (SCORE_TOO_LOW, CLASSIFICATION_BLOCKED, BLACKLISTED, HONEYPOT_SUSPECTED, RISK_WEIGHT_EXCEEDED, INSUFFICIENT_DATA, CHAIN_UNSUPPORTED).
- Multi-horizon evaluation (24H, 7D, 30D by default — configurable via `AppConfig.analytics.evaluationHorizonsHours`).
- Per-stage TypeORM entity with `${chain}:${address}` natural key.
- `bug-exploration.spec.ts` files exist in `call-tracking/` and `telegram/vip-calls-channel/` — do not modify.

## NOTES

- **fix-1 compliance location**: Raw Telegram text handling lives in `kol/identity/application/handlers/kol-ingestion-orchestrator.use-case.ts`. It calls `ExtractFromMessageUseCase` and `ParseFromCandidatesUseCase` directly, bypassing the event bus.
- **Where bug-exploration.spec.ts files live**: `apps/backend/src/token/call-tracking/application/handlers/track-published-call-bug-exploration.spec.ts`, `apps/backend/src/telegram/vip-calls-channel/infrastructure/event-bus/token-approved-publish-ticker-bug-exploration.spec.ts`. These are invariants, not bugs to fix.
- **How to trigger a pipeline stage manually**: `POST /dev/seed` endpoint in `AppController` runs `seedPipelineEvents`. Use for manual testing.
- **Cron-scheduled milestone evaluation**: `AppConfig.milestone.schedulerCron` controls the cron expression for `milestone/` evaluation.
- **Call-tracking dual subscription**: Listens to both `scoring.token.scored` (to enqueue evaluation jobs) and `publishing.telegram.published` (to track published calls for multi-horizon evaluation).