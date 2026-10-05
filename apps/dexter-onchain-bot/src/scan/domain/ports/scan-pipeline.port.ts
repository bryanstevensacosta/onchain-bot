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

/**
 * A non-picked chain where the same address also resolved (dexter
 * best-pick, plan todo 17). Carried on every multi-chain `ResolvedToken`
 * so the choice is always disclosed (`{{alternatives}}` renders it).
 * NEVER includes the picked chain itself; ordered by the same
 * pick rule (liquidity desc, FDV desc, first-seen).
 */
export interface TokenAlternative {
  readonly chain: string;
  readonly address: string;
  readonly liquidityUsd: number | null;
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
  /**
   * Other chains where the same address resolved (dexter best-pick,
   * plan todo 17): present (possibly empty) on bare-sweep resolutions,
   * absent on explicit `chain:address` resolutions. The renderer
   * surfaces it as `{{alternatives}}` — a resolved token is never
   * returned without its disclosure list.
   */
  readonly alternatives?: ReadonlyArray<TokenAlternative>;
}

export interface ScanPipeline {
  resolve(address: string): Promise<ResolvedToken | null>;
}

export const SCAN_PIPELINE = Symbol('SCAN_PIPELINE');
