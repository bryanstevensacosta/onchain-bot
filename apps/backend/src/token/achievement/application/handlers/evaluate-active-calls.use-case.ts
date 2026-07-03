import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MonitoredCallRecord,
  MonitoredCallRepository,
} from '../ports/monitored-call.repository';
import { AchievementThresholdRepository } from '../ports/achievement-threshold.repository';
import { LiveMarketDataPort } from '../ports/live-market-data.port';
import { AchievementCachePort } from '../ports/achievement-cache.port';
import { DetectCrossedAchievementsService } from '../services/detect-crossed-achievements.service';
import { RecordNotifiedAchievementUseCase } from './record-notified-achievement.use-case';
import type { AppConfig } from 'shared/common/config/app.config';

export interface EvaluateActiveCallsResult {
  evaluated: number;
  notified: number;
  skipped: number;
}

@Injectable()
export class EvaluateActiveCallsUseCase {
  private readonly logger = new Logger(EvaluateActiveCallsUseCase.name);

  constructor(
    private readonly monitoredRepo: MonitoredCallRepository,
    private readonly thresholdRepo: AchievementThresholdRepository,
    private readonly liveMarketData: LiveMarketDataPort,
    private readonly cache: AchievementCachePort,
    private readonly detector: DetectCrossedAchievementsService,
    private readonly recordUseCase: RecordNotifiedAchievementUseCase,
    private readonly config: ConfigService,
  ) {}

  async execute(
    input: { batchSize?: number } = {},
  ): Promise<EvaluateActiveCallsResult> {
    const activeHours =
      this.config.get<AppConfig>('app')?.milestone.activeWindowHours ?? 72;
    const maxAgeMs = activeHours * 3600 * 1000;
    const batchSize = input.batchSize ?? 30;

    const activeCalls = await this.monitoredRepo.findActive(
      maxAgeMs,
      batchSize,
    );
    if (activeCalls.length === 0) {
      return { evaluated: 0, notified: 0, skipped: 0 };
    }

    const enabledThresholds = (await this.thresholdRepo.findEnabled()).map(
      (t) => ({ multiple: t.multiple }),
    );
    const mcMap = await this.liveMarketData.fetchCurrentMcBatch(
      activeCalls.map((c) => ({ chain: c.chain, address: c.address })),
    );

    let notified = 0;
    let skipped = 0;

    for (const call of activeCalls) {
      const mcNow =
        mcMap.get(`${call.chain}:${call.address.toLowerCase()}`) ?? null;
      const now = new Date();

      if (mcNow === null || mcNow <= 0 || call.mcAtCall <= 0) {
        if (call.id) await this.monitoredRepo.updateLastEvaluated(call.id, now);
        skipped++;
        continue;
      }

      const athMultiple = mcNow / call.mcAtCall;
      const alreadyNotified = await this.cache.getNotifiedThresholds(
        call.callId,
      );

      const { crossed } = this.detector.detect({
        athMultiple,
        enabledThresholds,
        alreadyNotified,
      });

      for (const c of crossed) {
        await this.recordUseCase.execute({
          monitoredCall: call,
          threshold: c.multiple,
          currentMc: mcNow,
        });
        notified++;
      }

      if (call.id) await this.monitoredRepo.updateLastEvaluated(call.id, now);
      if (this.isStale(call, now, activeHours)) {
        if (call.id) await this.monitoredRepo.deactivate(call.id);
      }
    }

    this.logger.log(
      `Evaluated batch: ${activeCalls.length} calls → notified=${notified} skipped=${skipped}`,
    );
    return { evaluated: activeCalls.length, notified, skipped };
  }

  private isStale(
    call: MonitoredCallRecord,
    now: Date,
    activeHours: number,
  ): boolean {
    const ageMs = now.getTime() - call.publishedAt.getTime();
    return ageMs > activeHours * 3600 * 1000;
  }
}
