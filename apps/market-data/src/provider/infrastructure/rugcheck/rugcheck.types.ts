export interface RugCheckSummary {
  readonly tokenProgram: string;
  readonly tokenType: string;
  readonly risks: ReadonlyArray<unknown>;
  readonly lockedLiquidity: ReadonlyArray<{
    readonly amount: number;
    readonly percent: number;
    readonly tokenAddress: string;
  }>;
  readonly totalMarketLiquidity: number | null;
  readonly totalLPProviders: number | null;
  readonly totalSupply: number | null;
  readonly burnedPercent: number | null;
}

/**
 * One `GET /v1/search` row (live shape verified 2026-10-09, todo 31:
 * `{ mint, name, symbol, verified, score, mcap, holders }`, ranked
 * legit-first). All fields optional-tolerant: the fetcher matches on
 * `mint` only and reads `holders`/`mcap` when present.
 */
export interface RugCheckSearchRow {
  readonly mint?: string | null;
  readonly name?: string | null;
  readonly symbol?: string | null;
  readonly verified?: boolean | null;
  readonly score?: number | null;
  readonly mcap?: number | null;
  readonly holders?: number | null;
}

/**
 * One `GET /v1/stats/new_tokens` row (live shape verified 2026-10-09,
 * todo 31: `{ mint, symbol, creator, mintAuthority, freezeAuthority,
 * program, createAt, ... }`). Discovery-feed input for pre-warm —
 * never called per-snapshot.
 */
export interface RugCheckNewToken {
  readonly mint?: string | null;
  readonly symbol?: string | null;
  readonly creator?: string | null;
  readonly mintAuthority?: string | null;
  readonly freezeAuthority?: string | null;
  readonly program?: string | null;
  readonly createAt?: string | null;
}
