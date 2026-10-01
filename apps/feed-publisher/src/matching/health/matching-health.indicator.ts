import { Injectable } from '@nestjs/common';
import { MatchingHealthState } from '../application/state/matching-health.state';

/**
 * P21 hook point: matching health indicator (flag + tick state only).
 */
@Injectable()
export class MatchingHealthIndicator {
  public constructor(private readonly health: MatchingHealthState) {}

  public check(): {
    readonly component: string;
    readonly status: 'up' | 'down';
  } {
    return { component: 'matching', status: 'up' };
  }
}
