import {
  AlchemyService,
  BirdeyeService,
  CcxtService,
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
 * (Todo 16, P48: ccxt joins as the 14th — constructed with its own
 * minimal config in the dedicated case below.)
 */
describe('providers barrel (14 adapters, todos 4+16)', () => {
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

  it('ccxt constructs with its canonical name (todo 16, P48)', () => {
    const service = new CcxtService({
      defaultExchange: 'binance',
      exchanges: ['binance'],
    });
    expect(service).toBeInstanceOf(DataProviderPort);
    expect(service.name).toBe('ccxt');
  });

  it('every registered adapter exposes a full limiter config via the port (P48-bis)', () => {
    const services = [
      new AlchemyService({} as unknown as never),
      new BirdeyeService({} as unknown as never),
      new CcxtService({ defaultExchange: 'binance', exchanges: ['binance'] }),
      new CoinGeckoService({} as unknown as never),
      new CoinMarketCapService({} as unknown as never),
      new DexScreenerService({} as unknown as never),
      new FluxRpcService({} as unknown as never),
      new GeckoTerminalService({} as unknown as never),
      new HeliusService({} as unknown as never),
      new MobulaService({} as unknown as never),
      new MoralisService({} as unknown as never),
      new PumpDevService({} as unknown as never),
      new RugCheckService({} as unknown as never),
      new SolanaRpcService({} as unknown as never),
    ];
    expect(services).toHaveLength(14);
    for (const service of services) {
      const config = service.getRateLimitConfig();
      expect(config.windowMs).toBeGreaterThan(0);
      expect(config.limitPerWindow).toBeGreaterThan(0);
      expect(config.endpointCosts).toBeDefined();
      expect(config.backoffInitialMs).toBeGreaterThan(0);
      expect(config.backoffMaxMs).toBeGreaterThanOrEqual(
        config.backoffInitialMs,
      );
    }
  });
});
