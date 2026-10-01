import { Injectable } from '@nestjs/common';
import { ChannelFilterRepository } from '../application/ports/channel-filter.repository';

export interface FiltersHealth {
  readonly component: string;
  readonly status: 'up' | 'down';
  readonly rules: number;
}

/**
 * P21 hook point: filters health indicator (rule count only).
 */
@Injectable()
export class FiltersHealthIndicator {
  public constructor(private readonly repo: ChannelFilterRepository) {}

  public async check(): Promise<FiltersHealth> {
    try {
      const all = await this.repo.findAll();
      return { component: 'filters', status: 'up', rules: all.length };
    } catch {
      return { component: 'filters', status: 'down', rules: 0 };
    }
  }
}
