import { Injectable } from '@nestjs/common';

export interface ComponentHealth {
  readonly component: string;
  readonly status: 'up' | 'down';
}

/**
 * P21 hook point: approval health indicator.
 *
 * Provided + exported, unwired until the composite-health todo (gap 3) —
 * same pattern as extraction/parsing/normalization/enrichment/scoring.
 */
@Injectable()
export class ApprovalHealthIndicator {
  public check(): ComponentHealth {
    return { component: 'approval', status: 'up' };
  }
}
