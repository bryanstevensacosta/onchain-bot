import { ProviderRegistryService } from './provider-registry.service';

/**
 * Failing-first spec (Tramo 3, todo 4, C-DATA-01).
 *
 * After the physical provider extraction, the health registry must track
 * all 13 canonical adapters (not just the 7 seeded in todo 2), plus the
 * ccxt REST adapter (todo 16, P48) — 14 total, ccxt first.
 */
const EXPECTED_PROVIDERS = [
  'ccxt',
  'alchemy',
  'birdeye',
  'coingecko',
  'coinmarketcap',
  'dexscreener',
  'fluxrpc',
  'geckoterminal',
  'helius',
  'mobula',
  'moralis',
  'pumpdev',
  'rugcheck',
  'solana-rpc',
] as const;

describe('ProviderRegistryService (14 adapters, todos 4+16)', () => {
  it('tracks all 14 canonical providers', () => {
    const registry = new ProviderRegistryService();
    const names = registry.listProviders().map((descriptor) => descriptor.name);
    for (const expected of EXPECTED_PROVIDERS) {
      expect(names).toContain(expected);
    }
    expect(names).toHaveLength(EXPECTED_PROVIDERS.length);
  });

  it('reports a status entry per provider', () => {
    const registry = new ProviderRegistryService();
    for (const expected of EXPECTED_PROVIDERS) {
      expect(registry.getStatus(expected)).not.toBeNull();
    }
  });
});
