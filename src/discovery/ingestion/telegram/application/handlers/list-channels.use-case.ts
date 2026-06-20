import { Injectable } from '@nestjs/common';
import {
  ChannelMapper,
  ChannelView,
} from 'discovery/ingestion/telegram/application/mappers/channel.mapper';
import { TelegramChannelRepository } from 'discovery/ingestion/telegram/application/ports/telegram-channel.repository';

/**
 * Use case: list all monitored channels.
 */
@Injectable()
export class ListChannelsUseCase {
  constructor(private readonly channelRepo: TelegramChannelRepository) {}

  public async execute(): Promise<ReadonlyArray<ChannelView>> {
    const channels = await this.channelRepo.findAll();
    return channels.map((c) => ChannelMapper.toView(c));
  }
}
