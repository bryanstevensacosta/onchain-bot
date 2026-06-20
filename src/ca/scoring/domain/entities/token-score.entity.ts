import { AggregateRoot } from 'shared/kernel/aggregate-root';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { DomainEvent } from 'shared/kernel/domain-event';
import { ChainId } from 'shared/common/value-objects/chain-id.vo';
import { Score } from 'ca/scoring/domain/value-objects/score.vo';
import { TokenScoredEvent } from 'ca/scoring/domain/events/token-scored.event';

export interface ScoreBreakdownItem {
  readonly factor: string;
  readonly delta: number;
  readonly note: string;
}

export interface ScoreInput {
  readonly chain: ChainId;
  readonly address: string;
  readonly score: Score;
  readonly breakdown: ReadonlyArray<ScoreBreakdownItem>;
  readonly classification: string;
  readonly sourceCount: number;
  readonly mentionCount: number;
  readonly avgChannelReputation: number;
}

interface TokenScoreProps {
  readonly chain: ChainId;
  readonly address: string;
  readonly score: Score;
  readonly breakdown: ReadonlyArray<ScoreBreakdownItem>;
  readonly classification: string;
  readonly sourceCount: number;
  readonly mentionCount: number;
  readonly avgChannelReputation: number;
  readonly scoredAt: Date;
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
    return new TokenScore(id, {
      chain: input.chain,
      address: input.address.toLowerCase(),
      score: input.score,
      breakdown: Object.freeze(
        input.breakdown.map((b) => Object.freeze({ ...b })),
      ),
      classification: input.classification,
      sourceCount: input.sourceCount,
      mentionCount: input.mentionCount,
      avgChannelReputation: input.avgChannelReputation,
      scoredAt: new Date(),
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
  public get breakdown(): ReadonlyArray<ScoreBreakdownItem> {
    return this.state.breakdown;
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
  public get avgChannelReputation(): number {
    return this.state.avgChannelReputation;
  }
  public get scoredAt(): Date {
    return this.state.scoredAt;
  }
  public get tier(): string {
    return this.state.score.tier();
  }

  public positiveFactors(): ReadonlyArray<ScoreBreakdownItem> {
    return this.state.breakdown.filter((b) => b.delta > 0);
  }

  public negativeFactors(): ReadonlyArray<ScoreBreakdownItem> {
    return this.state.breakdown.filter((b) => b.delta < 0);
  }

  public emitScored(): void {
    this.apply(
      new TokenScoredEvent({
        chain: this.state.chain.value,
        address: this.state.address,
        score: this.state.score.value,
        tier: this.tier,
        classification: this.state.classification,
        sourceCount: this.state.sourceCount,
        mentionCount: this.state.mentionCount,
        avgChannelReputation: this.state.avgChannelReputation,
        breakdown: this.state.breakdown.map((b) => ({ ...b })),
        scoredAt: this.state.scoredAt,
      }),
    );
  }

  protected mutate(_event: DomainEvent): void {
    void _event;
  }
}
