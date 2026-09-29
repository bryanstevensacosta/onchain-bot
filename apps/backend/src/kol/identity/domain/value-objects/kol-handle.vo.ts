/**
 * @deprecated Tramo 1 cutover (task-16, staging): KOL hot path moved to
 * apps/kol-calls (ingestion/extraction/parsing/normalization) +
 * apps/kol-calls-publisher (scoring/templates/approval/publishing).
 * Refactor target: delete this file at the central FINAL REVIEW (C4-bis.3).
 * Rollback: backend path stays wired; nothing deleted here.
 */
import { ValueObject } from 'shared/kernel/value-object';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

interface KolHandleProps {
  readonly value: string;
}

/**
 * Telegram KOL handle (e.g. "SpyDefi" from t.me/SpyDefi).
 * Must be 5-32 chars, alphanumeric + underscores.
 */
export class KolHandle extends ValueObject<KolHandleProps> {
  private static readonly PATTERN = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;

  protected constructor(props: KolHandleProps) {
    super(props);
  }

  public static fromString(raw: string): KolHandle {
    const normalized = raw
      .trim()
      .replace(/^@/, '')
      .replace(/^https?:\/\/t\.me\//, '');
    if (!KolHandle.PATTERN.test(normalized)) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Invalid kol handle: ${raw}`,
        {
          raw,
        },
      );
    }
    return new KolHandle({ value: normalized });
  }

  public get value(): string {
    return this.props.value;
  }
}
