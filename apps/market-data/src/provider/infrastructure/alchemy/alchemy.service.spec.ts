import axios from 'axios';
import { AlchemyService } from './alchemy.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function rpcResult(result: unknown) {
  return { data: { jsonrpc: '2.0', id: 'alc-1', result } };
}

describe('AlchemyService multi-chain transport (Lane T)', () => {
  const savedDrpcKey = process.env.DRPC_API_KEY;
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.DRPC_API_KEY;
  });
  afterAll(() => {
    if (savedDrpcKey !== undefined) process.env.DRPC_API_KEY = savedDrpcKey;
  });

  function service() {
    return new AlchemyService({ apiKey: 'test-key' });
  }

  it('keeps the legacy single-arg getCode on eth-mainnet (backend prober contract)', async () => {
    mockedAxios.post.mockResolvedValueOnce(rpcResult('0x60806040'));
    const res = await service().getCode('0xabc');
    expect(res).toBe('0x60806040');
    expect(mockedAxios.post.mock.calls[0][0]).toBe(
      'https://eth-mainnet.g.alchemy.com/v2/test-key',
    );
    expect(mockedAxios.post.mock.calls[0][1]).toMatchObject({
      method: 'eth_getCode',
      params: ['0xabc', 'latest'],
    });
  });

  it('routes getCode(chain, address) per chain', async () => {
    mockedAxios.post.mockResolvedValueOnce(rpcResult('0x'));
    const res = await service().getCode('base', '0xabc');
    expect(res).toBe('0x');
    expect(mockedAxios.post.mock.calls[0][0]).toBe(
      'https://base-mainnet.g.alchemy.com/v2/test-key',
    );
  });

  it('exposes getTransactionCount per chain (hex nonce)', async () => {
    mockedAxios.post.mockResolvedValueOnce(rpcResult('0x3'));
    const res = await service().getTransactionCount('arbitrum', '0xabc');
    expect(res).toBe('0x3');
    expect(mockedAxios.post.mock.calls[0][0]).toBe(
      'https://arb-mainnet.g.alchemy.com/v2/test-key',
    );
    expect(mockedAxios.post.mock.calls[0][1]).toMatchObject({
      method: 'eth_getTransactionCount',
      params: ['0xabc', 'latest'],
    });
  });

  it('exposes raw ethCall(chain, to, data) per chain', async () => {
    mockedAxios.post.mockResolvedValueOnce(rpcResult('0x01'));
    const res = await service().ethCall('bsc', '0xtarget', '0xdead');
    expect(res).toBe('0x01');
    expect(mockedAxios.post.mock.calls[0][0]).toBe(
      'https://bnb-mainnet.g.alchemy.com/v2/test-key',
    );
    expect(mockedAxios.post.mock.calls[0][1]).toMatchObject({
      method: 'eth_call',
      params: [{ to: '0xtarget', data: '0xdead' }, 'latest'],
    });
  });

  it('forwards AbortSignal so timeouts cancel in-flight HTTP', async () => {
    mockedAxios.post.mockResolvedValueOnce(rpcResult('0x01'));
    const controller = new AbortController();
    await service().ethCall('base', '0xt', '0xd', 'latest', {
      signal: controller.signal,
    });
    const config = mockedAxios.post.mock.calls[0][2] as {
      signal?: AbortSignal;
    };
    expect(config.signal).toBe(controller.signal);
  });

  it('routes robinhood via its verified row (todo 24)', async () => {
    mockedAxios.post.mockResolvedValueOnce(rpcResult('0x1234'));
    const res = await service().getCode('robinhood', '0xabc');
    expect(res).toBe('0x1234');
    expect(mockedAxios.post.mock.calls[0][0]).toBe(
      'https://robinhood-mainnet.g.alchemy.com/v2/test-key',
    );
  });

  it('resolves null with zero HTTP on chains no tier covers (solana)', async () => {
    const svc = service();
    await expect(svc.getCode('solana', '0xabc')).resolves.toBeNull();
    await expect(
      svc.getTransactionCount('solana', '0xabc'),
    ).resolves.toBeNull();
    await expect(svc.ethCall('solana', '0xt', '0xd')).resolves.toBeNull();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('falls to the public tier without an Alchemy key (keyless alchemy skips tier 1)', async () => {
    const keyless = new AlchemyService({ apiKey: '' });
    mockedAxios.post.mockResolvedValueOnce(rpcResult('0x'));
    await expect(keyless.getCode('base', '0xabc')).resolves.toBe('0x');
    expect(mockedAxios.post.mock.calls[0][0]).toBe('https://mainnet.base.org');
  });

  it('collapses JSON-RPC errors to null (fail-open)', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        jsonrpc: '2.0',
        id: 'alc-1',
        error: { code: -32000, message: 'boom' },
      },
    });
    await expect(service().getCode('base', '0xabc')).resolves.toBeNull();
  });

  describe('getAssetTransfers — creation-hash leg (fix 5)', () => {
    const TOKEN = '0xcEb8F67378C10107783683d8170BAfC962db7777';
    const TX = `0x${'ab'.repeat(32)}`;
    let savedChainstack: string | undefined;

    beforeEach(() => {
      jest.clearAllMocks();
      delete process.env.DRPC_API_KEY;
      savedChainstack = process.env.CHAINSTACK_API_KEY;
      delete process.env.CHAINSTACK_API_KEY;
    });

    afterEach(() => {
      if (savedChainstack === undefined) delete process.env.CHAINSTACK_API_KEY;
      else process.env.CHAINSTACK_API_KEY = savedChainstack;
    });

    it('pins the exact alchemy_getAssetTransfers params and returns the first hash', async () => {
      mockedAxios.post.mockResolvedValueOnce(
        rpcResult({ transfers: [{ hash: TX, category: 'erc20' }] }),
      );
      const res = await service().getAssetTransfers('bsc', TOKEN);
      expect(res).toBe(TX);
      expect(mockedAxios.post.mock.calls[0][0]).toBe(
        'https://bnb-mainnet.g.alchemy.com/v2/test-key',
      );
      expect(mockedAxios.post.mock.calls[0][1]).toMatchObject({
        method: 'alchemy_getAssetTransfers',
        params: [
          {
            fromBlock: '0x0',
            toBlock: 'latest',
            contractAddresses: [TOKEN],
            category: ['erc20'],
            order: 'asc',
            maxCount: '0x1',
            excludeZeroValue: false,
          },
        ],
      });
    });

    it('forwards the AbortSignal to the transport', async () => {
      mockedAxios.post.mockResolvedValueOnce(
        rpcResult({ transfers: [{ hash: TX }] }),
      );
      const controller = new AbortController();
      await service().getAssetTransfers('bsc', TOKEN, {
        signal: controller.signal,
      });
      const config = mockedAxios.post.mock.calls[0][2] as {
        signal?: AbortSignal;
      };
      expect(config.signal).toBe(controller.signal);
    });

    it('returns null for empty / absent transfers', async () => {
      mockedAxios.post
        .mockResolvedValueOnce(rpcResult({ transfers: [] }))
        .mockResolvedValueOnce(rpcResult({}))
        .mockResolvedValueOnce(rpcResult(null));
      const svc = service();
      await expect(svc.getAssetTransfers('bsc', TOKEN)).resolves.toBeNull();
      await expect(svc.getAssetTransfers('bsc', TOKEN)).resolves.toBeNull();
      await expect(svc.getAssetTransfers('bsc', TOKEN)).resolves.toBeNull();
    });

    it('rejects malformed / non-64-hex hashes (never returns a bad hash)', async () => {
      mockedAxios.post
        .mockResolvedValueOnce(rpcResult({ transfers: [{ hash: '0xabc' }] }))
        .mockResolvedValueOnce(
          rpcResult({ transfers: [{ hash: `0x${'zz'.repeat(32)}` }] }),
        )
        .mockResolvedValueOnce(rpcResult({ transfers: [{ hash: 42 }] }));
      const svc = service();
      await expect(svc.getAssetTransfers('bsc', TOKEN)).resolves.toBeNull();
      await expect(svc.getAssetTransfers('bsc', TOKEN)).resolves.toBeNull();
      await expect(svc.getAssetTransfers('bsc', TOKEN)).resolves.toBeNull();
    });

    it('collapses a JSON-RPC error envelope to null', async () => {
      mockedAxios.post.mockResolvedValue({
        data: {
          jsonrpc: '2.0',
          id: 'alc-1',
          error: { code: -32601, message: 'method not found' },
        },
      });
      await expect(
        service().getAssetTransfers('bsc', TOKEN),
      ).resolves.toBeNull();
    });

    it('collapses every throwing tier to null (never throws)', async () => {
      mockedAxios.post.mockRejectedValue(new Error('429 rate limited'));
      await expect(
        service().getAssetTransfers('bsc', TOKEN),
      ).resolves.toBeNull();
    });

    it('Enhanced alchemy_* methods never walk the dRPC/Chainstack/public tiers', async () => {
      // An Alchemy-namespaced method only exists on the Alchemy tier:
      // every other tier answers -32601, so walking them would burn one
      // request per tier for a guaranteed miss (observed in the fix-5
      // spec logs before this guard).
      process.env.DRPC_API_KEY = 'drpc-key';
      process.env.CHAINSTACK_API_KEY = 'cs-key';
      mockedAxios.post.mockResolvedValue({
        data: {
          jsonrpc: '2.0',
          id: 'alc-1',
          error: { code: -32601, message: 'method not found' },
        },
      });
      await expect(
        service().getAssetTransfers('bsc', TOKEN),
      ).resolves.toBeNull();
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      expect(mockedAxios.post.mock.calls[0][0]).toBe(
        'https://bnb-mainnet.g.alchemy.com/v2/test-key',
      );
    });

    it('absent ALCHEMY_API_KEY resolves null with ZERO HTTP (Enhanced API is keyed-only)', async () => {
      const keyless = new AlchemyService({ apiKey: '' });
      await expect(keyless.getAssetTransfers('bsc', TOKEN)).resolves.toBeNull();
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('unsupported chain resolves null with zero HTTP', async () => {
      await expect(
        service().getAssetTransfers('solana', TOKEN),
      ).resolves.toBeNull();
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
  });
});
