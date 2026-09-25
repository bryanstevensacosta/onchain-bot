import { Injectable } from '@nestjs/common';

export interface ComponentHealth {
  readonly component: string;
  readonly status: 'up' | 'down';
}

/**
 * P21 hook point: ingestion health indicator.
 *
 * Reports the ingestion component status for the future composite
 * `GET /api/health` (today the endpoint is a static `{ status: 'ok' }`
 * stub, so this indicator is provided + exported but not yet consumed;
 * wiring lands with the composite-health todo).
 */
@Injectable()
export class IngestionHealthIndicator {
  public check(): ComponentHealth {
    return { component: 'ingestion', status: 'up' };
  }
}
