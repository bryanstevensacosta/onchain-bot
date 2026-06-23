import { DomainEvent } from 'shared/kernel/domain-event';

export class CallPublishFailedEvent extends DomainEvent {
  public readonly payload: {
    readonly chain: string;
    readonly address: string;
    readonly score: number;
    readonly targetChannels: ReadonlyArray<string>;
    readonly failedChannelIds: ReadonlyArray<string>;
    readonly failedAt: Date;
  };

  constructor(payload: {
    chain: string;
    address: string;
    score: number;
    targetChannels: ReadonlyArray<string>;
    failedChannelIds: ReadonlyArray<string>;
    failedAt: Date;
  }) {
    super('publishing.telegram.failed', `${payload.chain}:${payload.address}`);
    this.payload = Object.freeze({
      ...payload,
      targetChannels: Object.freeze([...payload.targetChannels]),
      failedChannelIds: Object.freeze([...payload.failedChannelIds]),
    });
  }

  public toPayload(): Record<string, unknown> {
    return {
      ...this.payload,
      failedAt: this.payload.failedAt.toISOString(),
    };
  }
}