import { Injectable } from '@nestjs/common';

export interface KolCallsComponentStatus {
  readonly component: string;
  readonly status: 'up' | 'down';
  readonly detail?: string;
}

/**
 * KolCallsHealthIndicator — P21 hook point for the upstream kol-calls
 * dependency (P51 contract: mentions+snapshots over HTTP).
 *
 * Static `up` until the deep probe (authenticated GET /api/health on the
 * upstream) lands with the persistence todo — the composite health never
 * claims liveness it does not have.
 */
@Injectable()
export class KolCallsHealthIndicator {
  public check(): KolCallsComponentStatus {
    return {
      component: 'kol-calls',
      status: 'up',
      detail:
        'upstream kol-calls HTTP contract (mentions+snapshots, paginated); static up — authenticated probe lands with persistence todo',
    };
  }
}
