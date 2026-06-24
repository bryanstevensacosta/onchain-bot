import { ValueObject } from 'shared/kernel/value-object';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

interface KolReputationSummaryProps {
  readonly kolId: string;
  readonly score: number; // 0..1
  readonly mentionCount: number;
}

/**
 * Per-KOL reputation summary used by the scoring pipeline.
 *
 * Lightweight projection of the rich `KolReputation` aggregate owned by
 * `kol/reputation`. Scoring only needs `score` (0..1) and
 * `mentionCount` to compute its multiplier; the full per-outcome
 * breakdown lives in the reputation BC.
 *
 * `score` 0..1:
 * - 0.9+ : well-known, accurate (e.g., "spydefi")
 * - 0.5  : default for unknown KOLs
 * - 0.1  : known spammer / unreliable
 */
export class KolReputationSummary extends ValueObject<KolReputationSummaryProps> {
  protected constructor(props: KolReputationSummaryProps) {
    super(props);
  }

  public static create(input: {
    kolId: string;
    score: number;
    mentionCount?: number;
  }): KolReputationSummary {
    if (!input.kolId) {
      throw new DomainError(ErrorCode.VALIDATION, `kolId cannot be empty`);
    }
    if (!Number.isFinite(input.score) || input.score < 0 || input.score > 1) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Kol reputation score must be 0..1, got ${input.score}`,
        { score: input.score },
      );
    }
    return new KolReputationSummary({
      kolId: input.kolId,
      score: input.score,
      mentionCount: input.mentionCount ?? 0,
    });
  }

  public static unknown(kolId: string): KolReputationSummary {
    return new KolReputationSummary({ kolId, score: 0.5, mentionCount: 0 });
  }

  public get kolId(): string {
    return this.props.kolId;
  }
  public get score(): number {
    return this.props.score;
  }
  public get mentionCount(): number {
    return this.props.mentionCount;
  }

  public isTrusted(): boolean {
    return this.props.score >= 0.7;
  }

  public isSuspicious(): boolean {
    return this.props.score <= 0.3;
  }
}
