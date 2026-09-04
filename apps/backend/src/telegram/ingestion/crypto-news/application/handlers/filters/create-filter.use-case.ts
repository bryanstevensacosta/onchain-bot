import { Injectable, Logger } from '@nestjs/common';
import { CryptoNewsSourceRepository } from '../../ports/crypto-news-source.repository';
import { DataSource } from 'typeorm';
import { ChannelContentFilterConfigEntity } from '../../../infrastructure/persistence/typeorm/entities/channel-content-filter-config.entity';

export interface CreateFilterDto {
  channelId: string;
  pattern: string;
  replacement: string;
  flags: string;
  priority: number;
  isActive: boolean;
}

export interface CreateFilterResult {
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
 * Use case: Create a new content filter for a crypto-news channel.
 *
 * Validates that:
 * - The channel exists in crypto_news_sources
 * - The regex pattern is valid (compiles without error)
 * - The flags string contains only valid regex flags (g, i, m, s, u, y)
 *
 * Returns the created filter with its generated ID.
 */
@Injectable()
export class CreateFilterUseCase {
  private readonly logger = new Logger(CreateFilterUseCase.name);

  constructor(
    private readonly sourceRepository: CryptoNewsSourceRepository,
    private readonly dataSource: DataSource,
  ) {}

  public async execute(dto: CreateFilterDto): Promise<CreateFilterResult> {
    // 1. Validate channel exists
    const source = await this.sourceRepository.findByChannelId(dto.channelId);
    if (!source) {
      throw new Error(`Channel ${dto.channelId} not found`);
    }

    // 2. Validate regex pattern
    try {
      new RegExp(dto.pattern, dto.flags);
    } catch (err) {
      throw new Error(`Invalid regex pattern: ${(err as Error).message}`);
    }

    // 3. Validate flags (only g, i, m, s, u, y allowed)
    const validFlags = /^[gimsuy]*$/;
    if (!validFlags.test(dto.flags)) {
      throw new Error(
        `Invalid regex flags: ${dto.flags}. Only g, i, m, s, u, y are allowed.`,
      );
    }

    // 4. Create filter entity
    const filterRepo = this.dataSource.getRepository(
      ChannelContentFilterConfigEntity,
    );

    const filter = filterRepo.create({
      channelId: dto.channelId,
      pattern: dto.pattern,
      replacement: dto.replacement,
      flags: dto.flags,
      priority: dto.priority,
      isActive: dto.isActive,
    });

    const saved = await filterRepo.save(filter);

    this.logger.log(
      `Created filter ${saved.id} for channel ${dto.channelId} (pattern="${dto.pattern}", priority=${dto.priority})`,
    );

    return {
      id: saved.id,
      channelId: saved.channelId,
      pattern: saved.pattern,
      replacement: saved.replacement,
      flags: saved.flags,
      priority: saved.priority,
      isActive: saved.isActive,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    };
  }
}
