import { ValueObject } from 'shared/kernel/value-object';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

interface LiquidityProps {
  readonly value: number;
}

/**
 * USD liquidity in a token's main trading pair.
 *
 * Allows 0 but rejects negative or non-finite values.
 */
export class Liquidity extends ValueObject<LiquidityProps> {
  protected constructor(props: LiquidityProps) {
    super(props);
  }

  public static fromNumber(raw: number): Liquidity {
    if (!Number.isFinite(raw) || raw < 0) {
      throw new DomainError(ErrorCode.VALIDATION, `Invalid liquidity: ${raw}`, {
        raw,
      });
    }
    return new Liquidity({ value: raw });
  }

  public get value(): number {
    return this.props.value;
  }
}
