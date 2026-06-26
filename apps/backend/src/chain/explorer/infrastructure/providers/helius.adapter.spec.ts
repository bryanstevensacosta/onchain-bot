import { HeliusAdapter } from 'chain/explorer/infrastructure/providers/helius.adapter';
import axios from 'axios';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;
/* eslint-disable @typescript-eslint/unbound-method */
const postMock: jest.Mock = mockedAxios.post as unknown as jest.Mock;
const isAxiosErrorMock: jest.Mock =
  mockedAxios.isAxiosError as unknown as jest.Mock;
/* eslint-enable @typescript-eslint/unbound-method */

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

describe('HeliusAdapter', () => {
  beforeEach(() => {
    postMock.mockReset();
    isAxiosErrorMock.mockReset();
    isAxiosErrorMock.mockReturnValue(false);
  });

  it('returns null for non-Solana chains without making HTTP call', async () => {
    const adapter = new HeliusAdapter(new FakeConfig(fullConfig));

    const result = await adapter.fetch(
      { value: 'ethereum' },
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    );

    expect(result).toBeNull();
    expect(postMock).not.toHaveBeenCalled();
  });

  it('returns null when HELIUS_API_KEY is missing', async () => {
    const adapter = new HeliusAdapter(
      new FakeConfig({
        app: { helius: { apiKey: '', mainnet: { rpcUrl: RPC_URL } } },
      }),
    );

    const result = await adapter.fetch({ value: 'solana' }, SOLANA);

    expect(result).toBeNull();
  });

  it('returns null when HELIUS_RPC_URL_MAINNET is missing', async () => {
    const adapter = new HeliusAdapter(
      new FakeConfig({
        app: { helius: { apiKey: 'helius-test-key', mainnet: { rpcUrl: '' } } },
      }),
    );

    const result = await adapter.fetch({ value: 'solana' }, SOLANA);

    expect(result).toBeNull();
  });

  it('exposes name="helius"', () => {
    const adapter = new HeliusAdapter(new FakeConfig(fullConfig));

    expect(adapter.name).toBe('helius');
  });

  it('returns total holder count from getTokenAccounts response', async () => {
    const adapter = new HeliusAdapter(new FakeConfig(fullConfig));
    postMock.mockResolvedValueOnce({
      data: { result: { total: 1234, token_accounts: [] } },
    });

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
    expect(postMock).toHaveBeenCalledWith(
      RPC_URL,
      {
        jsonrpc: '2.0',
        id: 'helius-holders',
        method: 'getTokenAccounts',
        params: { mint: SOLANA, page: 1, limit: 1000 },
      },
      expect.objectContaining({ timeout: 5000 }),
    );
  });

  it('falls back to distinct owner count when total lags behind indexed accounts', async () => {
    const adapter = new HeliusAdapter(new FakeConfig(fullConfig));
    postMock.mockResolvedValueOnce({
      data: {
        result: {
          total: 1,
          token_accounts: [
            { owner: 'owner-a' },
            { owner: 'owner-b' },
            { owner: 'owner-c' },
            { owner: 'owner-d' },
            { owner: 'owner-e' },
            { owner: 'owner-a' },
          ],
        },
      },
    });

    const result = await adapter.fetch({ value: 'solana' }, SOLANA);

    expect(result?.holders).toBe(5);
  });

  it('counts distinct owners (deduplicates same owner with multiple token accounts)', async () => {
    const adapter = new HeliusAdapter(new FakeConfig(fullConfig));
    postMock.mockResolvedValueOnce({
      data: {
        result: {
          token_accounts: [
            { owner: 'owner-a' },
            { owner: 'owner-b' },
            { owner: 'owner-a' },
            { owner: 'owner-c' },
            { owner: 'owner-a' },
          ],
        },
      },
    });

    const result = await adapter.fetch({ value: 'solana' }, SOLANA);

    expect(result?.holders).toBe(3);
  });

  it('returns null when both total and token_accounts are missing', async () => {
    const adapter = new HeliusAdapter(new FakeConfig(fullConfig));
    postMock.mockResolvedValueOnce({ data: { result: {} } });

    const result = await adapter.fetch({ value: 'solana' }, SOLANA);

    expect(result?.holders).toBeNull();
  });

  it('returns null when result.total is missing', async () => {
    const adapter = new HeliusAdapter(new FakeConfig(fullConfig));
    postMock.mockResolvedValueOnce({ data: { result: {} } });

    const result = await adapter.fetch({ value: 'solana' }, SOLANA);

    expect(result?.holders).toBeNull();
  });

  it('returns null when RPC responds with error object', async () => {
    const adapter = new HeliusAdapter(new FakeConfig(fullConfig));
    postMock.mockResolvedValueOnce({
      data: { error: { code: -32602, message: 'Invalid params' } },
    });

    const result = await adapter.fetch({ value: 'solana' }, SOLANA);

    expect(result).toBeNull();
  });

  it('returns null on 404 transport errors', async () => {
    const adapter = new HeliusAdapter(new FakeConfig(fullConfig));
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
    const adapter = new HeliusAdapter(new FakeConfig(fullConfig));
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
