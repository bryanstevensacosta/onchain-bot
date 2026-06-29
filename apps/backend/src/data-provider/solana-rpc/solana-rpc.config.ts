export const SOLANA_RPC_CONFIG = 'SOLANA_RPC_CONFIG';

export interface SolanaRpcConfig {
  readonly primaryRpcUrl?: string;
  readonly fallbackRpcUrl?: string;
}
