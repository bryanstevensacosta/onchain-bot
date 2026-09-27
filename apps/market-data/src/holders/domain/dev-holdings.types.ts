export interface DevWalletHolding {
  readonly wallet: string;
  readonly holdAmount: number | null;
  readonly percentOfSupply: number | null;
  readonly pnlUsd: number | null;
  readonly tag: string | null;
  readonly probable?: boolean;
}

export type DevHoldingsSource = 'birdeye' | 'helius-probable' | 'null';

export interface DevHoldingsResult {
  readonly devWallets: ReadonlyArray<DevWalletHolding> | null;
  readonly devPctSupply: number | null;
  readonly source: DevHoldingsSource;
  readonly providerErrors: Record<string, string>;
}

export function emptyDevHoldings(
  providerErrors: Record<string, string> = {},
): DevHoldingsResult {
  return {
    devWallets: null,
    devPctSupply: null,
    source: 'null',
    providerErrors,
  };
}
