import type { Chain } from '@/shared/realtime/events';

export interface TokenSnapshotView {
  id: string;
  chain: Chain;
  address: string;
  priceUsd: number | null;
  liquidityUsd: number | null;
  fdvUsd: number | null;
  marketCapUsd: number | null;
  holders: number | null;
  volume24hUsd: number | null;
  priceChange24h: number | null;
  top10HolderPercent: number | null;
  symbol: string | null;
  name: string | null;
  imageUrls: ReadonlyArray<string>;
  lockedLiquidityPercent: number | null;
  burnedPercent: number | null;
  hasRugcheckData: boolean;
  primaryPair: {
    address: string;
    dexId: string;
    quoteToken: string;
    reserveUsd: number;
  } | null;
  pairCount: number;
  sources: ReadonlyArray<string>;
  completeness: number;
  enrichedAt: string;
}
