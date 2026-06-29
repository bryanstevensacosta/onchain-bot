import { CoinGeckoAdapter } from 'token/enrichment/infrastructure/providers/coingecko.adapter';

describe('CoinGeckoAdapter', () => {
  const mockService = (info: unknown = null) => ({
    getTokenContractInfo: jest.fn().mockResolvedValue(info),
  });

  it('exposes name="coingecko"', () => {
    expect(new CoinGeckoAdapter(mockService()).name).toBe('coingecko');
  });

  it('returns null when COINGECKO_API_KEY is missing', async () => {
    const adapter = new CoinGeckoAdapter(mockService());
    expect(
      await adapter.fetch(
        { value: 'ethereum' },
        '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      ),
    ).toBeNull();
  });

  it('returns null for unsupported chains', async () => {
    const service = mockService();
    const adapter = new CoinGeckoAdapter(service);
    expect(
      await adapter.fetch({ value: 'polkadot' } as never, 'addr'),
    ).toBeNull();
    expect(service.getTokenContractInfo).not.toHaveBeenCalled();
  });
});
