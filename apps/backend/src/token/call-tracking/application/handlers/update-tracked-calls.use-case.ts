import { Injectable, Logger } from '@nestjs/common';
import { TrackedPublishedCallRepository } from '../ports/tracked-published-call.repository';
import { LiveMarketDataPort } from 'token/milestone/application/ports/live-market-data.port';
import { MilestoneThresholdRepository } from 'token/milestone/application/ports/milestone-threshold.repository';
import { MilestoneCachePort } from 'token/milestone/application/ports/milestone-cache.port';
import { TrackedPublishedCall } from '../../domain/entities/tracked-published-call.entity';

export interface UpdateTrackedCallsResult {
  readonly evaluated: number;
  readonly updated: number;
  readonly skipped: number;
}

@Injectable()
export class UpdateTrackedCallsUseCase {
  private readonly logger = new Logger(UpdateTrackedCallsUseCase.name);

  constructor(
    private readonly trackedRepo: TrackedPublishedCallRepository,
    private readonly liveMarketData: LiveMarketDataPort,
    private readonly thresholdRepo: MilestoneThresholdRepository,
    private readonly cache: MilestoneCachePort,
  ) {}

  async execute(
    input: { batchSize?: number } = {},
  ): Promise<UpdateTrackedCallsResult> {
    const batchSize = input.batchSize ?? 30;
    const active = await this.trackedRepo.findActive(batchSize);
    if (active.length === 0) {
      return { evaluated: 0, updated: 0, skipped: 0 };
    }

    const enabledThresholds = await this.thresholdRepo.findEnabled();
    const enabledMultiples = enabledThresholds
      .map((t) => t.multiple)
      .filter((m) => Number.isFinite(m) && m > 1);

    const mcMap = await this.liveMarketData.fetchCurrentMcBatch(
      active.map((c) => ({ chain: c.chain, address: c.address })),
    );

    let updated = 0;
    let skipped = 0;
    const now = new Date();

    for (const record of active) {
      const trackedId = `${record.chain}:${record.address}`;
      const mcNow =
        mcMap.get(`${record.chain}:${record.address.toLowerCase()}`) ?? null;

      if (mcNow === null || mcNow <= 0 || record.mcAtPublish <= 0) {
        skipped++;
        continue;
      }

      const cacheSet = await this.cache.getNotifiedThresholds(trackedId);
      const athMultiple = mcNow / record.mcAtPublish;
      const milestonesHit = enabledMultiples.filter(
        (m) => athMultiple >= m && !cacheSet.has(m),
      );

      const tracked = TrackedPublishedCall.rehydrate({
        kolId: record.kolId,
        chain: record.chain,
        address: record.address,
        ticker: record.ticker,
        mcAtPublish: record.mcAtPublish,
        mcNow: null,
        milestonesHit: record.milestonesHit,
        maxMilestone: record.maxMilestone,
        priceDropPercent: record.priceDropPercent,
        publishedAt: record.publishedAt,
        lastUpdatedAt: record.lastUpdatedAt,
        isActive: record.isActive,
      });
      tracked.applyTrackingSnapshot({ mcNow, milestonesHit, at: now });
      await this.trackedRepo.save({
        id: tracked.id,
        kolId: tracked.kolId,
        chain: tracked.chain,
        address: tracked.address,
        ticker: tracked.ticker,
        mcAtPublish: tracked.mcAtPublish,
        mcNow: tracked.mcNow,
        milestonesHit: tracked.milestonesHit,
        maxMilestone: tracked.maxMilestone,
        priceDropPercent: tracked.priceDropPercent,
        publishedAt: tracked.publishedAt,
        lastUpdatedAt: tracked.lastUpdatedAt,
        isActive: tracked.isActive,
      });
      updated++;
    }

    this.logger.log(
      `UpdateTrackedCalls: evaluated=${active.length} updated=${updated} skipped=${skipped}`,
    );
    return { evaluated: active.length, updated, skipped };
  }
}
