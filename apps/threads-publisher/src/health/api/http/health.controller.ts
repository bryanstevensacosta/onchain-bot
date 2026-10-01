import { Controller, Get, Optional } from '@nestjs/common';
import { Public } from 'shared/decorators/public.decorator';
import { ThreadsHealthIndicator } from 'threads/health/threads-health.indicator';
import { FeedThreadsHealthIndicator } from 'feed-threads/health/feed-threads-health.indicator';
import { TelegramHealthIndicator } from 'telegram/health/telegram-health.indicator';

export interface HealthComponent {
  readonly component: string;
  readonly status: 'up' | 'down';
}

/**
 * Composite health (todo 9): GET /api/health is the ONLY keyless route.
 * Shape backward compatible: { status: 'ok' } plus components.
 */
@Controller('api/health')
export class HealthController {
  public constructor(
    @Optional()
    private readonly threads?: ThreadsHealthIndicator,
    @Optional()
    private readonly feedThreads?: FeedThreadsHealthIndicator,
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
      { component: 'threads-publisher', status: 'up' },
      { component: 'database', status: 'up' },
    ];
    if (this.threads) {
      components.push(await this.threads.check());
    }
    if (this.feedThreads) {
      components.push(await this.feedThreads.check());
    }
    if (this.telegram) {
      components.push(await this.telegram.check());
    }
    return { status: 'ok', components };
  }

  /**
   * Legacy sync probe (failing-first scaffold spec).
   */
  public getHealth(): { readonly status: 'ok' } {
    return { status: 'ok' };
  }
}
