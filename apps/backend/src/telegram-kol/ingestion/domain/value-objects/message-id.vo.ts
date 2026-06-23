import { ValueObject } from 'shared/kernel/value-object';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

interface MessageIdProps {
  readonly value: number;
}

/**
 * Telegram message id within a KOL channel.
 *
 * Fase 4 of the kol-refactor plan: kept as-is (the value object itself
 * is transport-agnostic) but moved to the new `telegram-kol/ingestion/`
 * location.
 */
export class MessageId extends ValueObject<MessageIdProps> {
  protected constructor(props: MessageIdProps) {
    super(props);
  }

  public static fromNumber(raw: number): MessageId {
    if (!Number.isInteger(raw) || raw <= 0) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Invalid message id: ${raw}`,
        { raw },
      );
    }
    return new MessageId({ value: raw });
  }

  public get value(): number {
    return this.props.value;
  }
}
