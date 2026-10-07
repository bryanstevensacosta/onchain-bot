import {
  DRPC_NETWORKS,
  drpcRpcUrl,
  EVM_CHAIN_TRANSPORTS,
  EVM_RPC_TIER_TIMEOUT_MS,
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
    ['ethereum', 'eth-mainnet', 1],
    ['base', 'base-mainnet', 8453],
    ['bsc', 'bnb-mainnet', 56],
    ['arbitrum', 'arb-mainnet', 42161],
    ['polygon', 'polygon-mainnet', 137],
    ['optimism', 'opt-mainnet', 10],
    ['unichain', 'unichain-mainnet', 130],
    ['robinhood', 'robinhood-mainnet', 4663],
  ])(
    '%s routes to %s (chainId %i) with Multicall3 deployed',
    (chain, subdomain, chainId) => {
      expect(isChainSupported(chain)).toBe(true);
      expect(EVM_CHAIN_TRANSPORTS[chain]).toMatchObject({
        alchemySubdomain: subdomain,
        chainId,
        multicall3: MULTICALL3_ADDRESS,
      });
      expect(chainRpcUrl(chain, 'key123')).toBe(
        `https://${subdomain}.g.alchemy.com/v2/key123`,
      );
    },
  );

  it.each([['solana'], [''], ['BNB']])(
    '%s is unsupported (fail-open null, zero network)',
    (chain) => {
      expect(isChainSupported(chain)).toBe(false);
      expect(chainRpcUrl(chain, 'key123')).toBeNull();
    },
  );

  it('pins the Robinhood row (todo 24: eth_getCode proof 2026-10-06, chainId 4663)', () => {
    expect(EVM_CHAIN_TRANSPORTS['robinhood']).toEqual({
      alchemySubdomain: 'robinhood-mainnet',
      chainId: 4663,
      multicall3: MULTICALL3_ADDRESS,
    });
  });

  it('builds dRPC URLs for all verified slugs (incl. unichain/robinhood, live-verified 2026-10-07)', () => {
    expect(drpcRpcUrl('base', 'dk')).toBe('https://lb.drpc.live/base/dk');
    expect(drpcRpcUrl('ethereum', 'dk')).toBe(
      'https://lb.drpc.live/ethereum/dk',
    );
    expect(drpcRpcUrl('unichain', 'dk')).toBe(
      'https://lb.drpc.live/unichain/dk',
    );
    expect(drpcRpcUrl('robinhood', 'dk')).toBe(
      'https://lb.drpc.live/robinhood/dk',
    );
    expect(drpcRpcUrl('solana', 'dk')).toBeNull();
    expect(DRPC_NETWORKS['unichain']).toBe('unichain');
    expect(DRPC_NETWORKS['robinhood']).toBe('robinhood');
  });

  it('pins the fallback-tier timeout', () => {
    expect(EVM_RPC_TIER_TIMEOUT_MS).toBe(5_000);
  });
});
