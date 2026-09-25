export type AddressKind =
  | 'wallet'
  | 'token'
  | 'program'
  | 'exchange'
  | 'unknown';

export type ProviderHealth = 'up' | 'degraded' | 'down' | 'unknown';

export interface ChainInfoView {
  readonly id: string;
  readonly family: 'EVM' | 'SOLANA';
  readonly displayName: string;
  readonly nativeSymbol: string;
  readonly explorerUrl: string | null;
  readonly geckoTerminalSlug: string | null;
}

export interface DetectChainView {
  readonly chain: string | null;
  readonly family: string | null;
}

export interface ProviderStatusView {
  readonly name: string;
  readonly kind: string;
  readonly status: ProviderHealth;
  readonly latencyMs: number | null;
  readonly errorCount: number;
  readonly lastCheckAt: string | null;
}

export interface AddressSnapshotView {
  readonly chain: string;
  readonly address: string;
  readonly kind: AddressKind;
  readonly key: string;
  readonly status: string;
  readonly providers: ReadonlyArray<string>;
}

export interface MarketDataSnapshotView {
  readonly priceUsd: number | null;
  readonly liquidityUsd: number | null;
  readonly volume24hUsd: number | null;
  readonly marketCapUsd: number | null;
  readonly fdvUsd: number | null;
  readonly priceChange24h: number | null;
  readonly holders: number | null;
  readonly top10HolderPercent: number | null;
  readonly symbol: string | null;
  readonly name: string | null;
  readonly lockedLiquidityPercent: number | null;
  readonly burnedPercent: number | null;
  readonly chain: string;
  readonly address: string;
  readonly kind: AddressKind;
  readonly key: string;
  readonly status: string;
  readonly providers: ReadonlyArray<string>;
}

export interface BatchSnapshotItem {
  readonly chain: string;
  readonly address: string;
  readonly kind?: AddressKind;
  readonly key?: string;
  readonly status?: string;
  readonly providers?: ReadonlyArray<string>;
  readonly error?: string;
}

export interface BatchSnapshotsResponse {
  readonly snapshots: ReadonlyArray<BatchSnapshotItem>;
}
