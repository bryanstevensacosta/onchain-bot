import { ValueObject } from 'shared/kernel/value-object';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

export type EvaluationHorizon = '24H' | '7D' | '30D';

export type JobStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

const HORIZON_HOURS: Record<EvaluationHorizon, number> = {
  '24H': 24,
  '7D': 24 * 7,
  '30D': 24 * 30,
};

interface EvaluationHorizonProps {
  readonly value: EvaluationHorizon;
}

export class EvaluationHorizonVo extends ValueObject<EvaluationHorizonProps> {
  public static readonly H24 = new EvaluationHorizonVo({ value: '24H' });
  public static readonly D7 = new EvaluationHorizonVo({ value: '7D' });
  public static readonly D30 = new EvaluationHorizonVo({ value: '30D' });

  private static readonly VALID = new Set<EvaluationHorizon>([
    '24H',
    '7D',
    '30D',
  ]);

  protected constructor(props: EvaluationHorizonProps) {
    super(props);
  }

  public static fromString(raw: string): EvaluationHorizonVo {
    const value = raw.toUpperCase() as EvaluationHorizon;
    if (!EvaluationHorizonVo.VALID.has(value)) {
      throw new DomainError(ErrorCode.VALIDATION, `Invalid horizon: ${raw}`, {
        raw,
      });
    }
    return new EvaluationHorizonVo({ value });
  }

  public static defaultHorizons(): ReadonlyArray<EvaluationHorizonVo> {
    return [
      EvaluationHorizonVo.H24,
      EvaluationHorizonVo.D7,
      EvaluationHorizonVo.D30,
    ];
  }

  public get value(): EvaluationHorizon {
    return this.props.value;
  }

  public hours(): number {
    return HORIZON_HOURS[this.props.value];
  }

  /**
   * Returns the wall-clock time at which this horizon fires for a
   * call made at `callTimestamp`.
   */
  public firesAt(callTimestamp: Date): Date {
    return new Date(callTimestamp.getTime() + this.hours() * 60 * 60 * 1000);
  }
}
