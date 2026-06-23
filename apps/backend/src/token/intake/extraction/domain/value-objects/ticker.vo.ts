import { ValueObject } from 'shared/kernel/value-object';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

interface TickerProps {
  readonly value: string;
}

/**
 * Token ticker symbol (e.g. `PEPE`, `$WIF`, `BONK`).
 *
 * 2-10 uppercase chars/digits. Leading `$` is stripped during creation.
 *
 * Common English words and crypto-meta terms (BUY, SELL, ATH, MC, ...) are
 * filtered out by the extractor adapter — this VO only enforces format.
 */
export class Ticker extends ValueObject<TickerProps> {
  private static readonly PATTERN = /^[A-Z0-9]{2,10}$/;

  protected constructor(props: TickerProps) {
    super(props);
  }

  public static fromString(raw: string): Ticker {
    const normalized = raw.replace(/^\$/, '').trim().toUpperCase();
    if (!Ticker.PATTERN.test(normalized)) {
      throw new DomainError(ErrorCode.VALIDATION, `Invalid ticker: ${raw}`, {
        raw,
      });
    }
    return new Ticker({ value: normalized });
  }

  public get value(): string {
    return this.props.value;
  }
}
