import { Controller, Get } from '@nestjs/common';
import { ScoringHealthIndicator } from '@/scoring/health/scoring-health.indicator';
import { TemplatesHealthIndicator } from '@/templates/health/templates-health.indicator';
import { ApprovalHealthIndicator } from '@/approval/health/approval-health.indicator';
import { TelegramHealthIndicator } from '@/target/telegram-ports';
import { TargetHealthIndicator } from '@/target/health/target-health.indicator';
import { KolCallsHealthIndicator } from '@/kol-calls/health/kol-calls-health.indicator';

interface ComponentStatus {
  readonly status: 'up' | 'down';
  readonly detail?: string;
}

interface CompositeHealth {
  readonly status: string;
  readonly components: Record<string, ComponentStatus>;
}

/**
 * HealthController - composite health for kol-calls-publisher (P51).
 *
 * `components` carries `kol-calls` (upstream HTTP reachability, static
 * up until the deep probe lands) + `database` (in-memory repos until
 * the persistence todo) + one entry per moved module (scoring,
 * templates, approval, publishing via their P21 hook-point indicators)
 * + `target` (unified delivery surface, threads-publisher todo 10).
 * Shape stays backward compatible: `{ status: 'ok' }` still matches.
 */
@Controller('api/health')
export class HealthController {
  @Get()
  getHealth(): CompositeHealth {
    const scoring = new ScoringHealthIndicator().check();
    const templates = new TemplatesHealthIndicator().check();
    const approval = new ApprovalHealthIndicator().check();
    const publishing = new TelegramHealthIndicator().check();
    const target = new TargetHealthIndicator().check();
    const kolCalls = new KolCallsHealthIndicator().check();
    return {
      status: 'ok',
      components: {
        'kol-calls': { status: kolCalls.status, detail: kolCalls.detail },
        database: {
          status: 'up',
          detail:
            'in-memory repos (TypeORM entity + migration land with persistence todo)',
        },
        scoring: { status: scoring.status },
        templates: { status: templates.status },
        approval: { status: approval.status },
        publishing: { status: publishing.status },
        target: { status: target.status },
      },
    };
  }
}
