import { BirdeyeAdapter } from 'ca/enrichment/infrastructure/providers/birdeye.adapter';
import { ConfigService } from '@nestjs/config';

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
    const adapter = new BirdeyeAdapter(cfg as unknown as ConfigService);

    const result = await adapter.fetch(
      { value: 'ethereum' } as never,
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    );

    expect(result).toBeNull();
  });

  it('returns null when BIRDEYE_API_KEY is missing', async () => {
    const cfg = new FakeConfig({ app: { birdeye: { apiKey: '' } } });
    const adapter = new BirdeyeAdapter(cfg as unknown as ConfigService);

    const result = await adapter.fetch({ value: 'solana' } as never, SOLANA);

    expect(result).toBeNull();
  });

  it('exposes name="birdeye" and supports only solana', () => {
    const cfg = new FakeConfig({ app: { birdeye: { apiKey: 'fake-key' } } });
    const adapter = new BirdeyeAdapter(cfg as unknown as ConfigService);

    expect(adapter.name).toBe('birdeye');
    expect(adapter.supportedChains).toHaveLength(1);
    expect(adapter.supportedChains[0]?.value).toBe('solana');
  });
});
