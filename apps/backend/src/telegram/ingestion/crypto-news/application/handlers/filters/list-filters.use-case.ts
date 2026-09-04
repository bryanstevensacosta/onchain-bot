import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CryptoNewsSourceRepository } from '../../ports/crypto-news-source.repository';
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
 */
@Injectable()
export class ListFiltersUseCase {
  constructor(
    private readonly sourceRepository: CryptoNewsSourceRepository,
    private readonly dataSource: DataSource,
  ) {}

  public async execute(channelId: string): Promise<ReadonlyArray<FilterView>> {
    // Validate channel exists
    const source = await this.sourceRepository.findByChannelId(channelId);
    if (!source) {
      throw new Error(`Channel ${channelId} not found`);
    }

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
