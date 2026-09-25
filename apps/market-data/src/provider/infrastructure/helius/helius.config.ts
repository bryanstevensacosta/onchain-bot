export const HELIUS_CONFIG = 'HELIUS_CONFIG';

export interface HeliusConfig {
  readonly apiKey: string;
  readonly mainnet: { readonly rpcUrl: string };
  readonly devnet?: { readonly rpcUrl: string };
}
