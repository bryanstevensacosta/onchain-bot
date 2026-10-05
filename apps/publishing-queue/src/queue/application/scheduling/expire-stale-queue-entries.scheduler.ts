import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { CronJob } from 'cron';
import { QueueManager } from '../services/queue-manager.service';

/**
 * TTL janitor: entries stuck PENDING/SCHEDULED past `QUEUE_TTL_HOURS`
 * (default 24, mirrors the backend 24h threshold) are FAILED with an
 * expiry reason. Runs every 30 minutes (mirrors the backend `*\/30`
 * cadence). Idempotent: FAILED rows are never re-touched.
 */
@Injectable()
export class ExpireStaleQueueEntriesScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(ExpireStaleQueueEntriesScheduler.name);

  public constructor(
    private readonly manager: QueueManager,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly config: ConfigService,
  ) {}

  private ttlMs(): number {
    const raw = Number(this.config.get<string>('QUEUE_TTL_HOURS', '24'));
    const hours = Number.isFinite(raw) && raw > 0 ? raw : 24;
    return hours * 60 * 60 * 1000;
  }

  public async onApplicationBootstrap(): Promise<void> {
    const job = new CronJob('*/30 * * * *', () => void this.tick());
    this.schedulerRegistry.addCronJob('feed-publisher-queue-ttl', job);
    job.start();
    this.logger.log(
      'ExpireStaleQueueEntriesScheduler ready (every 30 minutes)',
    );
  }

  public async tick(): Promise<void> {
    try {
      const expired = await this.manager.expireOlderThan(
        this.ttlMs(),
        'Expired: exceeded queue TTL without publishing',
      );
      if (expired > 0) {
        this.logger.log(`Expired ${expired} stale queue entries`);
      }
    } catch (error) {
      this.logger.error(
        `Queue TTL tick failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }
}
