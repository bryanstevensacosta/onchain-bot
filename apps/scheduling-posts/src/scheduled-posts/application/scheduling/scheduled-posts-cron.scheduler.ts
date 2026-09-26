import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { FireDuePostsUseCase } from '../use-cases/fire-due-posts.use-case';

/**
 * Contract fire tick (1 min): due once/cron posts → per-target
 * delay/cap enforcement → gateway dispatch. Overlap-guarded (a slow
 * tick never stacks). Runs only when `SCHEDULING_POSTS_ENABLED=true`
 * AND `SCHEDULING_CRON_ENABLED=true` (safe default: enabled flag
 * off, cron flag on).
 */
@Injectable()
export class ScheduledPostsCronScheduler {
  private readonly logger = new Logger(ScheduledPostsCronScheduler.name);
  private running = false;

  public constructor(
    private readonly fire: FireDuePostsUseCase,
    private readonly config: ConfigService,
  ) {}

  @Cron('*/1 * * * *')
  public async tick(): Promise<void> {
    if (!this.isEnabled()) return;
    if (this.running) {
      this.logger.warn('scheduled-posts tick skipped: previous tick still running');
      return;
    }
    this.running = true;
    try {
      const fired = await this.fire.fireDue(new Date());
      if (fired.length > 0) {
        this.logger.log(`scheduled-posts tick fired ${fired.length}`);
      }
    } catch (err) {
      this.logger.error(
        `scheduled-posts tick failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.running = false;
    }
  }

  private isEnabled(): boolean {
    const enabled = (this.config.get<string>('SCHEDULING_POSTS_ENABLED', 'false') ?? 'false')
      .toLowerCase() === 'true';
    const cron = (this.config.get<string>('SCHEDULING_CRON_ENABLED', 'true') ?? 'true')
      .toLowerCase() !== 'false';
    return enabled && cron;
  }
}
