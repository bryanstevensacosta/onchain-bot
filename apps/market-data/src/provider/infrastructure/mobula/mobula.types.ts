export interface MobulaMarketToken {
  readonly address?: string;
  readonly priceUSD?: number | null;
  readonly approximateReserveUSD?: number | null;
  readonly marketCapUSD?: number | null;
  readonly marketCapDilutedUSD?: number | null;
  readonly totalSupply?: number | null;
  readonly top10HoldingsPercentage?: number | null;
  readonly insidersHoldingsPercentage?: number | null;
  readonly bundlersHoldingsPercentage?: number | null;
  readonly devHoldingsPercentage?: number | null;
  readonly bondingPercentage?: number | null;
  readonly factory?: string | null;
  readonly source?: string | null;
}

export interface MobulaMarketResponse {
  readonly data?: ReadonlyArray<{ readonly base?: MobulaMarketToken }>;
}

export interface MobulaWalletPortfolio {
  readonly totalUsd?: number;
  readonly assets?: ReadonlyArray<{
    readonly address: string;
    readonly symbol: string;
    readonly balanceUSD: number;
  }>;
}

export interface MobulaHistoryEntry {
  readonly timestamp: number;
  readonly price: number;
  readonly volume: number;
}

export interface MobulaHistoryResponse {
  readonly data?: ReadonlyArray<MobulaHistoryEntry>;
}

export interface MobulaMetadata {
  readonly name?: string;
  readonly symbol?: string;
  readonly icon?: string;
  readonly decimals?: number;
}

export interface MobulaMetadataResponse {
  readonly data?: {
    readonly name?: string;
    readonly symbol?: string;
    readonly icon?: string;
    readonly decimals?: number;
  };
}

/**
 * `GET /2/token/price` single-token price leg (dexter plan todo 31).
 *
 * Doc-verified shape (https://docs.mobula.io/rest-api-reference/
 * endpoint/token-price): `{ data: { name, symbol, logo, priceUSD,
 * marketCapUSD, marketCapDilutedUSD, liquidityUSD, liquidityMaxUSD } }`
 * — USD-suffix naming (unlike `token/markets` camelCase), all
 * nullable per the docs note.
 */
export interface MobulaTokenPriceData {
  readonly name?: string | null;
  readonly symbol?: string | null;
  readonly logo?: string | null;
  readonly priceUSD?: number | null;
  readonly marketCapUSD?: number | null;
  readonly marketCapDilutedUSD?: number | null;
  readonly liquidityUSD?: number | null;
  readonly liquidityMaxUSD?: number | null;
}

export interface MobulaTokenPriceResponse {
  readonly data?: MobulaTokenPriceData | null;
}

/**
 * `POST /2/token/price` batch leg, up to 500 tokens per request
 * (dexter plan todo 31 — the batch-500 collapse for batch endpoints).
 *
 * Doc-verified shape (https://docs.mobula.io/rest-api-reference/
 * endpoint/token-price-post): `{ payload: [...] }`, positional —
 * `payload[i]` echoes `items[i]` via `address` + `chainId`
 * (`"evm:1"`, `"solana:solana"`). Unpriceable slots carry `error`
 * INSTEAD of the price fields (never shifting the array).
 */
export interface MobulaTokenPriceBatchItem {
  readonly address?: string | null;
  readonly chainId?: string | null;
  readonly name?: string | null;
  readonly symbol?: string | null;
  readonly logo?: string | null;
  readonly priceUSD?: number | null;
  readonly marketCapUSD?: number | null;
  readonly marketCapDilutedUSD?: number | null;
  readonly liquidityUSD?: number | null;
  readonly liquidityMaxUSD?: number | null;
  readonly error?: string | null;
}

export interface MobulaTokenPriceBatchResponse {
  readonly payload?: ReadonlyArray<MobulaTokenPriceBatchItem> | null;
}

export interface MobulaTokenPriceBatchEntry {
  readonly address: string;
  readonly blockchain: string;
}
