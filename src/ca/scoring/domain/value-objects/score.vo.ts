import { ValueObject } from 'shared/kernel/value-object';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

interface ScoreProps {
  readonly value: number;
}

/**
 * 0-100 integer score for a token. Higher = more attractive / less risky.
 *
 * Score interpretation:
 * - 80-100: Strong signal, multi-channel buzz, healthy metrics
 * - 60-79:  Decent, worth a look
 * - 40-59:  Neutral, mixed signals
 * - 20-39:  Risky, proceed with caution
 * - 0-19:   Avoid / likely scam
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

  public tier(): 'STRONG' | 'DECENT' | 'NEUTRAL' | 'RISKY' | 'AVOID' {
    if (this.props.value >= 80) return 'STRONG';
    if (this.props.value >= 60) return 'DECENT';
    if (this.props.value >= 40) return 'NEUTRAL';
    if (this.props.value >= 20) return 'RISKY';
    return 'AVOID';
  }
}
