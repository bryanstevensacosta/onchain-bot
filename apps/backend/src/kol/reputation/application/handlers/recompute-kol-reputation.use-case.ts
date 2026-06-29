import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { KolReputationRepository } from 'kol/reputation/application/ports/kol-reputation.repository';
import { KolReputation } from 'kol/reputation/domain/value-objects/kol-reputation.vo';
import { KolReputationCalculator } from 'kol/reputation/domain/services/kol-reputation-calculator';
import { CanonicalTokenCallRepository } from 'token/normalization/application/ports/canonical-token-call.repository';
import { DEFAULT_KOL_SCORE_FORMULA_ID } from 'kol/reputation/domain/value-objects/kol-score-formula.vo';

export interface RecomputeKolReputationInput {
  readonly kolId: string;
  readonly formulaId?: string;
}

const RECENT_CALLS_LOOKBACK = 5000;

/**
 * Use case: recompute reputation stats for a KOL from canonical calls.
 *
 * Data source: `canonical_token_calls.sources[]` (the JSONB array of KOL
 * mentions populated by `telegram/kol-calls-ingestion`). This is the
 * always-available fallback — `CallPerformance` (which requires
 * `call/lifecycle` to run) is empty for now, so the old algorithm
 * always produced 0.50 for every KOL.
 *
 * Once `call/lifecycle` produces `CallMilestoneUnlockedEvent`s, the
 * calculator can be extended to incorporate ATH-based stats alongside
 * the mention-based stats.
 *
 * The `formulaId` is optional — defaults to `default`. Picks which
 * blend weights (mention / quality / drawdown) to apply.
 */
@Injectable()
export class RecomputeKolReputationUseCase {
  public constructor(
    @Inject(forwardRef(() => CanonicalTokenCallRepository))
    private readonly canonicalRepo: CanonicalTokenCallRepository,
    private readonly statsRepo: KolReputationRepository,
  ) {}

  public async execute(
    input: RecomputeKolReputationInput,
  ): Promise<KolReputation> {
    const calls = await this.canonicalRepo.findRecent(RECENT_CALLS_LOOKBACK);
    const stats = KolReputationCalculator.calculateFromCanonicalCalls(
      input.kolId,
      calls.map((c) => ({
        chain: c.identity.chain.value,
        address: c.identity.address.value,
        sources: c.sources.map((s) => ({
          kolId: s.kolId,
          mentionCount: s.messageIds.length,
        })),
        lastSeenAt: c.lastSeenAt,
      })),
      input.formulaId ?? DEFAULT_KOL_SCORE_FORMULA_ID,
    );
    await this.statsRepo.save(stats);
    return stats;
  }
}
