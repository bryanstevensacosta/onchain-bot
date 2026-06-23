/* eslint-disable @typescript-eslint/unbound-method */
import { SolanaRpcAdapter } from 'chain/explorer/infrastructure/providers/solana-rpc.adapter';
import axios from 'axios';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;
const postMock: jest.Mock = mockedAxios.post as unknown as jest.Mock;
const isAxiosErrorMock: jest.Mock =
  mockedAxios.isAxiosError as unknown as jest.Mock;

class FakeConfig {
  constructor(private readonly cfg: Record<string, unknown>) {}
  public get<T>(key: string): T {
    return this.cfg[key] as T;
  }
}

const SOLANA = '82P9MvicWYr2R1yeYZLJrbPZB236uMeMBKJ6bLgpBAGS';
const RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=helius-test-key';

const fullConfig = {
  app: {
    helius: { apiKey: 'helius-test-key', mainnet: { rpcUrl: RPC_URL } },
  },
};

describe('SolanaRpcAdapter', () => {
  beforeEach(() => {
    postMock.mockReset();
    isAxiosErrorMock.mockReset();
    isAxiosErrorMock.mockReturnValue(false);
  });

  it('returns null for non-Solana chains without making HTTP call', async () => {
    const adapter = new SolanaRpcAdapter(new FakeConfig(fullConfig));

    const result = await adapter.fetch(
      { value: 'ethereum' },
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    );

    expect(result).toBeNull();
    expect(postMock).not.toHaveBeenCalled();
  });

  it('returns null when HELIUS_RPC_URL_MAINNET is missing', async () => {
    const adapter = new SolanaRpcAdapter(
      new FakeConfig({
        app: { helius: { apiKey: 'helius-test-key', mainnet: { rpcUrl: '' } } },
      }),
    );

    const result = await adapter.fetch({ value: 'solana' }, SOLANA);

    expect(result).toBeNull();
  });

  it('exposes name="solana-rpc"', () => {
    const adapter = new SolanaRpcAdapter(new FakeConfig(fullConfig));

    expect(adapter.name).toBe('solana-rpc');
  });

  it('returns holders and top10HolderPercent from getTokenLargestAccounts response', async () => {
    const adapter = new SolanaRpcAdapter(new FakeConfig(fullConfig));
    postMock.mockResolvedValueOnce({
      data: {
        result: {
          value: [
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
          ],
        },
      },
    });

    const result = await adapter.fetch({ value: 'solana' }, SOLANA);

    expect(result?.holders).toBe(3);
    expect(result?.top10HolderPercent).toBe(100);
    expect(postMock).toHaveBeenCalledWith(
      RPC_URL,
      {
        jsonrpc: '2.0',
        id: 'solana-rpc-holders',
        method: 'getTokenLargestAccounts',
        params: [SOLANA],
      },
      expect.objectContaining({ timeout: 10000 }),
    );
  });

  it('calculates top10HolderPercent correctly when more than 10 accounts', async () => {
    const adapter = new SolanaRpcAdapter(new FakeConfig(fullConfig));
    const accounts = Array.from({ length: 20 }, (_, i) => ({
      address: `acc${i}`,
      amount: String(100 - i * 4),
      decimals: 6,
      uiAmount: null,
      uiAmountString: String(100 - i * 4),
    }));
    postMock.mockResolvedValueOnce({ data: { result: { value: accounts } } });

    const result = await adapter.fetch({ value: 'solana' }, SOLANA);

    expect(result?.holders).toBe(20);
    expect(result?.top10HolderPercent).toBeGreaterThan(0);
    expect(result?.top10HolderPercent).toBeLessThanOrEqual(100);
  });

  it('returns null when result.value is empty', async () => {
    const adapter = new SolanaRpcAdapter(new FakeConfig(fullConfig));
    postMock.mockResolvedValueOnce({ data: { result: { value: [] } } });

    const result = await adapter.fetch({ value: 'solana' }, SOLANA);

    expect(result).toBeNull();
  });

  it('returns null when RPC responds with error object', async () => {
    const adapter = new SolanaRpcAdapter(new FakeConfig(fullConfig));
    postMock.mockResolvedValueOnce({
      data: { error: { code: -32602, message: 'Invalid params' } },
    });

    const result = await adapter.fetch({ value: 'solana' }, SOLANA);

    expect(result).toBeNull();
  });

  it('returns null on 404 transport errors', async () => {
    const adapter = new SolanaRpcAdapter(new FakeConfig(fullConfig));
    isAxiosErrorMock.mockReturnValueOnce(true);
    const err = Object.assign(new Error('404'), {
      isAxiosError: true,
      response: { status: 404 },
    });
    postMock.mockRejectedValueOnce(err);

    const result = await adapter.fetch({ value: 'solana' }, SOLANA);

    expect(result).toBeNull();
  });

  it('throws on non-404 transport errors', async () => {
    const adapter = new SolanaRpcAdapter(new FakeConfig(fullConfig));
    isAxiosErrorMock.mockReturnValueOnce(true);
    const err = Object.assign(new Error('500'), {
      isAxiosError: true,
      response: { status: 500 },
    });
    postMock.mockRejectedValueOnce(err);

    await expect(
      adapter.fetch({ value: 'solana' }, SOLANA),
    ).rejects.toBeDefined();
  });
});
