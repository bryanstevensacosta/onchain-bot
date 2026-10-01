/**
 * @deprecated Tramo 1 cutover (task-16, staging): KOL hot path moved to
 * apps/kol-calls (ingestion/extraction/parsing/normalization) +
 * apps/kol-calls-publisher (scoring/templates/approval/publishing).
 * Refactor target: delete this file at the central FINAL REVIEW (C4-bis.3).
 * Rollback: backend path stays wired; nothing deleted here.
 */
import { ValueObject } from 'shared/kernel/value-object';

export interface MessageIdParams {
  readonly peerId: string;
  readonly messageId: number;
}

export class MessageId extends ValueObject<MessageIdParams> {
  public get peerId(): string {
    return this.props.peerId;
  }

  public get messageId(): number {
    return this.props.messageId;
  }

  public get value(): string {
    return `${this.props.peerId}:${this.props.messageId}`;
  }

  public static create(peerId: string, messageId: number): MessageId {
    return new MessageId({ peerId, messageId });
  }

  public static fromKey(key: string): MessageId {
    const sep = key.indexOf(':');
    if (sep === -1) throw new Error(`Invalid MessageId key: ${key}`);
    return new MessageId({
      peerId: key.slice(0, sep),
      messageId: parseInt(key.slice(sep + 1), 10),
    });
  }
}
