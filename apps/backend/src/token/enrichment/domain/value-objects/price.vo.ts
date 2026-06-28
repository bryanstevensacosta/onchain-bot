import { ValueObject } from 'shared/kernel/value-object';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

interface PriceProps {
  readonly value: number;
}

/**
 * USD price of a token.
 *
 * Allows 0 (some tokens have zero price if illiquid) but rejects
 * negative or non-finite values.
 */
export class Price extends ValueObject<PriceProps> {
  protected constructor(props: PriceProps) {
    super(props);
  }

  public static fromNumber(raw: number): Price {
    if (!Number.isFinite(raw) || raw < 0) {
      throw new DomainError(ErrorCode.VALIDATION, `Invalid price: ${raw}`, {
        raw,
      });
    }
    return new Price({ value: raw });
  }

  /**
   * Parse shorthand notations common in market data APIs.
   * - `"180K"` → 180000
   * - `"1.2"` → 1.2
   * - `"0.000012"` → 0.000012
   */
  public static fromShorthand(raw: string): Price | null {
    const cleaned = raw.replace(/[$,\s]/g, '').trim();
    if (!cleaned) return null;
    const match = /^([\d.]+)([KkMmBb])?$/.exec(cleaned);
    if (!match) return null;
    const value = parseFloat(match[1]);
    if (!Number.isFinite(value)) return null;
    const suffix = (match[2] ?? '').toLowerCase();
    const multiplier =
      suffix === 'k'
        ? 1_000
        : suffix === 'm'
          ? 1_000_000
          : suffix === 'b'
            ? 1_000_000_000
            : 1;
    return Price.fromNumber(value * multiplier);
  }

  public get value(): number {
    return this.props.value;
  }
}
