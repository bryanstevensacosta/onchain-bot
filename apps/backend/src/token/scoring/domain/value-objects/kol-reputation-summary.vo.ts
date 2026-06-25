import { ValueObject } from 'shared/kernel/value-object';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

export type KolReputationThresholds = {
  readonly unknown: number;
  readonly trusted: number;
  readonly suspicious: number;
};

interface KolReputationSummaryProps {
  readonly kolId: string;
  readonly score: number; // 0..1
  readonly mentionCount: number;
  readonly thresholds: KolReputationThresholds;
}

/**
 * Per-KOL reputation summary used by the scoring pipeline.
 *
 * Lightweight projection of the rich `KolReputation` aggregate owned by
 * `kol/reputation`. Scoring only needs `score` (0..1) and
 * `mentionCount` to compute its multiplier; the full per-outcome
 * breakdown lives in the reputation BC.
 *
 * Thresholds (`trusted` ≥, `suspicious` ≤) are stored on the VO at
 * construction time so `isTrusted()`/`isSuspicious()` remain pure
 * (no settings dependency at the call site). Callers must read
 * `KolReputationThresholds` from `SettingsService.getKolReputationThresholds()`
 * and pass it in.
 *
 * `score` 0..1:
 * - 0.9+ : well-known, accurate (e.g., "spydefi")
 * - `thresholds.unknown` : default for unknown KOLs (typically 0.5)
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
    thresholds: KolReputationThresholds;
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
      thresholds: input.thresholds,
    });
  }

  public static unknown(
    kolId: string,
    thresholds: KolReputationThresholds,
  ): KolReputationSummary {
    return new KolReputationSummary({
      kolId,
      score: thresholds.unknown,
      mentionCount: 0,
      thresholds,
    });
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
    return this.props.score >= this.props.thresholds.trusted;
  }

  public isSuspicious(): boolean {
    return this.props.score <= this.props.thresholds.suspicious;
  }
}
