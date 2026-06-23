import { Chain } from 'chain/registry/domain/entities/chain.entity';
import { ChainFamily } from 'chain/identity/chain-family.vo';
import { ChainId } from 'chain/identity/chain-id.vo';
import type { Capability } from 'chain/registry/domain/value-objects/chain-capabilities.vo';
import { ChainCapabilities } from 'chain/registry/domain/value-objects/chain-capabilities.vo';

/**
 * Outbound port: read-only catalog of registered chains.
 *
 * v1 implementation is static (in-memory). v2 may swap to a config-driven
 * or DB-backed implementation without changing consumers.
 */
export abstract class ChainCatalogPort {
  public abstract findById(id: ChainId): Promise<Chain | null>;
  public abstract listByFamily(
    family: ChainFamily,
  ): Promise<ReadonlyArray<Chain>>;
  public abstract listAll(): Promise<ReadonlyArray<Chain>>;
  public abstract listSupporting(
    capability: Capability,
  ): Promise<ReadonlyArray<Chain>>;
}

export const CHAIN_CATALOG = Symbol('CHAIN_CATALOG');

export const STATIC_CHAINS: ReadonlyArray<Chain> = [
  Chain.create(ChainId.ETHEREUM, {
    family: ChainFamily.EVM,
    displayName: 'Ethereum',
    nativeSymbol: 'ETH',
    blockExplorerUrl: 'https://etherscan.io',
    capabilities: ChainCapabilities.of([
      'PROBE_EVM',
      'MARKET_DATA',
      'HONEYPOT_ANALYSIS',
      'GECKOTERMINAL',
    ]),
    geckoTerminalSlug: 'eth',
  }),
  Chain.create(ChainId.SOLANA, {
    family: ChainFamily.SOLANA,
    displayName: 'Solana',
    nativeSymbol: 'SOL',
    blockExplorerUrl: 'https://solscan.io',
    capabilities: ChainCapabilities.of([
      'PROBE_SVM',
      'MARKET_DATA',
      'HONEYPOT_ANALYSIS',
      'GECKOTERMINAL',
    ]),
    geckoTerminalSlug: 'solana',
  }),
  Chain.create(ChainId.BSC, {
    family: ChainFamily.EVM,
    displayName: 'BNB Smart Chain',
    nativeSymbol: 'BNB',
    blockExplorerUrl: 'https://bscscan.com',
    capabilities: ChainCapabilities.of(['MARKET_DATA', 'GECKOTERMINAL']),
    geckoTerminalSlug: 'bsc',
  }),
  Chain.create(ChainId.BASE, {
    family: ChainFamily.EVM,
    displayName: 'Base',
    nativeSymbol: 'ETH',
    blockExplorerUrl: 'https://basescan.org',
    capabilities: ChainCapabilities.of(['MARKET_DATA', 'GECKOTERMINAL']),
    geckoTerminalSlug: 'base',
  }),
  Chain.create(ChainId.ARBITRUM, {
    family: ChainFamily.EVM,
    displayName: 'Arbitrum One',
    nativeSymbol: 'ETH',
    blockExplorerUrl: 'https://arbiscan.io',
    capabilities: ChainCapabilities.of(['MARKET_DATA', 'GECKOTERMINAL']),
    geckoTerminalSlug: 'arbitrum',
  }),
  Chain.create(ChainId.POLYGON, {
    family: ChainFamily.EVM,
    displayName: 'Polygon PoS',
    nativeSymbol: 'POL',
    blockExplorerUrl: 'https://polygonscan.com',
    capabilities: ChainCapabilities.of(['MARKET_DATA', 'GECKOTERMINAL']),
    geckoTerminalSlug: 'polygon_pos',
  }),
];
