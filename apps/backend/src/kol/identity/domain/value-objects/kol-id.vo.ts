/**
 * @deprecated Tramo 1 cutover (task-16, staging): KOL hot path moved to
 * apps/kol-calls (ingestion/extraction/parsing/normalization) +
 * apps/kol-calls-publisher (scoring/templates/approval/publishing).
 * Refactor target: delete this file at the central FINAL REVIEW (C4-bis.3).
 * Rollback: backend path stays wired; nothing deleted here.
 */
import { ValueObject } from 'shared/kernel/value-object';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

interface KolIdProps {
  readonly value: string;
}

/**
 * Telegram channel peer id of a KOL (BigInt serialized to string).
 */
export class KolId extends ValueObject<KolIdProps> {
  private static readonly PATTERN = /^-?\d+$/;

  protected constructor(props: KolIdProps) {
    super(props);
  }

  public static fromString(raw: string): KolId {
    if (!KolId.PATTERN.test(raw)) {
      throw new DomainError(ErrorCode.VALIDATION, `Invalid kol id: ${raw}`, {
        raw,
      });
    }
    return new KolId({ value: raw });
  }

  public get value(): string {
    return this.props.value;
  }
}
