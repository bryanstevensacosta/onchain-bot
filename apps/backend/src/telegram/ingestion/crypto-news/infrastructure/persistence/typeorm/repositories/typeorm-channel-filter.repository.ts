import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ChannelFilterRepository,
  ChannelFilterRule,
} from 'telegram/ingestion/crypto-news/application/ports/channel-filter.repository';
import { ChannelContentFilterConfigEntity } from 'telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/channel-content-filter-config.entity';

/**
 * Postgres-backed implementation of `ChannelFilterRepository`.
 *
 * Filters-only slice kept in the backend after db-separation todo 4:
 * reads active rules from `channel_content_filter_configs` by opaque
 * `channel_id` (no JOIN — sources live in ingestion-service's DB).
 */
@Injectable()
export class TypeOrmChannelFilterRepository extends ChannelFilterRepository {
  constructor(
    @InjectRepository(ChannelContentFilterConfigEntity)
    private readonly filterRepo: Repository<ChannelContentFilterConfigEntity>,
  ) {
    super();
  }

  public async findFiltersByChannelId(
    channelId: string,
  ): Promise<ReadonlyArray<ChannelFilterRule>> {
    const rows = await this.filterRepo.find({
      where: { channelId, isActive: true },
      order: { priority: 'ASC', createdAt: 'ASC' },
    });
    return rows.map((row) => ({
      pattern: row.pattern,
      replacement: row.replacement,
      flags: row.flags,
      priority: row.priority,
      isActive: row.isActive,
      createdAt: row.createdAt,
    }));
  }
}
