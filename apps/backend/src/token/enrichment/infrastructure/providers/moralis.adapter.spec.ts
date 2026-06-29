import { MoralisAdapter } from 'token/enrichment/infrastructure/providers/moralis.adapter';

describe('MoralisAdapter', () => {
  const mockService = () => ({
    getTokenAnalytics: jest.fn().mockResolvedValue(null),
    getTokenHolders: jest.fn().mockResolvedValue(null),
    getTokenMetadata: jest.fn().mockResolvedValue(null),
  });

  it('exposes name="moralis"', () => {
    expect(new MoralisAdapter(mockService()).name).toBe('moralis');
  });

  it('returns null when MORALIS_API_KEY is missing', async () => {
    const adapter = new MoralisAdapter(mockService());
    expect(
      await adapter.fetch(
        { value: 'ethereum' },
        '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      ),
    ).toBeNull();
  });

  it('returns null for Solana (Moralis is EVM-only)', async () => {
    const adapter = new MoralisAdapter(mockService());
    expect(
      await adapter.fetch(
        { value: 'solana' },
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      ),
    ).toBeNull();
  });
});
