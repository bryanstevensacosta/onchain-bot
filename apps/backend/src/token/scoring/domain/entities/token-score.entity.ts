import { AggregateRoot } from 'shared/kernel/aggregate-root';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { DomainEvent } from 'shared/kernel/domain-event';
import { ChainId } from 'chain/identity/chain-id.vo';
import { Score } from 'token/scoring/domain/value-objects/score.vo';
import { ScoreTier } from 'token/scoring/domain/value-objects/score-tier.vo';

export type ScoringTierThresholds = {
  readonly strong: number;
  readonly decent: number;
  readonly neutral: number;
  readonly risky: number;
};
import { TokenScoredEvent } from 'token/scoring/domain/events/token-scored.event';

export type ScoreBreakdownItem = {
  factor: string;
  delta: number;
  note: string;
};

export interface ScoreBreakdown {
  items: readonly ScoreBreakdownItem[];
}

export interface ScoreInput {
  readonly chain: ChainId;
  readonly address: string;
  readonly score: Score;
  readonly classification: string;
  readonly sourceCount: number;
  readonly mentionCount: number;
  readonly avgKolReputation: number;
  readonly breakdown: readonly ScoreBreakdownItem[];
  readonly tierThresholds: ScoringTierThresholds;
}

interface TokenScoreProps {
  readonly chain: ChainId;
  readonly address: string;
  readonly score: Score;
  readonly tier: ScoreTier;
  readonly classification: string;
  readonly sourceCount: number;
  readonly mentionCount: number;
  readonly avgKolReputation: number;
  readonly scoredAt: Date;
  readonly breakdown: readonly ScoreBreakdownItem[];
}

/**
 * Final 0-100 score for a token.
 *
 * Aggregates:
 * - classification (TOKEN/SCAM/UNKNOWN)
 * - risk signals (severity-weighted penalties)
 * - market metrics (liquidity, holders, MC, volume — bonuses)
 * - normalization (multi-channel buzz, mention count)
 * - channel reputation (multiplier on base)
 *
 * N11 refactor: removed `breakdown` field. N17: added back — UI now needs
 * the breakdown for the token detail page. The breakdown (list of factors
 * with deltas) is persisted in state and returned via all GET endpoints.
 */
export class TokenScore extends AggregateRoot<string> {
  private readonly state: TokenScoreProps;

  protected constructor(id: string, props: TokenScoreProps) {
    super(id);
    this.state = props;
  }

  public static create(input: ScoreInput): TokenScore {
    if (!input.address) {
      throw new DomainError(ErrorCode.VALIDATION, `address cannot be empty`);
    }
    const id = `${input.chain.value}:${input.address.toLowerCase()}`;
    const tier = ScoreTier.fromScore(input.score.value, input.tierThresholds);
    return new TokenScore(id, {
      chain: input.chain,
      address: input.address.toLowerCase(),
      score: input.score,
      tier,
      classification: input.classification,
      sourceCount: input.sourceCount,
      mentionCount: input.mentionCount,
      avgKolReputation: input.avgKolReputation,
      scoredAt: new Date(),
      breakdown: input.breakdown,
    });
  }

  /**
   * Reconstruct an aggregate from persistence. Bypasses factory validation
   * (id already set, address already normalized) but still rebuilds the
   * domain invariants by delegating to the constructor.
   */
  public static rehydrate(input: {
    id: string;
    chain: ChainId;
    address: string;
    score: Score;
    tier: ScoreTier;
    classification: string;
    sourceCount: number;
    mentionCount: number;
    avgKolReputation: number;
    scoredAt: Date;
    breakdown: readonly ScoreBreakdownItem[];
  }): TokenScore {
    return new TokenScore(input.id, {
      chain: input.chain,
      address: input.address,
      score: input.score,
      tier: input.tier,
      classification: input.classification,
      sourceCount: input.sourceCount,
      mentionCount: input.mentionCount,
      avgKolReputation: input.avgKolReputation,
      scoredAt: input.scoredAt,
      breakdown: input.breakdown,
    });
  }

  public get chain(): ChainId {
    return this.state.chain;
  }

  public get address(): string {
    return this.state.address;
  }

  public get score(): Score {
    return this.state.score;
  }

  public get classification(): string {
    return this.state.classification;
  }

  public get sourceCount(): number {
    return this.state.sourceCount;
  }

  public get mentionCount(): number {
    return this.state.mentionCount;
  }

  public get avgKolReputation(): number {
    return this.state.avgKolReputation;
  }

  public get scoredAt(): Date {
    return this.state.scoredAt;
  }

  public get tier(): ScoreTier {
    return this.state.tier;
  }

  public get breakdown(): readonly ScoreBreakdownItem[] {
    return this.state.breakdown;
  }

  public emitScored(
    securityFlag: 'SCAM' | 'SUSPICIOUS' | 'LEGITIMATE' | 'UNKNOWN',
  ): void {
    this.apply(
      new TokenScoredEvent({
        chain: this.state.chain.value,
        address: this.state.address,
        score: this.state.score.value,
        tier: this.tier.value,
        classification: this.state.classification,
        securityFlag,
        sourceCount: this.state.sourceCount,
        mentionCount: this.state.mentionCount,
        avgKolReputation: this.state.avgKolReputation,
        scoredAt: this.state.scoredAt,
      }),
    );
  }

  protected mutate(_event: DomainEvent): void {
    void _event;
  }
}
