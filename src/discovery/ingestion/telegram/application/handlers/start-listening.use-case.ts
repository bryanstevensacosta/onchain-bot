import { Injectable } from '@nestjs/common';
import { TelegramChannelRepository } from 'discovery/ingestion/telegram/application/ports/telegram-channel.repository';
import { TelegramEventPublisher } from 'discovery/ingestion/telegram/application/ports/telegram-event.publisher';
import { TelegramListenerPort } from 'discovery/ingestion/telegram/domain/ports/telegram-listener.port';
import { ChannelId } from 'discovery/ingestion/telegram/domain/value-objects/channel-id.vo';
import type { StartListeningInput } from 'discovery/ingestion/telegram/api/input/start-listening.input';
import {
  ChannelMapper,
  ChannelView,
} from 'discovery/ingestion/telegram/application/mappers/channel.mapper';

/**
 * Use case: start the real-time Telegram listener on a set of channels.
 *
 * Wires the inbound port (TelegramListenerPort) to the channels' lifecycle.
 */
@Injectable()
export class StartListeningUseCase {
  constructor(
    private readonly channelRepo: TelegramChannelRepository,
    private readonly listener: TelegramListenerPort,
    private readonly eventPublisher: TelegramEventPublisher,
  ) {}

  public async execute(
    input: StartListeningInput,
  ): Promise<ReadonlyArray<ChannelView>> {
    const channelIds = input.channelIds.map((id) => ChannelId.fromString(id));
    const channels = await Promise.all(
      channelIds.map((id) => this.channelRepo.findById(id)),
    );

    for (const channel of channels) {
      if (!channel) continue;
      channel.startListening();
      await this.channelRepo.save(channel);
      await this.eventPublisher.publishAll(channel.commit());
    }

    // Stream raw messages → ingest + publish events
    void this.consumeStream(channelIds.map((id) => id.value));

    return channels.filter((c) => c).map((c) => ChannelMapper.toView(c!));
  }

  private async consumeStream(channelIds: string[]): Promise<void> {
    try {
      for await (const raw of this.listener.subscribe(channelIds)) {
        const channelId = ChannelId.fromString(raw.channelId);
        const channel = await this.channelRepo.findById(channelId);
        if (!channel) continue;
        channel.recordMessageIngested(raw.messageId, raw.occurredAt, raw.text);
        await this.channelRepo.save(channel);
        await this.eventPublisher.publishAll(channel.commit());
      }
    } catch (err) {
      // Reconnect logic handled at the adapter level (FloodWait, network)
      throw err;
    }
  }
}
