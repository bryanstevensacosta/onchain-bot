import { Module } from '@nestjs/common';
import { ScoredCallRepository } from './application/ports/scored-call.repository';
import { InMemoryScoredCallRepository } from './infrastructure/repositories/in-memory-scored-call.repository';
import { ScoreTokenUseCase } from './application/handlers/score-token.use-case';
import { ScoringHealthIndicator } from './health/scoring-health.indicator';

/**
 * ScoringModule — score + gates per mention, classification as
 * per-template config (Tramo 1, todo 9, P6 + G-08 + Ph8).
 *
 * `ScoreTokenUseCase` runs as a DIRECT call (fix-1, no event bus):
 * base 50 + market/buzz bonuses − signal penalties × reputation
 * multiplier, security-flag cap, clamp 0-100 with per-factor `breakdown`,
 * then the 8 fail-fast gates (`score-gates.ts`, backend
 * `ApplyVipCallApprovalUseCase` mirror). Below-cut mentions are
 * discarded pre-publisher (not persisted, no event); passing mentions
 * persist via `ScoredCallRepository` (upsert by mentionId = P1
 * double-delivery guard) and return one `scoring.token.scored` event
 * each via direct return.
 *
 * Classification is NOT a table and NOT a BC: `TemplateClassificationConfig`
 * (visible channels + score display + gem filters) is pure config owned by
 * the template (full module lands in todo 10 — the VO moves there unchanged).
 */
@Module({
  providers: [
    ScoreTokenUseCase,
    ScoringHealthIndicator,
    {
      provide: ScoredCallRepository,
      useClass: InMemoryScoredCallRepository,
    },
  ],
  exports: [ScoreTokenUseCase, ScoredCallRepository, ScoringHealthIndicator],
})
export class ScoringModule {}
