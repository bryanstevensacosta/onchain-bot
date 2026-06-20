import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChannelId } from 'ca/ingestion/telegram/domain/value-objects/channel-id.vo';
import { TelegramChannel } from 'ca/ingestion/telegram/domain/entities/telegram-channel.entity';
import { TelegramChannelRepository } from 'ca/ingestion/telegram/application/ports/telegram-channel.repository';
import { TelegramChannelEntity } from 'ca/ingestion/telegram/infrastructure/persistence/typeorm/entities/telegram-channel.entity';
import { TelegramChannelMapper } from 'ca/ingestion/telegram/infrastructure/persistence/typeorm/mappers/telegram-channel.mapper';

/**
 * Postgres-backed implementation of `TelegramChannelRepository`.
 *
 * Persistence model:
 * - One row per channel (PK = `channel_id`).
 * - `title` is mutable so the seeder's post-connect backfill can replace
 *   the "Telegram channel <peerId>" fallback once MTProto resolves the
 *   real title. The mapper only reads `title` and `username` for hydration;
 *   `isActive` and `lastIngestedAt` are rehydrated too so use cases that
 *   care about "was this channel paused?" can read it back.
 *
 * `updateTitle` is implemented as a targeted UPDATE rather than a full
 * save round-trip — cheaper on Postgres and avoids re-fetching the row
 * to merge with the in-memory aggregate.
 */
@Injectable()
export class TypeOrmTelegramChannelRepository extends TelegramChannelRepository {
  constructor(
    @InjectRepository(TelegramChannelEntity)
    private readonly repo: Repository<TelegramChannelEntity>,
  ) {
    super();
  }

  public async save(channel: TelegramChannel): Promise<void> {
    const row = TelegramChannelMapper.toEntity(channel);
    await this.repo.save(row);
  }

  public async findById(id: ChannelId): Promise<TelegramChannel | null> {
    const row = await this.repo.findOne({ where: { channelId: id.value } });
    return row ? TelegramChannelMapper.toDomain(row) : null;
  }

  public async findAll(): Promise<ReadonlyArray<TelegramChannel>> {
    const rows = await this.repo.find();
    return rows.map((r) => TelegramChannelMapper.toDomain(r));
  }

  public async delete(id: ChannelId): Promise<void> {
    await this.repo.delete({ channelId: id.value });
  }

  public async updateTitle(id: ChannelId, newTitle: string): Promise<boolean> {
    const trimmed = newTitle.trim();
    if (trimmed.length === 0) {
      return false;
    }
    const result = await this.repo.update(
      { channelId: id.value },
      { title: trimmed },
    );
    return (result.affected ?? 0) > 0;
  }
}
