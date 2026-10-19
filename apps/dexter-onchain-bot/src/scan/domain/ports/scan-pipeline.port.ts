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
  | 'robinhood'
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
 * Honey-tax / simulation reading of the best pair (dexter 🍯 row,
 * plan todo 71). Produced by market-data (taxes as PERCENT 0-100,
 * `sim` the simulation verdict: `'ok'` = round trip measured,
 * `'fail'` = simulation failed/blocked, `null` = external-source
 * reading with NO simulation behind it). `null`/absent = no source
 * for the chain / not a token / older answers — the renderer
 * silences the whole row. Validated at both boundaries
 * (`toHoneypotOrNull` in the client AND the pipeline — same
 * double-validation as `launchpad`/`venue`).
 */
export interface HoneypotInfo {
  readonly buy: number | null;
  readonly sell: number | null;
  readonly sim: 'ok' | 'fail' | null;
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
   * Honey-tax / simulation reading (dexter 🍯 row, plan todo 71):
   * `{ buy, sell, sim }` (% 0-100) re-validated from the snapshot
   * (`null` when the snapshot carries none or the shape is
   * malformed — the renderer silences the row, never a partial).
   */
  readonly honeypot?: HoneypotInfo | null;
  /**
   * Best-pair creation ISO (dexter `{{age}}`, plan todo 63): the
   * best-liquidity PAIR creation time from the market-data snapshot.
   * `null`/absent when market-data lacks it (cold-start) — the
   * renderer renders `""`, never a guessed age. PAIR proxy, NEVER
   * token deploy age: a migration under-reports (documented caveat).
   */
  readonly pairCreatedAt?: string | null;
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
   * Serve-stale marker (dexter plan todo 19b1): `true` ONLY when
   * market-data replayed its newest ready row (live fan-out failed).
   * Always set by the pipeline (explicit `false` on fresh) so the
   * bit is spec-assertable at every boundary; optional only so older
   * literals keep compiling. `staleAsOf` (history-row ISO) +
   * `staleAgeMs` (>= 0) ride with it, both `null` on fresh.
   */
  readonly stale?: boolean | null;
  readonly staleAsOf?: string | null;
  readonly staleAgeMs?: number | null;
  /**
   * Tail-degraded marker (dexter plan todo 41b, ONE decision pinned):
   * `true` when market-data served the card WITHOUT one or more tail
   * extras (launchpad/venue/dev timed out or skipped) — numbers stay
   * honest, the missing fields render N/A. Always set by the pipeline
   * (explicit `false` on full cards); optional only so older literals
   * keep compiling. Preview, bot and frontend inherit it through the
   * token object, same path as the stale trio.
   */
  readonly degraded?: boolean | null;
  /**
   * Identity provenance (dexter plan todo 39): `'market'` (providers
   * / discovery pair side) or `'metadata'` (on-chain Metaplex PDA as
   * last resort). ALWAYS set by the pipeline (`'market'` default
   * when market-data stays silent — legacy answers predate the
   * field); optional only so older literals keep compiling. The
   * renderer marks `metadata` names with `(unverified)` — preview,
   * bot and frontend inherit it through the rendered text, no extra
   * code on any surface.
   */
  readonly identityProvenance?: 'market' | 'metadata';
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
