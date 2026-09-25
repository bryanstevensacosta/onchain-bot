import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChannelContentFilterConfig } from '../../../../domain/channel-content-filter-config.entity';
import {
  ChannelFilterRepository,
  type ChannelFilterRule,
} from '../../../../application/ports/channel-filter.repository';
import { ChannelContentFilterConfigEntity } from '../entities/channel-content-filter-config.entity';

/**
 * Postgres-backed `ChannelFilterRepository` (unwired until GAP-1).
 */
@Injectable()
export class TypeOrmChannelFilterRepository extends ChannelFilterRepository {
  constructor(
    @InjectRepository(ChannelContentFilterConfigEntity)
    private readonly repo: Repository<ChannelContentFilterConfigEntity>,
  ) {
    super();
  }

  public async findFiltersByChannelId(
    channelId: string,
  ): Promise<ReadonlyArray<ChannelFilterRule>> {
    const rows = await this.repo.find({
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

  public async findAll(): Promise<ReadonlyArray<ChannelContentFilterConfig>> {
    const rows = await this.repo.find({
      order: { priority: 'ASC', createdAt: 'ASC' },
    });
    return rows.map((row) =>
      ChannelContentFilterConfig.reconstitute({
        id: row.id,
        channelId: row.channelId,
        pattern: row.pattern,
        replacement: row.replacement,
        flags: row.flags,
        isActive: row.isActive,
        priority: row.priority,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }),
    );
  }

  public async findById(
    id: string,
  ): Promise<ChannelContentFilterConfig | null> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) {
      return null;
    }
    return ChannelContentFilterConfig.reconstitute({
      id: row.id,
      channelId: row.channelId,
      pattern: row.pattern,
      replacement: row.replacement,
      flags: row.flags,
      isActive: row.isActive,
      priority: row.priority,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  public async save(config: ChannelContentFilterConfig): Promise<void> {
    await this.repo.save({
      id: config.id,
      channelId: config.channelId,
      pattern: config.pattern,
      replacement: config.replacement,
      flags: config.flags,
      isActive: config.isActive,
      priority: config.priority,
    });
  }

  public async delete(id: string): Promise<boolean> {
    const result = await this.repo.delete({ id });
    return (result.affected ?? 0) > 0;
  }
}
