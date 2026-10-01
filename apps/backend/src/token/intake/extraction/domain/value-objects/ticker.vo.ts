/**
 * @deprecated Moved to apps/kol-calls/src/extraction/ (Tramo 1, todo 5 + P18 companion).
 * Extraction per-mention now lives in kol-calls: ExtractFromMessageUseCase (direct call,
 * fix-1, no event bus; multi-tip NO collapse, one row per mention) + snapshot base emit.
 * This file stays wired for dual-run; it will be removed in todo 16 (cutover + cleanup).
 * Do not extend it — add extraction logic in apps/kol-calls/src/extraction/ instead.
 *
 * New location: apps/kol-calls/src/extraction/
 * Reason: extracting KOL pipeline from backend monolith to dedicated app
 * Breaking change: Yes (removal in todo 16)
 * Rollback: re-enable backend path (KOL_PIPELINE_ENABLED=true)
 */
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
