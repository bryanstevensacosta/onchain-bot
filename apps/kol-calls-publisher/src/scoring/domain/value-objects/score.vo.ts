import { ValueObject } from '../../../shared/kernel/value-object';
import { DomainError, ErrorCode } from '../../../shared/kernel/domain-error';

interface ScoreProps {
  readonly value: number;
}

/**
 * 0-100 integer score for a mention (Tramo 1, todo 9, P6 + G-08).
 *
 * Backend mirror (`apps/backend/src/token/scoring/` read-only): validated
 * 0..100 range, rounded to integer. Tier mapping lives in `ScoreTier`
 * (single source of truth for the 80/60/40/20 thresholds).
 */
export class Score extends ValueObject<ScoreProps> {
  protected constructor(props: ScoreProps) {
    super(props);
  }

  public static fromNumber(raw: number): Score {
    if (!Number.isFinite(raw) || raw < 0 || raw > 100) {
      throw new DomainError(ErrorCode.VALIDATION, `Score must be 0..100, got ${raw}`, {
        raw,
      });
    }
    return new Score({ value: Math.round(raw) });
  }

  public get value(): number {
    return this.props.value;
  }
}
