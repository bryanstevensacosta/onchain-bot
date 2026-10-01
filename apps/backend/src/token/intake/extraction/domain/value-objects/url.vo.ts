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

type UrlScheme = 'http' | 'https' | 'telegram';

interface UrlProps {
  readonly value: string;
  readonly scheme: UrlScheme;
}

/**
 * URL candidate extracted from a message.
 *
 * Recognized schemes:
 * - `https://...` → `https`
 * - `http://...`  → `http`
 * - `t.me/<user>` → `telegram`
 *
 * Trailing punctuation (`.`, `,`, `)`, `]`) is stripped by the extractor
 * adapter prior to construction.
 */
export class Url extends ValueObject<UrlProps> {
  protected constructor(props: UrlProps) {
    super(props);
  }

  public static fromString(raw: string): Url {
    const trimmed = raw.trim();
    if (!trimmed) {
      throw new DomainError(ErrorCode.VALIDATION, `Empty URL candidate`);
    }
    if (/^https:\/\//i.test(trimmed)) {
      return new Url({ value: trimmed, scheme: 'https' });
    }
    if (/^http:\/\//i.test(trimmed)) {
      return new Url({ value: trimmed, scheme: 'http' });
    }
    if (/^t\.me\//i.test(trimmed) || /^telegram\.me\//i.test(trimmed)) {
      return new Url({ value: trimmed, scheme: 'telegram' });
    }
    throw new DomainError(
      ErrorCode.VALIDATION,
      `Unrecognized URL scheme: ${raw}`,
      { raw: trimmed },
    );
  }

  public get value(): string {
    return this.props.value;
  }

  public get scheme(): UrlScheme {
    return this.props.scheme;
  }
}
