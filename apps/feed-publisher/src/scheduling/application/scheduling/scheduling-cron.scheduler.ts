import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { CronJob } from 'cron';
import { ScheduledAdRepository } from '../../domain/ports/scheduled-ad.repository';
import { SchedulingConfigRepository } from '../../domain/ports/scheduling-config.repository';
import { SchedulingStateRepository } from '../../domain/ports/scheduling-state.repository';
import { PublishScheduledAdUseCase } from '../use-cases/publish-scheduled-ad.use-case';
import { SchedulingHealthState } from '../state/scheduling-health.state';
import { SCHEDULING_TARGETS } from '../../domain/scheduling-target';

/**
 * Scheduling rotation scheduler: one tick per minute (todo 6).
 *
 * Mirrors the backend ads-cron (EVERY_MINUTE) minus the Postgres
 * advisory lock (single instance until GAP-3; the overlap guard
 * covers double ticks in-process). Guards, in order:
 * SCHEDULING_CRON_ENABLED env master switch, then the overlap guard.
 *
 * Each tick:
 *   1. Sweeps expired posts (disable or delete per
 *      `expirationAction`) — runs even when rotation is OFF so a post
 *      expiring while disabled is still cleaned up.
 *   2. Runs the rotation for telegram, then threads, each with its
 *      own delay wait + daily cutoff (P38 independence).
 */
@Injectable()
export class SchedulingCronScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(SchedulingCronScheduler.name);
  private isTicking = false;

  public constructor(
    private readonly publishScheduled: PublishScheduledAdUseCase,
    private readonly adRepo: ScheduledAdRepository,
    private readonly configRepo: SchedulingConfigRepository,
    private readonly stateRepo: SchedulingStateRepository,
    private readonly health: SchedulingHealthState,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly config: ConfigService,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    const job = new CronJob('* * * * *', () => void this.tick());
    this.schedulerRegistry.addCronJob('feed-scheduling-rotation', job);
    job.start();
    try {
      const cfg = await this.configRepo.load();
      this.logger.log(
        `SchedulingCronScheduler ready (every 1 minute, enabled=${cfg.enabled})`,
      );
    } catch {
      this.logger.warn(
        'SchedulingCronScheduler ready — could not load SchedulingConfig; scheduler will retry on each tick',
      );
    }
  }

  public async tick(): Promise<void> {
    if (
      this.config.get<string>('SCHEDULING_CRON_ENABLED', 'true') === 'false'
    ) {
      return;
    }
    if (this.isTicking) {
      this.logger.warn('Previous scheduling tick still running; skipping');
      return;
    }
    this.isTicking = true;
    try {
      const now = new Date();
      await this.sweepExpiredPosts(now);
      this.health.recordTick(now);
      let anyPublished = false;
      for (const target of SCHEDULING_TARGETS) {
        const published = await this.publishScheduled.execute(target, now);
        anyPublished = anyPublished || published;
      }
      if (anyPublished) {
        const state = await this.stateRepo.load();
        await this.stateRepo.save(state.resetPostsSinceLastAd());
      }
    } catch (error) {
      this.health.recordFailure((error as Error).message);
      this.logger.error(
        `Scheduling tick failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
    } finally {
      this.isTicking = false;
    }
  }

  /**
   * Housekeeping BEFORE the rotation gates: disable is the default;
   * `expirationAction === 'delete'` removes the post entirely.
   * Idempotent: a second run finds no rows.
   */
  private async sweepExpiredPosts(now: Date): Promise<void> {
    const expired = await this.adRepo.findExpired(now);
    if (expired.length === 0) {
      return;
    }
    let disabled = 0;
    let deleted = 0;
    for (const ad of expired) {
      if (ad.expirationAction === 'delete') {
        await this.adRepo.delete(ad.id);
        deleted += 1;
      } else {
        await this.adRepo.disable(ad.id);
        disabled += 1;
      }
    }
    this.logger.log(
      `scheduling sweep: ${expired.length} expired (${disabled} disabled, ${deleted} deleted)`,
    );
  }
}
