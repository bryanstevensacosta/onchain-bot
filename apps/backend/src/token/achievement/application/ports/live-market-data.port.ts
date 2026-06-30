export interface MarketDataItem {
  chain: string;
  address: string;
}

export abstract class LiveMarketDataPort {
  abstract fetchCurrentMc(
    chain: string,
    address: string,
  ): Promise<number | null>;
  abstract fetchCurrentMcBatch(
    items: ReadonlyArray<MarketDataItem>,
  ): Promise<Map<string, number>>;
}
