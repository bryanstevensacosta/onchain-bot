import { ChannelId } from 'ca/ingestion/telegram/domain/value-objects/channel-id.vo';
import { ChannelUsername } from 'ca/ingestion/telegram/domain/value-objects/channel-username.vo';
import { TelegramChannel } from 'ca/ingestion/telegram/domain/entities/telegram-channel.entity';
import { TelegramChannelEntity } from 'ca/ingestion/telegram/infrastructure/persistence/typeorm/entities/telegram-channel.entity';

/**
 * Maps between the rich domain aggregate `TelegramChannel` and its
 * anemic TypeORM persistence shape `TelegramChannelEntity`.
 *
 * Lives in infrastructure because the mapping depends on the storage
 * representation. Domain code never imports this file.
 */
export class TelegramChannelMapper {
  public static toEntity(channel: TelegramChannel): TelegramChannelEntity {
    const row = new TelegramChannelEntity();
    row.channelId = channel.channelId.value;
    row.username = channel.username?.value ?? null;
    row.title = channel.title;
    row.isActive = channel.isActive;
    row.lastIngestedAt = channel.lastIngestedAt;
    row.addedAt = (
      channel as unknown as { state: { addedAt: Date } }
    ).state.addedAt;
    return row;
  }

  public static toDomain(row: TelegramChannelEntity): TelegramChannel {
    return TelegramChannel.reconstitute({
      id: ChannelId.fromString(row.channelId),
      username:
        row.username && row.username.length > 0
          ? ChannelUsername.fromString(row.username)
          : null,
      title: row.title,
      isActive: row.isActive,
      lastIngestedAt: row.lastIngestedAt,
      addedAt: row.addedAt,
    });
  }
}
