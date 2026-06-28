import { CoinGeckoAdapter } from 'token/enrichment/infrastructure/providers/coingecko.adapter';

class FakeConfig {
  constructor(private readonly cfg: Record<string, unknown>) {}
  public get<T>(key: string): T {
    return this.cfg[key] as T;
  }
}

describe('CoinGeckoAdapter', () => {
  it('exposes name="coingecko"', () => {
    const cfg = new FakeConfig({ app: { coingecko: { apiKey: 'fake' } } });
    expect(new CoinGeckoAdapter(cfg).name).toBe('coingecko');
  });

  it('returns null when COINGECKO_API_KEY is missing', async () => {
    const cfg = new FakeConfig({ app: { coingecko: { apiKey: '' } } });
    const adapter = new CoinGeckoAdapter(cfg);
    expect(
      await adapter.fetch(
        { value: 'ethereum' },
        '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      ),
    ).toBeNull();
  });

  it('returns null for unsupported chains', async () => {
    const cfg = new FakeConfig({ app: { coingecko: { apiKey: 'fake' } } });
    const adapter = new CoinGeckoAdapter(cfg);
    expect(
      await adapter.fetch({ value: 'polkadot' } as never, 'addr'),
    ).toBeNull();
  });
});
