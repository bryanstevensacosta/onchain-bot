import { KolReputation } from 'kol/reputation/domain/value-objects/kol-reputation.vo';
import { recomputeKolReputation } from 'kol/reputation/domain/services/recompute-kol-reputation.service';
import { CallPerformance } from 'token/call-tracking/domain/value-objects/call-performance.vo';
import { Outcome } from 'token/call-tracking/domain/value-objects/outcome.vo';
import { CallPerformanceRepository } from 'token/call-tracking/application/ports/call-performance.repository';
import { KolReputationRepository } from 'kol/reputation/application/ports/kol-reputation.repository';
import { CallOutcomeEvaluatorPort } from 'token/call-tracking/domain/ports/call-outcome-evaluator.port';

export interface EvaluateAndRecordInput {
  readonly kolId: string;
  readonly chain: string;
  readonly address: string;
  readonly mcAtCall: number | null;
  readonly callTimestamp: Date;
}

/**
 * Use case: evaluate how a token call turned out and record the result.
 *
 * 1. Ask CallOutcomeEvaluatorPort for the outcome (ATH multiple, etc.)
 * 2. Persist CallPerformance
 * 3. Recompute KolReputation for the KOL via `telegram-kol/reputation/`
 * 4. Persist updated reputation
 *
 * Idempotent: re-evaluating the same `(kolId, tokenId)` overwrites.
 *
 * Fase 2 of the kol-refactor plan: this use case now writes to the new
 * `KolReputation` aggregate (in `telegram-kol/reputation/`) instead of
 * the old `ChannelReputationStats`. The `kolId` field on
 * `CallPerformance` stays as-is — it is the call-tracking BC's natural
 * identifier for the source of a call.
 */
export class EvaluateCallPerformanceUseCase {
  public constructor(
    private readonly performanceRepo: CallPerformanceRepository,
    private readonly statsRepo: KolReputationRepository,
    private readonly evaluator: CallOutcomeEvaluatorPort,
  ) {}

  public async execute(input: EvaluateAndRecordInput): Promise<KolReputation> {
    const tokenId = `${input.chain}:${input.address.toLowerCase()}`;
    const evaluation = await this.evaluator.evaluateCall({
      chain: input.chain,
      address: input.address,
      kolId: input.kolId,
      mcAtCall: input.mcAtCall,
      callTimestamp: input.callTimestamp,
    });

    const perf = CallPerformance.create({
      kolId: input.kolId,
      tokenId,
      outcome: Outcome.fromString(evaluation.outcome),
      mcAtCall: evaluation.mcAtCall,
      athMultiple: evaluation.athMultiple,
      callTimestamp: input.callTimestamp,
    });

    await this.performanceRepo.save(perf);

    const allPerfs = await this.performanceRepo.findByChannel(input.kolId);
    const stats = recomputeKolReputation(input.kolId, allPerfs);
    await this.statsRepo.save(stats);

    return stats;
  }
}
