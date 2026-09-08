import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ChannelContentFilterConfigEntity } from '../../../infrastructure/persistence/typeorm/entities/channel-content-filter-config.entity';

export interface FilterView {
  id: string;
  channelId: string;
  pattern: string;
  replacement: string;
  flags: string;
  priority: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Use case: List all content filters for a specific channel.
 *
 * Returns filters ordered by priority ASC, then createdAt ASC.
 * The channel is NOT validated against crypto-news sources: sources live
 * in ingestion-service's own DB, so an unknown channel simply yields [].
 */
@Injectable()
export class ListFiltersUseCase {
  private readonly logger = new Logger(ListFiltersUseCase.name);

  constructor(private readonly dataSource: DataSource) {}

  public async execute(channelId: string): Promise<ReadonlyArray<FilterView>> {
    // Query filters directly from TypeORM to get full entity with id and updatedAt
    const filterRepo = this.dataSource.getRepository(
      ChannelContentFilterConfigEntity,
    );

    const filters = await filterRepo.find({
      where: { channelId },
      order: {
        priority: 'ASC',
        createdAt: 'ASC',
      },
    });

    if (filters.length === 0) {
      this.logger.warn(
        `No filters for channel ${channelId} (sources owned by ingestion-service; channel treated as opaque)`,
      );
    }

    return filters.map((f) => ({
      id: f.id,
      channelId: f.channelId,
      pattern: f.pattern,
      replacement: f.replacement,
      flags: f.flags,
      priority: f.priority,
      isActive: f.isActive,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    }));
  }
}
