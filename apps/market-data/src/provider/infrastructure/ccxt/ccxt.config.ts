export const CCXT_CONFIG = 'CCXT_CONFIG';

export interface CcxtConfig {
  readonly defaultExchange: string;
  readonly exchanges: ReadonlyArray<string>;
}
