import { MobulaAdapter } from 'token/enrichment/infrastructure/providers/mobula.adapter';

describe('MobulaAdapter', () => {
  const mockService = (markets: unknown = null) => ({
    getTokenMarkets: jest.fn().mockResolvedValue(markets),
  });

  it('exposes name="mobula"', () => {
    expect(new MobulaAdapter(mockService()).name).toBe('mobula');
  });

  it('returns null when MOBULA_API_KEY is missing', async () => {
    const adapter = new MobulaAdapter(mockService());
    expect(
      await adapter.fetch(
        { value: 'ethereum' },
        '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      ),
    ).toBeNull();
  });

  it('returns null for unsupported chains without HTTP call', async () => {
    const service = mockService();
    const adapter = new MobulaAdapter(service);
    expect(
      await adapter.fetch({ value: 'polkadot' } as never, 'addr'),
    ).toBeNull();
    expect(service.getTokenMarkets).not.toHaveBeenCalled();
  });
});
