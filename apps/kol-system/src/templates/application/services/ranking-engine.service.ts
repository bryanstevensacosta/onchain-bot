import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from '../../../shared/kernel/domain-error';
import type {
  RankingStrategy,
  RankingWeights,
} from '../../domain/entities/publishing-template.entity';
import { DEFAULT_RANKING_WEIGHTS } from '../../domain/entities/publishing-template.entity';

export interface RankableCall {
  readonly mentionId: string;
  readonly kolId: string;
  readonly score: number;
  readonly views?: number | null;
  readonly reactions?: number | null;
  readonly scoredAt: Date;
}

export interface RankedCall extends RankableCall {
  readonly rankScore: number;
  readonly rank: number;
  readonly strategy: RankingStrategy;
}

export interface RankOptions {
  readonly weights?: RankingWeights;
  readonly now?: Date;
  readonly limit?: number;
}

/** Half-life of the recency decay: 100 at 0h → 50 at 12h (spec Ph9). */
const RECENCY_HALF_LIFE_HOURS = 12;

/**
 * Ranking engine with the 4 spec strategies (Tramo 1, todo 10, Ph9).
 *
 * Pure service (no repo access): callers map `ScoredCall` → `RankableCall`
 * (engagement is null until tracking lands in todo 12 — nulls sort as 0).
 */
@Injectable()
export class RankingEngine {
  public rank(
    calls: ReadonlyArray<RankableCall>,
    strategy: RankingStrategy,
    options: RankOptions = {},
  ): RankedCall[] {
    if (calls.length === 0) return [];
    const now = options.now ?? new Date();
    let ranked: RankedCall[];
    switch (strategy) {
      case 'score':
        ranked = calls.map((call) => this.withRank(call, call.score, strategy));
        break;
      case 'engagement':
        ranked = calls.map((call) =>
          this.withRank(call, this.engagementOf(call), strategy),
        );
        break;
      case 'recency':
        ranked = calls.map((call) =>
          this.withRank(call, this.recencyOf(call, now), strategy),
        );
        break;
      case 'weighted':
        ranked = this.rankWeighted(
          calls,
          options.weights ?? DEFAULT_RANKING_WEIGHTS,
          now,
        );
        break;
      default:
        throw new DomainError(
          ErrorCode.VALIDATION,
          `unknown ranking strategy: ${strategy as string}`,
        );
    }
    ranked.sort((a, b) => b.rankScore - a.rankScore);
    const limit = options.limit ?? ranked.length;
    return ranked
      .slice(0, limit)
      .map((call, index) => ({ ...call, rank: index + 1 }));
  }

  private rankWeighted(
    calls: ReadonlyArray<RankableCall>,
    weights: RankingWeights,
    now: Date,
  ): RankedCall[] {
    const total = weights.score + weights.engagement + weights.recency;
    if (!(total > 0)) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'ranking weights must sum above 0',
      );
    }
    const maxEngagement = Math.max(
      0,
      ...calls.map((call) => this.engagementOf(call)),
    );
    return calls.map((call) => {
      const normScore = call.score / 100;
      const normEngagement =
        maxEngagement > 0 ? this.engagementOf(call) / maxEngagement : 0;
      const normRecency = this.recencyOf(call, now) / 100;
      const rankScore =
        Math.round(
          (100 *
            (weights.score * normScore +
              weights.engagement * normEngagement +
              weights.recency * normRecency)) /
            total,
        ) / 1;
      return this.withRank(call, rankScore, 'weighted');
    });
  }

  private engagementOf(call: RankableCall): number {
    return (call.views ?? 0) + (call.reactions ?? 0);
  }

  private recencyOf(call: RankableCall, now: Date): number {
    const ageHours = Math.max(
      0,
      (now.getTime() - call.scoredAt.getTime()) / 3_600_000,
    );
    return 100 * Math.pow(0.5, ageHours / RECENCY_HALF_LIFE_HOURS);
  }

  private withRank(
    call: RankableCall,
    rankScore: number,
    strategy: RankingStrategy,
  ): RankedCall {
    return { ...call, rankScore, rank: 0, strategy };
  }
}
