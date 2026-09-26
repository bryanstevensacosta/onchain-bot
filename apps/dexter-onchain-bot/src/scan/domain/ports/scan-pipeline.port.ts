/**
 * Scan pipeline port (Tramo 3, todo 13 — hexagonal split).
 *
 * Domain contract for token resolution: handlers and the HTTP lookup
 * surface depend on this port, never on the pipeline implementation or
 * on market-data HTTP directly. Lookup-only: resolution answers user
 * lookups; it never publishes anywhere.
 */

export type ChainIdentifier =
  | 'solana'
  | 'ethereum'
  | 'base'
  | 'bsc'
  | 'ton'
  | 'fantom'
  | 'avalanche'
  | 'arbitrum'
  | 'polygon'
  | 'unknown';

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
  readonly source: 'market-data-http';
}

export interface ScanPipeline {
  resolve(address: string): Promise<ResolvedToken | null>;
}

export const SCAN_PIPELINE = Symbol('SCAN_PIPELINE');
