import { buildAppConfig } from './app.config';

describe('buildAppConfig', () => {
  it('defaults to dev port :4000', () => {
    expect(buildAppConfig({} as NodeJS.ProcessEnv).port).toBe(4000);
  });

  it('honours MARKET_DATA_PORT', () => {
    expect(
      buildAppConfig({ MARKET_DATA_PORT: '4001' } as NodeJS.ProcessEnv).port,
    ).toBe(4001);
  });

  it('flows provider API keys from env (mocked)', () => {
    const cfg = buildAppConfig({
      BIRDEYE_API_KEY: 'birdeye-k',
      HELIUS_API_KEY: 'helius-k',
      HELIUS_RPC_URL_MAINNET: 'https://helius-mainnet',
      HELIUS_RPC_URL_DEVNET: 'https://helius-devnet',
      MORALIS_API_KEY: 'moralis-k',
      COINGECKO_API_KEY: 'coingecko-k',
      COINMARKETCAP_API_KEY: 'cmc-k',
      ALCHEMY_API_KEY: 'alchemy-k',
      MOBULA_API_KEY: 'mobula-k',
      PUMPDEV_API_KEY: 'pumpdev-k',
      PUMPDEV_WALLET_PUBLIC: 'pump-pub',
      PUMPDEV_WALLET_PRIVATE: 'pump-priv',
      FLUXRPC_API_KEY: 'flux-k',
      FLUXRPC_RPC: 'https://flux-rpc',
      FLUXRPC_WS: 'wss://flux-ws',
    } as NodeJS.ProcessEnv);
    expect(cfg.birdeye.apiKey).toBe('birdeye-k');
    expect(cfg.helius.apiKey).toBe('helius-k');
    expect(cfg.helius.mainnet.rpcUrl).toBe('https://helius-mainnet');
    expect(cfg.helius.devnet?.rpcUrl).toBe('https://helius-devnet');
    expect(cfg.moralis.apiKey).toBe('moralis-k');
    expect(cfg.coingecko.apiKey).toBe('coingecko-k');
    expect(cfg.coinmarketcap.apiKey).toBe('cmc-k');
    expect(cfg.alchemy.apiKey).toBe('alchemy-k');
    expect(cfg.mobula.apiKey).toBe('mobula-k');
    expect(cfg.pumpdev.apiKey).toBe('pumpdev-k');
    expect(cfg.pumpdev.walletPublic).toBe('pump-pub');
    expect(cfg.pumpdev.walletPrivate).toBe('pump-priv');
    expect(cfg.fluxrpc.apiKey).toBe('flux-k');
    expect(cfg.fluxrpc.rpcUrl).toBe('https://flux-rpc');
    expect(cfg.fluxrpc.wsUrl).toBe('wss://flux-ws');
    expect(cfg.solanaRpc.primaryRpcUrl).toBe('https://helius-mainnet');
  });

  it('defaults every provider key to empty (skip-without-key)', () => {
    const cfg = buildAppConfig({} as NodeJS.ProcessEnv);
    expect(cfg.birdeye.apiKey).toBe('');
    expect(cfg.helius.apiKey).toBe('');
    expect(cfg.helius.mainnet.rpcUrl).toBe('');
    expect(cfg.moralis.apiKey).toBe('');
    expect(cfg.coingecko.apiKey).toBe('');
    expect(cfg.coinmarketcap.apiKey).toBe('');
    expect(cfg.alchemy.apiKey).toBe('');
    expect(cfg.mobula.apiKey).toBe('');
    expect(cfg.pumpdev.apiKey).toBe('');
    expect(cfg.fluxrpc.apiKey).toBe('');
    expect(cfg.fluxrpc.rpcUrl).toBe('');
    expect(cfg.solanaRpc.primaryRpcUrl).toBeUndefined();
  });
});
