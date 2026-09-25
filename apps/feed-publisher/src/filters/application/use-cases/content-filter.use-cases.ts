import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ChannelContentFilterConfig } from '../../domain/channel-content-filter-config.entity';
import { ChannelFilterRepository } from '../ports/channel-filter.repository';

export interface ContentFilterView {
  readonly id: string;
  readonly channelId: string;
  readonly pattern: string;
  readonly replacement: string;
  readonly flags: string;
  readonly priority: number;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function toContentFilterView(
  config: ChannelContentFilterConfig,
): ContentFilterView {
  return {
    id: config.id,
    channelId: config.channelId,
    pattern: config.pattern,
    replacement: config.replacement,
    flags: config.flags,
    priority: config.priority,
    isActive: config.isActive,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
  };
}

export interface CreateContentFilterInput {
  readonly channelId: string;
  readonly pattern: string;
  readonly replacement: string;
  readonly flags: string;
  readonly priority: number;
  readonly isActive: boolean;
}

export interface UpdateContentFilterInput {
  readonly pattern?: string;
  readonly replacement?: string;
  readonly flags?: string;
  readonly priority?: number;
  readonly isActive?: boolean;
}

/**
 * CRUD use-cases for per-channel content filters.
 *
 * Unknown channels are warn-only (opaque channel_id, no FK — sources live
 * in the ingestion service DB). Missing ids raise NotFoundException so the
 * controller maps them to 404 without extra translation.
 */
@Injectable()
export class ContentFilterUseCases {
  private readonly logger = new Logger(ContentFilterUseCases.name);

  public constructor(private readonly repo: ChannelFilterRepository) {}

  public async create(
    input: CreateContentFilterInput,
  ): Promise<ChannelContentFilterConfig> {
    this.logger.warn(
      `Creating filter for channel ${input.channelId} without source existence check (sources owned by ingestion service)`,
    );
    const config = ChannelContentFilterConfig.create(input);
    await this.repo.save(config);
    return config;
  }

  public async listByChannel(
    channelId: string,
  ): Promise<ReadonlyArray<ChannelContentFilterConfig>> {
    const all = await this.repo.findAll();
    return all
      .filter((f) => f.channelId === channelId)
      .sort(
        (a, b) =>
          a.priority - b.priority ||
          a.createdAt.getTime() - b.createdAt.getTime(),
      );
  }

  public async update(
    id: string,
    input: UpdateContentFilterInput,
  ): Promise<ChannelContentFilterConfig> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException(`Filter ${id} not found`);
    }
    if (input.pattern !== undefined) {
      existing.updatePattern(input.pattern);
    }
    if (input.replacement !== undefined) {
      existing.updateReplacement(input.replacement);
    }
    if (input.flags !== undefined) {
      existing.updateFlags(input.flags);
    }
    if (input.priority !== undefined) {
      existing.setPriority(input.priority);
    }
    if (input.isActive === true) {
      existing.activate();
    } else if (input.isActive === false) {
      existing.deactivate();
    }
    await this.repo.save(existing);
    return existing;
  }

  public async remove(id: string): Promise<void> {
    const deleted = await this.repo.delete(id);
    if (!deleted) {
      throw new NotFoundException(`Filter ${id} not found`);
    }
  }

  public async toggle(id: string): Promise<ChannelContentFilterConfig> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException(`Filter ${id} not found`);
    }
    existing.toggle();
    await this.repo.save(existing);
    return existing;
  }
}
