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
}

export const DEFAULT_PROVIDERS: ReadonlyArray<ProviderDescriptor> = [
  {
    name: 'dexscreener',
    kind: 'market',
    supportsChains: ['ethereum', 'solana', 'bsc', 'base'],
    rateLimitPerMin: 60,
  },
  {
    name: 'geckoterminal',
    kind: 'market',
    supportsChains: ['ethereum', 'solana', 'bsc', 'base'],
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
    supportsChains: ['solana'],
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
    name: 'pumpdev',
    kind: 'trading',
    supportsChains: ['solana'],
    rateLimitPerMin: 60,
  },
];
