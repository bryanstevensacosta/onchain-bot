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
