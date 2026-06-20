/**
 * Outbound port: ingests raw messages from a Telegram source.
 *
 * Implemented by infrastructure adapters (MTProto client, REST webhooks, etc.)
 *
 * Defined as an abstract class (not interface) so it can be used as a NestJS DI token.
 */
export abstract class TelegramListenerPort {
  public abstract subscribe(
    channelIds: string[],
  ): AsyncIterable<RawTelegramMessage>;
  public abstract backfill(
    channelId: string,
    limit: number,
  ): Promise<RawTelegramMessage[]>;
  public abstract disconnect(): Promise<void>;
  public abstract resolveChannelMetadata(
    channelId: string,
  ): Promise<ResolvedChannelMetadata>;
}

/**
 * Metadata resolved from Telegram for a given peer id.
 * Used by seeders/importers that don't carry a title up front.
 */
export interface ResolvedChannelMetadata {
  readonly channelId: string;
  readonly title: string;
  readonly username: string | null;
}

/**
 * Raw Telegram message as received from MTProto.
 * Infrastructure-only type; not part of the domain.
 */
export interface RawTelegramMessage {
  readonly channelId: string;
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
