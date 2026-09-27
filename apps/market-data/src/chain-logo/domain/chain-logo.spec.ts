import {
  CHAIN_LOGO_COINGECKO_IDS,
  CHAIN_LOGO_TRUSTWALLET_IDS,
  chainLogoUrl,
  coingeckoPlatformUrl,
  isSupportedChainLogo,
  normalizeChainLogoId,
  PLACEHOLDER_PNG,
  primaryLogoUrl,
} from './chain-logo';

/**
 * Failing-first spec (chain-logo): domain mapping + placeholder.
 *
 * TrustWallet uses `binance` for our `bsc` catalog id — the mapping
 * must be explicit, never a naive interpolation.
 */
describe('chain-logo domain', () => {
  it('maps bsc to the TrustWallet binance slug', () => {
    expect(CHAIN_LOGO_TRUSTWALLET_IDS['bsc']).toBe('binance');
    expect(primaryLogoUrl('bsc')).toBe(
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/binance/info/logo.png',
    );
  });

  it('builds primary TrustWallet URLs for the catalog chains', () => {
    expect(primaryLogoUrl('solana')).toContain('/blockchains/solana/info/logo.png');
    expect(primaryLogoUrl('ethereum')).toContain('/blockchains/ethereum/info/logo.png');
    expect(primaryLogoUrl('polygon')).toContain('/blockchains/polygon/info/logo.png');
    expect(primaryLogoUrl('  SOLANA ')).toContain('/blockchains/solana/info/logo.png');
  });

  it('returns null primary/fallback urls for unknown chains', () => {
    expect(primaryLogoUrl('nope')).toBeNull();
    expect(coingeckoPlatformUrl('nope')).toBeNull();
    expect(isSupportedChainLogo('nope')).toBe(false);
  });

  it('maps bsc to the CoinGecko binance-smart-chain platform', () => {
    expect(CHAIN_LOGO_COINGECKO_IDS['bsc']).toBe('binance-smart-chain');
    expect(coingeckoPlatformUrl('bsc')).toBe(
      'https://api.coingecko.com/api/v3/asset_platforms/binance-smart-chain',
    );
  });

  it('builds the gateway logoUrl served for frontend badges', () => {
    expect(chainLogoUrl('solana')).toBe('/api/v1/chains/solana/logo');
    expect(CHAIN_LOGO_TRUSTWALLET_IDS['ethereum']).toBe('ethereum');
  });

  it('normalizes ids (trim + lowercase)', () => {
    expect(normalizeChainLogoId('  BSC ')).toBe('bsc');
  });

  it('ships a non-empty PNG placeholder (magic bytes)', () => {
    expect(PLACEHOLDER_PNG.length).toBeGreaterThan(0);
    expect(PLACEHOLDER_PNG[0]).toBe(0x89);
    expect(PLACEHOLDER_PNG[1]).toBe(0x50);
    expect(PLACEHOLDER_PNG[2]).toBe(0x4e);
    expect(PLACEHOLDER_PNG[3]).toBe(0x47);
  });
});
