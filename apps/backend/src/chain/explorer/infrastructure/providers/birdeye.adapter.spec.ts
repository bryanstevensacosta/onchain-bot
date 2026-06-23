import { BirdeyeAdapter } from 'chain/explorer/infrastructure/providers/birdeye.adapter';

class FakeConfig {
  constructor(private readonly cfg: Record<string, unknown>) {}
  public get<T>(key: string): T {
    return this.cfg[key] as T;
  }
}

describe('BirdeyeAdapter', () => {
  const SOLANA = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

  it('returns null for non-Solana chains without making HTTP call', async () => {
    const cfg = new FakeConfig({ app: { birdeye: { apiKey: 'fake-key' } } });
    const adapter = new BirdeyeAdapter(cfg);

    const result = await adapter.fetch(
      { value: 'ethereum' },
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    );

    expect(result).toBeNull();
  });

  it('returns null when BIRDEYE_API_KEY is missing', async () => {
    const cfg = new FakeConfig({ app: { birdeye: { apiKey: '' } } });
    const adapter = new BirdeyeAdapter(cfg);

    const result = await adapter.fetch({ value: 'solana' }, SOLANA);

    expect(result).toBeNull();
  });

  it('exposes name="birdeye"', () => {
    const cfg = new FakeConfig({ app: { birdeye: { apiKey: 'fake-key' } } });
    const adapter = new BirdeyeAdapter(cfg);

    expect(adapter.name).toBe('birdeye');
  });
});
