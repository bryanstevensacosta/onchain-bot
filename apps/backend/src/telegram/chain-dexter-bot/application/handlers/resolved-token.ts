import type { ChainId } from '../../infrastructure/telegram/trade-button-registry';

export type ChainIdentifier = ChainId | 'unknown';

export interface ResolvedToken {
  readonly address: string;
  readonly chain: ChainIdentifier;
  readonly symbol: string;
  readonly name: string;
  readonly marketCapUsd: number | null;
  readonly fdvUsd: number | null;
  readonly priceUsd: number | null;
  readonly priceChange24h: number | null;
  readonly liquidityUsd: number | null;
  readonly lockedLiquidityPercent: number | null;
  readonly burnedPercent: number | null;
  readonly volume24hUsd: number | null;
  readonly holders: number | null;
  readonly top10HolderPercent: number | null;
  readonly top20HolderPercent: number | null;
  readonly poolAddress: string | null;
  readonly source: 'token-scan-service';
}

export interface ScanPipeline {
  resolve(address: string): Promise<ResolvedToken | null>;
}
