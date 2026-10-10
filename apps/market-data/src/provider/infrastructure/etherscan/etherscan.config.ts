export const ETHERSCAN_CONFIG = 'ETHERSCAN_CONFIG';

export interface EtherscanConfig {
  readonly apiKey: string;
  readonly baseUrl?: string;
}
