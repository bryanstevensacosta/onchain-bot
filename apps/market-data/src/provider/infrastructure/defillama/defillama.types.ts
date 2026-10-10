/**
 * DeFiLlama Coins API shapes (dexter plan todo 32).
 *
 * `GET /prices/current/{coins}` answers `{ coins: { "<chain>:<addr>":
 * { decimals, symbol, price, timestamp, confidence } } }` — price +
 * decimals + timestamp + confidence ONLY (no mcap/fdv/liquidity, ever).
 * `GET /chart/{coins}[?start=]` answers the same envelope with a
 * coarse `prices[]` series instead of a single price.
 *
 * Live shapes verified keyless 2026-10-09 (evidence
 * `.omo/evidence/task-fe-newprov.log`).
 */
export interface DefiLlamaCoinPrice {
  readonly decimals?: number;
  readonly symbol?: string;
  readonly price?: number;
  readonly timestamp?: number;
  /** Oracle-agreement score 0..1 (probes: 0.99 on every hit). */
  readonly confidence?: number;
}

export interface DefiLlamaPricesResponse {
  readonly coins?: Readonly<Record<string, DefiLlamaCoinPrice | null>>;
}

export interface DefiLlamaChartPoint {
  readonly timestamp: number;
  readonly price: number;
}

export interface DefiLlamaChartCoin {
  readonly symbol?: string;
  readonly confidence?: number;
  readonly decimals?: number;
  readonly prices?: ReadonlyArray<DefiLlamaChartPoint>;
}

export interface DefiLlamaChartResponse {
  readonly coins?: Readonly<Record<string, DefiLlamaChartCoin | null>>;
}

/** Client-side max over a chart series (ATH-ish, see service note). */
export interface DefiLlamaChartMax {
  readonly maxPrice: number;
  /** ISO timestamp of the max point. */
  readonly at: string;
}
