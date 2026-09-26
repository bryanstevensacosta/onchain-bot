import { Injectable } from '@nestjs/common';

export interface ComponentHealth {
  readonly component: string;
  readonly status: 'up' | 'down';
}

/**
 * P21 hook point: extraction health indicator.
 *
 * Reports the extraction component status for the future composite
 * `GET /api/health` (today the endpoint is a static `{ status: 'ok' }`
 * stub — gap 3 — so this indicator is provided + exported but not yet
 * consumed; wiring lands with the composite-health todo).
 */
@Injectable()
export class ExtractionHealthIndicator {
  public check(): ComponentHealth {
    return { component: 'extraction', status: 'up' };
  }
}
