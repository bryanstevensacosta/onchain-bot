import type { ScoreBreakdownItem } from 'token/scoring/domain/entities/token-score.entity';
import type { ScoreTier } from 'token/scoring/domain/value-objects/score-tier.vo';

export interface ScoreBreakdownView {
  readonly factor: string;
  readonly delta: number;
  readonly note: string;
}

export interface TokenScoreView {
  readonly id: string;
  readonly chain: string;
  readonly address: string;
  readonly score: number;
  readonly tier: string;
  readonly classification: string;
  readonly sourceCount: number;
  readonly mentionCount: number;
  readonly avgKolReputation: number;
  readonly breakdown: ReadonlyArray<ScoreBreakdownView>;
  readonly scoredAt: string;
}

export interface TokenScoreViewInput {
  readonly id: string;
  readonly chain: string;
  readonly address: string;
  readonly score: number;
  readonly tier: ScoreTier;
  readonly classification: string;
  readonly sourceCount: number;
  readonly mentionCount: number;
  readonly avgKolReputation: number;
  readonly breakdown: ReadonlyArray<ScoreBreakdownItem>;
  readonly scoredAt: Date;
}

export class TokenScoreMapper {
  public static toView(input: TokenScoreViewInput): TokenScoreView {
    return {
      id: input.id,
      chain: input.chain,
      address: input.address,
      score: input.score,
      tier: input.tier.value,
      classification: input.classification,
      sourceCount: input.sourceCount,
      mentionCount: input.mentionCount,
      avgKolReputation: input.avgKolReputation,
      breakdown: input.breakdown.map((b) => ({ ...b })),
      scoredAt: input.scoredAt.toISOString(),
    };
  }
}
