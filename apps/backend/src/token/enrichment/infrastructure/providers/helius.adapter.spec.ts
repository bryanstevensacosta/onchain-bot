import { HeliusAdapter } from 'token/enrichment/infrastructure/providers/helius.adapter';

const SOLANA = '82P9MvicWYr2R1yeYZLJrbPZB236uMeMBKJ6bLgpBAGS';

describe('HeliusAdapter', () => {
  const mockService = (accounts: unknown = null) => ({
    getTokenAccounts: jest.fn().mockResolvedValue(accounts),
  });

  it('returns null for non-Solana chains without making HTTP call', async () => {
    const service = mockService();
    const adapter = new HeliusAdapter(service);

    const result = await adapter.fetch(
      { value: 'ethereum' },
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    );

    expect(result).toBeNull();
    expect(service.getTokenAccounts).not.toHaveBeenCalled();
  });

  it('returns null when HELIUS_API_KEY is missing', async () => {
    const adapter = new HeliusAdapter(mockService());

    const result = await adapter.fetch({ value: 'solana' }, SOLANA);

    expect(result?.holders).toBeNull();
  });

  it('returns null when HELIUS_RPC_URL_MAINNET is missing', async () => {
    const adapter = new HeliusAdapter(mockService());

    const result = await adapter.fetch({ value: 'solana' }, SOLANA);

    expect(result?.holders).toBeNull();
  });

  it('exposes name="helius"', () => {
    const adapter = new HeliusAdapter(mockService());

    expect(adapter.name).toBe('helius');
  });

  it('returns total holder count from getTokenAccounts response', async () => {
    const service = mockService({
      total: 1234,
      distinctOwners: 1200,
      holders: 1234,
    });
    const adapter = new HeliusAdapter(service);

    const result = await adapter.fetch({ value: 'solana' }, SOLANA);

    expect(result).toEqual({
      pairs: [],
      priceUsd: null,
      liquidityUsd: null,
      volume24hUsd: null,
      marketCapUsd: null,
      fdvUsd: null,
      priceChange24h: null,
      holders: 1234,
      top10HolderPercent: null,
      symbol: null,
      name: null,
      imageUrls: [],
      lockedLiquidityPercent: null,
      burnedPercent: null,
    });
    expect(service.getTokenAccounts).toHaveBeenCalledWith(SOLANA);
  });

  it('falls back to distinct owner count when total lags behind indexed accounts', async () => {
    const service = mockService({ total: 1, distinctOwners: 5, holders: 5 });
    const adapter = new HeliusAdapter(service);

    const result = await adapter.fetch({ value: 'solana' }, SOLANA);

    expect(result?.holders).toBe(5);
  });

  it('counts distinct owners (deduplicates same owner with multiple token accounts)', async () => {
    const service = mockService({ total: 0, distinctOwners: 3, holders: 3 });
    const adapter = new HeliusAdapter(service);

    const result = await adapter.fetch({ value: 'solana' }, SOLANA);

    expect(result?.holders).toBe(3);
  });

  it('returns null when both total and token_accounts are missing', async () => {
    const service = mockService({ total: 0, distinctOwners: 0, holders: null });
    const adapter = new HeliusAdapter(service);

    const result = await adapter.fetch({ value: 'solana' }, SOLANA);

    expect(result?.holders).toBeNull();
  });

  it('returns null when result.total is missing', async () => {
    const service = mockService({ total: 0, distinctOwners: 0, holders: null });
    const adapter = new HeliusAdapter(service);

    const result = await adapter.fetch({ value: 'solana' }, SOLANA);

    expect(result?.holders).toBeNull();
  });

  it('returns null when RPC responds with error object', async () => {
    const adapter = new HeliusAdapter(mockService());

    const result = await adapter.fetch({ value: 'solana' }, SOLANA);

    expect(result?.holders).toBeNull();
  });

  it('returns null on 404 transport errors', async () => {
    const adapter = new HeliusAdapter(mockService());

    const result = await adapter.fetch({ value: 'solana' }, SOLANA);

    expect(result?.holders).toBeNull();
  });

  it('throws on non-404 transport errors', async () => {
    const service = {
      getTokenAccounts: jest.fn().mockRejectedValue(new Error('500')),
    };
    const adapter = new HeliusAdapter(service);

    await expect(
      adapter.fetch({ value: 'solana' }, SOLANA),
    ).rejects.toBeDefined();
  });
});
