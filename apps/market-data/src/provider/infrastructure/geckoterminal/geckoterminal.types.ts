export interface GeckoTerminalAttributes {
  readonly address: string;
  readonly name: string;
  readonly symbol: string;
  readonly total_supply: string | null;
  readonly decimals: number | null;
  readonly holders: { readonly count: number } | null;
  readonly top_10_percent_holders: string | null;
  readonly gt_score: number | null;
  readonly price_usd: string | null;
  readonly fdv_usd: string | null;
  readonly market_cap_usd: string | null;
  readonly volume_usd: { readonly h24: string | null } | null;
  readonly price_change_percentage: { readonly h24: string | null } | null;
}

export interface GeckoTerminalTokenData {
  readonly id: string;
  readonly type: string;
  readonly attributes: GeckoTerminalAttributes;
}

export interface GeckoTerminalResponse {
  readonly data: GeckoTerminalTokenData;
}

export interface GeckoTerminalTokenInfo {
  readonly address: string;
  readonly name: string | null;
  readonly symbol: string | null;
  readonly totalSupply: string | null;
  readonly decimals: number | null;
  readonly holders: number | null;
  readonly top10HolderPercent: number | null;
  readonly gtScore: number | null;
  readonly priceUsd: number | null;
  readonly fdvUsd: number | null;
  readonly marketCapUsd: number | null;
  readonly volumeUsdH24: number | null;
  readonly priceChangePercentH24: number | null;
}

/**
 * Pool attributes we read (dexter plan todo 25 — pool-by-address
 * resolution for chains where token `/info` carries no price/FDV,
 * e.g. robinhood STAGEVEIL: info returns identity + holders with
 * null price/fdv while the pool carries `fdv_usd: 3471.76`).
 */
export interface GeckoTerminalPoolAttributes {
  readonly address: string;
  readonly base_token_price_usd: string | null;
  readonly quote_token_price_usd: string | null;
  readonly fdv_usd: string | null;
  readonly reserve_in_usd: string | null;
}

export interface GeckoTerminalPoolTokenRef {
  readonly data?: { readonly id?: string } | null;
}

export interface GeckoTerminalPoolDexRef {
  readonly data?: { readonly id?: string; readonly type?: string } | null;
}

export interface GeckoTerminalPoolResource {
  readonly id: string;
  readonly type: string;
  readonly attributes: GeckoTerminalPoolAttributes;
  readonly relationships?: {
    readonly base_token?: GeckoTerminalPoolTokenRef | null;
    readonly quote_token?: GeckoTerminalPoolTokenRef | null;
    /**
     * Venue source (dexter plan todo 26): the pool's DEX, e.g.
     * `{ id: 'pons-v2-dex', type: 'dex' }` on STAGEVEIL's
     * `robinhood_0x9269…` pool (verified live 2026-10-06). Present
     * on the default pools response — no `?include=dex` needed
     * (that only adds human names under top-level `included`).
     */
    readonly dex?: GeckoTerminalPoolDexRef | null;
  } | null;
}

export interface GeckoTerminalPoolsResponse {
  readonly data: ReadonlyArray<GeckoTerminalPoolResource>;
}

/** Side-aware pool pick: numbers only, nulls where the side forbids. */
export interface GeckoPoolQuote {
  readonly fdvUsd: number | null;
  readonly priceUsd: number | null;
  /**
   * Venue source (dexter plan todo 26): `relationships.dex.data.id`
   * of the picked pool (e.g. `'pons-v2-dex'`), or null when the
   * pool carries no dex relationship. Passes through verbatim —
   * dexter's display table capitalizes unknown ids.
   */
  readonly dexId: string | null;
}
