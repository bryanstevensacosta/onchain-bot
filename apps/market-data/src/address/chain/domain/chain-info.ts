/**
 * ChainInfo (Tramo 3, todo 2).
 *
 * Static catalog entry. Shape mirrors the backend STATIC_CHAINS
 * (read-only reference: chain/registry/domain/ports/chain-catalog.port.ts)
 * minus capabilities (no adapter gating in v1).
 */
export type ChainFamily = 'EVM' | 'SOLANA';

export interface ChainInfo {
  readonly id: string;
  readonly family: ChainFamily;
  readonly displayName: string;
  readonly nativeSymbol: string;
  readonly explorerUrl: string | null;
  readonly geckoTerminalSlug: string | null;
  readonly logoUrl: string;
}

export const STATIC_CHAINS: ReadonlyArray<ChainInfo> = [
  {
    id: 'ethereum',
    family: 'EVM',
    displayName: 'Ethereum',
    nativeSymbol: 'ETH',
    explorerUrl: 'https://etherscan.io',
    geckoTerminalSlug: 'eth',
    logoUrl: '/api/v1/chains/ethereum/logo',
  },
  {
    id: 'solana',
    family: 'SOLANA',
    displayName: 'Solana',
    nativeSymbol: 'SOL',
    explorerUrl: 'https://solscan.io',
    geckoTerminalSlug: 'solana',
    logoUrl: '/api/v1/chains/solana/logo',
  },
  {
    id: 'bsc',
    family: 'EVM',
    displayName: 'BNB Smart Chain',
    nativeSymbol: 'BNB',
    explorerUrl: 'https://bscscan.com',
    geckoTerminalSlug: 'bsc',
    logoUrl: '/api/v1/chains/bsc/logo',
  },
  {
    id: 'base',
    family: 'EVM',
    displayName: 'Base',
    nativeSymbol: 'ETH',
    explorerUrl: 'https://basescan.org',
    geckoTerminalSlug: 'base',
    logoUrl: '/api/v1/chains/base/logo',
  },
  {
    id: 'arbitrum',
    family: 'EVM',
    displayName: 'Arbitrum One',
    nativeSymbol: 'ETH',
    explorerUrl: 'https://arbiscan.io',
    geckoTerminalSlug: 'arbitrum',
    logoUrl: '/api/v1/chains/arbitrum/logo',
  },
  {
    id: 'polygon',
    family: 'EVM',
    displayName: 'Polygon PoS',
    nativeSymbol: 'POL',
    explorerUrl: 'https://polygonscan.com',
    geckoTerminalSlug: 'polygon_pos',
    logoUrl: '/api/v1/chains/polygon/logo',
  },
];
