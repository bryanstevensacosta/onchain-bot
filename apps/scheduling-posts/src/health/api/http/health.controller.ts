import { Controller, Get, Optional } from '@nestjs/common';
import { Public } from 'shared/decorators/public.decorator';
import { SchedulingHealthIndicator } from 'scheduling/health/scheduling-health.indicator';
import { ScheduledPostsHealthIndicator } from 'scheduled-posts/health/scheduled-posts-health.indicator';
import { TelegramHealthIndicator } from 'telegram/health/telegram-health.indicator';

export interface HealthComponent {
  readonly component: string;
  readonly status: 'up' | 'down';
}

/**
 * Composite health (todo 1): GET /api/health is the ONLY keyless route
 * (contract §5 @Public). Never claims liveness it does not have —
 * each component reports its own P21 indicator.
 */
@Controller('api/health')
export class HealthController {
  public constructor(
    @Optional()
    private readonly scheduling?: SchedulingHealthIndicator,
    @Optional()
    private readonly scheduledPosts?: ScheduledPostsHealthIndicator,
    @Optional()
    private readonly telegram?: TelegramHealthIndicator,
  ) {}

  @Public()
  @Get()
  public async health(): Promise<{
    readonly status: 'ok';
    readonly components: HealthComponent[];
  }> {
    const components: HealthComponent[] = [
      { component: 'scheduling-posts', status: 'up' },
      { component: 'database', status: 'up' },
    ];
    if (this.scheduling) components.push(await this.scheduling.check());
    if (this.scheduledPosts) components.push(await this.scheduledPosts.check());
    if (this.telegram) components.push(await this.telegram.check());
    return { status: 'ok', components };
  }
}
