import { Controller, Get } from '@nestjs/common';
import { TemplatesHealthIndicator } from '../../../templates/health/templates-health.indicator';
import { TelegramHealthIndicator } from '../../../telegram/health/telegram-health.indicator';

interface ComponentStatus {
  readonly status: 'up' | 'down';
  readonly detail?: string;
}

interface CompositeHealth {
  readonly status: string;
  readonly components: Record<string, ComponentStatus>;
}

/**
 * HealthController - composite staging health (Tramo 1, todo 15, P21 + C3).
 *
 * Todo 2 shape was a static `{ status: 'ok' }` stub (gap 3). Todo 15
 * promotes it to the P21 composite contract the cutover gate asserts:
 * `components` carries at least `ingestion`, `database`, `templates`
 * and `publishing` (todo 15 acceptance jqs each key). Templates +
 * publishing reuse their P21 hook-point indicators (no duplication);
 * ingestion (SSE-only client, P20 — no indicator class exists yet) and
 * database (in-memory repos until the persistence todo) report static
 * `up` with an explicit detail string. Deep probes (DB/Redis/SSE
 * liveness) land with the persistence todo — this harness never claims
 * them. Shape stays backward compatible: `{ status: 'ok' }` still
 * matches (existing specs use toMatchObject).
 */
@Controller('api/health')
export class HealthController {
  @Get()
  getHealth(): CompositeHealth {
    const templates = new TemplatesHealthIndicator().check();
    const publishing = new TelegramHealthIndicator().check();
    return {
      status: 'ok',
      components: {
        ingestion: {
          status: 'up',
          detail: 'sse-only kol client (P20); static up — liveness probe lands with persistence todo',
        },
        database: {
          status: 'up',
          detail: 'in-memory repos (TypeORM entity + migration land with persistence todo)',
        },
        templates: { status: templates.status },
        publishing: { status: publishing.status },
      },
    };
  }
}
