/**
 * ProviderDescriptor (Tramo 3, todo 2).
 *
 * Descriptor + health only. The 13 physical adapters land in todo 4
 * (C-DATA-01, last move) — never adapter code here.
 */
export type ProviderKind = 'market' | 'chain' | 'security';

export interface ProviderDescriptor {
  readonly name: string;
  readonly kind: ProviderKind;
  readonly supportsChains: ReadonlyArray<string>;
  readonly rateLimitPerMin: number;
}

export const DEFAULT_PROVIDERS: ReadonlyArray<ProviderDescriptor> = [
  { name: 'dexscreener', kind: 'market', supportsChains: ['ethereum', 'solana', 'bsc', 'base'], rateLimitPerMin: 60 },
  { name: 'geckoterminal', kind: 'market', supportsChains: ['ethereum', 'solana', 'bsc', 'base'], rateLimitPerMin: 60 },
  { name: 'coingecko', kind: 'market', supportsChains: ['ethereum', 'solana'], rateLimitPerMin: 30 },
  { name: 'birdeye', kind: 'market', supportsChains: ['solana'], rateLimitPerMin: 60 },
  { name: 'alchemy', kind: 'chain', supportsChains: ['ethereum', 'base', 'arbitrum', 'polygon'], rateLimitPerMin: 300 },
  { name: 'helius', kind: 'chain', supportsChains: ['solana'], rateLimitPerMin: 300 },
  { name: 'rugcheck', kind: 'security', supportsChains: ['solana'], rateLimitPerMin: 60 },
];
