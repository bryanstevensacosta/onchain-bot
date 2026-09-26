import { Injectable } from '@nestjs/common';
import { ScheduledAdRepository } from '../domain/ports/scheduled-ad.repository';
import { SchedulingConfigRepository } from '../domain/ports/scheduling-config.repository';

/**
 * P21 hook point: scheduling depth health (never liveness). Up when
 * the catalog + rotation config load; down when either read throws.
 */
@Injectable()
export class SchedulingHealthIndicator {
  public constructor(
    private readonly adRepo: ScheduledAdRepository,
    private readonly configRepo: SchedulingConfigRepository,
  ) {}

  public async check(): Promise<{
    readonly component: string;
    readonly status: 'up' | 'down';
  }> {
    try {
      await this.adRepo.findAll();
      await this.configRepo.load();
      return { component: 'scheduling', status: 'up' };
    } catch {
      return { component: 'scheduling', status: 'down' };
    }
  }
}
