import { Injectable } from '@nestjs/common';
import { DeduplicationService } from '../application/services/deduplication.service';

/**
 * P21 hook point: deduplication health indicator (cascade only).
 */
@Injectable()
export class DeduplicationHealthIndicator {
  public constructor(private readonly deduplication: DeduplicationService) {}

  public check(): {
    readonly component: string;
    readonly status: 'up' | 'down';
  } {
    void this.deduplication;
    return { component: 'deduplication', status: 'up' };
  }
}
