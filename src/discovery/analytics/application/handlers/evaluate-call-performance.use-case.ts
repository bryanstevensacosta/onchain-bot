import {
  ChannelReputationStats,
  ConfidenceLevel,
} from 'discovery/analytics/domain/value-objects/channel-reputation-stats.vo';
import { CallPerformance } from 'discovery/analytics/domain/value-objects/call-performance.vo';
import { Outcome } from 'discovery/analytics/domain/value-objects/outcome.vo';
import { CallPerformanceRepository } from 'discovery/analytics/application/ports/call-performance.repository';
import { ChannelReputationStatsRepository } from 'discovery/analytics/application/ports/channel-reputation-stats.repository';
import { PerformanceEvaluatorPort } from 'discovery/analytics/domain/ports/performance-evaluator.port';

export interface EvaluateAndRecordInput {
  readonly channelId: string;
  readonly chain: string;
  readonly address: string;
  readonly mcAtCall: number | null;
  readonly callTimestamp: Date;
}

/**
 * Use case: evaluate how a token call turned out and record the result.
 *
 * 1. Ask PerformanceEvaluatorPort for the outcome (ATH multiple, etc.)
 * 2. Persist CallPerformance
 * 3. Recompute ChannelReputationStats for the channel
 * 4. Persist updated stats
 *
 * Idempotent: re-evaluating the same `(channelId, tokenId)` overwrites.
 */
export class EvaluateCallPerformanceUseCase {
  public constructor(
    private readonly performanceRepo: CallPerformanceRepository,
    private readonly statsRepo: ChannelReputationStatsRepository,
    private readonly evaluator: PerformanceEvaluatorPort,
  ) {}

  public async execute(
    input: EvaluateAndRecordInput,
  ): Promise<ChannelReputationStats> {
    const tokenId = `${input.chain}:${input.address.toLowerCase()}`;
    const evaluation = await this.evaluator.evaluateCall({
      chain: input.chain,
      address: input.address,
      channelId: input.channelId,
      mcAtCall: input.mcAtCall,
      callTimestamp: input.callTimestamp,
    });

    const perf = CallPerformance.create({
      channelId: input.channelId,
      tokenId,
      outcome: Outcome.fromString(evaluation.outcome),
      mcAtCall: evaluation.mcAtCall,
      athMultiple: evaluation.athMultiple,
      callTimestamp: input.callTimestamp,
    });

    await this.performanceRepo.save(perf);

    const allPerfs = await this.performanceRepo.findByChannel(input.channelId);
    const stats = recomputeStats(input.channelId, allPerfs);
    await this.statsRepo.save(stats);

    return stats;
  }
}

/**
 * Pure function: compute ChannelReputationStats from a list of performances.
 *
 * Algorithm:
 * - score = clamp(0.5 + weighted_mean(outcome.weight), 0, 1)
 * - confidence = based on total call count
 * - counts and avg ATH per outcome tier
 */
export function recomputeStats(
  channelId: string,
  perfs: ReadonlyArray<CallPerformance>,
): ChannelReputationStats {
  const totalCalls = perfs.length;
  let strong = 0,
    good = 0,
    neutral = 0,
    poor = 0,
    failed = 0;
  let weightedSum = 0;
  let athSum = 0,
    athCount = 0;

  for (const p of perfs) {
    switch (p.outcome.value) {
      case 'STRONG':
        strong++;
        break;
      case 'GOOD':
        good++;
        break;
      case 'NEUTRAL':
        neutral++;
        break;
      case 'POOR':
        poor++;
        break;
      case 'FAILED':
        failed++;
        break;
    }
    weightedSum += p.outcome.weight();
    if (p.athMultiple !== null) {
      athSum += p.athMultiple;
      athCount++;
    }
  }

  const avgOutcomeWeight = totalCalls === 0 ? 0 : weightedSum / totalCalls;
  const rawScore = 0.5 + avgOutcomeWeight * 0.5; // each outcome contributes +/-0..0.5
  const score = Math.max(0, Math.min(1, Math.round(rawScore * 100) / 100));
  const avgAth = athCount === 0 ? null : athSum / athCount;

  let confidence: ConfidenceLevel;
  if (totalCalls >= 50) confidence = 'VERY_HIGH';
  else if (totalCalls >= 20) confidence = 'HIGH';
  else if (totalCalls >= 5) confidence = 'MEDIUM';
  else confidence = 'LOW';

  return ChannelReputationStats.fromValues({
    channelId,
    score,
    totalCalls,
    strongCalls: strong,
    goodCalls: good,
    neutralCalls: neutral,
    poorCalls: poor,
    failedCalls: failed,
    avgAthMultiple: avgAth,
    confidence,
  });
}
