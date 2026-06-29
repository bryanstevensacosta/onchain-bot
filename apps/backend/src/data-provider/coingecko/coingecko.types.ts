export interface CoinGeckoImage {
  readonly thumb?: string | null;
  readonly small?: string | null;
  readonly large?: string | null;
}

export interface CoinGeckoMarketData {
  readonly current_price?: { readonly usd?: number | null };
  readonly market_cap?: { readonly usd?: number | null };
  readonly fully_diluted_valuation?: { readonly usd?: number | null };
  readonly total_volume?: { readonly usd?: number | null };
  readonly price_change_percentage_24h?: number | null;
}

export interface CoinGeckoResponse {
  readonly image?: CoinGeckoImage | null;
  readonly market_data?: CoinGeckoMarketData | null;
}

export interface CoinGeckoTokenInfo {
  readonly priceUsd: number | null;
  readonly marketCapUsd: number | null;
  readonly fdvUsd: number | null;
  readonly volumeUsdH24: number | null;
  readonly priceChangePercent24h: number | null;
  readonly imageUrls: ReadonlyArray<string>;
}
