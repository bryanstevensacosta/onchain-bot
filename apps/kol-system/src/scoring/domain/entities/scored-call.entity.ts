import { AggregateRoot } from '../../../shared/kernel/aggregate-root';
import { DomainError, ErrorCode } from '../../../shared/kernel/domain-error';
import type { DomainEvent } from '../../../shared/kernel/domain-event';
import { Score } from '../value-objects/score.vo';
import {
  ScoreTier,
  DEFAULT_TIER_THRESHOLDS,
  type ScoringTierThresholds,
  type ScoreTierValue,
} from '../value-objects/score-tier.vo';

export interface ScoreBreakdownItem {
  readonly factor: string;
  readonly delta: number;
  readonly note: string;
}

export interface ScoredCallProps {
  readonly mentionId: string;
  readonly kolId: string;
  readonly messageId: number;
  readonly contractIndex: number;
  readonly chain: string;
  readonly address: string;
  readonly score: Score;
  readonly avgKolReputation: number;
  readonly breakdown: ReadonlyArray<ScoreBreakdownItem>;
  readonly scoredAt: Date;
  readonly tierThresholds?: ScoringTierThresholds;
}

/**
 * Final 0-100 score for one KOL mention (Tramo 1, todo 9, P6 + G-08).
 *
 * One row per scored mention — the scoring output is a per-mention view
 * (P1 mention index all the way down: extraction → parsing → normalization
 * → enrichment → scoring). Only mentions that PASS all 8 gates are saved;
 * below-cut mentions are discarded pre-publisher (see `score-gates.ts`).
 *
 * Backend mirror (`apps/backend/src/token/scoring/` read-only): `breakdown`
 * explains every factor (UI score display reads it); `tier` derives from
 * the 80/60/40/20 thresholds.
 */
export class ScoredCall extends AggregateRoot<string> {
  private readonly props: ScoredCallProps;
  private readonly tierValue: ScoreTier;

  private constructor(id: string, props: ScoredCallProps) {
    super(id);
    this.props = props;
    this.tierValue = ScoreTier.fromScore(
      props.score.value,
      props.tierThresholds ?? DEFAULT_TIER_THRESHOLDS,
    );
  }

  public static create(input: ScoredCallProps): ScoredCall {
    if (!input.mentionId) {
      throw new DomainError(ErrorCode.VALIDATION, 'mentionId must not be empty');
    }
    if (!input.address) {
      throw new DomainError(ErrorCode.VALIDATION, 'address cannot be empty', {
        mentionId: input.mentionId,
      });
    }
    // Solana addresses are Base58 case-sensitive; lowercase EVM only.
    const normalizedAddr =
      input.chain === 'solana' ? input.address : input.address.toLowerCase();
    return new ScoredCall(input.mentionId, {
      ...input,
      address: normalizedAddr,
      breakdown: Object.freeze([...input.breakdown]),
    });
  }

  public get mentionId(): string {
    return this.props.mentionId;
  }

  public get kolId(): string {
    return this.props.kolId;
  }

  public get messageId(): number {
    return this.props.messageId;
  }

  public get contractIndex(): number {
    return this.props.contractIndex;
  }

  public get chain(): string {
    return this.props.chain;
  }

  public get address(): string {
    return this.props.address;
  }

  public get score(): number {
    return this.props.score.value;
  }

  public get tier(): ScoreTierValue {
    return this.tierValue.value;
  }

  public get avgKolReputation(): number {
    return this.props.avgKolReputation;
  }

  public get breakdown(): ReadonlyArray<ScoreBreakdownItem> {
    return this.props.breakdown;
  }

  public get scoredAt(): Date {
    return this.props.scoredAt;
  }

  protected mutate(_event: DomainEvent): void {
    void _event;
  }
}
