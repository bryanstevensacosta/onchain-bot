import {
  AlchemyService,
  BirdeyeService,
  CoinGeckoService,
  CoinMarketCapService,
  DataProviderPort,
  DexScreenerService,
  FluxRpcService,
  GeckoTerminalService,
  HeliusService,
  MobulaService,
  MoralisService,
  PumpDevService,
  RugCheckService,
  SolanaRpcService,
} from './index';

/**
 * Failing-first spec (Tramo 3, todo 4, C-DATA-01).
 *
 * The 13 physical adapters live under
 * `src/provider/infrastructure/` (P45 path). Every adapter must
 * be constructible from its barrel export and carry its canonical name.
 * No network is touched: construction only, with empty configs.
 */
describe('providers barrel (13 adapters, todo 4)', () => {
  it('exports the shared DataProviderPort base', () => {
    expect(DataProviderPort).toBeDefined();
  });

  it.each([
    ['alchemy', AlchemyService],
    ['birdeye', BirdeyeService],
    ['coingecko', CoinGeckoService],
    ['coinmarketcap', CoinMarketCapService],
    ['dexscreener', DexScreenerService],
    ['fluxrpc', FluxRpcService],
    ['geckoterminal', GeckoTerminalService],
    ['helius', HeliusService],
    ['mobula', MobulaService],
    ['moralis', MoralisService],
    ['pumpdev', PumpDevService],
    ['rugcheck', RugCheckService],
    ['solana-rpc', SolanaRpcService],
  ] as const)('%s constructs with its canonical name', (name, Service) => {
    const service = new Service({} as unknown as never);
    expect(service).toBeInstanceOf(DataProviderPort);
    expect(service.name).toBe(name);
  });
});
