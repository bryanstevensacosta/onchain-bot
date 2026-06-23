import { ValueObject } from 'shared/kernel/value-object';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { ScoreTier } from 'token/scoring/domain/value-objects/score-tier.vo';

interface ScoreProps {
  readonly value: number;
}

/**
 * 0-100 integer score for a token. Higher = more attractive / less risky.
 *
 * Score interpretation (delegated to `ScoreTier`):
 * - 80-100: STRONG — multi-channel buzz, healthy metrics
 * - 60-79:  DECENT — worth a look
 * - 40-59:  NEUTRAL — mixed signals
 * - 20-39:  RISKY — proceed with caution
 * - 0-19:   AVOID — likely scam
 *
 * N15: `tier()` now returns a `ScoreTier` VO (not a string union).
 * The thresholds are defined in `ScoreTier.fromScore()` — single source of truth.
 */
export class Score extends ValueObject<ScoreProps> {
  protected constructor(props: ScoreProps) {
    super(props);
  }

  public static fromNumber(raw: number): Score {
    if (!Number.isFinite(raw) || raw < 0 || raw > 100) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Score must be 0..100, got ${raw}`,
        { raw },
      );
    }
    return new Score({ value: Math.round(raw) });
  }

  public get value(): number {
    return this.props.value;
  }

  public tier(): ScoreTier {
    return ScoreTier.fromScore(this.props.value);
  }
}
