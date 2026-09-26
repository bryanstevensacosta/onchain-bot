import { Controller, Get } from '@nestjs/common';
import { TrackingHealthIndicator } from '../../../tracking/health/tracking-health.indicator';

interface ComponentStatus {
  readonly status: 'up' | 'down';
  readonly detail?: string;
}

interface CompositeHealth {
  readonly status: string;
  readonly components: Record<string, ComponentStatus>;
}

/**
 * HealthController - composite staging health (P51: kol-calls hot path).
 *
 * P51 split: scoring/templates/approval/publishing moved to
 * apps/kol-calls-publisher (its own composite health). This controller
 * keeps the hot-path components: `ingestion` (SSE-only client, P20),
 * `database` (in-memory repos until the persistence todo), `mentions`
 * + `snapshots` (P51 contract reads) and `tracking` (via its P21
 * hook-point indicator). Deep probes (DB/Redis/SSE liveness) land with
 * the persistence todo — this harness never claims them. Shape stays
 * backward compatible: `{ status: 'ok' }` still matches.
 */
@Controller('api/health')
export class HealthController {
  @Get()
  getHealth(): CompositeHealth {
    const tracking = new TrackingHealthIndicator().check();
    return {
      status: 'ok',
      components: {
        ingestion: {
          status: 'up',
          detail:
            'sse-only kol client (P20); static up — liveness probe lands with persistence todo',
        },
        database: {
          status: 'up',
          detail:
            'in-memory repos (TypeORM entity + migration land with persistence todo)',
        },
        mentions: {
          status: 'up',
          detail: 'P51 contract GET /api/mentions (paginated, keyed)',
        },
        snapshots: {
          status: 'up',
          detail: 'P51 contract GET /api/snapshots (paginated, keyed)',
        },
        tracking: { status: tracking.status },
      },
    };
  }
}
