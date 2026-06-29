import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { KolRepository } from 'kol/identity/application/ports/kol.repository';
import { RecomputeKolReputationUseCase } from '../../application/handlers/recompute-kol-reputation.use-case';
import type { AppConfig } from 'shared/common/config/app.config';

const CRON_NAME = 'kol-reputation-scheduler';

@Injectable()
export class KolReputationScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(KolReputationScheduler.name);
  private running = false;

  public constructor(
    private readonly kolRepo: KolRepository,
    private readonly recompute: RecomputeKolReputationUseCase,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly config: ConfigService,
  ) {}

  public onApplicationBootstrap(): void {
    const cfg = this.config.get<AppConfig>('app')?.kolReputation;
    if (!cfg?.schedulerEnabled) {
      this.logger.log('KolReputationScheduler disabled via config');
      return;
    }

    const job = new CronJob(cfg.schedulerCron, () => {
      void this.tick();
    });

    this.schedulerRegistry.addCronJob(CRON_NAME, job);
    job.start();
    this.logger.log(
      `KolReputationScheduler started (cron=${cfg.schedulerCron})`,
    );
  }

  public async tick(): Promise<void> {
    if (this.running) {
      this.logger.warn('Previous tick still running; skipping this tick');
      return;
    }
    this.running = true;
    try {
      const kols = await this.kolRepo.findAll();
      let success = 0;
      let failed = 0;
      for (const kol of kols) {
        try {
          await this.recompute.execute({ kolId: kol.id });
          success++;
        } catch (err) {
          failed++;
          this.logger.warn(
            `Recompute failed for KOL ${kol.id}: ${(err as Error).message}`,
          );
        }
      }
      this.logger.log(
        `Tick complete: kols=${kols.length} recomputed=${success} failed=${failed}`,
      );
    } catch (err) {
      this.logger.error(
        `Tick failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    } finally {
      this.running = false;
    }
  }
}
