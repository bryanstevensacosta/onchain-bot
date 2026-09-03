import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ChannelContentFilterConfigEntity } from '../../../infrastructure/persistence/typeorm/entities/channel-content-filter-config.entity';

export interface UpdateFilterDto {
  id: string;
  pattern?: string;
  replacement?: string;
  flags?: string;
  priority?: number;
  isActive?: boolean;
}

export interface UpdateFilterResult {
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
 * Use case: Update an existing content filter.
 *
 * Validates:
 * - The filter exists
 * - If pattern is updated, it compiles as valid regex
 * - If flags are updated, they contain only valid regex flags
 *
 * Returns the updated filter.
 */
@Injectable()
export class UpdateFilterUseCase {
  private readonly logger = new Logger(UpdateFilterUseCase.name);

  constructor(private readonly dataSource: DataSource) {}

  public async execute(dto: UpdateFilterDto): Promise<UpdateFilterResult> {
    const filterRepo = this.dataSource.getRepository(
      ChannelContentFilterConfigEntity,
    );

    // 1. Find existing filter
    const filter = await filterRepo.findOne({ where: { id: dto.id } });
    if (!filter) {
      throw new Error(`Filter ${dto.id} not found`);
    }

    // 2. Validate pattern if provided
    if (dto.pattern !== undefined) {
      try {
        const testFlags = dto.flags !== undefined ? dto.flags : filter.flags;
        new RegExp(dto.pattern, testFlags);
      } catch (err) {
        throw new Error(`Invalid regex pattern: ${(err as Error).message}`);
      }
      filter.pattern = dto.pattern;
    }

    // 3. Validate flags if provided
    if (dto.flags !== undefined) {
      const validFlags = /^[gimsuy]*$/;
      if (!validFlags.test(dto.flags)) {
        throw new Error(
          `Invalid regex flags: ${dto.flags}. Only g, i, m, s, u, y are allowed.`,
        );
      }
      filter.flags = dto.flags;
    }

    // 4. Update other fields if provided
    if (dto.replacement !== undefined) {
      filter.replacement = dto.replacement;
    }
    if (dto.priority !== undefined) {
      filter.priority = dto.priority;
    }
    if (dto.isActive !== undefined) {
      filter.isActive = dto.isActive;
    }

    // 5. Save
    const updated = await filterRepo.save(filter);

    this.logger.log(
      `Updated filter ${updated.id} for channel ${updated.channelId}`,
    );

    return {
      id: updated.id,
      channelId: updated.channelId,
      pattern: updated.pattern,
      replacement: updated.replacement,
      flags: updated.flags,
      priority: updated.priority,
      isActive: updated.isActive,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }
}
