import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { ChannelId } from 'discovery/ingestion/telegram/domain/value-objects/channel-id.vo';
import {
  ChannelMapper,
  ChannelView,
} from 'discovery/ingestion/telegram/application/mappers/channel.mapper';
import { TelegramChannelRepository } from 'discovery/ingestion/telegram/application/ports/telegram-channel.repository';

/**
 * Use case: fetch a channel by id.
 */
@Injectable()
export class GetChannelUseCase {
  constructor(private readonly channelRepo: TelegramChannelRepository) {}

  public async execute(channelId: string): Promise<ChannelView> {
    const id = ChannelId.fromString(channelId);
    const channel = await this.channelRepo.findById(id);
    if (!channel) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        `Channel not found: ${channelId}`,
      );
    }
    return ChannelMapper.toView(channel);
  }
}
