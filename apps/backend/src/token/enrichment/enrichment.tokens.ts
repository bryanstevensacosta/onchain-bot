/**
 * Token to inject the list of market data providers from the chain BC.
 * Used by EnrichTokenUseCase (and any other consumer of market data).
 */
export const MARKET_DATA_PROVIDERS = Symbol('MARKET_DATA_PROVIDERS');
