import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { TelegramChannel } from 'ca/ingestion/telegram/domain/entities/telegram-channel.entity';
import { ChannelId } from 'ca/ingestion/telegram/domain/value-objects/channel-id.vo';
import { ChannelUsername } from 'ca/ingestion/telegram/domain/value-objects/channel-username.vo';
import type { AddChannelInput } from 'ca/ingestion/telegram/api/input/add-channel.input';
import {
  ChannelMapper,
  ChannelView,
} from 'ca/ingestion/telegram/application/mappers/channel.mapper';
import { TelegramChannelRepository } from 'ca/ingestion/telegram/application/ports/telegram-channel.repository';
import { TelegramEventPublisher } from 'ca/ingestion/telegram/application/ports/telegram-event.publisher';

/**
 * Use case: register a new Telegram channel for ingestion.
 */
@Injectable()
export class AddChannelUseCase {
  constructor(
    private readonly channelRepo: TelegramChannelRepository,
    private readonly eventPublisher: TelegramEventPublisher,
  ) {}

  public async execute(input: AddChannelInput): Promise<ChannelView> {
    const id = ChannelId.fromString(input.channelId);
    const username = input.username
      ? ChannelUsername.fromString(input.username)
      : null;

    const existing = await this.channelRepo.findById(id);
    if (existing) {
      throw new DomainError(
        ErrorCode.CONFLICT,
        `Channel already registered: ${input.channelId}`,
      );
    }

    const channel = TelegramChannel.create({
      id,
      username,
      title: input.title,
    });
    await this.channelRepo.save(channel);
    await this.eventPublisher.publishAll(channel.commit());
    return ChannelMapper.toView(channel);
  }
}
