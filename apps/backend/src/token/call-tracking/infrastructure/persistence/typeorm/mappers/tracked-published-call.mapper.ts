import { TrackedPublishedCall } from 'token/call-tracking/domain/entities/tracked-published-call.entity';
import { TrackedPublishedCallRecord } from 'token/call-tracking/application/ports/tracked-published-call.repository';
import { TrackedPublishedCallOrmEntity } from '../entities/tracked-published-call.entity';

export const TrackedPublishedCallMapper = {
  toRecord(row: TrackedPublishedCallOrmEntity): TrackedPublishedCallRecord {
    return {
      id: `${row.chain}:${row.address}`,
      kolId: row.kolId,
      chain: row.chain,
      address: row.address,
      ticker: row.ticker,
      mcAtPublish: row.mcAtPublish,
      mcNow: row.mcNow,
      milestonesHit: Array.isArray(row.milestonesHit)
        ? [...row.milestonesHit]
        : [],
      maxMilestone: row.maxMilestone,
      priceDropPercent: row.priceDropPercent,
      publishedAt: row.publishedAt,
      lastUpdatedAt: row.lastUpdatedAt,
      isActive: row.isActive,
    };
  },

  toDomain(row: TrackedPublishedCallOrmEntity): TrackedPublishedCall {
    return TrackedPublishedCall.rehydrate({
      kolId: row.kolId,
      chain: row.chain,
      address: row.address,
      ticker: row.ticker,
      mcAtPublish: row.mcAtPublish,
      mcNow: row.mcNow,
      milestonesHit: Array.isArray(row.milestonesHit)
        ? [...row.milestonesHit]
        : [],
      maxMilestone: row.maxMilestone,
      priceDropPercent: row.priceDropPercent,
      publishedAt: row.publishedAt,
      lastUpdatedAt: row.lastUpdatedAt,
      isActive: row.isActive,
    });
  },

  fromAggregate(agg: TrackedPublishedCall): TrackedPublishedCallOrmEntity {
    const row = new TrackedPublishedCallOrmEntity();
    row.kolId = agg.kolId;
    row.chain = agg.chain;
    row.address = agg.address;
    row.ticker = agg.ticker;
    row.mcAtPublish = agg.mcAtPublish;
    row.mcNow = agg.mcNow;
    row.milestonesHit = [...agg.milestonesHit];
    row.maxMilestone = agg.maxMilestone;
    row.priceDropPercent = agg.priceDropPercent;
    row.publishedAt = agg.publishedAt;
    row.lastUpdatedAt = agg.lastUpdatedAt;
    row.isActive = agg.isActive;
    return row;
  },

  fromRecord(
    record: TrackedPublishedCallRecord,
  ): TrackedPublishedCallOrmEntity {
    const row = new TrackedPublishedCallOrmEntity();
    row.id = record.id;
    row.kolId = record.kolId;
    row.chain = record.chain;
    row.address = record.address;
    row.ticker = record.ticker;
    row.mcAtPublish = record.mcAtPublish;
    row.mcNow = record.mcNow;
    row.milestonesHit = [...record.milestonesHit];
    row.maxMilestone = record.maxMilestone;
    row.priceDropPercent = record.priceDropPercent;
    row.publishedAt = record.publishedAt;
    row.lastUpdatedAt = record.lastUpdatedAt;
    row.isActive = record.isActive;
    return row;
  },
};
