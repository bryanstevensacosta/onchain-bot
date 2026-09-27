export interface PaginatedResponse<T> {
  readonly items: ReadonlyArray<T>;
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface KolCallsMentionDto {
  readonly id: string;
  readonly kolId: string;
  readonly messageId: number;
  readonly contractIndex: number;
  readonly chain: string;
  readonly address: string;
  readonly ticker: string | null;
}

export interface KolCallsSnapshotDto {
  readonly mentionId: string;
  readonly marketCapUsd: number | null;
  readonly priceUsd: number | null;
  readonly liquidityUsd: number | null;
  readonly holders: number | null;
  readonly symbol: string | null;
}

export interface KolCallsRankingDto {
  readonly caller: string;
  readonly window: string;
  readonly totalX: number;
  readonly callsCount: number;
  readonly strongCalls: number;
  readonly display: string;
}
