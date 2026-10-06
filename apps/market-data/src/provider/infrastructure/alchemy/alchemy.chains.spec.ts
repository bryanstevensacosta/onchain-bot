import {
  EVM_CHAIN_TRANSPORTS,
  MULTICALL3_ADDRESS,
  chainRpcUrl,
  isChainSupported,
} from './alchemy.chains';

describe('EVM chain transports (Lane T table)', () => {
  it('pins the canonical Multicall3 address', () => {
    expect(MULTICALL3_ADDRESS).toBe(
      '0xcA11bde05977b3631167028862bE2a173976CA11',
    );
  });

  it.each([
    ['ethereum', 'eth-mainnet'],
    ['base', 'base-mainnet'],
    ['bsc', 'bnb-mainnet'],
    ['arbitrum', 'arb-mainnet'],
    ['polygon', 'polygon-mainnet'],
    ['optimism', 'opt-mainnet'],
    ['unichain', 'unichain-mainnet'],
  ])('%s routes to %s with Multicall3 deployed', (chain, subdomain) => {
    expect(isChainSupported(chain)).toBe(true);
    expect(EVM_CHAIN_TRANSPORTS[chain]).toMatchObject({
      alchemySubdomain: subdomain,
      multicall3: MULTICALL3_ADDRESS,
    });
    expect(chainRpcUrl(chain, 'key123')).toBe(
      `https://${subdomain}.g.alchemy.com/v2/key123`,
    );
  });

  it.each([['robinhood'], ['solana'], [''], ['BNB']])(
    '%s is unsupported (fail-open null, zero network)',
    (chain) => {
      expect(isChainSupported(chain)).toBe(false);
      expect(chainRpcUrl(chain, 'key123')).toBeNull();
    },
  );

  it('documents the Robinhood placeholder: no row until eth_getCode proof lands', () => {
    expect('robinhood' in EVM_CHAIN_TRANSPORTS).toBe(false);
  });
});
