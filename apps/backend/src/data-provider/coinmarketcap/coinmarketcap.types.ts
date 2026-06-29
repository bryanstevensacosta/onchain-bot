export interface CmcQuote {
  readonly price: number;
  readonly volume_24h: number;
  readonly percent_change_1h: number;
  readonly percent_change_24h: number;
  readonly percent_change_7d: number;
  readonly market_cap: number;
  readonly fully_diluted_market_cap: number;
  readonly last_updated: string;
}

export interface CmcCoinInfo {
  readonly id: number;
  readonly name: string;
  readonly symbol: string;
  readonly slug: string;
  readonly logo: string;
  readonly description: string;
  readonly date_added: string;
  readonly category: string;
}

export interface CmcListing {
  readonly id: number;
  readonly name: string;
  readonly symbol: string;
  readonly slug: string;
  readonly cmc_rank: number;
  readonly quote: Record<string, CmcQuote>;
  readonly last_updated: string;
}

export interface CmcQuotesLatestResponse {
  readonly data: Record<
    string,
    {
      readonly id: number;
      readonly name: string;
      readonly symbol: string;
      readonly quote: Record<string, CmcQuote>;
      readonly last_updated: string;
    }
  >;
}

export interface CmcInfoResponse {
  readonly data: Record<string, CmcCoinInfo>;
}

export interface CmcListingsResponse {
  readonly data: ReadonlyArray<CmcListing>;
}

export interface CmcMapEntry {
  readonly id: number;
  readonly name: string;
  readonly symbol: string;
  readonly slug: string;
  readonly first_historical_data: string;
  readonly last_historical_data: string;
}

export interface CmcMapResponse {
  readonly data: ReadonlyArray<CmcMapEntry>;
}

export interface CmcPriceConversionResponse {
  readonly data: {
    readonly id: number;
    readonly symbol: string;
    readonly amount: number;
    readonly quote: Record<
      string,
      { readonly price: number; readonly last_updated: string }
    >;
  };
}

export interface CmcGlobalMetricsResponse {
  readonly data: {
    readonly total_market_cap: Record<string, number>;
    readonly total_volume_24h: Record<string, number>;
    readonly btc_dominance: number;
    readonly eth_dominance: number;
    readonly active_cryptocurrencies: number;
    readonly last_updated: string;
  };
}

export interface CmcErrorResponse {
  readonly status: {
    readonly error_code: number;
    readonly error_message: string;
  };
}
