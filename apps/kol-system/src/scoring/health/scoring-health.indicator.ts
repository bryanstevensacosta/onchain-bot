import { Injectable } from '@nestjs/common';

export interface ComponentHealth {
  readonly component: string;
  readonly status: 'up' | 'down';
}

/**
 * P21 hook point: scoring health indicator.
 *
 * Reports the scoring component status for the future composite
 * `GET /api/health` (today the endpoint is a static `{ status: 'ok' }`
 * stub — gap 3 — so this indicator is provided + exported but not yet
 * consumed; wiring lands with the composite-health todo).
 */
@Injectable()
export class ScoringHealthIndicator {
  public check(): ComponentHealth {
    return { component: 'scoring', status: 'up' };
  }
}
