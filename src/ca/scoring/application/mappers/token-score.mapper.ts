import type { TokenScore } from 'ca/scoring/domain/entities/token-score.entity';

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
  readonly avgChannelReputation: number;
  readonly breakdown: ReadonlyArray<ScoreBreakdownView>;
  readonly scoredAt: string;
}

export class TokenScoreMapper {
  public static toView(score: TokenScore): TokenScoreView {
    return {
      id: score.id,
      chain: score.chain.value,
      address: score.address,
      score: score.score.value,
      tier: score.tier,
      classification: score.classification,
      sourceCount: score.sourceCount,
      mentionCount: score.mentionCount,
      avgChannelReputation: score.avgChannelReputation,
      breakdown: score.breakdown.map((b) => ({ ...b })),
      scoredAt: score.scoredAt.toISOString(),
    };
  }
}
