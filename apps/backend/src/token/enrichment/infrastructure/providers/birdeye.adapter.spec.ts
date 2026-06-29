import { BirdeyeAdapter } from 'token/enrichment/infrastructure/providers/birdeye.adapter';

describe('BirdeyeAdapter', () => {
  const SOLANA = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const mockService = (overview: unknown = null) => ({
    getTokenOverview: jest.fn().mockResolvedValue(overview),
  });

  it('returns null for non-Solana chains without making HTTP call', async () => {
    const service = mockService();
    const adapter = new BirdeyeAdapter(service);

    const result = await adapter.fetch(
      { value: 'ethereum' },
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    );

    expect(result).toBeNull();
    expect(service.getTokenOverview).not.toHaveBeenCalled();
  });

  it('returns null when BIRDEYE_API_KEY is missing', async () => {
    const adapter = new BirdeyeAdapter(mockService());

    const result = await adapter.fetch({ value: 'solana' }, SOLANA);

    expect(result).toBeNull();
  });

  it('exposes name="birdeye"', () => {
    const adapter = new BirdeyeAdapter(mockService());

    expect(adapter.name).toBe('birdeye');
  });
});
