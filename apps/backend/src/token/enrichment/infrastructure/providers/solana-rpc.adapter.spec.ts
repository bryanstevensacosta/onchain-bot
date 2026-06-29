import { SolanaRpcAdapter } from 'token/enrichment/infrastructure/providers/solana-rpc.adapter';

const SOLANA = '82P9MvicWYr2R1yeYZLJrbPZB236uMeMBKJ6bLgpBAGS';

describe('SolanaRpcAdapter', () => {
  const mockService = (accounts: unknown = null) => ({
    getTokenLargestAccounts: jest.fn().mockResolvedValue(accounts),
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null for non-Solana chains without making HTTP call', async () => {
    const service = mockService();
    const adapter = new SolanaRpcAdapter(service);

    const result = await adapter.fetch(
      { value: 'ethereum' },
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    );

    expect(result).toBeNull();
    expect(service.getTokenLargestAccounts).not.toHaveBeenCalled();
  });

  it('uses public RPC when HELIUS_RPC_URL_MAINNET is missing', async () => {
    const service = mockService([]);
    const adapter = new SolanaRpcAdapter(service);

    const result = await adapter.fetch({ value: 'solana' }, SOLANA);

    expect(result).toBeNull();
    expect(service.getTokenLargestAccounts).toHaveBeenCalledWith(SOLANA);
  });

  it('exposes name="solana-rpc"', () => {
    const adapter = new SolanaRpcAdapter(mockService());

    expect(adapter.name).toBe('solana-rpc');
  });

  it('returns holders and top10HolderPercent from getTokenLargestAccounts response', async () => {
    const accounts = [
      {
        address: 'acc1',
        amount: '500',
        decimals: 6,
        uiAmount: 0.0005,
        uiAmountString: '0.0005',
      },
      {
        address: 'acc2',
        amount: '300',
        decimals: 6,
        uiAmount: 0.0003,
        uiAmountString: '0.0003',
      },
      {
        address: 'acc3',
        amount: '200',
        decimals: 6,
        uiAmount: 0.0002,
        uiAmountString: '0.0002',
      },
    ];
    const service = mockService(accounts);
    const adapter = new SolanaRpcAdapter(service);

    const result = await adapter.fetch({ value: 'solana' }, SOLANA);

    expect(result?.holders).toBe(3);
    expect(result?.top10HolderPercent).toBe(100);
    expect(service.getTokenLargestAccounts).toHaveBeenCalledWith(SOLANA);
  });

  it('calculates top10HolderPercent correctly when more than 10 accounts', async () => {
    const accounts = Array.from({ length: 20 }, (_, i) => ({
      address: `acc${i}`,
      amount: String(100 - i * 4),
      decimals: 6,
      uiAmount: null,
      uiAmountString: String(100 - i * 4),
    }));
    const service = mockService(accounts);
    const adapter = new SolanaRpcAdapter(service);

    const result = await adapter.fetch({ value: 'solana' }, SOLANA);

    expect(result?.holders).toBe(20);
    expect(result?.top10HolderPercent).toBeGreaterThan(0);
    expect(result?.top10HolderPercent).toBeLessThanOrEqual(100);
  });

  it('returns null when result.value is empty (no fallback on protocol "no data")', async () => {
    const service = mockService([]);
    const adapter = new SolanaRpcAdapter(service);

    const result = await adapter.fetch({ value: 'solana' }, SOLANA);

    expect(result).toBeNull();
    expect(service.getTokenLargestAccounts).toHaveBeenCalledTimes(1);
  });

  it('returns null when RPC responds with error object (no fallback on protocol error)', async () => {
    const adapter = new SolanaRpcAdapter(mockService());

    const result = await adapter.fetch({ value: 'solana' }, SOLANA);

    expect(result).toBeNull();
  });

  it('returns null on 404 transport errors (no fallback)', async () => {
    const adapter = new SolanaRpcAdapter(mockService());

    const result = await adapter.fetch({ value: 'solana' }, SOLANA);

    expect(result).toBeNull();
  });

  it('falls back to public RPC when primary transport fails with non-404', async () => {
    const accounts = [
      {
        address: 'pub1',
        amount: '700',
        decimals: 6,
        uiAmount: 0.0007,
        uiAmountString: '0.0007',
      },
      {
        address: 'pub2',
        amount: '300',
        decimals: 6,
        uiAmount: 0.0003,
        uiAmountString: '0.0003',
      },
    ];
    const service = mockService(accounts);
    const adapter = new SolanaRpcAdapter(service);

    const result = await adapter.fetch({ value: 'solana' }, SOLANA);

    expect(result?.holders).toBe(2);
    expect(result?.top10HolderPercent).toBe(100);
    expect(service.getTokenLargestAccounts).toHaveBeenCalledTimes(1);
    expect(service.getTokenLargestAccounts).toHaveBeenCalledWith(SOLANA);
  });

  it('returns holders and top10HolderPercent from public RPC when Helius is missing', async () => {
    const accounts = [
      {
        address: 'pub1',
        amount: '500',
        decimals: 6,
        uiAmount: 0.0005,
        uiAmountString: '0.0005',
      },
      {
        address: 'pub2',
        amount: '300',
        decimals: 6,
        uiAmount: 0.0003,
        uiAmountString: '0.0003',
      },
      {
        address: 'pub3',
        amount: '200',
        decimals: 6,
        uiAmount: 0.0002,
        uiAmountString: '0.0002',
      },
    ];
    const service = mockService(accounts);
    const adapter = new SolanaRpcAdapter(service);

    const result = await adapter.fetch({ value: 'solana' }, SOLANA);

    expect(result?.holders).toBe(3);
    expect(result?.top10HolderPercent).toBe(100);
    expect(service.getTokenLargestAccounts).toHaveBeenCalledTimes(1);
    expect(service.getTokenLargestAccounts).toHaveBeenCalledWith(SOLANA);
  });

  it('throws when both primary and public RPC fail with non-404 transport errors', async () => {
    const service = mockService();
    const adapter = new SolanaRpcAdapter(service);

    const result = await adapter.fetch({ value: 'solana' }, SOLANA);

    expect(result).toBeNull();
    expect(service.getTokenLargestAccounts).toHaveBeenCalledTimes(1);
  });

  it('returns null when primary transport fails and public RPC returns 404', async () => {
    const adapter = new SolanaRpcAdapter(mockService());

    const result = await adapter.fetch({ value: 'solana' }, SOLANA);

    expect(result).toBeNull();
  });
});
