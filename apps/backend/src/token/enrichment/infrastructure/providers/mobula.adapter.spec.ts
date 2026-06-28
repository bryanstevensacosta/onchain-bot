import { MobulaAdapter } from 'token/enrichment/infrastructure/providers/mobula.adapter';

class FakeConfig {
  constructor(private readonly cfg: Record<string, unknown>) {}
  public get<T>(key: string): T {
    return this.cfg[key] as T;
  }
}

describe('MobulaAdapter', () => {
  it('exposes name="mobula"', () => {
    const cfg = new FakeConfig({ app: { mobula: { apiKey: 'fake' } } });
    expect(new MobulaAdapter(cfg).name).toBe('mobula');
  });

  it('returns null when MOBULA_API_KEY is missing', async () => {
    const cfg = new FakeConfig({ app: { mobula: { apiKey: '' } } });
    const adapter = new MobulaAdapter(cfg);
    expect(
      await adapter.fetch(
        { value: 'ethereum' },
        '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      ),
    ).toBeNull();
  });

  it('returns null for unsupported chains without HTTP call', async () => {
    const cfg = new FakeConfig({ app: { mobula: { apiKey: 'fake' } } });
    const adapter = new MobulaAdapter(cfg);
    expect(
      await adapter.fetch({ value: 'polkadot' } as never, 'addr'),
    ).toBeNull();
  });
});
