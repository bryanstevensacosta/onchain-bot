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
