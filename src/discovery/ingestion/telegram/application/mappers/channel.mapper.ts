import type { TelegramChannel } from 'discovery/ingestion/telegram/domain/entities/telegram-channel.entity';

/**
 * Outbound view model: channel summary for API/UI consumers.
 * Lives alongside the mappers because it's the application output shape.
 */
export interface ChannelView {
  readonly id: string;
  readonly username: string | null;
  readonly title: string;
  readonly isActive: boolean;
  readonly lastIngestedAt: string | null;
}

/**
 * Maps domain entities to outbound view models.
 */
export class ChannelMapper {
  public static toView(channel: TelegramChannel): ChannelView {
    return {
      id: channel.channelId.value,
      username: channel.username?.value ?? null,
      title: channel.title,
      isActive: channel.isActive,
      lastIngestedAt: channel.lastIngestedAt?.toISOString() ?? null,
    };
  }
}
