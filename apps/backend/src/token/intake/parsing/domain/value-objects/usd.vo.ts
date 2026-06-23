import { ValueObject } from 'shared/kernel/value-object';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

interface UsdProps {
  readonly amount: number;
}

/**
 * USD amount. Stored as a float (number) — sufficient for token metrics
 * (market cap, liquidity, FDV) which are inherently approximations.
 *
 * For higher precision downstream (price × supply, etc.) convert to
 * bigint or use a dedicated decimal library.
 */
export class Usd extends ValueObject<UsdProps> {
  protected constructor(props: UsdProps) {
    super(props);
  }

  public static fromNumber(raw: number): Usd {
    if (!Number.isFinite(raw) || raw < 0) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Invalid USD amount: ${raw}`,
        { raw },
      );
    }
    return new Usd({ amount: raw });
  }

  /**
   * Parse shorthand notations common in Telegram alpha calls:
   * - `180K` → 180_000
   * - `1.2M` → 1_200_000
   * - `2.5B` → 2_500_000_000
   * - `180,000` → 180_000 (commas)
   * - `$180K` → 180_000 (strips $)
   */
  public static fromShorthand(raw: string): Usd | null {
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
    return Usd.fromNumber(value * multiplier);
  }

  public get amount(): number {
    return this.props.amount;
  }
}
