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

export interface DevWalletView {
  readonly wallet: string;
  readonly holdAmount: number | null;
  readonly percentOfSupply: number | null;
  readonly pnlUsd: number | null;
  readonly tag: string | null;
  readonly probable?: boolean;
}

/**
 * Origin launchpad of a token (dexter-launchpad, Lane R). Produced by
 * the market-data detector (Lane D); the renderer only consumes it.
 * `null` = no launchpad detected (team launch) — all four derived
 * keys render `""`. Canonical URL form: `pump.fun/coin/<mint>`.
 */
export interface LaunchpadInfo {
  readonly id: string;
  readonly name: string;
  readonly url: string;
}

/**
 * DEX venue of the best-liquidity pair (dexter venue-line, plan
 * todo 14). Produced by market-data from the dexscreener best pair;
 * the renderer only consumes it. `null` = no pair known — the tech
 * side of every venue key renders `""`.
 */
export interface VenueInfo {
  readonly dexId: string;
  readonly labels: ReadonlyArray<string>;
}

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
  readonly totalSupply: number | null;
  readonly circulatingSupply: number | null;
  readonly maxSupply: number | null;
  readonly devWallets: ReadonlyArray<DevWalletView> | null;
  readonly devPctSupply: number | null;
  readonly poolAddress: string | null;
  readonly source: 'market-data-http';
  readonly launchpad?: LaunchpadInfo | null;
  readonly venue?: VenueInfo | null;
  /**
   * FDV ATH over the token's own snapshot history (dexter fdv-ath,
   * plan todo 16): max FDV + ISO timestamp of the setting row.
   * Both `null` on cold-start — the current FDV is NEVER
   * substituted (spec-pinned). Capped by the market-data janitor
   * window (90d, surviving rows only — not all time).
   */
  readonly fdvAthUsd?: number | null;
  readonly fdvAthAt?: string | null;
}

export interface ScanPipeline {
  resolve(address: string): Promise<ResolvedToken | null>;
}

export const SCAN_PIPELINE = Symbol('SCAN_PIPELINE');
