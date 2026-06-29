export abstract class TelegramListenerPort {
  public abstract subscribe(
    channelIds: string[],
  ): AsyncIterable<TelegramRawMessage>;
  public abstract backfill(
    channelId: string,
    limit: number,
  ): Promise<TelegramRawMessage[]>;
  public abstract disconnect(): Promise<void>;
  public abstract resolveChannelMetadata(
    channelId: string,
  ): Promise<ResolvedChannelMetadata>;
}

export interface ResolvedChannelMetadata {
  readonly peerId: string;
  readonly title: string;
  readonly handle: string | null;
  readonly kind: 'channel' | 'user' | 'unknown';
}

export interface TelegramRawMessage {
  readonly peerId: string;
  readonly messageId: number;
  readonly text: string;
  readonly occurredAt: Date;
  readonly entities?: ReadonlyArray<{
    readonly type: string;
    readonly offset: number;
    readonly length: number;
    readonly url?: string;
  }>;
  readonly hasMedia?: boolean;
}
