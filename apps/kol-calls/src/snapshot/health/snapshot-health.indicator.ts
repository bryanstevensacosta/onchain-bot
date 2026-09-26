import { Injectable } from '@nestjs/common';

export interface ComponentHealth {
  readonly component: string;
  readonly status: 'up' | 'down';
}

/**
 * P21 hook point: snapshot health indicator.
 *
 * Reports the snapshot component status for the future composite
 * `GET /api/health` (today the endpoint is a static `{ status: 'ok' }`
 * stub — gap 3 — so this indicator is provided + exported but not yet
 * consumed; wiring lands with the composite-health todo).
 */
@Injectable()
export class SnapshotHealthIndicator {
  public check(): ComponentHealth {
    return { component: 'snapshot', status: 'up' };
  }
}
