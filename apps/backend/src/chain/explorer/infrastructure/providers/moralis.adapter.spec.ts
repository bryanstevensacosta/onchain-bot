import { MoralisAdapter } from 'chain/explorer/infrastructure/providers/moralis.adapter';

class FakeConfig {
  constructor(private readonly cfg: Record<string, unknown>) {}
  public get<T>(key: string): T {
    return this.cfg[key] as T;
  }
}

describe('MoralisAdapter', () => {
  it('exposes name="moralis"', () => {
    const cfg = new FakeConfig({ app: { moralis: { apiKey: 'fake' } } });
    expect(new MoralisAdapter(cfg).name).toBe('moralis');
  });

  it('returns null when MORALIS_API_KEY is missing', async () => {
    const cfg = new FakeConfig({ app: { moralis: { apiKey: '' } } });
    const adapter = new MoralisAdapter(cfg);
    expect(
      await adapter.fetch(
        { value: 'ethereum' },
        '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      ),
    ).toBeNull();
  });

  it('returns null for Solana (Moralis is EVM-only)', async () => {
    const cfg = new FakeConfig({ app: { moralis: { apiKey: 'fake' } } });
    const adapter = new MoralisAdapter(cfg);
    expect(
      await adapter.fetch(
        { value: 'solana' },
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      ),
    ).toBeNull();
  });
});
