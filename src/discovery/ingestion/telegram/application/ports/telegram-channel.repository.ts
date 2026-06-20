import { ChannelId } from 'discovery/ingestion/telegram/domain/value-objects/channel-id.vo';
import { TelegramChannel } from 'discovery/ingestion/telegram/domain/entities/telegram-channel.entity';

/**
 * Outbound port: persistence for Telegram channels.
 *
 * Implemented in infrastructure/repositories with the chosen storage.
 */
export abstract class TelegramChannelRepository {
  public abstract save(channel: TelegramChannel): Promise<void>;
  public abstract findById(id: ChannelId): Promise<TelegramChannel | null>;
  public abstract findAll(): Promise<ReadonlyArray<TelegramChannel>>;
  public abstract delete(id: ChannelId): Promise<void>;

  /**
   * Patch the resolved display title for an existing channel without
   * requiring a full save round-trip. Returns true if a channel was found
   * and updated, false otherwise.
   *
   * Used by the seeder / post-connect backfill to replace the
   * "Telegram channel <peerId>" fallback once the MTProto session is
   * available and the real title can be resolved.
   */
  public abstract updateTitle(
    id: ChannelId,
    newTitle: string,
  ): Promise<boolean>;
}
