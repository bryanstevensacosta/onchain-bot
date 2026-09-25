import { Injectable } from '@nestjs/common';
import { ChannelContentFilterConfig } from '../../../domain/channel-content-filter-config.entity';
import {
  ChannelFilterRepository,
  type ChannelFilterRule,
} from '../../../application/ports/channel-filter.repository';

/**
 * In-memory `ChannelFilterRepository` — the LIVE binding until GAP-1.
 */
@Injectable()
export class InMemoryChannelFilterRepository extends ChannelFilterRepository {
  private readonly store = new Map<string, ChannelContentFilterConfig>();

  public async findFiltersByChannelId(
    channelId: string,
  ): Promise<ReadonlyArray<ChannelFilterRule>> {
    return [...this.store.values()]
      .filter((f) => f.channelId === channelId && f.isActive)
      .sort(
        (a, b) =>
          a.priority - b.priority ||
          a.createdAt.getTime() - b.createdAt.getTime(),
      )
      .map((f) => ({
        pattern: f.pattern,
        replacement: f.replacement,
        flags: f.flags,
        priority: f.priority,
        isActive: f.isActive,
        createdAt: f.createdAt,
      }));
  }

  public async findAll(): Promise<ReadonlyArray<ChannelContentFilterConfig>> {
    return [...this.store.values()];
  }

  public async findById(
    id: string,
  ): Promise<ChannelContentFilterConfig | null> {
    return this.store.get(id) ?? null;
  }

  public async save(config: ChannelContentFilterConfig): Promise<void> {
    this.store.set(config.id, config);
  }

  public async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }
}
