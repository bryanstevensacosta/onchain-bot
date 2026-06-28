import { HeliusDasAdapter } from 'token/enrichment/infrastructure/providers/helius-das.adapter';

class FakeConfig {
  constructor(private readonly cfg: Record<string, unknown>) {}
  public get<T>(key: string): T {
    return this.cfg[key] as T;
  }
}

describe('HeliusDasAdapter', () => {
  it('exposes name="helius-das"', () => {
    const cfg = new FakeConfig({ app: { helius: { apiKey: 'fake' } } });
    expect(new HeliusDasAdapter(cfg).name).toBe('helius-das');
  });

  it('returns null for non-Solana chains', async () => {
    const cfg = new FakeConfig({ app: { helius: { apiKey: 'fake' } } });
    const adapter = new HeliusDasAdapter(cfg);
    expect(
      await adapter.fetch(
        { value: 'ethereum' },
        '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      ),
    ).toBeNull();
  });

  it('returns null when HELIUS_API_KEY is missing', async () => {
    const cfg = new FakeConfig({ app: { helius: { apiKey: '' } } });
    const adapter = new HeliusDasAdapter(cfg);
    expect(
      await adapter.fetch(
        { value: 'solana' },
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      ),
    ).toBeNull();
  });
});
