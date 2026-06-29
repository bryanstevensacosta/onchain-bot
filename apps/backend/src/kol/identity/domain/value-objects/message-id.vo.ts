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
