import type { Chain } from '@/shared/realtime/events';

export interface SourceView {
  readonly kolId: string;
  readonly username: string | null;
  readonly mentionCount: number;
  readonly messageIds: ReadonlyArray<number>;
}

export interface CanonicalTokenCallView {
  id: string;
  chain: Chain;
  address: string;
  ticker: string | null;
  name: string | null;
  chart: string | null;
  metrics: {
    marketCapUsd: number | null;
    liquidityUsd: number | null;
    fdvUsd: number | null;
    holders: number | null;
  };
  sources: ReadonlyArray<SourceView>;
  sourceCount: number;
  mentionCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  confidence: number;
}
