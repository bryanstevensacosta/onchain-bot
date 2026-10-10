/**
 * ProviderDescriptor (Tramo 3, todos 2+4, provider-hex).
 *
 * Descriptor + health only. The 13 physical adapters live under
 * `src/provider/infrastructure/` (C-DATA-01, todo 4, P45 path);
 * this registry tracks one descriptor per adapter — never adapter code.
 * Hexagonal home: `src/provider/domain/` (was `src/provider/`;
 * re-exported there for compat).
 */
export type ProviderKind = 'market' | 'chain' | 'security' | 'trading';

export interface ProviderDescriptor {
  readonly name: string;
  readonly kind: ProviderKind;
  readonly supportsChains: ReadonlyArray<string>;
  readonly rateLimitPerMin: number;
  /** Per-endpoint bucket cost in requests (default 1; P48-bis). */
  readonly endpointCosts?: Readonly<Record<string, number>>;
  /** Reconnect backoff bounds in ms (default 1s -> 30s; P48-bis). */
  readonly backoffInitialMs?: number;
  readonly backoffMaxMs?: number;
}

export const DEFAULT_PROVIDERS: ReadonlyArray<ProviderDescriptor> = [
  {
    // Eligibility only: effective coverage is CEX-pair symbols (covers()).
    name: 'ccxt',
    kind: 'market',
    supportsChains: [
      'ethereum',
      'solana',
      'bsc',
      'base',
      'arbitrum',
      'polygon',
    ],
    rateLimitPerMin: 600,
    endpointCosts: { ticker: 1, ohlcv: 5, quote: 1 },
    backoffInitialMs: 1_000,
    backoffMaxMs: 30_000,
  },
  {
    name: 'dexscreener',
    kind: 'market',
    supportsChains: [
      'ethereum',
      'solana',
      'bsc',
      'base',
      'arbitrum',
      'polygon',
      'robinhood',
      'unichain',
    ],
    rateLimitPerMin: 60,
  },
  {
    name: 'geckoterminal',
    kind: 'market',
    supportsChains: [
      'ethereum',
      'solana',
      'bsc',
      'base',
      'arbitrum',
      'polygon',
      'robinhood',
    ],
    rateLimitPerMin: 60,
  },
  {
    name: 'coingecko',
    kind: 'market',
    supportsChains: ['ethereum', 'solana'],
    rateLimitPerMin: 30,
  },
  {
    name: 'coinmarketcap',
    kind: 'market',
    supportsChains: ['ethereum', 'solana', 'bsc', 'base'],
    rateLimitPerMin: 30,
  },
  {
    name: 'birdeye',
    kind: 'market',
    supportsChains: [
      'solana',
      'ethereum',
      'bsc',
      'base',
      'arbitrum',
      'polygon',
      'robinhood',
    ],
    rateLimitPerMin: 60,
  },
  {
    name: 'mobula',
    kind: 'market',
    supportsChains: [
      'ethereum',
      'solana',
      'bsc',
      'base',
      'arbitrum',
      'polygon',
    ],
    rateLimitPerMin: 60,
  },
  {
    name: 'moralis',
    kind: 'market',
    supportsChains: ['ethereum', 'bsc', 'base', 'arbitrum', 'polygon'],
    rateLimitPerMin: 60,
  },
  {
    name: 'alchemy',
    kind: 'chain',
    supportsChains: ['ethereum', 'base', 'arbitrum', 'polygon'],
    rateLimitPerMin: 300,
  },
  {
    name: 'helius',
    kind: 'chain',
    supportsChains: ['solana'],
    rateLimitPerMin: 300,
  },
  {
    name: 'fluxrpc',
    kind: 'chain',
    supportsChains: ['solana'],
    rateLimitPerMin: 300,
  },
  {
    name: 'solana-rpc',
    kind: 'chain',
    supportsChains: ['solana'],
    rateLimitPerMin: 300,
  },
  {
    name: 'rugcheck',
    kind: 'security',
    supportsChains: ['solana'],
    rateLimitPerMin: 60,
  },
  {
    // Dexter plan todo 32: keyless price leg (6 STATIC chains;
    // optimism/unichain mapped-but-unqueried until the catalog lands).
    name: 'defillama',
    kind: 'market',
    supportsChains: [
      'ethereum',
      'solana',
      'bsc',
      'base',
      'arbitrum',
      'polygon',
    ],
    rateLimitPerMin: 60,
  },
  {
    // Dexter plan todo 32: keyed holders leg (EVM STATIC chains;
    // optimism/unichain mapped-but-unqueried until the catalog lands).
    name: 'etherscan',
    kind: 'market',
    supportsChains: [
      'ethereum',
      'bsc',
      'base',
      'arbitrum',
      'polygon',
      'robinhood',
    ],
    rateLimitPerMin: 60,
  },
  {
    name: 'pumpdev',
    kind: 'trading',
    supportsChains: ['solana'],
    rateLimitPerMin: 60,
  },
];
