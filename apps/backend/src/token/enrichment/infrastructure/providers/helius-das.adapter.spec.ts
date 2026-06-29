import { HeliusDasAdapter } from 'token/enrichment/infrastructure/providers/helius-das.adapter';

describe('HeliusDasAdapter', () => {
  const mockService = (asset: unknown = null) => ({
    getAsset: jest.fn().mockResolvedValue(asset),
  });

  it('exposes name="helius-das"', () => {
    expect(new HeliusDasAdapter(mockService()).name).toBe('helius-das');
  });

  it('returns null for non-Solana chains', async () => {
    const service = mockService();
    const adapter = new HeliusDasAdapter(service);
    expect(
      await adapter.fetch(
        { value: 'ethereum' },
        '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      ),
    ).toBeNull();
    expect(service.getAsset).not.toHaveBeenCalled();
  });

  it('returns null when HELIUS_API_KEY is missing', async () => {
    const adapter = new HeliusDasAdapter(mockService());
    expect(
      await adapter.fetch(
        { value: 'solana' },
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      ),
    ).toBeNull();
  });
});
