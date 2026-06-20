import { Injectable } from '@nestjs/common';
import { ChannelId } from 'discovery/ingestion/telegram/domain/value-objects/channel-id.vo';
import { TelegramChannel } from 'discovery/ingestion/telegram/domain/entities/telegram-channel.entity';
import { TelegramChannelRepository } from 'discovery/ingestion/telegram/application/ports/telegram-channel.repository';

/**
 * In-memory implementation of TelegramChannelRepository.
 *
 * Replace with TypeORM / Prisma adapter when persistence is added.
 * Lives in infrastructure so the application layer stays pure.
 */
@Injectable()
export class InMemoryTelegramChannelRepository extends TelegramChannelRepository {
  private readonly store = new Map<string, TelegramChannel>();

  public async save(channel: TelegramChannel): Promise<void> {
    this.store.set(channel.channelId.value, channel);
  }

  public async findById(id: ChannelId): Promise<TelegramChannel | null> {
    return this.store.get(id.value) ?? null;
  }

  public async findAll(): Promise<ReadonlyArray<TelegramChannel>> {
    return Array.from(this.store.values());
  }

  public async delete(id: ChannelId): Promise<void> {
    this.store.delete(id.value);
  }

  public async updateTitle(id: ChannelId, newTitle: string): Promise<boolean> {
    const channel = this.store.get(id.value);
    if (!channel) {
      return false;
    }
    channel.updateTitle(newTitle);
    return true;
  }
}
