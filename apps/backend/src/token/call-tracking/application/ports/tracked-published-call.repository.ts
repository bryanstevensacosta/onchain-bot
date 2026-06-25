export interface TrackedPublishedCallRecord {
  readonly id: string;
  readonly kolId: string;
  readonly chain: string;
  readonly address: string;
  readonly ticker: string | null;
  readonly mcAtPublish: number;
  readonly mcNow: number | null;
  readonly milestonesHit: ReadonlyArray<number>;
  readonly maxMilestone: number | null;
  readonly priceDropPercent: number | null;
  readonly publishedAt: Date;
  readonly lastUpdatedAt: Date;
  readonly isActive: boolean;
}

export interface FindTrackedCallsFilters {
  readonly minMilestone?: number;
  readonly maxPriceDropPercent?: number;
  readonly hasMilestones?: boolean;
  readonly activeOnly?: boolean;
  readonly limit?: number;
}

export abstract class TrackedPublishedCallRepository {
  abstract findByChainAndAddress(
    chain: string,
    address: string,
  ): Promise<TrackedPublishedCallRecord | null>;

  abstract findActive(
    limit: number,
  ): Promise<ReadonlyArray<TrackedPublishedCallRecord>>;

  abstract findMany(
    filters: FindTrackedCallsFilters,
  ): Promise<ReadonlyArray<TrackedPublishedCallRecord>>;

  abstract save(
    record: TrackedPublishedCallRecord,
  ): Promise<TrackedPublishedCallRecord>;
}
