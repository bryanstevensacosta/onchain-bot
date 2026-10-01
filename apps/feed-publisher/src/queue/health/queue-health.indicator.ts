import { Injectable } from '@nestjs/common';
import { QueueManager } from '../application/services/queue-manager.service';

/**
 * P21 hook point: queue health indicator (depth only, never liveness).
 */
@Injectable()
export class QueueHealthIndicator {
  public constructor(private readonly manager: QueueManager) {}

  public async check(): Promise<{
    readonly component: string;
    readonly status: 'up' | 'down';
  }> {
    try {
      await this.manager.counts();
      return { component: 'queue', status: 'up' };
    } catch {
      return { component: 'queue', status: 'down' };
    }
  }
}
