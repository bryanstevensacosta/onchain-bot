export interface TrackedCallView {
  id: string;
  kolId: string;
  chain: string;
  address: string;
  ticker: string | null;
  mcAtPublish: number;
  mcNow: number | null;
  milestonesHit: ReadonlyArray<number>;
  maxMilestone: number | null;
  priceDropPercent: number | null;
  publishedAt: string;
  lastUpdatedAt: string;
  isActive: boolean;
}

export interface GateAllowView {
  allowed: boolean;
  reasons: ReadonlyArray<string>;
}

export const TrackedCallMapper = {
  toView(record: {
    id?: string;
    kolId: string;
    chain: string;
    address: string;
    ticker: string | null;
    mcAtPublish: number;
    mcNow: number | null;
    milestonesHit: ReadonlyArray<number>;
    maxMilestone: number | null;
    priceDropPercent: number | null;
    publishedAt: Date;
    lastUpdatedAt: Date;
    isActive: boolean;
  }): TrackedCallView {
    return {
      id: record.id ?? `${record.chain}:${record.address}`,
      kolId: record.kolId,
      chain: record.chain,
      address: record.address,
      ticker: record.ticker,
      mcAtPublish: record.mcAtPublish,
      mcNow: record.mcNow,
      milestonesHit: [...record.milestonesHit],
      maxMilestone: record.maxMilestone,
      priceDropPercent: record.priceDropPercent,
      publishedAt: record.publishedAt.toISOString(),
      lastUpdatedAt: record.lastUpdatedAt.toISOString(),
      isActive: record.isActive,
    };
  },
};
