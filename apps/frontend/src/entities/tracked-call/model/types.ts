import type { Chain } from '@/shared/realtime/events';

export interface TrackedCallView {
  id: string;
  kolId: string;
  chain: Chain;
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
